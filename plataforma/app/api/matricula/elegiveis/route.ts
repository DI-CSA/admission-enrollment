import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { listarCandidatosElegiveisMatricula } from "@/lib/totvs/queries";

export const dynamic = "force-dynamic";

// BFF — lista os candidatos (dependentes) do responsável logado que estão
// elegíveis à matrícula pelo portal (aprovados/em chamada + matrícula liberada),
// no ciclo atual. Pré-filtro rápido; a validação autoritativa ocorre por candidato
// via /api/matricula/contexto (WebAPI). Exige sessão autenticada.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao || sessao.codUsuarioPS == null) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  try {
    const candidatos = await listarCandidatosElegiveisMatricula(
      sessao.codUsuarioPS,
    );
    return NextResponse.json(
      { ok: true, candidatos },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/elegiveis] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
