#!/usr/bin/env bash
# Conecta na VM do Portal de Inscrições via gcloud + IAP (sem IP externo).
#
# Uso:
#   scripts/ssh.sh                 # abre shell interativo na VM
#   scripts/ssh.sh <comando...>    # executa <comando> na VM e retorna
#
# Exemplos:
#   scripts/ssh.sh
#   scripts/ssh.sh 'systemctl status csa-portal --no-pager'
#   scripts/ssh.sh 'sudo journalctl -u csa-portal -n 100 --no-pager'
set -euo pipefail

PROJECT="${GCP_PROJECT:-totvs-iaas}"
ZONE="${GCP_ZONE:-southamerica-east1-b}"
VM="${GCP_VM:-csa-portal01}"

if [[ $# -gt 0 ]]; then
  exec gcloud compute ssh "$VM" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --tunnel-through-iap \
    --command="$*"
else
  exec gcloud compute ssh "$VM" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --tunnel-through-iap
fi
