import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { obterComprovanteInscricao } from "@/lib/totvs/inscricao";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";

export const dynamic = "force-dynamic";

// BFF — comprovante de inscrição (PDF). Exige sessão autenticada. Espelha o
// endpoint nativo Inscricao/Comprovante: o RM devolve o PDF (TOTVSReport) ou, em
// PS configurados com HTML fixo, um HTML. Servimos o PDF inline; o HTML é
// devolvido como text/html para o navegador abrir em nova aba.
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

  // O NUMEROINSCRICAO é sequencial POR PS e a emissão é escopada ao PS da sessão
  // do RM. Como o RM mantém uma única sessão por usuário, re-autenticamos no idps
  // da inscrição (com as credenciais guardadas) antes de emitir.
  const idps = Number(req.nextUrl.searchParams.get("idps"));
  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;

  try {
    const comp = await obterComprovanteInscricao(rmCookie, numeroInscricao);

    if (comp.base64) {
      const pdf = Buffer.from(comp.base64, "base64");
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="comprovante-inscricao-${numeroInscricao}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (comp.html) {
      return new NextResponse(comp.html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(
      {
        ok: false,
        erro: comp.erro ? "comprovante-falhou" : "comprovante-indisponivel",
        mensagem: comp.erro,
      },
      { status: comp.erro ? 502 : 404 },
    );
  } catch (e) {
    console.error("[inscricao/comprovante] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
