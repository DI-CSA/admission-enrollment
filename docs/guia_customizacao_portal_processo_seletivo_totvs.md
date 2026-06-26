# Guia técnico — Customização do Portal do Processo Seletivo TOTVS com HTML, CSS e JavaScript externos

**Contexto:** TOTVS Educacional / Linha RM / Novo Portal do Processo Seletivo  
**Foco:** adaptar a página de inscrição em processos seletivos usando templates customizados, CSS próprio e arquivos JavaScript adicionais servidos pelo IIS.  
**Data:** 26/06/2026

---

## 1. Conclusão executiva

É viável adaptar a página de inscrição do Processo Seletivo da TOTVS usando arquivos personalizados em pastas próprias do servidor, desde que se respeite o mecanismo de customização previsto pela própria TOTVS: a criação de pastas `custom` dentro da estrutura do Portal do Processo Seletivo.

Para **HTML**, **CSS** e **imagens**, há orientação documentada pela TOTVS. Para **JavaScript**, a situação exige mais cautela: há artigos da TOTVS que reconhecem a possibilidade de customizações via código no portal, inclusive em arquivos `.js`, mas a responsabilidade e o suporte ficam com o cliente. Portanto, a estratégia recomendada é **não alterar diretamente os controladores originais sempre que possível**; em vez disso, usar um template HTML customizado que carregue um arquivo JS externo próprio, limitado a comportamentos de interface e integrações periféricas.

A recomendação prática é:

1. usar o template customizado oficial para a tela de inscrição;
2. manter o CSS customizado em `assets/css/custom/app.css`;
3. manter imagens customizadas em `assets/img/custom`;
4. criar uma pasta própria para JS institucional, por exemplo `assets/js/custom`;
5. carregar esse JS a partir do template customizado;
6. evitar modificar regras internas de negócio, controladores AngularJS/TOTVS e serviços de inscrição, salvo necessidade muito bem documentada e testada em homologação.

---

## 2. Base documental verificada

A documentação da TOTVS informa que a customização do novo Portal do Processo Seletivo se aplica ao TOTVS Educacional, Linha RM, Processo Seletivo, a partir da versão 12.1.20, e reúne os tópicos “Cores”, “Customização Avançada”, “Idioma do Portal do Processo Seletivo” e “Imagens”.  
Fonte: Central de Atendimento TOTVS, “TOTVS Educacional - PS - Customização do novo portal do processo seletivo”.

Na documentação de **customização avançada**, a TOTVS orienta editar o arquivo `edups-constantes.global.config.js`, alterar a variável da tela desejada para `true`, criar a pasta `custom` em `js/templates`, copiar para ela o template correspondente e preservar o mesmo nome do arquivo original. A página também informa que, ao ativar uma variável, todos os arquivos relacionados a ela, no mesmo nível de ensino, devem ser movidos para a pasta `custom`, e não apenas o arquivo editado.  
Fonte: TDN TOTVS, “Customização Avançada”.

Na documentação de **cores**, a TOTVS orienta editar o mesmo arquivo `edups-constantes.global.config.js`, ativar a variável referente ao CSS global do portal, criar a pasta `assets/css/custom` e copiar para ela o arquivo `app.css`, preservando o mesmo nome.  
Fonte: TDN TOTVS, “Cores”.

Na documentação de **imagens**, a TOTVS orienta ativar a variável referente às imagens, criar a pasta `assets/img/custom`, copiar todas as imagens para essa pasta e preservar os mesmos nomes. A página também observa que imagens de banner devem ser configuradas no RM.  
Fonte: TDN TOTVS, “Imagens”.

Há ainda artigos da Central TOTVS que mencionam alterações em arquivos `.js`, por exemplo em controladores de inscrição e em arquivos de tradução, mas com alerta explícito de que customizações são responsabilidade do cliente e não recebem suporte da TOTVS.  
Fonte: Central de Atendimento TOTVS, artigos sobre mensagem de CEP e mensagem de confirmação de inscrição.

