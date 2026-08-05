# Relatório — Canal de Atendimento por WhatsApp | Admissões 2027 (CSA Leblon)

**Para:** Direção e responsável pelo atendimento do Processo Seletivo 2027
**Assunto:** o que já está implementado, como usar no dia a dia e o que fica como projeto futuro
**Elaborado por:** TI / Integrações

> Este documento é objetivo e sem termos técnicos desnecessários. Uma visão executiva mais
> curta está em [resumo-atendimento-whatsapp-nao-tecnico.md](resumo-atendimento-whatsapp-nao-tecnico.md);
> a documentação técnica completa está em
> [atendimento-whatsapp-chatwoot-flowise.md](atendimento-whatsapp-chatwoot-flowise.md).

---

## 1. Resumo executivo

Está no ar um **canal de WhatsApp exclusivo para inscrições e admissões do Processo Seletivo
2027**. Toda mensagem recebe **resposta automática imediata** (que muda conforme o horário),
a conversa entra em um **painel único de atendimento** (Chatwoot) onde a equipe responde de
forma organizada, e há uma **rede de segurança**: se dentro do horário ninguém responder em
**5 minutos**, o sistema avisa a família automaticamente que retornaremos — evitando a sensação
de abandono. As **decisões operacionais já foram tomadas** (atendente, textos, respostas prontas
e horário — ver item 4) e o sistema **está pronto para uso**. A única pendência é **externa**: a
aprovação dos templates de retomada pela Meta, que libera as respostas após 24h (item 2.7).

---

## 2. O que está implementado hoje

### 2.1 Canal e escopo
- WhatsApp oficial da escola, **exclusivo do Processo Seletivo 2027** (inscrições e admissões).
- Outros assuntos são orientados a procurar a **Secretaria** (secretaria@csa.com.br).

### 2.2 Resposta automática imediata (ciente do horário)
Assim que a família escreve, ela recebe **na hora** uma mensagem de boas-vindas. O texto muda
conforme o horário:

- **Sempre (base):**
  > Olá! 👋 Você chegou ao canal de Inscrições e Admissões do Colégio Santo Agostinho.
  > Este canal é exclusivo para assuntos do Processo Seletivo 2027 (inscrições e admissões).
  > Para outros assuntos, fale com a Secretaria pelo e-mail secretaria@csa.com.br.

- **Dentro do horário** (seg–sex, 8h–17h) acrescenta:
  > Um de nossos atendentes vai responder em breve. 🙏

- **Fora do horário** acrescenta:
  > No momento estamos fora do horário de atendimento (segunda a sexta, das 8h às 17h).
  > Pode deixar sua mensagem por aqui: ela ficará registrada e responderemos assim que possível. 🙏

### 2.3 Central de atendimento (painel único)
Toda conversa aparece em um **painel único** (Chatwoot), onde a equipe:
- vê o **histórico completo** de cada família em um só lugar;
- usa **respostas prontas** (atalhos) para as dúvidas mais comuns;
- **classifica** as conversas com etiquetas (base dos relatórios);
- recebe as conversas por **atribuição automática**.

**Atendimento (decisão da direção):** as conversas são atribuídas **exclusivamente** à atendente
**Renata Azevedo** (`renata.azevedo@csa.com.br`), que integra o time **`admissões-crm`**. Quando
outros atendentes forem incluídos no time, a distribuição passa a ser em rodízio automaticamente.

Já foram criados:
- **Etiquetas padrão:** `duvida-inscricao`, `documentacao`, `financeiro-taxa`, `matricula`,
  `fora-de-escopo`, `timeout-avisado`.
- **Respostas prontas (18, prontas para uso):** biblioteca completa baseada nos **editais 2027**,
  cobrindo inscrição, taxa/valores, documentos, vagas, avaliação, resultado, matrícula, visita e
  contato — ver detalhe no item 2.3.1. Os atalhos aparecem digitando `/` (ex.: `/taxa`, `/prova-2em`).
  **Aprovadas pela direção.**
- **Time `admissões-crm`** com atribuição automática habilitada na caixa do WhatsApp
  (atendente atual: Renata Azevedo, exclusivamente).

#### 2.3.1 Biblioteca de respostas prontas (baseada nos editais)
Como o Colégio tem **dois processos com regras diferentes**, as respostas foram escritas para não
confundir as famílias: onde as regras divergem, o texto traz as duas trilhas (**1º ano dos Anos
Iniciais** × **2º ano ao Ensino Médio**) ou existe um atalho específico de cada processo.

