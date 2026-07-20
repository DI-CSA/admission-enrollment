import { NextRequest, NextResponse } from "next/server";
import { visitasHabilitado } from "@/lib/agenda/db";
import { cancelarVisitaPorToken } from "@/lib/agenda/visitas";

// Cancelamento de uma visita pelo próprio visitante, via link com token
// (sem login). DELETE /api/visitas/<id>?token=<cancel_token>

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!visitasHabilitado()) {
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ erro: "token-ausente" }, { status: 400 });
  }
  try {
    const ok = await cancelarVisitaPorToken(id, token);
    if (!ok) {
      return NextResponse.json({ erro: "nao-encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn("[visitas] falha ao cancelar:", e);
    return NextResponse.json({ erro: "falha-interna" }, { status: 500 });
  }
}