---

## 3. Estrutura de pastas recomendada

Considerando a instalação padrão citada pela TOTVS, a estrutura de referência é:

```text
C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo
```

A organização recomendada para customização é:

```text
PortalProcessoSeletivo\
  js\
    templates\
      custom\
        inscricoes-es-wizard.view.html
        inscricoes-es-comprovante.view.html
        inscricoes-es-confirmacao-list.view.html
        inscricoes-eb-wizard.view.html
        inscricoes-eb-comprovante.view.html
        inscricoes-eb-confirmacao-list.view.html

  assets\
    css\
      custom\
        app.css

    img\
      custom\
        logo.png
        banner.png
        demais-imagens...

    js\
      custom\
        inscricoes-custom.js
        inscricoes-custom.css-opcional.js
        utils.js
```

Observação: a pasta `assets/js/custom` não é descrita pela TOTVS no mesmo nível de formalidade das pastas `templates/custom`, `assets/css/custom` e `assets/img/custom`. Ela é uma estratégia técnica para manter scripts institucionais separados dos arquivos originais, desde que o IIS sirva esses arquivos estáticos corretamente e desde que o template customizado os referencie.

---

## 4. Quais templates de inscrição considerar

Na documentação de customização avançada, a variável relacionada às inscrições é:

```js
EDUPS_CONST_GLOBAL_CUSTOM_VIEW_INSCRICOES
```

Ela está associada a arquivos como:

```text
inscricoes-eb-comprovante.view.html
inscricoes-eb-confirmacao-list.view.html
inscricoes-eb-edit.view.html          // até versão 12.1.23
inscricoes-eb-list.view.html          // até versão 12.1.17
inscricoes-eb-wizard.view.html        // a partir da versão 12.1.24

inscricoes-es-comprovante.view.html
inscricoes-es-confirmacao-list.view.html
inscricoes-es-edit.view.html          // até versão 12.1.23
inscricoes-es-list.view.html          // até versão 12.1.17
inscricoes-es-wizard.view.html        // a partir da versão 12.1.24
```

Para versões recentes, o arquivo mais importante costuma ser:

```text
inscricoes-es-wizard.view.html
```

para Ensino Superior, e:

```text
inscricoes-eb-wizard.view.html
```

para Ensino Básico.

Entretanto, como a TOTVS orienta mover todos os arquivos relacionados à variável ativada, a prática mais segura é copiar para `templates/custom` todos os templates de inscrição existentes na instalação e relacionados ao nível de ensino usado pela instituição.

---

## 5. Configuração no TOTVS

### 5.1. Fazer backup antes de alterar

Antes de qualquer customização:

1. copie a pasta completa do Portal do Processo Seletivo;
2. copie especificamente `edups-constantes.global.config.js`;
3. copie todos os templates de inscrição originais;
4. registre a versão exata do RM/Portal;
5. salve os arquivos customizados em Git ou outro controle de versão.

Exemplo de backup em PowerShell:

```powershell
$portal = "C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo"
$data = Get-Date -Format "yyyyMMdd-HHmmss"
$destino = "D:\backups\PortalProcessoSeletivo-$data"

New-Item -ItemType Directory -Force -Path $destino
Copy-Item -Path $portal -Destination $destino -Recurse
```

### 5.2. Criar a pasta de templates customizados

```powershell
$portal = "C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo"
New-Item -ItemType Directory -Force -Path "$portal\js\templates\custom"
```

### 5.3. Copiar os templates de inscrição

Para Ensino Superior, em versões 12.1.24 ou posteriores:

```powershell
$portal = "C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo"

Copy-Item "$portal\js\templates\inscricoes-es-wizard.view.html" "$portal\js\templates\custom\" -Force
Copy-Item "$portal\js\templates\inscricoes-es-comprovante.view.html" "$portal\js\templates\custom\" -Force
Copy-Item "$portal\js\templates\inscricoes-es-confirmacao-list.view.html" "$portal\js\templates\custom\" -Force
```

