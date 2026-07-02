import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import {
  obterBoletoInscricao,
  obterBoletoPdfCandidato,
} from "@/lib/totvs/inscricao";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";

export const dynamic = "force-dynamic";

// BFF — PDF do boleto da taxa de inscrição. Exige sessão autenticada.
//
// Aceita `idBoleto` direto (quando o cliente já o tem via /api/inscricao/boleto)
// ou `numeroInscricao` (resolve o idBoleto chamando InfoBoletoInscricao antes).
// Devolve o PDF (application/pdf) inline; boleto fixo HTML responde 409 com a URL.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const sp = req.nextUrl.searchParams;
  let idBoleto = Number(sp.get("idBoleto"));
  const numeroInscricao = Number(sp.get("numeroInscricao"));
  // NUMEROINSCRICAO é sequencial POR PS; re-autentica no idps da inscrição.
  const idps = Number(sp.get("idps"));
  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;

  try {
    // Sem idBoleto válido: resolve a partir do número de inscrição.
    if (!Number.isInteger(idBoleto) || idBoleto <= 0) {
      if (!Number.isInteger(numeroInscricao) || numeroInscricao <= 0) {
        return NextResponse.json(
          { ok: false, erro: "parametro-invalido" },
          { status: 400 },
        );
      }
      const info = await obterBoletoInscricao(rmCookie, numeroInscricao);
      if (!info) {
        return NextResponse.json(
          { ok: false, erro: "boleto-indisponivel" },
          { status: 404 },
        );
      }
      // Boleto fixo HTML não tem 2ª via em PDF: devolve a URL para o cliente abrir.
      if (!info.temPdf) {
        return NextResponse.json(
          { ok: false, erro: "boleto-html", url: info.urlBoletoFixo },
          { status: 409 },
        );
      }
      idBoleto = info.idBoleto!;
    }

    const resultado = await obterBoletoPdfCandidato(rmCookie, idBoleto);
    if (!resultado.base64) {
      // O RM pode falhar ao registrar o boleto no banco (ex.: ambiente sem
      // integração CNAB). Surfacer a mensagem ajuda o usuário/operador.
      return NextResponse.json(
        {
          ok: false,
          erro: resultado.erro
            ? "boleto-registro-falhou"
            : "boleto-indisponivel",
          mensagem: resultado.erro,
        },
        { status: resultado.erro ? 502 : 404 },
      );
    }

    const pdf = Buffer.from(resultado.base64, "base64");
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="boleto-inscricao-${idBoleto}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[inscricao/boleto/pdf] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
