import { NextRequest, NextResponse } from "next/server";
import { listarAreasOfertadas } from "@/lib/totvs/queries";

// BFF — áreas/séries ofertadas de um processo seletivo (leitura SQL read-only).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const idps = Number(req.nextUrl.searchParams.get("idps"));
  if (!Number.isInteger(idps) || idps <= 0) {
    return NextResponse.json(
      { ok: false, erro: "idps-invalido" },
      { status: 400 },
    );
  }

  try {
    const areas = await listarAreasOfertadas(idps);
    return NextResponse.json({ ok: true, areas });
  } catch (e) {
    console.error("[areas] falha na consulta:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
