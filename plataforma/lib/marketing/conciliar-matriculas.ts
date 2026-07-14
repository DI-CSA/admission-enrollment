import "server-only";

// ---------------------------------------------------------------------------
// Núcleo da conciliação da PRÉ-MATRÍCULA (compartilhado por cron e commit)
// ---------------------------------------------------------------------------
//
// Move a negociação do RD Station CRM conforme o estado do boleto de RESERVA de
// matrícula (R$2.200):
//   - reserva GERADA (STATUSLAN=0) → "Cadastro de matrícula"  (evento cadastro-matricula)
//   - reserva PAGA   (STATUSLAN=1) → "Pré-matrícula"          (evento reserva-matricula-paga)
// e garante que o VALOR da negociação, nessas etapas, seja a reserva (R$2.200).
//
// Forward-only e idempotente. Usado por:
//   - app/api/jobs/conciliar-matriculas (cron, todas as matrículas);
//   - app/api/matricula (commit, apenas a inscrição recém-matriculada — best-effort).

import { listarMatriculasParaConciliarReserva } from "@/lib/totvs/queries";
import {
  listarNegociacoesDoFunil,
  moverNegociacaoParaEtapa,
  ajustarValorReservaDeal,
} from "@/lib/marketing/rdcrm";
import { registrarEventoFunil } from "@/lib/marketing/rdstation";

interface EtapasMatricula {
  cadastro: string;
  pre: string;
  matriculado?: string;
}

/** Lê os IDs das etapas de matrícula do ambiente. null se faltar o essencial. */
export function lerEtapasMatricula(): EtapasMatricula | null {
  const cadastro = process.env.RD_CRM_DEAL_STAGE_CADASTRO_MATRICULA_ID?.trim();
  const pre = process.env.RD_CRM_DEAL_STAGE_PRE_MATRICULA_ID?.trim();
  const matriculado = process.env.RD_CRM_DEAL_STAGE_MATRICULADO_ID?.trim();
  if (!process.env.RD_CRM_TOKEN || !cadastro || !pre) return null;
  return { cadastro, pre, matriculado };
}

export interface ResultadoConciliacaoMatriculas {
  verificadas: number;
  movidasCadastro: number;
  movidasPre: number;
  valoresAjustados: number;
  jaAvancadas: number;
  semDeal: number;
  semIdLan: number;
  semReserva: number;
  falhas: number;
  moveriam?: Array<{ numeroInscricao: number; etapa: string }>;
}

export interface OpcoesConciliacao {
  /** Simulação: não move nem dispara evento; retorna o que seria movido. */
  dryRun?: boolean;
  /** Restringe a UMA inscrição (usado no commit da matrícula). */
  apenasInscricao?: { numeroInscricao: number; idps: number };
}

/**
 * Concilia as matrículas do ciclo com o funil do RD CRM. Retorna os contadores.
 * Nunca lança: erros por item viram `falhas`.
 */
export async function conciliarMatriculas(
  opts: OpcoesConciliacao = {},
): Promise<ResultadoConciliacaoMatriculas> {
  const { dryRun = false, apenasInscricao } = opts;
  const etapas = lerEtapasMatricula();

  const base: ResultadoConciliacaoMatriculas = {
    verificadas: 0,
    movidasCadastro: 0,
    movidasPre: 0,
    valoresAjustados: 0,
    jaAvancadas: 0,
    semDeal: 0,
    semIdLan: 0,
    semReserva: 0,
    falhas: 0,
  };
  if (!etapas) return base;
  const { cadastro: stageCadastro, pre: stagePre, matriculado } = etapas;

  // Etapas "posteriores" a cada alvo (para não regredir): Cadastro < Pré < Matriculado.
  const posterioresA = (alvo: string): Set<string> =>
    alvo === stageCadastro
      ? new Set(
          [stageCadastro, stagePre, matriculado].filter(
            (s): s is string => !!s,
          ),
        )
      : new Set([stagePre, matriculado].filter((s): s is string => !!s));

  let matriculas = await listarMatriculasParaConciliarReserva();
  if (apenasInscricao) {
    matriculas = matriculas.filter(
      (m) =>
        m.numeroInscricao === apenasInscricao.numeroInscricao &&
        m.idps === apenasInscricao.idps,
    );
  }

  const negociacoes = await listarNegociacoesDoFunil();
  const porIdLan = new Map<string, (typeof negociacoes)[number]>();
  for (const n of negociacoes) {
    if (n.idLan) porIdLan.set(n.idLan, n);
  }

  const moveriam: Array<{ numeroInscricao: number; etapa: string }> = [];

  for (const mat of matriculas) {
    if (mat.idLan == null) {
      base.semIdLan++;
      continue;
    }
    if (mat.reservaStatusLan == null) {
      base.semReserva++;
      continue;
    }
    const deal = porIdLan.get(String(mat.idLan));
    if (!deal) {
      base.semDeal++;
      continue;
    }

    const reservaPaga = mat.reservaStatusLan === 1;
    const alvo: string = reservaPaga ? stagePre : stageCadastro;
    const etapaEvento = reservaPaga
      ? ("reserva-matricula-paga" as const)
      : ("cadastro-matricula" as const);

    const jaEmOuDepois =
      !!deal.dealStageId && posterioresA(alvo).has(deal.dealStageId);
    let stageEfetivo = deal.dealStageId;

    if (jaEmOuDepois) {
      base.jaAvancadas++;
    } else if (dryRun) {
      moveriam.push({
        numeroInscricao: mat.numeroInscricao,
        etapa: reservaPaga ? "Pré-matrícula" : "Cadastro de matrícula",
      });
      continue;
    } else {
      const ok = await moverNegociacaoParaEtapa(deal.id, alvo);
      if (!ok) {
        base.falhas++;
        continue;
      }
      stageEfetivo = alvo;
      if (reservaPaga) base.movidasPre++;
      else base.movidasCadastro++;

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

    // Valor da reserva (R$2.200) nas etapas de matrícula — inclusive já avançados.
    if (
      !dryRun &&
      (stageEfetivo === stageCadastro || stageEfetivo === stagePre)
    ) {
      const okValor = await ajustarValorReservaDeal(deal.id);
      if (okValor) base.valoresAjustados++;
    }
  }

  base.verificadas = matriculas.length;
  if (dryRun) base.moveriam = moveriam;
  return base;
}
