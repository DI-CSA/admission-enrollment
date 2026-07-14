#!/usr/bin/env bash
# Provisiona o cron de CONCILIAÇÃO DE PAGAMENTO na VM csa-portal01 (roda no Mac).
# Instala /etc/cron.d/csa-conciliar: 2x/dia (08h e 18h, horário da VM = UTC) faz
# um POST autenticado na rota /api/jobs/conciliar-pagamentos, lendo o CRON_SECRET
# de /etc/csa-portal/.env. Idempotente: sobrescreve o arquivo do cron.
# NÃO toca em /etc/csa-portal/.env (segredos ficam só na VM).
set -euo pipefail

PROJECT=totvs-iaas
ZONE=southamerica-east1-b
VM=csa-portal01

SSH=(gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap)
SCP=(gcloud compute scp --zone="$ZONE" --project="$PROJECT" --tunnel-through-iap)

# Monta o arquivo de cron localmente (delimitador entre aspas → sem expansão do
# $(...) e do $SECRET, que devem ser avaliados NA VM, na hora da execução).
TMP="$(mktemp -t csa-cron.XXXXXX)"
cat > "$TMP" <<'CRON'
# Conciliação de pagamento CSA: avança deals pagos p/ "Taxa paga" no RD CRM.
SHELL=/bin/bash
0 8,18 * * * root SECRET="$(sed -n 's/^CRON_SECRET=//p' /etc/csa-portal/.env | head -1)"; curl -fsS -X POST -H "x-cron-secret: $SECRET" http://127.0.0.1:3000/api/jobs/conciliar-pagamentos >> /var/log/csa-conciliar.log 2>&1
# Conciliação da PRÉ-MATRÍCULA CSA: avança deals p/ "Cadastro de matrícula" (reserva gerada) e "Pré-matrícula" (reserva paga).
15 * * * * root SECRET="$(sed -n 's/^CRON_SECRET=//p' /etc/csa-portal/.env | head -1)"; curl -fsS -X POST -H "x-cron-secret: $SECRET" http://127.0.0.1:3000/api/jobs/conciliar-matriculas >> /var/log/csa-conciliar.log 2>&1
CRON

echo "==> 1/2 envia o arquivo de cron para a VM"
"${SCP[@]}" "$TMP" "$VM":~/csa-conciliar.cron

echo "==> 2/2 instala em /etc/cron.d/csa-conciliar"
"${SSH[@]}" --command='sudo install -m 0644 -o root -g root ~/csa-conciliar.cron /etc/cron.d/csa-conciliar \
  && rm -f ~/csa-conciliar.cron \
  && sudo touch /var/log/csa-conciliar.log \
  && echo "--- /etc/cron.d/csa-conciliar ---" \
  && sudo cat /etc/cron.d/csa-conciliar'

rm -f "$TMP"
echo "PROV_CRON_OK"
