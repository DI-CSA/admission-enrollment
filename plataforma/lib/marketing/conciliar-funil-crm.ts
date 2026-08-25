import "server-only";

// ---------------------------------------------------------------------------
// Núcleo da conciliação 360º de CRM (Visitas + Inscrições + Matrículas)
// ---------------------------------------------------------------------------
//
// Duas responsabilidades (ver docs/CRM/plano_articulacao_funil_crm_visitas_inscricoes.md):
//
// 1. "Zero Zombie Deal": fecha o card de VISITA quando a família já avançou
//    para Inscrição/Matrícula em um card SEPARADO. Quando `VISITAS_DEAL_UNICO`
//    está ligado (é o caso hoje), a fusão visita→inscrição já acontece na HORA
//    da inscrição (`registrarNegociacaoInscricao`) — este job vira uma REDE DE
//    SEGURANÇA para os casos em que a fusão não rolou (e-mail divergente entre
//    visita e inscrição, deal criado antes da flag existir, falha pontual da
//    API). Por isso: só fecha o deal de visita quando ele for DIFERENTE do
//    deal de inscrição atual da mesma família — nunca o próprio card já em
//    andamento (que teria os dois tokens `[VIS:]`/`[LAN:]` no nome).
//
// 2. Contexto 360º: grava no card de Inscrição/Matrícula o status consolidado
//    do funil (`RD_CRM_CF_INSCRICAO_STATUS_ID`/`_MATRICULA_STATUS_ID`/
//    `_VINCULO_STATUS_ID`) e, quando não houve fusão automática, os dados da
//    visita — para a equipe não precisar abrir dois sistemas.
//
// Idempotente: tags são mescladas (nunca duplicam); tarefas de follow-up só são
// criadas se ainda não existir uma aberta com o mesmo assunto no deal.
//
// ⚠️ Gargalo por tempo (Visita sem inscrição > 3 dias; Taxa sem pagamento > 48h;
// Taxa paga sem reserva > 5 dias) do plano original NÃO está implementado —
// exigiria colunas de data que a consulta atual não traz. Hoje a tarefa é
// criada assim que a condição é detectada (o dedup evita duplicar a cada
// execução, só não atrasa a criação). Ver nota na função `deveCriarTarefa`.

import {
  listarNegociacoesDoFunil,
  criarTarefaCrm,
  atualizarTagsDeal,
  marcarNegociacaoGanha,
  listarTarefasAbertasDoDeal,
  concluirTarefa,
  reagendarTarefa,
  atualizarContexto360Deal,
  cursoPretendidoDePS,
  extrairIdVisitaDoNome,
  type NegociacaoCrm,
} from "@/lib/marketing/rdcrm";
import { SITUACAO_LABEL } from "@/lib/agenda/crm-sync";
import { query as queryAgos } from "@/lib/agenda/db";
import { query as queryTotvs } from "@/lib/totvs/db";
import { ANO_PROCESSO } from "@/lib/processos";

export interface ResultadoConciliacaoFunil {
  dealsEncerrados: number;
  tarefasFechadasDeZumbis: number;
  tagsAtualizadas: number;
  contextosAtualizados: number;
  tarefasCriadas: number;
  /** Tarefas "Incentivar Matrícula" adiadas (candidato ainda não em chamada). */
  tarefasIncentivoAdiadas: number;
  /** Tarefas "Incentivar Matrícula" ativadas (data puxada p/ hoje ao entrar em chamada). */
  tarefasIncentivoAtivadas: number;
  falhas: number;
  logs: Array<{
    tipo:
      | "zero_zombie"
      | "contexto_360"
      | "tarefa_followup"
      | "incentivo_adiado"
      | "incentivo_ativado"
      | "identidade_duvidosa";
    mensagem: string;
    dealId?: string;
  }>;
}

/** Prefixo do assunto das tarefas de incentivo à matrícula (para localizá-las). */
const INCENTIVO_SUBJECT_PREFIX = "Incentivar Matrícula de ";

