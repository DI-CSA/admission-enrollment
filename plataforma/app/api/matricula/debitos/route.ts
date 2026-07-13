import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import { obterDebitosResponsavelFinanceiro } from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

// BFF — validação de débitos do responsável financeiro (leitura). Só é relevante
// quando ParametrosMatricula.validarDebitosResponsavelFinanceiro é verdadeiro.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const idAreaOfertada = Number(sp.get("idAreaOfertada"));
  const cpf = (sp.get("cpf") ?? "").replace(/\D/g, "");
  const idps = Number(sp.get("idps"));
  const idHabilitacaoFilial = Number(sp.get("idHabilitacaoFilial"));
  const nome = sp.get("nome") ?? "";

  if (!Number.isInteger(idAreaOfertada) || idAreaOfertada <= 0 || !cpf) {
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
    const debitos = await obterDebitosResponsavelFinanceiro(rmCookie, {
      idAreaOfertada,
      cpf,
      nome,
      idHabilitacaoFilial: Number.isInteger(idHabilitacaoFilial)
        ? idHabilitacaoFilial
        : 0,
    });
    return NextResponse.json(
      { ok: true, debitos },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/debitos] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
