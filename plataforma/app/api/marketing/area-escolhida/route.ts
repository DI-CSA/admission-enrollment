import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { consumir } from "@/lib/rate-limit";
import { obterResponsavelVerbatim } from "@/lib/totvs/queries";
import { registrarEventoFunil } from "@/lib/marketing/rdstation";
import { extrairOrigem } from "@/lib/marketing/origem";

// BFF — beacon do evento de funil "area-escolhida". Disparado pelo cliente quando o
// responsável seleciona a série/área e avança no wizard de inscrição. Permite medir
// onde o wizard perde gente POR SEGMENTO (o abandono entre escolher a série e
// concluir a inscrição). Escopado à SESSÃO: o e-mail nunca vem do cliente — é lido
// server-side pelo CODUSUARIOPS. Apenas o `segmento` (série escolhida) vem do corpo,
// pois compõe o identificador de conversão por área. Não-bloqueante e tolerante a
// falha (o rastreio de marketing nunca afeta o fluxo do usuário).

export const dynamic = "force-dynamic";

const LIMITE = 12; // por minuto, por sessão/IP
const JANELA_MS = 60_000;

function ipDe(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

interface Corpo {
  segmento?: unknown;
}

export async function POST(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  // Sem sessão não há a quem atribuir o evento; responde 204 (no-op silencioso)
  // para não poluir o console do cliente com erros de um beacon best-effort.
  if (!sessao || sessao.codUsuarioPS == null) {
    return new NextResponse(null, { status: 204 });
  }

  const limite = consumir(
    `area-escolhida:${sessao.codUsuarioPS}:${ipDe(req)}`,
    LIMITE,
    JANELA_MS,
  );
  if (!limite.permitido) return new NextResponse(null, { status: 204 });

  // Segmento (série escolhida) — único dado vindo do cliente; validado como texto.
  let segmento: string | null = null;
  try {
    const corpo = (await req.json()) as Corpo;
    if (typeof corpo?.segmento === "string" && corpo.segmento.trim()) {
      segmento = corpo.segmento.trim();
    }
  } catch {
    // Corpo ausente/inválido: segue sem segmento (evento ainda é útil).
  }

  try {
    const resp = await obterResponsavelVerbatim(sessao.codUsuarioPS);
    if (resp?.email) {
      const origem = extrairOrigem(req);
      void registrarEventoFunil({
        etapa: "area-escolhida",
        email: resp.email,
        nome: resp.nome,
        segmento,
        idps: sessao.idps,
        clientTrackingId: origem.clientTrackingId,
        trafficSource: origem.trafficSource,
        trafficMedium: origem.trafficMedium,
        trafficCampaign: origem.trafficCampaign,
      });
    }
  } catch (e) {
    console.error("[marketing/area-escolhida] falhou:", e);
  }

  return new NextResponse(null, { status: 204 });
}
