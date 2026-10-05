import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sincronizarVisitasCrm } from "@/lib/agenda/crm-sync";
import { comLockDeSync } from "@/lib/agenda/db";

// Chave arbitrária (mas estável) do advisory lock — distinta por job para não
// colidir com os locks dos demais `conciliar-*` caso ganhem o mesmo tratamento.
const LOCK_CONCILIAR_VISITAS = 0x76_69_73_31; // "vis1"

// Job de SINCRONIZAÇÃO DE VISITAS com o RD CRM (chamado por cron, NÃO pelo browser).
//
// Lê os agendamentos (banco compartilhado `agos`) e reflete no funil:
//  - cria o deal em "Visita agendada" (ou "Visita realizada" se já compareceu);
//  - avança "Visita agendada" → "Visita realizada" quando a secretaria marca
//    comparecimento na AGOS.
// Idempotente (token [VIS:<id>]) e só avança para frente. Cobre reservas do portal
// e do cadastro manual da AGOS. `dry=1` só informa o estado (não altera).
//
// Proteção: cabeçalho `x-cron-secret` == CRON_SECRET (comparação em tempo constante).
//
// Cron sugerido na VM (a cada 15 min):
//   curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" \
//     http://127.0.0.1:3000/api/jobs/conciliar-visitas

export const dynamic = "force-dynamic";

function segredoConfere(fornecido: string, esperado: string): boolean {
  const a = Buffer.from(fornecido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ erro: "cron-desabilitado" }, { status: 503 });
  }
  const fornecido = req.headers.get("x-cron-secret") ?? "";
  if (!segredoConfere(fornecido, cronSecret)) {
    return NextResponse.json({ erro: "nao-autorizado" }, { status: 401 });
  }

  try {
    const r = await comLockDeSync(LOCK_CONCILIAR_VISITAS, sincronizarVisitasCrm);
    if (r === null) {
      // Outra execução já está em andamento (ex.: rodada anterior atrasada por
      // rate-limit do RD) — não roda em paralelo. O próprio cron tenta de novo
      // no próximo ciclo.
      return NextResponse.json({ ok: true, ignorado: "execucao-em-andamento" });
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.warn("[conciliar-visitas] falha:", e);
    return NextResponse.json({ ok: false, erro: "falha-interna" }, { status: 500 });
  }
}
