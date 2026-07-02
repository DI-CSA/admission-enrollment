# Plano de deploy — Portal de Inscrições (Next.js) na GCP

> Objetivo: definir como publicar a plataforma Next.js (`plataforma/`) para o
> **lançamento**, suportando um pico de **~200 candidatos simultâneos** no pior
> cenário, usando **somente GCP**, DNS na **Azion** e, se for VM, **Ubuntu**.
>
> **Recomendação (resumo):** subir a plataforma em **uma VM Ubuntu pequena na
> mesma VPC** dos servidores TOTVS, com **Nginx** na frente (TLS + rate limit),
> e a **Azion** apontando para o IP público dessa VM (ou fazendo edge/proxy).
> Cloud Run + Load Balancer é viável e elegante, mas hoje exige **mudanças de
> código** (sessão fora de memória) e **rede serverless→VPC** — trabalho que não
> se paga para 200 usuários. Detalhes e o caminho de migração estão abaixo.

---

## 1. Requisitos do lançamento

- **Carga:** até ~200 candidatos **simultâneos** no pico (surto de divulgação).
  Isso é uma carga **pequena** para um processo Node: cada request do BFF passa
  a maior parte do tempo **aguardando o TOTVS** (WebAPI EduPS + SQL Server), não
  consumindo CPU local.
- **Nuvem:** exclusivamente **GCP** (Google).
- **DNS:** **Azion** (não é o Cloud DNS da Google).
- **SO da instância (se VM):** Ubuntu básico.
- **Conectividade obrigatória:** a plataforma precisa falar com o TOTVS pelos
  **IPs privados da VPC** (`10.10.0.x`), nunca pelos IPs públicos:
  - WebAPI EduPS (escrita/login/boleto): `http://10.10.0.24/FrameHTML/RM/API`
  - SQL CorporeRM (leitura): `10.10.0.2:1433`
  - (fallback) DataServer REST: `http://10.10.0.15:8051`

## 2. Restrições da arquitetura que **decidem** o desenho

Três características do sistema atual pesam mais que a preferência por "serverless":

1. **Sessão é em memória, 1 instância.**
   `lib/totvs/session.ts` guarda o cookie de sessão do RM num `Map` em memória do
   processo. Se houver **mais de uma instância** (autoscaling do Cloud Run, ou 2+
   VMs atrás de um LB **sem afinidade**), um request pode cair numa instância que
   **não tem a sessão** → o usuário "desloga" no meio do fluxo. Portanto:
   - **1 instância** (VM única, ou Cloud Run `min=max=1`), **ou**
   - migrar a sessão para um store compartilhado (**Memorystore/Redis**).

2. **Conectividade privada VPC → TOTVS.**
   Uma VM na mesma VPC fala com `10.10.0.x` **nativamente**. O Cloud Run é
   serverless e, por padrão, **não** enxerga a VPC — precisa de **Direct VPC
   egress** ou **Serverless VPC Access connector** para alcançar os IPs privados.

3. **A escrita no RM é síncrona e é o verdadeiro gargalo.**
   `criarInscricao` (POST `Inscricao/NovaInscricao`) e a geração de boleto batem
   no **IIS/EduPS** e no **SQL Server**. O limite de 200 simultâneos é do
   **TOTVS**, não do Next.js. Escalar a camada Node **não remove** esse gargalo;
   se algo precisa de teste de carga, é o **TOTVS**.

Além disso, há segredos e um **backdoor de teste** (`AUTH_MASTER_KEY`, ver §10 e
o outro item deste PR) que precisam de gestão de ambiente cuidadosa.

## 3. Opção A — VM Ubuntu na mesma VPC (**recomendada** para o lançamento)

Alinhada à decisão de arquitetura já registrada (Node nativo via `systemd`, sem
Docker, na VPC do RM) e ao `next.config.ts` (`output: "standalone"`).

