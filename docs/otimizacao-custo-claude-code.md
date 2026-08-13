# Otimização de custo do Claude Code (Opus/Sonnet/Haiku via Vertex AI / GCP)

Guia de estratégias para reduzir o custo de uso do **Claude Code** como assistente de
desenvolvimento nos projetos **AGOS** e **hotsite-insc**, sem perda de qualidade nas análises
e respostas. O modelo é servido pelo **Vertex AI** no projeto GCP (não confundir com a IA
*interna* das aplicações — AGOS usa Vertex/Gemini nos seus próprios recursos; este documento é
sobre o **custo da ferramenta de codificação**).

> Diagnóstico inicial: todo o trabalho vinha rodando em **Opus 4.8** (o tier mais caro),
> sobre bases grandes (AGOS ≈ 113k linhas de TS/TSX, com vários arquivos de 1.500–2.800
> linhas). Não há servidores MCP carregados e as `CLAUDE.md` já são enxutas — então o ganho
> está em **escolha de modelo** e **disciplina de sessão**, não em limpar configuração.

---

## Como o custo se forma

A cada turno paga-se por:

- **Tokens de entrada** — todo o contexto reenviado: histórico da conversa + arquivos lidos +
  resultados de ferramentas + system prompt + `CLAUDE.md` + `MEMORY.md`.
- **Tokens de saída** — respostas + raciocínio ("thinking") + argumentos das chamadas de
  ferramenta. No Opus a saída custa ~5× a entrada.

Três fatos governam a conta:

1. **Opus ≈ 5× Sonnet ≈ 15× Haiku.** Trocar de modelo é a maior alavanca, isolada.
2. **O histórico é reenviado a cada turno.** Uma sessão longa que já resolveu tarefas
   continua pagando por elas em toda mensagem nova → `/clear` corta isso.
3. **Cache de prefixo:** o Claude Code cacheia o início estável do contexto (leitura de cache
   ≈ 10% do preço de entrada). Trocar de modelo, editar `CLAUDE.md`/`MEMORY` no meio da
   sessão, ou compactar **invalida** o cache.

---

## Nível 1 — Maior impacto (fazer sempre)

### 1.1 Sonnet como padrão, Opus sob demanda
A maior parte do trabalho (edições, buscas, boilerplate, docs, correções de lint/tsc) não
precisa de Opus.

- **Padrão: Sonnet** — fixado em `.claude/settings.json` (`"model": "claude-sonnet-5"`) nos
  dois repos.
- **Opus só quando o problema pede** (`/model opus`): arquitetura, depuração difícil,
  raciocínio sutil, revisão crítica. Ao terminar, **voltar** (`/model claude-sonnet-5`).
- **Haiku no trivial** (renome, ajuste de texto, edição pontual, buscas amplas via
  subagente) — `/model claude-haiku-4-5@20251001`. Também é o modelo de fundo
  (`ANTHROPIC_SMALL_FAST_MODEL`, já fixado em `.claude/settings.json`).
- Estimativa: migrando ~70% do trabalho de Opus→Sonnet, esse trecho da conta cai ~55–60%.
- **Fast mode não economiza** — é o mesmo Opus, só mais rápido.

> **Modelos realmente habilitados neste deployment (verificado):** Opus 4.8 ✅, **Sonnet 5**
> (`claude-sonnet-5`, contexto 1M) ✅, Sonnet 4 (`claude-sonnet-4@20250514`) ✅ e **Haiku 4.5**
> (`claude-haiku-4-5@20251001`) ✅. **Sonnet 4.5 NÃO está habilitado** — o alias `sonnet` aponta
> para essa versão e falha. Hierarquia prática atual: **Sonnet 5 (padrão) × Opus 4.8 (sob
> demanda) × Haiku 4.5 (trivial/fundo)**. Os aliases `opus`/`haiku` funcionam normalmente (a
> versão mais nova de cada um está habilitada); só o `sonnet` precisa do ID completo.

### 1.2 `/clear` entre tarefas independentes
Terminou e validou uma tarefa? `/clear` antes da próxima. Regra: **uma tarefa lógica = uma
sessão**. Evita reenviar histórico morto em cada turno seguinte.

