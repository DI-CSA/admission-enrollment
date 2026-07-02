#!/usr/bin/env bash
# Configura runtime da app na VM: systemd (Node standalone) + Nginx reverse proxy.
set -euo pipefail

# --- systemd unit ---
sudo tee /etc/systemd/system/csa-portal.service >/dev/null <<'UNIT'
[Unit]
Description=CSA Portal de Inscricoes (Next.js standalone)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=csaportal
Group=csaportal
WorkingDirectory=/opt/csa-portal/.next/standalone
EnvironmentFile=/etc/csa-portal/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

# --- Nginx site ---
sudo tee /etc/nginx/sites-available/csa-portal >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name inscricoes.csa.com.br inscricao.csa.com.br _;

    # Upload de documentos (PDF base64 no NovaInscricao). Base64 infla ~33% e a
    # inscricao pode levar varios documentos; 25m cobre com folga.
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_read_timeout 90s;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/csa-portal /etc/nginx/sites-enabled/csa-portal
sudo rm -f /etc/nginx/sites-enabled/default

sudo systemctl daemon-reload
sudo systemctl enable csa-portal >/dev/null 2>&1 || true
sudo systemctl restart csa-portal
sudo nginx -t
sudo systemctl reload nginx

sleep 2
echo "=== status csa-portal ==="
sudo systemctl is-active csa-portal
echo "=== curl direto no Node (127.0.0.1:3000) ==="
curl -s -o /dev/null -w "node / -> %{http_code}\n" http://127.0.0.1:3000/
echo "=== curl via Nginp (127.0.0.1:80) ==="
curl -s -o /dev/null -w "nginx / -> %{http_code}\n" http://127.0.0.1/
echo RUNTIME_OK
