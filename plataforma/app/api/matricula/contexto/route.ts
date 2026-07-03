import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import {
  obterResultadoAreaInteresse,
  obterParametrosMatricula,
  obterPeriodoMatricula,
} from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

// BFF — contexto AUTORITATIVO da matrícula de um candidato. Reúne, na WebAPI EduPS:
//   1) resultado por área de interesse (elegibilidade: status + matrícula liberada);
//   2) parâmetros da área ofertada (flags que dirigem os passos do wizard);
//   3) período de matrícula (janela aberta?).
// O NUMEROINSCRICAO é sequencial POR PS; re-autenticamos no idps informado antes de
// consultar. Exige sessão autenticada.
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
  const idps = Number(req.nextUrl.searchParams.get("idps"));
  if (!Number.isInteger(numeroInscricao) || numeroInscricao <= 0) {
    return NextResponse.json(
      { ok: false, erro: "numero-invalido" },
      { status: 400 },
    );
  }

  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;

  try {
    const resultados = await obterResultadoAreaInteresse(
      rmCookie,
      numeroInscricao,
    );
    // Área elegível deste candidato (aprovado/em chamada + matrícula liberada).
    const elegivel = resultados.find((r) => r.elegivel) ?? null;
    if (!elegivel || elegivel.idAreaInteresse == null) {
      return NextResponse.json(
        { ok: true, elegivel: false, resultados },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const idAreaOfertada = elegivel.idAreaInteresse;
    const [parametros, periodo] = await Promise.all([
      obterParametrosMatricula(rmCookie, idAreaOfertada),
      obterPeriodoMatricula(rmCookie, idAreaOfertada),
    ]);

    return NextResponse.json(
      {
        ok: true,
        elegivel: true,
        idAreaOfertada,
        resultado: elegivel,
        parametros,
        periodo,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/contexto] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
