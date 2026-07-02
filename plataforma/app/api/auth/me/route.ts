import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { obterResponsavelVerbatim } from "@/lib/totvs/queries";

export const dynamic = "force-dynamic";

// BFF — dados de contato do responsável LOGADO (identidade vem SEMPRE da sessão,
// via CODUSUARIOPS; o cliente não informa quem é). Usado para pré-preencher o
// campo de e-mail editável do wizard. Só retorna o e-mail da própria conta.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao || sessao.codUsuarioPS == null) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  try {
    const resp = await obterResponsavelVerbatim(sessao.codUsuarioPS);
    return NextResponse.json(
      {
        ok: true,
        email: resp?.email ?? null,
        nome: resp?.nome ?? null,
        telefone: resp?.telefone1 ?? resp?.telefone2 ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[auth/me] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