```
Internet ──▶ Azion (DNS + TLS/WAF/CDN opcional)
                     │  (HTTPS)
                     ▼
        ┌─────────────────────────────┐   VM Ubuntu (mesma VPC, IP 10.10.0.x)
        │  Nginx  :443/:80             │
        │   ├─ TLS + rate limit + gzip │
        │   └─ proxy_pass ─▶ 127.0.0.1:3000 (Next.js standalone, systemd)
        └─────────────┬───────────────┘
                      │ IP PRIVADO (VPC)
        ┌─────────────┼───────────────────────────────┐
        ▼             ▼                               ▼
  EduPS WebAPI   SQL CorporeRM                 DataServer REST
  10.10.0.24     10.10.0.2:1433                10.10.0.15:8051
```

**Dimensionamento:** `e2-medium` (2 vCPU, 4 GB) com folga; `e2-small` (2 GB)
atende, mas `e2-medium` dá margem para picos e para o Nginx no mesmo host.
Disco padrão de 20–30 GB. Um único processo Node Next atende **muito mais** que
200 conexões I/O-bound.

**Prós**
- Conectividade privada à VPC **sem configuração extra**.
- **Sessão em memória funciona** (1 instância) — **zero mudança de código**.
- Operação simples e barata; fácil de raciocinar e depurar.
- TLS gerenciável por Let's Encrypt (Nginx) **ou** terminado na Azion.

**Contras**
- Sem autoscaling automático (irrelevante para 200 usuários I/O-bound).
- É um "pet" (você cuida do SO/patch). Mitiga-se com imagem + `systemd` + backups.
- Ponto único: para HA seria preciso 2 VMs + LB + sessão em Redis (ver Opção B).

## 4. Opção B — Cloud Run + HTTPS Load Balancer

Elegante e gerenciado, mas **hoje** custa mudanças. Duas sub-variantes:

**B1 — Cloud Run "1 instância fixa" (`min=max=1`, concorrência alta).**
- Mantém a sessão em memória (só há 1 instância). **Mas** perde o principal
  atrativo do Cloud Run (elasticidade) e ainda precisa de **Direct VPC egress**
  para os IPs `10.10.0.x`. Resultado: complexidade de serverless + rigidez de VM.
  **Não compensa.**

**B2 — Cloud Run elástico "de verdade" (o desenho "certo" para escalar).**
Requer, antes de ligar:
1. **Sessão fora de memória:** trocar o `Map` de `lib/totvs/session.ts` por
   **Memorystore (Redis)**. Sem isso, autoscaling quebra o login.
2. **Rede serverless→VPC:** **Direct VPC egress** (ou VPC connector) para
   alcançar EduPS/SQL nos IPs privados.
3. **Rate limit distribuído:** `lib/rate-limit.ts` também é **em memória** →
   migrar para Redis (senão o limite é por-instância e vaza).
4. **Container:** empacotar o build `standalone` numa imagem (Artifact Registry).
5. **HTTPS LB externo** na frente (certificado gerenciado Google **ou** TLS na
   Azion), com **Cloud Armor** para WAF/rate-limit de borda.

**Prós:** autoscaling, zero gestão de SO, deploy por imagem, Cloud Armor.
**Contras:** exige as 5 mudanças acima; custo/rede mais complexos; e **não
remove o gargalo TOTVS**. Overkill para 200 usuários no lançamento.

## 5. Comparação

| Critério                         | A — VM na VPC (rec.)      | B2 — Cloud Run + LB        |
|----------------------------------|---------------------------|----------------------------|
| Mudança de código                | **Nenhuma**               | Redis p/ sessão + rate limit |
| Rede até o TOTVS (VPC privada)   | Nativa                    | Direct VPC egress/connector |
| Sessão em memória                | OK (1 instância)          | **Quebra** sem Redis       |
| Autoscaling                      | Não                       | Sim                        |
| Gestão de SO/patch               | Sua                       | Gerenciada                 |
| Complexidade de setup            | Baixa                     | Média/Alta                 |
| Custo p/ esta carga              | Baixo                     | Médio                      |
| Adequação a 200 simultâneos      | **Suficiente**            | Suficiente (sobra)         |
| Remove o gargalo do TOTVS?       | Não                       | Não                        |

