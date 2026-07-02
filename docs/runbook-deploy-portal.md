# Runbook de Deploy — Portal de Inscrições CSA (Next.js na GCP)

Documento operacional do deploy **já provisionado** em 2026-07-01. Descreve a arquitetura,
os recursos criados, **o que você precisa fazer**, a configuração de DNS no Azion, a
virada de `inscricoes.csa.com.br` → `inscricao.csa.com.br` e o procedimento de re-deploy.

> Complementa `docs/plano_deploy_gcp.md` (que é o *plano/estratégia*). Aqui é o *como operar*.

---

## 1. Arquitetura implementada

```
Internet
   │  https://inscricoes.csa.com.br
   ▼
[Azion Intelligent DNS]  ── registro A ──► 136.68.128.142
   │
   ▼
[GCP External HTTPS Load Balancer]  IP global 136.68.128.142
   • TLS termina aqui (certificado GERENCIADO pelo Google)
   • :80  → redirect 301 para :443
   • :443 → backend HTTP
   │  (X-Forwarded-Proto: https, X-Forwarded-For)
   ▼  porta 80 (interno)
[VM csa-portal01]  10.10.0.20  (SEM IP externo)
   • Nginx :80  → 127.0.0.1:3000  (reverse proxy, repassa headers do LB)
   • Node (Next standalone) :3000  (systemd: csa-portal.service)
   • Egress à internet via Cloud NAT
   │
   ├──► EduPS WebAPI   http://10.10.0.24/FrameHTML/RM/API   (transacional)
   └──► SQL CorporeRM  10.10.0.2:1433                        (leitura)
```

Pontos-chave:
- A instância **não tem IP público**. Entra tráfego só pelo Load Balancer; sai para a
  internet (git/apt/pnpm) pelo **Cloud NAT**; administração por **SSH via IAP**.
- O **certificado TLS é gerenciado pelo Load Balancer** (Google-managed). Você **não**
  instala certificado na VM nem no Azion — só aponta o DNS para o IP do LB.

---

## 2. Recursos GCP criados (projeto `totvs-iaas`, região `southamerica-east1`)

| Tipo | Nome | Observação |
|---|---|---|
| VM | `csa-portal01` | zona `-b`, e2-medium, Ubuntu 24.04, interno `10.10.0.20`, **sem IP externo** |
| IP global (LB) | `csa-portal-lb-ip` | **`136.68.128.142`** — é para onde o DNS aponta |
| Cloud Router | `rtr-totvs-iaas-sae1` | suporte do NAT |
| Cloud NAT | `nat-totvs-iaas-sae1` | egress da VM sem IP externo |
| Instance group | `csa-portal-ig` | contém a VM, named-port `http:80` |
| Health check | `csa-portal-hc` | HTTP `:80` path `/` |
| Backend service | `csa-portal-bes` | global HTTP, **HEALTHY** |
| URL map | `csa-portal-urlmap` | default → backend |
| Cert gerenciado | `csa-portal-cert` | domínio `inscricoes.csa.com.br` |
| HTTPS proxy | `csa-portal-https-proxy` | url-map + cert |
| Forwarding rule | `csa-portal-fr-https` | `:443` |
| URL map (redirect) | `csa-portal-redirect` | 301 HTTP→HTTPS |
| HTTP proxy | `csa-portal-http-proxy` | redirect |
| Forwarding rule | `csa-portal-fr-http` | `:80` |
| Firewall | `vpc-totvs-iaas-allow-ssh-iap` | SSH `:22` só do range IAP `35.235.240.0/20` |
| Firewall | `allow-sqlserver-portal` | `:1433` da VM `10.10.0.20` → SQL |

IP externo antigo `csa-portal01-ip` (`34.95.217.151`) ficou **sem uso** (o ingress é pelo
LB). Pode liberar para não gerar cobrança:
```bash
gcloud compute addresses delete csa-portal01-ip --region=southamerica-east1 --project=totvs-iaas
```

---

## 3. Sobre o Nginx (por que ficou, mesmo com o LB)

O Load Balancer **não obriga** ter Nginx — ele poderia falar direto com o Node. Mantivemos
o Nginx porque **funciona e agrega, sem prejuízo**:
- O Node roda como usuário sem privilégio, ligado só ao **loopback** `127.0.0.1:3000`
  (não exposto). O Nginx é quem escuta `:80` para o LB — separa "porta pública" de "porta
  da app".
- Buffering de conexões, `client_max_body_size`, logs de acesso e um ponto único para
  ajustar headers/limites no futuro — sem alterar a aplicação.