Para Ensino Básico, em versões 12.1.24 ou posteriores:

```powershell
$portal = "C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo"

Copy-Item "$portal\js\templates\inscricoes-eb-wizard.view.html" "$portal\js\templates\custom\" -Force
Copy-Item "$portal\js\templates\inscricoes-eb-comprovante.view.html" "$portal\js\templates\custom\" -Force
Copy-Item "$portal\js\templates\inscricoes-eb-confirmacao-list.view.html" "$portal\js\templates\custom\" -Force
```

Se houver arquivos `edit` ou `list` na sua versão, copie-os também, respeitando os nomes originais.

### 5.4. Ativar a customização de inscrições

Edite:

```text
C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo\js\edups-constantes.global.config.js
```

Procure a variável:

```js
EDUPS_CONST_GLOBAL_CUSTOM_VIEW_INSCRICOES
```

Altere para:

```js
EDUPS_CONST_GLOBAL_CUSTOM_VIEW_INSCRICOES = true;
```

A sintaxe exata pode variar conforme a versão do arquivo. O importante é que o valor da constante/variável de inscrições fique habilitado como `true`.

### 5.5. Ativar CSS customizado

Crie a pasta:

```powershell
$portal = "C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo"
New-Item -ItemType Directory -Force -Path "$portal\assets\css\custom"
Copy-Item "$portal\assets\css\app.css" "$portal\assets\css\custom\app.css" -Force
```

No arquivo `edups-constantes.global.config.js`, ative a variável referente ao CSS global do portal. O nome exato pode variar por versão; procure no arquivo por termos como:

```text
CUSTOM
CSS
APP_CSS
GLOBAL_CSS
```

A documentação da TOTVS não expõe o nome textual da variável na versão em texto da página, mas descreve que ela deve ser alterada para `true`.

### 5.6. Ativar imagens customizadas

Crie a pasta:

```powershell
$portal = "C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo"
New-Item -ItemType Directory -Force -Path "$portal\assets\img\custom"
Copy-Item "$portal\assets\img\*" "$portal\assets\img\custom\" -Recurse -Force
```

No arquivo `edups-constantes.global.config.js`, ative a variável referente às imagens do portal. Como no CSS, o nome exato pode variar por versão; procure no arquivo por termos como:

```text
CUSTOM
IMG
IMAGE
IMAGEM
```

As imagens substituídas devem manter o mesmo nome dos arquivos originais.

---

## 6. Estratégias para usar JavaScript próprio com o novo template custom

### 6.1. Estratégia A — JS externo carregado pelo template customizado

Essa é a estratégia mais limpa quando o objetivo é acrescentar comportamento de interface sem alterar controladores originais da TOTVS.

Crie uma pasta:

```powershell
$portal = "C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo"
New-Item -ItemType Directory -Force -Path "$portal\assets\js\custom"
```

Crie um arquivo:

```text
C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo\assets\js\custom\inscricoes-custom.js
```

Inclua no template customizado de inscrição, por exemplo `inscricoes-es-wizard.view.html`:

```html
<script src="/app/Edu/PortalProcessoSeletivo/assets/js/custom/inscricoes-custom.js?v=20260626"></script>
```

ou, se o portal estiver publicado em um diretório virtual diferente, ajuste o caminho conforme a URL real do ambiente:

```html
<script src="/CorporeRM/FrameHTML/Web/app/Edu/PortalProcessoSeletivo/assets/js/custom/inscricoes-custom.js?v=20260626"></script>
```

A forma correta do caminho deve ser confirmada no navegador, abrindo diretamente a URL do arquivo `.js`. O teste é simples: se o navegador exibir o conteúdo do JS ou baixar o arquivo com status HTTP 200, o IIS está servindo corretamente.

#### Exemplo de JS seguro e defensivo

