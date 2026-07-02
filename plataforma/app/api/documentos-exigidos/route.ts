import { NextRequest, NextResponse } from "next/server";
import { listarDocumentosExigidos } from "@/lib/totvs/queries";

// BFF — documentos exigidos na inscrição de uma série (PS + área de interesse).
// Leitura SQL read-only. O wizard consulta ao escolher a série; o servidor
// revalida a lista no POST antes de gravar (a obrigatoriedade é autoritativa aqui).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const idps = Number(req.nextUrl.searchParams.get("idps"));
  const idAreaInteresse = Number(
    req.nextUrl.searchParams.get("idAreaInteresse"),
  );
  if (
    !Number.isInteger(idps) ||
    idps <= 0 ||
    !Number.isInteger(idAreaInteresse) ||
    idAreaInteresse <= 0
  ) {
    return NextResponse.json(
      { ok: false, erro: "parametros-invalidos" },
      { status: 400 },
    );
  }
  try {
    const documentos = await listarDocumentosExigidos(idps, idAreaInteresse);
    return NextResponse.json(
      { ok: true, documentos },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[documentos-exigidos] falha na consulta:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
