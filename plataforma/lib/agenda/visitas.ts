// Domínio do agendador de visitas (lado do PORTAL PÚBLICO). Responsável por:
// listar horários disponíveis (LEITURA), gravar a reserva do visitante (ESCRITA
// controlada por capacidade) e cancelar a própria reserva. A ADMINISTRAÇÃO das
// visitas (criar/editar horários, presença, relatórios) é da plataforma AGOS —
// não vive aqui. Tudo sobre o schema compartilhado `agos` (lib/agenda/db.ts).
// Nada toca o TOTVS RM.

import "server-only";
import { randomUUID } from "node:crypto";
import { comTransacao, query } from "./db";

export type StatusVisita =
  | "agendada"
  | "confirmada"
  | "realizada"
  | "cancelada"
  | "no_show";

export interface SlotDisponivel {
  id: string;
  inicio: string; // ISO
  fim: string; // ISO
  local: string | null;
  vagasRestantes: number;
}

export type PapelParticipante = "pai" | "mae" | "responsavel" | "candidato";

export interface ParticipanteVisita {
  nome: string;
  papel: PapelParticipante;
  /** Série de interesse — usada quando papel = candidato. */
  serie?: string | null;
}

export interface DadosAgendamento {
  slotId: string;
  nome: string;
  email: string;
  telefone?: string | null;
  segmento?: string | null;
  /** Quem vai comparecer (pai/mãe/responsável/candidato). qtd_pessoas = tamanho. */
  participantes?: ParticipanteVisita[];
  qtdPessoas?: number;
  consentimentoMkt?: boolean;
  origem?: {
    clientTrackingId?: string;
    trafficSource?: string;
    trafficMedium?: string;
    trafficCampaign?: string;
    gclid?: string;
  };
}

export interface Agendamento {
  id: string;
  slotId: string;
  nome: string;
  email: string;
  telefone: string | null;
  segmento: string | null;
  qtdPessoas: number;
  status: StatusVisita;
  cancelToken: string;
  inicio: string;
  fim: string;
  local: string | null;
  criadoEm: string;
}