- Já está validado e saudável. **Não há motivo para remover.**

Se algum dia quiser eliminá-lo, seria preciso: Node ouvindo `0.0.0.0:3000`, named-port do
LB `http:3000` e health check em `:3000`. Não recomendado agora.

---

## 4. O QUE VOCÊ PRECISA FAZER (checklist)

### 4.1 Preencher a senha do SQL na VM
O `.env` de produção está em `/etc/csa-portal/.env` com tudo pronto, **exceto** a senha do
banco (placeholder `__PREENCHER_SENHA_SQL__`). Faça direto na VM (a senha não passa pelo chat):

```bash
gcloud compute ssh csa-portal01 --zone=southamerica-east1-b --project=totvs-iaas --tunnel-through-iap
# dentro da VM:
sudo nano /etc/csa-portal/.env        # troque __PREENCHER_SENHA_SQL__ pela senha do user rm
sudo systemctl restart csa-portal
# valida leitura no banco (deve responder 200):
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/series
sudo journalctl -u csa-portal -n 30 --no-pager    # em caso de erro
```

### 4.2 Configurar o DNS no Azion  → ver seção 5.

### 4.3 Aguardar o certificado ficar ACTIVE → ver seção 5.

### 4.4 (No go-live real) liberar a gravação de inscrições
Enquanto estiver testando, `INSCRICAO_SOMENTE_LEITURA=true` bloqueia a **gravação final**
da inscrição no RM (login e painel funcionam normalmente). Só quando for abrir de verdade:
```bash
# na VM:
sudo sed -i 's/^INSCRICAO_SOMENTE_LEITURA=.*/INSCRICAO_SOMENTE_LEITURA=false/' /etc/csa-portal/.env
sudo systemctl restart csa-portal
```

---

## 5. DNS no Azion + certificado gerenciado

O TLS é **terminado no Load Balancer** com certificado gerenciado pelo Google. O Azion
entra **apenas como DNS** (não como borda/proxy): basta um registro A apontando o host para
o IP do LB. O Google provisiona o certificado automaticamente quando o domínio resolve para
o LB.

### 5.1 Criar o registro A (host de teste `inscricoes.csa.com.br`)
No painel Azion → **Intelligent DNS / Edge DNS** → zona `csa.com.br` → **Add Record**:

| Campo | Valor |
|---|---|
| Name / Host | `inscricoes` |
| Type | `A` |
| Answer / Value | `136.68.128.142` |
| TTL | `300` (baixo durante testes) |

> **Não** use o modo de *proxy/borda* do Azion para este host. Deve ser **DNS puro**
> (resolução direta para o IP do LB), senão o certificado gerenciado não valida e o TLS
> não termina no LB.

### 5.2 Acompanhar o certificado
Depois que o DNS propagar, o Google valida o domínio e emite o certificado (leva de ~15 min
a algumas horas):
```bash
gcloud compute ssl-certificates describe csa-portal-cert --global --project=totvs-iaas \
  --format="value(managed.status, managed.domainStatus)"
```
- `PROVISIONING` = ainda emitindo (aguarde).
- `ACTIVE` + `inscricoes.csa.com.br: ACTIVE` = pronto. Acesse **https://inscricoes.csa.com.br**.

Checagens úteis:
```bash
# DNS resolve para o LB?
dig +short inscricoes.csa.com.br
# resposta esperada: 136.68.128.142

# HTTPS respondendo pelo LB (após ACTIVE):
curl -sS -o /dev/null -w "%{http_code}\n" https://inscricoes.csa.com.br/
```

---

## 6. Virada `inscricoes.csa.com.br` → `inscricao.csa.com.br` (endereço oficial)

Quando terminar os testes e for adotar o endereço oficial **`inscricao.csa.com.br`**, o LB
já está pronto (o Nginx e o backend já respondem por esse `server_name`). Só falta o
certificado e o DNS do novo host.

> Observação: hoje `inscricao.csa.com.br` aponta para `totvs-web01` (portal TOTVS antigo).
> A virada substitui esse apontamento. Faça em janela combinada.

### 6.1 Criar um 2º certificado gerenciado e anexar ao proxy
Um `target-https-proxy` pode servir **vários** certificados (o SNI escolhe pelo host). Assim
os dois domínios funcionam durante a transição.

