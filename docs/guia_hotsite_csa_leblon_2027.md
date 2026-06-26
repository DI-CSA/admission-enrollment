# Guia do hot site de Inscrições 2027 — Colégio Santo Agostinho · Leblon

> Versão personalizada do guia genérico [`guia_hotsite_html_com_ia.md`](guia_hotsite_html_com_ia.md),
> adaptada ao contexto real do **Processo de Admissão de Novos Alunos 2027** do
> **Colégio Santo Agostinho — Unidade Leblon (CSA Leblon)**.
>
> Use este documento como briefing mestre ao conduzir a IA (direção de arte,
> UI/UX, redação e front-end) na construção do hot site.

---

## 1. Contexto e objetivo

O CSA Leblon abrirá em 2026 as inscrições para **novos alunos do ano letivo de
2027**. O hot site é a **porta de entrada de captação**: uma landing page elegante,
acolhedora e alinhada à marca, cuja função é **apresentar os processos seletivos,
capturar o lead da família e encaminhar o responsável para a inscrição oficial no
portal TOTVS RM** (Portal do Processo Seletivo / EduPS).

Diferença essencial em relação ao guia genérico: **não existe um único processo**.
Há **dois processos seletivos distintos, cada um com seu próprio edital**:

| # | Processo seletivo | Segmentos abrangidos | Edital |
|---|-------------------|----------------------|--------|
| 1 | **1º Ano do Ensino Fundamental** (Anos Iniciais) | Entrada na alfabetização | Edital próprio |
| 2 | **2º Ano do Fundamental até a 2ª Série do Ensino Médio** | Demais séries com vagas | Edital próprio |

> A 3ª série do Ensino Médio normalmente não recebe novos alunos (turma de
> conclusão); confirmar disponibilidade de vagas com a Secretaria antes de publicar.

O hot site precisa, portanto, oferecer **uma bifurcação clara** logo no início:
o responsável escolhe o segmento do candidato e é direcionado para o **edital
correto** e para a **inscrição correta** no portal.

### Integração com o sistema oficial (TOTVS RM)

A inscrição em si **não acontece no hot site** — ela ocorre no Portal do Processo
Seletivo já existente. O hot site apenas conduz para os links oficiais, no padrão:

```text
https://portal.csa.com.br/FrameHTML/web/app/Edu/PortalProcessoSeletivo/?c={coligada}&f={filial}&ps={idProcessoSeletivo}#/eb/informacoes
```

Referência observada no processo de 2026 (2º semestre):

- 1º Ano do Fundamental → `...?c=1&f=1&ps=147#/eb/informacoes`
- 2º Ano à 2ª Série → processo análogo com outro `ps`.

> **Atenção:** os valores de `ps=` (e eventualmente `c`/`f`) **mudam a cada
> processo**. Para 2027, obtenha os novos IDs com quem configura o RM e
> centralize-os em um único ponto do código (ver §6, objeto `PROCESSOS`), para
> nunca precisar caçar links espalhados pelo HTML.

### Captura de leads (RD Station)

Antes (ou no momento) de encaminhar para o portal, o hot site deve **capturar o
lead** (nome do responsável, e-mail, telefone, segmento de interesse) e enviá-lo
ao **RD Station**, permitindo nutrição e acompanhamento comercial mesmo que a
família não conclua a inscrição. Ver §8.

---

## 2. Princípio central: primeiro design, depois código

Mantém-se o princípio do guia genérico: **não comece pelo HTML**. Primeiro defina
direção visual, hierarquia, ritmo e a bifurcação dos dois processos; só depois gere
o código.

A "ação principal" deste hot site é única e inequívoca:

> **Iniciar a inscrição do candidato** (no segmento correto) — tudo na página
> deve conduzir a esse clique.

Ações secundárias permitidas (sem competir com a principal): baixar o edital,
falar com a Secretaria no WhatsApp, fazer o Tour Virtual 360º.

---

## 3. Material organizado para o briefing da IA

