import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { obterStatusCadastro } from "@/lib/totvs/inscricao";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";

export const dynamic = "force-dynamic";

// BFF — "STATUS DA INSCRIÇÃO" do comprovante (CentralCandidato/v1/StatusCadastro).
// Exige sessão autenticada. A própria EduPS valida que a inscrição pertence ao
// usuário logado (retorna erro caso contrário), então não repetimos a checagem.
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
    const status = await obterStatusCadastro(rmCookie, numeroInscricao);
    if (!status) {
      return NextResponse.json(
        { ok: false, erro: "status-indisponivel" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: true, status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[inscricao/status] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