- **Comuns aos dois processos:** `/boas-vindas`, `/inscricao`, `/taxa`, `/boleto`, `/valores`,
  `/documentos` (da inscrição), `/vagas`, `/visita`, `/datas`, `/contato`.
- **Com as duas trilhas no mesmo texto:** `/resultado`, `/matricula`, `/docs-matricula`.
- **Só do 1º ano:** `/idade-1ano` (critério de idade), `/grupos-1ano` (grupos de prioridade),
  `/selecao-1ano` (**não há prova** — ordem de inscrição + Atividades de Convivência em 14/11/2026).
- **Só do 2º ano ao Ensino Médio:** `/elegibilidade-2em` (ano/série × ano de nascimento),
  `/prova-2em` (**avaliação em 19/09/2026**, média mínima 5,0, materiais permitidos).

> Diferença mais importante a comunicar: **o 1º ano não faz prova**; do **2º ano ao Ensino Médio há
> avaliação** (19/09/2026), com resultado em 02/10/2026. As respostas já refletem isso.
> A coordenação pode revisar/ajustar qualquer texto; a base já traz datas, valores e links reais.

### 2.4 Rede de segurança (aviso de espera — 5 minutos)
Dentro do horário de atendimento, se uma conversa ficar **mais de 5 minutos sem resposta de um
atendente humano**, o sistema envia **uma única vez** a mensagem abaixo e marca a conversa com a
etiqueta `timeout-avisado` (para nunca avisar duas vezes):

> Obrigado pela paciência! 🙏 No momento nossos atendentes estão ocupados e ainda não conseguimos
> responder. Sua mensagem está registrada e retornaremos o contato o quanto antes, dentro do
> horário de atendimento (seg–sex, 8h–17h).

Detalhes importantes:
- **Só age dentro do horário** de atendimento (fora dele, a expectativa já foi dada pela mensagem
  automática do item 2.2).
- **Se um atendente responder antes dos 5 minutos, o aviso não é enviado** (comportamento correto).
- **Regra das 24h do WhatsApp:** conversas paradas há mais de ~24h **não** recebem o aviso
  automático (a Meta só permite texto livre dentro de 24h; depois disso exige "template" aprovado
  — ver item 5).

### 2.5 Horário e fuso
- **Atendimento:** segunda a sexta, **8h–17h**.
- O servidor e todos os textos usam o **horário de Brasília** (America/Sao_Paulo).
- O horário está **igual** na mensagem automática e na rede de segurança (mesma configuração).

### 2.6 Infraestrutura e custo
- O canal roda em servidor próprio na nuvem (Google Cloud), com as ferramentas em **versão
  gratuita** (Community Edition).
- Os recursos que seriam **pagos** (assistente de IA embutido, "níveis de serviço" automáticos)
  foram **substituídos por soluções próprias sem custo de licença** — por exemplo, a rede de
  segurança de 5 minutos faz o papel do recurso pago de "nível de serviço".
- O custo recorrente fica praticamente restrito à **infraestrutura já existente** e ao **envio de
  mensagens pelo WhatsApp** (tarifas da Meta).

### 2.7 Solução para a "janela de 24h" do WhatsApp
O WhatsApp (Meta) só permite **texto livre nas primeiras 24h** após a última mensagem da família.
Passado esse prazo (ex.: mensagem enviada na sexta à noite e respondida na segunda), só é possível
retomar com uma **mensagem de modelo aprovada pela Meta (template/HSM)**. A solução implementada:

- **Templates de retomada criados e submetidos à Meta** (categoria *Utilidade*), aguardando
  aprovação. Textos:
  1. *Retomada padrão* — "Olá! 👋 Aqui é o time de Admissões do Colégio Santo Agostinho. Recebemos
     sua mensagem sobre o Processo Seletivo 2027 e continuamos à disposição para ajudar. Se ainda
     precisar de atendimento, é só responder esta mensagem que seguimos por aqui. 🙏"
  2. *Retomada com nome* — versão personalizada ("Olá, [nome]! …").
- **Envio manual pelo atendente:** assim que a Meta aprovar, o próprio painel passa a oferecer
  esses templates para o atendente retomar qualquer conversa fora das 24h, com um clique.
