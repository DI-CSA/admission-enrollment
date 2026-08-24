import "server-only";

// ---------------------------------------------------------------------------
// Camada de CRM — RD Station CRM (negociações / "deals")
// ---------------------------------------------------------------------------
//
// Cria uma NEGOCIAÇÃO no funil de admissão a cada inscrição com taxa gerada,
// para a equipe acompanhar o pipeline (em aberto → ganho/matriculado / perdido).
// Mesma filosofia da camada de Marketing (rdstation.ts):
//   - SEMPRE no servidor (o token nunca vai ao browser);
//   - NÃO-BLOQUEANTE: qualquer falha apenas gera log, nunca interrompe o fluxo;
//   - vira stub quando o token não está configurado (RD_CRM_TOKEN ausente).
//
// API v1 (token de instância), conforme docs/integracao_rd_station.md §7.6:
//   POST https://crm.rdstation.com/api/v1/deals?token=TOKEN
//
// O token do CRM é DIFERENTE do token do Marketing (RD_STATION_TOKEN). É o
// "Token da instância", POR USUÁRIO, obtido no RD Station CRM em: nome do usuário
// (canto superior direito) → Perfil → campo "Token da instância".

const RD_CRM_DEALS_URL = "https://crm.rdstation.com/api/v1/deals";

/**
 * Wrapper de fetch para a API do RD CRM com retry em 429 (rate limit) e 5xx.
 * O RD limita requisições por instância; as conciliações disparam dezenas/centenas
 * de escritas em rajada (ex.: `conciliar-visitas` ~184 PUTs, `conciliar-funil-crm`
 * na carga inicial atualiza centenas de cards + cria ~120 tarefas) e estouram o
 * limite — sem retry, metade das gravações falha com 429. Respeita o header
 * `Retry-After` quando presente; senão faz backoff exponencial com teto. Mantém
 * o contrato dos chamadores (retorna o `Response` final; eles já tratam `!res.ok`
 * e `try/catch`). Chama `globalThis.fetch` de propósito — não é o próprio `fetch`
 * "cru", para não recursar. Só relança o erro de rede após esgotar as tentativas.
 */
async function rdFetch(
  input: string,
  init?: RequestInit,
  tentativas = 4,
): Promise<Response> {
  let ultimaResp: Response | null = null;
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await globalThis.fetch(input, init);
      if (res.status !== 429 && res.status < 500) return res;
      ultimaResp = res;
    } catch (e) {
      if (i === tentativas - 1) throw e;
    }
    if (i < tentativas - 1) {
      const ra = ultimaResp ? Number(ultimaResp.headers.get("retry-after")) : NaN;
      const esperaMs =
        Number.isFinite(ra) && ra > 0
          ? Math.min(30_000, ra * 1000)
          : Math.min(8_000, 500 * 2 ** i); // 500ms, 1s, 2s, 4s...
      await new Promise((r) => setTimeout(r, esperaMs));
    }
  }
  return ultimaResp as Response;
}

export interface NegociacaoInscricao {
  /** Número da inscrição no RM (compõe o nome da negociação e é idempotência lógica). */
  numeroInscricao: number | string | null;
  /** Nome do responsável (titular da negociação/contato). */
  nomeResponsavel?: string | null;
  emailResponsavel?: string | null;
  telefoneResponsavel?: string | null;
  /** Nome do candidato, quando disponível. */
  nomeCandidato?: string | null;
  /** Segmento/série de interesse. */
  segmento?: string | null;
  /**
   * Nome do processo seletivo (curso/ano-série pretendido). Cada ano/série
   * corresponde a um PS distinto, então o nome do PS já identifica o curso.
   * Vira custom field (`RD_CRM_CF_PROCESSO_ID`) para filtrar as negociações.
   */
  processoSeletivo?: string | null;
  /** Valor da taxa de inscrição (vira o valor da negociação). */
  valor?: number | string | null;
  idps?: number | null;
  /**
   * Relação do responsável pela inscrição com o candidato ("pai" | "mae" |
   * "outro"). Vira custom field da negociação (quando `RD_CRM_CF_RELACAO_ID`
   * está configurado) e um marcador no nome do contato.
   */
  relacaoResponsavel?: string | null;
  /** Há responsável FINANCEIRO distinto (outra pessoa paga a taxa)? */
  respFinanceiroDistinto?: boolean;
  /** Dados do responsável financeiro distinto (quando `respFinanceiroDistinto`). */
  respFinanceiroNome?: string | null;
  respFinanceiroEmail?: string | null;
  respFinanceiroTelefone?: string | null;
  /**
   * IDLAN do lançamento financeiro da taxa no RM. Gravado como custom field
   * (`RD_CRM_CF_IDLAN_ID`) para servir de CHAVE de reconciliação: com ele,
   * localizar a negociação e atualizar o pagamento (quando a taxa for baixada
   * no FLAN) torna-se trivial, sem depender de busca por nome.
   */
  idLan?: number | string | null;
}

