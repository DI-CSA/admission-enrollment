import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import { consumir } from "@/lib/rate-limit";
import {
  obterDadosPessoaisMatricula,
  obterCamposObrigatoriosMatricula,
  salvarDadosPessoaisMatricula,
  atualizarResponsavelTipoRelac,
  matriculaSomenteLeitura,
} from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

const LIMITE = 20;
const JANELA_MS = 60_000;

function ipDe(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

// BFF — dados pessoais do candidato e relacionados para os passos de edição do
// wizard de matrícula. GET reúne as pessoas (SPSUSUARIO) + a parametrização de
// campos visíveis/obrigatórios. POST grava UMA pessoa (guardado por somente-leitura)
// ou atualiza o vínculo responsável×tipo (action="tipo-relac"). Exige sessão.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const numeroInscricao = Number(
    req.nextUrl.searchParams.get("numeroInscricao"),
  );
  const idps = Number(req.nextUrl.searchParams.get("idps"));
  if (!Number.isInteger(numeroInscricao) || numeroInscricao <= 0) {
    return NextResponse.json(
      { ok: false, erro: "numero-invalido" },
      { status: 400 },
    );
  }

  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;

  try {
    const [pessoas, campos] = await Promise.all([
      obterDadosPessoaisMatricula(rmCookie, numeroInscricao),
      obterCamposObrigatoriosMatricula(rmCookie),
    ]);
    return NextResponse.json(
      { ok: true, pessoas, campos },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/dados] GET falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}

interface BodyDados {
  idps?: number;
  action?: "salvar" | "tipo-relac";
  /** Para action "salvar": registro completo da pessoa (bruto editado + flags de papel). */
  pessoa?: Record<string, unknown>;
  /** Para action "tipo-relac". */
  numeroInscricao?: number;
  codUsuarioPSTipoRelac?: number;
  tipoRelacaoUsuario?: number;
}

export async function POST(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  if (matriculaSomenteLeitura()) {
    return NextResponse.json(
      { ok: false, erro: "somente-leitura" },
      { status: 503 },
    );
  }

  const limite = consumir(`matricula-dados:${ipDe(req)}`, LIMITE, JANELA_MS);
  if (!limite.permitido) {
    const retryAfter = Math.ceil((limite.reiniciaEm - Date.now()) / 1000);
    return NextResponse.json(
      { ok: false, erro: "muitas-tentativas" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let body: BodyDados;
  try {
    body = (await req.json()) as BodyDados;
  } catch {
    return NextResponse.json(
      { ok: false, erro: "payload-invalido" },
      { status: 400 },
    );
  }

  const idps = Number(body.idps);
  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;

  try {
    if (body.action === "tipo-relac") {
      if (
        !Number.isInteger(body.numeroInscricao) ||
        !Number.isInteger(body.codUsuarioPSTipoRelac) ||
        !Number.isInteger(body.tipoRelacaoUsuario)
      ) {
        return NextResponse.json(
          { ok: false, erro: "parametros-invalidos" },
          { status: 400 },
        );
      }
      const r = await atualizarResponsavelTipoRelac(rmCookie, {
        numeroInscricao: body.numeroInscricao!,
        codUsuarioPSTipoRelac: body.codUsuarioPSTipoRelac!,
        tipoRelacaoUsuario: body.tipoRelacaoUsuario!,
      });
      return NextResponse.json(r, {
        status: r.ok ? 200 : 422,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (!body.pessoa || typeof body.pessoa !== "object") {
      return NextResponse.json(
        { ok: false, erro: "pessoa-invalida" },
        { status: 400 },
      );
    }
    const r = await salvarDadosPessoaisMatricula(rmCookie, body.pessoa);
    return NextResponse.json(r, {
      status: r.ok ? 200 : 422,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[matricula/dados] POST falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