- **Reengajamento automático (opcional):** a rede de segurança pode, dentro do horário, reabrir
  automaticamente **uma vez** as conversas que passaram das 24h sem resposta (típico de mensagens
  de fim de semana), enviando o template de retomada. **Fica desligado por padrão** e só deve ser
  ligado após a aprovação do template e o aval da direção.
- **Por que a família recebe o template:** ele **reabre a janela de 24h**, permitindo que o
  atendente volte a conversar normalmente em texto livre.

> A aprovação dos templates é o **único item com prazo externo** (depende da Meta, normalmente
> algumas horas a poucos dias). Por isso já foram submetidos.

---

## 3. Como usar no dia a dia (guia do responsável pelo atendimento)

1. **Acesse o painel** de atendimento com seu usuário. As conversas novas aparecem na caixa do
   WhatsApp; use os filtros **"Não atribuídas"**, **"Minhas"** e **"Todas"** para se orientar.
   *(Se uma conversa "sumir", quase sempre é filtro selecionado — troque o filtro para "Todas".)*
2. **Assuma a conversa** e responda. Hoje as conversas já chegam atribuídas à Renata Azevedo
   (`renata.azevedo@csa.com.br`), atendente do time `admissões-crm`. Quando o time crescer, a
   atribuição passa a rodízio automático.
3. **Use as respostas prontas** digitando o atalho (ex.: `/taxa`, `/documentos`, `/datas`) para
   agilizar e padronizar. Revise o texto antes de enviar.
4. **Classifique** a conversa com as etiquetas (ex.: `duvida-inscricao`, `financeiro-taxa`) —
   isso alimenta os relatórios.
5. **Responda dentro de 5 minutos** sempre que possível: assim a família não recebe o aviso
   automático de espera (a rede de segurança é um "seguro", não o padrão desejado).
6. **Ao concluir**, marque a conversa como **resolvida**. Ela reabre sozinha se a família
   responder de novo.
7. **Regra das 24h:** se a última mensagem da família tem mais de 24h, o WhatsApp **não** permite
   texto livre — será necessário um **template aprovado** (ver item 5). Os templates já foram
   submetidos à Meta e **aguardam aprovação**; enquanto não aprovados, essas retomadas precisam ser
   feitas por outro meio (ligação/e-mail).

**O que NÃO fazer:**
- Não use o canal para assuntos fora do PS 2027 (redirecione à Secretaria).
- Não remova a etiqueta `timeout-avisado` manualmente (ela controla a rede de segurança).
- Não exponha dados sensíveis da família em mensagens sem necessidade (LGPD — item 6).

### 3.1 Ativar os avisos de novas conversas (fazer uma vez, por atendente)

Para **saber na hora** que chegou uma conversa nova (o "aviso de chegada"), cada atendente liga as
notificações **uma única vez** na própria conta. É um ajuste de perfil que a atendente faz sozinha —
a TI não precisa intervir. O servidor de e-mail já está configurado, então os avisos por e-mail são
entregues normalmente assim que as opções abaixo forem marcadas.

1. No painel de atendimento (Chatwoot), clicar no **avatar/foto no canto inferior esquerdo** →
   **Configurações do perfil** (*Profile settings*).
2. Abrir a aba **Notificações** (*Notifications*).
3. Em **Notificações por e-mail** (*Email notifications*), marcar:
   - **"Uma nova conversa é criada"** — avisa quando chega qualquer conversa nova na caixa.
   - **"Uma conversa é atribuída a mim"** — avisa quando a conversa é atribuída a você.
   - **"Uma nova mensagem é criada em uma conversa atribuída a mim"** — avisa a cada resposta da
     família nas suas conversas.
4. Em **Notificações no navegador/aplicativo** (*Push notifications*), marcar as mesmas opções e,
   quando o navegador perguntar, **permitir as notificações** — assim aparece um aviso na tela mesmo
   com a aba minimizada.
5. Clicar em **Salvar**.

> **Recomendado:** manter a aba do painel **aberta** durante o expediente e permitir as notificações
> do navegador — é a forma mais rápida de perceber uma conversa nova em tempo real. O e-mail serve de
> reforço para quando a atendente está longe do computador. Enquanto as opções não forem marcadas, o
> sistema **não** dispara os avisos (é uma preferência de cada usuário, por privacidade).

---

## 4. Decisões tomadas e pendência externa

