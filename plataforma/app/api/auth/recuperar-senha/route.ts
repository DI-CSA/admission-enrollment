import { NextRequest, NextResponse } from "next/server";
import { cpfValido } from "@/lib/cpf";
import { consumir } from "@/lib/rate-limit";
import { recuperarSenha } from "@/lib/totvs/auth";

// BFF — recuperação de senha (EduPS). Valida por data de nascimento (dd/MM/yyyy).
// Resposta sempre genérica para não revelar se o CPF/data conferem (anti-enumeração).

const LIMITE = 5;
const JANELA_MS = 60_000;

function ipDe(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

interface Body {
  cpf?: string;
  dataNascimento?: string; // dd/MM/yyyy
  idps?: number;
}

const DATA_RE = /^\d{2}\/\d{2}\/\d{4}$/;

export async function POST(req: NextRequest) {
  const limite = consumir(`recuperar:${ipDe(req)}`, LIMITE, JANELA_MS);
  if (!limite.permitido) {
    const retryAfter = Math.ceil((limite.reiniciaEm - Date.now()) / 1000);
    return NextResponse.json(
      { ok: false, erro: "muitas-tentativas" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, erro: "payload-invalido" },
      { status: 400 },
    );
  }

  const { cpf, dataNascimento, idps } = body;
  if (!cpf || !cpfValido(cpf)) {
    return NextResponse.json(
      { ok: false, erro: "cpf-invalido" },
      { status: 400 },
    );
  }
  if (!dataNascimento || !DATA_RE.test(dataNascimento)) {
    return NextResponse.json(
      { ok: false, erro: "data-invalida" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(idps) || (idps ?? 0) <= 0) {
    return NextResponse.json(
      { ok: false, erro: "idps-invalido" },
      { status: 400 },
    );
  }

  try {
    await recuperarSenha({ cpf, dataNascimento, idps: idps! });
  } catch (e) {
    console.error("[recuperar-senha] falha:", e);
  }

  // Resposta genérica deliberada: não confirma existência do cadastro.
  return NextResponse.json({
    ok: true,
    mensagem:
      "Se os dados conferirem, enviaremos as instruções de redefinição por e-mail.",
  });
}
