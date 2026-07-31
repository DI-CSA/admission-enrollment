# Matrícula on-line de candidatos aprovados — estado implementado

Este documento começou como plano de implementação e agora registra o fluxo efetivamente
entregue. A plataforma possui uma rota dedicada de matrícula para candidatos aprovados/em
chamada, dirigida pelos `ParametrosMatriculaAreaOfertada` do RM e integrada ao RD Station.

## Estado atual (revisado em 2026-07-16)

O fluxo de matrícula está **implementado**:

- página pública `/matricula`, com reconhecimento e login do responsável;
- listagem SQL dos candidatos elegíveis e revalidação autoritativa na WebAPI;
- wizard parametrizado pelas flags reais da área ofertada;
- edição de candidato, filiações e responsáveis acadêmico/financeiro;
- cadastro de responsável financeiro distinto e validação de débitos;
- reaproveitamento de documentos da inscrição e novos uploads;
- seleção de plano de pagamento;
- geração de contrato, token e assinatura quando exigidos pelo RM;
- efetivação por `SalvaMatriculaViaCentralCandidato`;
- consulta persistente da matrícula pelo RA;
- emissão, linha digitável e PDF/segunda via do boleto de reserva;
- conciliação das etapas de matrícula com RD Station Marketing e CRM.

O boleto de reserva usado no ciclo 2027 tem valor de **R$ 2.200**. O valor é definido
financeiramente no RM; no RD CRM ele é representado pelo produto “Reserva de matrícula”.

As gravações continuam protegidas por `MATRICULA_SOMENTE_LEITURA`, com comportamento
fail-safe quando a variável não está configurada.

## ✅ RESOLVIDO — documentos do candidato não copiavam para o aluno (2026-07-10)

**Sintoma:** ao concluir a matrícula pelo portal (nosso *e* o nativo da TOTVS), os documentos que o candidato enviou (foto, certidão, CPF, atestados, etc.) **não apareciam na documentação do aluno** no RM. Os arquivos ficavam só em `SPSARQUIVOSCANDIDATO` (módulo Processo Seletivo); o checklist acadêmico `SDOCALUNO` era criado com `STATUS=0 / QUANTIDADE=0 / DTENTREGA=null` e **nenhuma** linha física era gravada em `SARQUIVOS` (`DATASERVER='EduDocAlunoData'`).

**Não era o nosso código.** Provado por dois controles:
1. **Teste do portal NATIVO da TOTVS** (sem o nosso BFF, RA `1202700275`): produziu **exatamente o mesmo estado** (SDOCALUNO zerado, SARQUIVOS = 0). Nosso fluxo é byte-idêntico ao nativo (3 chamadas: `GET DocumentosExigidosMatricula` → `POST UploadDocumentosMatricula` → `POST SalvaMatriculaViaCentral`).
2. **Evidência no banco:** em 2026 (IDPERLET 11) a cópia sempre disparava; em 2027 (IDPERLET 86) nunca.