function numero(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Token de reconciliação embutido no NOME da negociação: `[LAN:<idlan>]`.
 * O IDLAN do título financeiro é Único no RM (diferente do NUMEROINSCRICAO, que
 * se repete entre PS/séries), por isso serve de CHAVE de reconciliação. O `]`
 * final delimita o token, evitando ambiguidade de fronteira (`[LAN:12]` não
 * casa dentro de `[LAN:123]`).
 */
export function tokenIdLan(idLan: number | string): string {
  return `[LAN:${String(idLan).trim()}]`;
}

/** Extrai o IDLAN do token `[LAN:<idlan>]` presente no nome; null se ausente. */
export function extrairIdLanDoNome(nome: string): string | null {
  const m = /\[LAN:(\d+)\]/.exec(nome);
  return m ? m[1] : null;
}

/**
 * Token de reconciliação da VISITA embutido no nome: `[VIS:<agendamento_id>]`.
 * Mesma ideia do `[LAN:...]`: chave estável para localizar/avançar o deal da
 * visita de forma idempotente (o id é o uuid do agendamento no schema agos).
 */
export function tokenVisita(agendamentoId: string): string {
  return `[VIS:${String(agendamentoId).trim()}]`;
}

/** Extrai o id do agendamento do token `[VIS:<uuid>]` no nome; null se ausente. */
export function extrairIdVisitaDoNome(nome: string): string | null {
  const m = /\[VIS:([0-9a-fA-F-]{8,})\]/.exec(nome);
  return m ? m[1] : null;
}

/** Dados do agendamento que viram campos personalizados do deal de visita. */
export interface DadosVisitaCf {
  segmento?: string | null;
  dataHora?: string | null;
  tipo?: string | null;
  situacao?: string | null;
  operador?: string | null;
  participantes?: string | null;
  local?: string | null;
  origem?: string | null;
}

/** Monta os campos personalizados da visita (só os que têm UUID no ambiente). */
function montarCamposVisitaCf(
  d: DadosVisitaCf,
): Array<{ custom_field_id: string; value: string }> {
  const cf: Array<{ custom_field_id: string; value: string }> = [];
  const push = (envKey: string, value?: string | null) => {
    const id = process.env[envKey]?.trim();
    if (id && value && value.trim()) cf.push({ custom_field_id: id, value: value.trim() });
  };
  push("RD_CRM_CF_SERIE_ID", d.segmento);
  push("RD_CRM_CF_VISITA_DATA_ID", d.dataHora);
  push("RD_CRM_CF_VISITA_TIPO_ID", d.tipo);
  push("RD_CRM_CF_VISITA_SITUACAO_ID", d.situacao);
  push("RD_CRM_CF_VISITA_OPERADOR_ID", d.operador);
  push("RD_CRM_CF_VISITA_PARTICIPANTES_ID", d.participantes);
  push("RD_CRM_CF_VISITA_LOCAL_ID", d.local);
  push("RD_CRM_CF_VISITA_ORIGEM_ID", d.origem);
  return cf;
}

/**
 * Atualiza os campos personalizados de um deal de visita já existente
 * (PUT /deals/{id}). Usado para backfill e para manter a "situação" consistente
 * quando o status muda. Nunca lança: em falha retorna false. Retorna false (no-op)
 * quando não há nenhum campo a enviar.
 */
export async function atualizarCamposVisitaDeal(
  dealId: string,
  d: DadosVisitaCf,
): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId) return false;
  const cf = montarCamposVisitaCf(d);
  if (!cf.length) return false;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ deal: { deal_custom_fields: cf } }),
      },
    );
    if (!res.ok) {
      console.warn("[rdcrm] atualizar campos visita não-OK:", res.status, dealId);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao atualizar campos visita:", dealId, e);
    return false;
  }
}

/**
 * Cria a negociação de uma VISITA no funil (etapa "Visita agendada" ou, se já
 * compareceu, "Visita realizada"). Idempotência pelo token `[VIS:<id>]` no nome
 * (o chamador verifica antes se já existe). Retorna o id do deal criado, ou null.
 * Nunca lança: em falha registra log e retorna null.
 */