```text
Objetivo do hot site:
  Apresentar a Admissão de Novos Alunos 2027 do CSA Leblon e direcionar o
  responsável ao processo seletivo correto (um de dois), capturando o lead.

Público-alvo:
  Pais e responsáveis (decisores), classe A/B, moradores do Leblon e bairros
  vizinhos da Zona Sul do Rio. Famílias que valorizam formação acadêmica de
  excelência aliada a valores cristãos (Carisma Agostiniano Recoleto).

Ação principal desejada:
  Clicar em "Inscrever" no segmento do candidato → portal TOTVS.

Ações secundárias:
  Baixar edital; falar com a Secretaria (WhatsApp/telefone); Tour Virtual 360º.

Tom visual:
  Institucional, elegante, acolhedor, sóbrio e contemporâneo. Tradição +
  excelência. Nada infantilizado nem agressivamente promocional.

Texto principal:
  "Admissão de Novos Alunos 2027 — Faça parte da nossa Comunidade Educativa."

Textos secundários:
  Os dois segmentos, diferenciais, valores, depoimentos, infraestrutura.

Imagens disponíveis:
  (preencher com fotos oficiais do colégio — ver §7)

Logo:
  Logotipo oficial CSA Leblon (versões clara e escura).

Cores institucionais:
  (ver §4 — paleta a confirmar no manual da marca)

Referências visuais desejadas:
  www.csa.com.br (site institucional vigente), colégios premium de tradição.

Restrições visuais ou institucionais:
  Respeitar o manual da marca; identidade católica/agostiniana; LGPD (banner de
  cookies, já usam AdOpt); acessibilidade.

Formato de entrega desejado:
  Landing page estática (HTML + CSS + JS puro), responsiva, hospedagem estática.
```

---

## 4. Etapa 1 — Direção visual (já parametrizada para o CSA)

### 4.1. Conceito

Tradição agostiniana + excelência acadêmica + leveza carioca do Leblon. A página
deve transmitir **confiança, pertencimento e cuidado** — o lema "amor e ciência:
educar a mente e o coração". Evitar excesso de elementos; preferir respiro,
fotografia de qualidade e tipografia bem hierarquizada.

Frase-âncora da marca (uso opcional como mote inspiracional):

> "Nunca o prazer em aprender deveria ser inteiramente abandonado." — Santo Agostinho

### 4.2. Paleta de cores

> **Confirmar os valores HEX exatos no manual da marca do CSA Leblon.** Abaixo,
> uma paleta de partida coerente com a identidade institucional (azul
> predominante, sóbrio e tradicional), pronta para ser ajustada.

```css
:root {
  /* Cores institucionais (CONFIRMAR no manual da marca) */
  --csa-azul:        #002b5c; /* azul-marinho institucional — base */
  --csa-azul-claro:  #1f4e8c; /* variação para realces e links */
  --csa-dourado:     #c9a227; /* acento nobre (tradição/excelência) */
  --csa-vermelho:    #9b1c2e; /* acento litúrgico, usar com parcimônia */

  /* Neutros */
  --branco:          #ffffff;
  --areia:           #f5f2ec; /* fundo de seção alternado, acolhedor */
  --cinza-texto:     #2b2b2b;
  --cinza-suave:     #6b6b6b;

  /* Semânticos da UI */
  --cor-cta:         var(--csa-dourado);
  --cor-cta-hover:   #b8911f;
  --cor-link:        var(--csa-azul-claro);
}
```

Diretrizes de uso:

- **Azul-marinho** domina cabeçalho, rodapé e títulos — transmite seriedade.
- **Dourado** é a cor do CTA principal ("Inscrever"); usar com moderação para que
  se destaque de fato.
- **Vermelho litúrgico** apenas em pequenos detalhes (não em botões de ação).
- **Areia/branco** alternando fundos de seção, garantindo respiro e leitura.

### 4.3. Tipografia

- **Títulos:** uma serifada elegante (ex.: *Playfair Display*, *Lora* ou
  *Cormorant*) para evocar tradição e prestígio.
- **Texto/UI:** uma sem-serifa neutra e legível (ex.: *Inter*, *Source Sans 3* ou
  *Work Sans*).
