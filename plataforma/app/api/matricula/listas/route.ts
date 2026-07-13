import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import {
  obterListaMatricula,
  type TipoListaMatricula,
} from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

const TIPOS_VALIDOS: TipoListaMatricula[] = [
  "paises",
  "estados",
  "municipios",
  "estadoCivil",
  "nacionalidade",
  "corRaca",
  "grauInstrucao",
  "profissao",
  "tipoRua",
  "tipoBairro",
  "tipoSanguineo",
];

// BFF — listas de apoio (dropdowns) dos formulários de dados pessoais da matrícula.
//   ?tipo=estados&idPais=1        → estados de um país
//   ?tipo=municipios&codEtd=RJ    → municípios de uma UF
// As demais listas não exigem parâmetros. Exige sessão autenticada.
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo") as TipoListaMatricula | null;
  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json(
      { ok: false, erro: "tipo-invalido" },
      { status: 400 },
    );
  }

  const idps = Number(sp.get("idps"));
  const rmCookie =
    Number.isInteger(idps) && idps > 0
      ? await garantirSessaoNoIdps(sessao, idps)
      : sessao.rmCookie;

  try {
    const itens = await obterListaMatricula(rmCookie, tipo, {
      idPais: sp.get("idPais") ?? undefined,
      codEtd: sp.get("codEtd") ?? undefined,
    });
    return NextResponse.json(
      { ok: true, tipo, itens },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (e) {
    console.error("[matricula/listas] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
