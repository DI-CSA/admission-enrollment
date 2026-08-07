# Atendimento por WhatsApp das Admissões 2027 — resumo para a direção

Documento **sem termos técnicos** para a direção entender o que é o canal de atendimento por
WhatsApp do Processo Seletivo 2027, o que já está pronto, os benefícios, o custo e **o que falta
decidir/fazer antes de liberar**. Um glossário curto está no final.

> Versão técnica completa: [atendimento-whatsapp-chatwoot-flowise.md](atendimento-whatsapp-chatwoot-flowise.md).

---

## 1. Em uma frase

Um canal de **WhatsApp exclusivo para inscrições e admissões 2027**, onde um **assistente
automático** recebe a família na hora, organiza o atendimento e passa para um **atendente
humano** — com uma **rede de segurança** que garante que ninguém fique sem resposta.

## 2. Como funciona (linguagem simples)

1. A família manda mensagem no WhatsApp da escola.
2. Um **assistente automático** responde **imediatamente**, dando boas-vindas e explicando que
   o canal é só do Processo Seletivo 2027 (outros assuntos → Secretaria).
   - **No horário** (seg–sex, 8h–17h): avisa que **um atendente responderá em breve**.
   - **Fora do horário**: avisa que a mensagem **ficou registrada** e será respondida assim que
     possível.
   - Da **2ª mensagem em diante**, o assistente **não repete as boas-vindas**: manda só uma
     confirmação curta ("recebemos sua mensagem"), também **adaptada ao horário** — para não
     parecer robô repetitivo.
3. A conversa entra na **central de atendimento** da equipe, que responde de forma organizada
   (com respostas prontas, histórico da família, etc.).
4. **Rede de segurança:** se, dentro do horário, ninguém responder em **5 minutos**, o sistema
   avisa a família automaticamente que **vamos retornar** — evitando a sensação de abandono.

## 3. O que já está pronto

- ✅ Assistente automático com **mensagem de boas-vindas que muda conforme o horário**.
- ✅ **Rede de segurança de 5 minutos** instalada e **em produção**.
- ✅ Central de atendimento (Chatwoot) funcionando, com todas as mensagens e regras no
  **horário de Brasília**.
- ✅ **18 respostas prontas** baseadas nos editais, aprovadas pela direção.
- ✅ **Atendimento definido:** conversas atribuídas à **Renata Azevedo** (time `admissões-crm`).
- ✅ **Retomada após 24h ligada:** os modelos exigidos pela Meta já estão **aprovados** e o
  sistema **reengaja automaticamente** quem escreveu fora da janela (ex.: mensagem de sexta
  respondida na segunda) — ver seção 8.

### Ativar os avisos de novas conversas (fazer uma vez, por atendente)

Para que a atendente **saiba na hora** que chegou uma conversa nova (o "aviso de chegada"), ela
precisa ligar as notificações **uma única vez** na própria conta. Não é preciso a TI fazer nada —
é um ajuste de perfil que **cada atendente faz sozinha**:

1. Entrar na central de atendimento (Chatwoot) e clicar no **avatar/foto no canto inferior
   esquerdo** → **Configurações do perfil** (*Profile settings*).
2. Abrir a aba **Notificações** (*Notifications*).
3. Em **Notificações por e-mail** (*Email notifications*), marcar:
   - **"Uma nova conversa é criada"** — avisa quando chega qualquer conversa nova.
   - **"Uma conversa é atribuída a mim"** — avisa quando a conversa cai para você.
   - **"Uma nova mensagem é criada em uma conversa atribuída a mim"** — avisa a cada resposta da
     família nas suas conversas.
4. Em **Notificações no navegador/aplicativo** (*Push notifications*), marcar as mesmas opções e,
   quando o navegador perguntar, **permitir notificações** — assim aparece um aviso na tela mesmo
   com a aba minimizada.
5. Clicar em **Salvar**.

> **Dica:** deixar a aba da central de atendimento **aberta** no computador (e permitir as
> notificações do navegador) é o jeito mais rápido de perceber uma conversa nova na hora. O e-mail
> serve de reforço para quando a pessoa está longe do painel.

## 4. Benefícios

**Para as famílias:** resposta imediata, expectativa clara (quando serão atendidas), nada de
mensagens no vácuo, atendimento mais rápido e consistente.

**Para a escola:** equipe organizada em um só painel, respostas padronizadas (mais rápidas e
sem erro), **indicadores** (quantas conversas, tempo de resposta, temas mais comuns,
satisfação), e um **histórico de relacionamento** com cada família (uma base de CRM).

## 5. Custo