**Causa-raiz (parametrização, não código):** A cópia candidato→aluno na "matrícula via central do candidato" é **automática** ao final da matrícula (rotina compilada do `RM.EduPS.WebAPI`, conta de sistema `RM`), **mas só dispara se o documento estiver marcado como tipo _Ingresso_** na **Educacional → Parametrização por Curso** (`SDOCEXIGIDOS.TIPO = 'I'`).
- Referência oficial TOTVS (TDN): [15 - Aproveitamento de documentos enviados pelo candidato](https://tdn.totvs.com/display/LRM/15+-+Aproveitamento+de+documentos+enviados+pelo+candidato). Requisitos: (1) mesmo código de documento no PS (área ofertada) **e** no Educacional (Parametrização por Curso); (2) documento marcado como tipo **Ingresso**; (3) na área ofertada, aba Matrícula, "Permite o envio de documentos na matrícula" = `T`. Cumpridos, os documentos são salvos na documentação do aluno com status **"Entregue em validação"**.
- **Prova no banco** (`SDOCEXIGIDOS`, coluna `TIPO`: `'I'`=Ingresso, `'P'`=Periódico):
  - 2026 (IDPERLET 11): **157 docs `TIPO='I'`** → cópia sempre disparava.
  - 2027 (IDPERLET 86): **149 docs, TODOS `TIPO='P'`, zero `'I'`** → cópia nunca disparava. A habilitação 652 (turma do caso de teste) tinha os 14 docs de matrícula todos como Periódico.

**Correção aplicada (pela secretaria/admin no RM desktop, sem mexer no nosso código):** em **Educacional → Parametrização por Curso** do período 2027 (IDPERLET 86, habilitações 590–600 / 652 etc.), alterar o **tipo dos documentos de matrícula de _Periódico_ para _Ingresso_**, espelhando 2026 (pode-se usar o processo "Copiar matriz/parametrização por curso" a partir de 2026).

**Confirmação pós-correção (RA `1202700276`, 2026-07-10):** o usuário refez a matrícula e a cópia **disparou**:
- **8 arquivos** gravados em `SARQUIVOS` (`EduDocAlunoData`), `CHAVERM = '1;86;1202700276;<CODDOC>'`, criados pela conta `RM` no mesmo lote do `SALUNO`.
- Os `SDOCALUNO` correspondentes ficaram com **`STATUS=1` (Entregue em validação)**, `QUANTIDADE=1` e `DTENTREGA` carimbada — exatamente como o TDN descreve. (Os docs não enviados nesse teste seguiram `STATUS=0`, o que é esperado.)

**Conclusão:** o BFF e o `WizardMatricula` já estavam corretos; o problema era 100% parametrização do período 2027 no módulo Educacional. **Nada a alterar no nosso código.**

## Componentes implementados

1. **Descoberta e regras autoritativas.** Script `plataforma/scripts/totvs-matricula-descoberta.mjs` e respostas da WebAPI. Resultados:
   - **Elegibilidade:** `SPSOPCAOINSCRITO.STATUS` (smallint) ∈ `{5=EmChamada, 7=CompareceuChamada}` **e** `SPSAREAOFERTADA.DISPONIBILIZAMATRICULAPORTAL='T'`. Enum `EduPSStatusOpcaoInscrito` (FrameHTML `js/utils/edups-enums.constants.js`).
   - **`idAreaOfertada` (param da WebAPI) = `IDAREAINTERESSE`** — não há surrogate; área ofertada = `(CODCOLIGADA, IDPS, IDAREAINTERESSE)`.
   - **Ciclo 2027:** PS `210–220` (11 PS, 1/série), `IDAREAINTERESSE` `590–600`; todas com `STATUS='T'` e `DISPONIBILIZAMATRICULAPORTAL='T'`. Na descoberta inicial ainda não havia candidatos chamados; depois da abertura das chamadas o fluxo foi validado com matrículas reais.
   - **Sem itinerário** (`MIN/MAXIMOITINERARIOS` nulos) → passo OFF para 2027.
   - **Config:** `SPSPARAMETROPS` tem `UTILIZAFICHAMEDICA`, `TEXTOCONFIRMACAOMATRICCENTRAL`, `TEXTOINSTRUCOESMATRICULA`; existem `SPLANOPGTO`, `SCONTRATO`, `FCONTRATOMODELO`, `SASSINATURACONTRATO`.
   - **Autoridade em runtime:** `GetParametrosMatriculaAreaOfertada` decide quais passos ligam (`CadastraContrato`, `UtilizaTokenAssinaturaContrato`, `PermiteEnvioDeDocumentos`, `ExibirItinerario`, `FichaMedica*`, `Atualiza*/Obriga*`) — o wizard é dirigido por essa resposta.

2. **Camada de serviço + BFF.** `lib/totvs/matricula.ts`, SQL de elegibilidade e conciliação em `lib/totvs/queries.ts`, e rotas `app/api/matricula/*` usando `sessaoDaRequisicao` + `garantirSessaoNoIdps(sessao, idps)`.

3. **Rota dedicada.** `app/matricula/page.tsx` e `components/AcessoMatricula.tsx` reutilizam o login do responsável e carregam os dependentes elegíveis.

4. **Wizard completo.** `components/WizardMatricula.tsx`, com passos condicionais: apresentação/período → dados do candidato → filiação 1/2 → responsável financeiro → responsável acadêmico → documentos → planos → contrato/assinatura → confirmação → boleto e RA.

5. **Boleto de reserva + pós-matrícula.** `Financeiro/InfoBoletoMatricula`, `Financeiro/BoletoMatricula`, leitura da linha digitável e status via `InfoAlunoEducacional`.

6. **RD Station.** `lib/marketing/conciliar-matriculas.ts` avança o deal para `Cadastro de matrícula` quando a reserva é gerada e para `Pré-matrícula` quando paga. Ajusta o valor para **R$ 2.200**, grava campos de pai/mãe/responsável financeiro e usa datas reais do RM.

7. **Operação.** A efetivação dispara conciliação best-effort da inscrição recém-matriculada; `POST /api/jobs/conciliar-matriculas` roda por cron como rede de segurança, com `CRON_SECRET`, modo dry-run, idempotência e avanço somente para frente.

## Relevant files

- `plataforma/lib/totvs/matricula.ts` — wrappers RM (`SalvaMatriculaViaCentralCandidato`, `GetParametrosMatriculaAreaOfertada`, `ResultadoAreaInteresse`, contrato, planos, boleto).
- `plataforma/lib/totvs/queries.ts` — SQL de elegibilidade (todos os PS).
- `plataforma/lib/totvs/session.ts` — reusar `garantirSessaoNoIdps` para escopar a sessão RM ao PS do dependente.
- `plataforma/lib/rm/client.ts` — `rmFetch` (`WEBAPI=TOTVSProcessoSeletivo`).
- `plataforma/app/api/matricula/**` — rotas BFF.
- `plataforma/app/matricula/page.tsx` — página dedicada.
- `plataforma/components/AcessoMatricula.tsx` — autenticação e seleção do candidato.
- `plataforma/components/WizardMatricula.tsx` — wizard parametrizado.
- `plataforma/lib/marketing/conciliar-matriculas.ts` — integração das etapas com o RD.
- `plataforma/.env.example` — `MATRICULA_SOMENTE_LEITURA` e afins.

## Verificação e operação

1. Confirmar elegibilidade e período na área ofertada.
2. Executar o fluxo até `SalvaMatriculaViaCentralCandidato` e confirmar o RA.
3. Confirmar `InfoBoletoMatricula`, linha digitável e PDF do boleto de reserva.
4. Rodar a conciliação com `?dry=1` antes de qualquer diagnóstico com efeito.
5. Confirmar no RD o avanço para `Cadastro de matrícula` e, após a baixa da reserva, para `Pré-matrícula`.
6. Manter `MATRICULA_SOMENTE_LEITURA=true` em ambientes que não podem gravar.

## Decisões

- Wizard **completo**, dirigido por parâmetros, em **fluxo dedicado** (`/matricula`).
- Reaproveita auth/sessão, leituras SQL e padrões de upload/boleto/comprovante já validados.
- Escrita (commit da matrícula) protegida por flag; **deploy só após confirmação** (portal em produção).

## Documentos obrigatórios da matrícula (regra do CSA)

O RM **não** marca esses documentos como obrigatórios (`SPSDOCUMENTOEXIGIDO.OBRIGATORIO`
fica nulo). Em acordo com a secretaria, o CSA definiu a lista abaixo como **obrigatória** e
a obrigatoriedade é aplicada **pelo nosso sistema** (cliente + BFF), não pelo RM. Estes itens
também aparecem **no topo** do passo de documentos, exatamente nesta ordem:

| Ordem | Documento | `CODDOCUMENTO` |
|------:|-----------|:--------------:|
| 1 | Foto do candidato | 2 |
| 2 | CPF do candidato | 4 |
| 3 | Certidão de nascimento | 3 |
| 4 | Declaração de escolaridade | 16 |
| 5 | CPF do responsável financeiro | 29 |
| 6 | Identidade do responsável financeiro (RG ou CNH) | 30 |
| 7 | Comprovante de residência do responsável financeiro | 38 |

- **Fonte única da regra:** `plataforma/lib/matricula-documentos.ts`
  (`DOCS_OBRIGATORIOS_MATRICULA` / `CODS_DOCS_OBRIGATORIOS_MATRICULA`) — módulo client-safe
  importado tanto pela UI quanto pelo BFF.
- **Marcação de obrigatório:** `obterDocumentosExigidosMatricula` (`lib/totvs/matricula.ts`)
  faz `obrigatorio = flagRm(...) || obrigatorioCsa`, então o mesmo flag vale para a exibição
  no cliente e para a validação do upload.
- **Ordenação (topo da lista):** `PassoDocumentos` em `components/WizardMatricula.tsx`
  (`obrigatoriosOrdenados`) — os obrigatórios primeiro, depois reaproveitados da inscrição,
  depois os demais exigidos.
- **Bloqueio de envio:** cliente (`enviarDocumentos`) e servidor (`validar` → `faltando`)
  barram a conclusão enquanto faltar qualquer obrigatório. Certidão (3) e declaração de
  escolaridade (16) podem ser satisfeitos pelo documento **reaproveitado da inscrição**
  (3→3, 36→16); os demais exigem upload.
- **Escopo:** só a matrícula. Na inscrição (área 590/IDPS 210) o RM já exige apenas certidão (3)
  e declaração de escolaridade (36), ambos já `OBRIGATORIO='T'` no RM.
- **Degradação segura:** se algum código não estiver na lista de exigidos de uma área, ele é
  ignorado (não aparece nem bloqueia).

## Pontos de evolução

1. **Ficha médica flexível:** permanece condicionada à parametrização do RM e ao serviço PGE.
2. **Alta disponibilidade:** sessão e rate limit ainda são locais ao processo; múltiplas instâncias exigem store compartilhado.
3. **Observabilidade:** consolidar métricas dos jobs, falhas do RM e tempo entre matrícula, geração e pagamento da reserva.
4. **Etapa Matriculado (automatizada):** o job `conciliar-matriculas` move o deal para
   *Matriculado* quando a matrícula-por-período fica **ativa no RM** —
   `SMATRICPL.CODSTATUS` atinge um status com `SSTATUS.PLATIVO='S'` ("Matrícula Ativa").
   O contrato assinado **não** serve de sinal (a assinatura ocorre já no cadastro da
   reserva, então todos os cadastrados o teriam). O 3º ramo só ativa com
   `RD_CRM_DEAL_STAGE_MATRICULADO_ID` configurado — vazio, o job para em Pré-matrícula
   (comportamento anterior). Forward-only e idempotente, como os demais ramos.
