# Atendimento WhatsApp — Chatwoot + Flowise (padrão ouro para admissões escolares + CRM)

Guia de referência do **canal de Inscrições e Admissões 2027** via WhatsApp: arquitetura,
o que configurar para extrair o **máximo benefício** (alertas de conversas aguardando,
agilidade e qualidade do atendimento) e como usar Chatwoot + Flowise como **padrão ouro**
de atendimento escolar e CRM.

> Versões em produção: **Chatwoot v4.16.2-CE** (Community Edition) e **Flowise 3.1.3**.
> Ambiente: VM `atendimento-prod` (GCP, `/opt/atendimento`, Docker Compose). Detalhes de
> deploy/segredos ficam fora deste doc. Ver também
> [integracao_rd_station.md](integracao_rd_station.md), [integracao_meta.md](integracao_meta.md)
> e [agendador-visitas.md](agendador-visitas.md).

---

## 1. Visão e princípio de camadas

O canal é **exclusivo do Processo Seletivo 2027** (inscrições/admissões). Outros assuntos são
direcionados à Secretaria (`secretaria@csa.com.br`). A regra de ouro é **cada responsabilidade
na sua camada** — não duplicar lógica:

| Camada | Papel | Exemplos |
|--------|-------|----------|
| **Meta WhatsApp Cloud API** | transporte + regras da plataforma | janela de 24h, templates (HSM) |
| **Flowise** (IA) | 1ª resposta imediata, triagem, FAQ, pré-qualificação, handoff | Agentflow V2 |
| **adapter** (custom) | ponte Chatwoot↔Flowise, roteamento p/ times | — |
| **Chatwoot** (helpdesk/CRM) | atendimento humano, contatos, times, relatórios | inbox, canned, macros |
| **Reconciliador de timeout** (custom) | aviso de espera (supre o SLA, que é pago) | container próprio |
| **RD Station** | CRM de marketing / nutrição | ver doc do RD |

Fluxo: `WhatsApp → Chatwoot → adapter → Flowise → resposta`. A resposta imediata é do Flowise;
o atendimento humano e o histórico de relacionamento vivem no Chatwoot.

---

## 2. Community Edition × Enterprise — o que temos de graça e como suprimos o pago

Para **não depender de recurso pago**, mapeamos cada função Enterprise a uma alternativa CE:

| Recurso desejado | Chatwoot | Nossa solução no CE |
|------------------|----------|---------------------|
| **SLA / aviso de espera** | Enterprise ❌ | **Reconciliador de timeout** (container próprio) + automações + visão "Não atribuídas" |
| **IA (sugestão de resposta, resumo, assistente)** | Captain AI — Enterprise ❌ | **Flowise** (Agentflow V2 + base de conhecimento) |
| **Papéis/permissões (RBAC)** | Enterprise ❌ | Só papéis nativos **Administrator/Agent** |
| **Capacidade por agente (limite de carga)** | Enterprise ❌ | **Auto-assignment round-robin** simples (sem limite de carga) |
| **CSAT review notes / atributos obrigatórios / SSO / voz / white-label** | Enterprise ❌ | Não usados (ou supridos por processo) |

**Grátis no CE (usar à vontade):** automações, macros, respostas prontas (canned responses),
horário de atendimento, times, labels, atribuição automática, notas privadas, @menções,
CSAT (base), relatórios, base de conhecimento (Help Center), campanhas, agent bots,
atributos personalizados, integração com Slack.

---

## 3. Chatwoot — configuração para máximo benefício (tudo CE)

### 3.1 Caixa de entrada e horário
- **Inbox WhatsApp** (conta `account_id=2`) dedicada a Admissões.
- **Business Hours:** seg–sex 08:00–17:00, timezone `America/Sao_Paulo`. Serve para
  visibilidade da disponibilidade e relatórios. **Deixe o "unavailable message" vazio** — a
  mensagem fora do horário já é dada pelo Flowise (evita mensagem duplicada). Ver §4.1.

### 3.2 Times e roteamento
- **Teams:** time em uso é **`admissões-crm`**. Se houver segmentação (ex.: por segmento
  Infantil/Fundamental/Médio), criar times e deixar o **Flowise rotear** por intenção (§4.2).
- **Atribuição atual (decisão da direção):** conversas atribuídas **exclusivamente** à atendente
  **Renata Azevedo** (`renata.azevedo@csa.com.br`), integrante de `admissões-crm`. Implementação:
  o **auto-assignment (round-robin)** distribui entre os **membros da inbox**, e a inbox "WhatsApp
  CSA" tem **apenas a Renata** no pool — logo, toda conversa cai nela. Para voltar ao rodízio,
  basta **adicionar outros agentes como membros da inbox**. (Limite de carga por agente é
  Enterprise; no CE é rodízio simples.)
