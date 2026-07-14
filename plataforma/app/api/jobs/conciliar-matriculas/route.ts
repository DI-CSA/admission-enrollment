import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  conciliarMatriculas,
  lerEtapasMatricula,
} from "@/lib/marketing/conciliar-matriculas";

// Job de CONCILIAÇÃO DA PRÉ-MATRÍCULA (chamado por cron, NÃO pelo navegador).
//
// Busca no RM as matrículas do ciclo (RAMAT preenchido) com o estado do BOLETO
// DE RESERVA (R$2.200), localiza a negociação no RD Station CRM pela CHAVE ÚNICA
// (IDLAN da TAXA, embutido no nome como `[LAN:<idlan>]`) e a avança para a etapa
// correta do funil, ajustando o valor para a reserva:
//   - reserva GERADA (STATUSLAN=0) → "Cadastro de matrícula" + evento "cadastro-matricula";
//   - reserva PAGA   (STATUSLAN=1) → "Pré-matrícula"        + evento "reserva-matricula-paga".
// Idempotente e FORWARD-ONLY. A lógica mora em lib/marketing/conciliar-matriculas.
//
// Proteção: exige o cabeçalho `x-cron-secret` igual a CRON_SECRET (comparação em
// tempo constante). Sem CRON_SECRET configurado, a rota fica desabilitada.
//
// Cron sugerido na VM (de hora em hora):
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

  if (!lerEtapasMatricula()) {
    return NextResponse.json(
      { ok: false, erro: "crm-nao-configurado" },
      { status: 500 },
    );
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const resultado = await conciliarMatriculas({ dryRun });

  return NextResponse.json({ ok: true, dryRun, ...resultado });
}
