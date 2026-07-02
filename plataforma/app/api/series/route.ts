import { NextResponse } from "next/server";
import { listarSeriesAbertas } from "@/lib/totvs/queries";
import { ANO_PROCESSO } from "@/lib/processos";

// BFF — séries de admissão abertas do ano (agregadas por todos os PS de 2027).
// Leitura SQL read-only. Permite um único link de inscrição: o responsável escolhe
// a série e o IDPS correto vem do próprio item, sem depender de ?segmento.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const series = await listarSeriesAbertas(ANO_PROCESSO);
    return NextResponse.json(
      { ok: true, series },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[series] falha na consulta:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