- **Assignment por regra:** usar **Automations** para atribuir ao time/agente certo conforme label/
  conteúdo/inbox.

### 3.3 Alertas de conversas aguardando atendimento (o pedido central)
No CE não há SLA; montamos a cobertura com **4 mecanismos complementares**:

1. **Reconciliador de timeout (nosso):** avisa o **cliente** após 5 min sem resposta humana,
   dentro do horário, uma única vez (idempotente por label `timeout-avisado`), respeitando a
   janela de 24h da Meta. É a rede de segurança voltada ao cliente. Ver §5.
2. **Automations (aviso à equipe):** regra em *Conversation Created* / *Conversation Updated*
   → **@mencionar** o time ou **enviar notificação**/aplicar label `novo` para dar visibilidade.
3. **Visões e filtros:** usar a aba **"Não atribuídas" (Unassigned)** e **Custom Views**
   salvas (ex.: "Abertas sem resposta") como painel operacional dos agentes.
4. **Integração Slack (CE):** conectar um canal do Slack para **notificar novas conversas** —
   ótimo para a equipe ver chegada em tempo real sem ficar com o Chatwoot aberto.
   (Notificações push/e-mail/desktop por agente também no CE — ver §3.3.1.)

#### 3.3.1 Notificações por agente (aviso de chegada — disponível hoje)
O "aviso de chegada" imediato **já é possível no CE** via notificações por agente (e-mail + push
do navegador + desktop). É a forma mais simples e sem custo de garantir que a atendente perceba a
conversa nova em tempo real, sem depender de Slack.

- **SMTP já configurado no servidor:** `MAILER_SENDER_EMAIL`, `SMTP_ADDRESS`, `SMTP_PORT`,
  `SMTP_USERNAME`, `SMTP_AUTHENTICATION` estão definidos no ambiente do Chatwoot → os e-mails de
  notificação são entregues assim que o agente habilita as flags.