```js
(function () {
  'use strict';

  const LOG_PREFIX = '[CSA/TOTVS Custom Inscrições]';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function enhanceInscricaoPage() {
    const root = document.querySelector('[data-csa-inscricao-custom]') || document.body;

    if (!root || root.dataset.csaCustomLoaded === '1') {
      return;
    }

    root.dataset.csaCustomLoaded = '1';

    // Exemplo: adicionar classe institucional ao container principal.
    document.body.classList.add('csa-processo-seletivo');

    // Exemplo: inserir aviso institucional sem interferir na lógica da inscrição.
    const alvo = document.querySelector('.panel-body, .container, main');
    if (alvo && !document.querySelector('.csa-aviso-inscricao')) {
      const aviso = document.createElement('div');
      aviso.className = 'csa-aviso-inscricao';
      aviso.setAttribute('role', 'note');
      aviso.textContent = 'Confira seus dados com atenção antes de concluir a inscrição.';
      alvo.prepend(aviso);
    }

    console.info(LOG_PREFIX, 'customização carregada');
  }

  ready(function () {
    enhanceInscricaoPage();

    // Em aplicações SPA/AngularJS, a tela pode ser recomposta sem reload completo.
    // O MutationObserver reaplica pequenos ajustes quando o DOM muda.
    const observer = new MutationObserver(function () {
      enhanceInscricaoPage();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
})();
```

Vantagens:

- mantém arquivos originais preservados;
- concentra customização institucional em um arquivo claro;
- facilita rollback;
- facilita versionamento;
- reduz risco de conflito em atualizações.

Riscos:

- dependendo de como o template é carregado pela aplicação, tags `<script>` inseridas em templates parciais podem não ser executadas em todos os cenários;
- caminhos absolutos podem variar conforme o diretório virtual configurado no IIS;
- cache do navegador pode manter uma versão antiga do JS.

Mitigações:

- testar a execução pelo console do navegador;
- usar query string de versão, por exemplo `?v=20260626-1`;
- manter o JS idempotente, isto é, seguro para rodar mais de uma vez;
- evitar manipular campos internos do fluxo de inscrição sem conhecer a lógica do controller.

---

### 6.2. Estratégia B — JS carregado por um ponto comum do portal

Se o `<script>` dentro do template parcial não executar de forma confiável, uma alternativa é carregar o JS por um ponto mais global do portal, por exemplo um HTML principal, layout, página de entrada ou template comum.

Essa estratégia costuma funcionar melhor em aplicações SPA, pois o arquivo JS fica carregado desde o início e observa a navegação interna.

Exemplo:

```html
<script src="/app/Edu/PortalProcessoSeletivo/assets/js/custom/portal-custom.js?v=20260626"></script>
```

Nesse caso, o JS deve detectar se está na tela de inscrição antes de agir:

```js
(function () {
  'use strict';

  function isPaginaInscricao() {
    return location.href.toLowerCase().includes('inscr') ||
           document.querySelector('[data-csa-inscricao-custom]') !== null ||
           document.querySelector('form[name*="inscricao" i]') !== null;
  }

  function aplicarCustomizacao() {
    if (!isPaginaInscricao()) return;
    document.body.classList.add('csa-processo-seletivo');
  }

  window.addEventListener('hashchange', aplicarCustomizacao);
  window.addEventListener('popstate', aplicarCustomizacao);
  document.addEventListener('DOMContentLoaded', aplicarCustomizacao);
})();
```

Vantagens:

- mais robusta em aplicações SPA;
- evita depender da execução de `<script>` em template parcial;
- permite centralizar customizações do portal.

Riscos:

- pode exigir alteração em arquivo estrutural não coberto pela customização oficial;
- maior impacto em atualização do portal;
- deve ser cuidadosamente documentada.

---

### 6.3. Estratégia C — JS por evento delegado e atributos no template