### 1.3 Delegar buscas amplas a subagentes baratos
Ler arquivos de 1.800–2.800 linhas só para "achar onde está X" injeta o dump no contexto
principal — que é reenviado a cada turno. Em vez disso, use o agente **Explore** (ou `Agent`
em Haiku/Sonnet): ele queima o próprio contexto (barato) e devolve só a conclusão.

---

## Nível 2 — Higiene de contexto (reduz entrada)

### 2.1 Leituras cirúrgicas
Arquivos caros de tocar (evitar ler inteiros):

- `AGOS/src/components/academic/academic-dashboard-client.tsx` — 2.839 linhas
- `AGOS/src/lib/totvs/queries.ts` — 2.226
- `AGOS/src/app/[locale]/academic/aluno/[ra]/page.tsx` — 1.799
- (+ vários outros de 1.200–1.800)

Prefira `Grep` para localizar e `Read` com `offset`/`limit`. **Não reler para "conferir"** após
uma edição — o `Edit` falha se o texto não casar, então a releitura é gasto puro.

### 2.2 Quebrar os arquivos gigantes (ganho composto)
Dividir componentes de 1.500+ linhas é boa engenharia **e** corta custo: toda edição futura
carrega um arquivo menor. Candidato imediato: `academic-dashboard-client.tsx`.

### 2.3 Não editar `CLAUDE.md`/`MEMORY` no meio da sessão
Invalida o cache de prefixo do restante da sessão. Ajuste-os no **início** ou antes de um
`/clear`. Mantenha as `CLAUDE.md` enxutas (hoje 112 e ~130 linhas).

### 2.4 Ignore de arquivos (`.gitignore`, `permissions.deny`) — ganho modesto
O Claude Code **não pré-carrega nem indexa o repositório** no contexto: um arquivo só custa
tokens quando é **lido**, aparece em **resultado de Grep/Glob**, é **@-mencionado** ou entra no
histórico. Logo, "ignorar" arquivos ajuda só em duas frentes: (a) menos ruído em buscas e (b)
evitar leituras acidentais.

- **Grep/Glob já respeitam o `.gitignore`** (são ripgrep). `node_modules`, `.next`, `out`,
  `dist`, `discovery-out`, `.senha-backups`, `.env*` já estão fora das buscas — o maior ganho já
  está coberto.
- **`.claudeignore`**: mecanismo de suporte incerto/variável entre versões — não depender dele.
  O caminho confiável para "não leia isto" é **`permissions.deny` com `Read(...)`** no
  `.claude/settings.json` (já usado para segredos).
- **Peso morto rastreado** (fora do gitignore): melhor **remover** que ignorar — ex.: arquivos
  `*.tsx.bak` no AGOS são cópias mortas (o histórico é do Git). Para grandes que precisam ficar
  mas nunca devem ser lidos (lockfiles em `docs/`, fixtures), use `permissions.deny Read()`.

### 2.5 Painel: `/context` e `/cost`
`/context` mostra o que ocupa a janela (flagra arquivo grande preso). `/cost` mostra o custo
da sessão — rode ao fim das tarefas para calibrar hábitos.

---

## Nível 3 — Disciplina de trabalho (reduz retrabalho e turnos)

- **Planejar antes de edições grandes** — retrabalho custa dobrado.
- **Menos turnos:** agrupar chamadas independentes de ferramenta num único turno.
- **Saída concisa** e "thinking" proporcional ao problema (saída no Opus é o token mais caro).
- **Aproveitar o allowlist** de `.claude/settings.json` (já cobre `lint`, `tsc`, `git diff/log`
  etc.) para evitar turnos de confirmação; manter os perigosos em `ask`/`deny`.

---

## Nível 4 — Medição e governança

- **Billing por modelo no GCP:** observar o consumo Vertex separando Opus × Sonnet × Haiku —
  é como se comprova a economia.
- **Meta por sessão** com `/cost`; estouro → provável sessão longa demais (falta `/clear`) ou
  Opus onde cabia Sonnet.
- **Revisão semanal** das 2–3 sessões mais caras, buscando o padrão (arquivo gigante relido?
  Opus no trivial? histórico não limpo?).

---

## Configuração do modelo padrão no Claude Code + Vertex

**Sim, é possível** fixar Sonnet como padrão e subir para Opus só com `/model` — e funciona
com a integração Vertex.

### Definir o padrão (Sonnet 5)

