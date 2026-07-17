"use client";

export type EventoMetaPadrao =
  | "PageView"
  | "Lead"
  | "InitiateCheckout"
  | "CompleteRegistration"
  | "Purchase";

export interface ParametrosEventoMeta {
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  value?: number;
  currency?: "BRL";
  status?: boolean;
}

declare global {
  interface Window {
    fbq?: {
      (
        comando: "track",
        evento: EventoMetaPadrao,
        parametros?: ParametrosEventoMeta,
        opcoes?: { eventID: string },
      ): void;
      (comando: "consent", estado: "grant" | "revoke"): void;
    };
  }
}

export function rastrearEventoMeta(
  evento: EventoMetaPadrao,
  parametros?: ParametrosEventoMeta,
  eventId?: string,
): boolean {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return false;
  }
  if (eventId) {
    window.fbq("track", evento, parametros, { eventID: eventId });
  } else {
    window.fbq("track", evento, parametros);
  }
  return true;
}
