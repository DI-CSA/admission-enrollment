import { NextRequest, NextResponse } from "next/server";
import { visitasHabilitado } from "@/lib/agenda/db";
import {
  agendarVisita,
  ErroAgendamento,
  marcarMktSincronizado,
} from "@/lib/agenda/visitas";
import { dispararEventosVisita } from "@/lib/agenda/marketing";
import { enviarAlertaVisita } from "@/lib/notificacoes/email-visita";
import { extrairOrigem } from "@/lib/marketing/origem";
import { consumir } from "@/lib/rate-limit";
import { telefoneValido } from "@/lib/telefone";

// Cria um agendamento de visita (público). Grava no store próprio (Postgres),
// NUNCA no TOTVS. Dispara os eventos de funil (RD/Meta) de forma best-effort.

export const dynamic = "force-dynamic";

const LIMITE = 5;
const JANELA_MS = 60_000;

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function ipDe(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "desconhecido"
  );
}

export async function POST(req: NextRequest) {
  if (!visitasHabilitado()) {
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }

  const rl = consumir(`visita:${ipDe(req)}`, LIMITE, JANELA_MS);
  if (!rl.permitido) {
    return NextResponse.json({ erro: "muitas-tentativas" }, { status: 429 });
  }

  let corpo: {
    slotId?: string;
    nome?: string;
    email?: string;
    telefone?: string;
    segmento?: string;
    qtdPessoas?: number;
    participantes?: { nome?: string; papel?: string; serie?: string | null }[];
    consentimentoMkt?: boolean;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "payload-invalido" }, { status: 400 });
  }

  const PAPEIS = ["pai", "mae", "responsavel", "candidato"] as const;
  type Papel = (typeof PAPEIS)[number];
  const participantes = (corpo.participantes ?? [])
    .map((p) => ({
      nome: (p?.nome ?? "").trim(),
      papel: (p?.papel ?? "") as Papel,
      serie: p?.serie?.trim() || null,
    }))
    .filter((p) => p.nome && PAPEIS.includes(p.papel));

  const nome = (corpo.nome ?? "").trim();
  const email = (corpo.email ?? "").trim();
  const telefone = (corpo.telefone ?? "").trim();
  const segmento = (corpo.segmento ?? "").trim();
  // Todos os campos são obrigatórios.
  if (!corpo.slotId || nome.length < 2 || !emailValido(email) || !segmento) {
    return NextResponse.json({ erro: "dados-invalidos" }, { status: 400 });
  }
  if (!telefone || !telefoneValido(telefone)) {
    return NextResponse.json({ erro: "telefone-invalido" }, { status: 400 });
  }
  if (participantes.length === 0) {
    return NextResponse.json({ erro: "participantes-obrigatorios" }, { status: 400 });
  }
  if (participantes.some((p) => p.papel === "candidato" && !p.serie)) {
    return NextResponse.json({ erro: "serie-obrigatoria" }, { status: 400 });
  }

  try {
    const origem = extrairOrigem(req);
    const visita = await agendarVisita({
      slotId: corpo.slotId,
      nome,
      email,
      telefone: telefone || null,
      segmento,
      participantes,
      qtdPessoas: corpo.qtdPessoas,
      consentimentoMkt: Boolean(corpo.consentimentoMkt),
      origem,
    });

    // Marketing best-effort — nunca quebra a confirmação da visita.
    try {
      await dispararEventosVisita(
        req,
        visita,
        "visita-agendada",
        Boolean(corpo.consentimentoMkt),
      );
      await marcarMktSincronizado(visita.id);
    } catch (e) {
      console.warn("[visitas] falha ao espelhar no marketing:", e);
    }

    // Alerta interno para a secretaria (com BCC de acompanhamento) — best-effort,
    // nunca quebra a confirmação da visita.
    try {
      await enviarAlertaVisita({
        nome,
        email,
        telefone: telefone || null,
        segmento,
        participantes,
        inicio: visita.inicio,
        fim: visita.fim,
        local: visita.local,
      });
    } catch (e) {
      console.warn("[visitas] falha ao enviar alerta de e-mail:", e);
    }

    return NextResponse.json({
      id: visita.id,
      cancelToken: visita.cancelToken,
      inicio: visita.inicio,
      fim: visita.fim,
      local: visita.local,
      eventId: `visita-${visita.id}`,
    });
  } catch (e) {
    if (e instanceof ErroAgendamento) {
      const status = e.codigo === "slot-lotado" ? 409 : 422;
      return NextResponse.json(
        { erro: e.codigo, mensagem: e.message },
        { status },
      );
    }
    console.warn("[visitas] falha ao agendar:", e);
    return NextResponse.json({ erro: "falha-interna" }, { status: 500 });
  }
}