export async function criarNegociacaoVisita(v: {
  agendamentoId: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  segmento?: string | null;
  dealStageId: string;
  /** Rótulo de origem no NOME do deal (ex.: "Visita (Portal)", "Atendimento ao cliente"). */
  titulo?: string;
  /** Origem do deal (deal_source, filtrável no RD). */
  sourceName?: string;
  // Dados completos do agendamento — gravados como CAMPOS PERSONALIZADOS do deal
  // (cada um só é enviado quando o respectivo UUID está configurado no ambiente).
  /** Data/hora da visita, já formatada "dd/mm/aaaa HH:mm". */
  dataHora?: string | null;
  /** Tipo da visita (ex.: "Visitação Guiada"). */
  tipo?: string | null;
  /** Situação (Agendada/Confirmada/Compareceu/Não compareceu). */
  situacao?: string | null;
  /** Operador/origem do registro (quem cadastrou). */
  operador?: string | null;
  /** Participantes ("Pai: João; Candidato: Pedro (1º ano)"). */
  participantes?: string | null;
  /** Local da visita. */
  local?: string | null;
  /** Canal do contato (rótulo legível). */
  origem?: string | null;
}): Promise<string | null> {
  const token = process.env.RD_CRM_TOKEN;
  const titulo = v.titulo?.trim() || "Visita";
  const nomeNegociacao = `${titulo} — ${v.nome.trim()} ${tokenVisita(v.agendamentoId)}`;
  if (!token) {
    console.info("[rdcrm] (stub — RD_CRM_TOKEN ausente) visita:", nomeNegociacao);
    return null;
  }

  // Campos personalizados: cada um só entra quando seu UUID está no ambiente.
  const dealCustomFields = montarCamposVisitaCf(v);

  const payload = {
    deal: {
      name: nomeNegociacao,
      deal_stage_id: v.dealStageId,
      ...(dealCustomFields.length ? { deal_custom_fields: dealCustomFields } : {}),
    },
    contacts: [
      {
        name: v.nome.trim(),
        ...(v.email ? { emails: [{ email: v.email.trim() }] } : {}),
        ...(v.telefone ? { phones: [{ phone: v.telefone.trim() }] } : {}),
      },
    ],
    deal_source: {
      name: v.sourceName?.trim() || process.env.RD_SOURCE_PADRAO || "Portal de Inscrição",
    },
  };

  try {
    const res = await rdFetch(`${RD_CRM_DEALS_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn("[rdcrm] criar visita não-OK:", res.status, nomeNegociacao);
      return null;
    }
    const body = (await res.json()) as { id?: string; _id?: string };
    return String(body.id ?? body._id ?? "") || null;
  } catch (e) {
    console.warn("[rdcrm] falha ao criar visita:", nomeNegociacao, e);
    return null;
  }
}

/**
 * Registra a negociação da inscrição no RD Station CRM. Nunca lança exceção: em
 * qualquer falha apenas registra log. Chamar do BFF após a taxa ser gerada.
 */
export async function registrarNegociacaoInscricao(
  neg: NegociacaoInscricao,
): Promise<void> {
  const token = process.env.RD_CRM_TOKEN;

  const baseNome = neg.numeroInscricao
    ? `Inscrição nº ${neg.numeroInscricao}${
        neg.nomeCandidato ? ` — ${neg.nomeCandidato}` : ""
      }`
    : `Inscrição${neg.nomeCandidato ? ` — ${neg.nomeCandidato}` : ""}`;
  // Embute o token de reconciliação `[LAN:<idlan>]` no nome (chave única). O job
  // de conciliação localiza a negociação por ele, sem depender do NUMEROINSCRICAO.
  const nomeNegociacao =
    neg.idLan != null && String(neg.idLan).trim() !== ""
      ? `${baseNome} ${tokenIdLan(neg.idLan)}`
      : baseNome;

  if (!token) {
    console.info("[rdcrm] (stub — RD_CRM_TOKEN ausente):", nomeNegociacao);
    return;
  }

  // Etapa inicial do funil de admissão (opcional). Sem ela, o RD usa o funil
  // padrão. ID obtido em CRM → Funis de venda (ou via GET /deal_stages).
  const dealStageId = process.env.RD_CRM_DEAL_STAGE_ID;
  const valor = numero(neg.valor);

  // Custom fields da negociação. A API v1 do CRM SÓ aceita campos personalizados
  // via `custom_field_id` (UUID pré-cadastrado no CRM → Configurações → Campos
  // personalizados de negociação). Enviamos cada um SOMENTE quando o respectivo
  // ID está configurado no ambiente — sem ID, o campo é ignorado (não quebra).
  const dealCustomFields: Array<{ custom_field_id: string; value: string }> =
    [];
  const cfRelacaoId = process.env.RD_CRM_CF_RELACAO_ID;
  const cfRespFinDistintoId = process.env.RD_CRM_CF_RESP_FIN_DISTINTO_ID;
  const cfNomeRespFinId = process.env.RD_CRM_CF_NOME_RESP_FIN_ID;
  if (cfRelacaoId && neg.relacaoResponsavel) {
    dealCustomFields.push({
      custom_field_id: cfRelacaoId,
      value: neg.relacaoResponsavel,
    });
  }
  if (cfRespFinDistintoId) {
    dealCustomFields.push({
      custom_field_id: cfRespFinDistintoId,
      value: neg.respFinanceiroDistinto ? "sim" : "nao",
    });
  }
  if (cfNomeRespFinId && neg.respFinanceiroNome) {
    dealCustomFields.push({
      custom_field_id: cfNomeRespFinId,
      value: neg.respFinanceiroNome,
    });
  }
  // Curso pretendido (nome do PS) + série: chaves de segmentação/filtro no CRM.
  const cfProcessoId = process.env.RD_CRM_CF_PROCESSO_ID;
  const cfSerieId = process.env.RD_CRM_CF_SERIE_ID;
  if (cfProcessoId && neg.processoSeletivo) {
    dealCustomFields.push({
      custom_field_id: cfProcessoId,
      value: neg.processoSeletivo,
    });
  }
  if (cfSerieId && neg.segmento) {
    dealCustomFields.push({
      custom_field_id: cfSerieId,
      value: neg.segmento,
    });
  }
  // Chave de reconciliação do pagamento: IDLAN do lançamento da taxa no RM.
  const cfIdLanId = process.env.RD_CRM_CF_IDLAN_ID;
  if (cfIdLanId && neg.idLan != null && neg.idLan !== "") {
    dealCustomFields.push({
      custom_field_id: cfIdLanId,
      value: String(neg.idLan),
    });
  }

  const deal: Record<string, unknown> = {
    name: nomeNegociacao,
    ...(dealStageId ? { deal_stage_id: dealStageId } : {}),
    ...(dealCustomFields.length
      ? { deal_custom_fields: dealCustomFields }
      : {}),
  };

  // Valor da negociação: na API v1 do CRM, `amount_total` é CALCULADO a partir dos
  // produtos (`deal_products`) — enviar `amount_total` no `deal` é ignorado (fica 0).
  // Por isso registramos a taxa como um produto, e o RD soma o total da negociação.
  const dealProducts =
    valor !== undefined
      ? [
          {
            name: "Taxa de inscrição",
            base_price: valor,
            price: valor,
            amount: 1,
          },
        ]
      : [];

  // Contato principal: o responsável pela inscrição. Quando há responsável
  // FINANCEIRO distinto, ele entra como 2º contato da negociação (fica visível
  // no CRM sem depender de campo personalizado), com o papel no próprio nome.
  const contatos: Array<Record<string, unknown>> = [];
  const nomeRespComRelacao = neg.relacaoResponsavel
    ? `${neg.nomeResponsavel?.trim() || nomeNegociacao} (responsável — ${neg.relacaoResponsavel})`
    : neg.nomeResponsavel?.trim() || nomeNegociacao;
  contatos.push({
    name: nomeRespComRelacao,
    ...(neg.emailResponsavel
      ? { emails: [{ email: neg.emailResponsavel.trim() }] }
      : {}),
    ...(neg.telefoneResponsavel
      ? { phones: [{ phone: neg.telefoneResponsavel.trim() }] }
      : {}),
  });
  if (neg.respFinanceiroDistinto && neg.respFinanceiroNome) {
    contatos.push({
      name: `${neg.respFinanceiroNome.trim()} (responsável financeiro)`,
      ...(neg.respFinanceiroEmail
        ? { emails: [{ email: neg.respFinanceiroEmail.trim() }] }
        : {}),
      ...(neg.respFinanceiroTelefone
        ? { phones: [{ phone: neg.respFinanceiroTelefone.trim() }] }
        : {}),
    });
  }

  // Fonte da negociação: mesmo valor da fonte do Marketing (rdstation.ts), para
  // manter "source" consistente nos dois produtos. Override via RD_SOURCE_PADRAO.
  const dealSourceName = process.env.RD_SOURCE_PADRAO ?? "Portal de Inscrição";

  // Deal único (opcional, atrás de VISITAS_DEAL_UNICO=true): se esta pessoa já
  // tem um deal de VISITA (mesmo e-mail do responsável), REAPROVEITA esse deal —
  // move para "Inscrito", acrescenta o nome/tokens da inscrição e os campos, em
  // vez de criar um segundo deal. Assim a jornada (visita → inscrição) fica num
  // único deal. Best-effort: se algo falhar, cai no fluxo normal de criação.
  if (process.env.VISITAS_DEAL_UNICO === "true" && neg.emailResponsavel) {
    const alvo = await buscarDealVisitaPorEmail(neg.emailResponsavel);
    if (alvo) {
      const nomeMerge = `${alvo.nome} · ${nomeNegociacao}`;
      try {
        const put = await rdFetch(
          `${RD_CRM_BASE}/deals/${encodeURIComponent(alvo.id)}?token=${encodeURIComponent(token)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              deal: {
                name: nomeMerge,
                ...(dealStageId ? { deal_stage_id: dealStageId } : {}),
                ...(dealCustomFields.length
                  ? { deal_custom_fields: dealCustomFields }
                  : {}),
              },
            }),
          },
        );
        if (put.ok) {
          for (const p of dealProducts) {
            await rdFetch(
              `${RD_CRM_BASE}/deals/${encodeURIComponent(alvo.id)}/deal_products?token=${encodeURIComponent(token)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ deal_product: p }),
              },
            );
          }
          console.info("[rdcrm] inscrição vinculada à visita (deal único):", nomeMerge);
          return;
        }
        console.warn("[rdcrm] merge visita→inscrição não-OK:", put.status, alvo.id);
      } catch (e) {
        console.warn("[rdcrm] falha no merge visita→inscrição:", alvo.id, e);
      }
      // Em falha, segue para a criação normal abaixo (não perde a inscrição).
    }
  }

  const payload = {
    deal,
    contacts: contatos,
    deal_source: { name: dealSourceName },
    ...(dealProducts.length ? { deal_products: dealProducts } : {}),
  };

  try {
    const res = await rdFetch(
      `${RD_CRM_DEALS_URL}?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      console.warn("[rdcrm] resposta não-OK:", res.status, nomeNegociacao);
    }
  } catch (e) {
    console.warn("[rdcrm] falha ao criar negociação:", nomeNegociacao, e);
  }
}

