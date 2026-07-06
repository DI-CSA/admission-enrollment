import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { consumir } from "@/lib/rate-limit";
import { obterResponsavelVerbatim } from "@/lib/totvs/queries";
import { registrarEventoFunil } from "@/lib/marketing/rdstation";
import { extrairOrigem } from "@/lib/marketing/origem";

// BFF — beacon do evento de funil "inscricao-iniciada". Disparado pelo cliente
// quando o responsável clica em "incluir candidato" e o wizard de inscrição
// é montado. É intencionalmente escopado à SESSÃO: o e-mail nunca vem do
// cliente — é lido server-side pelo CODUSUARIOPS da sessão. Não-bloqueante e
// tolerante a falha (o rastreio de marketing nunca afeta o fluxo do usuário).

export const dynamic = "force-dynamic";

const LIMITE = 12; // por minuto, por sessão/IP
const JANELA_MS = 60_000;

function ipDe(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

export async function POST(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  // Sem sessão não há a quem atribuir o evento; responde 204 (no-op silencioso)
  // para não poluir o console do cliente com erros de um beacon best-effort.
  if (!sessao || sessao.codUsuarioPS == null) {
    return new NextResponse(null, { status: 204 });
  }

  const limite = consumir(
    `insc-iniciada:${sessao.codUsuarioPS}:${ipDe(req)}`,
    LIMITE,
    JANELA_MS,
  );
  if (!limite.permitido) return new NextResponse(null, { status: 204 });

  try {
    const resp = await obterResponsavelVerbatim(sessao.codUsuarioPS);
    if (resp?.email) {
      const origem = extrairOrigem(req);
      void registrarEventoFunil({
        etapa: "inscricao-iniciada",
        email: resp.email,
        nome: resp.nome,
        idps: sessao.idps,
        clientTrackingId: origem.clientTrackingId,
        trafficSource: origem.trafficSource,
        trafficMedium: origem.trafficMedium,
        trafficCampaign: origem.trafficCampaign,
        camposExtras: { cf_responsavel_reconhecido: "true" },
      });
    }
  } catch (e) {
    console.error("[marketing/inscricao-iniciada] falhou:", e);
  }

  return new NextResponse(null, { status: 204 });
}
