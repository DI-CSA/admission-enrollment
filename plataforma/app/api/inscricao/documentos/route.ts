import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import {
  listarDependentesDoResponsavel,
  listarDocumentosInscricao,
} from "@/lib/totvs/inscricao";

export const dynamic = "force-dynamic";

// BFF — documentos exigidos de uma inscrição do responsável logado, com a
// situação de cada um (entregue/em análise/pendente), a observação da secretaria
// e se ainda podem ser substituídos. Exige sessão autenticada. A coligada e a
// área de interesse são resolvidas no servidor a partir das inscrições do próprio
// responsável (proteção contra IDOR — o cliente só informa nº da inscrição/idps).
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao || sessao.codUsuarioPS == null) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const numeroInscricao = Number(
    req.nextUrl.searchParams.get("numeroInscricao"),
  );
  const idps = Number(req.nextUrl.searchParams.get("idps"));
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

  try {
    const dependentes = await listarDependentesDoResponsavel(
      sessao.codUsuarioPS,
    );
    const dep = dependentes.find(
      (d) => d.numeroInscricao === numeroInscricao && d.idps === idps,
    );
    if (!dep) {
      return NextResponse.json(
        { ok: false, erro: "inscricao-nao-encontrada" },
        { status: 404 },
      );
    }
    if (dep.codColigada == null || dep.idAreaInteresse == null) {
      return NextResponse.json(
        { ok: true, documentos: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const documentos = await listarDocumentosInscricao({
      codColigada: dep.codColigada,
      idps,
      idAreaInteresse: dep.idAreaInteresse,
      numeroInscricao,
    });
    return NextResponse.json(
      { ok: true, documentos },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[inscricao/documentos] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
