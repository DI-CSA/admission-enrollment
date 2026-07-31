# Como funciona a jornada de Marketing e CRM do Portal de Admissão

### CSA Leblon · Processo Seletivo 2027 — versão para a equipe da escola e o parceiro de Marketing/CRM

> **Para quem é este documento.** Para quem **não é técnico** e precisa entender, de ponta a
> ponta, como o portal de admissão conversa com o RD Station (Marketing e CRM), com o Meta e
> com o Google. Ele descreve **todo o processo em detalhes**, mas **sem falar de código** —
> quando algo é feito "por um programa automático", explicamos o que isso significa na
> prática.
>
> Existe também uma versão técnica ([integracao_rd_station.md](integracao_rd_station.md)) e
> uma versão executiva/estratégica ([resumo-estrategico-rd-station.md](resumo-estrategico-rd-station.md)).
> Este aqui é o **guia detalhado, em linguagem simples**.
>
> **Atualizado em:** 2026-07-30.

---

## Glossário — os termos que aparecem neste documento

> Leia primeiro esta seção. Todos os termos abaixo são usados adiante. Estão em ordem
> lógica (do mais básico ao mais específico), não alfabética. **Sempre que aparece uma sigla,
> ela vem explicada.**

**RD Station.** A plataforma que usamos para Marketing e CRM (RD = *Resultados Digitais*, a
empresa brasileira que a criou). Tem dois produtos: o **RD Station Marketing** e o **RD
Station CRM**.

**CRM.** Sigla em inglês de *Customer Relationship Management* — "Gestão de Relacionamento com
o Cliente". É a ferramenta onde a equipe de admissão acompanha **cada candidato
individualmente**.

