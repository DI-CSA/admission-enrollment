# Autenticação via TOTVS RM (WebAPI EduPS) por CPF — guia técnico

> **Para quem vai reimplementar.** Este documento descreve, com precisão de arquivo/linha, como
> o Portal de Admissão (BFF Next.js em `plataforma/`) autentica responsáveis usando o **TOTVS RM
> / WebAPI EduPS (Portal do Processo Seletivo)** como **fonte de autenticação**, identificando o
> usuário pelo **CPF**. Cobre: reconhecimento por CPF, validação de senha, o **formato de hash
> (envelope Bcrypt do RM)**, sincronização de senha e **controle de sessão**.
>
> Todos os caminhos são relativos a `plataforma/`. A regra de ouro do projeto vale aqui:
> **leitura** pode ir por SQL direto; **escrita/login/redefinição de senha** vão SEMPRE pela
> WebAPI EduPS. A única exceção é a **gravação** de senha (§5/§6), feita por `UPDATE` direto
> porque o envelope Bcrypt é reproduzido fielmente (equivale a passar pela EduPS).

---

## 1. Modelo mental: dois tipos de usuário (ambos por CPF)

O CPF identifica o responsável, mas a senha pode viver em **dois cofres** distintos do RM:

- **NOVO** — só existe (ou vai existir) na base do **Processo Seletivo**, tabela `SPSUSUARIO`.
  A senha é própria do PS.
- **ANTIGO** — já tem conta no **Portal do Aluno**, tabela `GUSUARIO` com `CODUSUARIO = CPF`.
  A senha "mestra" é a do Portal do Aluno; a cada login o sistema **alinha** a senha do PS a
  ela (§4).

A classificação NOVO × ANTIGO é decidida pela **existência de conta em `GUSUARIO`**
(`app/api/auth/login/route.ts` via `validarSenhaPortalAlunoDB`).

Diagrama do login:

```text
CPF + senha + idps
   │
   ├─(a) chave-mestra ativa e senha == master? ── sim ─▶ sessão de teste (sem cookie RM)
   │
   ├─(b) GUSUARIO tem conta (ANTIGO)?
   │        ├─ envelope conf.? ── não ─▶ 401 (origem: aluno)
   │        └─ envelope conf.? ── sim ─▶ alinha senha do PS (UPDATE SPSUSUARIO)  ─┐
   │                                                                              │
   └─(c) loginResponsavel(cpf, senha, idps)  ◀──────────────────────────────────┘
            POST TOTVSProcessoSeletivo/v1/Login
            LOGADOSUCESSO? ── não ─▶ 401 (origem: aluno|ps)
            LOGADOSUCESSO? ── sim ─▶ captura Set-Cookie do RM ─▶ cria sessão BFF ─▶ cookie sid
```

---

## 2. Fontes de dados (SQL de leitura)

Definidas em `lib/totvs/queries.ts` (somente `SELECT`, parametrizado). CPF é sempre
normalizado a **11 dígitos** e o `WHERE` remove `.`, `-` e espaços da coluna.

- **`SPSUSUARIO`** — contas do PS. **Não há unicidade por CPF**: um mesmo CPF pode ter várias
  contas (uma por inscrição/PS). Colunas usadas: `CPF`, `SENHA`, `EMAIL`, `NOME`,
  `CODUSUARIOPS`, `CODUSUARIOLOGINRM`.
- **`GUSUARIO`** — contas do Portal do Aluno. `CODUSUARIO = CPF`, `SENHA`, `STATUS`.
- `SALUNORESPONSAVEL` + `PPESSOA` — vínculo aluno↔responsável; usado só na **inscrição**, não
  no login.

---

## 3. Reconhecimento por CPF (antes de pedir a senha)

### `reconhecerResponsavelPorCpf(cpf)` — `lib/totvs/queries.ts`
SQL direto em `SPSUSUARIO` (não usa a EduPS). Retorna:
- `existe` — há linha com esse CPF;
- `temSenhaCadastrada` — alguma conta do CPF tem `SENHA` não-vazia (`MAX(...) OVER ()`);
- `nome`, `emailMascarado` (`j***@dominio.com`), `email` (completo — **só server-side**),
  `dtNascimento`.

