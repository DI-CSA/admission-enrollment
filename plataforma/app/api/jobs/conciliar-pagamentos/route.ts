import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { listarInscricoesPagasParaConciliar } from "@/lib/totvs/queries";
import {
  buscarNegociacaoPorNumeroInscricao,
  moverNegociacaoParaEtapa,
} from "@/lib/marketing/rdcrm";
import { registrarEventoFunil } from "@/lib/marketing/rdstation";

// Job de CONCILIAÇÃO DE PAGAMENTO (chamado por cron, NÃO pelo navegador).
//
// Fluxo: busca no RM as inscrições do ciclo com a taxa PAGA (FLAN.STATUSLAN=1),
// localiza a negociação correspondente no RD Station CRM pelo NOME
// ("Inscrição nº N") e a AVANÇA para a etapa "Taxa paga" — e só então dispara
// o evento de Marketing "pagamento-confirmado". Idempotente: só avança quem
// ainda está em "Inscrito" (nunca regride quem já passou dessa etapa).
//
// Proteção: exige o cabeçalho `x-cron-secret` igual a CRON_SECRET (comparação
// em tempo constante). Sem CRON_SECRET configurado, a rota fica desabilitada.
//
// Cron sugerido na VM (2x/dia):
//   curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" \
//     http://127.0.0.1:3000/api/jobs/conciliar-pagamentos

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
    // Rota desabilitada quando o segredo não está configurado.
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

  const stageInscrito = process.env.RD_CRM_DEAL_STAGE_ID?.trim();
  const stagePago = process.env.RD_CRM_DEAL_STAGE_PAGO_ID?.trim();
  if (!process.env.RD_CRM_TOKEN || !stagePago) {
    return NextResponse.json(
      { ok: false, erro: "crm-nao-configurado" },
      { status: 500 },
    );
  }

  // Modo simulação (?dry=1): faz a detecção e a busca dos deals, mas NÃO move
  // no CRM nem dispara evento de Marketing. Serve para testar com segurança
  // apontando para produção. Lista os números que SERIAM movidos.
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";

  const pagas = await listarInscricoesPagasParaConciliar();

  let movidas = 0;
  let semDeal = 0;
  let jaAvancadas = 0;
  let falhas = 0;
  const moveriam: number[] = [];

  for (const insc of pagas) {
    const deal = await buscarNegociacaoPorNumeroInscricao(insc.numeroInscricao);
    if (!deal) {
      semDeal++;
      continue;
    }
    // Já está em "Taxa paga" ou numa etapa posterior → nada a fazer.
    if (deal.dealStageId === stagePago) {
      jaAvancadas++;
      continue;
    }
    // Regra de idempotência: só avança quem está em "Inscrito". Se a etapa
    // "Inscrito" estiver configurada, respeita-a; caso contrário, move desde
    // que não esteja já em "Taxa paga" (verificado acima).
    if (stageInscrito && deal.dealStageId !== stageInscrito) {
      jaAvancadas++;
      continue;
    }

    if (dryRun) {
      // Simulação: apenas registra o que seria movido.
      moveriam.push(insc.numeroInscricao);
      continue;
    }

    const ok = await moverNegociacaoParaEtapa(deal.id, stagePago);
    if (!ok) {
      falhas++;
      continue;
    }
    movidas++;

    // Evento de Marketing só após mover o deal (e apenas 1x, pois na próxima
    // execução o deal já estará em "Taxa paga" e será pulado acima).
    if (insc.emailResponsavel) {
      void registrarEventoFunil({
        etapa: "pagamento-confirmado",
        email: insc.emailResponsavel,
        nome: insc.nomeResponsavel,
        idps: insc.idps,
        camposExtras: {
          cf_numero_inscricao: insc.numeroInscricao,
          ...(insc.nomeCandidato
            ? { cf_nome_candidato: insc.nomeCandidato }
            : {}),
          ...(insc.dataPagamento
            ? { cf_data_pagamento_taxa: insc.dataPagamento }
            : {}),
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    verificadas: pagas.length,
    movidas,
    jaAvancadas,
    semDeal,
    falhas,
    ...(dryRun ? { moveriam } : {}),
  });
}