```bash
P=--project=totvs-iaas

# 1) novo cert gerenciado para o host oficial
gcloud compute ssl-certificates create csa-portal-cert-oficial \
  --domains=inscricao.csa.com.br --global $P

# 2) anexa AMBOS os certs ao proxy (mantém inscricoes + adiciona inscricao)
gcloud compute target-https-proxies update csa-portal-https-proxy \
  --ssl-certificates=csa-portal-cert,csa-portal-cert-oficial --global $P
```

### 6.2 Apontar o DNS do host oficial no Azion
Zona `csa.com.br` → registro **A** `inscricao` → `136.68.128.142` (mesmo IP do LB), DNS puro.
(Se já existir um A/CNAME antigo para o portal TOTVS, **edite/substitua** por este.)

### 6.3 Aguardar `csa-portal-cert-oficial` = ACTIVE
```bash
gcloud compute ssl-certificates describe csa-portal-cert-oficial --global --project=totvs-iaas \
  --format="value(managed.status, managed.domainStatus)"
```
Depois de ACTIVE, `https://inscricao.csa.com.br` responde pela mesma aplicação.

### 6.4 (Opcional) aposentar o host de teste
Quando o oficial estiver validado, você pode remover o A de `inscricoes` no Azion e, se
quiser, desanexar/remover o `csa-portal-cert`:
```bash
gcloud compute target-https-proxies update csa-portal-https-proxy \
  --ssl-certificates=csa-portal-cert-oficial --global --project=totvs-iaas
gcloud compute ssl-certificates delete csa-portal-cert --global --project=totvs-iaas
```
O `server_name` do Nginx já inclui os dois hosts, então nada muda na VM.

---

## 7. Re-deploy da aplicação (nova versão do código)

Use o script `scripts/deploy-app.sh` (roda no Mac). Ele empacota o fonte **sem**
`node_modules`/`.next`/`.env`, envia por scp (IAP), roda `pnpm install` + `pnpm build`
**na VM** (binários Linux corretos), copia `static`/`public` e reinicia o serviço. **Não**
toca no `/etc/csa-portal/.env`.

```bash
bash scripts/deploy-app.sh
# saída esperada ao final: "app / -> 200" e "DEPLOY_OK"
```

Os PDFs de referência em `/opt/csa-portal/docs` **não** são alterados pelo re-deploy.
Para atualizá-los:
```bash
tar czf /tmp/csa-pdfs.tgz -C docs *.pdf
gcloud compute scp /tmp/csa-pdfs.tgz csa-portal01:~/ --zone=southamerica-east1-b --project=totvs-iaas --tunnel-through-iap
gcloud compute ssh csa-portal01 --zone=southamerica-east1-b --project=totvs-iaas --tunnel-through-iap \
  --command='sudo tar xzf ~/csa-pdfs.tgz -C /opt/csa-portal/docs && sudo chown -R csaportal:csaportal /opt/csa-portal/docs && rm ~/csa-pdfs.tgz'
```

---

## 8. Operação do dia a dia

```bash
# acesso à VM
gcloud compute ssh csa-portal01 --zone=southamerica-east1-b --project=totvs-iaas --tunnel-through-iap

# status / logs / restart do app
sudo systemctl status csa-portal
sudo journalctl -u csa-portal -f
sudo systemctl restart csa-portal

# Nginx
sudo nginx -t && sudo systemctl reload nginx

# saúde do backend no LB (do Mac)
gcloud compute backend-services get-health csa-portal-bes --global --project=totvs-iaas
```

Caminhos importantes na VM:
- App (standalone): `/opt/csa-portal/.next/standalone/server.js`
- Env de produção (segredos, 600): `/etc/csa-portal/.env`
- Unit systemd: `/etc/systemd/system/csa-portal.service`
- Site Nginx: `/etc/nginx/sites-available/csa-portal`
- PDFs de referência: `/opt/csa-portal/docs`

---

## 9. Segurança (checklist de go-live)

- [ ] `AUTH_MASTER_KEY` **vazio** no `.env` (o backdoor de teste deve ficar desligado).
- [ ] `INSCRICAO_SOMENTE_LEITURA=false` **apenas** no go-live real.
- [ ] `/etc/csa-portal/.env` com perms `600`, dono `csaportal`.
- [ ] VM sem IP externo (confirmado); SSH só por IAP; SQL liberado só da VM (`10.10.0.20`).
- [ ] Certificado(s) gerenciado(s) `ACTIVE`; HTTP redireciona para HTTPS.
- [ ] Cookie de sessão sai `secure` (o LB envia `X-Forwarded-Proto: https`, repassado pelo Nginx).
