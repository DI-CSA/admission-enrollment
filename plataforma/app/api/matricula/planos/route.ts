import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import { carregarPlanosPagamento } from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

// BFF — planos de pagamento disponíveis para a matrícula de um candidato numa
// área ofertada. Exige sessão autenticada.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const idAreaOfertada = Number(req.nextUrl.searchParams.get("idAreaOfertada"));
  const numeroInscricao = Number(
    req.nextUrl.searchParams.get("numeroInscricao"),
  );
  const idps = Number(req.nextUrl.searchParams.get("idps"));
  if (
    !Number.isInteger(idAreaOfertada) ||
    idAreaOfertada <= 0 ||
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0
  ) {
    return NextResponse.json(
      { ok: false, erro: "parametros-invalidos" },
      { status: 400 },
    );
  }

  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;

  try {
    const planos = await carregarPlanosPagamento(
      rmCookie,
      idAreaOfertada,
      numeroInscricao,
    );
    return NextResponse.json(
      { ok: true, planos },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/planos] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
