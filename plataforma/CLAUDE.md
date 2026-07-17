@AGENTS.md

# plataforma/ — BFF Next.js (convenções)

> Contexto geral, deploy e segurança estão no `CLAUDE.md` da raiz. Aqui ficam só as
> convenções de código deste app. **Next.js 16 tem breaking changes** — ver `AGENTS.md`.

## Camadas (`lib/`)

- `lib/rm/` — cliente genérico do RM. `client.ts` (`rmFetch`, `encodeSenhaRm`) fala com a
  **WebAPI EduPS**; `dataserver.ts` fala com os **DataServers REST** (JWT de staff). Todo
  arquivo aqui é `import "server-only"`.
- `lib/totvs/` — regras de negócio sobre o RM:
  - `queries.ts` + `db.ts` — **leituras SQL** (somente `SELECT`, parametrizadas). O
    cabeçalho de `queries.ts` documenta o schema real das tabelas `SPS*`/`PPESSOA`.
  - `inscricao.ts`, `matricula.ts` — orquestram **escrita** via WebAPI EduPS.
  - `session.ts`, `sessao-req.ts`, `auth.ts` — sessão por cookie do RM.
- `lib/marketing/` — `rdstation.ts` (funil), `rdcrm.ts` (deals), `meta-capi.ts` /
  `meta-client.ts` / `meta-event-id.ts` (Meta), `conciliar-*.ts` (conciliações idempotentes).
- `lib/processos.ts` — IDs dos PS 2027 e `ANO_PROCESSO`.

## Regra de ouro: leitura ≠ escrita

- **Leitura/reconhecimento** → SQL direto (`lib/totvs/queries.ts`), rápido e read-only.
- **Escrita, login, redefinição de senha, boleto** → **sempre** WebAPI EduPS. Nunca gravar
  via SQL nem via DataServer (burla reserva de vaga, geração de boleto e regras do PS).
- A duplicidade "mesmo candidato no mesmo PS" é decidida pela EduPS no submit
  (`/Inscricao/v2/BuscaUsuario` → `Bloqueia`), **não** por constraint de banco. Consultas
  SQL de duplicidade servem só para **avisar antes** (UX), nunca como decisão final.

## Rotas `app/api/*` (BFF)

- Rotas que gravam ou dependem de sessão usam `export const dynamic = "force-dynamic"`.
- Sessão via `sessaoDaRequisicao()` (`lib/totvs/sessao-req.ts`); cookie `COOKIE_SESSAO`.
- **Guards de escrita:** o helper `somenteLeitura()` bloqueia gravações (HTTP 503
  `{ erro: "somente-leitura" }`) quando `INSCRICAO_SOMENTE_LEITURA` /
  `MATRICULA_SOMENTE_LEITURA` estão ativos. **Falha segura:** ausente ⇒ `true`. Preserve
  esse guard em qualquer rota nova que escreva no RM.
- **Rate-limit** (`lib/rate-limit.ts`, `consumir()`) nas rotas que expõem existência de
  cadastro por CPF (proteção contra enumeração). Retorne **dados mascarados** antes do login.
- O RM devolve **401** quando a sessão expira → propague para o fluxo de re-login, não engula.

## Convenções de código

- Idioma **português** em nomes de símbolos, comentários e mensagens (o código já é assim).
- Import alias `@/` → raiz de `plataforma/`.
- Antes de escrever qualquer código Next, cheque o guia relevante em
  `node_modules/next/dist/docs/` (a versão diverge do seu conhecimento prévio).
- Rode `pnpm lint` após mudanças. Não gravar em produção — confira `pnpm env:which`.
