#!/usr/bin/env bash
# Bootstrap da VM da Plataforma CSA (Portal de Inscrições) — Ubuntu 24.04 na VPC TOTVS.
# Idempotente: pode rodar de novo sem quebrar. Instala runtime (Node 20 + pnpm),
# Nginx e utilitários; cria o diretório da app e um usuário de serviço.
set -euo pipefail

APP_DIR=/opt/csa-portal
APP_USER=csaportal
PNPM_VERSION=10.6.5

echo "==> apt update + utilitários"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg git nginx netcat-openbsd dnsutils

echo "==> Node.js 20 LTS (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> pnpm ${PNPM_VERSION} via corepack"
sudo corepack enable
sudo corepack prepare "pnpm@${PNPM_VERSION}" --activate

echo "==> usuário de serviço + diretório da app"
if ! id "$APP_USER" >/dev/null 2>&1; then
  sudo useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi
sudo mkdir -p "$APP_DIR"
sudo chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
sudo mkdir -p /etc/csa-portal
sudo chmod 750 /etc/csa-portal

echo "==> versões"
echo "node: $(node -v)"
echo "npm:  $(npm -v)"
echo "pnpm: $(pnpm -v)"
echo "nginx: $(nginx -v 2>&1)"

echo "BOOTSTRAP_OK"
