import { NextResponse } from "next/server";
import { visitasHabilitado } from "@/lib/agenda/db";
import { listarSlotsDisponiveis } from "@/lib/agenda/visitas";

// Lista os horários de visita disponíveis (público). Somente leitura.

export const dynamic = "force-dynamic";

export async function GET() {
  if (!visitasHabilitado()) {
    return NextResponse.json({ slots: [] });
  }
  try {
    const slots = await listarSlotsDisponiveis();
    return NextResponse.json({ slots });
  } catch (e) {
    console.warn("[visitas] falha ao listar slots:", e);
    return NextResponse.json({ erro: "indisponivel" }, { status: 503 });
  }
}