- Carregar via Google Fonts apenas os pesos necessários (ex.: 400/600/700) para
  não pesar o carregamento.

### 4.4. Hierarquia e ritmo

1. **Hero** institucional forte com a chamada da Admissão 2027 e CTA.
2. **Seletor dos dois processos** (núcleo da página — ver §5).
3. Diferenciais → valores → infraestrutura/Tour → depoimentos → FAQ → CTA final.
4. Rodapé institucional com contatos reais e redes.

Imagens com **função narrativa** (alunos, ambiente, capela, biblioteca), nunca
meramente decorativas. Espaçamento generoso. Mobile pensado desde o início.

---

## 5. Etapa 2 — Wireframe textual (com a bifurcação dos dois processos)

```text
1. Topo / Navegação
   - Logo CSA Leblon (esquerda).
   - Menu curto: Segmentos · Diferenciais · Tour · Dúvidas · [Inscreva-se].
   - Em mobile: logo + botão "Inscreva-se" sempre visível (sticky).

2. Hero
   - Imagem de impacto (alunos/fachada/capela) como fundo com leve overlay azul.
   - Título: "Admissão de Novos Alunos 2027".
   - Subtítulo: "Faça parte da nossa Comunidade Educativa no Leblon."
   - Dois botões: [Inscrever — 1º Ano do Fundamental] e
     [Inscrever — 2º Ano à 2ª Série do Médio]  (ou um único "Inscreva-se" que
     rola até o seletor da seção 3).
   - Selo discreto: "Tradição agostiniana · Excelência acadêmica".

3. Escolha seu processo  ← SEÇÃO-CHAVE
   - Texto curto: "Clique no segmento do(a) candidato(a) e siga as orientações."
   - DOIS CARDS lado a lado (empilham no mobile):

     Card A — 1º Ano do Ensino Fundamental
       · Selo: "Anos Iniciais · Alfabetização"
       · Breve descrição da etapa (entrada no Fundamental).
       · [Baixar edital]  [Inscrever →]  (Inscrever = CTA dourado)

     Card B — 2º Ano do Fundamental à 2ª Série do Ensino Médio
       · Selo: "Anos Iniciais · Finais · Ensino Médio"
       · Breve descrição (demais séries, conforme vagas).
       · [Baixar edital]  [Inscrever →]

   - Nota de rodapé do bloco: "Vagas sujeitas à disponibilidade por série."

4. Por que o CSA Leblon (diferenciais)
   - Grade de cards curtos: Formação em valores (Carisma Agostiniano);
     Excelência acadêmica; Educação Bilíngue; Educação Socioemocional;
     Certificações Internacionais; Estudos no exterior.

5. Nossa proposta educativa / Pastoral
   - Bloco textual + imagem: "amor e ciência — educar a mente e o coração".
   - Reforço dos valores cristãos e do acompanhamento das famílias.

6. Infraestrutura + Tour Virtual 360º
   - Imagens do ambiente (biblioteca, quadras, capela).
   - CTA secundário: [Fazer o Tour Virtual 360º].

7. Depoimentos (prova social)
   - 2 a 3 citações de famílias/ex-alunos, com foto e nome.

8. Como funciona a inscrição (passo a passo)
   - 4 passos: 1) Escolha o segmento · 2) Leia o edital · 3) Cadastre-se no portal
     · 4) Acompanhe as etapas. Reforça que a inscrição é feita no portal oficial.

9. Perguntas frequentes (FAQ — acordeão)
   - Quem pode se inscrever em cada processo? Documentos? Prazos? Há taxa?
     Como emitir o boleto? Contato da Secretaria?

10. Chamada final (CTA)
    - Fundo azul, frase de fechamento + os dois botões de inscrição novamente.
    - "Dúvidas? Fale com a Secretaria" (WhatsApp/telefone).

11. Rodapé institucional
    - Endereços reais, telefone, e-mails, redes sociais, links úteis,
      banner/política de cookies (LGPD), copyright.
```

### Observações de layout

- **Desktop:** dois cards do seletor lado a lado; hero com texto à esquerda e
  imagem dominante.
