export const COOKIE_CONSENTIMENTO = "csa_consent";
export const VERSAO_CONSENTIMENTO = 1;

/**
 * Liga/desliga a interface de consentimento (banner + botão "Privacidade").
 *
 * - **Desativada (padrão):** o banner NÃO aparece e as integrações de marketing/
 *   análise carregam diretamente (consentimento implícito) — tanto no navegador
 *   quanto na Conversions API server-side.
 * - **Ativada** (`NEXT_PUBLIC_CONSENTIMENTO_UI=true`): o banner reaparece e passa a
 *   gatilhar/gravar as preferências, gateando todas as integrações.
 *
 * É `NEXT_PUBLIC_*`, portanto embutida em build-time (precisa estar no build p/ valer).
 */
export const CONSENTIMENTO_UI_ATIVO =
  process.env.NEXT_PUBLIC_CONSENTIMENTO_UI === "true" ||
  process.env.NEXT_PUBLIC_CONSENTIMENTO_UI === "1";

export interface PreferenciasConsentimento {
  versao: number;
  analytics: boolean;
  marketing: boolean;
  atualizadoEm: string;
}

export function lerConsentimentoSerializado(
  valor: string | null | undefined,
): PreferenciasConsentimento | null {
  if (!valor) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(valor)) as Partial<PreferenciasConsentimento>;
    if (
      parsed.versao !== VERSAO_CONSENTIMENTO ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.marketing !== "boolean" ||
      typeof parsed.atualizadoEm !== "string"
    ) {
      return null;
    }
    return parsed as PreferenciasConsentimento;
  } catch {
    return null;
  }
}

