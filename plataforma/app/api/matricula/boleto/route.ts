import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import {
  obterBoletoMatricula,
  obterBoletoMatriculaPdf,
} from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

// BFF — boleto da matrícula. Sem `pdf`: devolve as informações do boleto
// (InfoBoletoMatricula). Com `pdf=1` + `idBoleto`: baixa o PDF da 2ª via (o mesmo
// endpoint 2aviaBoletoCandidato usado na inscrição). Exige sessão autenticada.
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

  // Download do PDF da 2ª via.
  const querPdf = p.get("pdf") === "1";
  const idBoleto = Number(p.get("idBoleto"));
  if (querPdf) {
    if (!Number.isInteger(idBoleto) || idBoleto <= 0) {
      return NextResponse.json(
        { ok: false, erro: "boleto-invalido" },
        { status: 400 },
      );
    }
    try {
      const pdf = await obterBoletoMatriculaPdf(
        rmCookie,
        numeroInscricao,
        idBoleto,
      );
      if (pdf.base64) {
        const bytes = Buffer.from(pdf.base64, "base64");
        return new NextResponse(bytes, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="boleto-matricula-${numeroInscricao}.pdf"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return NextResponse.json(
        {
          ok: false,
          erro: pdf.erro ? "boleto-falhou" : "boleto-indisponivel",
          mensagem: pdf.erro,
        },
        { status: pdf.erro ? 502 : 404 },
      );
    } catch (e) {
      console.error("[matricula/boleto] pdf falhou:", e);
      return NextResponse.json(
        { ok: false, erro: "indisponivel" },
        { status: 503 },
      );
    }
  }

  try {
    const boleto = await obterBoletoMatricula(rmCookie, numeroInscricao);
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
    console.error("[matricula/boleto] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