- **Mobile:** cards empilhados; botão "Inscreva-se" sticky; hero com título curto
  e CTA logo na primeira dobra; imagens leves.

---

## 6. Etapa 3 — Montagem em HTML/CSS/JS

Estrutura de arquivos sugerida:

```text
/hotsite-csa-2027
  index.html
  style.css
  script.js
  /assets
    logo-csa-leblon.svg
    logo-csa-leblon-branco.svg
    hero.jpg
    fundamental.jpg
    medio.jpg
    capela.jpg
    biblioteca.jpg
    edital-1ano-fundamental.pdf
    edital-2ano-a-2serie.pdf
```

**Centralize os links dos processos** num único objeto de configuração no
`script.js`, para facilitar a atualização anual (apenas troque os `ps`):

```js
// Configuração dos dois processos seletivos 2027 (CONFIRMAR ps com o RM)
const PORTAL_BASE =
  'https://portal.csa.com.br/FrameHTML/web/app/Edu/PortalProcessoSeletivo/';

const PROCESSOS = {
  fundamental1: {
    rotulo: '1º Ano do Ensino Fundamental',
    coligada: 1,
    filial: 1,
    ps: 0,                       // ← preencher com o ID do PS de 2027
    edital: 'assets/edital-1ano-fundamental.pdf'
  },
  demais: {
    rotulo: '2º Ano do Fundamental à 2ª Série do Médio',
    coligada: 1,
    filial: 1,
    ps: 0,                       // ← preencher com o ID do PS de 2027
    edital: 'assets/edital-2ano-a-2serie.pdf'
  }
};

function urlInscricao(chave) {
  const p = PROCESSOS[chave];
  return `${PORTAL_BASE}?c=${p.coligada}&f=${p.filial}&ps=${p.ps}#/eb/informacoes`;
}
```

Requisitos do código (iguais ao guia genérico, reforçados para este contexto):

- HTML semântico e acessível (landmarks, `alt` descritivo, contraste AA);
- CSS com variáveis (as cores da §4.2);
- responsivo, ótima leitura em celular;
- os **dois CTAs de inscrição** sempre visualmente dominantes;
- imagens otimizadas (WebP quando possível);
- JavaScript mínimo: menu mobile, acordeão do FAQ, rolagem suave, disparo do lead
  ao RD Station e redirecionamento ao portal;
- compatível com hospedagem estática;
- banner de cookies / aviso LGPD.

---

## 7. Imagens recomendadas (função narrativa)

| Arquivo | Uso | Função |
|---------|-----|--------|
| `hero.jpg` | Fundo do hero | Impacto, pertencimento (alunos/fachada/Leblon) |
| `fundamental.jpg` | Card 1º Ano | Acolhimento da alfabetização |
| `medio.jpg` | Card 2º Ano–2ª Série | Jovens, excelência acadêmica |
| `capela.jpg` | Seção Pastoral | Identidade agostiniana / valores |
| `biblioteca.jpg` | Infraestrutura | Credibilidade, ambiente de estudo |
| Foto de família/aluno | Depoimentos | Prova social, emoção |

Use fotografia oficial e autorizada (direito de imagem dos menores — atenção à
política de Prevenção e Proteção de Menores do colégio).

---

## 8. Captura de leads — RD Station

Antes de redirecionar ao portal, capture o lead em um formulário curto
(nome do responsável, e-mail, telefone, segmento de interesse) e envie ao RD
Station. Duas abordagens:

1. **Formulário embutido do RD Station** (mais simples): cole o snippet de
   formulário gerado no painel do RD e configure o campo "segmento" para
   identificar de qual processo o lead se interessou.
2. **API de Conversões do RD Station** (mais controle): envie via `fetch` no
   `script.js` para o endpoint de conversão, com o `token` público do RD, e só
   então redirecione ao portal.

Esboço (conceitual — ajustar token/identificador conforme a conta RD):

```js
async function capturarLead(dados, chaveProcesso) {
  try {
    await fetch('https://api.rd.services/platform/conversions?api_key=SEU_TOKEN_PUBLICO', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'CONVERSION',
        event_family: 'CDP',
        payload: {
          conversion_identifier: 'inscricao-2027-' + chaveProcesso,
          name: dados.nome,
          email: dados.email,
          mobile_phone: dados.telefone,
          cf_segmento_interesse: PROCESSOS[chaveProcesso].rotulo
        }
      })
    });
  } catch (e) {
    // Nunca bloquear a inscrição por falha no marketing: apenas registrar.
    console.warn('Falha ao enviar lead ao RD Station', e);
  } finally {
    window.location.href = urlInscricao(chaveProcesso); // segue para o portal
  }
}
```

> **LGPD:** inclua consentimento explícito (checkbox) para contato de marketing,
> link para a Política de Privacidade e respeite o banner de cookies (o colégio já
> utiliza AdOpt). Não dispare o lead sem consentimento.

---

## 9. Etapa 4 — Revisão do resultado

Além da checklist genérica (responsividade, acessibilidade, contraste, SEO,
performance), valide pontos específicos deste hot site:

- A bifurcação dos **dois processos** está inequívoca? Um responsável distraído
  consegue escolher o segmento certo sem erro?
- Os links de inscrição apontam para os **`ps` corretos de 2027**?
- Cada card leva ao **edital correspondente**?
- O **lead é enviado ao RD Station** com o segmento certo antes do redirecionamento?
- Há **consentimento LGPD** antes de capturar dados?
- Os **contatos da Secretaria** estão corretos (ver §11)?
- O fluxo funciona em **celular** (maioria dos acessos)?

---

## 10. Prompt mestre pronto para a IA

```text
Você atuará como diretor de arte, designer UI/UX, redator de landing pages e
desenvolvedor front-end.

