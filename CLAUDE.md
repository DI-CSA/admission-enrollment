# CLAUDE.md — Portal de Admissão CSA (hotsite-insc)

Guia para o Claude Code trabalhar neste repositório. Leia antes de editar.

## Visão geral

Plataforma de admissão do Colégio Santo Agostinho (Leblon) integrada ao **TOTVS RM /
Linha RM / Portal do Processo Seletivo (WebAPI EduPS)**. Cobre todo o percurso: hotsite,
inscrição, boleto da taxa, matrícula on-line dos aprovados, contrato/boleto de reserva, e
espelha os marcos no **RD Station** e no **Meta (Pixel + CAPI)**. O RM continua sendo o
sistema autoritativo; a plataforma é um **BFF (Backend-for-Frontend)** em Next.js.

## Dois mundos no mesmo repositório

Este repo contém dois regimes de edição **muito diferentes**. Identifique onde está o
arquivo antes de agir.

### 1. `plataforma/` — desenvolvimento ativo (Next.js)

O app moderno onde ocorre a maior parte do trabalho. Aqui vale o fluxo normal:
refatorar, rodar `pnpm lint`, etc.

- **Stack:** Next.js 16 (App Router, `output: standalone`), React 19, TypeScript,
  Tailwind 4, `mssql`, `bcryptjs`. Gerenciador: **pnpm** (`pnpm@10.6.5`).
- **Arquitetura** (ver [docs/arquitetura_nextjs_rm.md](docs/arquitetura_nextjs_rm.md)):
  - `app/` — rotas. `app/api/*` são o **BFF** (server-side).
  - `lib/rm/` — cliente RM genérico (WebAPI EduPS + DataServers REST/JWT).
  - `lib/totvs/` — inscrição, matrícula, sessão, auth e **leituras SQL** (`queries.ts`, `db.ts`).
  - `lib/marketing/` — RD Marketing, RD CRM, Meta (Pixel/CAPI) e conciliações.
  - `lib/processos.ts` — IDs dos processos seletivos 2027.
- **Regra de ouro da integração:** **leitura** pode ir por SQL direto (rápido);
  **escrita, login e redefinição de senha** vão SEMPRE pela WebAPI EduPS (fonte
  autoritativa das regras do PS). Nunca gravar via SQL/DataServer.
- **Sessão:** cookie do RM capturado server-side pelo BFF; o browser só recebe cookie
  próprio (httpOnly). RM devolve **401** quando a sessão expira → tratar re-login.

### 2. `FrameHTML/` e `TOTVS/` — cópia proprietária da TOTVS (AngularJS)

Cópia de um servidor Windows/IIS, editada no Mac e devolvida por `.zip`. **Gitignored.**
Regras rígidas de **preservação byte-a-byte** (encoding, CRLF, sem formatadores, menor
diff possível). Essas regras são **obrigatórias** e já estão documentadas em
[.github/copilot-instructions.md](.github/copilot-instructions.md) — **siga aquele arquivo
à risca** ao tocar qualquer coisa em `FrameHTML/`. Preferir sempre customização via
`js/templates/custom/`, `assets/css/custom/` etc., sem alterar originais.

## Comandos (rodar de dentro de `plataforma/`)

```bash
pnpm dev:homolog     # dev apontando p/ HomologacaoRM (escrita liberada, master-key ativa)
pnpm dev:prod        # dev apontando p/ produção (SOMENTE LEITURA)
pnpm env:which       # mostra qual perfil (.env.homolog | .env.prod) está ativo — CONFIRA ANTES
pnpm build           # next build (standalone)
pnpm lint            # eslint
```

`.env.local` é um **symlink** para `.env.homolog` ou `.env.prod` (trocado por
`pnpm env:homolog`/`env:prod`). Os scripts `.mjs` usam `--env-file=.env.local`, então o
perfil ativo decide contra qual banco eles rodam.

## Segurança — inegociável