Uma estratégia intermediária é colocar apenas marcações HTML no template customizado e manter todo comportamento em um JS global externo.

No template:

```html
<div data-csa-inscricao-custom="true">
  <!-- conteúdo original do template TOTVS preservado -->
</div>
```

No JS externo:

```js
(function () {
  'use strict';

  document.addEventListener('click', function (event) {
    const botao = event.target.closest('[data-csa-action]');
    if (!botao) return;

    const action = botao.getAttribute('data-csa-action');

    if (action === 'mostrar-ajuda') {
      event.preventDefault();
      alert('Ajuda institucional para preenchimento da inscrição.');
    }
  });
})();
```

Essa abordagem é recomendada porque evita acoplar o JS aos nomes internos de classes e componentes da TOTVS.

---

### 6.4. Estratégia D — Alteração de controladores `.js` da TOTVS

A TOTVS possui artigos que indicam a possibilidade de alterar arquivos JS internos, como:

```text
C:\TOTVS\CorporeRM\FrameHTML\Web\App\Edu\PortalProcessoSeletivo\js\inscricoes\inscricoesEB.controller.js
C:\TOTVS\CorporeRM\FrameHTML\Web\App\Edu\PortalProcessoSeletivo\js\inscricoes\inscricoesES.controller.js
```

Essa estratégia deve ser considerada apenas quando for inevitável alterar lógica já implementada pelo portal, como validações, chamadas de serviço, mensagens ou comportamentos do fluxo.

Desvantagens relevantes:

- maior risco de quebrar o processo de inscrição;
- maior risco em atualizações do RM/Portal;
- dificuldade de suporte pela TOTVS;
- necessidade de testes regressivos completos;
- possibilidade de impacto em LGPD e segurança caso dados do candidato sejam manipulados.

Recomendação: evitar sempre que a necessidade puder ser resolvida com HTML, CSS, JS externo ou parametrização no RM.

---

## 7. Configuração no IIS

### 7.1. Verificar se o portal está como aplicação no IIS

No Gerenciador do IIS:

1. abra o servidor;
2. localize o site onde o RM Portal está publicado;
3. identifique o diretório/aplicação correspondente ao Portal do Processo Seletivo;
4. confirme qual Application Pool está associado;
5. confirme o caminho físico usado pelo site/aplicação.

O caminho físico deve apontar para a árvore que contém:

```text
FrameHTML\Web\app\Edu\PortalProcessoSeletivo
```

ou para uma raiz superior que permita acessar esse caminho.

### 7.2. Permissões de leitura

A identidade do Application Pool precisa ter permissão de leitura nos arquivos customizados.

Exemplo, se o pool se chama `RMPortalAppPool`:

```powershell
$portal = "C:\totvs\CorporeRM\FrameHTML\Web\app\Edu\PortalProcessoSeletivo"
icacls "$portal\assets\js\custom" /grant "IIS AppPool\RMPortalAppPool:(OI)(CI)(RX)"
icacls "$portal\js\templates\custom" /grant "IIS AppPool\RMPortalAppPool:(OI)(CI)(RX)"
icacls "$portal\assets\css\custom" /grant "IIS AppPool\RMPortalAppPool:(OI)(CI)(RX)"
icacls "$portal\assets\img\custom" /grant "IIS AppPool\RMPortalAppPool:(OI)(CI)(RX)"
```

Se o ambiente usar outra identidade, como `Network Service` ou uma conta de domínio, ajuste o comando.

### 7.3. Servir arquivos estáticos

O IIS precisa estar servindo conteúdo estático. Em instalações comuns, `.js`, `.css`, `.png`, `.jpg` e `.svg` já possuem mapeamentos MIME. Segundo a documentação Microsoft, o elemento `<staticContent>` configura o processamento de arquivos estáticos, e o `<mimeMap>` define mapeamentos por extensão. O IIS não retorna por padrão tipos de arquivos que não estejam adicionados ao `<staticContent>` ou que não tenham mapeamento em `<handlers>`.

