import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import { consumir } from "@/lib/rate-limit";
import {
  validarTokenAssinaturaContrato,
  realizarAssinaturaContratoToken,
  reenviarEmailTokenAssinatura,
  matriculaSomenteLeitura,
} from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

const LIMITE = 10;
const JANELA_MS = 60_000;

function ipDe(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

// BFF — validação do token de assinatura do contrato (GET). Não altera estado.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const p = req.nextUrl.searchParams;
  const idAreaOfertada = Number(p.get("idAreaOfertada"));
  const numeroInscricao = Number(p.get("numeroInscricao"));
  const token = (p.get("token") ?? "").trim();
  const idps = Number(p.get("idps"));
  if (
    !Number.isInteger(idAreaOfertada) ||
    idAreaOfertada <= 0 ||
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0 ||
    !token
  ) {
    return NextResponse.json(
      { ok: false, erro: "parametros-invalidos" },
      { status: 400 },
    );
  }

  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;

  try {
    const r = await validarTokenAssinaturaContrato(rmCookie, {
      idAreaOfertada,
      numeroInscricao,
      token,
    });
    return NextResponse.json(
      { ok: r.ok, erro: r.erro },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/assinatura] validação falhou:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}

interface Body {
  acao?: "assinar" | "reenviar";
  idAreaOfertada?: number;
  numeroInscricao?: number;
  idps?: number;
}

// BFF — assinatura do contrato com token (POST). `acao`="reenviar" reenvia o
// e-mail com o token; "assinar" efetiva a assinatura. Ambas alteram estado/enviam
// e-mail, então respeitam o guard de somente leitura. Exige sessão autenticada.
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
      {
        ok: false,
        erro: "somente-leitura",
        mensagem:
          "Ambiente em modo somente leitura: a assinatura do contrato está desativada enquanto o sistema aponta para a base de produção.",
      },
      { status: 503 },
    );
  }

  const limite = consumir(
    `matricula-assinatura:${ipDe(req)}`,
    LIMITE,
    JANELA_MS,
  );
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

  const idAreaOfertada = Number(body.idAreaOfertada);
  const numeroInscricao = Number(body.numeroInscricao);
  const idps = Number(body.idps);
  const acao = body.acao === "reenviar" ? "reenviar" : "assinar";
  if (
    !Number.isInteger(idAreaOfertada) ||
    idAreaOfertada <= 0 ||
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0
  ) {
    return NextResponse.json(
      { ok: false, erro: "parametros-invalidos" },
      { status: 400 },
    );
  }

  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;
  const ipClient = ipDe(req);

  try {
    const r =
      acao === "reenviar"
        ? await reenviarEmailTokenAssinatura(rmCookie, {
            idAreaOfertada,
            numeroInscricao,
            ipClient,
          })
        : await realizarAssinaturaContratoToken(rmCookie, {
            idAreaOfertada,
            numeroInscricao,
            ipClient,
          });
    return NextResponse.json(
      { ok: r.ok, erro: r.erro, mensagem: r.erro },
      { status: r.ok ? 200 : 502 },
    );
  } catch (e) {
    console.error("[matricula/assinatura] ação falhou:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
