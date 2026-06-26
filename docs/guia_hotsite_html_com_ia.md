# Guia para criar um hot site em HTML usando IA

## 1. Contexto e objetivo

Este guia foi elaborado para um cenário em que o texto, as imagens e a hospedagem do hot site já estão resolvidos. Portanto, o foco não é escolher plataforma ou infraestrutura, mas usar IA para apoiar a **direção visual**, a **organização narrativa da página** e a **montagem do HTML/CSS**.

A melhor abordagem não é pedir simplesmente: “crie um site em HTML”. O resultado tende a ser genérico. O ideal é conduzir a IA em etapas, como se ela atuasse como uma equipe composta por:

- diretor de arte;
- designer UI/UX;
- redator de landing page;
- desenvolvedor front-end;
- revisor de acessibilidade, responsividade e clareza visual.

O objetivo é transformar conteúdo pronto em uma página visualmente convincente, clara, responsiva e orientada à ação principal do hot site.

---

## 2. Princípio central: primeiro design, depois código

A etapa mais importante é **não começar pelo HTML**.

Antes de gerar código, a IA deve ajudar a definir:

- a direção visual;
- a hierarquia de informação;
- o ritmo da página;
- a posição estratégica das imagens;
- a chamada principal à ação;
- a organização das seções;
- a adaptação para mobile.

O HTML/CSS deve ser produzido apenas depois que a estrutura visual estiver clara.

---

## 3. Organização prévia do material

Antes de pedir qualquer layout à IA, recomenda-se organizar o conteúdo do hot site nesta estrutura:

```text
Objetivo do hot site:
Público-alvo:
Ação principal desejada:
Tom visual:
Texto principal:
Textos secundários:
Imagens disponíveis:
Logo:
Cores institucionais:
Referências visuais desejadas:
Restrições visuais ou institucionais:
Formato de entrega desejado:
```

A **ação principal desejada** é o elemento mais importante da página. O design inteiro deve conduzir o visitante a essa ação.

Exemplos:

- inscrever-se;
- baixar material;
- conhecer o projeto;
- confirmar presença;
- solicitar contato;
- ver programação;
- acessar formulário;
- entrar em contato pelo WhatsApp.

---

## 4. Etapa 1 — Definição da direção visual

A primeira tarefa da IA deve ser propor uma direção visual antes de gerar qualquer código.

Nessa etapa, a IA deve responder a perguntas como:

- O hot site deve ser mais institucional, jovem, tecnológico, acadêmico, emocional ou promocional?
- A imagem principal deve ocupar o fundo, a lateral ou aparecer em cards?
- A página deve ter muitas seções curtas ou poucas seções mais densas?
- O tom visual deve ser minimalista, vibrante, editorial, corporativo ou educacional?
- A paleta deve seguir a identidade institucional ou pode criar uma variação específica para a campanha?
- A tipografia deve transmitir seriedade, proximidade, inovação ou dinamismo?

Prompt sugerido para essa etapa:

```text
Atue como diretor de arte e designer UI/UX.

Vou fornecer o texto e a lista de imagens de um hot site.
Antes de gerar código, proponha uma direção visual completa.

Quero que você defina:
- estilo visual geral;
- paleta de cores;
- tipografia sugerida;
- hierarquia visual;
- ritmo da página;
- uso recomendado das imagens;
- organização das seções;
- chamadas para ação;
- sugestões de layout para desktop e mobile.

O objetivo do hot site é: [descrever].
O público-alvo é: [descrever].
A ação principal esperada é: [descrever].
```

---

## 5. Etapa 2 — Wireframe textual

Depois da direção visual, recomenda-se pedir um wireframe textual. Essa etapa define a sequência narrativa da página.

O wireframe deve indicar, para cada seção:

- título da seção;
- objetivo comunicacional;
- texto utilizado;
- imagem recomendada;
- posição da imagem;
- chamada para ação;
- observações de layout para desktop;
- adaptação para mobile.

Prompt sugerido:

```text
Agora transforme essa direção visual em um wireframe textual para uma landing page de uma página.

Para cada seção, indique:
- título da seção;
- objetivo da seção;
- texto que deve aparecer;
- imagem sugerida;
- posição da imagem;
- botão ou chamada para ação;
- observações de layout para desktop;
- adaptação para mobile.
```

Exemplo de estrutura esperada:

```text
1. Hero
   - imagem de impacto no lado direito ou como fundo sutil;
   - título forte no lado esquerdo;
   - subtítulo curto;
   - botão principal.

2. Contexto
   - bloco explicativo sobre o problema ou oportunidade;
   - imagem ou ícone de apoio.

3. Benefícios / diferenciais
   - cards em grade;
   - frases curtas;
   - destaque para valor percebido.

4. Detalhes
   - seção mais textual;
   - pode usar layout em duas colunas.

5. Chamada final
   - CTA destacado;
   - reforço da ação principal.

6. Rodapé
   - informações institucionais;
   - links ou contatos essenciais.
```