No Gerenciador do IIS:

1. selecione o site/aplicação;
2. abra **MIME Types / Tipos MIME**;
3. confirme se há entrada para `.js`;
4. confirme se há entrada para `.css`;
5. se usar `.mjs`, `.json`, `.svg`, `.woff2`, confirme esses tipos também.

Mapeamentos úteis:

```text
.js     text/javascript ou application/javascript
.css    text/css
.json   application/json
.svg    image/svg+xml
.woff2  font/woff2
```

Em geral, não é necessário criar `web.config` apenas para `.js`, pois o IIS normalmente já o serve. Só adicione se houver erro 404.3, 403, bloqueio por MIME ou resposta com tipo incorreto.

Exemplo de `web.config` local dentro de `assets/js/custom`, apenas se necessário:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".js" />
      <mimeMap fileExtension=".js" mimeType="text/javascript" />
    </staticContent>
  </system.webServer>
</configuration>
```

Atenção: se o servidor tiver bloqueios de configuração herdados, esse `web.config` pode causar erro 500.19. Nesse caso, remova o arquivo e configure o MIME type no nível do site ou do servidor.

### 7.4. Cache

O cache é uma das causas mais comuns de “a alteração não apareceu”. Há três níveis de cache a considerar:

1. cache do navegador;
2. cache de arquivos estáticos do IIS/proxy;
3. cache interno da aplicação/SPA.

A TOTVS menciona que pode ser necessário limpar o cache do navegador após customização. Além disso, para arquivos JS e CSS customizados, a prática recomendada é versionar a URL:

```html
<script src="/app/Edu/PortalProcessoSeletivo/assets/js/custom/inscricoes-custom.js?v=20260626-1"></script>
<link rel="stylesheet" href="/app/Edu/PortalProcessoSeletivo/assets/css/custom/app.css?v=20260626-1">
```

Caso seja necessário controlar cache pelo IIS, o elemento `<clientCache>` do `<staticContent>` especifica cabeçalhos HTTP de cache enviados pelo IIS.

Exemplo para desabilitar cache apenas em uma pasta de customização durante homologação:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <clientCache cacheControlMode="DisableCache" />
    </staticContent>
  </system.webServer>
</configuration>
```

Em produção, prefira versionar arquivos com `?v=...` ou com nome versionado, em vez de desabilitar cache indefinidamente.

### 7.5. Reciclar Application Pool

Alterações em HTML, CSS, JS e imagens normalmente deveriam ser percebidas sem reiniciar o servidor, salvo cache. Porém, após alteração de configuração, publicação ou comportamento inconsistente, pode ser útil reciclar o Application Pool do portal.

No IIS Manager:

1. acesse **Application Pools**;
2. selecione o pool do RM Portal;
3. clique em **Recycle**.

Em PowerShell:

```powershell
Import-Module WebAdministration
Restart-WebAppPool -Name "RMPortalAppPool"
```

Evite `iisreset` em produção, pois reinicia o serviço IIS como um todo e pode afetar outros sites/aplicações no servidor.

---

## 8. Modelo de implementação recomendado

### Etapa 1 — Homologação

Executar primeiro em ambiente de homologação:

```text
HOMOLOGAÇÃO → validar layout → validar inscrição completa → validar pagamento/boleto, se houver → validar central do candidato → validar e-mails → aprovar publicação.
```

### Etapa 2 — Customização visual

1. ativar CSS customizado;
2. copiar `app.css` para `assets/css/custom`;
3. aplicar identidade visual;
4. testar responsividade.

### Etapa 3 — Customização de HTML

1. ativar `EDUPS_CONST_GLOBAL_CUSTOM_VIEW_INSCRICOES`;
2. copiar todos os templates associados;
3. editar o mínimo necessário;
4. preservar diretivas AngularJS/TOTVS existentes;
5. não remover campos, `ng-model`, `ng-click`, `ng-if`, `ng-repeat` ou bindings sem entender a lógica.