A linha representativa é escolhida de forma **determinística**: prefere conta **com senha** →
**com e-mail** → **vinculada ao RM** (`CODUSUARIOLOGINRM`) → `CODUSUARIOPS DESC`.

### `cpfTemContaPortalAluno(cpf)` / `obterUsuarioPortalAluno(cpf)`
`SELECT TOP 1 SENHA, STATUS FROM GUSUARIO WHERE CODUSUARIO = @cpf`. Retorna `null` se não há
linha ou se `SENHA` é vazia. **É o sinal de "ANTIGO".**

### Decisão "reconhecido × novo" — `app/api/auth/reconhecer/route.ts`
Roda as duas consultas em paralelo e responde ao cliente **apenas dados mascarados**:
`{ existe, temSenhaCadastrada, ehResponsavelDeAluno, nome, emailMascarado }`.
`ehResponsavelDeAluno` orienta o fluxo de senha na tela.

> **Duplicidade autoritativa é da EduPS, não do SQL.** O bloqueio "mesmo candidato no mesmo PS"
> é decidido pela EduPS no submit da inscrição (`GET Inscricao/ExisteUsuario` → campo
> `Bloqueia`). O SQL de duplicidade é só pré-aviso de UX. (Isso é reconhecimento de
> **candidato**, distinto do reconhecimento de **responsável no login**.)

---

## 4. Login / validação da senha

### 4.1 Endpoint EduPS — `lib/totvs/auth.ts` (`loginResponsavel`)
`POST {RM_API_BASE}/TOTVSProcessoSeletivo/v1/Login`. Corpo:

```jsonc
{
  "CodColigada": 1,              // env RM_COD_COLIGADA (default 1)
  "CodFilial": 1,               // env RM_COD_FILIAL (default 1)
  "IdPs": <idps>,               // o PS ao qual a sessão fica escopada
  "TipoIdentificacao": 0,       // enum: CPF=0, RG=1, Usuario=2, Email=3
  "Login": "<cpf 11 dígitos>",
  "Senha": "<base64(encodeURIComponent(senha))>",  // ver §5.2
  "GuidsReservaVaga": ""        // STRING vazia; enviar [] estoura NullReferenceException no RM
}
```

Resposta aninhada em `data`: `{ LOGADOSUCESSO, CODUSUARIOPS, NOME, TOKEN }`. **Sucesso** =
`data.data.LOGADOSUCESSO === true`. Em sucesso, `loginResponsavel` retorna
`{ logado, codUsuarioPS, rmCookie }`.

### 4.2 Captura do cookie do RM — `extrairCookie` (`auth.ts`)
Lê `res.headers.getSetCookie()`, pega a parte antes do `;` de cada cookie e junta com `"; "`,
formando um header `Cookie` reutilizável em chamadas autenticadas seguintes. **Nunca vai ao
browser** — fica só na sessão server-side (§7).

### 4.3 Validação do ANTIGO (Portal do Aluno) — `lib/totvs/senha-portal-aluno.ts`
Feita **localmente contra o banco** (`validarSenhaPortalAlunoDB`), sem depender de REST/OAuth
(evita o 404 do `connect/token` em homologação). Detecta o formato de `GUSUARIO.SENHA`:
- **`envelope`** (começa com `#P=` ou contém `#H=$2`) → validável com bcrypt (§5);
- **`legado`** (`^[A-Za-z]{8}$`, RM antigo sem salt) → `naoSuportado: true` (algoritmo ainda
  não reproduzido; fallback = pedir redefinição no Portal do Aluno, que migra para envelope);
- **`vazio` / `outro`** → não validável.

> Há uma implementação alternativa por OAuth2 (`lib/totvs/auth-aluno.ts`,
> `POST connect/token` grant `password`), **não usada no login atual** — o caminho por banco é
> preferido.

### 4.4 Orquestração — `app/api/auth/login/route.ts`
1. Rate-limit `login:{ip}` (8/min); valida `cpfValido`, senha e `idps > 0`.
2. **Chave-mestra** (§8): se ativa e a senha bate, cria sessão de teste e retorna.
3. `validarSenhaPortalAlunoDB(cpf, senha)` → `ehAntigo = portal.existe`.
   - `naoSuportado` (legado) → **409** `senha-formato-legado`;
   - `!ok` → **401** `credenciais-invalidas` (`origem: "aluno"`);
   - `ok` → `definirSenhaPSporCpf(cpf, senha)` **alinha a senha do PS** (§6).
