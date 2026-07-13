# Plano: Matrícula online de candidatos aprovados (fluxo dedicado)

Estender a plataforma Next.js com um **fluxo dedicado de matrícula** para candidatos aprovados/em chamada, espelhando a arquitetura da inscrição (BFF + módulos `lib/totvs` + wizard client) e **dirigido pelos `ParametrosMatriculaAreaOfertada` do RM**. Como a config de 2027 e o uso de contrato ainda são incógnitas, a **Fase 0** faz uma descoberta *read-only* que fixa quais passos entram; depois construímos o wizard completo (dados → documentos → planos → contrato/assinatura → confirmação → boleto), reaproveitando re-login por PS (`garantirSessaoNoIdps`), leituras SQL e os padrões de upload/boleto já validados.

## Estado atual (2026-07-03)

> **Matrícula está PAUSADA por decisão de priorização — o foco atual é o Processo Seletivo (situação da inscrição + documentos).** Este documento fica como referência para retomar depois.

- **Fase 0 — CONCLUÍDA** (descoberta read-only; ver abaixo).
- **Fases 1–2 — scaffolding no `main`.** O merge `feature/matricula-online → main` (commit `a4120ac`, `--no-ff`) trouxe para o `main`:
  - `lib/totvs/matricula.ts` (wrappers `rmFetch`: `obterResultadoAreaInteresse`, parâmetros, período, documentos de matrícula, etc.);
  - função aditiva de elegibilidade em `lib/totvs/queries.ts` (`listarCandidatosElegiveisMatricula`);
  - guard `matriculaSomenteLeitura()` (flag `MATRICULA_SOMENTE_LEITURA`, fail-safe ligado).
  - Verificação: o fonte de produção (VM `csa-portal01`) foi comparado byte-a-byte — o código de inscrição é idêntico ao de produção e a matrícula é um superset **aditivo**. `tsc --noEmit` limpo. `main` já foi **pushado** para `origin`.
- **Bloqueio de E2E:** em produção **todas as opções 2027 estão com `STATUS=0`** (ninguém em chamada) ⇒ E2E de matrícula só é possível em **homolog** (`HomologacaoRM`) ou após a secretaria abrir chamadas.
- **Pendente (quando retomar):** rotas `app/api/matricula/**`, página `/matricula`, `WizardMatricula.tsx` (Fases 2–5). Nada disso foi implementado ainda.

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

## Fases

1. **Fase 0 — Descoberta e verificação de config (read-only, bloqueia o resto). ✅ CONCLUÍDA.** Script `plataforma/scripts/totvs-matricula-descoberta.mjs` (read-only). Resultados:
   - **Elegibilidade:** `SPSOPCAOINSCRITO.STATUS` (smallint) ∈ `{5=EmChamada, 7=CompareceuChamada}` **e** `SPSAREAOFERTADA.DISPONIBILIZAMATRICULAPORTAL='T'`. Enum `EduPSStatusOpcaoInscrito` (FrameHTML `js/utils/edups-enums.constants.js`).
   - **`idAreaOfertada` (param da WebAPI) = `IDAREAINTERESSE`** — não há surrogate; área ofertada = `(CODCOLIGADA, IDPS, IDAREAINTERESSE)`.
   - **Ciclo 2027:** PS `210–220` (11 PS, 1/série), `IDAREAINTERESSE` `590–600`; todas com `STATUS='T'` e `DISPONIBILIZAMATRICULAPORTAL='T'`. **Hoje as 16 opções estão todas com `STATUS=0`** → ninguém elegível ainda ⇒ **E2E só em homolog** (`HomologacaoRM`) ou após resultados/chamada.
   - **Sem itinerário** (`MIN/MAXIMOITINERARIOS` nulos) → passo OFF para 2027.
   - **Config:** `SPSPARAMETROPS` tem `UTILIZAFICHAMEDICA`, `TEXTOCONFIRMACAOMATRICCENTRAL`, `TEXTOINSTRUCOESMATRICULA`; existem `SPLANOPGTO`, `SCONTRATO`, `FCONTRATOMODELO`, `SASSINATURACONTRATO`.
   - **Autoridade em runtime:** `GetParametrosMatriculaAreaOfertada` decide quais passos ligam (`CadastraContrato`, `UtilizaTokenAssinaturaContrato`, `PermiteEnvioDeDocumentos`, `ExibirItinerario`, `FichaMedica*`, `Atualiza*/Obriga*`) — o wizard é dirigido por essa resposta.

