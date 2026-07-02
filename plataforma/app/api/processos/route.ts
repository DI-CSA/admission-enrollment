import { NextResponse } from "next/server";
import { listarProcessosSeletivos } from "@/lib/totvs/queries";

// BFF — processos seletivos abertos e publicados no portal (leitura SQL read-only).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const processos = await listarProcessosSeletivos({
      apenasPortal: true,
      apenasAbertos: true,
    });
    return NextResponse.json({ ok: true, processos });
  } catch (e) {
    console.error("[processos] falha na consulta:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
