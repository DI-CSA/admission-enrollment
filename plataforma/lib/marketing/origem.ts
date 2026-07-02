import "server-only";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Origem do lead (atribuição) para o RD Station — leitura server-side.
// ---------------------------------------------------------------------------
//
// A forma IDEAL/estável de atribuir origem (Direct, Organic, Social, Referral,
// Paid, Email) é deixar o RD classificar: o código de rastreamento (rdstation.js)
// na página grava o cookie `__trf.src` com a atribuição de 1º e último toque.
// Aqui, no BFF, lemos esse cookie e o repassamos como `client_tracking_id` no
// evento de conversão — assim o RD amarra o evento server-side à sessão do
// navegador e aplica a origem correta (sem nós reimplementarmos a classificação).
//
// UTMs (utm_source/medium/campaign) podem reforçar a atribuição quando o cliente
// os envia explicitamente; são opcionais e nunca substituem o `client_tracking_id`.

export interface OrigemLead {
  /** Valor do cookie `__trf.src` (sessão de rastreamento do RD). */
  clientTrackingId?: string;
  trafficSource?: string;
  trafficMedium?: string;
  trafficCampaign?: string;
}

/** Extrai os dados de origem da requisição (cookie de rastreamento do RD + UTMs). */
export function extrairOrigem(req: NextRequest): OrigemLead {
  const origem: OrigemLead = {};

  const trf = req.cookies.get("__trf.src")?.value?.trim();
  if (trf) origem.clientTrackingId = trf;

  // UTMs opcionais: aceitos por cookie de 1ª parte (se a página os persistir) ou
  // pela query da própria requisição. Reforço — não é a fonte principal.
  const url = new URL(req.url);
  const utmSource =
    url.searchParams.get("utm_source") ??
    req.cookies.get("utm_source")?.value ??
    undefined;
  const utmMedium =
    url.searchParams.get("utm_medium") ??
    req.cookies.get("utm_medium")?.value ??
    undefined;
  const utmCampaign =
    url.searchParams.get("utm_campaign") ??
    req.cookies.get("utm_campaign")?.value ??
    undefined;
  if (utmSource) origem.trafficSource = utmSource;
  if (utmMedium) origem.trafficMedium = utmMedium;
  if (utmCampaign) origem.trafficCampaign = utmCampaign;

  return origem;
}