Vou criar um hot site estático (HTML, CSS e JavaScript puro) para o Processo de
Admissão de Novos Alunos 2027 do Colégio Santo Agostinho — Unidade Leblon
(CSA Leblon), no Rio de Janeiro. O texto, as imagens e a hospedagem já estão
resolvidos. Preciso de direção visual, organização da página e código final.

CONTEXTO IMPORTANTE:
- Há DOIS processos seletivos distintos, cada um com seu edital:
  (1) 1º Ano do Ensino Fundamental;
  (2) 2º Ano do Fundamental até a 2ª Série do Ensino Médio.
- A inscrição é feita em um portal externo (TOTVS RM). O hot site apenas
  apresenta os processos, captura o lead (RD Station) e redireciona ao portal
  correto, no padrão:
  https://portal.csa.com.br/FrameHTML/web/app/Edu/PortalProcessoSeletivo/?c=1&f=1&ps={ID}#/eb/informacoes
  (centralize os IDs num objeto de config no script.js).

Objetivo: apresentar a Admissão 2027 e direcionar o responsável ao processo certo.
Público-alvo: pais e responsáveis da Zona Sul do Rio que valorizam excelência
acadêmica e formação em valores cristãos (Carisma Agostiniano Recoleto).
Ação principal: clicar em "Inscrever" no segmento do candidato.
Ações secundárias: baixar edital, Tour Virtual 360º, falar com a Secretaria.

Tom: institucional, elegante, acolhedor, sóbrio e contemporâneo (tradição +
excelência). Mote opcional: "Nunca o prazer em aprender deveria ser inteiramente
abandonado." (Santo Agostinho).

Identidade visual (confirmar HEX no manual da marca):
- Azul-marinho institucional #002b5c (base), azul claro #1f4e8c (realces),
  dourado #c9a227 (CTA), vermelho litúrgico #9b1c2e (detalhes), areia #f5f2ec.
- Títulos com serifada elegante (Playfair Display/Lora); texto em sem-serifa
  legível (Inter/Source Sans 3), via Google Fonts.

Estrutura da página (landing de uma página):
hero → SELETOR DOS DOIS PROCESSOS (dois cards: edital + inscrever) →
diferenciais → proposta educativa/pastoral → infraestrutura + Tour 360º →
depoimentos → passo a passo da inscrição → FAQ (acordeão) → CTA final → rodapé
institucional com endereços, telefone (21) 3206-7850, e-mails csa@csa.com.br e
secretaria@csa.com.br, redes @csaleblonoficial e banner de cookies (LGPD).