/**
 * Data-estacionamento para onde as tarefas "Incentivar Matrícula" prematuras são
 * ADIADAS enquanto o candidato não está em chamada. Padrão: 02/10/2026 — a data de
 * divulgação dos resultados, quando o "em chamada" é ajustado. Assim a tarefa
 * ressurge na fila exatamente quando passa a fazer sentido (e o motor, se estiver
 * rodando, já a terá ativado antes disso ao detectar a chamada). Configurável por
 * env para ciclos futuros. Formato "YYYY-MM-DD".
 */
const INCENTIVO_PARK_DATE =
  process.env.CONCILIAR_INCENTIVO_PARK_DATE?.trim() || "2026-10-02";

interface VisitaAgos {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  status: string;
  operador: string | null;
  inicio: Date;
  participantes: string | null;
}

interface InscricaoTotvs {
  NUMEROINSCRICAO: number;
  IDLAN: number | null;
  RAMAT: string | null;
  CANDIDATO: string;
  /** Nome do PS (SPSPROCESSOSELETIVO.NOME) = curso pretendido. */
  PS_NOME: string | null;
  RESP_EMAIL: string | null;
  RESP_CPF: string | null;
  STATUSLAN: number | null;
  RESERVA_STATUS: number | null;
  MAT_PLATIVO: string | null;
  /**
   * 1 quando o candidato está "em chamada" — SPSOPCAOINSCRITO.STATUS ∈ (5=EmChamada,
   * 7=CompareceuChamada). É o sinal AUTORITATIVO de "apto a matricular AGORA": vale
   * para TODAS as séries (o 1º ano do Fundamental, sem prova, já entra em chamada logo
   * após a taxa; as séries com prova/entrevista só entram após o resultado). Mesmo
   * critério de `listarCandidatosElegiveisMatricula` (lib/totvs/queries.ts).
   */
  EM_CHAMADA: number | null;
}

/** "Taxa de inscrição paga" | "Taxa gerada — aguardando pagamento" | etc. */
function textoStatusInscricao(insc: InscricaoTotvs): string {
  if (insc.STATUSLAN === 1) return "Taxa de inscrição (R$200) paga";
  if (insc.STATUSLAN === 0) return "Taxa de inscrição (R$200) gerada — aguardando pagamento";
  return "Sem taxa de inscrição gerada";
}

/** "Matriculado" | "Reserva paga — aguardando matrícula" | etc. */
function textoStatusMatricula(insc: InscricaoTotvs): string {
  if (insc.RAMAT) return "Matriculado";
  if (insc.RESERVA_STATUS === 1) return "Reserva de matrícula (R$2.200) paga — aguardando efetivação";
  if (insc.RESERVA_STATUS === 0) return "Reserva de matrícula (R$2.200) gerada — aguardando pagamento";
  if (insc.STATUSLAN === 1)
    return insc.EM_CHAMADA === 1
      ? "Em chamada — apto a gerar a reserva de matrícula (R$2.200)"
      : "Taxa paga — aguardando chamada/resultado do processo seletivo (prova/entrevista)";
  return "Não aplicável (inscrição pendente)";
}

/**
 * Cria a tarefa de follow-up se ainda não existir uma aberta com o mesmo
 * assunto (idempotência). Não implementa os limiares de tempo do plano
 * original (ver nota no topo do arquivo) — cria assim que a condição bate.
 */
async function deveCriarTarefa(dealId: string, subject: string): Promise<boolean> {
  const abertas = await listarTarefasAbertasDoDeal(dealId);
  return !abertas.some((t) => t.subject === subject);
}

