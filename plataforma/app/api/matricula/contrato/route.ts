import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import { gerarContratoMatricula } from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

// BFF — gera o PDF do contrato de matrícula. Os ids do relatório vêm dos
// parâmetros da área ofertada (/api/matricula/contexto). Serve o PDF inline.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const p = req.nextUrl.searchParams;
  const idAreaOfertada = Number(p.get("idAreaOfertada"));
  const codColigadaRelatorio = Number(p.get("codColigadaRelatorio"));
  const idRelatorio = Number(p.get("idRelatorio"));
  const numeroInscricao = Number(p.get("numeroInscricao"));
  const idps = Number(p.get("idps"));
  if (
    !Number.isInteger(idAreaOfertada) ||
    idAreaOfertada <= 0 ||
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0 ||
    !Number.isInteger(codColigadaRelatorio) ||
    !Number.isInteger(idRelatorio)
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
    const contrato = await gerarContratoMatricula(rmCookie, {
      idAreaOfertada,
      codColigadaRelatorio,
      idRelatorio,
      numeroInscricao,
    });

    if (contrato.base64) {
      const pdf = Buffer.from(contrato.base64, "base64");
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="contrato-matricula-${numeroInscricao}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(
      {
        ok: false,
        erro: contrato.erro ? "contrato-falhou" : "contrato-indisponivel",
        mensagem: contrato.erro,
      },
      { status: contrato.erro ? 502 : 404 },
    );
  } catch (e) {
    console.error("[matricula/contrato] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
