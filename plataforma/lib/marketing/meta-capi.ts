import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  CONSENTIMENTO_UI_ATIVO,
  COOKIE_CONSENTIMENTO,
  lerConsentimentoSerializado,
} from "@/lib/consentimento";

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v23.0";

type NomeEventoMeta =
  | "Lead"
  | "InitiateCheckout"
  | "CompleteRegistration"
  | "Purchase";

interface EventoMetaServidor {
  nome: NomeEventoMeta;
  eventId: string;
  req: NextRequest;
  email?: string | null;
  telefone?: string | null;
  valor?: number | null;
  moeda?: "BRL";
  contentName?: string;
  contentCategory?: string;
  contentIds?: string[];
}

function sha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

function normalizarTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  return digitos.startsWith("55") ? digitos : `55${digitos}`;
}

function ipDe(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
}

function temConsentimentoMarketing(req: NextRequest): boolean {
  // Sem a UI de consentimento (padrão), vale o consentimento implícito — a CAPI
  // envia sem depender do cookie csa_consent (que só é gravado pelo banner).
  if (!CONSENTIMENTO_UI_ATIVO) return true;
  return (
    lerConsentimentoSerializado(
      req.cookies.get(COOKIE_CONSENTIMENTO)?.value,
    )?.marketing === true
  );
}

/**
 * Envia um evento web à Conversions API. Nunca lança e só opera quando:
 * - o visitante autorizou cookies de marketing;
 * - META_CAPI_TOKEN e NEXT_PUBLIC_META_PIXEL_ID estão configurados.
 */
export async function registrarEventoMetaServidor(
  evento: EventoMetaServidor,
): Promise<void> {
  if (!temConsentimentoMarketing(evento.req)) return;

  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const token = process.env.META_CAPI_TOKEN?.trim();
  if (!pixelId || !token) return;

  const email = evento.email?.trim();
  const telefone = evento.telefone?.trim();
  const userData = {
    client_ip_address: ipDe(evento.req),
    client_user_agent: evento.req.headers.get("user-agent") || undefined,
    fbp: evento.req.cookies.get("_fbp")?.value,
    fbc: evento.req.cookies.get("_fbc")?.value,
    ...(email ? { em: [sha256(normalizarEmail(email))] } : {}),
    ...(telefone ? { ph: [sha256(normalizarTelefone(telefone))] } : {}),
  };

  const payload = {
    data: [
      {
        event_name: evento.nome,
        event_time: Math.floor(Date.now() / 1000),
        event_id: evento.eventId,
        action_source: "website",
        event_source_url:
          evento.req.headers.get("referer") ??
          evento.req.headers.get("origin") ??
          evento.req.nextUrl.origin,
        user_data: userData,
        custom_data: {
          ...(evento.valor != null ? { value: evento.valor } : {}),
          ...(evento.moeda ? { currency: evento.moeda } : {}),
          ...(evento.contentName ? { content_name: evento.contentName } : {}),
          ...(evento.contentCategory
            ? { content_category: evento.contentCategory }
            : {}),
          ...(evento.contentIds ? { content_ids: evento.contentIds } : {}),
        },
      },
    ],
    ...(process.env.META_CAPI_TEST_EVENT_CODE?.trim()
      ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE.trim() }
      : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      console.warn("[meta-capi] resposta não-OK:", res.status, evento.nome);
    }
  } catch (erro) {
    console.warn("[meta-capi] falha ao enviar evento:", evento.nome, erro);
  }
}
