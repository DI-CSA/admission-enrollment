// Conversões do Google Ads (client-side), disparadas em marcos do funil.
// Espelha o padrão de meta-client.ts: só age no browser, é best-effort (nunca
// lança) e usa o gtag.js já carregado pelo TrackingConsent (sob consentimento de
// marketing). Os IDs são públicos e vêm de env NEXT_PUBLIC_* (build-time).

const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const CONV_INSCRICAO = process.env.NEXT_PUBLIC_GADS_CONVERSAO_INSCRICAO;

type Gtag = (...args: unknown[]) => void;

/**
 * Dispara a conversão "Inscrição Concluída" no Google Ads. Chamar SOMENTE quando
 * a inscrição concluir com sucesso (POST /api/inscricao → 200 + tela de
 * comprovante). Sem gtag carregado ou sem env configurada, é no-op.
 */
export function rastrearConversaoInscricao(value = 1.0): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (!gtag || !ADS_ID || !CONV_INSCRICAO) return;
  try {
    gtag("event", "conversion", {
      send_to: `${ADS_ID}/${CONV_INSCRICAO}`,
      value,
      currency: "BRL",
    });
  } catch {
    /* best-effort: nunca interrompe o fluxo do usuário */
  }
}