/** Erro de negócio com código estável para o BFF traduzir em HTTP. */
export class ErroAgendamento extends Error {
  constructor(
    public codigo: "slot-inexistente" | "slot-lotado" | "ja-agendado",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/**
 * Lista slots ativos, futuros e com vaga. `vagasRestantes` = capacidade menos os
 * agendamentos não-cancelados (soma de `qtd_pessoas`).
 */
export async function listarSlotsDisponiveis(): Promise<SlotDisponivel[]> {
  const linhas = await query<{
    id: string;
    inicio: Date;
    fim: Date;
    local: string | null;
    vagas_restantes: string; // COUNT/SUM vem como string no pg
  }>(
    // Só horários de tipos PÚBLICOS e ativos aparecem no portal (tipos internos,
    // como "Atendimento ao cliente", ficam de fora).
    `SELECT s.id, s.inicio, s.fim, s.local,
            (s.capacidade - COALESCE(SUM(a.qtd_pessoas) FILTER (WHERE a.status <> 'cancelada'), 0)) AS vagas_restantes
       FROM visita_slot s
       JOIN visita_tipo t ON t.id = s.tipo_id AND t.publico = true AND t.ativo = true
       LEFT JOIN visita_agendamento a ON a.slot_id = s.id
      WHERE s.ativo = true AND s.inicio > now()
      GROUP BY s.id
     HAVING (s.capacidade - COALESCE(SUM(a.qtd_pessoas) FILTER (WHERE a.status <> 'cancelada'), 0)) > 0
      ORDER BY s.inicio ASC`,
  );
  return linhas.map((l) => ({
    id: l.id,
    inicio: l.inicio.toISOString(),
    fim: l.fim.toISOString(),
    local: l.local,
    vagasRestantes: Number(l.vagas_restantes),
  }));
}

/**
 * Agenda uma visita de forma atômica: bloqueia o slot (FOR UPDATE), confere a
 * capacidade e insere. Lança ErroAgendamento em slot inexistente/lotado/duplicado.
 */
export async function agendarVisita(
  dados: DadosAgendamento,
): Promise<Agendamento> {
  const participantes = (dados.participantes ?? [])
    .map((p) => ({
      nome: (p.nome ?? "").trim(),
      papel: p.papel,
      serie: p.serie?.trim() || null,
    }))
    .filter((p) => p.nome);
  // Capacidade conta pessoas: usa o nº de participantes; cai para qtdPessoas/1 se vazio.
  const qtd =
    participantes.length > 0 ? participantes.length : Math.max(1, dados.qtdPessoas ?? 1);
  const cancelToken = randomUUID();

  return comTransacao(async (cli) => {
    const slotRes = await cli.query<{
      id: string;
      capacidade: number;
      inicio: Date;
      fim: Date;
      local: string | null;
    }>(
      // Só permite reservar horários de tipos PÚBLICOS (impede agendar um slot
      // interno via API pública adivinhando o id). Bloqueia apenas a linha do slot.
      `SELECT s.id, s.capacidade, s.inicio, s.fim, s.local
         FROM visita_slot s
         JOIN visita_tipo t ON t.id = s.tipo_id AND t.publico = true AND t.ativo = true
        WHERE s.id = $1 AND s.ativo = true AND s.inicio > now()
        FOR UPDATE OF s`,
      [dados.slotId],
    );
    const slot = slotRes.rows[0];
    if (!slot) {
      throw new ErroAgendamento(
        "slot-inexistente",
        "Horário indisponível ou inexistente.",
      );
    }

    const ocupadasRes = await cli.query<{ ocupadas: string }>(
      `SELECT COALESCE(SUM(qtd_pessoas), 0) AS ocupadas
         FROM visita_agendamento
        WHERE slot_id = $1 AND status <> 'cancelada'`,
      [dados.slotId],
    );
    const ocupadas = Number(ocupadasRes.rows[0]?.ocupadas ?? 0);
    if (ocupadas + qtd > slot.capacidade) {
      throw new ErroAgendamento("slot-lotado", "Este horário já está lotado.");
    }

    let inserida;
    try {
      const ins = await cli.query<{ id: string; criado_em: Date }>(
        // atualizado_em setado explicitamente: a tabela é gerida pelo Prisma da AGOS
        // (@updatedAt não cria DEFAULT no banco), então o insert cru precisa preenchê-lo.
        `INSERT INTO visita_agendamento
           (slot_id, nome, email, telefone, segmento, qtd_pessoas,
            consentimento_mkt, client_tracking_id, utm_source, utm_medium,
            utm_campaign, gclid, cancel_token, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
         RETURNING id, criado_em`,
        [
          dados.slotId,
          dados.nome.trim(),
          dados.email.trim(),
          dados.telefone?.trim() || null,
          dados.segmento?.trim() || null,
          qtd,
          Boolean(dados.consentimentoMkt),
          dados.origem?.clientTrackingId ?? null,
          dados.origem?.trafficSource ?? null,
          dados.origem?.trafficMedium ?? null,
          dados.origem?.trafficCampaign ?? null,
          dados.origem?.gclid ?? null,
          cancelToken,
        ],
      );
      inserida = ins.rows[0];
    } catch (e: unknown) {
      // 23505 = unique_violation → mesmo e-mail já tem agendamento ativo no slot.
      if (typeof e === "object" && e && "code" in e && e.code === "23505") {
        throw new ErroAgendamento(
          "ja-agendado",
          "Este e-mail já tem uma visita marcada para este horário.",
        );
      }
      throw e;
    }

    // Grava os participantes (papel + nome + série do candidato).
    for (const p of participantes) {
      await cli.query(
        `INSERT INTO visita_participante (agendamento_id, nome, papel, serie)
         VALUES ($1, $2, $3, $4)`,
        [inserida.id, p.nome, p.papel, p.serie],
      );
    }

    return {
      id: inserida.id,
      slotId: dados.slotId,
      nome: dados.nome.trim(),
      email: dados.email.trim(),
      telefone: dados.telefone?.trim() || null,
      segmento: dados.segmento?.trim() || null,
      qtdPessoas: qtd,
      status: "agendada",
      cancelToken,
      inicio: slot.inicio.toISOString(),
      fim: slot.fim.toISOString(),
      local: slot.local,
      criadoEm: inserida.criado_em.toISOString(),
    };
  });
}

/** Cancela um agendamento a partir do token (link enviado ao visitante). */
export async function cancelarVisitaPorToken(
  id: string,
  token: string,
): Promise<boolean> {
  const linhas = await query<{ id: string }>(
    `UPDATE visita_agendamento
        SET status = 'cancelada', atualizado_em = now()
      WHERE id = $1 AND cancel_token = $2 AND status <> 'cancelada'
      RETURNING id`,
    [id, token],
  );
  return linhas.length > 0;
}

/** Marca `mkt_sincronizado` após disparar os eventos de funil (idempotência). */
export async function marcarMktSincronizado(id: string): Promise<void> {
  await query(
    `UPDATE visita_agendamento SET mkt_sincronizado = now() WHERE id = $1`,
    [id],
  );
}
