#!/usr/bin/env bash
# Abre um túnel IAP do seu Mac direto para a VM do Portal de Inscrições,
# ignorando o Load Balancer, o DNS (inscricoes.csa.com.br) e o certificado.
# Assim dá para testar o sistema em produção antes da propagação do DNS.
#
# Uso:
#   scripts/tunnel.sh            # túnel para o Nginx da VM (porta 80) em localhost:8080
#   scripts/tunnel.sh 9090       # usa a porta local 9090
#
# Encerrar: Ctrl+C.
set -euo pipefail

PROJECT="${GCP_PROJECT:-totvs-iaas}"
ZONE="${GCP_ZONE:-southamerica-east1-b}"
VM="${GCP_VM:-csa-portal01}"
REMOTE_PORT="${GCP_REMOTE_PORT:-80}"   # Nginx na VM
LOCAL_PORT="${1:-8080}"

cat <<EOF

────────────────────────────────────────────────────────────────
 Túnel IAP -> ${VM} (Nginx:${REMOTE_PORT})   [projeto ${PROJECT}]

 Quando aparecer "Listening on port [${LOCAL_PORT}]", acesse no navegador:

     http://localhost:${LOCAL_PORT}

 Isso exercita o MESMO caminho de produção (Nginx -> Node -> SQL 10.10.0.2
 / EduPS 10.10.0.24), sem depender de DNS nem de certificado.

 Para encerrar o túnel: Ctrl+C.
────────────────────────────────────────────────────────────────

EOF

exec gcloud compute start-iap-tunnel "$VM" "$REMOTE_PORT" \
  --local-host-port="localhost:${LOCAL_PORT}" \
  --zone="$ZONE" \
  --project="$PROJECT"
