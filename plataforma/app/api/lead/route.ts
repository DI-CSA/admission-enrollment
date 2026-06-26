import { NextRequest, NextResponse } from "next/server";

// BFF — captura de lead (RD Station). Roda server-side: o token NUNCA vai ao browser.
// Nunca bloqueia a inscrição por falha de marketing; sem RD_STATION_TOKEN, apenas registra.

interface LeadBody {
  nome?: string;
  email?: string;
  telefone?: string;
  segmento?: string;
  consentimento?: boolean;
}

export async function POST(req: NextRequest) {
  let body: LeadBody;
  try {
    body = (await req.json()) as LeadBody;
  } catch {
    return NextResponse.json({ ok: false, erro: "payload-invalido" }, { status: 400 });
  }

  const { nome, email, telefone, segmento, consentimento } = body ?? {};

  // LGPD: sem consentimento explícito, não capturamos dados pessoais.
  if (!consentimento) {
    return NextResponse.json({ ok: false, erro: "consentimento-obrigatorio" }, { status: 400 });
  }
  if (!nome || !email) {
    return NextResponse.json({ ok: false, erro: "campos-obrigatorios" }, { status: 400 });
  }

  const token = process.env.RD_STATION_TOKEN;
  if (token) {
    try {
      await fetch(`https://api.rd.services/platform/conversions?api_key=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "CONVERSION",
          event_family: "CDP",
          payload: {
            conversion_identifier: `inscricao-2027-${segmento ?? "indefinido"}`,
            name: nome,
            email,
            mobile_phone: telefone ?? "",
            cf_segmento_interesse: segmento ?? "",
          },
        }),
      });
    } catch (e) {
      // Marketing nunca bloqueia o fluxo; apenas registra para diagnóstico.
      console.warn("[lead] falha ao enviar ao RD Station:", e);
    }
  } else {
    console.info("[lead] (stub — RD_STATION_TOKEN ausente):", { nome, email, telefone, segmento });
  }

  return NextResponse.json({ ok: true });
}