**Decisões já tomadas pela direção (tudo em uso):**

| Item | Decisão |
|------|---------|
| **Atendente** | Conversas atribuídas **exclusivamente** a Renata Azevedo (`renata.azevedo@csa.com.br`), time `admissões-crm` |
| **Textos automáticos** (boas-vindas, fora de horário, aviso de espera) | **Aprovados** |
| **Respostas prontas** (18, baseadas nos editais) | **Aprovadas** |
| **Textos dos templates de retomada** | **Aprovados** pela direção |
| **Horário oficial** | **Confirmado**: seg–sex, 8h–17h (America/Sao_Paulo) |

**Única pendência — externa (Meta):** os templates de retomada estão **submetidos e aguardando
aprovação da Meta** (status atual: *em análise*). Só após a aprovação é possível (a) o atendente
enviar o template manualmente para retomar conversas fora das 24h e (b) ligar o **reengajamento
automático** (hoje desligado, ver §2.7). Assim que a Meta aprovar, a TI ativa em um passo.

---

## 5. Projeto futuro — automações propostas (ainda **não** implementadas)

Os itens abaixo **não fazem parte do que está no ar hoje**. São evoluções recomendadas, a serem
priorizadas pela direção após o lançamento:

1. **Reengajamento automático fora das 24h (já preparado):** os templates de retomada **já foram
   submetidos à Meta** e o mecanismo de reenvio automático está pronto no sistema, apenas
   **desligado**. Após a aprovação da Meta, basta a direção autorizar para ligá-lo (ver §2.7).
2. **Perguntas frequentes automáticas (FAQ 24/7):** o assistente responde dúvidas comuns (taxa,
   documentos, datas) sozinho, inclusive fora do horário.
3. **Triagem inteligente:** encaminhar automaticamente cada conversa para a pessoa/área certa
   conforme o assunto.
4. **Pré-cadastro assistido:** o assistente coleta dados básicos (nome, série pretendida, contato)
   antes do atendente entrar.
5. **Pesquisa de satisfação (CSAT)** ao fim do atendimento, para medir qualidade.
6. **Alertas em tempo real em canal interno** (ex.: aviso no WhatsApp/Slack/Telegram de um grupo da
   equipe quando há conversa aguardando). *Observação:* o aviso individual por e-mail e navegador
   **já está disponível** para cada atendente (ver §3.1); este item é a evolução para um **alerta
   compartilhado de equipe**, útil quando houver mais de uma pessoa no plantão.
7. **Integração com o portal de admissão:** informar a situação da inscrição/matrícula direto na
   conversa.
8. **Relatórios gerenciais avançados:** volume por assunto, tempo de resposta, horários de pico,
   conversão de interessados em inscritos (visão de CRM).

> Cada evolução pode ser adotada de forma independente. As de maior retorno imediato costumam ser
> **templates de retomada** (destrava respostas após 24h) e **FAQ 24/7** (reduz volume repetitivo).

---

## 6. Privacidade (LGPD) e boas práticas

- Dados das famílias (nome, CPF, e-mail, telefone) são tratados apenas para fins do processo
  seletivo e ficam restritos ao painel de atendimento.
- Informações sensíveis **não** são expostas antes da identificação da pessoa.
- O assistente é **enxuto** (uma mensagem por situação), para não incomodar.
- **Escopo honesto:** o canal é só do PS 2027; outros assuntos vão para a Secretaria.

---

## Glossário

- **Assistente automático (bot):** programa que responde na hora, sem pessoa.
- **Painel / central de atendimento:** tela única onde a equipe vê e responde todas as conversas.
- **Rede de segurança / aviso de espera:** mensagem automática se ninguém responder em 5 minutos.
- **Respostas prontas:** textos pré-escritos inseridos por um atalho (ex.: `/taxa`).
- **Etiquetas:** marcadores para classificar conversas e gerar relatórios.
- **Template / mensagem de modelo (HSM):** mensagem pré-aprovada pela Meta, exigida fora da
  janela de 24h.
- **Janela de 24h:** período em que o WhatsApp permite texto livre após a última mensagem da
  família; fora dela, só templates aprovados.
- **CRM:** registro do relacionamento com cada família (histórico, dados, conversas).

---

## Apêndice — As 18 respostas prontas (texto integral)