## 6. DNS (Azion) e TLS

O domínio é gerido na **Azion**. Três cenários, do mais simples ao mais robusto:

1. **Azion só como DNS (A record) → Nginx faz o TLS.**
   Registro `A` do host (ex.: `inscricoes.csa.com.br`) apontando para o **IP
   público estático** da VM. TLS via **Let's Encrypt** no Nginx (`certbot`).
   Simples e suficiente para o lançamento.

2. **Azion Edge (CDN/WAF) na frente → origem = VM.**
   A Azion termina o TLS na borda (cert Azion) e faz proxy para a origem (IP da
   VM, idealmente também HTTPS). Ganha **CDN para estáticos**, **WAF** e
   **mitigação de DDoS** de borda — útil no "surto". Configurar a origem como o
   IP público da VM e travar o firewall da VM para aceitar **só a Azion** + IAP.

3. **Azion → GCP HTTPS LB → (VM ou Cloud Run).**
   Só faz sentido junto com a Opção B2 ou com 2+ VMs em HA. Cert gerenciado
   Google no LB + Cloud Armor. Mais peças para manter.

> Recomendado para o go-live: **cenário 1 ou 2**. O 2 é melhor sob pico porque
> a Azion absorve estáticos e ataques antes de chegar na VM.

**Importante (cookies/HTTPS):** o cookie de sessão é `secure` em produção
(`app/api/auth/login/route.ts`). A borda **deve** falar HTTPS com o browser e o
proxy precisa repassar `X-Forwarded-Proto: https` e `X-Forwarded-For` (o BFF usa
`x-forwarded-for` no rate limit e o `secure` cookie exige HTTPS ponta a ponta).

## 7. Dimensionamento para 200 simultâneos e o gargalo real

- **Camada Node:** um processo Next standalone segura os 200 tranquilamente
  (I/O-bound; o event loop fica quase todo aguardando o TOTVS). CPU/memória de
  `e2-medium` sobram.
- **Gargalo real = TOTVS (IIS/EduPS + SQL Server).** A inscrição (`NovaInscricao`)
  é **síncrona** e pesada. Antes do lançamento:
  - **Testar carga contra o EduPS/SQL**, não contra o Next.js.
  - Considerar **fila/limitação de concorrência** de submissões no BFF (ex.: um
    semáforo para no máx. N `NovaInscricao` em paralelo) para não derrubar o IIS
    num pico — evolução recomendada, fora do escopo deste deploy.
  - Garantir **pool de conexões** do SQL saudável (`lib/totvs/db.ts` já usa pool
    singleton) e limites de conexão do SQL Server compatíveis.
- **Estáticos:** servir via Azion/CDN (cenário 2) tira do Next boa parte da
  carga de assets no pico.

## 8. Passo a passo — Opção A (recomendada)

**Provisionamento**
1. VM `e2-medium`, Ubuntu LTS, **na mesma VPC/sub-rede** do TOTVS, com IP interno
   `10.10.0.x` e **IP público estático** (para a Azion apontar).
2. **Firewall (VPC):**
   - Entrada 443/80 **só** das faixas da Azion (cenário 2) ou aberto + WAF.
   - Entrada 22 só via **IAP**/bastion.
   - Saída para `10.10.0.24` (80), `10.10.0.2` (1433), `10.10.0.15` (8051).
3. Confirmar que a VM alcança os IPs privados: `curl http://10.10.0.24/FrameHTML/RM/API/...`, `nc -vz 10.10.0.2 1433`.

**Runtime**
4. Instalar Node 20 LTS, `pnpm`, `nginx`, `certbot` (cenário 1).
5. Build: `pnpm install --frozen-lockfile && pnpm build`. O `output: standalone`
   gera `.next/standalone/` (servidor autossuficiente) — copiar também
   `.next/static/` e `public/` conforme a doc do Next.