---

## 6. Etapa 3 — Montagem em HTML/CSS/JS

Com a direção visual e o wireframe aprovados, a IA pode gerar o código.

Para um hot site simples, recomenda-se trabalhar com arquivos separados:

```text
/hotsite
  index.html
  style.css
  script.js
  /assets
    imagem-hero.jpg
    imagem-apoio-1.jpg
    imagem-apoio-2.jpg
    logo.png
```

Requisitos recomendados para o código:

- HTML semântico;
- CSS organizado com variáveis;
- design responsivo;
- boa aparência em celular;
- imagens otimizadas;
- botões visíveis;
- contraste adequado;
- carregamento rápido;
- ausência de dependências desnecessárias;
- JavaScript mínimo, apenas quando necessário;
- estrutura fácil de editar posteriormente.

Prompt sugerido:

```text
Agora gere o hot site em HTML, CSS e JavaScript puro.

Requisitos:
- arquivos separados: index.html, style.css e script.js;
- design responsivo;
- visual moderno, elegante e institucional;
- HTML semântico;
- boa hierarquia visual;
- uso adequado das imagens;
- botões bem destacados;
- seções com espaçamento generoso;
- CSS com variáveis para cores, fontes e espaçamentos;
- compatível com hospedagem estática;
- sem frameworks externos, salvo Google Fonts se necessário;
- JavaScript apenas para interações simples, como menu mobile, acordeão ou rolagem suave.
```

---

## 7. Etapa 4 — Revisão do resultado

Depois de gerar a primeira versão, recomenda-se pedir à IA uma revisão crítica do próprio código.

A revisão deve verificar:

- responsividade;
- acessibilidade;
- hierarquia visual;
- clareza da chamada principal;
- legibilidade;
- contraste;
- uso adequado das imagens;
- consistência do espaçamento;
- SEO básico;
- performance;
- excesso de elementos decorativos;
- coerência com o público-alvo.

Prompt sugerido:

```text
Revise este código como se fosse para produção.

Verifique:
- responsividade em celular, tablet e desktop;
- acessibilidade básica;
- contraste de cores;
- hierarquia visual;
- clareza da chamada para ação;
- SEO básico;
- performance;
- organização do CSS;
- possíveis problemas de layout.

Depois, proponha melhorias e gere a versão corrigida dos arquivos.
```

---

## 8. Considerações importantes de design

### 8.1. O hero precisa ser forte

A primeira dobra da página deve responder rapidamente:

- o que é;
- para quem é;
- por que importa;
- o que o visitante deve fazer.

Evite títulos genéricos. Prefira uma frase clara e orientada ao valor.

### 8.2. Uma página não deve ter excesso de texto corrido

Mesmo que o texto já esteja pronto, ele provavelmente precisará ser adaptado para leitura na web. Textos de hot site funcionam melhor quando organizados em:

- títulos fortes;
- subtítulos curtos;
- blocos de destaque;
- cards;
- listas breves;
- chamadas visuais;
- perguntas frequentes.

### 8.3. As imagens devem ter função narrativa

As imagens não devem ser apenas decorativas. Cada imagem deve cumprir uma função:

- gerar impacto emocional;
- explicar o projeto;
- mostrar pessoas, ambiente ou produto;
- reforçar credibilidade;
- criar pausa visual entre blocos textuais.

### 8.4. O CTA deve aparecer mais de uma vez

A chamada principal à ação deve aparecer:

- no hero;
- em uma seção intermediária;
- no final da página.

Mas deve haver consistência: se a ação principal é “Inscrever-se”, evite misturar com muitos outros botões concorrentes.

### 8.5. Mobile deve ser pensado desde o início

Boa parte dos acessos a hot sites costuma ocorrer pelo celular. Portanto, a versão mobile não deve ser apenas uma adaptação comprimida do desktop.

No mobile, recomenda-se:

- título mais curto;
- botão visível rapidamente;
- imagens leves;
- seções bem separadas;
- cards empilhados;
- menu simplificado ou inexistente, se a página for curta.

---

## 9. Estratégia ideal de trabalho com IA

O processo mais eficiente é iterativo:

1. Fornecer o conteúdo e pedir direção visual.
2. Ajustar a proposta visual.
3. Pedir wireframe textual.
4. Ajustar a ordem das seções.
5. Gerar HTML/CSS/JS.
6. Testar visualmente no navegador.
7. Pedir revisão crítica.
8. Corrigir responsividade e detalhes visuais.
9. Publicar.