2. **Fase 1 — Camada de serviço + BFF** *(depende de 0)*. Novo `lib/totvs/matricula.ts` espelhando `lib/totvs/inscricao.ts` (wrappers tipados sobre `rmFetch`, desembrulho de envelope + detecção de 200-com-exception como em `criarInscricao`). SQL de elegibilidade em `lib/totvs/queries.ts` (todos os PS, como `listarDependentesDoResponsavel`, pois `ResultadoAreaInteresse` é PS-scoped). Rotas `app/api/matricula/*` (elegiveis, parametros, periodo, dados, documentos, planos, contrato, confirmar, boleto) usando `sessaoDaRequisicao` + `garantirSessaoNoIdps(sessao, idps)`; guard `MATRICULA_SOMENTE_LEITURA` no commit.

3. **Fase 2 — Rota dedicada** *(depende de 1)*. `app/matricula/page.tsx`: reusa login do responsável, lista dependentes elegíveis, cross-link opcional a partir de `components/PainelResponsavel.tsx`.

4. **Fase 3 — Wizard completo (client)** *(depende de 1, 2)*. Novo `components/WizardMatricula.tsx` espelhando `components/WizardInscricao.tsx`, com passos **condicionais** conforme a matriz da Fase 0: apresentação/período → dados do candidato → filiação 1/2 → resp. financeiro (valida débitos) → resp. acadêmico → itinerário → documentos (reusa base64/`%PDF`/5MB) → planos de pagamento → termo imagem/voz → ficha médica (iframe PGE via `postMessage`) → contrato (`GeraRelatorioContratoMatricula` + assinatura por token) → confirmação (`SalvaMatriculaViaCentralCandidato`) → resultado (`PRTMSGCONFIRMACAOMAT` + boleto + RA).

5. **Fase 4 — Boleto de matrícula + pós-matrícula** *(paralelo à Fase 3, parte final)*. Reusa o padrão de boleto (`Financeiro/InfoBoletoMatricula` + `BoletoMatricula` PDF) e exibe RA/status via `InfoAlunoEducacional`.

6. **Fase 5 — Validação + deploy** *(depende de 3, 4)*. `tsc --noEmit` + `eslint`; build prod local com placeholders; **E2E em homolog**; `MATRICULA_SOMENTE_LEITURA` ligado durante testes; deploy via `scripts/deploy-app.sh` **somente após confirmação** (portal LIVE).

## Relevant files

- `plataforma/lib/totvs/matricula.ts` *(novo)* — wrappers RM, espelhando `inscricao.ts` (`SalvaMatriculaViaCentralCandidato`, `GetParametrosMatriculaAreaOfertada`, `ResultadoAreaInteresse`, contrato, planos, boleto).
- `plataforma/lib/totvs/queries.ts` — SQL de elegibilidade (todos os PS).
- `plataforma/lib/totvs/session.ts` — reusar `garantirSessaoNoIdps` para escopar a sessão RM ao PS do dependente.
- `plataforma/lib/rm/client.ts` — `rmFetch` (`WEBAPI=TOTVSProcessoSeletivo`).
- `plataforma/app/api/matricula/**` *(novo)* — rotas BFF.
- `plataforma/app/matricula/page.tsx` *(novo)* — página dedicada.
- `plataforma/components/WizardMatricula.tsx` *(novo)* — espelha `WizardInscricao.tsx`.
- `plataforma/.env.example` — `MATRICULA_SOMENTE_LEITURA` e afins.

## Verification

1. Fase 0 produz a matriz de config (flags reais + elegibilidade + período) — critério de "pronto para construir".
2. `pnpm exec tsc --noEmit && pnpm exec eslint <arquivos>` em `plataforma/`.
3. Build prod local com envs placeholder (mesmo comando já usado no projeto).
4. E2E homolog: dependente elegível → wizard completo → `SalvaMatriculaViaCentralCandidato` retorna nº/`RA` → boleto de matrícula emitido.
5. Confirmar re-login cross-PS (`garantirSessaoNoIdps`) escopando a sessão ao PS do dependente antes de confirmar.

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

## Further Considerations

1. **Ficha médica flexível** (iframe PGE via `postMessage`, serviço externo) é o passo mais complexo. Recomendo **diferir** para uma iteração posterior salvo se a Fase 0 mostrar `FichaMedicaFlexivelHabilitada='T'` obrigatório. *Opção A: incluir já / B: diferir (recomendado) / C: decidir após Fase 0.*
2. **Testabilidade**: se o RM de produção ainda não tiver matrícula 2027 configurada, o E2E fica restrito a **homolog** até a config existir — o plano prevê isso, mas convém confirmar quem configura período/planos/contrato no RM.
3. **Login do fluxo dedicado**: reusar o login atual do responsável (`/matricula` compartilha sessão) evita duplicar autenticação. *Recomendo reusar; alternativa seria um login próprio.*
