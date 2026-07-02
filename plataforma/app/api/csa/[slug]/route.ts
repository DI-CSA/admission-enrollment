import { NextResponse } from "next/server";
import { carregarConteudoCSA } from "@/lib/csa/conteudo";

// BFF — conteúdo institucional do CSA (CMS público) para os cards da seção
// "Por que o CSA Leblon". O conteúdo é normalizado e cacheado pela própria lib.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const pagina = await carregarConteudoCSA(slug);
    if (!pagina) {
      return NextResponse.json(
        { ok: false, erro: "nao-encontrado" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, pagina });
  } catch (e) {
    console.error("[csa] falha ao carregar conteúdo:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
