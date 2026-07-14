import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import { consumir } from "@/lib/rate-limit";
import {
  obterResultadoAreaInteresse,
  salvarMatricula,
  matriculaSomenteLeitura,
} from "@/lib/totvs/matricula";
import { reconciliarSenhaPosMatricula } from "@/lib/totvs/senha-ps";
import { conciliarMatriculas } from "@/lib/marketing/conciliar-matriculas";

export const dynamic = "force-dynamic";

const LIMITE = 6;
const JANELA_MS = 60_000;

function ipDe(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

interface Body {
  numeroInscricao?: number;
  idAreaOfertada?: number;
  idps?: number;
  codPlanoPgto?: string | null;
  /** Base64 do contrato assinado (quando o PS exige contrato). */
  arquivoContrato?: string | null;
}

// BFF — EFETIVAÇÃO da matrícula (escrita no RM via EduPS). Única operação que
// grava a matrícula. A elegibilidade é REVALIDADA no servidor (status + matrícula
// liberada) antes de gravar; o cliente não é fonte de verdade. Exige sessão.
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
          "Ambiente em modo somente leitura: a efetivação da matrícula está desativada enquanto o sistema aponta para a base de produção.",
      },
      { status: 503 },
    );
  }

  const limite = consumir(`matricula:${ipDe(req)}`, LIMITE, JANELA_MS);
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

  const numeroInscricao = Number(body.numeroInscricao);
  const idAreaOfertada = Number(body.idAreaOfertada);
  const idps = Number(body.idps);
  if (
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0 ||
    !Number.isInteger(idAreaOfertada) ||
    idAreaOfertada <= 0
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
    // Revalida a elegibilidade no servidor: só grava se o candidato está
    // realmente aprovado/em chamada com matrícula liberada NESTA área ofertada.
    const resultados = await obterResultadoAreaInteresse(
      rmCookie,
      numeroInscricao,
    );
    const elegivel = resultados.find(
      (r) => r.elegivel && r.idAreaInteresse === idAreaOfertada,
    );
    if (!elegivel) {
      return NextResponse.json(
        {
          ok: false,
          erro: "nao-elegivel",
          mensagem:
            "Candidato não está elegível à matrícula nesta área ofertada.",
        },
        { status: 409 },
      );
    }

    const resultado = await salvarMatricula(rmCookie, {
      numeroInscricao,
      idAreaOfertada,
      codPlanoPgto: body.codPlanoPgto ?? null,
      arquivoContrato: body.arquivoContrato ?? null,
      ipClient: ipDe(req),
    });

    if (!resultado.ok) {
      return NextResponse.json(
        {
          ok: false,
          erro: "matricula-falhou",
          mensagem: resultado.erro,
        },
        { status: 502 },
      );
    }

    // Reconciliação de senha: a efetivação da matrícula faz o RM provisionar uma
    // conta no Portal do Aluno (GUSUARIO) com senha própria, diferente da que o
    // usuário usa. Para manter UMA senha nos dois cofres (PS + Portal do Aluno),
    // regravamos o mesmo envelope logo após matricular. Best-effort: nunca derruba
    // a matrícula. Só quando há credenciais na sessão (não vale p/ chave-mestra).
    if (sessao.credenciais?.cpf && sessao.credenciais.senha) {
      try {
        const { ps, portalAluno } = await reconciliarSenhaPosMatricula(
          sessao.credenciais.cpf,
          sessao.credenciais.senha,
        );
        console.info(
          `[matricula] senha reconciliada pós-matrícula (PS=${ps}, PortalAluno=${portalAluno})`,
        );
      } catch (e) {
        console.error("[matricula] reconciliação de senha falhou:", e);
      }
    }

    // Conciliação do funil RD Station (best-effort, NÃO bloqueia a resposta):
    // coloca a negociação em "Cadastro de matrícula" (e ajusta o valor p/ a
    // reserva de R$2.200) assim que a matrícula é efetivada, sem esperar o cron.
    if (Number.isInteger(idps) && idps > 0) {
      void conciliarMatriculas({
        apenasInscricao: { numeroInscricao, idps },
      }).catch((e) =>
        console.error("[matricula] conciliação RD falhou:", e),
      );
    }

    return NextResponse.json(
      {
        ok: true,
        numeroInscricao,
        mensagemConfirmacao: resultado.mensagemConfirmacao,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula] efetivação falhou:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