Abaixo está o **texto exato** de cada resposta pronta, como é enviado à família. O atendente insere
digitando `/` seguido do atalho (ex.: `/taxa`). Os símbolos `*asterisco*` viram **negrito** no
WhatsApp. Todos os textos foram **aprovados pela direção** e têm base nos **editais 2027**; a
coordenação pode revisar qualquer um a qualquer momento.

> **Como estão organizadas:** 10 respostas **comuns aos dois processos**, 3 que trazem **as duas
> trilhas no mesmo texto**, 3 **exclusivas do 1º ano** e 2 **exclusivas do 2º ano ao Ensino Médio**.

### Comuns aos dois processos

#### `/boas-vindas` — saudação e abertura da conversa
```
Olá! 😊 Você está falando com o atendimento do *Processo Seletivo 2027* do Colégio Santo Agostinho – Unidade Leblon.

Podemos ajudar com dúvidas sobre inscrição, taxa, documentos, avaliação, resultado e matrícula.

Para agilizar, nos conte:
1) O nome do(a) candidato(a);
2) Para qual ano/série pretende ingressar em 2027.

Assim direcionamos as informações certas para o seu caso. 🙏
```

#### `/inscricao` — como fazer a inscrição
```
*Como fazer a inscrição — 2027*

🗓️ Período: *01/07 a 31/08/2026* (até 23h59).
💻 Exclusivamente pela internet, em https://inscricao.csa.com.br → menu *"Quero me inscrever"* → clique no ano/série do candidato.

Passo a passo:
1) Preencha a ficha com os dados do candidato (conforme a Certidão de Nascimento);
2) Anexe os documentos em PDF, JPEG ou PNG;
3) Emita o boleto da taxa (R$ 200,00) e pague em até 1 dia.

⚠️ A inscrição só é efetivada com o *pagamento da taxa*. Acompanhe tudo pela Central do Candidato (CPF do responsável + senha).
```

#### `/taxa` — valor e regras da taxa
```
*Taxa de inscrição: R$ 200,00* (duzentos reais) — mesmo valor para todos os anos/séries.

• O boleto é gerado ao final do preenchimento da ficha de inscrição.
• Vence *1 dia após* o envio do formulário.
• O não pagamento até o vencimento *cancela a inscrição*.
• A taxa não é devolvida em nenhuma hipótese.

⚠️ Só preencher a ficha não garante a inscrição: é obrigatório pagar a taxa.
```

#### `/boleto` — boleto da taxa e 2ª via
```
*Boleto da taxa de inscrição*

• É gerado automaticamente ao concluir a ficha de inscrição no site.
• Valor: R$ 200,00.
• Vencimento: *1 dia após* o envio do formulário.
• Pode ser pago em qualquer banco/agência.

Se não for pago até o vencimento, a inscrição é *cancelada automaticamente*. Para 2ª via, acesse a Central do Candidato com o CPF do responsável e a senha cadastrada.
```

#### `/valores` — resumo financeiro
```
*Resumo financeiro — 2027*

• *Taxa de inscrição:* R$ 200,00 (não reembolsável; boleto vence 1 dia após a inscrição).
• *1ª parcela da anuidade 2027:* R$ 2.200,00 (paga na matrícula para garantir a vaga).

O valor total da anuidade, o número de parcelas e as demais condições financeiras constam do *Contrato de Prestação de Serviços Educacionais*, disponibilizado ao responsável no momento da matrícula.
```

#### `/documentos` — documentos da inscrição (duas trilhas)
```
*Documentos para a INSCRIÇÃO* (anexar no site em PDF, JPEG ou PNG)

👶 *1º ano dos Anos Iniciais:*
• Certidão de Nascimento do candidato (completa e legível);
• Declaração de escolaridade recente (atestando que cursa o Pré-II);
• Grupo 2 (filhos de ex-alunos): documento comprobatório, se possível.

🎒 *2º ano dos Anos Iniciais até a 2ª série do Ensino Médio:*
• Certidão de Nascimento do candidato (completa e legível);
• Declaração de escolaridade recente (atestando o ano/série que cursa).

⚠️ Divergência entre a ficha e os documentos anexados elimina o candidato.
```