### Etapa 4 — JS externo

1. criar `assets/js/custom/inscricoes-custom.js`;
2. referenciar no template ou em ponto global;
3. usar JS idempotente;
4. usar event delegation;
5. não bloquear submit, validações ou chamadas de serviço da TOTVS sem teste funcional completo.

### Etapa 5 — Validação técnica

No navegador:

1. abrir DevTools;
2. aba Network;
3. recarregar sem cache;
4. verificar se o template customizado foi carregado;
5. verificar se o CSS customizado foi carregado;
6. verificar se o JS customizado retornou HTTP 200;
7. verificar se não há erro JS no Console;
8. concluir uma inscrição de teste.

---

## 9. Checklist de publicação

Antes de publicar em produção:

- [ ] backup completo realizado;
- [ ] versão do RM/Portal registrada;
- [ ] pasta `templates/custom` criada;
- [ ] todos os templates relacionados à variável de inscrições copiados;
- [ ] `EDUPS_CONST_GLOBAL_CUSTOM_VIEW_INSCRICOES = true` configurado;
- [ ] `assets/css/custom/app.css` criado e ativado;
- [ ] imagens customizadas copiadas, se aplicável;
- [ ] `assets/js/custom/inscricoes-custom.js` criado;
- [ ] caminho do JS testado diretamente no navegador;
- [ ] permissões NTFS conferidas;
- [ ] MIME type de `.js` e `.css` conferido no IIS;
- [ ] cache tratado por query string de versão;
- [ ] inscrição completa testada;
- [ ] fluxo de comprovante testado;
- [ ] fluxo de confirmação testado;
- [ ] central do candidato testada, se aplicável;
- [ ] pagamento/boleto testado, se aplicável;
- [ ] rollback documentado.

---

## 10. Plano de rollback

Para desfazer rapidamente:

1. altere `EDUPS_CONST_GLOBAL_CUSTOM_VIEW_INSCRICOES` para `false`;
2. se necessário, desative também CSS/imagens customizados no `edups-constantes.global.config.js`;
3. mantenha as pastas `custom` preservadas, mas inativas;
4. limpe cache do navegador;
5. recicle o Application Pool se necessário.

Não é necessário apagar as pastas `custom` para rollback imediato. A própria documentação da TOTVS observa que essas pastas não são apagadas na desinstalação do Portal RM, o que reforça a conveniência de tratá-las como área persistente de customização.

---

## 11. Cuidados com segurança e LGPD

Ao adicionar JS próprio:

- não envie dados do candidato para serviços externos sem base legal, contrato e política de privacidade;
- não capture CPF, e-mail, telefone ou dados sensíveis em ferramentas de analytics sem avaliação jurídica;
- não exponha tokens, chaves ou endpoints administrativos no JS;
- não altere validações obrigatórias sem aprovação da área responsável;
- registre as customizações e mantenha rastreabilidade;
- prefira integrações server-side quando envolver dados pessoais.

---

## 12. Exemplo mínimo de template customizado com marcador institucional

Trecho ilustrativo a ser inserido no template customizado, preservando o conteúdo original da TOTVS:

```html
<div data-csa-inscricao-custom="true" class="csa-inscricao-wrapper">
  <div class="csa-cabecalho-inscricao">
    <h1>Inscrição no Processo Seletivo</h1>
    <p>Preencha os dados com atenção. As informações serão usadas para contato e acompanhamento da inscrição.</p>
  </div>

  <!-- Abaixo deve permanecer o conteúdo original do template TOTVS -->
  <!-- Não remova diretivas AngularJS, bindings, forms, ng-clicks ou ng-models sem análise. -->

  <script src="/app/Edu/PortalProcessoSeletivo/assets/js/custom/inscricoes-custom.js?v=20260626-1"></script>
</div>
```

---

## 13. Exemplo mínimo de CSS customizado