Usamos **versões gratuitas** das ferramentas. Os recursos que seriam **pagos** (assistente de
IA embutido, "níveis de serviço" automáticos, etc.) foram **substituídos por soluções próprias
sem custo de licença** — por exemplo, a rede de segurança de 5 minutos faz o papel do recurso
pago de "nível de serviço". Custo recorrente fica praticamente restrito à **infraestrutura** já
existente e ao envio de mensagens pelo WhatsApp (regras da Meta).

## 6. O que falta fazer ANTES de liberar (pequeno esforço, grande ganho)

| Ação | Esforço | Ganho | Quem faz |
|------|:------:|:-----:|----------|
| ✅ **Rede de segurança ligada** (5 min, em produção) | mínimo | alto — ninguém fica sem resposta | TI (feito) |
| ✅ **Respostas prontas** — 18 respostas, baseadas nos editais, **aprovadas pela direção** | baixo | alto — agilidade diária | TI (feito) |
| ✅ **Etiquetas** para classificar conversas (base dos relatórios) | mínimo | médio | TI (feito) |
| ✅ **Equipe definida** — atendimento atribuído à Renata Azevedo (time `admissões-crm`) | baixo | alto — conversa sempre chega a alguém | Direção/TI (feito) |
| ✅ **Horário oficial confirmado** — seg–sex 8h–17h | mínimo | — | Direção (feito) |
| ✅ **Aviso de chegada** disponível — cada atendente liga as notificações (e-mail + navegador) no próprio perfil, uma vez (ver seção "Ativar os avisos de novas conversas") | mínimo | alto — atende a tempo | Atendente |
| ✅ **Templates de retomada na Meta** (para responder após 24h) — **aprovados pela Meta** e reengajamento automático **ligado** | baixo | alto — poder responder segunda uma mensagem de sexta | TI + Marketing (feito) |
| **Teste de ponta a ponta** antes do anúncio | baixo | alto — confiança no lançamento | TI |

> Praticamente tudo já está pronto. O único item em aberto é o **teste de ponta a ponta**
> antes do anúncio.

## 7. Evoluções depois do lançamento (opcionais)

- **Perguntas frequentes 24/7**: o assistente responde dúvidas comuns fora do horário.
- **Triagem inteligente**: encaminhar automaticamente para a pessoa/área certa.
- **Pré-cadastro**: o assistente coleta dados básicos antes do atendente entrar.
- **Pesquisa de satisfação** ao fim do atendimento.
- **Integração com o portal** (ex.: informar situação da inscrição).

## 8. Cuidados

- **Regra das 24h do WhatsApp (limitação da Meta, não da escola):** passadas 24h desde a última
  mensagem da família, a **Meta bloqueia** texto livre no WhatsApp — só permite **mensagens de
  modelo previamente aprovadas por ela** (os "templates"). Isso é uma **regra da plataforma da
  Meta**, igual para qualquer empresa; não é escolha nem falha do nosso sistema. Como já temos
  os **modelos aprovados**, o sistema **retoma o contato automaticamente** dentro dessa regra:
  quem escreveu fora da janela (ex.: no fim de semana) recebe uma mensagem de modelo convidando
  a continuar o atendimento, e a conversa volta ao normal quando a família responde.
- **Privacidade (LGPD):** dados das famílias são tratados com cuidado; informações sensíveis
  não são expostas antes da identificação.
- **Sem excesso de mensagens:** o assistente é enxuto (uma mensagem por situação), para não
  incomodar.
- **Escopo honesto:** o canal é só do PS 2027; outros assuntos vão para a Secretaria.

## 9. O que precisamos da direção

1. **Confirmar horário oficial** de atendimento (hoje: seg–sex, 8h–17h).
2. **Indicar a equipe/atendentes** do canal.
3. **Aprovar os textos** (boas-vindas, fora de horário, aviso de espera) e o conteúdo das
   respostas prontas e dos templates da Meta.
4. **Dar o aval do go-live** após o teste de ponta a ponta.

---

## Glossário

- **Assistente automático (bot):** programa que responde na hora, sem pessoa.
- **Central de atendimento (Chatwoot):** painel único onde a equipe vê e responde as conversas.
- **Rede de segurança / timeout:** aviso automático se ninguém responder em 5 minutos.
- **Respostas prontas:** textos pré-escritos que o atendente insere com um atalho.
- **Etiquetas (labels):** marcadores para classificar conversas e gerar relatórios.
- **Template / mensagem de modelo (HSM):** mensagem pré-aprovada pela Meta, exigida fora da
  janela de 24h.
- **CRM:** registro do relacionamento com cada família (histórico, dados, conversas).
- **Community Edition:** versão gratuita das ferramentas usadas.
