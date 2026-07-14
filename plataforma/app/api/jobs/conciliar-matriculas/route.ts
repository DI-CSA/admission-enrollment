import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { listarMatriculasParaConciliarReserva } from "@/lib/totvs/queries";
import {
  listarNegociacoesDoFunil,
  moverNegociacaoParaEtapa,
} from "@/lib/marketing/rdcrm";
import { registrarEventoFunil } from "@/lib/marketing/rdstation";

// Job de CONCILIAÇÃO DA PRÉ-MATRÍCULA (chamado por cron, NÃO pelo navegador).
//
// Fluxo: busca no RM as matrículas do ciclo (RAMAT preenchido) com o estado do
// BOLETO DE RESERVA (R$2.200), localiza a negociação correspondente no RD Station
// CRM pela CHAVE ÚNICA (IDLAN da TAXA, embutido no nome como `[LAN:<idlan>]`) e a
// AVANÇA para a etapa correta do funil:
//   - reserva GERADA (STATUSLAN=0) → "Cadastro de matrícula" + evento "cadastro-matricula";
//   - reserva PAGA   (STATUSLAN=1) → "Pré-matrícula"        + evento "reserva-matricula-paga".
//
// Idempotente e FORWARD-ONLY: nunca regride uma negociação que já esteja na etapa
// alvo ou numa etapa posterior (ex.: "Matriculado", que é sinalizado à mão).
//
// Proteção: exige o cabeçalho `x-cron-secret` igual a CRON_SECRET (comparação em
// tempo constante). Sem CRON_SECRET configurado, a rota fica desabilitada.
//
// Cron sugerido na VM (2x/dia):
//   curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" \
//     http://127.0.0.1:3000/api/jobs/conciliar-matriculas

export const dynamic = "force-dynamic";

/** Compara dois segredos em tempo constante (evita timing attack). */
function segredoConfere(fornecido: string, esperado: string): boolean {
  const a = Buffer.from(fornecido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, erro: "job-desabilitado" },
      { status: 503 },
    );
  }
  const fornecido = req.headers.get("x-cron-secret") ?? "";
  if (!segredoConfere(fornecido, cronSecret)) {
    return NextResponse.json(
      { ok: false, erro: "nao-autorizado" },
      { status: 401 },
    );
  }

  const stageCadastro =
    process.env.RD_CRM_DEAL_STAGE_CADASTRO_MATRICULA_ID?.trim();
  const stagePre = process.env.RD_CRM_DEAL_STAGE_PRE_MATRICULA_ID?.trim();
  const stageMatriculado =
    process.env.RD_CRM_DEAL_STAGE_MATRICULADO_ID?.trim();
  if (!process.env.RD_CRM_TOKEN || !stageCadastro || !stagePre) {
    return NextResponse.json(
      { ok: false, erro: "crm-nao-configurado" },
      { status: 500 },
    );
  }

  // Etapas consideradas "posteriores" a cada alvo (para não regredir). "Cadastro
  // de matrícula" é anterior a "Pré-matrícula", que é anterior a "Matriculado".
  const posterioresA = (alvo: string): Set<string> => {
    if (alvo === stageCadastro)
      return new Set(
        [stageCadastro, stagePre, stageMatriculado].filter(
          (s): s is string => !!s,
        ),
      );
    // alvo === stagePre
    return new Set(
      [stagePre, stageMatriculado].filter((s): s is string => !!s),
    );
  };

  // Modo simulação (?dry=1): detecta e casa os deals, mas NÃO move no CRM nem
  // dispara evento de Marketing. Lista o que SERIA movido.
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";

  const matriculas = await listarMatriculasParaConciliarReserva();

  // Lista as negociações do funil uma vez e indexa por IDLAN da taxa (chave única).
  const negociacoes = await listarNegociacoesDoFunil();
  const porIdLan = new Map<string, (typeof negociacoes)[number]>();
  for (const n of negociacoes) {
    if (n.idLan) porIdLan.set(n.idLan, n);
  }

  let movidasCadastro = 0;
  let movidasPre = 0;
  let jaAvancadas = 0;
  let semDeal = 0;
  let semIdLan = 0;
  let semReserva = 0;
  let falhas = 0;
  const moveriam: Array<{ numeroInscricao: number; etapa: string }> = [];

  for (const mat of matriculas) {
    // Sem IDLAN da taxa não há como reconciliar pela chave única.
    if (mat.idLan == null) {
      semIdLan++;
      continue;
    }
    // Sem título de reserva localizado, nada a fazer (matrícula sem boleto).
    if (mat.reservaStatusLan == null) {
      semReserva++;
      continue;
    }
    const deal = porIdLan.get(String(mat.idLan));
    if (!deal) {
      semDeal++;
      continue;
    }

    const reservaPaga = mat.reservaStatusLan === 1;
    const alvo = reservaPaga ? stagePre : stageCadastro;
    const etapaEvento = reservaPaga
      ? ("reserva-matricula-paga" as const)
      : ("cadastro-matricula" as const);

    // Forward-only: se a negociação já está na etapa alvo ou numa posterior, pula.
    if (deal.dealStageId && posterioresA(alvo).has(deal.dealStageId)) {
      jaAvancadas++;
      continue;
    }

    if (dryRun) {
      moveriam.push({
        numeroInscricao: mat.numeroInscricao,
        etapa: reservaPaga ? "Pré-matrícula" : "Cadastro de matrícula",
      });
      continue;
    }

    const ok = await moverNegociacaoParaEtapa(deal.id, alvo);
    if (!ok) {
      falhas++;
      continue;
    }
    if (reservaPaga) movidasPre++;
    else movidasCadastro++;

    // Evento de Marketing só após mover o deal (e apenas 1x, pois na próxima
    // execução a negociação já estará na etapa alvo e será pulada acima).
    if (mat.emailResponsavel) {
      void registrarEventoFunil({
        etapa: etapaEvento,
        email: mat.emailResponsavel,
        nome: mat.nomeResponsavel,
        idps: mat.idps,
        camposExtras: {
          cf_numero_inscricao: mat.numeroInscricao,
          ...(mat.nomeCandidato
            ? { cf_nome_candidato: mat.nomeCandidato }
            : {}),
          ...(mat.reservaValor != null
            ? { cf_valor_reserva: mat.reservaValor }
            : {}),
          ...(reservaPaga && mat.reservaDataPagamento
            ? { cf_data_pagamento_reserva: mat.reservaDataPagamento }
            : {}),
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    verificadas: matriculas.length,
    movidasCadastro,
    movidasPre,
    jaAvancadas,
    semDeal,
    semIdLan,
    semReserva,
    falhas,
    ...(dryRun ? { moveriam } : {}),
  });
}
