#!/usr/bin/env bash
# Re-deploy da Plataforma CSA na VM csa-portal01 (roda no Mac).
# Envia o fonte por scp (IAP), instala/builda NA VM (binarios Linux) e reinicia o systemd.
# NAO toca em /etc/csa-portal/.env (segredos ficam so na VM).
set -euo pipefail

PROJECT=totvs-iaas
ZONE=southamerica-east1-b
VM=csa-portal01
APP_DIR=/opt/csa-portal
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAT="$REPO_ROOT/plataforma"

# UUID do loader de rastreamento do RD Station (publico — vai no bundle do cliente).
# NEXT_PUBLIC_* precisa estar presente NO BUILD para ser embutido. Override via env.
RD_TRACKING_UUID="${NEXT_PUBLIC_RD_TRACKING_UUID:-d57e1c47-68f2-4339-b5cf-4cdf1098d0e5}"

# Flags de exibicao da matricula (NEXT_PUBLIC_* -> embutidas NO BUILD). Default = false
# (oculta plano de pagamento e minuta do contrato ate os valores/minutas serem divulgados).
# Override via env, ex.: NEXT_PUBLIC_MATRICULA_EXIBIR_PLANO_PAGAMENTO=true ./scripts/deploy-app.sh
MAT_EXIBIR_PLANO="${NEXT_PUBLIC_MATRICULA_EXIBIR_PLANO_PAGAMENTO:-false}"
MAT_EXIBIR_MINUTA="${NEXT_PUBLIC_MATRICULA_EXIBIR_MINUTA_CONTRATO:-false}"

SSH=(gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap)
SCP=(gcloud compute scp --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap)

echo "==> 1/5 empacota o fonte (sem node_modules/.next/.git/.env)"
TARBALL="$(mktemp -t csa-app.XXXXXX).tgz"
tar czf "$TARBALL" -C "$PLAT" \
  --exclude='node_modules' --exclude='.next' --exclude='.git' \
  --exclude='.env' --exclude='.env.*' .
echo "    pacote: $(du -h "$TARBALL" | cut -f1)"

echo "==> 2/5 envia e extrai em $APP_DIR"
"${SCP[@]}" "$TARBALL" "$VM":~/csa-app.tgz
"${SSH[@]}" --command="sudo rm -rf $APP_DIR/.next && sudo tar xzf ~/csa-app.tgz -C $APP_DIR && sudo chown -R csaportal:csaportal $APP_DIR && rm -f ~/csa-app.tgz"

echo "==> 3/5 pnpm install + build (na VM, com placeholders de env para o build)"
"${SSH[@]}" --command="sudo -u csaportal env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1 \
  TOTVS_DB_SERVER=build TOTVS_DB_USER=build TOTVS_DB_PASSWORD=build TOTVS_DB_NAME=build \
  RM_API_BASE=http://build.invalid SESSION_SECRET=build-placeholder-000000000000000000000000000000 \
  NEXT_PUBLIC_RD_TRACKING_UUID=$RD_TRACKING_UUID \
  NEXT_PUBLIC_MATRICULA_EXIBIR_PLANO_PAGAMENTO=$MAT_EXIBIR_PLANO \
  NEXT_PUBLIC_MATRICULA_EXIBIR_MINUTA_CONTRATO=$MAT_EXIBIR_MINUTA \
  bash -lc 'cd $APP_DIR && pnpm install --frozen-lockfile && pnpm build'"

echo "==> 4/5 copia static/public para o standalone"
"${SSH[@]}" --command="cd $APP_DIR && sudo -u csaportal cp -r .next/static .next/standalone/.next/static && sudo -u csaportal cp -r public .next/standalone/public"

echo "==> 5/5 reinicia o servico"
"${SSH[@]}" --command="sudo systemctl restart csa-portal && sleep 2 && sudo systemctl is-active csa-portal && curl -s -o /dev/null -w 'app / -> %{http_code}\n' http://127.0.0.1:3000/"

rm -f "$TARBALL"
echo "DEPLOY_OK"