4. `loginResponsavel({cpf, senha, idps})`; falha → **401** com `origem: ehAntigo ? "aluno" : "ps"`.
5. Sucesso → `criarSessao({ rmCookie, credenciais:{cpf,senha}, codUsuarioPS, idps })` e envia
   o cookie `sid` (httpOnly).
6. Dispara evento de funil RD **não-bloqueante** (o e-mail real é buscado por CPF só
   server-side). Erro no RM → **503** `indisponivel`.

---

## 5. Lógica de senha e hashes ⭐

**Há dois formatos distintos** — não confunda:

### 5.1 Armazenamento: **envelope Bcrypt do RM** — `lib/totvs/senha-envelope.ts`
Formato gravado em `SPSUSUARIO.SENHA` e `GUSUARIO.SENHA`:

```text
#P=False#PT=None#WF=10#HT=SHA256#HA=Bcrypt#V=4.0.2.0#H=<bcryptHash>
```

onde:

```text
bcryptHash = bcrypt( base64( sha256( utf8(senha) ) ), salt_cost10 )
```

Detalhes que **precisam** ser replicados fielmente:
- **Pré-hash obrigatório**: `base64(sha256(utf8(senha)))` — a senha **não** entra crua no
  bcrypt; entra o SHA-256 dela em base64 (`preHashSha256Base64`).
- **bcrypt** (lib `bcryptjs`), **custo 10**; salt novo/aleatório por chamada, embutido no hash
  (`$2a$10$<salt><hash>`).
- Força o prefixo **`$2a$`** (substitui `$2b$`) — para entrada ASCII/base64 é idêntico, mas é
  o formato observado no RM.
- A EduPS aplica **a mesma transformação** no login (`LoginNovoPortal`); por isso gravar o
  envelope direto na coluna torna a senha válida — **sem** `AlterarSenha` e **sem** a senha
  antiga.

**Validação** (`validarEnvelope` em `senha-portal-aluno.ts`): extrai o hash após `#H=` e faz
`bcrypt.compareSync( base64(sha256(senha)), hash )`.

### 5.2 Tráfego no login: **base64 simples** — `lib/rm/client.ts` (`encodeSenhaRm`)
```js
encodeSenhaRm(senha) = Buffer.from(encodeURIComponent(senha)).toString("base64")
```
**Não é criptografia** — é só `base64(encodeURIComponent(senha))`. É o valor do campo `Senha`
no `POST v1/Login`. O RM decodifica e aplica o envelope internamente.

| Contexto | Transformação |
| --- | --- |
| **Tráfego** (`v1/Login`, campo `Senha`) | `base64(encodeURIComponent(senha))` |
| **Armazenamento** (`SPSUSUARIO.SENHA` / `GUSUARIO.SENHA`) | `#...#H=bcrypt(base64(sha256(senha)), cost10, $2a$)` |

---

## 6. Sincronização / gravação de senha — `lib/totvs/senha-ps.ts`

Gravação por **`UPDATE` SQL direto** (o envelope é reproduzido fielmente — §5.1). CPF
normalizado a 11 dígitos, mesmo `WHERE` de remoção de `.`/`-`/espaço.

- **`definirSenhaPSporCpf(cpf, senha)`** — `UPDATE SPSUSUARIO SET SENHA=<envelope> WHERE …cpf`.
  Grava em **todas** as contas do CPF. Chamada no login ANTIGO para alinhar a senha do PS à do
  Portal do Aluno.
  > **Guard de segurança:** para ANTIGO, só grave **após** validar a senha no Portal do Aluno
  > (`portal.ok`). Gravar sem validar seria **account takeover**.
- **`lerEnvelopeSenhaPSporCpf` / `restaurarEnvelopeSenhaPSporCpf`** — leem/restauram o envelope
  verbatim. Necessário porque `NovaInscricao` **regrava** `SENHA` do responsável mesmo sem
  enviá-la, corrompendo o login; o fluxo logado captura antes e restaura depois.