#### `/vagas` — número de vagas por ano/série
```
*Vagas para 2027*

👶 *1º ano dos Anos Iniciais:* 208 vagas (turno da tarde), divididas em 3 grupos de prioridade.

🎒 *Demais anos/séries:*
• 2º ano: 15  • 3º ano: 15  • 4º ano: 10  • 5º ano: 10
• 6º ano: 10  • 7º ano: 10  • 8º ano: 10  • 9º ano: 10
• 1ª série EM: 15  • 2ª série EM: 15

As vagas são preenchidas conforme os critérios de cada processo (ordem de inscrição no 1º ano; classificação na avaliação nos demais).
```

#### `/visita` — tour virtual e visita guiada
```
*Conheça o Colégio*

🎥 *Tour virtual:* disponível em http://www.csa.com.br, no menu "Acesso Rápido". Dúvidas após o tour podem ser enviadas para secretaria@csa.com.br (assunto: "Tour Virtual").

🏫 *Visita guiada* (agosto/2026): 05/08 (4ª, 15h), 08/08 (sáb, 8h30 ou 10h30), 15/08 (sáb, 8h30 ou 10h30) e 19/08 (4ª, 15h).

📞 Agende previamente pela Secretaria: (21) 3206-7850.
```

#### `/datas` — cronograma resumido
```
*Cronograma resumido — 2027*

📌 *Comum aos dois processos:*
• Inscrições: 01/07 a 31/08/2026 (até 23h59)
• Taxa: R$ 200,00 (boleto vence 1 dia após a inscrição)

👶 *1º ano dos Anos Iniciais* (sem prova):
• Seleção por ordem de inscrição + Atividades de Convivência: 14/11/2026
• Lista de espera: 08/09 a 30/12/2026

🎒 *2º ano ao Ensino Médio* (com avaliação):
• Avaliação: 19/09/2026 (sábado)
• Resultado: 02/10/2026, às 15h
• Pré-matrícula: 02 a 09/10/2026

Se quiser, posso detalhar o cronograma completo do ano/série do(a) candidato(a). 🙂
```

#### `/contato` — contatos da Secretaria
```
*Fale com o Colégio Santo Agostinho – Leblon*

📞 Secretaria: (21) 3206-7850
✉️ E-mail: secretaria@csa.com.br
🌐 Inscrições: https://inscricao.csa.com.br
🌐 Matrícula: https://matricula.csa.com.br
📍 Rua José Linhares, 88 – Leblon, Rio de Janeiro/RJ

Este canal de WhatsApp é exclusivo para o *Processo Seletivo 2027*. Para outros assuntos, fale com a Secretaria pelos contatos acima. Atendimento: segunda a sexta, das 8h às 17h.
```

### Com as duas trilhas no mesmo texto

#### `/resultado` — divulgação do resultado
```
*Resultado do Processo Seletivo 2027*

🎒 *2º ano ao Ensino Médio:* divulgação em *02/10/2026, às 15h*, na Central do Candidato (CPF do responsável + senha) e por e-mail. Não há revisão de avaliação.

👶 *1º ano dos Anos Iniciais:* não há prova. Após a validação dos documentos e o pagamento da taxa, o candidato fica com status *"EM CHAMADA"* e deve concluir a pré-matrícula para garantir a vaga. A lista de espera pode ser consultada de *08/09 a 30/12/2026* na Central do Candidato.

Acompanhe sempre pela Central do Candidato. 🙂
```

#### `/matricula` — como funciona a matrícula
```
*Matrícula — como funciona*

Após ser classificado/chamado, a matrícula é feita em https://matricula.csa.com.br (CPF do responsável + senha).

💰 *1ª parcela da anuidade 2027: R$ 2.200,00* — o pagamento garante a vaga; o não pagamento libera a vaga.

👶 *1º ano:* pré-matrícula de 01/07 a 31/08/2026 (boleto vence 1 dia). Contrato (DocuSign) e documentação de 05/08 a 04/09/2026.

🎒 *2º ano ao EM:* pré-matrícula de 02 a 09/10/2026 (boleto vence 2 dias). Contrato (DocuSign) de 16 a 26/10/2026; entrega do Histórico Escolar original em janeiro/2027.

A matrícula só é efetivada após a validação de todos os documentos.
```