> ⚠️ **Achado importante deste deployment:** os aliases do Claude Code apontam para a versão
> mais nova conhecida pela CLI (ex.: `sonnet` → **Sonnet 4.5** `claude-sonnet-4-5@20250929`) —
> e essa versão **não está habilitada** aqui, então `/model sonnet` falha com *"model ... is not
> available on your vertex deployment"*. O que está habilitado e é o melhor Sonnet disponível é o
> **Sonnet 5** (`claude-sonnet-5`, contexto 1M). Por isso fixe o **ID completo**, não o alias.

Três formas (usamos a 1ª):

1. **`.claude/settings.json`** → `"model": "claude-sonnet-5"` (nível de projeto; commitado). Já
   aplicado nos dois repos. Vale também em `~/.claude/settings.json` para o padrão global.
2. Variável de ambiente **`ANTHROPIC_MODEL="claude-sonnet-5"`**.
3. Em sessão: `/model claude-sonnet-5`.

### Subir para Opus sob demanda
- `/model opus` troca **na sessão corrente**; ao voltar com `/model claude-sonnet-5` (ou iniciar
  nova sessão, que relê o `settings.json`) retorna ao padrão. Ou seja, o fluxo desejado —
  "Sonnet por padrão, Opus só quando eu pedir" — funciona.

### Compatibilidade com o Vertex (pontos de atenção)
- Sob `CLAUDE_CODE_USE_VERTEX=1`, os aliases `sonnet`/`opus`/`haiku` só resolvem se **aquela
  versão exata** estiver **habilitada no Model Garden** do projeto. O alias aponta sempre para a
  versão mais nova (ex.: `sonnet`→4.5); se só a anterior está habilitada, **use o ID completo**.
  Hoje só `sonnet` está nessa situação — `opus` e `haiku` resolvem normalmente.
- **Região:** modelos podem viver em regiões diferentes. `CLOUD_ML_REGION` define a padrão; se
  os modelos não estiverem todos na mesma, use overrides por modelo (`VERTEX_REGION_CLAUDE_*`).
- **Modelo pequeno/rápido** (tarefas de fundo: resumos, geração de título, subagentes
  triviais): controlado por **`ANTHROPIC_SMALL_FAST_MODEL`** — já fixado em
  `.claude/settings.json` (`env.ANTHROPIC_SMALL_FAST_MODEL = "claude-haiku-4-5@20251001"`) nos
  dois repos.

### Modelos disponíveis vs. aliases (referência rápida)
| Alias Claude Code | ID Vertex | Neste deployment |
|---|---|---|
| — (ID completo) | `claude-sonnet-5` (Sonnet 5, contexto 1M) | ✅ **habilitado — padrão atual** |
| — (ID completo) | `claude-sonnet-4@20250514` (Sonnet 4) | ✅ habilitado |
| `sonnet` | `claude-sonnet-4-5@20250929` (Sonnet 4.5) | ❌ não habilitado |
| `opus` | `claude-opus-4-*` (Opus 4.8) | ✅ em uso |
| `haiku` | `claude-haiku-4-5@20251001` (Haiku 4.5) | ✅ habilitado — trivial/fundo |

---

## Resumo priorizado

| # | Ação | Esforço | Impacto |
|---|------|---------|---------|
| 1 | Padrão **Sonnet**, Opus sob demanda, Haiku no trivial | trivial | 🔥🔥🔥 |
| 2 | `/clear` entre tarefas | trivial | 🔥🔥🔥 |
| 3 | Buscas amplas via subagente barato (Explore/Haiku) | baixo | 🔥🔥 |
| 4 | Leituras cirúrgicas; não reler p/ conferir | baixo | 🔥🔥 |
| 5 | Quebrar arquivos de 1.500+ linhas | médio | 🔥🔥 (composto) |
| 6 | Não editar `CLAUDE.md`/`MEMORY` no meio da sessão | trivial | 🔥 |
| 7 | `ANTHROPIC_SMALL_FAST_MODEL` = Haiku 4.5 (já ativo) | trivial | 🔥 |
| 8 | `/cost` + billing por modelo | baixo | 🔥 (governança) |

O maior retorno vem de **1 e 2**: sozinhos tendem a derrubar a conta em torno de metade, sem
perda de qualidade — deixam de pagar preço de Opus por trabalho que Sonnet faz igual e param
de reenviar histórico morto.