- **`definirSenhaPortalAlunoPorCpf(cpf, senha)`** — `UPDATE GUSUARIO SET SENHA=<envelope> WHERE
  CODUSUARIO=@cpf`. Provisiona o mesmo envelope no Portal do Aluno após a matrícula (o RM cria
  `GUSUARIO` com senha própria, o que quebraria o acesso).
- **`reconciliarSenhaPosMatricula(cpf, senha)`** — deixa os dois cofres (PS + Portal do Aluno)
  com a mesma senha; idempotente.

**Recuperação oficial** (`recuperarSenha` em `auth.ts`) **passa pela EduPS**:
`POST TOTVSProcessoSeletivo/RecuperarSenha` com querystring `login, tipoIdentificacao,
codColigada, codFilial, dataNascimento (dd/MM/yyyy), idPS` — o RM envia o e-mail.

---

## 7. Controle de sessão — `lib/totvs/session.ts` / `sessao-req.ts`

### Store
`Map` **em memória**, singleton em `globalThis.__sessoesBFF` (sobrevive a hot-reload). **1
instância** — para escalar horizontalmente, trocar por Redis. O **cookie do RM nunca vai ao
browser**.

### Formato da sessão (`SessaoBFF`)
```ts
{
  rmCookie: string;      // cookie do RM p/ replay (""=sessão de chave-mestra)
  idps: number;          // o RM amarra a sessão a UM idps
  credenciais?: { cpf, senha, tipoIdentificacao? };  // só em memória; p/ re-login em outro idps
  codUsuarioPS: number | null;
  master?: boolean;      // sessão de teste (sem cookie RM)
  criadaEm: number;
  expiraEm: number;
}
```

### Cookie enviado ao browser
- Nome **`sid`** (`COOKIE_SESSAO`); valor = `randomUUID()` **opaco** (não carrega dado nenhum).
- Atributos canônicos (`opcoesCookieSessao`): `httpOnly:true`, `secure` em produção,
  `sameSite:"lax"`, `path:"/"`, `maxAge = 1800s`.

### Expiração deslizante + heartbeat
- TTL **30 min**. `obterSessao` remove se expirada e **desliza** `expiraEm = agora + TTL` a
  cada acesso.
- O `maxAge` do cookie é **absoluto** a partir da emissão → precisa ser **reemitido**
  periodicamente. O heartbeat é `GET /api/auth/me`, que desliza a sessão e **reemite** o cookie
  (senão o browser descarta o `sid` 30 min após o login mesmo com usuário ativo).

### Re-login por idps — `garantirSessaoNoIdps`
O RM mantém **uma** sessão ativa por usuário, e chamadas como `Comprovante` /
`InfoBoletoInscricao` dependem do PS da sessão. Ao pedir outro `idps`, o sistema
**re-autentica** com as `credenciais` guardadas e atualiza `rmCookie`/`idps`. Sem credenciais
(chave-mestra) ou idps igual/inválido, devolve o cookie atual.

### Tratamento de 401
O RM devolve **401** quando a sessão expira → **propague** para o fluxo de re-login (não
engula). Rotas autenticadas usam `export const dynamic = "force-dynamic"`.
`sessaoDaRequisicao(req)` lê `req.cookies.get("sid")` → `obterSessao`; `null` ⇒ a rota responde
**401**.

---

## 8. Chave-mestra (só teste) — `lib/totvs/master-key.ts`
Backdoor de teste. `masterKeyAtiva()` = env `AUTH_MASTER_KEY` não-vazia. `senhaEhMasterKey`
compara em **tempo constante** (`timingSafeEqual`). Quando ativa e a senha bate, o login
resolve `CODUSUARIOPS` por SQL e cria sessão com `rmCookie: ""` e `master: true`, **sem validar
a senha real e sem gravar nada**. Consequência: chamadas owner-scoped do RM (2ª via de boleto
etc.) **não funcionam** nesse modo (não há cookie do RM). Em produção deve ficar **desligada**.

---

## 9. Endpoints BFF (`app/api/auth/*`)