- **É preferência por usuário (auto-serviço):** cada agente liga no seu próprio perfil em
  **Profile settings → Notifications**. Flags recomendadas (e-mail **e** push):
  `conversation_creation` ("Uma nova conversa é criada"), `conversation_assignment` ("Uma conversa
  é atribuída a mim") e `assigned_conversation_new_message` ("Nova mensagem em conversa atribuída a
  mim"). Opcionais: `participating_conversation_new_message`, `conversation_mention`.
- **Modelo de dados:** `NotificationSetting` é **por usuário + por conta** (`user_id` + `account_id`);
  os flags ficam em `selected_email_flags` / `selected_push_flags` (arrays de símbolos).
- **Caveat de API:** a API REST de notification settings só altera as do **dono do token**. Para
  ligar em nome de outro agente (ex.: pré-configurar a Renata) é preciso `rails runner` no servidor
  **ou** a própria agente habilitar (auto-serviço — caminho preferível, sem mexer no banco de prod).
  O passo a passo não técnico está em
  [relatorio-atendimento-whatsapp-2027.md](relatorio-atendimento-whatsapp-2027.md) §3.1.

### 3.4 Agilidade do atendimento
- **Canned Responses (respostas prontas):** biblioteca de respostas com atalho `/` (ex.:
  `/taxa`, `/documentos`, `/datas`). Maior ganho de velocidade no dia a dia. **18 respostas já
  implementadas** a partir dos editais 2027 — ver §3.4.1.
- **Macros:** automações de 1 clique que encadeiam ações (ex.: "Enviar checklist + aplicar
  label `documentacao` + atribuir ao time + resolver").
- **Keyboard shortcuts:** treinar a equipe (navegar, responder, resolver, atribuir).
- **Snooze / Reminders:** adiar conversa que depende de terceiros e ser lembrado.
- **Priority:** marcar urgentes (ex.: prazo de inscrição estourando).

#### 3.4.1 Respostas prontas do PS 2027 (implementadas)
Biblioteca criada com base nos **dois editais 2027** — fonte oficial das regras. Como há **dois
processos** com regras diferentes, as respostas ou trazem as duas trilhas no mesmo texto
(`👶 1º ano` × `🎒 2º ano ao EM`) ou são específicas de um processo (sufixo no atalho). Atalho `/`
no campo de resposta. Manutenção via API do Chatwoot (`canned_responses`, conta `account_id=2`).

| Atalho | Cobre | Observação |
|--------|-------|------------|
| `/boas-vindas` | saudação + o que informar | comum |
| `/inscricao` | período (01/07–31/08/2026), site, passo a passo | comum |
| `/taxa` · `/boleto` · `/valores` | taxa R$ 200 + 1ª parcela R$ 2.200 | comum |
| `/documentos` | documentos da **inscrição** (2 trilhas no texto) | comum |
| `/vagas` | 208 (1º ano) + vagas por série (2º–EM) | comum |
| `/visita` | tour virtual + visita guiada (agosto/2026) | comum |
| `/datas` | cronograma resumido (2 trilhas) | comum |
| `/contato` | telefones/e-mails + escopo do canal | comum |
| `/resultado` | 1º ano "EM CHAMADA"/lista × 2º–EM 02/10 | 2 trilhas |
| `/matricula` · `/docs-matricula` | etapas e documentação (2 trilhas) | 2 trilhas |
| `/idade-1ano` | critério de idade (6 anos até 31/03/2027; Pré-II) | **só 1º ano** |
| `/grupos-1ano` | grupos de prioridade 1/2/3 (janela 01–13/07) | **só 1º ano** |
| `/selecao-1ano` | sem prova: ordem de inscrição + Convivência 14/11 | **só 1º ano** |
| `/elegibilidade-2em` | tabela ano/série × nascimento | **só 2º–EM** |
| `/prova-2em` | avaliação 19/09/2026, média ≥ 5,0, materiais | **só 2º–EM** |

> Diferença crítica entre os processos que as respostas preservam: **1º ano dos Anos Iniciais
> não tem prova** (seleção por ordem de inscrição + Atividades de Convivência); **2º ano ao
> Ensino Médio tem avaliação** (19/09, média ≥ 5,0) com resultado em 02/10.

### 3.5 Qualidade e organização
- **Labels padronizadas:** taxonomia enxuta — ex.: `duvida-inscricao`, `documentacao`,
  `financeiro-taxa`, `matricula`, `fora-de-escopo`, `timeout-avisado`. Base para relatórios.
- **Private notes / @menções:** contexto interno e escalonamento sem o cliente ver.
- **Conversation participants:** envolver mais de um agente/coordenação quando necessário.
- **Custom attributes (conversa e contato):** ex.: `serie_pretendida`, `origem`, `id_inscricao`.
- **CSAT (base, CE):** pesquisa de satisfação ao resolver a conversa — mede qualidade percebida.

### 3.6 Base de conhecimento (Help Center, CE)
- Publicar **FAQ de admissões** (datas, taxas, documentos, série/idade, contatos). Serve
  dois fins: (a) autoatendimento público; (b) **fonte de verdade** que alimenta a IA do
  Flowise (§4.3) — assim humano e bot respondem a **mesma** informação.

### 3.7 Relatórios (CE) — o que acompanhar
- **Overview:** conversas abertas/não atribuídas, tempo de 1ª resposta, tempo de resolução.
- **Conversations / Agents / Labels / Inbox / CSAT:** volume, produtividade, temas mais
  frequentes (labels) e satisfação. Usar labels consistentes para os relatórios fazerem sentido.

### 3.8 Chatwoot como CRM
- **Contacts:** cada responsável/candidato é um contato com histórico unificado (todas as
  conversas). **Custom attributes** e **notas** guardam o essencial do relacionamento.
- **Contact segments:** listas dinâmicas (ex.: "interessados Fundamental sem inscrição").
- **Merge de contatos** para evitar duplicidade.
- **Divisão de papéis com o RD Station:** o **RD** é o CRM de **marketing/nutrição**
  (captação, réguas, funil); o **Chatwoot** é o CRM **operacional de conversa**. Não duplicar
  automações — ver [integracao_rd_station.md](integracao_rd_station.md) e
  [resumo-rd-station-nao-tecnico.md](resumo-rd-station-nao-tecnico.md). Integração ponto-a-ponto
  (marco relevante → RD) pode ser feita via **webhooks/HTTP** a partir do adapter/Flowise.

---

## 4. Flowise — elevando a IA do atendimento (Agentflow V2)

O Flowise é a nossa camada de IA (substitui o Captain, que é pago) e a **1ª linha** de resposta.

### 4.1 Mensagem imediata ciente do horário (implementado)
Nó **Custom Function** do fluxo "Menu Atendimento CSA" retorna, na hora:
- **No horário:** boas-vindas + "um atendente responde em breve".
- **Fora do horário:** boas-vindas + "sua mensagem ficará registrada e responderemos assim que
  possível".
Ambas deixam claro que o canal é **exclusivo do PS 2027** e direcionam outros assuntos à
Secretaria. Horário fixado em `America/Sao_Paulo` (independe do fuso do SO).

### 4.2 Triagem por intenção (evolução recomendada)
Nó **Condition Agent** classifica a mensagem (ex.: *dúvida de inscrição*, *documentos*,
*financeiro/taxa*, *fora de escopo*) e:
- aplica **label** e **atribui ao time** certo no Chatwoot (via adapter/HTTP);
- responde na hora o que for FAQ; escala o resto para humano.

### 4.3 FAQ 24/7 com base de conhecimento (evolução recomendada)
**Document Store + Retriever**: indexar a FAQ de admissões (idealmente a **mesma** do Help
Center do Chatwoot). O **Agent** responde perguntas comuns fora do horário e alivia a fila no
horário — sempre com **guardrail de escopo** (só PS 2027) e **fallback** para a Secretaria.

### 4.4 Pré-qualificação estruturada (evolução recomendada)
Coletar em **Flow State** dados-chave (nome, série pretendida, ano, contato) e:
- gravar como **custom attributes** no Chatwoot (contexto pronto para o agente);
- opcionalmente enviar o marco ao **RD Station** via **HTTP node**.

### 4.5 Handoff para humano
Sinalizar transferência (troca de time/label "aguardando-humano") de forma explícita. O
**Human Input** do Agentflow V2 permite pausar/retomar, mas no nosso desenho o humano atende
**dentro do Chatwoot** — o Flowise apenas **entrega bem preparado** e para de responder quando
há atendente (regra no adapter).

### 4.6 Integrações via HTTP node
Consultar o **portal/RM** (status de inscrição, boleto) ou o **RD** com o **HTTP node**, para
respostas ricas ("sua inscrição está em X"). Respeitar segurança/PII (só dados mascarados antes
de identificação; ver práticas LGPD no §7).

---

## 5. Reconciliador de timeout (supre o SLA pago)

Container próprio (`atendimento-timeout-reconciler`) que consulta **só a API do Chatwoot**
(não toca no banco). Regra: conversa `open`, sem resposta de **atendente humano**
(`sender_type=User`) desde a última mensagem do cliente, aguardando **entre `TIMEOUT_MINUTES`
(prod=5 min) e ~24h** (`MAX_WAIT_MINUTES=1435` — fora da janela de 24h da Meta o texto livre é
bloqueado), e ainda sem o label `timeout-avisado` → envia **uma** mensagem "retornaremos" +
aplica o label. Fora do horário não faz nada (a expectativa já foi setada pelo Flowise). Fonte:
`~/dev/atendimento/timeout-reconciler/` (README com deploy e o Custom Function do Flowise).

### 5.1 Reengajamento fora da janela de 24h (template/HSM)

Passadas ~24h, o texto livre é bloqueado pela Meta → só **template aprovado**. O reconciliador
tem um segundo modo, **desligado por padrão** (`REENGAGE_ENABLED=false`): dentro do horário,
conversas aguardando **entre 24h e `REENGAGE_MAX_MINUTES` (3 dias)**, sem resposta humana e sem o
label `retomada-enviada`, recebem **uma** mensagem de **template** (`REENGAGE_TEMPLATE_NAME`,
default `retomada_atendimento_2027`, `pt_BR`) enviada **via Chatwoot** (`template_params` →
Cloud API, para ficar registrada no painel) + label `retomada-enviada`. O template **reabre a
janela de 24h**, permitindo ao atendente seguir em texto livre.

Templates submetidos à Meta (categoria **UTILITY**, aguardando aprovação):
`retomada_atendimento_2027` (sem variáveis, usado pela automação) e `retomada_admissao_nome_2027`
(com `{{1}}`=nome, para envio manual personalizado). **Ligar `REENGAGE_ENABLED=true` só após a
aprovação da Meta e a sincronização do template no Chatwoot.** Envio **manual** pelo atendente
funciona nativamente no painel assim que o template é aprovado.

---

## 6. Mapa "benefício → como obter"

| Quero… | Como (padrão ouro) | Camada |
|--------|--------------------|--------|
| Avisar cliente que está fora do horário | mensagem do Flowise (ramifica por hora) | Flowise |
| Avisar cliente "atende em breve" | mensagem do Flowise no horário | Flowise |
| Não deixar cliente no vácuo | reconciliador de timeout (5 min) | custom |
| Retomar conversa após 24h | template aprovado (HSM): manual no painel ou reengajamento automático (§5.1) | Meta + custom |
| Equipe ver conversas chegando | Slack + notificações + visão "Não atribuídas" | Chatwoot CE |
| Distribuir entre atendentes | auto-assignment round-robin + times | Chatwoot CE |
| Responder rápido o repetitivo | canned responses + macros | Chatwoot CE |
| Padronizar temas e medir | labels + relatórios | Chatwoot CE |
| Medir satisfação | CSAT | Chatwoot CE |
| Responder FAQ 24/7 | Flowise (Document Store/Retriever) + Help Center | Flowise + CE |
| Rotear por assunto | Condition Agent → time/label | Flowise |
| Histórico do relacionamento | Contacts + custom attributes + notas | Chatwoot CE |
| Nutrição de marketing | RD Station (não duplicar no Chatwoot) | RD |

---

## 7. Boas práticas de atendimento escolar via WhatsApp

- **Janela de 24h da Meta:** fora de 24h desde a última mensagem do cliente **só template
  aprovado (HSM)**. Já implementado (ver §5.1): 2 templates de **retomada** submetidos à Meta e
  reengajamento automático pronto (desligado até a aprovação). Ver [integracao_meta.md](integracao_meta.md).
- **Expectativa clara e sem spam:** **uma** mensagem por situação (boas-vindas, timeout). Bot
  tagarela irrita.
- **Escopo honesto:** canal só de PS 2027; outros assuntos → Secretaria. Não prometer o que o
  canal não faz.
- **Tom institucional e acolhedor**, em pt-BR, coerente com a marca CSA.
- **LGPD/PII:** dados de candidatos (CPF, e-mail) são sensíveis. Antes de identificar o
  contato, retornar dados **mascarados**; nunca logar segredos; base de conhecimento e bot não
  devem expor dados pessoais. Consistente com as regras do portal (ver `CLAUDE.md`).
- **Fonte única de FAQ:** Help Center e IA do Flowise apontando para o **mesmo** conteúdo,
  para humano e bot nunca se contradizerem.
- **Horário único de verdade:** seg–sex 08–17 `America/Sao_Paulo` replicado igual no Flowise,
  no reconciliador e no Business Hours do Chatwoot.

---

## 8. Checklist de implementação (priorizado)

**Vitórias rápidas (dias):**
- [x] Business Hours na inbox (sem unavailable message) — seg–sex 8h–17h, horário oficial confirmado.
- [x] Time `admissões-crm` + atribuição exclusiva à Renata Azevedo (`renata.azevedo@csa.com.br`).
- [x] Auto-assignment round-robin ligado.
- [x] Canned responses das dúvidas mais comuns — **18 respostas** a partir dos editais (§3.4.1), aprovadas pela direção.
- [ ] Taxonomia de labels + 2–3 macros.
- [ ] Notificações por agente (aviso de chegada): cada atendente liga e-mail + push no perfil
  (§3.3.1). SMTP já configurado; falta a Renata habilitar (auto-serviço).
- [ ] Integração Slack para novas conversas (alerta compartilhado de equipe — evolução).
- [x] Mensagem do Flowise ciente do horário (Custom Function).
- [x] Reconciliador de timeout em produção (`TIMEOUT_MINUTES=5`, `DRY_RUN=false`).

**Qualidade (semanas):**
- [ ] CSAT ao resolver conversas.
- [ ] Help Center com FAQ de admissões.
- [ ] Relatórios semanais (Overview/Labels/CSAT) como rotina de gestão.
- [ ] Templates de retomada aprovados na Meta.

**Avançado (evolução):**
- [ ] Flowise: triagem por intenção → time/label.
- [ ] Flowise: FAQ 24/7 com Document Store/Retriever (mesma fonte do Help Center).
- [ ] Flowise: pré-qualificação → custom attributes no Chatwoot / marco no RD.
- [ ] Integrações HTTP (status de inscrição/boleto do portal-RM).

---

## 9. Referências

- Chatwoot — planos self-hosted (CE × Enterprise): https://www.chatwoot.com/pricing/self-hosted-plans
- Chatwoot — documentação: https://www.chatwoot.com/docs
- Flowise — Agentflow V2: https://docs.flowiseai.com/using-flowise/agentflowv2
- Docs internos: [integracao_rd_station.md](integracao_rd_station.md),
  [resumo-rd-station-nao-tecnico.md](resumo-rd-station-nao-tecnico.md),
  [integracao_meta.md](integracao_meta.md), [agendador-visitas.md](agendador-visitas.md).
- Fonte do reconciliador (fora do repo): `~/dev/atendimento/timeout-reconciler/`.
