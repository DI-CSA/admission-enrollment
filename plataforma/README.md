This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Ambientes em DEV (homologação × produção)

O `next dev` sempre lê `.env.local`. Para alternar os backends (WebAPI EduPS,
banco CorporeRM, guard de escrita e chave-mestra) entre **homologação** e
**produção** sem editar valores à mão, existem dois perfis git-ignored —
`.env.homolog` e `.env.prod` — e o `.env.local` é um **symlink** para o perfil
ativo (fonte única, sem risco de cópias divergentes).

| Comando | O que faz |
|---|---|
| `pnpm dev:homolog` | Aponta o perfil para homologação **e** sobe o `next dev` |
| `pnpm dev:prod` | Aponta o perfil para produção **e** sobe o `next dev` |
| `pnpm env:homolog` | Só troca o perfil para homologação (não sobe o servidor) |
| `pnpm env:prod` | Só troca o perfil para produção |
| `pnpm env:which` | Mostra qual perfil está ativo |

Diferenças embutidas nos perfis:

| Variável | `.env.homolog` | `.env.prod` |
|---|---|---|
| `RM_API_BASE` | `portal.csa.rio.br` | `portal.csa.com.br` |
| `TOTVS_DB_*` | `34.95.249.181` / HomologacaoWEB | `35.199.126.125` / CorporeRM |
| `INSCRICAO_SOMENTE_LEITURA` | `false` (escrita liberada) | `true` (modo seguro) |
| `AUTH_MASTER_KEY` | `masterkey` (backdoor de teste) | `masterkey` (só neste dev local) |

Observações:

- **Sempre reinicie o servidor ao trocar de perfil** — variáveis de ambiente
  são lidas na inicialização. Os comandos `dev:homolog`/`dev:prod` já fazem a
  troca e o restart num passo só.
- Variáveis `NEXT_PUBLIC_*` só mudam com **rebuild** (`pnpm build`), não basta
  restart.
- O perfil `prod` mantém, por segurança, a escrita no RM **bloqueada**
  (`INSCRICAO_SOMENTE_LEITURA=true`). A chave-mestra (`AUTH_MASTER_KEY`) fica
  **ativa apenas neste dev local** para testes — a **produção real** roda com
  `/etc/csa-portal/.env` na VM, que **não recebe arquivos `.env*` no deploy**
  (`scripts/deploy-app.sh` os exclui) e deve manter `AUTH_MASTER_KEY` vazia.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