- **Nunca escrever em produção.** Antes de qualquer submit/gravação, confirme com
  `pnpm env:which` que o perfil é homologação. Em dúvida, pergunte.
- **Guards de somente-leitura:** `INSCRICAO_SOMENTE_LEITURA` e `MATRICULA_SOMENTE_LEITURA`
  bloqueiam as gravações (HTTP 503). O padrão é *falha segura* (`true` se ausente). Só
  ficam `false` no go-live real, com WebAPI/SQL apontando para o ambiente correto.
- **Segredos** (senha do SQL, JWT de staff, `SESSION_SECRET`, `CRON_SECRET`,
  `AUTH_MASTER_KEY`) vivem apenas em `.env.local` / `/etc/csa-portal/.env` — **nunca** no
  código, em commits, ou impressos no chat.
- **PII/LGPD:** dados de candidatos (CPF, e-mail) trafegam pelo BFF. Retornar dados
  **mascarados** antes do login; a rota de reconhecimento por CPF precisa de rate-limit
  (proteção contra enumeração). `scripts/discovery-out/` e `.senha-backups/` são
  gitignored — nunca versionar.
- **Scripts perigosos:** `scripts/deploy-app.sh` (deploy real), `simular-login.mjs`
  (troca senha de usuário; exige `--confirmo-producao` em prod), `git push`. Confirme
  intenção antes de executar.

## Deploy e operação (GCP)

Produção: VM `csa-portal01` (sem IP público) atrás de GCP HTTPS Load Balancer + Nginx,
Node standalone via systemd (`csa-portal.service`). Detalhes e checklist de go-live em
[docs/runbook-deploy-portal.md](docs/runbook-deploy-portal.md). Re-deploy pelo Mac:
`bash scripts/deploy-app.sh` (não toca no `.env` da VM). Topologia de servidores/IPs do RM
em [docs/tech-info.md](docs/tech-info.md).

## Índice da documentação (`docs/`)

- [arquitetura_nextjs_rm.md](docs/arquitetura_nextjs_rm.md) — **fonte da verdade** da arquitetura (BFF, RM, módulos).
- [tech-info.md](docs/tech-info.md) — servidores/IPs TOTVS, superfícies de integração, ambiente de homologação.
- [runbook-deploy-portal.md](docs/runbook-deploy-portal.md) — como operar/deployar em produção.
- [plano_deploy_gcp.md](docs/plano_deploy_gcp.md) — estratégia de deploy (o "porquê").
- [integracao_rd_station.md](docs/integracao_rd_station.md) — funil, campos e conciliações RD.
- [resumo-estrategico-rd-station.md](docs/resumo-estrategico-rd-station.md) — visão executiva do RD.
- [integracao_meta.md](docs/integracao_meta.md) — Meta Pixel + CAPI + consentimento.
- [estrategia-marketing-google-rd-station.md](docs/estrategia-marketing-google-rd-station.md) — estratégia de captação/marketing/CRM (Google + RD, nível ouro).
- [plano-matricula-online-candidatos-aprovados.md](docs/plano-matricula-online-candidatos-aprovados.md) — plano do módulo de matrícula.
- [agendador-visitas.md](docs/agendador-visitas.md) — agendador de visitas (store Postgres próprio + funil de marketing).
- [guia_hotsite_csa_leblon_2027.md](docs/guia_hotsite_csa_leblon_2027.md) — guia visual/conteúdo do hotsite.
- [guia_customizacao_portal_processo_seletivo_totvs.md](docs/guia_customizacao_portal_processo_seletivo_totvs.md) — customização oficial TOTVS (FrameHTML).
- [testes-homolog.md](docs/testes-homolog.md) — contas/CPFs de teste ⚠️ contém dados sensíveis.

## Convenções

- Idioma: **português** em comentários, mensagens de commit, docs e nomes de domínio
  (o código já é assim). Siga o estilo do arquivo vizinho.
- Commits seguem Conventional Commits em pt-BR: `feat(escopo): …`, `docs(rd): …`.
- Commit/push apenas quando solicitado.
