import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { existeUsuario } from "@/lib/totvs/inscricao";

export const dynamic = "force-dynamic";

const COD_COLIGADA = Number(process.env.RM_COD_COLIGADA) || 1;

interface Body {
  nome?: string;
  dataNascimento?: string; // yyyy-MM-dd
  cpf?: string;
  email?: string;
}

// BFF — pré-checagem de duplicidade do candidato (UX). O bloqueio AUTORITATIVO
// continua na EduPS no momento do submit. Exige sessão autenticada.
export async function POST(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
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

  const { nome, dataNascimento, cpf, email } = body ?? {};
  if (!nome || !dataNascimento) {
    return NextResponse.json(
      { ok: false, erro: "campos-obrigatorios" },
      { status: 400 },
    );
  }

  try {
    const r = await existeUsuario(
      sessao.rmCookie,
      { codColigada: COD_COLIGADA, idps: sessao.idps },
      { nome, dataNascimento, cpf: cpf ?? null, email: email ?? null },
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[inscricao/duplicidade] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
