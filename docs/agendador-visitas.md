# Agendador de Visitas

**Estado:** implementado em 17/07/2026 (v1).

Permite ao interessado **marcar uma visita presencial pelo próprio portal** (antes era
combinada por e-mail) e injeta o evento no **funil de marketing/CRM**. Os dados **não** vão
para o TOTVS RM.

## Divisão de responsabilidades

- **Este portal (hotsite-insc):** lado do público — **lê os horários disponíveis** e
  **grava a reserva** do visitante; espelha o evento no marketing/CRM.
- **Plataforma AGOS (a desenvolver em seguida):** **administração** — criar/editar horários
  (slots), marcar presença, relatórios e gestão. É a dona do schema.
- **Banco:** Postgres gerenciado no Cloud SQL, banco `csa`, **schema `agos`** (compartilhado
  com a AGOS). O TOTVS RM segue autoritativo só para inscrição/matrícula.

## Arquitetura

- **Conexão:** `lib/agenda/db.ts` (driver `pg`, pool singleton) lê `DATABASE_URL` (a mesma
  string da AGOS). Remove a query string Prisma (`?schema=/search_path=`) e aplica o schema
  via `options` do pool (`VISITAS_DB_SCHEMA`, padrão `agos`).
- **Domínio:** `lib/agenda/visitas.ts` — `listarSlotsDisponiveis()` (leitura),
  `agendarVisita()` (escrita **anti-overbooking**: transação com `FOR UPDATE` + checagem de
  capacidade) e `cancelarVisitaPorToken()`.
- **Marketing:** `lib/agenda/marketing.ts` dispara `registrarEventoFunil` (RD) e, com
  consentimento, o evento `Schedule` na Conversions API do Meta — reusando `lib/marketing/*`.
- **Contrato das tabelas:** `lib/agenda/schema.sql` (`visita_slot`, `visita_agendamento`).
  Serve para subir o banco de **dev** e como contrato que a AGOS deve seguir; em produção
  as tabelas pertencem à AGOS.

## Rotas (todas públicas)

| Rota | Método | Função |
| --- | --- | --- |
| `/api/visitas/slots` | GET | lista horários com vaga (leitura) |
| `/api/visitas` | POST | grava a reserva (rate-limit) + dispara funil |
| `/api/visitas/[id]?token=` | DELETE | cancela a própria reserva (token no link) |

- **UI pública:** `/agendar-visita` (`components/AgendarVisitaForm.tsx`).
- **Sem área administrativa neste sistema** — isso é da AGOS.

## Integração com marketing/CRM

- **Ao agendar:** evento `visita-agendada` no RD (cria/atualiza o contato e dispara a
  automação de confirmação/lembrete) + `Schedule` no Meta (Pixel na confirmação + CAPI,
  deduplicados por `event_id = visita-<id>`). Atribuição (gclid/UTM/`__trf.src`) é capturada
  por `lib/marketing/origem.ts` — o formulário persiste `gclid`/UTM em cookie de 1ª parte.
- **Consentimento:** o checkbox do formulário grava `consentimento_mkt`; o Meta só recebe com
  consentimento. Idempotência via `mkt_sincronizado`.
- **`visita-realizada`** (comparecimento) será disparado pela **AGOS** (ou por um job futuro
  que leia `status='realizada'`), pois a presença é marcada lá.

## Configuração e operação

Variáveis (ver `.env.example`): `DATABASE_URL` (compartilhada com a AGOS),
`VISITAS_DB_SCHEMA` (padrão `agos`), `VISITAS_DB_SSL`. Segredos só em `.env.local` /
`/etc/csa-portal/.env`.

```bash
# DEV — sobe as tabelas no banco local de testes (localhost:6510) e valida o fluxo:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:6510/csa
pnpm visitas:migrate
```

- **Produção:** **não** rodar `visitas:migrate` — a AGOS cria/possui as tabelas no schema
  `agos`. Este portal só precisa da `DATABASE_URL` apontando para o Cloud SQL.
- **Conectividade (VM):** Cloud SQL por **IP privado na VPC** ou **Auth Proxy**; liberar
  `5432` só da VM. Senha com caracteres especiais deve ir **percent-encoded** na URL.
- **RD Station (parceiro):** criar a automação disparada pela conversão
  `inscricao-2027-visita-agendada` e os custom fields `cf_data_visita`, `cf_local_visita`.

## Fora de escopo (deste sistema)

- Administração de visitas (horários, presença, gestão) → **AGOS**.
- E-mail transacional próprio (confirmação/lembrete fica na automação do RD).
- Conversão offline de visita no Google Ads (Fase 2 de `estrategia-marketing-google-rd-station.md`).
- reCAPTCHA no formulário (hoje há rate-limit; avaliar reforço anti-bot depois).