6. **`systemd`** para o Next (`node server.js`, `Environment=NODE_ENV=production`,
   `PORT=3000`, `Restart=always`, `EnvironmentFile=/etc/inscricoes/.env`).
7. **Nginx** como reverse proxy `:443 → 127.0.0.1:3000`, com:
   - `proxy_set_header X-Forwarded-Proto https;`
   - `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
   - `proxy_set_header Host $host;`
   - gzip/brotli para assets, `limit_req` como rede de segurança.
8. TLS: `certbot --nginx` (cenário 1) **ou** cert na Azion (cenário 2).

**DNS**
9. Na Azion, `A` do host → IP público da VM (cenário 1) ou configurar Edge com a
   VM como origem (cenário 2).

**Observabilidade**
10. `journalctl -u` para o serviço; logs do Nginx; healthcheck simples (uma rota
    `GET /` já serve). Opcional: Ops Agent (Cloud Logging/Monitoring).

**Deploy contínuo (simples)**
11. `git pull` + `pnpm build` + `systemctl restart` (ou blue/green com duas
    portas e troca no Nginx). Sem Docker, conforme a decisão de arquitetura.

## 9. Checklist de segurança para o go-live

- [ ] **`AUTH_MASTER_KEY` VAZIA em produção** (backdoor de teste — ver §10).
- [ ] `INSCRICAO_SOMENTE_LEITURA=false` **somente** quando o `RM_API_BASE`
      apontar para o ambiente correto (produção real do lançamento).
- [ ] `.env` fora do repositório, permissão `600`, dono `root`/serviço.
- [ ] Segredos (SQL, RD Station/CRM, `SESSION_SECRET`) só via `EnvironmentFile`.
- [ ] Firewall: 22 só por IAP; 443/80 só pela borda (Azion) quando possível.
- [ ] HTTPS ponta a ponta (cookie `secure`); `X-Forwarded-Proto` repassado.
- [ ] Rate limit ativo (BFF em memória + `limit_req` no Nginx / WAF na Azion).
- [ ] Rotacionar quaisquer credenciais que já tenham vazado em scripts antigos.

## 10. Chave-mestra de teste (`AUTH_MASTER_KEY`) — nota de deploy

Existe um flag de **backdoor de teste** que permite autenticar **qualquer CPF já
cadastrado** com uma "senha mestra", **sem gravar senha** no banco (detalhes na
implementação: `lib/totvs/master-key.ts` + `app/api/auth/login/route.ts`). Regras
de operação:

- Mantê-la **desativada** (variável vazia) em operação normal.
- Ativar **apenas** em janelas de teste controladas (inclusive para validar em
  produção) e **desativar logo depois**.
- Toda autenticação por chave-mestra é **logada** (`console.warn`) — auditar.
- No modo chave-mestra **não há cookie de sessão do RM**: painel e criação de
  inscrição (a `NovaInscricao` é anônima) funcionam; operações *owner-scoped* do
  RM (ex.: 2ª via de boleto) **não** funcionam nesse modo.

## 11. Evolução futura (quando/como migrar para Cloud Run)

Migrar para a Opção **B2** passa a valer a pena quando houver necessidade de
**HA/autoescala** (vários módulos da plataforma, tráfego bem maior). Pré-requisitos
já mapeados, todos incrementais e sem reescrever o produto:

1. **Sessão e rate limit em Redis** (Memorystore) — remove o acoplamento a
   "1 instância".
2. **Direct VPC egress** no Cloud Run para os IPs privados do TOTVS.
3. **Imagem** do build `standalone` no Artifact Registry + pipeline de deploy.
4. **HTTPS LB + Cloud Armor**; Azion no DNS/borda como hoje.

Enquanto o gargalo for o TOTVS e a carga for da ordem de centenas, a **VM na
VPC** entrega o lançamento com menos risco e menos partes móveis.
