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
  atualizarCamposVisitaDeal,
  extrairIdVisitaDoNome,
} from "@/lib/marketing/rdcrm";

const SITUACAO_LABEL: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Compareceu",
  no_show: "Não compareceu",
};

const ORIGEM_LABEL_CRM: Record<string, string> = {
  portal: "Portal de inscrições",
  telefone: "Telefone",
  email: "E-mail",
  whatsapp: "WhatsApp",
  presencial: "Presencial",
  outro: "Outro",
  planilha: "Planilha (histórico)",
};

function fmtVisitaBr(d: Date | string): string {
  return new Date(d).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface ResultadoSyncVisitas {
  habilitado: boolean;
  criados: number;
  avancados: number;
  atualizados: number;
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
    return { habilitado: false, criados: 0, avancados: 0, atualizados: 0, total: 0 };
  }

  // Mapa token [VIS:<id>] -> deal existente no funil.
  const deals = await listarNegociacoesDoFunil();
  const porVisita = new Map<string, { id: string; dealStageId: string | null }>();
  for (const d of deals) {
    const vid = extrairIdVisitaDoNome(d.nome);
    if (vid) porVisita.set(vid, { id: d.id, dealStageId: d.dealStageId });
  }

  // Sincroniza só o ciclo de admissão atual: visitas a partir de
  // VISITAS_RD_SYNC_DESDE (padrão 2026-01-01 → admissão 2027; exclui as de 2025).
  // Ignora também os importados sem e-mail real (placeholder @import.csa.invalid),
  // que não têm contato para o CRM. Canceladas sempre fora.
  const desde = process.env.VISITAS_RD_SYNC_DESDE?.trim() || "2026-01-01";
  const bookings = await query<{
    id: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    segmento: string | null;
    status: string;
    origem_contato: string;
    operador: string;
    tipo_publico: boolean | null;
    tipo_nome: string | null;
    inicio: Date;
    local: string | null;
    participantes: string | null;
  }>(
    `SELECT a.id, a.nome, a.email, a.telefone, a.segmento, a.status,
            a.origem_contato, a.operador,
            t.publico AS tipo_publico, t.nome AS tipo_nome,
            s.inicio AS inicio, s.local AS local,
            (SELECT string_agg(
                p.papel || ': ' || p.nome || COALESCE(' (' || p.serie || ')', ''),
                '; ' ORDER BY p.criado_em)
               FROM visita_participante p
              WHERE p.agendamento_id = a.id) AS participantes
       FROM visita_agendamento a
       JOIN visita_slot s ON s.id = a.slot_id
       LEFT JOIN visita_tipo t ON t.id = s.tipo_id
      WHERE a.status <> 'cancelada'
        AND s.inicio >= $1::timestamptz
        AND a.email NOT LIKE '%@import.csa.invalid'
      ORDER BY a.criado_em ASC`,
    [desde],
  );

  let criados = 0;
  let avancados = 0;
  let atualizados = 0;
  for (const b of bookings) {
    const existente = porVisita.get(b.id);
    const realizada = b.status === "realizada";
    // Origem, para discernir no RD (nome do deal + deal_source, filtrável):
    //  - tipo interno (ex.: Atendimento ao cliente) → usa o nome do tipo;
    //  - tipo público via portal (origem_contato='portal') → "Visita (Portal)";
    //  - tipo público via secretaria (cadastro manual) → "Visita (Secretaria)".
    const interno = b.tipo_publico === false;
    const viaPortal = b.origem_contato === "portal";
    const titulo = interno
      ? b.tipo_nome || "Atendimento ao cliente"
      : viaPortal
        ? "Visita (Portal)"
        : "Visita (Secretaria)";
    const sourceName = interno
      ? b.tipo_nome || "Atendimento ao cliente"
      : viaPortal
        ? "Portal — Agendamento de visita"
        : "Secretaria — Agendamento de visita";
    // Dados completos do agendamento → campos personalizados do deal.
    const dados = {
      segmento: b.segmento,
      dataHora: b.inicio ? fmtVisitaBr(b.inicio) : null,
      tipo: b.tipo_nome,
      situacao: SITUACAO_LABEL[b.status] ?? b.status,
      operador: b.operador,
      participantes: b.participantes,
      local: b.local,
      origem: ORIGEM_LABEL_CRM[b.origem_contato] ?? b.origem_contato,
    };
    if (!existente) {
      const id = await criarNegociacaoVisita({
        agendamentoId: b.id,
        nome: b.nome,
        email: b.email,
        telefone: b.telefone,
        dealStageId: realizada ? REALIZADA : AGENDADA,
        titulo,
        sourceName,
        ...dados,
      });
      if (id) criados++;
    } else {
      // Deal já existe: atualiza os campos (backfill + mantém "situação" em dia)
      // e avança agendada → realizada quando a secretaria marca comparecimento.
      const ok = await atualizarCamposVisitaDeal(existente.id, dados);
      if (ok) atualizados++;
      if (realizada && existente.dealStageId === AGENDADA) {
        const mov = await moverNegociacaoParaEtapa(existente.id, REALIZADA);
        if (mov) avancados++;
      }
    }
  }

  return { habilitado: true, criados, avancados, atualizados, total: bookings.length };
}
