import "server-only";

// Sincroniza as visitas (banco compartilhado `agos`) com o funil do RD CRM:
//  - agendamento sem deal            → cria deal em "Visita agendada"
//    (ou direto em "Visita realizada" se já compareceu);
//  - agendamento com status realizada e deal ainda em "Visita agendada"
//    → avança para "Visita realizada".
//
// Idempotente (chave = token [VIS:<id>] no nome do deal) e só avança PARA FRENTE
// (nunca puxa de volta um deal que já passou das etapas de visita — ex.: Inscrito).
// Cobre reservas de AMBAS as origens (portal público e cadastro manual da AGOS),
// pois lê direto a tabela compartilhada. Não-bloqueante.

import { query, visitasHabilitado } from "./db";
import {
  listarNegociacoesDoFunil,
  moverNegociacaoParaEtapa,
  criarNegociacaoVisita,
  extrairIdVisitaDoNome,
} from "@/lib/marketing/rdcrm";

export interface ResultadoSyncVisitas {
  habilitado: boolean;
  criados: number;
  avancados: number;
  total: number;
}

export async function sincronizarVisitasCrm(): Promise<ResultadoSyncVisitas> {
  const AGENDADA = process.env.RD_CRM_DEAL_STAGE_VISITA_AGENDADA_ID?.trim();
  const REALIZADA = process.env.RD_CRM_DEAL_STAGE_VISITA_REALIZADA_ID?.trim();
  if (
    !visitasHabilitado() ||
    !process.env.RD_CRM_TOKEN ||
    !AGENDADA ||
    !REALIZADA
  ) {
    return { habilitado: false, criados: 0, avancados: 0, total: 0 };
  }

  // Mapa token [VIS:<id>] -> deal existente no funil.
  const deals = await listarNegociacoesDoFunil();
  const porVisita = new Map<string, { id: string; dealStageId: string | null }>();
  for (const d of deals) {
    const vid = extrairIdVisitaDoNome(d.nome);
    if (vid) porVisita.set(vid, { id: d.id, dealStageId: d.dealStageId });
  }

  const bookings = await query<{
    id: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    segmento: string | null;
    status: string;
  }>(
    `SELECT id, nome, email, telefone, segmento, status
       FROM visita_agendamento
      WHERE status <> 'cancelada'
      ORDER BY criado_em ASC`,
  );

  let criados = 0;
  let avancados = 0;
  for (const b of bookings) {
    const existente = porVisita.get(b.id);
    const realizada = b.status === "realizada";
    if (!existente) {
      const id = await criarNegociacaoVisita({
        agendamentoId: b.id,
        nome: b.nome,
        email: b.email,
        telefone: b.telefone,
        segmento: b.segmento,
        dealStageId: realizada ? REALIZADA : AGENDADA,
      });
      if (id) criados++;
    } else if (realizada && existente.dealStageId === AGENDADA) {
      // Só avança agendada → realizada. Se já passou (Inscrito+), não mexe.
      const ok = await moverNegociacaoParaEtapa(existente.id, REALIZADA);
      if (ok) avancados++;
    }
  }

  return { habilitado: true, criados, avancados, total: bookings.length };
}
