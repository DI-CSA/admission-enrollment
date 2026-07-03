import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import {
  baixarArquivoDocumento,
  listarDependentesDoResponsavel,
} from "@/lib/totvs/inscricao";

export const dynamic = "force-dynamic";

// BFF — baixa o arquivo de um documento já enviado. A chave tem o formato
// `CODCOLIGADA|IDPS|NUMEROINSCRICAO|fileName`; validamos que o IDPS/NUMEROINSCRICAO
// da chave pertencem a uma inscrição do responsável antes de baixar.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao || sessao.codUsuarioPS == null) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const chave = req.nextUrl.searchParams.get("chave") ?? "";
  const partes = chave.split("|");
  if (partes.length < 4) {
    return NextResponse.json(
      { ok: false, erro: "chave-invalida" },
      { status: 400 },
    );
  }
  const idps = Number(partes[1]);
  const numeroInscricao = Number(partes[2]);
  if (
    !Number.isInteger(idps) ||
    idps <= 0 ||
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0
  ) {
    return NextResponse.json(
      { ok: false, erro: "chave-invalida" },
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

    // Os bytes reais ficam no servidor de arquivos do RM (o blob SQL só tem o
    // marcador "file on server"), então baixamos pela WebAPI EduPS. A sessão do
    // RM é amarrada a UM idps; garantimos que o cookie esteja escopado ao idps
    // da chave antes de baixar.
    const cookie = await garantirSessaoNoIdps(sessao, idps);
    const arquivo = await baixarArquivoDocumento(cookie, chave);
    if (!arquivo) {
      return NextResponse.json(
        { ok: false, erro: "arquivo-indisponivel" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: true, arquivo },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[inscricao/documento-download] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