// ---------------------------------------------------------------------------
// Conciliação de pagamento — localizar e avançar a negociação no funil
// ---------------------------------------------------------------------------
//
// Com a decisão de usar CAMPOS PADRÃO do deal (sem custom fields), a chave de
// reconciliação passou a ser o NOME da negociação ("Inscrição nº N"), que casa
// com o número da inscrição no RM. O job de conciliação (rota protegida por
// cron) usa estas funções para achar o deal e movê-lo para "Taxa paga".

const RD_CRM_BASE = "https://crm.rdstation.com/api/v1";

/** Negociação encontrada no CRM (subconjunto dos campos que usamos). */
export interface NegociacaoCrm {
  id: string;
  nome: string;
  /** Id da etapa (funil) atual da negociação. */
  dealStageId: string | null;
  dealStageName: string | null;
  /** IDLAN extraído do token `[LAN:<idlan>]` no nome; null se ausente. */
  idLan: string | null;
  /**
   * Negociação já fechada (ganha ou perdida). Confirmado via GET /deals real:
   * `win` é `null` enquanto aberta e `true`/`false` quando fechada; `closed_at`
   * acompanha. Usado para não tratar como "zumbi" (ou reabrir) um deal que já
   * foi encerrado.
   */
  fechado: boolean;
}

/** Deal fechado (ganho ou perdido): `win` sai de `null`, ou `closed_at` é setado. */
function extrairFechado(d: Record<string, unknown>): boolean {
  return typeof d.win === "boolean" || d.closed_at != null;
}

/** Extrai o id da etapa de um objeto `deal_stage` (a API varia entre id/_id). */
function extrairStageId(dealStage: unknown): string | null {
  if (!dealStage || typeof dealStage !== "object") return null;
  const s = dealStage as { id?: unknown; _id?: unknown };
  if (typeof s.id === "string") return s.id;
  if (typeof s._id === "string") return s._id;
  return null;
}

function extrairStageName(dealStage: unknown): string | null {
  if (!dealStage || typeof dealStage !== "object") return null;
  const s = dealStage as { name?: unknown };
  return typeof s.name === "string" ? s.name : null;
}

/**
 * Localiza a negociação da inscrição pelo nome ("Inscrição nº N"). Retorna a
 * PRIMEIRA que casar exatamente pelo número (a busca por `name` no CRM é por
 * substring, então "nº 1" também traria "nº 12" — filtramos pela fronteira).
 * Nunca lança: em falha retorna null e registra log.
 */
