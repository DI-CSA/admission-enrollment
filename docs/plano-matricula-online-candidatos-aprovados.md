# Plano: Matrícula online de candidatos aprovados (fluxo dedicado)

Estender a plataforma Next.js com um **fluxo dedicado de matrícula** para candidatos aprovados/em chamada, espelhando a arquitetura da inscrição (BFF + módulos `lib/totvs` + wizard client) e **dirigido pelos `ParametrosMatriculaAreaOfertada` do RM**. Como a config de 2027 e o uso de contrato ainda são incógnitas, a **Fase 0** faz uma descoberta *read-only* que fixa quais passos entram; depois construímos o wizard completo (dados → documentos → planos → contrato/assinatura → confirmação → boleto), reaproveitando re-login por PS (`garantirSessaoNoIdps`), leituras SQL e os padrões de upload/boleto já validados.

## Fases

1. **Fase 0 — Descoberta e verificação de config (read-only, bloqueia o resto).** Scripts de leitura contra prod/homolog para: (a) confirmar como a aprovação é gravada — `SPSOPCAOINSCRITO.STATUS` (valor = *EmChamada*/*CompareceuChamada*) + `SPSAREAOFERTADA.DISPONIBILIZAMATRICULAPORTAL`; (b) chamar `GetParametrosMatriculaAreaOfertada` das áreas 2027 e montar a **matriz de flags** (`CadastraContrato`, `UtilizaTokenAssinaturaContrato`, `PermiteEnvioDeDocumentos`, `ExibirItinerario`, `FichaMedica*`, `Atualiza*/Obriga*`); (c) checar `PeriodoMatricula` + planos/contrato/documentos exigidos configurados; (d) mapear `idAreaOfertada ↔ idAreaInteresse`. **Entrega: matriz que decide os passos.** Pode exigir config do RM antes do E2E em produção.

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

## Further Considerations

1. **Ficha médica flexível** (iframe PGE via `postMessage`, serviço externo) é o passo mais complexo. Recomendo **diferir** para uma iteração posterior salvo se a Fase 0 mostrar `FichaMedicaFlexivelHabilitada='T'` obrigatório. *Opção A: incluir já / B: diferir (recomendado) / C: decidir após Fase 0.*
2. **Testabilidade**: se o RM de produção ainda não tiver matrícula 2027 configurada, o E2E fica restrito a **homolog** até a config existir — o plano prevê isso, mas convém confirmar quem configura período/planos/contrato no RM.
3. **Login do fluxo dedicado**: reusar o login atual do responsável (`/matricula` compartilha sessão) evita duplicar autenticação. *Recomendo reusar; alternativa seria um login próprio.*
