# Instrucoes do projeto — Customizacao do Portal do Processo Seletivo TOTVS

Estas instrucoes sao **obrigatorias** e devem ser seguidas com **rigor total** em toda
edicao de arquivo neste workspace, especialmente nos arquivos dentro de `FrameHTML/`.

## Contexto

- Os arquivos em `FrameHTML/` sao copia de um **servidor Windows** (TOTVS RM / Linha RM /
  Portal do Processo Seletivo, IIS) hospedado em uma VM **GCP**.
- Eles sao editados aqui no **Mac** e depois **devolvidos ao servidor Windows**.
- O transporte e feito por **um unico `.zip`** (scripts em `scripts/`), porque o
  redirecionamento de pasta do RDP corrompe arquivos soltos (gera arquivos zerados).
- A aplicacao roda em **AngularJS 1.x** (modulos/controllers/factories/services/routes por
  feature) + componentes `edu-elements` (PO UI) + WebAPI EduPS. Qualquer alteracao errada
  de formato pode quebrar o carregamento do portal.

## Regras de formatacao (NAO NEGOCIAVEIS)

1. **Encoding: preserve o original de cada arquivo. Nunca transcodifique.**
   - Antes de editar qualquer arquivo de `FrameHTML/`, detecte o encoding:
     `file -I caminho/do/arquivo`
   - Mantenha exatamente o mesmo charset (UTF-8, UTF-8 com BOM, UTF-16LE etc.).
   - **Nunca** adicione, remova ou altere **BOM**.
   - **Nunca** converta UTF-16 <-> UTF-8 nem ISO-8859-1 <-> UTF-8.

2. **Quebras de linha (EOL): preserve.**
   - Arquivos do servidor Windows usam **CRLF**. Mantenha CRLF.
   - Nunca converta CRLF -> LF (nem o contrario) num arquivo existente.

3. **Espacos e linhas em branco: nao normalize.**
   - Nao remova espacos a direita (trailing whitespace).
   - Nao adicione nem remova linha final (final newline).
   - Nao reindente blocos que voce nao alterou.

4. **Sem reformatacao automatica.**
   - Nao rode formatadores (Prettier, Beautify, "Format Document", etc.) nos arquivos TOTVS.
   - Faca o **menor diff possivel**: altere somente as linhas estritamente necessarias.
   - A indentacao das linhas novas deve **copiar exatamente** o estilo das linhas vizinhas
     (mesmo numero de espacos/tabs), independentemente do `.editorconfig`.

5. **Preserve a logica TOTVS / AngularJS.**
   - Nao remova nem renomeie diretivas e bindings: `ng-model`, `ng-click`, `ng-if`,
     `ng-repeat`, `ng-show`, `ng-class`, `{{ }}`, `data-*`, ids e classes usados por JS.
   - Nao altere chamadas de servico, validacoes ou fluxo de inscricao sem necessidade
     explicita e documentada.

## Onde NAO editar

- `FrameHTML/Web/js/libs/**` — bibliotecas de terceiros (Angular, jQuery, Bootstrap...).
- `FrameHTML/Bin/**` — binarios e XML de documentacao gerados.
- Qualquer `*.min.js` / `*.min.css`.
- Arquivos de fontes/imagens binarias.

## Estrategia de customizacao (preferencial)

Sempre que possivel, **nao altere os arquivos originais da TOTVS**. Use o mecanismo oficial:
- templates em `js/templates/custom/`;
- CSS em `assets/css/custom/`;
- imagens em `assets/img/custom/`;
- JS proprio em `assets/js/custom/`;
- flags em `js/edups-constantes.global.config.js`.

Detalhes e o passo a passo completo estao em
`docs/guia_customizacao_portal_processo_seletivo_totvs.md`.

## Verificacao apos cada edicao

Apos editar um arquivo de `FrameHTML/`, confirme que **somente o conteudo pretendido mudou**:

```bash
# encoding e charset inalterados:
file -I caminho/do/arquivo

# EOL ainda CRLF (deve achar ocorrencias de \r):
grep -c $'\r' caminho/do/arquivo

# o diff deve conter apenas as linhas que voce realmente quis mudar:
git diff -- caminho/do/arquivo
```

Se o diff mostrar o arquivo inteiro alterado, **houve mudanca de encoding/EOL**: desfaca e
refaca preservando o formato original.

## Fluxo de trabalho de transporte

1. **Servidor -> Mac:** rodar `scripts/compactar-framehtml.ps1` no Windows e
   `scripts/mac-extrair.sh` no Mac.
2. **Editar** no Mac respeitando as regras acima.
3. **Mac -> Servidor:** rodar `scripts/mac-empacotar.sh` no Mac e
   `scripts/aplicar-framehtml.ps1` no Windows.
4. Sempre conferir o **SHA256** nas duas pontas (os scripts ja fazem isso).