export async function buscarNegociacaoPorNumeroInscricao(
  numeroInscricao: number | string,
): Promise<NegociacaoCrm | null> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token) return null;

  const base = `Inscrição nº ${numeroInscricao}`;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/deals?token=${encodeURIComponent(token)}&name=${encodeURIComponent(base)}&limit=200`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      console.warn("[rdcrm] busca negociação não-OK:", res.status, base);
      return null;
    }
    const body = (await res.json()) as unknown;
    const lista = extrairListaDeals(body);
    // Casa pelo número exato: nome === base OU começa com "base " (o formato é
    // sempre "Inscrição nº N — Candidato"). Evita "nº 1" casar com "nº 12".
    const alvo = lista.find((d) => {
      const nome = typeof d?.name === "string" ? d.name : "";
      return nome === base || nome.startsWith(`${base} `);
    });
    if (!alvo) return null;
    return {
      id: String(alvo.id ?? alvo._id ?? ""),
      nome: typeof alvo.name === "string" ? alvo.name : base,
      dealStageId: extrairStageId(alvo.deal_stage),
      dealStageName: extrairStageName(alvo.deal_stage),
      idLan: extrairIdLanDoNome(typeof alvo.name === "string" ? alvo.name : ""),
      fechado: extrairFechado(alvo),
    };
  } catch (e) {
    console.warn("[rdcrm] falha ao buscar negociação:", base, e);
    return null;
  }
}

/** Normaliza a resposta do GET /deals (array direto ou {deals:[...]}). */
function extrairListaDeals(body: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(body)) return body as Array<Record<string, unknown>>;
  if (body && typeof body === "object") {
    const d = (body as { deals?: unknown }).deals;
    if (Array.isArray(d)) return d as Array<Record<string, unknown>>;
  }
  return [];
}

/**
 * Lista TODAS as negociações do funil (paginado), já com o IDLAN extraído do
 * token `[LAN:<idlan>]` no nome. O job de conciliação usa isto para montar um
 * mapa IDLAN → negociação e casar cada inscrição paga pela CHAVE ÚNICA (IDLAN),
 * sem a ambiguidade do NUMEROINSCRICAO. Filtra pelo funil quando
 * `RD_CRM_DEAL_PIPELINE_ID` está configurado (senão lista todos os funis, e o
 * token no nome garante que só as nossas negociações entrem no mapa).
 * Nunca lança: em falha retorna o que já coletou (o cron re-executa depois).
 */
export async function listarNegociacoesDoFunil(): Promise<NegociacaoCrm[]> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token) return [];
  const pipeline = process.env.RD_CRM_DEAL_PIPELINE_ID?.trim();
  const out: NegociacaoCrm[] = [];
  for (let page = 1; page <= 100; page++) {
    let body: unknown;
    try {
      const res = await rdFetch(
        `${RD_CRM_BASE}/deals?token=${encodeURIComponent(token)}&limit=200&page=${page}` +
          (pipeline ? `&deal_pipeline_id=${encodeURIComponent(pipeline)}` : ""),
        { method: "GET", headers: { Accept: "application/json" } },
      );
      if (!res.ok) {
        console.warn("[rdcrm] listar funil não-OK:", res.status, "page", page);
        break;
      }
      body = await res.json();
    } catch (e) {
      console.warn("[rdcrm] falha ao listar funil (page", page, "):", e);
      break;
    }
    const lista = extrairListaDeals(body);
    if (lista.length === 0) break;
    for (const d of lista) {
      const nome = typeof d?.name === "string" ? d.name : "";
      out.push({
        id: String(d.id ?? d._id ?? ""),
        nome,
        dealStageId: extrairStageId(d.deal_stage),
        dealStageName: extrairStageName(d.deal_stage),
        idLan: extrairIdLanDoNome(nome),
        fechado: extrairFechado(d),
      });
    }
    const hasMore =
      typeof (body as { has_more?: unknown })?.has_more === "boolean"
        ? (body as { has_more: boolean }).has_more
        : lista.length === 200;
    if (!hasMore) break;
  }
  return out;
}

/**
 * Deal único: localiza o deal de VISITA de uma pessoa pelo e-mail do contato,
 * para vincular a inscrição ao mesmo deal (jornada única no funil). Usa
 * `GET /contacts?email=` (o único filtro por e-mail que o CRM respeita) e lê os
 * `deals` do contato; para cada deal com token `[VIS:]` (e ainda SEM `[LAN:]`),
 * confere a etapa via `GET /deals/{id}` e mantém só os que estão numa etapa de
 * VISITA (agendada/realizada). Em empate, retorna o mais avançado (realizada >
 * agendada; depois o mais recente). Nunca lança: em falha retorna null.
 */
export async function buscarDealVisitaPorEmail(
  email: string,
): Promise<{ id: string; nome: string; realizada: boolean } | null> {
  const token = process.env.RD_CRM_TOKEN;
  const AG = process.env.RD_CRM_DEAL_STAGE_VISITA_AGENDADA_ID?.trim();
  const RE = process.env.RD_CRM_DEAL_STAGE_VISITA_REALIZADA_ID?.trim();
  if (!token || !email || (!AG && !RE)) return null;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/contacts?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email.trim())}`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const contatos = Array.isArray(body)
      ? (body as Array<Record<string, unknown>>)
      : ((body as { contacts?: Array<Record<string, unknown>> })?.contacts ?? []);
    const contato = contatos[0];
    const deals = Array.isArray(contato?.deals)
      ? (contato!.deals as Array<Record<string, unknown>>)
      : [];
    const candidatos = deals.filter((d) => {
      const nome = typeof d?.name === "string" ? d.name : "";
      return /\[VIS:/.test(nome) && !/\[LAN:/.test(nome);
    });

    const avaliados: Array<{ id: string; nome: string; realizada: boolean; quando: string }> = [];
    for (const d of candidatos) {
      const id = String(d.id ?? d._id ?? "");
      if (!id) continue;
      const det = await rdFetch(
        `${RD_CRM_BASE}/deals/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
        { method: "GET", headers: { Accept: "application/json" } },
      );
      if (!det.ok) continue;
      const dd = (await det.json()) as {
        name?: string;
        deal_stage?: unknown;
        updated_at?: string;
        created_at?: string;
      };
      const stageId = extrairStageId(dd.deal_stage);
      if (stageId !== AG && stageId !== RE) continue; // já saiu das etapas de visita
      avaliados.push({
        id,
        nome: dd.name ?? (typeof d.name === "string" ? d.name : ""),
        realizada: stageId === RE,
        quando: dd.updated_at ?? dd.created_at ?? "",
      });
    }
    if (avaliados.length === 0) return null;
    avaliados.sort(
      (a, b) =>
        Number(b.realizada) - Number(a.realizada) ||
        String(b.quando).localeCompare(String(a.quando)),
    );
    const alvo = avaliados[0];
    return { id: alvo.id, nome: alvo.nome, realizada: alvo.realizada };
  } catch (e) {
    console.warn("[rdcrm] falha ao buscar visita por e-mail:", e);
    return null;
  }
}

/**
 * Fusão reversa (visita agendada DEPOIS de já existir inscrição): localiza o
 * deal de INSCRIÇÃO de uma pessoa pelo e-mail do contato, para juntar a visita
 * ao MESMO deal em vez de criar um card separado — espelha `buscarDealVisitaPorEmail`
 * na direção oposta. `registrarNegociacaoInscricao` só verifica visita→inscrição
 * (a inscrição busca uma visita ANTERIOR); quando a ordem é invertida (a pessoa
 * já tinha se inscrito e só depois agenda a visita), nada verificava o sentido
 * contrário — este helper cobre esse caso. Só considera deals com token `[LAN:]`
 * no nome, ainda ABERTOS (não fechados) e SEM `[VIS:]` (evita reunir de novo um
 * deal já mesclado). Nunca lança: em falha retorna null.
 */
export async function buscarDealInscricaoPorEmail(
  email: string,
): Promise<{ id: string; nome: string } | null> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !email) return null;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/contacts?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email.trim())}`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const contatos = Array.isArray(body)
      ? (body as Array<Record<string, unknown>>)
      : ((body as { contacts?: Array<Record<string, unknown>> })?.contacts ?? []);
    const contato = contatos[0];
    const deals = Array.isArray(contato?.deals)
      ? (contato!.deals as Array<Record<string, unknown>>)
      : [];
    const candidatos = deals.filter((d) => {
      const nome = typeof d?.name === "string" ? d.name : "";
      return /\[LAN:/.test(nome) && !/\[VIS:/.test(nome);
    });
    for (const d of candidatos) {
      const id = String(d.id ?? d._id ?? "");
      if (!id) continue;
      const det = await rdFetch(
        `${RD_CRM_BASE}/deals/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
        { method: "GET", headers: { Accept: "application/json" } },
      );
      if (!det.ok) continue;
      const dd = (await det.json()) as { name?: string; win?: unknown; closed_at?: unknown };
      if (extrairFechado(dd as Record<string, unknown>)) continue; // já encerrado — não reaproveita
      return { id, nome: dd.name ?? (typeof d.name === "string" ? d.name : "") };
    }
    return null;
  } catch (e) {
    console.warn("[rdcrm] falha ao buscar inscrição por e-mail:", e);
    return null;
  }
}

/**
 * Mescla os dados da VISITA num deal de INSCRIÇÃO já existente (fusão reversa —
 * ver `buscarDealInscricaoPorEmail`): acrescenta o token `[VIS:<id>]` ao nome
 * (idempotência nas próximas execuções) e grava os campos personalizados da
 * visita. Não move a etapa do funil (o deal já está mais avançado). Nunca
 * lança: em falha retorna false.
 */
export async function mesclarVisitaNoDealDeInscricao(
  dealId: string,
  nomeAtual: string,
  agendamentoId: string,
  d: DadosVisitaCf,
): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId) return false;
  const novoNome = /\[VIS:/.test(nomeAtual)
    ? nomeAtual
    : `${nomeAtual} ${tokenVisita(agendamentoId)}`;
  const cf = montarCamposVisitaCf(d);
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          deal: { name: novoNome, ...(cf.length ? { deal_custom_fields: cf } : {}) },
        }),
      },
    );
    if (!res.ok) {
      console.warn("[rdcrm] mesclar visita em inscrição não-OK:", res.status, dealId);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao mesclar visita em inscrição:", dealId, e);
    return false;
  }
}

/**
 * Move a negociação para uma etapa do funil (PUT /deals/{id}). Retorna true no
 * sucesso. Nunca lança: em falha retorna false e registra log.
 */
export async function moverNegociacaoParaEtapa(
  dealId: string,
  dealStageId: string,
): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId || !dealStageId) return false;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ deal: { deal_stage_id: dealStageId } }),
      },
    );
    if (!res.ok) {
      console.warn("[rdcrm] mover negociação não-OK:", res.status, dealId);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao mover negociação:", dealId, e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Valor da negociação nas fases de matrícula (produto "Reserva de matrícula")
// ---------------------------------------------------------------------------
//
// O valor de uma negociação no RD CRM é a SOMA dos seus `deal_products`. Nas
// etapas "Cadastro de matrícula" e "Pré-matrícula", o valor relevante é a
// RESERVA DE MATRÍCULA (R$2.200) — a taxa de inscrição (R$200), já paga nas
// etapas anteriores, não deve mais ser representada. Este helper garante que a
// negociação tenha APENAS o produto "Reserva de matrícula", trocando o produto
// da taxa por ele. Idempotente e não-bloqueante.

const NOME_PRODUTO_RESERVA = "Reserva de matrícula";
const VALOR_PRODUTO_RESERVA = 2200;

interface DealProduto {
  id?: string;
  _id?: string;
  product_id?: string;
  name?: string;
}

/**
 * Ajusta o valor da negociação para a RESERVA de matrícula (R$2.200): adiciona o
 * produto "Reserva de matrícula" (se faltar) e remove os demais produtos (ex.: a
 * "Taxa de inscrição"), de modo que o valor total reflita só a reserva. Exige
 * `RD_CRM_PRODUCT_RESERVA_ID` (id do produto de catálogo). Nunca lança: em falha
 * retorna false e registra log. Idempotente (não faz nada se já está correto).
 */
export async function ajustarValorReservaDeal(
  dealId: string,
): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  const productId = process.env.RD_CRM_PRODUCT_RESERVA_ID?.trim();
  if (!token || !dealId || !productId) return false;
  try {
    const gd = await rdFetch(
      `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    if (!gd.ok) {
      console.warn("[rdcrm] GET deal (valor) não-OK:", gd.status, dealId);
      return false;
    }
    const deal = (await gd.json()) as { deal_products?: DealProduto[] };
    const produtos = Array.isArray(deal.deal_products)
      ? deal.deal_products
      : [];
    const ehReserva = (p: DealProduto) =>
      p.product_id === productId ||
      (p.name ?? "").trim() === NOME_PRODUTO_RESERVA;
    const temReserva = produtos.some(ehReserva);
    const outros = produtos.filter((p) => !ehReserva(p));

    // Já está correto (só a reserva) → nada a fazer.
    if (temReserva && outros.length === 0) return true;

    // Adiciona a reserva quando faltar.
    if (!temReserva) {
      const add = await rdFetch(
        `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}/deal_products?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            deal_product: {
              product_id: productId,
              name: NOME_PRODUTO_RESERVA,
              base_price: VALOR_PRODUTO_RESERVA,
              price: VALOR_PRODUTO_RESERVA,
              amount: 1,
              recurrence: "spare",
            },
          }),
        },
      );
      if (!add.ok) {
        console.warn("[rdcrm] add produto reserva não-OK:", add.status, dealId);
        return false;
      }
    }

    // Remove os demais produtos (ex.: "Taxa de inscrição") para o valor refletir
    // apenas a reserva de matrícula.
    for (const p of outros) {
      const pid = p.id ?? p._id;
      if (!pid) continue;
      const del = await rdFetch(
        `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}/deal_products/${encodeURIComponent(pid)}?token=${encodeURIComponent(token)}`,
        { method: "DELETE", headers: { Accept: "application/json" } },
      );
      if (!del.ok) {
        console.warn(
          "[rdcrm] remover produto (valor) não-OK:",
          del.status,
          dealId,
          pid,
        );
      }
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao ajustar valor da reserva:", dealId, e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Enriquecimento da matrícula: contatos (pai/mãe/resp. fin) + datas em CAMPOS
// PERSONALIZADOS da negociação
// ---------------------------------------------------------------------------
//
// A API v1 do CRM NÃO permite adicionar/atualizar CONTATOS num deal existente
// (POST /deals/{id}/contacts → 404; PUT /deals/{id} ignora `contacts`), mas
// PERMITE atualizar CAMPOS PERSONALIZADOS via PUT /deals/{id} (deal_custom_fields).
// Por isso gravamos os dados de contato (nome/CPF/e-mail/telefone) de pai, mãe e
// responsável financeiro, e as datas de cadastro/pagamento, como campos de texto.
// Cada campo só é enviado quando seu UUID está configurado no ambiente.

export interface ContatoDeal {
  nome: string | null;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
}

export interface EnriquecimentoMatricula {
  pai: ContatoDeal | null;
  mae: ContatoDeal | null;
  respFinanceiro: ContatoDeal | null;
  /** Data/hora da efetivação da matrícula, formato "yyyy-mm-dd HH:mm". */
  dataCadastroMatricula: string | null;
  /** Data do pagamento da reserva (ISO). */
  dataPagamentoReserva: string | null;
}

function fmtContatoDeal(c: ContatoDeal | null): string | null {
  if (!c || !c.nome) return null;
  const partes = [c.nome];
  if (c.cpf) partes.push(`CPF ${c.cpf}`);
  if (c.email) partes.push(c.email);
  if (c.telefone) partes.push(c.telefone);
  return partes.join(" · ");
}

/** "yyyy-mm-dd HH:mm" (ou ISO) → "dd/mm/aaaa HH:mm". */
function fmtDataHoraBr(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : null;
}

/** ISO/"yyyy-mm-dd…" → "dd/mm/aaaa". */
function fmtDataBr(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/**
 * Grava os campos personalizados de enriquecimento da matrícula na negociação
 * (PUT /deals/{id} deal_custom_fields). Só envia os campos cujo UUID está no
 * ambiente (RD_CRM_CF_PAI_ID/_MAE_ID/_RESP_FINANCEIRO_ID/_DATA_CADASTRO_ID/
 * _DATA_PAGAMENTO_ID). Nunca lança: em falha retorna false e registra log.
 */
export async function atualizarCamposMatriculaDeal(
  dealId: string,
  dados: EnriquecimentoMatricula,
): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId) return false;
  const cf: Array<{ custom_field_id: string; value: string }> = [];
  const push = (envKey: string, value: string | null) => {
    const id = process.env[envKey]?.trim();
    if (id && value) cf.push({ custom_field_id: id, value });
  };
  push("RD_CRM_CF_PAI_ID", fmtContatoDeal(dados.pai));
  push("RD_CRM_CF_MAE_ID", fmtContatoDeal(dados.mae));
  push("RD_CRM_CF_RESP_FINANCEIRO_ID", fmtContatoDeal(dados.respFinanceiro));
  push(
    "RD_CRM_CF_DATA_CADASTRO_ID",
    fmtDataHoraBr(dados.dataCadastroMatricula),
  );
  push("RD_CRM_CF_DATA_PAGAMENTO_ID", fmtDataBr(dados.dataPagamentoReserva));
  if (!cf.length) return false;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ deal: { deal_custom_fields: cf } }),
      },
    );
    if (!res.ok) {
      console.warn(
        "[rdcrm] atualizar campos matrícula não-OK:",
        res.status,
        dealId,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao atualizar campos matrícula:", dealId, e);
    return false;
  }
}

/**
 * Cria uma Tarefa/Atividade no CRM associada a um Deal.
 * POST /tasks?token=...
 */
export async function criarTarefaCrm(
  dealId: string,
  subject: string,
  notes: string,
  date?: string | null,
): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId) return false;

  const payload = {
    task: {
      deal_id: dealId,
      subject: subject,
      type: "task",
      date: date || new Date().toISOString().split("T")[0],
      hour: "10:00",
      notes: notes,
      user_ids: [
        "6a18381d62e4480023f5619d", // cesar@csa.com.br
        "6a5632a33e82950030230eb3"  // renata.azevedo@csa.com.br
      ]
    },
  };

  try {
    const res = await rdFetch(`${RD_CRM_BASE}/tasks?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn("[rdcrm] falha ao criar tarefa:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] exceção ao criar tarefa:", dealId, e);
    return false;
  }
}

/**
 * Atualiza tags de um deal existente.
 * O RD Station CRM v1 permite atualizar as tags via PUT em /deals/{id}.
 */
export async function atualizarTagsDeal(
  dealId: string,
  tagsToAdd: string[],
  tagsToRemove: string[] = [],
): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId) return false;
  if (tagsToAdd.length === 0 && tagsToRemove.length === 0) return true;

  try {
    // 1. Busca as tags atuais
    const getRes = await rdFetch(`${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`);
    if (!getRes.ok) return false;
    const dealData = (await getRes.json()) as { tags?: Array<{ name: string }> };

    const existingTags = dealData.tags?.map((t) => t.name) || [];

    // 2. Remove as tags indesejadas e adiciona as novas
    const finalTags = existingTags.filter((t: string) => !tagsToRemove.includes(t));
    for (const t of tagsToAdd) {
      if (!finalTags.includes(t)) finalTags.push(t);
    }

    // 3. Atualiza o deal
    const putRes = await rdFetch(`${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ deal: { tags: finalTags } }),
    });

    if (!putRes.ok) {
      console.warn("[rdcrm] falha ao atualizar tags:", putRes.status, await putRes.text());
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] exceção ao atualizar tags:", dealId, e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Encerramento de negociações e tarefas — "Zero Zombie Deal"
// ---------------------------------------------------------------------------
//
// Confirmado via GET /deals real (homolog): o deal tem `win: null|true|false` e
// `closed_at: null|<data>` — null = aberto; true/false = fechado (ganho/perdido).

/**
 * Marca a negociação como GANHA (win=true). Usado para encerrar automaticamente
 * o card de visita quando a família já avançou para Inscrição/Matrícula em um
 * card SEPARADO ("Zero Zombie Deal" — ver conciliar-funil-crm.ts). PUT /deals/{id}.
 * Nunca lança: em falha retorna false.
 */
export async function marcarNegociacaoGanha(dealId: string): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId) return false;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ deal: { win: true } }),
      },
    );
    if (!res.ok) {
      console.warn("[rdcrm] marcar ganha não-OK:", res.status, dealId);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao marcar ganha:", dealId, e);
    return false;
  }
}

/**
 * Marca a negociação como PERDIDA (win=false). Usado para encerrar o card de
 * VISITA quando o agendamento é cancelado na AGOS (status='cancelada') e o
 * deal ainda não foi mesclado numa inscrição — sem isso, o card ficava aberto
 * para sempre no funil, sem ninguém nunca mais tocá-lo (ver
 * `sincronizarVisitasCrm`, que já não sincroniza mais os cancelados, então
 * este é o único ponto que fecha o card). PUT /deals/{id}. Nunca lança: em
 * falha retorna false.
 */
export async function marcarNegociacaoPerdida(dealId: string): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId) return false;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ deal: { win: false } }),
      },
    );
    if (!res.ok) {
      console.warn("[rdcrm] marcar perdida não-OK:", res.status, dealId);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao marcar perdida:", dealId, e);
    return false;
  }
}

export interface TarefaAbertaCrm {
  id: string;
  subject: string;
}

/**
 * Lista as tarefas ABERTAS (done=false) de um deal (GET /tasks?deal_id=...).
 * Confere o vínculo com o deal no cliente (defesa extra, caso o filtro do
 * servidor não seja respeitado — confirmado campo `deal_id`/`deal.id` via teste
 * real). Usada para (a) fechar tarefas órfãs ao encerrar um deal e (b) checar
 * duplicidade antes de criar uma nova tarefa de follow-up. Nunca lança: em
 * falha retorna [].
 */
export async function listarTarefasAbertasDoDeal(dealId: string): Promise<TarefaAbertaCrm[]> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId) return [];
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/tasks?token=${encodeURIComponent(token)}&deal_id=${encodeURIComponent(dealId)}&limit=100`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    const lista = Array.isArray(body)
      ? (body as Array<Record<string, unknown>>)
      : ((body as { tasks?: Array<Record<string, unknown>> })?.tasks ?? []);
    return lista
      .filter((t) => {
        const deal = t.deal as { id?: unknown; _id?: unknown } | undefined;
        const id = String(t.deal_id ?? deal?.id ?? deal?._id ?? "");
        return id === dealId && t.done !== true;
      })
      .map((t) => ({
        id: String(t.id ?? t._id ?? ""),
        subject: typeof t.subject === "string" ? t.subject : "",
      }))
      .filter((t) => t.id);
  } catch (e) {
    console.warn("[rdcrm] falha ao listar tarefas do deal:", dealId, e);
    return [];
  }
}

/**
 * Marca uma tarefa como concluída (PUT /tasks/{id}, `done: true`). Usada para
 * fechar as tarefas pendentes de um card de visita "zumbi" ao encerrá-lo — para
 * não aparecerem na lista de trabalho do SDR. Nunca lança: em falha retorna false.
 */
export async function concluirTarefa(taskId: string): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !taskId) return false;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/tasks/${encodeURIComponent(taskId)}?token=${encodeURIComponent(token)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ task: { done: true } }),
      },
    );
    if (!res.ok) {
      console.warn("[rdcrm] concluir tarefa não-OK:", res.status, taskId);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao concluir tarefa:", taskId, e);
    return false;
  }
}

/**
 * Exclui uma tarefa (DELETE /tasks/{id}) do RD CRM v1. Usada para remover tarefas
 * criadas por engano — ex.: "Incentivar Matrícula" gerada antes de o candidato
 * entrar em chamada. Preferimos EXCLUIR (e não concluir) para não inflar o
 * relatório de "tarefas concluídas" com trabalho que nunca ocorreu. Nunca lança:
 * em falha retorna false.
 */
export async function deletarTarefa(taskId: string): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !taskId) return false;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/tasks/${encodeURIComponent(taskId)}?token=${encodeURIComponent(token)}`,
      { method: "DELETE", headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      console.warn("[rdcrm] deletar tarefa não-OK:", res.status, taskId);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao deletar tarefa:", taskId, e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Contexto 360º — status consolidado do funil no card de Inscrição/Matrícula
// ---------------------------------------------------------------------------

export interface Contexto360Deal {
  /** Ex.: "Taxa de inscrição paga" | "Taxa gerada — aguardando pagamento". */
  inscricaoStatus?: string | null;
  /** Ex.: "Matriculado" | "Aguardando reserva de matrícula (R$2.200)". */
  matriculaStatus?: string | null;
  /** Conferência de CPF entre visita/inscrição/matrícula (ver plano §"Conferência de CPF"). */
  vinculoStatus?: string | null;
  // Contexto da visita, copiado para o card de Inscrição/Matrícula quando NÃO
  // houve fusão automática (VISITAS_DEAL_UNICO) — reaproveita os MESMOS campos
  // personalizados já usados no card de visita (mesmo funil/pipeline).
  visitaSituacao?: string | null;
  visitaOperador?: string | null;
  visitaParticipantes?: string | null;
}

/**
 * Grava o Contexto 360º (status do funil unificado + dados da visita) no card
 * de Inscrição/Matrícula (PUT /deals/{id} deal_custom_fields). Só envia os
 * campos cujo UUID está no ambiente (RD_CRM_CF_INSCRICAO_STATUS_ID/
 * _MATRICULA_STATUS_ID/_VINCULO_STATUS_ID + os _VISITA_*_ID já existentes).
 * Nunca lança: em falha retorna false. Retorna false (no-op) quando não há
 * nenhum campo a enviar.
 */
export async function atualizarContexto360Deal(
  dealId: string,
  dados: Contexto360Deal,
): Promise<boolean> {
  const token = process.env.RD_CRM_TOKEN;
  if (!token || !dealId) return false;
  const cf: Array<{ custom_field_id: string; value: string }> = [];
  const push = (envKey: string, value?: string | null) => {
    const id = process.env[envKey]?.trim();
    if (id && value && value.trim()) cf.push({ custom_field_id: id, value: value.trim() });
  };
  push("RD_CRM_CF_INSCRICAO_STATUS_ID", dados.inscricaoStatus);
  push("RD_CRM_CF_MATRICULA_STATUS_ID", dados.matriculaStatus);
  push("RD_CRM_CF_VINCULO_STATUS_ID", dados.vinculoStatus);
  push("RD_CRM_CF_VISITA_SITUACAO_ID", dados.visitaSituacao);
  push("RD_CRM_CF_VISITA_OPERADOR_ID", dados.visitaOperador);
  push("RD_CRM_CF_VISITA_PARTICIPANTES_ID", dados.visitaParticipantes);
  if (!cf.length) return false;
  try {
    const res = await rdFetch(
      `${RD_CRM_BASE}/deals/${encodeURIComponent(dealId)}?token=${encodeURIComponent(token)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ deal: { deal_custom_fields: cf } }),
      },
    );
    if (!res.ok) {
      console.warn("[rdcrm] atualizar contexto 360 não-OK:", res.status, dealId);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[rdcrm] falha ao atualizar contexto 360:", dealId, e);
    return false;
  }
}
