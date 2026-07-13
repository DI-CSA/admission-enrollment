import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import { obterInfoAlunoEducacional } from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

const COD_COLIGADA = Number(process.env.RM_COD_COLIGADA) || 1;

// BFF — situação da matrícula de um candidato no Educacional. A matrícula não
// muda o STATUS da opção (SPSOPCAOINSCRITO), então a forma persistente de saber
// se o candidato JÁ SE MATRICULOU é consultar o aluno no Educacional
// (CentralCandidato/v1/InfoAlunoEducacional): quando há RA, a matrícula foi feita.
// Exige sessão autenticada.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const p = req.nextUrl.searchParams;
  const numeroInscricao = Number(p.get("numeroInscricao"));
  const idps = Number(p.get("idps"));
  if (
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0 ||
    !Number.isInteger(idps) ||
    idps <= 0
  ) {
    return NextResponse.json(
      { ok: false, erro: "parametros-invalidos" },
      { status: 400 },
    );
  }

  const rmCookie = await garantirSessaoNoIdps(sessao, idps);

  try {
    const info = await obterInfoAlunoEducacional(rmCookie, {
      codColigada: COD_COLIGADA,
      idPS: idps,
      numeroInscricao,
    });
    const ra = info?.ra?.trim() || null;
    return NextResponse.json(
      {
        ok: true,
        jaMatriculado: ra != null,
        ra,
        statusMatricula: info?.statusMatricula ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/status] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
