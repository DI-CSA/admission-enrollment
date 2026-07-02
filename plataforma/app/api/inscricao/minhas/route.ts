import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { listarDependentesDoResponsavel } from "@/lib/totvs/inscricao";

export const dynamic = "force-dynamic";

// BFF — lista os candidatos (dependentes) já cadastrados pelo responsável logado,
// com o nº de inscrição. Exige sessão autenticada (cookie do RM, server-side).
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao || sessao.codUsuarioPS == null) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  try {
    const dependentes = await listarDependentesDoResponsavel(
      sessao.codUsuarioPS,
    );
    return NextResponse.json(
      { ok: true, dependentes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[inscricao/minhas] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