A IA tende a produzir melhor quando cada etapa é bem delimitada. Quanto mais específico for o briefing, menos genérico será o resultado.

---

## 10. Exemplo de prompt completo e ideal

Abaixo está um prompt completo que pode ser usado como ponto de partida.

```text
Quero que você atue como diretor de arte, designer UI/UX, redator de landing pages e desenvolvedor front-end.

Estou criando um hot site estático em HTML, CSS e JavaScript puro. Eu já tenho o texto, as imagens e a hospedagem resolvida. Preciso de ajuda principalmente no design, na organização visual e na montagem final da página.

Objetivo do hot site:
[descreva o objetivo: divulgar evento, apresentar projeto, captar inscrições, lançar campanha etc.]

Público-alvo:
[descreva o público: estudantes, famílias, professores, clientes, comunidade escolar, visitantes institucionais etc.]

Ação principal desejada:
[exemplo: clicar em “Inscreva-se”, preencher formulário, acessar programação, baixar material, entrar em contato]

Tom desejado:
[exemplo: institucional, moderno, acolhedor, acadêmico, tecnológico, jovem, elegante, vibrante, sóbrio]

Identidade visual:
- Cores institucionais: [informar cores, se houver]
- Logo: [nome do arquivo ou descrição]
- Fontes preferidas: [informar, se houver]
- Restrições visuais: [informar, se houver]

Imagens disponíveis:
1. [nome-do-arquivo.jpg] — [descrição da imagem e possível uso]
2. [nome-do-arquivo.jpg] — [descrição da imagem e possível uso]
3. [nome-do-arquivo.jpg] — [descrição da imagem e possível uso]

Texto disponível:
[colar aqui o texto completo do hot site]

Referências visuais desejadas:
[opcional: descreva sites, estilos ou sensações visuais desejadas]

Antes de gerar qualquer código, faça primeiro uma proposta de direção visual completa, incluindo:
- conceito visual geral;
- paleta de cores sugerida;
- tipografia sugerida;
- hierarquia visual;
- uso recomendado das imagens;
- organização das seções;
- tom dos botões e chamadas para ação;
- estrutura desktop;
- estrutura mobile;
- eventuais ajustes recomendados no texto para leitura na web.

Depois disso, aguarde minha aprovação ou ajustes.

Quando eu aprovar a direção visual, gere um wireframe textual da página, indicando para cada seção:
- título;
- objetivo da seção;
- texto utilizado;
- imagem recomendada;
- posição da imagem;
- chamada para ação;
- observações para desktop;
- adaptação para mobile.

Somente depois da aprovação do wireframe, gere o código final em três arquivos separados:

1. index.html
2. style.css
3. script.js

Requisitos técnicos do código:
- HTML semântico;
- CSS limpo e organizado;
- uso de variáveis CSS para cores, fontes e espaçamentos;
- design responsivo;
- excelente leitura em celular;
- boa hierarquia visual;
- botões de CTA bem destacados;
- imagens com alt text;
- SEO básico no head do HTML;
- sem frameworks externos;
- JavaScript mínimo, apenas se necessário para interações simples;
- estrutura compatível com hospedagem estática;
- comentários apenas quando ajudarem na manutenção.

Depois de gerar o código, revise criticamente a solução e aponte possíveis melhorias de design, responsividade, acessibilidade e clareza da chamada para ação.
```

---

## 11. Prompt alternativo para gerar diretamente o código

Caso a intenção seja ir direto para a montagem inicial, pode-se usar este prompt mais direto:

```text
Crie um hot site estático em HTML, CSS e JavaScript puro a partir do conteúdo abaixo.

Objetivo: [objetivo]
Público-alvo: [público]
Ação principal: [ação]
Tom visual: [tom]
Cores institucionais: [cores]
Imagens disponíveis: [lista de arquivos e descrições]

Texto:
[colar texto]

Gere três arquivos separados:
- index.html
- style.css
- script.js

Requisitos:
- visual moderno, elegante e responsivo;
- layout de landing page de uma página;
- hero forte com CTA;
- seções bem espaçadas;
- cards para informações importantes;
- uso narrativo das imagens;
- bom resultado em celular;
- HTML semântico;
- CSS com variáveis;
- JavaScript mínimo;
- acessibilidade básica;
- SEO básico.

Ao final, explique brevemente a lógica do layout adotado.
```

---

## 12. Recomendação final

A melhor forma de usar IA nesse caso é tratá-la como parceira de design, não apenas como geradora de código. O caminho mais seguro é:

> conteúdo organizado → direção visual → wireframe → HTML/CSS → revisão → publicação.

Esse fluxo reduz retrabalho, melhora a qualidade estética e aumenta a chance de o hot site cumprir seu objetivo principal.