Antes de gerar qualquer código, proponha a direção visual completa e aguarde minha
aprovação. Depois, gere o wireframe textual; após aprovado, gere os três arquivos
(index.html, style.css, script.js) com HTML semântico, CSS com variáveis, design
responsivo, CTAs dourados dominantes, captura de lead ao RD Station antes do
redirecionamento, acessibilidade e SEO básicos. Ao final, faça uma revisão crítica
do próprio código.
```

---

## 11. Dados institucionais reais (para rodapé e contato)

```text
Colégio Santo Agostinho — Unidade Leblon (CSA Leblon)
Mantença: Agostinianos Recoletos

Endereço principal: Rua José Linhares, 88 — Leblon — Rio de Janeiro/RJ — CEP 22430-220
Entrada Social:     Rua Cupertino Durão, 75 — Leblon — Rio de Janeiro/RJ — CEP 22441-030

Telefone:  +55 (21) 3206-7850
E-mails:   csa@csa.com.br · secretaria@csa.com.br

Redes sociais (@csaleblonoficial):
  Instagram · Facebook · TikTok · YouTube · LinkedIn (CSA Leblon)

Site institucional: https://www.csa.com.br
Portal do Processo Seletivo: https://portal.csa.com.br/FrameHTML/web/app/Edu/PortalProcessoSeletivo/

Privacidade/Cookies: banner via AdOpt; vincular Política de Privacidade e de Cookies.
```

---

## 12. Checklist de publicação

- [ ] IDs `ps` de 2027 confirmados com o responsável pelo RM e preenchidos em `PROCESSOS`.
- [ ] Editais 2027 (PDFs) atualizados e vinculados a cada card.
- [ ] Disponibilidade de vagas por série confirmada com a Secretaria.
- [ ] Conta/token do RD Station configurados e teste de lead realizado.
- [ ] Consentimento LGPD e banner de cookies ativos.
- [ ] Fotos com direito de imagem autorizado (atenção a menores).
- [ ] Testado em celular, tablet e desktop.
- [ ] Contatos da Secretaria conferidos.
- [ ] HEX da paleta validados no manual da marca.
- [ ] Links de inscrição testados ponta a ponta (hot site → portal correto).

---

## 13. Direção visual — moderna e arrojada (campanha 2027)

A identidade do hot site segue a **campanha oficial enviada pelo parceiro de marketing**
(arquivos em `media/`), com leitura **bold, contemporânea e de alto contraste** — e não mais
a paleta "azul bebê" do rascunho inicial (`media/Aluno Novo.html`), considerada fraca.

**Pilares visuais**
- **Azul profundo (navy) + malha de constelação**: seções escuras (Hero, rodapé) usam fundo
  `csa-navy` com pontos de luz (`.mesh`) e brilhos em ciano, remetendo à arte da campanha.
- **Amarelo/dourado vibrante**: cor de ação (CTAs, selos, faixa de slogan), derivada do
  gradiente do **brasão oficial** (`#FFF500 → #F3AF00`).
- **Tipografia bold em caixa-alta**: títulos em **Outfit** (700/800), corpo em **Inter**.
- **Slogan da campanha**: "SÓLIDO · ATEMPORAL · INQUIETO" e "O hub de desenvolvimento
  educacional, desde sempre."

**Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataforma**` · `--**Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataf` · **Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataforma*ho #**Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataforma**Tokena (`me**Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataforma**Tokens (`plataforma*svg`**Tokens (`ploficial, usado no header, hero e rodapé.
- `campanha.jpeg` → `brand/campanha.jpg` — arte da campanha, usada na seção "Identidade Agostiniana".
- Vídeo bruto `media/*.mp4` — material de referência; **não versionado** (ver `.gitignore`).

**Textos reaproveitados do rascunho****Textos reaproveitados do rascunho****Textos reaproveitadda**Textos reaproveitados do rascunho****Textos reaproveitados do rascunho****Textos reaproA **Textos reaproveitados do rascunho****Textos reaproveitados do rascunho****Teral e da vontade).
