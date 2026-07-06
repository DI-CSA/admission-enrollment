import { NextRequest, NextResponse } from "next/server";
import { cpfValido } from "@/lib/cpf";
import { consumir } from "@/lib/rate-limit";
import {
  reconhecerResponsavelPorCpf,
  cpfTemContaPortalAluno,
} from "@/lib/totvs/queries";

// BFF — reconhecimento do responsável pelo CPF (gate de login).
// Segurança: a rota revela se existe cadastro a partir de um CPF, então
//  - rate-limit por IP (anti-enumeração);
//  - valida dígito verificador antes de tocar o banco;
//  - retorna SOMENTE dados mascarados (nunca e-mail/telefone completos).
// Autenticação/redefinição de senha continuam pela WebAPI EduPS.

const LIMITE = 10; // tentativas
const JANELA_MS = 60_000; // por minuto, por IP

function ipDe(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

export async function POST(req: NextRequest) {
  const limite = consumir(`reconhecer:${ipDe(req)}`, LIMITE, JANELA_MS);
  if (!limite.permitido) {
    const retryAfter = Math.ceil((limite.reiniciaEm - Date.now()) / 1000);
    return NextResponse.json(
      { ok: false, erro: "muitas-tentativas" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let cpf: string | undefined;
  try {
    ({ cpf } = (await req.json()) as { cpf?: string });
  } catch {
    return NextResponse.json(
      { ok: false, erro: "payload-invalido" },
      { status: 400 },
    );
  }

  if (!cpf || !cpfValido(cpf)) {
    return NextResponse.json(
      { ok: false, erro: "cpf-invalido" },
      { status: 400 },
    );
  }

  try {
    const [r, ehResponsavelDeAluno] = await Promise.all([
      reconhecerResponsavelPorCpf(cpf),
      cpfTemContaPortalAluno(cpf),
    ]);

    // Resposta intencionalmente enxuta e mascarada.
    // `ehResponsavelDeAluno` (ANTIGO) = tem conta no Portal do Aluno (GUSUARIO) e
    // define o fluxo de senha no cliente:
    //  - true  => senha gerenciada pelo Portal do Aluno;
    //  - false => senha própria do Processo Seletivo.
    // `existe` (ir para login) considera conta no PS OU no Portal do Aluno.
    return NextResponse.json({
      ok: true,
      existe: r.existe || ehResponsavelDeAluno,
      temSenhaCadastrada: r.temSenhaCadastrada,
      ehResponsavelDeAluno,
      nome: r.nome,
      emailMascarado: r.emailMascarado,
    });
  } catch (e) {
    console.error("[reconhecer] falha na consulta:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