**API.** Sigla em inglês de *Application Programming Interface* ("Interface de Programação de
Aplicações") — uma "ponte" pela qual dois sistemas trocam informações **automaticamente**, sem
ninguém digitar nada. Quando dizemos que um dado é "preenchido via API", significa que **o
nosso sistema o envia sozinho** ao RD.

**LGPD.** Lei Geral de Proteção de Dados (lei brasileira nº 13.709/2018), que regula o uso de
dados pessoais.

**DPO.** Sigla em inglês de *Data Protection Officer* — o "Encarregado de Proteção de Dados",
responsável por zelar pela conformidade com a LGPD.

**ERP / TOTVS RM.** ERP é sigla em inglês de *Enterprise Resource Planning* ("sistema
integrado de gestão"). O **TOTVS RM** é o ERP da escola — o **sistema oficial e definitivo**
onde vivem cadastros, boletos e pagamentos de verdade. Toda a automação de "pagou/virou
cliente" se apoia no que o RM diz — **a verdade financeira vem de lá**, não de um clique.

**PS (processo seletivo).** O processo de admissão de um ano/segmento (ex.: "PS 2027"). Cada
inscrição pertence a um processo seletivo.

**Contato.** Uma pessoa registrada no RD Station, identificada pelo **e-mail**. Um mesmo
contato acumula vários eventos ao longo do tempo (agendou visita, fez login, se inscreveu,
pagou…). O RD junta tudo numa **única ficha** por e-mail — não cria uma pessoa nova a cada
ação.

**Lead.** Um contato que demonstrou **interesse** e ainda não virou aluno. No nosso caso,
todo mundo que agenda uma visita, faz login, cria conta ou começa uma inscrição é um lead.

**Lead frio × lead quente.** Uma forma de falar da **temperatura** do interesse. Um lead
**frio** apenas demonstrou curiosidade (ex.: baixou um material, mas nunca voltou). Um lead
**quente** está perto de decidir (ex.: já gerou o boleto da taxa de inscrição). Quanto mais
quente, mais perto da matrícula — e mais vale a pena investir atenção comercial nele.
⚠️ **Atenção:** no nosso caso, essa temperatura **não é ajustada automaticamente** pelo portal
(gerar ou pagar o boleto **não** muda a "chama" sozinho). O que muda sozinho é a **etapa** do
candidato no CRM. Veja o detalhe em §6.3.

**Lead qualificado.** Um lead que já deu sinais concretos de que é uma oportunidade real
(ex.: escolheu a série, iniciou a inscrição). É "mais do que curiosidade": já está
avançando no processo. No jargão de mercado às vezes se fala em **MQL** (*Marketing Qualified
Lead* — lead qualificado pelo Marketing) e **SQL** (*Sales Qualified Lead* — lead qualificado
por Vendas/Secretaria); aqui tratamos simplesmente como "lead qualificado".
⚠️ **Atenção:** o portal **não marca sozinho** um lead como qualificado. Ele registra os
eventos (área escolhida, inscrição iniciada…) e a classificação em estágios é feita pela
**configuração no RD** (pelo parceiro). Veja §6.3.

**Conversão.** A **ação** que a pessoa realiza e que o sistema registra como um marco
importante (agendar visita, escolher a série, gerar o boleto, pagar…). Cada conversão é um
"carimbo" na ficha do contato dizendo "esta pessoa chegou até aqui". Medir conversões é
medir **progresso** no funil.

**Evento.** É o nome técnico de uma conversão registrada. Neste documento, "evento" e
"conversão" são praticamente sinônimos: cada vez que alguém avança, disparamos um **evento**
para o RD.

**Funil.** A representação do **caminho** que a pessoa percorre, do primeiro interesse até a
matrícula, dividido em **etapas**. Chama-se funil porque, naturalmente, muita gente entra no
topo e só uma parte chega ao fim — o objetivo é **perder o mínimo possível** em cada etapa.

**Ciclo de vida (lifecycle).** A classificação do contato conforme ele avança no funil:
**Visitante → Lead → Lead Qualificado → Oportunidade → Cliente**. Cada marco importante
**promove** o contato para o estágio seguinte.

**Nutrição.** O trabalho de **manter o relacionamento** com o lead ao longo do tempo, com
comunicações relevantes (e-mails de boas-vindas, lembretes, convites), para que ele avance
no funil. "Nutrir um lead" = alimentar o interesse dele até a decisão.

**Automação (fluxo de automação).** No RD, uma sequência de ações **configurada uma vez e
executada sozinha** para cada contato que se encaixa numa regra (ex.: "quem gerou boleto e não
pagou em 3 dias recebe um e-mail de lembrete"). É o significado do termo — mas **no nosso caso
não usamos automações**: o parceiro **opera o RD manualmente**, com sua equipe. Por isso, ao
longo deste guia, as ações de relacionamento (lembretes, agradecimentos, classificação) são
**feitas à mão** pela equipe, apoiadas em **segmentações** (as listas prontas abaixo).

**Segmentação.** Separar os contatos em **grupos** por características em comum (ex.: "todos
que escolheram o Fundamental I", "todos que geraram boleto e não pagaram"). As automações e
os disparos de e-mail se apoiam em segmentações.

**Pipeline (funil de vendas do CRM).** O equivalente ao funil, só que dentro do **CRM** — a
ferramenta que a equipe de admissão usa para acompanhar cada caso individualmente. O pipeline
é dividido em **etapas** (colunas), e cada candidato caminha por elas.

**Negociação (deal).** O "cartão" de cada candidato **dentro do pipeline do CRM**. Ele
carrega o nome do candidato, os responsáveis, o valor, a origem e a etapa em que está. É por
ele que a secretaria acompanha e trabalha cada admissão.

**Etapa / estágio.** Cada "coluna" do funil (no Marketing) ou do pipeline (no CRM). Ex.:
*Visita agendada*, *Inscrito*, *Taxa paga*, *Pré-matrícula*, *Matriculado*.

**Campo personalizado (custom field).** Um "campo extra" que criamos no RD para guardar uma
informação específica do nosso processo que não existe por padrão (ex.: "número da
inscrição", "valor da reserva", "data da visita"). Serve para **segmentar** e para **exibir**
a informação certa nos e-mails e no CRM.

**Atribuição de origem.** Descobrir **de onde a pessoa veio** (qual campanha, anúncio, rede
social ou busca a trouxe). É o que permite responder "qual campanha gera matrícula?" — não só
cliques, mas matrículas de verdade.

**Primeiro toque × último toque.** A atribuição registra tanto **como a pessoa nos conheceu**
(primeiro toque) quanto **o que a trouxe na hora de agir** (último toque). Os dois ajudam a
entender o que funciona.

**UTM.** Sigla em inglês de *Urchin Tracking Module* (herança de uma antiga ferramenta de
análise); hoje é o **padrão de mercado** de etiquetas coladas no fim dos links das campanhas
(ex.: `?utm_source=instagram&utm_campaign=visitas_maio`). Quando a pessoa clica, essas
etiquetas dizem ao sistema exatamente de qual campanha ela veio.

**Origem / Fonte (source).** O rótulo final que resume de onde veio o contato ou a negociação
(ex.: "Portal de Inscrição", "Portal — Agendamento de visita"). Quando não há UTM nem
rastreamento, usamos uma fonte-padrão para nunca aparecer "desconhecido".

**Motivo de perda (lost reason).** Quando uma negociação **não** vira matrícula, registramos
**por quê** (ex.: "Desistiu", "Matriculou em outra escola", "Não pagou a taxa"). É o que
permite aprender com quem não fechou.

**Consentimento (opt-in / opt-out).** A permissão que a pessoa dá (ou retira) para receber
comunicações e ser rastreada por ferramentas de publicidade. *Opt-in* = aceitou; *opt-out* =
recusou/cancelou. É central para a LGPD.

**Pixel e CAPI (Meta/Facebook).** Duas formas de contar ao Meta que uma ação aconteceu (para
otimizar anúncios e medir resultado). O **Pixel** roda no navegador; a **CAPI** (*Conversions
API* — "API de Conversões") envia a informação direto dos nossos servidores — mais confiável,
pois não depende de bloqueadores de anúncio no navegador. Ambos só disparam **com
consentimento**.

**gclid.** Sigla em inglês de *Google Click Identifier* — um código que o Google Ads cola no
link quando alguém clica num anúncio. Guardá-lo permite, mais tarde, dizer ao Google "**este
clique** virou matrícula" — a chamada **conversão offline**, que ensina o Google a trazer mais
gente parecida com quem realmente matricula.

**Conversão offline.** Uma conversão que **não** acontece na hora do clique, e sim depois, no
mundo real (ex.: a matrícula é confirmada dias após o anúncio). Enviar essas conversões de
volta ao Google/Meta melhora muito a qualidade das campanhas.

**Server-side (do lado do servidor).** Quando uma ação é registrada **pelos nossos
servidores**, e não pelo navegador da pessoa. É mais confiável (bloqueadores de anúncio não
atrapalham) e mais seguro (dados sensíveis, como o e-mail, não passam pelo navegador).

**Processo automático periódico.** Ao longo do texto, sempre que dizemos que algo é feito por
um "processo automático periódico", queremos dizer: **um programa que roda sozinho no
sistema, em horários definidos** (por exemplo, todo dia às 8h e às 18h, ou de hora em hora),
sem ninguém precisar apertar um botão. É o equivalente a um "robô interno" que confere e
atualiza informações de tempos em tempos.

**Seguro para repetir (idempotente).** Uma qualidade importante desses processos automáticos:
se rodarem duas ou mais vezes, **não duplicam nem bagunçam** nada. Eles só conferem o que já
está feito e, se necessário, completam o que falta. Isso garante que nada seja registrado em
dobro (ex.: um mesmo e-mail nunca é enviado duas vezes por um erro do sistema).

**Só avança, nunca volta (forward-only).** Outra qualidade: uma negociação só é movida **para
frente** no pipeline. O sistema nunca "puxa de volta" um candidato que já avançou — evitando
que um caso mais adiantado seja rebaixado por engano.

**Carrinho abandonado.** Termo emprestado do e-commerce: alguém que **começou** uma compra
(aqui: gerou o boleto da taxa) e **não concluiu** (não pagou). É exatamente o público das
automações de recuperação.

---

## 1. A ideia em uma frase

O nosso site **é** o portal de admissão. Cada pessoa que agenda uma visita, faz login, cria
conta ou inicia uma inscrição é um **contato** que pode (ou não) concluir a inscrição, pagar
a taxa e, aprovada, efetivar a matrícula. A integração com o RD Station existe para **medir e
nutrir todo esse percurso**: não só "quem se inscreveu", mas **onde cada pessoa parou** e
**qual campanha traz matrícula**.

---

## 2. O percurso completo do candidato, passo a passo

Cada passo abaixo é um marco que o sistema **registra** (uma conversão/evento) e que, quando
faz sentido, **cria ou movimenta uma negociação** no CRM. Em cada passo indicamos: **o que a
pessoa faz**, **o que o sistema registra** e **em que estágio do ciclo de vida** o contato
fica.

### Passo 1 — Agenda uma visita
- **A pessoa faz:** marca uma visita pelo agendador do portal.
- **O sistema registra:** evento **"visita agendada"** no Marketing, com a data e o local da
  visita e a série de interesse; e cria uma **negociação de visita** no CRM (feita por um
  processo automático periódico — ver §6).
- **Também:** avisa o **Meta** (evento *Schedule*), **se houver consentimento**.
- **Ciclo de vida:** Lead (topo do funil). *Este é hoje o principal "topo de funil".*

### Passo 2 — Comparece à visita
- **A pessoa faz:** vai à escola no dia marcado. A secretaria registra a presença ("fez a
  chamada") no sistema de agendamento.
- **O sistema registra:** um processo automático periódico percebe o comparecimento, **move a
  negociação** de *Visita agendada* para *Visita realizada* no CRM **e** dispara o evento
  **"visita realizada"** no Marketing (para habilitar o e-mail de agradecimento + convite a se
  inscrever).
- **Ciclo de vida:** Lead Qualificado.

### Passo 3 — Faz login (responsável já cadastrado)
- **A pessoa faz:** um responsável que **já tem cadastro** entra no portal.
- **O sistema registra:** evento **"login do responsável"**, marcando que é um contato
  **reconhecido** (já tem relação com a escola — irmãos, ex-alunos etc.).
- **Ciclo de vida:** Lead.

### Passo 4 — Cria conta (responsável novo)
- **A pessoa faz:** um responsável **sem cadastro** cria a conta ao iniciar a primeira
  inscrição.
- **O sistema registra:** evento **"cadastro de novo responsável"**, com telefone.
- **Ciclo de vida:** Lead.

### Passo 5 — Inicia a inscrição
- **A pessoa faz:** clica em "incluir candidato" e começa o formulário de inscrição.
- **O sistema registra:** evento **"inscrição iniciada"**.
- **Ciclo de vida:** Lead Qualificado.

### Passo 6 — Escolhe a série/área
- **A pessoa faz:** seleciona a série pretendida dentro do formulário.
- **O sistema registra:** evento **"área escolhida"**, com a série. *Isso permite medir onde o
  formulário perde gente **por segmento** (ex.: mais desistências no Fundamental II do que no
  I) e nutrir os "quase-inscritos".*
- **Ciclo de vida:** Lead Qualificado.

### Passo 7 — Conclui a inscrição (boleto da taxa gerado)
- **A pessoa faz:** finaliza a inscrição; o sistema gera o **boleto da taxa** (R$ 200).
- **O sistema registra:** evento **"boleto gerado"** — o evento **mais rico** de todos (leva
  número da inscrição, valor da taxa, nome do candidato, processo seletivo, relação do
  responsável e, se houver, dados do responsável financeiro). Ao mesmo tempo, **cria a
  negociação da inscrição** no CRM (na etapa *Inscrito*), com a taxa como produto.
- **Também:** dispara a conversão **"Inscrição Concluída"** no **Google Ads**, **se houver
  consentimento**.
- **Ciclo de vida:** Oportunidade.
- **Observação importante:** se essa pessoa **já tinha uma negociação de visita**, o sistema
  **junta as duas num só cartão** (a visita "vira" a inscrição), para não ficar com duas
  negociações da mesma pessoa. Ver §5.3.

### Passo 8 — Paga a taxa de inscrição
- **A pessoa faz:** paga o boleto da taxa.
- **O sistema registra:** um processo automático periódico (2× ao dia — ver §6) confere no
  sistema oficial (RM) quem pagou, **move a negociação** para *Taxa paga* e dispara o evento
  **"pagamento confirmado"**.
- **Ciclo de vida:** Cliente. *A "verdade" de que pagou vem do sistema financeiro oficial, não
  de um clique.*

### Passo 9 — Efetiva a matrícula (aprovados) — reserva gerada
- **A pessoa faz:** o aprovado faz a matrícula on-line; o sistema gera o **boleto de reserva**
  (R$ 2.200).
- **O sistema registra:** um processo automático **move a negociação** para *Cadastro de
  matrícula*, troca o valor do cartão para a reserva e dispara o evento **"cadastro de
  matrícula"**. Também enriquece o cartão com dados de pai, mãe e responsável financeiro.
- **Ciclo de vida:** Cliente.

### Passo 10 — Paga a reserva (pré-matrícula confirmada)
- **A pessoa faz:** paga o boleto de reserva (R$ 2.200).
- **O sistema registra:** o processo automático **move a negociação** para *Pré-matrícula* e
  dispara o evento **"reserva de matrícula paga"**.
- **Ciclo de vida:** Cliente. A etapa final, *Matriculado*, é marcada **manualmente** pela
  equipe.

> **Onde as pessoas param importa tanto quanto onde chegam.** Cada passo acima é uma
> oportunidade de **recuperação**: quem gerou boleto e não pagou, quem visitou e não se
> inscreveu, quem escolheu a série e não concluiu. É para isso que registramos tudo.

---

## 3. O funil em uma tabela (resumo dos eventos)

| Momento | Evento registrado | Ciclo de vida | Principais informações enviadas |
| --- | --- | --- | --- |
| Visita marcada | visita agendada | Lead | série, data e local da visita |
| Compareceu à visita | visita realizada | Lead Qualificado | telefone, série, data e local |
| Login de responsável já cadastrado | login do responsável | Lead | marca "responsável reconhecido" |
| Novo responsável cria conta | cadastro de novo responsável | Lead | telefone |
| Começou a inscrição | inscrição iniciada | Lead Qualificado | marca "responsável reconhecido" |
| Escolheu a série | área escolhida | Lead Qualificado | série/segmento |
| Concluiu a inscrição (boleto) | boleto gerado | **Oportunidade** | nº inscrição, valor da taxa, candidato, processo, responsável(is) |
| Pagou a taxa | pagamento confirmado | **Cliente** | nº inscrição, candidato, data do pagamento |
| Matrícula (reserva gerada) | cadastro de matrícula | Cliente | nº inscrição, candidato, valor da reserva |
| Reserva paga | reserva de matrícula paga | Cliente | nº inscrição, candidato, valor e data da reserva |

> **O que ainda não capturamos: lead anônimo.** Hoje um contato só entra quando **já tem
> e-mail** (visita, login, cadastro ou inscrição). Não existe ainda um formulário de interesse
> para capturar quem só está pesquisando (o "lead frio"). Essa é a **maior oportunidade de
> ampliar o topo do funil** — ver §9 e §10.

---

## 4. As ferramentas envolvidas e o papel de cada uma

- **RD Station Marketing** *(ativo)* — guarda os **contatos** e a **linha do tempo de
  eventos** de cada um. É onde vivem as **segmentações** (listas) e de onde a equipe do parceiro
  **dispara manualmente** as comunicações de nutrição (e-mails de boas-vindas, lembretes,
  pós-visita etc.).
- **RD Station CRM** *(ativo)* — o **pipeline de admissão**, onde a equipe acompanha cada
  candidato individualmente como uma **negociação**. Recebe automaticamente as movimentações
  de etapa conforme os pagamentos acontecem.
- **Meta (Pixel + CAPI)** *(ativo)* — recebe o evento de **visita agendada** (*Schedule*),
  **sob consentimento**, para otimizar e medir campanhas no Facebook/Instagram.
- **Google Ads** *(ativo)* — recebe a conversão **"Inscrição Concluída"**, **sob
  consentimento**. Já guardamos o **gclid** (código do clique do anúncio) para, no futuro,
  enviar a **conversão offline** de matrícula.

> **Marketing e CRM conversam sozinhos.** Quando criamos uma negociação no CRM, o próprio RD
> **atualiza a ficha do contato no Marketing** (etapa, funil, valor, origem) automaticamente.
> Não precisamos duplicar esforço.

### Marketing × CRM: qual a diferença (e por que a visita aparece nos dois)

Uma dúvida comum: *"a visita é um evento de Marketing ou uma negociação de CRM?"* **As duas
coisas** — e não é repetição. É o mesmo fato visto de dois ângulos:

| | **Marketing** | **CRM** |
| --- | --- | --- |
| O que guarda | A **linha do tempo** da pessoa: o que ela fez e quando | O **cartão** (negociação) que a equipe trabalha |
| Para quê | **Medir e nutrir** — segmentar, ver de onde veio, onde parou | **Operar** — acompanhar, atribuir a alguém, dar o próximo passo |
| Como se comporta | **Acumula tudo** (todos os eventos ficam registrados) | **Consolida** (um cartão por pessoa/jornada) |

**Por que a visita também é uma negociação?** Porque marcar visita é o **começo de uma relação
comercial**: tem algo a fazer (confirmar presença, agradecer, convidar a se inscrever). Isso é
exatamente o papel de um **cartão no CRM**. Já o registro no Marketing é só a **marca de que a
visita aconteceu**, usada para medição e para as comunicações.

**Um exemplo do dia a dia:** quando quem visitou depois se inscreve, no **CRM** os dois viram
**um cartão só** (§5.3) — para a equipe não trabalhar a mesma pessoa duas vezes. No
**Marketing**, os dois registros continuam lá, porque o valor ali é enxergar o caminho inteiro
da pessoa.

> **Resumindo:** **Marketing = o que aconteceu** (para medir e nutrir). **CRM = o que há para
> trabalhar** (para a equipe operar). A visita é as duas coisas ao mesmo tempo.

---

## 5. As negociações no CRM em detalhe (para a equipe de admissão)

### 5.1 O cartão da inscrição

Quando alguém conclui a inscrição, nasce uma **negociação** no pipeline com:

- **Nome:** `Inscrição nº <n> — <nome do candidato>` (com um marcador interno para o sistema
  reencontrar o cartão com segurança).
- **Etapa inicial:** *Inscrito*.
- **Valor:** entra a **taxa de inscrição** como produto (o valor total do cartão é a soma dos
  produtos).
- **Contatos:** o responsável pela inscrição e, quando o **responsável financeiro é outra
  pessoa**, ela entra como **2º contato** do cartão.
- **Fonte (origem):** por padrão, "Portal de Inscrição" (ou a campanha real, quando há UTM).

### 5.2 Os campos personalizados da negociação (informações extras no cartão)

Além do básico, cada negociação carrega **campos extras** para a equipe ter contexto e para
gerar relatórios. Os campos usados hoje:

| Campo no cartão | Preenchido quando |
| --- | --- |
| Relação do responsável (pai/mãe/outro) | ao concluir a inscrição |
| Responsável financeiro é outra pessoa? (sim/não) | ao concluir a inscrição |
| Nome do responsável financeiro | quando for outra pessoa |
| Processo seletivo (nome do PS) | ao concluir a inscrição |
| Série/segmento | ao concluir a inscrição (e também na visita) |
| Dados do Pai (nome · CPF · e-mail · telefone) | na fase de matrícula |
| Dados da Mãe | na fase de matrícula |
| Dados do Responsável financeiro | na fase de matrícula |
| Data do cadastro de matrícula | na fase de matrícula |
| Data do pagamento da reserva | na fase de matrícula |
| Dados da visita (data, tipo, situação, operador, participantes, local, origem) | no cartão de visita |

> **Por que os dados de pai/mãe entram como "campo" na fase de matrícula, e não como
> contatos?** É uma limitação da ferramenta: contatos só podem ser adicionados **na criação**
> do cartão. Como esses dados chegam depois (na matrícula), eles entram como **campos de
> texto** do cartão — assim a informação não se perde.

### 5.3 "Cartão único": visita e inscrição juntas

Se uma pessoa **agendou visita** e depois **se inscreveu**, o sistema reaproveita o **cartão
da visita** e o transforma no cartão da inscrição, em vez de criar um segundo. Assim a
jornada **visita → inscrição vira um único cartão** no pipeline — evitando cartões duplicados
da mesma pessoa (um problema clássico de organização de CRM).

### 5.4 As etapas do pipeline de admissão

```
Sem contato → Visita agendada → Visita realizada → Inscrito → Taxa paga →
Prova/Entrevista → Cadastro de matrícula → Pré-matrícula → Matriculado
```

*Cadastro de matrícula* = matrícula efetivada + boleto de reserva gerado.
*Pré-matrícula* = reserva de **R$ 2.200** paga.
O 1º ano do Fundamental **não passa** por *Prova/Entrevista* — como as etapas avançam pelo
pagamento, esse "pulo" acontece naturalmente.

---

## 6. O que o sistema faz sozinho — e o que a equipe faz à mão no RD

A maior parte das movimentações de etapa **não depende de ninguém apertar um botão**. Três
**processos automáticos periódicos** cuidam disso — todos **seguros para repetir** e que **só
avançam** as negociações:

1. **Confere pagamentos da taxa** — roda **todo dia às 8h e às 18h**. Pergunta ao sistema
   oficial (RM) quem pagou a taxa, move as negociações para *Taxa paga* e dispara o evento
   "pagamento confirmado".
2. **Confere matrículas/reservas** — roda **de hora em hora** (e também é **acionado na hora**
   em que alguém efetiva a matrícula, para não esperar). Move para *Cadastro de matrícula* ou
   *Pré-matrícula* conforme a reserva foi gerada ou paga, ajusta o valor e preenche os campos
   de pai/mãe/responsável.
3. **Sincroniza visitas** — mantém os cartões de visita em dia, cria os novos, e **avança
   *Visita agendada → Visita realizada*** quando a secretaria registra o comparecimento —
   disparando também o evento "visita realizada" no Marketing.

> **Por que "server-side" e não pelo navegador?** Porque assim os registros são mais
> confiáveis (bloqueadores de anúncio não atrapalham) e podemos usar dados que o navegador não
> deve ver (como o e-mail do responsável). As únicas exceções são o **Meta** e o **Google
> Ads**, que rodam no navegador **e só com consentimento**.

> **Nada disso trava o candidato.** Se, por algum motivo, o RD estiver fora do ar, o candidato
> **continua** conseguindo se inscrever, pagar e matricular normalmente. A comunicação com o
> RD é "não-bloqueante": no máximo, um registro de marketing fica para depois. E, para os
> eventos de Marketing, o sistema ainda **tenta reenviar automaticamente** algumas vezes se a
> primeira tentativa falhar por instabilidade de rede.

### 6.1 O que o sistema controla automaticamente — ⚠️ não altere à mão no RD

Os itens abaixo são **definidos e atualizados pelo nosso sistema** (via API). Se alguém
editá-los à mão no RD, o próximo processo automático pode **sobrescrever** a alteração, ou a
consistência do funil se quebra. **Deixe o sistema cuidar destes:**

- **A etapa do candidato no pipeline do CRM** nas fases automáticas: *Inscrito → Taxa paga →
  Cadastro de matrícula → Pré-matrícula* e *Visita agendada → Visita realizada*. **Não arraste
  o cartão à mão** para essas colunas — o sistema faz isso com base no pagamento real. *(A
  única etapa que **é** manual é a final, `Matriculado` — ver 6.2.)*
- **O valor e os produtos** do cartão (taxa de inscrição / reserva de R$ 2.200).
- **A origem/fonte** do contato e do cartão — **preenchida via API** (ver §7).
- **Os campos preenchidos pela automação** (número da inscrição, datas, dados de pai/mãe/
  responsável, dados da visita).
- **Os campos "espelho" do funil na ficha do contato** (etapa, funil, valor, origem) — o RD os
  preenche sozinho a partir do cartão.
- **O disparo do evento de cada marco** (visita, boleto, pagamento…).

### 6.2 O que a equipe e o parceiro fazem manualmente no RD

Estes itens **não** são tocados pelo sistema — é aqui que a operação humana atua:

- **Marcar a etapa final `Matriculado`** (não é automatizada).
- **A temperatura do lead** (as "chamas" de quente/morno/frio no cartão do CRM) — ver 6.3.
- **O motivo de perda** quando um caso não fecha (Desistiu, Matriculou em outra escola, Não
  pagou a taxa…).
- **Qualificação do lead** (marcar se está qualificado ou não) — a equipe classifica à mão
  seguindo regras objetivas (ver §6.4).
- **Anotações, tarefas, ligações e e-mails manuais** ao candidato.
- **As comunicações de nutrição** (boas-vindas, recuperação de boleto, pós-visita) — a equipe
  do parceiro **dispara os e-mails/contatos manualmente** a partir das segmentações (ver §11).
- **Segmentações e relatórios.**

### 6.3 Temperatura e qualificação — o que o sistema faz (e o que não faz)

Duas dúvidas comuns, respondidas de forma direta:

- **"Quando o boleto é gerado ou pago, o lead vira 'quente' automaticamente?"** — **Não.** A
  temperatura (as chamas do CRM) **não** é ajustada pelo nosso sistema; hoje ela fica **em
  branco/manual**. O que muda sozinho é a **etapa** do candidato — que já indica o avanço
  (quem está em *Taxa paga* está claramente mais "quente" que quem está em *Inscrito*). A
  orientação, portanto, é que a **equipe** defina a temperatura **à mão**, seguindo regras
  objetivas simples (ver §6.4) — o portal não faz isso e o parceiro opera o RD manualmente.
- **"O sistema classifica o lead como qualificado?"** — **Não decide isso sozinho.** Ele
  **registra os eventos** (área escolhida, inscrição iniciada, boleto…) e marca se o
  responsável é **reconhecido** (já tem relação com a escola) ou **novo**. Transformar isso em
  "Lead Qualificado" é **leitura comercial**: a **equipe** do parceiro classifica o contato
  **à mão**, apoiada nos eventos e na etapa que o sistema já registra (ver §6.4).

> **Em resumo:** o sistema cuida do **"onde a pessoa está"** (a etapa, pelo fato real do
> pagamento); a **leitura comercial** disso (temperatura, qualificação, motivo de perda) é
> **trabalho humano/configuração no RD**. Misturar os dois — mexer à mão no que é automático —
> é o que causa confusão no pipeline.

### 6.4 Recomendação: padronizar a classificação de leads (temperatura + qualificação)

A temperatura e a qualificação são **manuais** (§6.3) e o parceiro **opera o RD à mão** (sem
construir automações). A recomendação, portanto, **não** é montar um robô — é dar à equipe
**regras objetivas e simples**, para que todos classifiquem do mesmo jeito. O sistema já
entrega o dado objetivo (a **etapa**, pelo pagamento real); a equipe só precisa **ler e
registrar** de forma padronizada.

**1. Qualificação — uma regra por etapa.** Como o candidato já avança de etapa sozinho (pelo
evento/pagamento), ao trabalhar a lista a equipe classifica o contato seguindo esta tabela:

| Etapa em que o candidato está | Classificação a registrar |
| --- | --- |
| visita agendada · login · cadastro | Lead |
| visita realizada · inscrição iniciada · série escolhida | Lead Qualificado |
| **boleto gerado** (inscrição concluída) | Oportunidade — a secretaria deve agir |
| **taxa paga** | Cliente |

**2. Temperatura — tabela de referência + bom senso.** Ao abrir o cartão, a equipe define as
"chamas" partindo de um piso simples pela etapa e ajusta conforme o contexto (uma conversa,
hesitação da família, um irmão já matriculado):

| Etapa atual | Temperatura de partida |
| --- | --- |
| Inscrito (boleto gerado) · Visita realizada | morno |
| **Taxa paga** e etapas seguintes | quente |
| Apenas visita agendada / cadastro, sem avanço | frio/morno |

**3. Priorização do dia.** Em vez de pontuação automática, a equipe usa as **segmentações**
prontas (ex.: "Taxa paga", "boleto gerado e não pago") para decidir a **ordem de contato** —
atacando primeiro quem está mais fundo no funil.

**O que continua sendo julgamento humano:** desqualificar e registrar o **motivo de perda** de
um lead que a equipe descobriu estar perdido (mudou de cidade, escolheu outra escola), o
**ajuste fino** da temperatura e os follow-ups. Em uma frase: **o sistema cuida do objetivo; a
pessoa cuida do julgamento.**

**Cuidados:**

- Faça a classificação virar **rotina** (ex.: revisar a lista 1×/dia), para os cartões não
  ficarem desatualizados.
- A confirmação de pagamento tem **defasagem de até ~12h** (o sistema confere 2× ao dia): um
  lead que acabou de pagar pode aparecer ainda como "Inscrito" por algumas horas.
- **Regras simples.** Uma tabela que todos seguem vale mais que um critério complexo.
- A **temperatura deve somar** prioridade *dentro* da etapa, não repetir a etapa.

> **Por que padronizar, e não automatizar?** Porque o parceiro opera o RD manualmente. Uma
> tabela objetiva de referência garante **consistência entre operadores** sem depender de
> nenhuma automação — e preserva o julgamento humano onde ele importa.

---

## 7. Como sabemos de onde veio cada matrícula (atribuição)

- Quando a pessoa chega pela primeira vez, um **rastreador do RD** registra **como ela nos
  conheceu** e **o que a trouxe** (primeiro e último toque) — **sob consentimento**.
- As **UTMs** dos links das campanhas reforçam essa informação.
- Também guardamos o **gclid** (código do clique do Google Ads), preparando o terreno para,
  no futuro, dizer ao Google **quais cliques viraram matrícula** (conversão offline).
- Quando não há nenhuma origem identificável, usamos uma **fonte-padrão** ("Portal de
  Inscrição") para o relatório nunca mostrar "desconhecido".

> **Tudo isso é enviado via API** (automaticamente pelo sistema), tanto para o contato no
> Marketing quanto para o cartão no CRM. **Por isso, o campo de origem/fonte não deve ser
> editado à mão no RD:** ele já vem preenchido, e uma edição manual pode conflitar com a
> atribuição real da campanha.

> **O ganho:** poder responder **"qual campanha gera matrícula"** — e não apenas qual gera
> clique. É isso que permite investir melhor a verba de mídia.

---

## 8. Consentimento e LGPD (em linguagem simples)

- **O token de acesso ao RD nunca vai para o navegador** da pessoa — fica só nos nossos
  servidores.
- **O e-mail completo nunca é exposto** ao navegador antes do login (mostramos mascarado, ex.:
  `j***@gmail.com`).
- **Meta e Google Ads só disparam com consentimento** de marketing.
- **Exceção a alinhar:** o evento de **visita** é enviado ao RD **independentemente** do
  consentimento de marketing (base de relacionamento/execução). É defensável, mas é uma
  **decisão a registrar** com o parceiro e o responsável por LGPD (DPO), e a refletir na
  política de privacidade.

---

## 9. O que já funciona × o que ainda falta

**✅ Já funciona hoje**

- Contato único por e-mail, com linha do tempo completa de eventos.
- 8 eventos de funil ativos (da visita à reserva paga), incluindo os recém-implementados
  **"área escolhida"** (abandono por segmento) e **"visita realizada"** (nutrição pós-visita).
- CRM com pipeline completo, movido automaticamente pelos pagamentos reais.
- **Cartão único** (visita + inscrição), evitando duplicidade.
- **Reenvio automático** dos eventos de Marketing em caso de falha temporária de rede.
- Meta e Google Ads sob consentimento, com atribuição de origem.

**🔜 Ainda falta / oportunidades**

- **Topo de funil anônimo:** um formulário/landing page de interesse para capturar quem só
  está pesquisando (lead frio), antes de ter e-mail no sistema. *(Maior oportunidade de
  captação.)*
- **Recuperação de boleto:** o dado já existe; falta a equipe do parceiro **trabalhar essa
  lista periodicamente** (ver §11). *(Ganho rápido de receita, sem depender de programação.)*
- **Contato pós-visita:** agora que "visita realizada" chega ao Marketing, falta a equipe do
  parceiro **enviar** o e-mail/contato de agradecimento + convite a se inscrever para quem
  compareceu.
- **Trabalhar os "quase-inscritos":** agora que "área escolhida" é registrada, falta a equipe
  **segmentar e contatar** quem escolheu a série e não concluiu.
- **Governança de dados:** padronizar nomes de campanhas, UTMs, origens, motivos de perda e o
  **tipo dos campos de valor** (deixar "valor da taxa"/"valor da reserva" como número/moeda,
  para relatórios limpos).
- **Conversão offline no Google (matrícula):** usar o gclid já capturado para enviar as
  matrículas de volta ao Google Ads.
- **Passo 2 (evolução técnica):** eventos de e-commerce nativos do RD ("carrinho abandonado"
  oficial, relatórios de receita) — quando o parceiro quiser atribuição de receita mais fina.

---

## 10. O que precisamos decidir com o parceiro

1. **Rotinas de nutrição/contato** — prioridade na **recuperação de boleto** (§11); em seguida,
   pós-visita e "quase-inscritos". Definir conteúdos, cadência e **quem** faz o disparo manual.
2. **Padronização da classificação de leads** — adotar a tabela de referência da §6.4
   (temperatura e qualificação registradas **à mão** pela equipe)? Definir a **rotina de
   revisão** da lista.
3. **Governança de dados** — vocabulário de estágios, padronização de origens e UTMs, motivos
   de perda e tipos dos campos.
4. **Topo de funil** — usamos um formulário/landing page **nativo do RD** (feito pelo
   parceiro) ou construímos a captura no próprio portal?
5. **Divisão de responsabilidades** — o que fica com a escola (conteúdo, regras) e o que fica
   com a agência (campanhas, automações, relatórios).
6. **LGPD** — textos de consentimento, prazos de retenção e base legal de cada etapa (em
   especial o evento de visita).

---

## 11. Rotina pronta: recuperação de boleto (feita à mão pela equipe)

> **Objetivo:** contatar quem **gerou a taxa de inscrição e não pagou**. Todo o dado necessário
> **já chega ao RD** — não é preciso mudança no sistema. Como o parceiro **opera o RD
> manualmente**, a recuperação é uma **rotina da equipe** (não uma automação): a lista já vem
> pronta; basta trabalhá-la periodicamente.

**A lista de quem contatar (segmentação salva no RD):**
- **gerou** a taxa (evento "boleto gerado"),
- **e ainda não** registrou o "pagamento confirmado",
- **e** já se passaram **2 a 3 dias** desde a geração do boleto.

**Rotina sugerida (manual, ex.: 1×/dia):**
1. Abrir a **segmentação** "gerou boleto e não pagou há 2+ dias".
2. Para cada contato, **conferir** se já pagou (evento "pagamento confirmado"). Se pagou,
   **pular** (não incomodar).
3. Para os que não pagaram, **enviar** o lembrete — "sua taxa de inscrição está aguardando
   pagamento" (nome do candidato e processo já vêm nos campos do contato; incluir instruções e
   2ª via do boleto). Pode ser **e-mail** (disparo manual a essa segmentação), **WhatsApp** ou
   **ligação** da secretaria.
4. **(Opcional) 2º lembrete:** após mais alguns dias, repetir para quem ainda não pagou (última
   chamada) e/ou escalar para a secretaria.

**Cuidados importantes:**
- **Espere pelo menos 1 dia.** A confirmação de pagamento é conferida por um processo
  automático **2× ao dia** (não é instantânea). Contatar cedo demais (poucas horas) enviaria
  um **falso lembrete** a quem já pagou, mas ainda não foi conferido.
- **Confira antes de enviar.** Como o disparo é manual, sempre verifique o status atual do
  contato para não cobrar quem já pagou.
- **No máximo 2 lembretes**, respeitando o descadastro (opt-out) e os horários de envio.

---

> **Próximo passo sugerido:** validar este guia com o parceiro, **iniciar a rotina de
> recuperação de boleto** (ganho rápido) e fechar o **plano de governança** (origens, UTMs,
> campos, motivos de perda) antes do pico do processo seletivo 2027.