export async function conciliarFunilCrm(
  opts: { dryRun?: boolean } = {},
): Promise<ResultadoConciliacaoFunil> {
  const { dryRun = false } = opts;
  const base: ResultadoConciliacaoFunil = {
    dealsEncerrados: 0,
    tarefasFechadasDeZumbis: 0,
    tagsAtualizadas: 0,
    contextosAtualizados: 0,
    tarefasCriadas: 0,
    tarefasIncentivoAdiadas: 0,
    tarefasIncentivoAtivadas: 0,
    falhas: 0,
    logs: [],
  };

  const log = (
    tipo: ResultadoConciliacaoFunil["logs"][number]["tipo"],
    mensagem: string,
    dealId?: string,
  ) => {
    base.logs.push({ tipo, mensagem, dealId });
  };

  try {
    // 1. Todas as negociações do funil, indexadas por token de visita / IDLAN.
    const deals = await listarNegociacoesDoFunil();
    const dealsVisita = new Map<string, NegociacaoCrm>();
    const dealsInscricao = new Map<string, NegociacaoCrm>();
    for (const d of deals) {
      const vid = extrairIdVisitaDoNome(d.nome);
      if (vid) dealsVisita.set(vid, d);
      if (d.idLan) dealsInscricao.set(String(d.idLan), d);
    }

    // 2. Visitas no AGOS (mesmo ciclo do sync de visitas — VISITAS_RD_SYNC_DESDE).
    const desde = process.env.VISITAS_RD_SYNC_DESDE?.trim() || "2026-01-01";
    const visitas = await queryAgos<VisitaAgos>(
      `SELECT a.id, a.nome, a.email, a.telefone, a.status, a.operador,
              s.inicio AS inicio,
              (SELECT string_agg(
                  p.papel || ': ' || p.nome || COALESCE(' (' || p.serie || ')', ''),
                  '; ' ORDER BY p.criado_em)
                 FROM visita_participante p WHERE p.agendamento_id = a.id) AS participantes
         FROM visita_agendamento a
         JOIN visita_slot s ON s.id = a.slot_id
        WHERE a.status <> 'cancelada'
          AND s.inicio >= $1::timestamptz
          AND a.email IS NOT NULL
        ORDER BY a.criado_em ASC`,
      [desde],
    );

    // 3. Inscrições no TOTVS (com status financeiro/acadêmico do responsável).
    // Filtra pelo ciclo atual (ps.NOME LIKE @ano) — SPSINSCRICAOAREAOFERTADA
    // acumula linhas de TODOS os PS/anos já rodados (não há coluna de período
    // letivo na tabela); sem esse filtro, o casamento por e-mail do
    // responsável cruza irmãos/reinscrições de ciclos diferentes e infla os
    // resultados (mesmo padrão de `listarInscricoesPagasParaConciliar`).
    const anoAtual = process.env.PS_ANO_ATUAL?.trim() || String(ANO_PROCESSO);
    const inscricoes = await queryTotvs<InscricaoTotvs>(
      `SELECT i.NUMEROINSCRICAO, i.IDLAN, i.RAMAT, u.NOME AS CANDIDATO,
              ps.NOME AS PS_NOME,
              resp.EMAIL AS RESP_EMAIL, resp.CPF AS RESP_CPF,
              fl.STATUSLAN,
              res.STATUSLAN AS RESERVA_STATUS,
              mat.PLATIVO AS MAT_PLATIVO,
              CASE WHEN EXISTS (
                SELECT 1 FROM SPSOPCAOINSCRITO o
                 WHERE o.CODCOLIGADA = i.CODCOLIGADA AND o.IDPS = i.IDPS
                   AND o.NUMEROINSCRICAO = i.NUMEROINSCRICAO
                   AND o.STATUS IN (5, 7)
              ) THEN 1 ELSE 0 END AS EM_CHAMADA
         FROM SPSINSCRICAOAREAOFERTADA i
         JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA = i.CODCOLIGADA AND ps.IDPS = i.IDPS
         JOIN SPSUSUARIO u ON u.CODUSUARIOPS = i.CODUSUARIOPS
         OUTER APPLY (
           SELECT TOP 1 ru.EMAIL, ru.CPF FROM SPSUSUARIOTIPORELAC r
           JOIN SPSUSUARIO ru ON ru.CODUSUARIOPS = r.CODUSUARIOTIPORELAC
           WHERE r.CODUSUARIOPS = i.CODUSUARIOPS AND r.TIPORELAC = 5
           ORDER BY ru.CODUSUARIOPS DESC
         ) resp
         LEFT JOIN FLAN fl ON fl.CODCOLIGADA = i.CODCOLIGADALAN AND fl.IDLAN = i.IDLAN
         OUTER APPLY (
           SELECT TOP 1 l.STATUSLAN FROM SPARCELA p
           JOIN SLAN s ON s.CODCOLIGADA = p.CODCOLIGADA AND s.IDPARCELA = p.IDPARCELA
           JOIN FLAN l ON l.CODCOLIGADA = s.CODCOLIGADA AND l.IDLAN = s.IDLAN
           WHERE p.CODCOLIGADA = i.CODCOLIGADA AND p.RA = i.RAMAT AND l.STATUSLAN IN (0,1)
           ORDER BY l.DATAVENCIMENTO ASC, l.IDLAN ASC
         ) res
         OUTER APPLY (
           SELECT TOP 1 m.CODSTATUS, ss.PLATIVO FROM SMATRICPL m
           LEFT JOIN SSTATUS ss ON ss.CODCOLIGADA = m.CODCOLIGADA AND ss.CODSTATUS = m.CODSTATUS
           WHERE m.CODCOLIGADA = i.CODCOLIGADA AND m.RA = i.RAMAT
         ) mat
        WHERE ps.NOME LIKE @ano`,
      { ano: `%${anoAtual}%` },
    );

    // 4. Cruzamento e resolução.
    // Duas inscrições (irmãos) podem casar com o MESMO e-mail de responsável e,
    // portanto, com o MESMO dealVisita — sem este controle, o zumbi seria
    // fechado/contado uma vez por irmão (idempotente na escrita, mas infla
    // dealsEncerrados/tagsAtualizadas no resultado).
    const visitasJaFechadasNesteRun = new Set<string>();
    for (const insc of inscricoes) {
      const emailResp = insc.RESP_EMAIL?.toLowerCase().trim();
      const dealInscricao = insc.IDLAN ? dealsInscricao.get(String(insc.IDLAN)) : null;
      const visitaCorrespondente = visitas.find(
        (v) => v.email?.toLowerCase().trim() === emailResp,
      );
      const dealVisita = visitaCorrespondente
        ? dealsVisita.get(visitaCorrespondente.id)
        : null;

      // --- 4.1 Zero Zombie Deal ---------------------------------------------
      // Só fecha se for um deal DIFERENTE do de inscrição (senão é o próprio
      // card único, já em andamento — não deve ser tocado).
      if (
        dealVisita &&
        !dealVisita.fechado &&
        dealVisita.id !== dealInscricao?.id &&
        !visitasJaFechadasNesteRun.has(dealVisita.id)
      ) {
        visitasJaFechadasNesteRun.add(dealVisita.id);
        const tagVisita =
          visitaCorrespondente!.status === "no_show" ? "no-show-convertido" : "visita-convertida";
        if (dryRun) {
          log(
            "zero_zombie",
            `[dry-run] Encerraria o card de visita ${dealVisita.id} (já convertido em Inscrição #${insc.NUMEROINSCRICAO}), tag "${tagVisita}".`,
            dealVisita.id,
          );
          base.dealsEncerrados++;
        } else {
          const [ok, tagOk] = await Promise.all([
            marcarNegociacaoGanha(dealVisita.id),
            atualizarTagsDeal(dealVisita.id, [tagVisita]),
          ]);
          if (ok) base.dealsEncerrados++;
          else base.falhas++;
          if (tagOk) base.tagsAtualizadas++;
          else base.falhas++;

          const tarefasAbertas = await listarTarefasAbertasDoDeal(dealVisita.id);
          let fechadas = 0;
          for (const t of tarefasAbertas) {
            if (await concluirTarefa(t.id)) fechadas++;
            else base.falhas++;
          }
          base.tarefasFechadasDeZumbis += fechadas;
          log(
            "zero_zombie",
            `Card de visita ${dealVisita.id} encerrado (Inscrição #${insc.NUMEROINSCRICAO}) — ${fechadas} tarefa(s) fechada(s), tag "${tagVisita}".`,
            dealVisita.id,
          );
        }
      }

      // --- 4.2 Contexto 360º + tarefas de follow-up -------------------------
      if (dealInscricao && !dealInscricao.fechado) {
        const vinculoStatus = visitaCorrespondente
          ? "CPF conferido — mesma família da visita"
          : "Inscrição direta — sem visita agendada";

        if (dryRun) {
          log(
            "contexto_360",
            `[dry-run] Atualizaria Contexto 360 do deal ${dealInscricao.id}: "${textoStatusInscricao(insc)}" / "${textoStatusMatricula(insc)}" / "${vinculoStatus}" / curso "${cursoPretendidoDePS(insc.PS_NOME) ?? "—"}".`,
            dealInscricao.id,
          );
        } else {
          const ok = await atualizarContexto360Deal(dealInscricao.id, {
            inscricaoStatus: textoStatusInscricao(insc),
            matriculaStatus: textoStatusMatricula(insc),
            vinculoStatus,
            cursoPretendido: insc.PS_NOME,
            // Só preenche o contexto da visita quando NÃO houve fusão
            // automática (deal_único já teria copiado isso na hora).
            ...(visitaCorrespondente && dealVisita?.id !== dealInscricao.id
              ? {
                  visitaSituacao: SITUACAO_LABEL[visitaCorrespondente.status] ?? visitaCorrespondente.status,
                  visitaOperador: visitaCorrespondente.operador,
                  visitaParticipantes: visitaCorrespondente.participantes,
                }
              : {}),
          });
          if (ok) base.contextosAtualizados++;
        }

        if (visitaCorrespondente?.status === "no_show" && insc.MAT_PLATIVO === "S") {
          if (dryRun) {
            log(
              "tarefa_followup",
              `[dry-run] Aplicaria tag "no-show-convertido" na inscrição #${insc.NUMEROINSCRICAO}.`,
              dealInscricao.id,
            );
            base.tagsAtualizadas++;
          } else if (await atualizarTagsDeal(dealInscricao.id, ["no-show-convertido"])) {
            base.tagsAtualizadas++;
          } else {
            base.falhas++;
          }
        }

        // Follow-up "Ligar - taxa não paga": criação simples e idempotente.
        if (insc.STATUSLAN === 0) {
          const subject = `Ligar para ${insc.CANDIDATO} - Taxa de R$200 não paga`;
          const notes = `Inscrição #${insc.NUMEROINSCRICAO}: taxa gerada, ainda sem pagamento.`;
          if (dryRun) {
            log("tarefa_followup", `[dry-run] Criaria tarefa: "${subject}"`, dealInscricao.id);
            base.tarefasCriadas++;
          } else if (await deveCriarTarefa(dealInscricao.id, subject)) {
            if (await criarTarefaCrm(dealInscricao.id, subject, notes)) {
              base.tarefasCriadas++;
              log("tarefa_followup", `Tarefa criada: "${subject}"`, dealInscricao.id);
            } else {
              base.falhas++;
            }
          }
        }

        // "Incentivar Matrícula" GERENCIADA pela data conforme o sinal "em chamada".
        // A API do RD CRM v1 não exclui tarefas; então, em vez de criar-e-apagar,
        // controlamos a DATA da tarefa:
        //  • EM CHAMADA  → garante 1 tarefa ATIVA (data = hoje): cria se não houver;
        //                  se estiver adiada, puxa a data de volta; estaciona extras.
        //  • FORA da chamada → ADIA a(s) tarefa(s) para INCENTIVO_PARK_DATE, tirando-a
        //                  da fila sem marcá-la como concluída (não infla relatório).
        // É o motor que ativa/adia — não dá para resolver com um adiamento único,
        // pois o dedup de criação suprimiria a nova tarefa quando a chamada saísse.
        if (insc.STATUSLAN === 1 && insc.RESERVA_STATUS === null && !insc.RAMAT) {
          const subjectIncentivo = `Incentivar Matrícula de ${insc.CANDIDATO} (R$2.200)`;
          const abertas = (await listarTarefasAbertasDoDeal(dealInscricao.id)).filter(
            (t) => t.subject.startsWith(INCENTIVO_SUBJECT_PREFIX),
          );
          const hoje = new Date().toISOString().slice(0, 10);
          const dataDe = (t: (typeof abertas)[number]) => (t.date ?? "").slice(0, 10);

          if (insc.EM_CHAMADA === 1) {
            if (abertas.length === 0) {
              const notes = `Inscrição #${insc.NUMEROINSCRICAO}: taxa paga e em chamada; reserva de matrícula ainda não gerada.`;
              if (dryRun) {
                log("tarefa_followup", `[dry-run] Criaria tarefa: "${subjectIncentivo}"`, dealInscricao.id);
                base.tarefasCriadas++;
              } else if (await criarTarefaCrm(dealInscricao.id, subjectIncentivo, notes, hoje)) {
                base.tarefasCriadas++;
                log("tarefa_followup", `Tarefa criada: "${subjectIncentivo}"`, dealInscricao.id);
              } else {
                base.falhas++;
              }
            } else {
              // Ativa a 1ª (se estiver adiada no futuro); estaciona as demais (duplicatas).
              const [principal, ...extras] = abertas;
              if (dataDe(principal) > hoje) {
                if (dryRun) {
                  log("incentivo_ativado", `[dry-run] Ativaria tarefa (data→hoje) de #${insc.NUMEROINSCRICAO} (em chamada).`, dealInscricao.id);
                  base.tarefasIncentivoAtivadas++;
                } else if (await reagendarTarefa(principal.id, hoje)) {
                  base.tarefasIncentivoAtivadas++;
                  log("incentivo_ativado", `Tarefa ativada (em chamada): "${principal.subject}".`, dealInscricao.id);
                } else {
                  base.falhas++;
                }
              }
              for (const t of extras) {
                if (dataDe(t) !== INCENTIVO_PARK_DATE) {
                  if (dryRun) {
                    log("incentivo_adiado", `[dry-run] Estacionaria tarefa duplicada de #${insc.NUMEROINSCRICAO}.`, dealInscricao.id);
                    base.tarefasIncentivoAdiadas++;
                  } else if (await reagendarTarefa(t.id, INCENTIVO_PARK_DATE, "Duplicata — adiada automaticamente.")) {
                    base.tarefasIncentivoAdiadas++;
                    log("incentivo_adiado", `Tarefa duplicada estacionada: "${t.subject}".`, dealInscricao.id);
                  } else {
                    base.falhas++;
                  }
                }
              }
            }
          } else {
            // Fora da chamada: adia todas as tarefas de incentivo abertas.
            for (const t of abertas) {
              if (dataDe(t) !== INCENTIVO_PARK_DATE) {
                if (dryRun) {
                  log("incentivo_adiado", `[dry-run] Adiaria tarefa "${t.subject}" para ${INCENTIVO_PARK_DATE} (#${insc.NUMEROINSCRICAO}: ainda não em chamada).`, dealInscricao.id);
                  base.tarefasIncentivoAdiadas++;
                } else if (
                  await reagendarTarefa(
                    t.id,
                    INCENTIVO_PARK_DATE,
                    "Adiada automaticamente — aguardando chamada/resultado do processo seletivo.",
                  )
                ) {
                  base.tarefasIncentivoAdiadas++;
                  log("incentivo_adiado", `Tarefa adiada p/ ${INCENTIVO_PARK_DATE}: "${t.subject}" (#${insc.NUMEROINSCRICAO}).`, dealInscricao.id);
                } else {
                  base.falhas++;
                }
              }
            }
          }
        }
      } else if (!visitaCorrespondente && insc.IDLAN && dealInscricao) {
        // Caso 2 do plano: inscrição sem visita correspondente encontrada.
        if (dryRun) {
          log(
            "identidade_duvidosa",
            `[dry-run] Marcaria inscrição #${insc.NUMEROINSCRICAO} sem visita/e-mail divergente (Responsável: ${emailResp ?? "sem e-mail"}).`,
            dealInscricao.id,
          );
        } else if (await atualizarTagsDeal(dealInscricao.id, ["inscricao-sem-visita"])) {
          base.tagsAtualizadas++;
        }
      }
    }
  } catch (e) {
    console.error("[conciliar-funil-crm] Erro geral na engine:", e);
    base.falhas++;
  }

  return base;
}
