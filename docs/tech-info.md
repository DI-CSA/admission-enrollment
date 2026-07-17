# Infraestrutura TOTVS — servidores e mapeamento de superfícies

Servidor onde roda o sistema RM e IIS para servir páginas HTML do sistema TOTVS

Registro DNS do sistema de inscrições
inscricao.csa.com.br - 35.247.225.83

Lista de instâncias GCP

Nome da instancia - IP na rede VPC - IP externo
totvs-app01 - 10.10.0.15 - 35.247.234.33
totvs-db01 - 10.10.0.2 - 35.199.126.125
totvs-web01 - 10.10.0.24 - 35.247.225.83
ztotvs-db01v2 - 10.10.0.3 - 34.95.249.181
totvs-web02 - 10.10.0.48 - 35.199.106.238

Obs.: A instancia ztotvs-db01v2 é o servidor onde está a base HomologacaoRM

## Função de cada servidor

| Instância     | IP VPC (interno) | IP externo       | Função                                   |
| ------------- | ---------------- | ---------------- | ---------------------------------------- |
| `totvs-web01` | `10.10.0.24`     | `35.247.225.83`  | WEB — IIS / FrameHTML / WebAPI EduPS      |
| `totvs-app01` | `10.10.0.15`     | `35.247.234.33`  | Aplicação RM (RM.Host / DataServer REST)  |
| `totvs-db01`  | `10.10.0.2`      | `35.199.126.125` | Banco de dados MSSQL (CorporeRM — PRODUÇÃO) |
| `ztotvs-db01v2` | `10.10.0.3`    | `34.39.233.215`  | Banco de dados MSSQL (**HomologacaoRM** — TESTES) |

`inscricao.csa.com.br` aponta para `totvs-web01` (`35.247.225.83`).

## Mapeamento para as 3 superfícies de integração da plataforma

A plataforma Next.js (BFF) conversa com o RM por três caminhos, cada um em um servidor:

| Superfície          | Uso                                     | Servidor      | Endpoint (externo, dev)                 | Endpoint (VPC, produção)             |
| ------------------- | --------------------------------------- | ------------- | --------------------------------------- | ------------------------------------ |
| **WebAPI EduPS**    | ESCRITA/AUTH (login, inscrição, boleto) | `totvs-web01` | `http://35.247.225.83/FrameHTML/RM/API` | `http://10.10.0.24/FrameHTML/RM/API` |
| **SQL CorporeRM**   | LEITURA principal (read-only)           | `totvs-db01`  | `35.199.126.125:1433`                   | `10.10.0.2:1433`                     |
| **DataServer REST** | Leitura fallback (não confirmado)       | `totvs-app01` | `http://35.247.234.33:8051`             | `http://10.10.0.15:8051`             |

### Notas de deploy

- A VM Linux da plataforma fica na **mesma VPC** e deve usar os **IPs internos** (`10.10.0.x`)
  para falar com o RM — nunca os IPs externos. Os IPs externos servem apenas ao acesso direto
  em desenvolvimento.
- O IIS de `totvs-web01` é a **entrada única** (reverse proxy ARR): `/FrameHTML/*` → RM local;
  `/*` → `http://<IP-privado-linux>:3000`.
- Mantenha estes nomes/IPs em sincronia com as variáveis `RM_API_BASE`, `TOTVS_DB_SERVER` e
  `RM_HOST_BASE` da plataforma (`plataforma/.env.local`).

## Ambiente de homologação (desenvolvimento)

A base **`HomologacaoRM`** (em `ztotvs-db01v2`, externo `34.39.233.215:1433`, VPC `10.10.0.3`)
contém um **processo seletivo 2027 gravável**, próprio para testes ponta a ponta. Em
desenvolvimento, a plataforma deve usar homologação para **não escrever em produção**.

**Atenção — as duas superfícies precisam apontar para o MESMO banco:**

| Superfície | Caminho | Como apontar para homologação | Status |
| --- | --- | --- | --- |
| **SQL (leitura)** | `TOTVS_DB_*` | `TOTVS_DB_SERVER=34.39.233.215` + `TOTVS_DB_NAME=HomologacaoRM` | ✅ direto |
| **WebAPI EduPS (escrita/login)** | `RM_API_BASE` | Requer uma **WebAPI/IIS vinculada a `HomologacaoRM`** (a de `web01` aponta para produção) | ⚠️ a definir |

> Se a WebAPI de escrita continuar apontando para produção enquanto o SQL lê de homologação,
> o sistema fica **incoerente** (lê de uma base, autentica/escreve em outra) e ainda grava em
> produção. Antes de habilitar escrita em dev, confirmar o endpoint da WebAPI de homologação
> (site/porta no IIS ou alias do RM vinculado a `HomologacaoRM`).

### Guard de escrita (`INSCRICAO_SOMENTE_LEITURA`)

Enquanto a WebAPI de homologação não existe, um **guard de segurança** impede gravações por
engano. A rota de submissão `POST /api/inscricao` (única operação que **grava** no RM, via
`criarInscricao` → `Inscricao/NovaInscricao`) é bloqueada no servidor quando o guard está
ativo, respondendo **HTTP 503** `{ erro: "somente-leitura" }` antes de qualquer escrita. O
wizard trata esse 503 com uma mensagem de "modo de testes".

- **Falha segura:** se `INSCRICAO_SOMENTE_LEITURA` **não** estiver definida, assume-se `true`.
- Implementação: helper `somenteLeitura()` em `plataforma/app/api/inscricao/route.ts`.
- Mantenha `true` enquanto `RM_API_BASE` apontar para **produção**.

### Checklist — habilitar escrita em homologação

Quando a **WebAPI de homologação estiver no ar** (site IIS / alias do RM vinculado a
`HomologacaoRM`), ajustar o `.env.local` da plataforma:

1. **`RM_API_BASE`** → apontar para a WebAPI de homologação (login + escrita + boleto).
2. **`TOTVS_DB_SERVER=34.39.233.215`** e **`TOTVS_DB_NAME=HomologacaoRM`** (leitura SQL).
3. **`INSCRICAO_SOMENTE_LEITURA=false`** → libera o submit final.
4. Reiniciar o `dev`/serviço para recarregar as variáveis.

Com isso, o fluxo completo (reconhecimento → wizard → **submissão**) passa a rodar contra o
**PS 2027 gravável** em homologação, sem tocar a produção. Para voltar ao modo seguro, basta
restaurar `RM_API_BASE`/`TOTVS_DB_*` de produção e `INSCRICAO_SOMENTE_LEITURA=true`.

