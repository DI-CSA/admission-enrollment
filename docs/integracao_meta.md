# Integração Meta Pixel e Conversions API

**Estado:** implementada em 16/07/2026.

## Arquitetura

A integração usa duas fontes complementares:

- **Meta Pixel (navegador):** `PageView` e conversões imediatas;
- **Conversions API (servidor):** replica as conversões imediatas para melhorar a
  confiabilidade e a qualidade de correspondência.

O mesmo `event_id` é enviado pelo navegador e pelo servidor, permitindo que a Meta
deduplique os dois sinais:

```text
inscricao-<idps>-<numeroInscricao>
matricula-<idps>-<numeroInscricao>
```

## Consentimento

A interface de consentimento (banner + botão **Privacidade**) é controlada pela variável
`NEXT_PUBLIC_CONSENTIMENTO_UI`:

- **Desativada (padrão):** o banner **não** aparece e Meta Pixel, Google Analytics e o
  script do RD Station carregam **diretamente** (consentimento implícito). A Conversions
  API também envia sem depender do cookie `csa_consent`.
- **Ativada** (`NEXT_PUBLIC_CONSENTIMENTO_UI=true`): o banner reaparece e passa a gatilhar
  as integrações conforme a escolha do visitante (comportamento descrito abaixo).

> Como é `NEXT_PUBLIC_*`, precisa estar presente **no build** (ver `scripts/deploy-app.sh`).
> A decisão de exibir ou não o banner tem implicações de LGPD e é do time do CSA.

### Quando o banner está ativado

Categorias:

- **Necessários:** sessão, segurança e funcionamento do portal;
- **Análise de audiência:** Google Analytics;
- **Marketing:** Meta Pixel e rastreamento de origem do RD Station.

As preferências ficam no cookie/local storage `csa_consent`, versão 1, por até um ano.
O botão **Privacidade**, no canto inferior esquerdo, permite revisar a decisão. Ao revogar
uma categoria, a aplicação remove os cookies conhecidos daquela categoria.

A Conversions API também verifica o cookie `csa_consent` no servidor. Sem consentimento
de marketing, nenhum evento é enviado à Meta.

## Eventos implementados

| Marco | Evento | Browser + CAPI | Observação |
| --- | --- | --- | --- |
| Visualização de página | `PageView` | Browser | Inclui navegações client-side |
| Inscrição gravada | `CompleteRegistration` | Sim | Deduplicado por inscrição |
| Matrícula efetivada | `CompleteRegistration` | Sim | Categoria `matricula` |

Os eventos `Purchase` da taxa de inscrição e da reserva de matrícula **não são enviados
pelos jobs de conciliação** neste momento. O cron não possui uma prova persistente do
consentimento daquele responsável. Para ativá-los corretamente, primeiro é necessário
persistir a preferência de marketing associada à inscrição em uma base consultável pelo
job. Depois:

- taxa paga → `Purchase`, `value=200`, `currency=BRL`;
- reserva paga → `Purchase`, `value=2200`, `currency=BRL`.

## Variáveis

```dotenv
NEXT_PUBLIC_META_PIXEL_ID=
META_CAPI_TOKEN=
META_GRAPH_API_VERSION=v23.0
META_CAPI_TEST_EVENT_CODE=
NEXT_PUBLIC_CONSENTIMENTO_UI=
```

- `NEXT_PUBLIC_META_PIXEL_ID` é público e precisa existir durante o build.
- `NEXT_PUBLIC_CONSENTIMENTO_UI` liga o banner de consentimento (padrão: desligado).
- `META_CAPI_TOKEN` é secreto e deve existir somente no ambiente do servidor.
- `META_CAPI_TEST_EVENT_CODE` deve ser usado apenas na tela **Test Events** e removido
  antes do go-live.

## Validação

1. Abrir o site em janela anônima e confirmar que não há requests para Meta, Google ou
   RD antes da escolha.
2. Rejeitar opcionais e confirmar que o portal continua funcional.
3. Aceitar Marketing e validar `PageView` com Meta Pixel Helper/Event Manager.
4. Concluir uma inscrição de teste e conferir um único `CompleteRegistration`, com
   Browser e Server deduplicados pelo mesmo `event_id`.
5. Repetir para matrícula.
6. Verificar em **Diagnostics** se há alertas de correspondência, duplicidade ou moeda.

## Arquivos

- `plataforma/components/TrackingConsent.tsx`
- `plataforma/components/MetaPixel.tsx`
- `plataforma/lib/marketing/meta-client.ts`
- `plataforma/lib/marketing/meta-capi.ts`
- `plataforma/lib/marketing/meta-event-id.ts`
- `plataforma/lib/consentimento.ts`
