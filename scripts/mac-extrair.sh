#!/usr/bin/env bash
#
# Baixa (opcional) e extrai o zip da FrameHTML vindo do servidor Windows,
# conferindo o hash SHA256 antes de extrair.
#
# Uso:
#   ./scripts/mac-extrair.sh <arquivo.zip> [gs://bucket]
#
# Exemplos:
#   ./scripts/mac-extrair.sh ~/Downloads/FrameHTML-20260626-101500.zip
#   ./scripts/mac-extrair.sh FrameHTML-20260626-101500.zip gs://csa-transfer-portal
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP="${1:-}"
BUCKET="${2:-}"

if [[ -z "$ZIP" ]]; then
  echo "Uso: $0 <arquivo.zip> [gs://bucket]" >&2
  exit 1
fi

# Baixa do bucket, se informado e o arquivo ainda nao existir localmente.
if [[ -n "$BUCKET" && ! -f "$ZIP" ]]; then
  name="$(basename "$ZIP")"
  echo "Baixando $BUCKET/$name ..."
  gcloud storage cp "$BUCKET/$name" "$ROOT/"
  gcloud storage cp "$BUCKET/$name.sha256" "$ROOT/" || true
  ZIP="$ROOT/$name"
fi

if [[ ! -f "$ZIP" ]]; then
  echo "ERRO: arquivo nao encontrado: $ZIP" >&2
  exit 1
fi

# Confere o hash, se o .sha256 estiver presente.
if [[ -f "$ZIP.sha256" ]]; then
  expected="$(tr -d '[:space:]' < "$ZIP.sha256" | tr '[:lower:]' '[:upper:]')"
  actual="$(shasum -a 256 "$ZIP" | awk '{print toupper($1)}')"
  if [[ "$expected" != "$actual" ]]; then
    echo "ERRO: hash divergente." >&2
    echo "  esperado: $expected" >&2
    echo "  obtido  : $actual"   >&2
    exit 2
  fi
  echo "Hash conferido: OK"
else
  echo "Aviso: .sha256 ausente, pulando conferencia de integridade."
fi

echo "Extraindo em $ROOT ..."
unzip -o "$ZIP" -d "$ROOT" >/dev/null
echo "Pronto. Conteudo em: $ROOT/FrameHTML"
echo "Confira se ha conteudo real (deve ser > 0):"
echo "  tr -d '\\000' < \"$ROOT/FrameHTML/Web/App/Edu/PortalProcessoSeletivo/js/edups-constantes.global.config.js\" | wc -c"