Arquivo:

```text
assets\css\custom\app.css
```

Trecho:

```css
.csa-processo-seletivo .csa-aviso-inscricao,
.csa-inscricao-wrapper .csa-cabecalho-inscricao {
  padding: 16px;
  margin-bottom: 16px;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.csa-inscricao-wrapper .csa-cabecalho-inscricao h1 {
  margin-top: 0;
}
```

Como o arquivo `app.css` customizado substitui/assume o papel do CSS global customizado, avalie se é melhor copiar o conteúdo original e acrescentar as regras no final, em vez de substituir tudo por um CSS pequeno.

---

## 14. Referências

TOTVS. **TOTVS Educacional - PS - Customização do novo portal do processo seletivo**. Central de Atendimento TOTVS, 16 ago. 2021. Disponível em: https://centraldeatendimento.totvs.com/hc/pt-br/articles/360025585494-TOTVS-Educacional-PS-Customiza%C3%A7%C3%A3o-do-novo-portal-do-processo-seletivo. Acesso em: 26 jun. 2026.

TOTVS. **Customização Avançada**. TDN TOTVS, Linha RM. Disponível em: https://tdn.totvs.com/pages/viewpage.action?pageId=284884343. Acesso em: 26 jun. 2026.

TOTVS. **Cores**. TDN TOTVS, Linha RM. Disponível em: https://tdn.totvs.com/pages/viewpage.action?pageId=284884331. Acesso em: 26 jun. 2026.

TOTVS. **Imagens**. TDN TOTVS, Linha RM. Disponível em: https://tdn.totvs.com/pages/viewpage.action?pageId=284884338. Acesso em: 26 jun. 2026.

TOTVS. **TOTVS Educacional - Processo Seletivo - PS - Não exibir a mensagem Atenção! CEP não encontrado no portal do processo seletivo**. Central de Atendimento TOTVS, 3 nov. 2022. Disponível em: https://centraldeatendimento.totvs.com/hc/pt-br/articles/360015972812-TOTVS-Educacional-Processo-Seletivo-PS-N%C3%A3o-exibir-a-mensagem-Aten%C3%A7%C3%A3o-CEP-n%C3%A3o-encontrado-no-portal-do-processo-seletivo. Acesso em: 26 jun. 2026.

TOTVS. **TOTVS Educacional - Processo Seletivo - PS - Customizar mensagem de confirmação de inscrição do Processo Seletivo**. Central de Atendimento TOTVS, 25 fev. 2022. Disponível em: https://centraldeatendimento.totvs.com/hc/pt-br/articles/4479993299735-TOTVS-Educacional-Processo-Seletivo-PS-Customizar-mensagem-de-confirma%C3%A7%C3%A3o-de-inscri%C3%A7%C3%A3o-do-Processo-Seletivo. Acesso em: 26 jun. 2026.

MICROSOFT. **Static Content `<staticContent>`**. Microsoft Learn. Disponível em: https://learn.microsoft.com/en-us/iis/configuration/system.webserver/staticcontent/. Acesso em: 26 jun. 2026.

MICROSOFT. **Como Adicionar Mapeamentos MIME de Conteúdo Estático `<mimeMap>`**. Microsoft Learn. Disponível em: https://learn.microsoft.com/pt-br/iis/configuration/system.webserver/staticcontent/mimemap. Acesso em: 26 jun. 2026.

MICROSOFT. **Cache de cliente `<clientCache>`**. Microsoft Learn. Disponível em: https://learn.microsoft.com/pt-br/iis/configuration/system.webserver/staticcontent/clientcache. Acesso em: 26 jun. 2026.

MICROSOFT. **Recycling Settings for an Application Pool `<recycling>`**. Microsoft Learn. Disponível em: https://learn.microsoft.com/en-us/iis/configuration/system.applicationhost/applicationpools/add/recycling/. Acesso em: 26 jun. 2026.
