#!/usr/bin/env bash
#
# Empacota a pasta FrameHTML editada no Mac em um unico .zip (com a base FrameHTML/),
# gera o hash SHA256 e, opcionalmente, envia ao bucket GCS para aplicar no servidor.
#
# Uso:
#   ./scripts/mac-empacotar.sh [gs://bucket]
#
# Exemplos:
#   ./scripts/mac-empacotar.sh
#   ./scripts/mac-empacotar.sh gs://csa-transfer-portal
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUCKET="${1:-}"

if [[ ! -d "$ROOT/FrameHTML" ]]; then
  echo "ERRO: pasta nao encontrada: $ROOT/FrameHTML" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
ZIP="$ROOT/FrameHTML-editado-$STAMP.zip"

echo "Compactando FrameHTML ..."
# -X remove atributos extras do macOS; exclui .DS_Store e metadados __MACOSX.
( cd "$ROOT" && zip -r -q -X "$ZIP" FrameHTML -x "*.DS_Store" -x "__MACOSX/*" )

shasum -a 256 "$ZIP" | awk '{print toupper($1)}' | tr -d '\n' > "$ZIP.sha256"

echo "Zip:    $ZIP"
echo "SHA256: $(cat "$ZIP.sha256")"

if [[ -n "$BUCKET" ]]; then
  name="$(basename "$ZIP")"
  echo "Enviando para $BUCKET ..."
  gcloud storage cp "$ZIP"        "$BUCKET/"
  gcloud storage cp "$ZIP.sha256" "$BUCKET/"
  echo ""
  echo "No servidor Windows, aplique com:"
  echo "  .\\scripts\\aplicar-framehtml.ps1 -ZipPath C:\\temp\\$name -GcsBucket $BUCKET"
else
  echo ""
  echo "Transporte o .zip (e o .sha256) ate o servidor e rode aplicar-framehtml.ps1."
fi
