import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { conciliarFunilCrm } from "@/lib/marketing/conciliar-funil-crm";

// Job de SINCRONIZAÇÃO E CONCILIAÇÃO 360º DO FUNIL (chamado por cron, NÃO pelo browser).
//
// Lê agendamentos (AGOS) e cruza com Inscrições e Matrículas (TOTVS RM).
// - Fecha negócios zumbis (Zero Zombie Deals).
// - Cria tarefas automáticas no RD CRM para gargalos (no-show, taxa pendente, etc).
// - Atualiza campos de Contexto 360º.
//
// Proteção: cabeçalho `x-cron-secret` == CRON_SECRET (comparação em tempo constante).
//
// Falha segura: só escreve de verdade no RD CRM quando CONCILIAR_FUNIL_CRM_DRY_RUN
// estiver explicitamente "false" no ambiente. Ausente/qualquer outro valor ⇒
// dry-run (só loga o que faria, não chama a API de escrita). Rode em homolog
// com dry-run por padrão, valide os logs, e só então ligue a escrita.
//
// Cron sugerido na VM (a cada hora):
//   curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" \
//     http://127.0.0.1:3000/api/jobs/conciliar-funil-crm

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
    const dryRun = process.env.CONCILIAR_FUNIL_CRM_DRY_RUN !== "false";
    const r = await conciliarFunilCrm({ dryRun });
    return NextResponse.json({ ok: true, dryRun, ...r });
  } catch (e) {
    console.warn("[conciliar-funil-crm] falha:", e);
    return NextResponse.json({ ok: false, erro: "falha-interna" }, { status: 500 });
  }
}
