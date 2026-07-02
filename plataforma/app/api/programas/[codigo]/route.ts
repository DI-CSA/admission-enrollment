import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";

export const dynamic = "force-dynamic";

// BFF — programação das avaliações do processo seletivo (PDF). Acesso RESTRITO a
// usuários identificados (sessão autenticada). Os arquivos ficam FORA de public/
// (em `private/programas`) e são servidos apenas após checar a sessão.
//
// Os códigos vêm da habilitação (série) do RM, resolvida pelo vínculo estrutural
// SPSAREAINTERESSE.IDHABILITACAOFILIAL → SHABILITACAOFILIAL.CODHABILITACAO
// (EFI2..EFII9 → F2..F9; EM1/EM2 → M1/M2). O F1 (1º ano do Fundamental) NÃO tem
// programa — apenas edital público — e é rejeitado aqui.
const CODIGOS_VALIDOS = new Set([
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "M1",
  "M2",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const { codigo } = await params;
  const cod = (codigo ?? "").toUpperCase();
  if (!CODIGOS_VALIDOS.has(cod)) {
    return NextResponse.json(
      { ok: false, erro: "programa-invalido" },
      { status: 404 },
    );
  }

  try {
    // Caminho fixo dentro do projeto (incluído no standalone via
    // outputFileTracingIncludes). `cod` é validado contra allowlist acima, então
    // não há risco de path traversal.
    const arquivo = path.join(
      process.cwd(),
      "private",
      "programas",
      `${cod}.pdf`,
    );
    const pdf = await readFile(arquivo);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="programa-${cod}.pdf"`,
        // Documento restrito: nunca cachear em proxies/CDN públicos.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[programas] falha ao ler o arquivo:", e);
    return NextResponse.json(
      { ok: false, erro: "programa-indisponivel" },
      { status: 404 },
    );
  }
}