| Rota | Método | Payload | Guards / Rate-limit | Resposta |
| --- | --- | --- | --- | --- |
| `login` | POST | `{cpf, senha, idps}` | `login:{ip}` 8/min; valida cpf/senha/idps | `{ok, codUsuarioPS, master?}` + cookie `sid`; 400/401/409/429/503; `origem:"aluno"\|"ps"` no 401 |
| `reconhecer` | POST | `{cpf}` | `reconhecer:{ip}` 10/min; `cpfValido` antes do banco | `{ok, existe, temSenhaCadastrada, ehResponsavelDeAluno, nome, emailMascarado}` — **só mascarado** |
| `recuperar-senha` | POST | `{cpf, dataNascimento(dd/MM/yyyy), idps}` | `recuperar:{ip}` 5/min | Sempre `{ok, mensagem genérica}` — **não confirma existência** |
| `me` | GET | — (sessão) | `dynamic="force-dynamic"`; 401 sem sessão/`codUsuarioPS` | `{ok, email, nome, telefone}`; **heartbeat** reemite `sid` |
| `logout` | POST | — | idempotente | `{ok}`; `encerrarSessao`; cookie `sid` com `maxAge:0` |

**Transversais:** `ipDe(req)` = 1º IP de `x-forwarded-for` (fallback `x-real-ip`) — importante
atrás de LB/Nginx. Rate-limit `consumir(chave, limite, janelaMs)` (`lib/rate-limit.ts`, janela
deslizante em memória, 1 instância). **Anti-enumeração:** `reconhecer` devolve só mascarado;
`recuperar-senha` responde sempre genérico; a identidade em `me` vem **sempre da sessão**
(`codUsuarioPS`), o cliente não informa quem é. E-mail completo **nunca** vai ao cliente.

---

## 10. Roteiro de reimplementação (dependências mínimas)

1. **Cliente WebAPI** (`RM_API_BASE`): `rmFetch` (header `Cookie` opcional, `cache:no-store`) +
   `encodeSenhaRm = base64(encodeURIComponent(senha))`.
2. **Login EduPS** `POST TOTVSProcessoSeletivo/v1/Login`: corpo com `Senha` em base64 e
   `GuidsReservaVaga:""`; sucesso por `data.LOGADOSUCESSO`; **capturar `Set-Cookie`** e reusar.
3. **Reconhecimento por CPF**: SQL em `SPSUSUARIO` (existência/senha/nome/e-mail) e `GUSUARIO`
   (Portal do Aluno = ANTIGO), CPF normalizado a 11 dígitos.
4. **Senhas**: envelope
   `#P=False#PT=None#WF=10#HT=SHA256#HA=Bcrypt#V=4.0.2.0#H=bcrypt(base64(sha256(senha)),cost10,$2a$)`;
   validar com `bcrypt.compare(base64(sha256(senha)), hash)`; gravar por `UPDATE` direto **só
   após** o gate de segurança (validou a senha atual).
5. **Sessão BFF**: cookie `sid` httpOnly **opaco** (`randomUUID`) → store server-side com o
   cookie do RM + credenciais + idps; TTL 30 min **deslizante**; **heartbeat** que reemite o
   cookie; **401 do RM** ⇒ re-login.
6. **Chave-mestra** opcional, só para teste (bypass sem cookie do RM) — **desligada em prod**.

### Variáveis de ambiente relevantes
`RM_API_BASE`, `RM_COD_COLIGADA`, `RM_COD_FILIAL`, `AUTH_MASTER_KEY` (teste), credenciais do
SQL de leitura, `SESSION_SECRET`. **Segredos só no ambiente**, nunca no código.

---

## 11. Armadilhas conhecidas (não repita)

- `GuidsReservaVaga` deve ser **string** (`""`), não array — `[]` estoura
  `NullReferenceException` no `Split(';')` do RM.
- A senha **não** entra crua no bcrypt: é `base64(sha256(senha))` **primeiro**.
- Um CPF pode ter **várias** contas em `SPSUSUARIO` — trate a coleção, não assuma unicidade.
- `NovaInscricao` **regrava** a senha do responsável — se você criar inscrições em nome do
  usuário logado, **preserve e restaure** o envelope (§6).
- O `maxAge` do cookie é absoluto: **sem heartbeat**, a sessão "cai" em 30 min mesmo com o
  usuário ativo.
- Store em memória = **1 instância**. Múltiplas réplicas exigem Redis (senão a sessão "some"
  quando o LB troca de réplica).
