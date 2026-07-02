import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { obterBoletoInscricao } from "@/lib/totvs/inscricao";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";

export const dynamic = "force-dynamic";

// BFF — boleto da taxa de inscrição. Exige sessão autenticada.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const numeroInscricao = Number(
    req.nextUrl.searchParams.get("numeroInscricao"),
  );
  if (!Number.isInteger(numeroInscricao) || numeroInscricao <= 0) {
    return NextResponse.json(
      { ok: false, erro: "numero-invalido" },
      { status: 400 },
    );
  }

  // NUMEROINSCRICAO é sequencial POR PS; re-autentica no idps da inscrição.
  const idps = Number(req.nextUrl.searchParams.get("idps"));
  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;

  try {
    const boleto = await obterBoletoInscricao(rmCookie, numeroInscricao);
    if (!boleto) {
      return NextResponse.json(
        { ok: false, erro: "boleto-indisponivel" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: true, boleto },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[inscricao/boleto] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