#### `/docs-matricula` — documentação da matrícula
```
*Documentação da matrícula*

📄 *Pré-matrícula* (todos): CPF do candidato, foto 3x4 recente (fundo branco), CPF e RG ou CNH do responsável financeiro e comprovante de residência atualizado.

👶 *1º ano — documentação complementar:*
• Atestado de Saúde;
• Atestado médico de aptidão para Educação Física;
• Laudo do exame audiométrico;
• Laudo do exame oftalmológico;
• Documento de guarda (pais separados, em caso de litígio);
• Em dezembro: Relatório Anual da Educação Infantil da escola de origem.

🎒 *2º ano ao EM — documentação complementar:*
• Atestado de Saúde;
• Atestado médico de aptidão para Educação Física;
• Carteira de Identidade (alunos do Ensino Médio);
• Documento de guarda (se aplicável);
• Declaração de situação final e *Histórico Escolar original* (entrega presencial em janeiro/2027).

Documentos recentes, legíveis e em PDF/JPEG/PNG (o Histórico é entregue em via original).
```

### Exclusivas do 1º ano dos Anos Iniciais

#### `/idade-1ano` — critério de idade
```
*1º ano dos Anos Iniciais — critério de idade*

Pode se inscrever o candidato que:
• tiver *6 anos completos até 31/03/2027*, ou completar 7 anos a partir de 01/04/2027; e
• estiver cursando o nível equivalente à *Pré-escola II (Pré-II)* na Educação Infantil.

⚠️ O candidato ao 1º ano só pode ser inscrito em um único processo — inscrição em duplicidade (1º e 2º anos) elimina o candidato. Turno: *tarde*.
```

#### `/grupos-1ano` — grupos de prioridade
```
*1º ano — grupos de prioridade*

• *Grupo 1:* filhos de professores/funcionários do CSA-Leblon e candidatos com irmãos atualmente matriculados (situação adimplente).
• *Grupo 2:* filhos de ex-alunos do CSA Leblon e/ou Barra da Tijuca, aprovados por pelo menos um ano letivo.
• *Grupo 3:* demais candidatos.

🗓️ Prioridade para os Grupos 1 e 2: inscrição de *01 a 13/07/2026*. Após esse período, passam a concorrer às vagas remanescentes em igualdade com os demais.

ⓘ Divergência quanto à condição de ex-aluno/aprovação remaneja o candidato do Grupo 2 para o Grupo 3.
```

#### `/selecao-1ano` — como é a seleção (sem prova)
```
*Como é a seleção do 1º ano* (não há prova)

A classificação segue a *ordem cronológica de inscrição/finalização*, respeitando os grupos de prioridade, e a conclusão da pré-matrícula.

🧩 *Atividades de Convivência* — 14/11/2026, às 10h (presencial, obrigatórias para os candidatos admitidos):
• Duração prevista: até 2h30;
• A criança deve levar cola líquida, tesoura e lápis de cor;
• Vestir roupas confortáveis.

É um momento lúdico de socialização, sem caráter de "prova". As orientações finais são confirmadas pelo Colégio.
```

### Exclusivas do 2º ano ao Ensino Médio

#### `/elegibilidade-2em` — ano/série × ano de nascimento
```
*2º ano dos Anos Iniciais até a 2ª série do EM — quem pode se inscrever*

O candidato deve estar cursando (e ser aprovado) no ano/série anterior. Referência de nascimento:
• 2º ano: 2019–2020  • 3º ano: 2018–2019  • 4º ano: 2017–2018  • 5º ano: 2016–2017
• 6º ano: 2015–2016  • 7º ano: 2014–2015  • 8º ano: 2013–2014  • 9º ano: 2012–2013
• 1ª série EM: 2011–2012  • 2ª série EM: 2010–2011

⚠️ O Colégio não aceita matrícula de aluno reprovado na escola de origem. Em dúvida sobre a série do(a) candidato(a), podemos ajudar. 🙂
```

#### `/prova-2em` — avaliação
```
*Avaliação — 2º ano ao Ensino Médio*

🗓️ Data: *19/09/2026 (sábado)*
• 2º ao 9º ano — 8h30: Língua Portuguesa e Matemática
• 1ª e 2ª séries do EM — 8h: Língua Portuguesa, Redação e Matemática

📍 Entrada pela Rua José Linhares, 88 – Leblon.
✏️ Levar estojo (lápis, caneta azul/preta, borracha, régua, apontador) e, do 7º ano em diante, documento de identificação com foto. *Não é permitido* celular, calculadora ou aparelhos eletrônicos.

✅ Classifica-se quem obtiver *média igual ou superior a 5,0*. Os programas das avaliações ficam disponíveis no acesso às inscrições.
```
