// Disparo dos eventos de funil de uma visita (RD Station + Meta CAPI), reutilizando
// a camada de marketing existente. Best-effort: nunca lança nem bloqueia o fluxo do
// visitante (as funções chamadas já engolem os próprios erros; ainda assim o
// chamador deve envolver em try/catch por garantia).

import "server-only";
import type { NextRequest } from "next/server";
import { registrarEventoFunil } from "@/lib/marketing/rdstation";
import { registrarEventoMetaServidor } from "@/lib/marketing/meta-capi";
import { eventIdVisita } from "@/lib/marketing/meta-event-id";
import { extrairOrigem } from "@/lib/marketing/origem";
import type { Agendamento } from "./visitas";

type EtapaVisita = "visita-agendada" | "visita-realizada";

type DadosVisita = Pick<
  Agendamento,
  "id" | "email" | "nome" | "telefone" | "segmento" | "inicio" | "local"
>;

/**
 * Espelha a visita no RD Station (contato + evento de funil, que dispara a
 * automação de confirmação/lembrete) e, quando há consentimento de marketing,
 * na Conversions API do Meta como evento `Schedule` (deduplicado por event_id).
 */
export async function dispararEventosVisita(
  req: NextRequest,
  visita: DadosVisita,
  etapa: EtapaVisita,
  consentimentoMkt: boolean,
): Promise<void> {
  const origem = extrairOrigem(req);

  await registrarEventoFunil({
    etapa,
    email: visita.email,
    nome: visita.nome,
    telefone: visita.telefone,
    segmento: visita.segmento,
    clientTrackingId: origem.clientTrackingId,
    trafficSource: origem.trafficSource,
    trafficMedium: origem.trafficMedium,
    trafficCampaign: origem.trafficCampaign,
    camposExtras: {
      cf_data_visita: visita.inicio,
      ...(visita.local ? { cf_local_visita: visita.local } : {}),
    },
  });

  if (consentimentoMkt) {
    await registrarEventoMetaServidor({
      nome: "Schedule",
      eventId: eventIdVisita(visita.id),
      req,
      email: visita.email,
      telefone: visita.telefone,
      contentName: "Visita ao CSA",
      contentCategory: "visita",
    });
  }
}
