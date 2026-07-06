import "server-only";

// ---------------------------------------------------------------------------
// Camada de marketing — RD Station (Passo 1: eventos de funil via API Key)
// ---------------------------------------------------------------------------
//
// Registra eventos de conversão ao longo do funil de inscrição, SEMPRE no
// servidor (o token nunca vai ao browser). É deliberadamente NÃO-BLOQUEANTE:
// qualquer falha aqui apenas gera log — nunca interrompe o fluxo do candidato.
//
// Hoje usa o endpoint público de Conversões (API Key):
//   POST https://api.rd.services/platform/conversions?api_key=TOKEN
// Nos Passos 2/3 (ver docs/integracao_rd_station.md) evolui-se para OAuth +
// Events/Contacts/Funnels e webhooks, sem mudar os pontos de chamada do BFF.

const RD_CONVERSIONS_URL = "https://api.rd.services/platform/conversions";

/** Ano do processo seletivo, usado para compor o identificador de conversão. */
const ANO_PROCESSO = process.env.RD_ANO_PROCESSO ?? "2027";

// Fonte (coluna "source"/"Fonte" no RD) exibida quando NÃO há atribuição real
// (sem cookie __trf.src e sem UTM). Sem isso o RD mostra "unknown". Não sobrepõe
// origem real: só é usado como fallback. Mesmo valor da fonte do CRM
// (rdcrm.ts → deal_source), para consistência. Override via RD_SOURCE_PADRAO.
const SOURCE_PADRAO = process.env.RD_SOURCE_PADRAO ?? "Portal de Inscrição";

/**
 * Etapas do funil de inscrição. Cada etapa vira um `conversion_identifier`
 * distinto no RD Station e alimenta o estudo de percurso/abandono.
 */
export type EtapaFunil =
  | "lead-captado" // topo: formulário de interesse (LeadModal — Fase 1)
  | "login-responsavel" // responsável JÁ CADASTRADO autenticou (1x por sessão)
  | "cadastro-novo-responsavel" // NOVO responsável criou conta (1ª inscrição)
  | "inscricao-iniciada" // clicou "incluir candidato" / iniciou o wizard
  | "area-escolhida" // série/área selecionada
  | "boleto-gerado" // inscrição CONCLUÍDA (taxa gerada / checkout iniciado)
  | "pagamento-confirmado"; // conversão final

export interface EventoFunil {
  etapa: EtapaFunil;
  /** Identificador do contato no RD Station. Sem e-mail, o evento é ignorado. */
  email: string;
  nome?: string | null;
  telefone?: string | null;
  /** Segmento/série de interesse (ex.: "fundamental1"). */
  segmento?: string | null;
  /** Id do processo seletivo no RM, quando disponível. */
  idps?: number | null;
  /** Cookie `__trf.src` (sessão de rastreamento do RD) — atribuição de origem. */
  clientTrackingId?: string | null;
  /** Origem/UTM opcionais (reforço de atribuição). */
  trafficSource?: string | null;
  trafficMedium?: string | null;
  trafficCampaign?: string | null;
  /** Campos personalizados extras; recebem prefixo `cf_` automaticamente. */
  camposExtras?: Record<string, string | number | boolean | null | undefined>;
}

/** Garante o prefixo `cf_` exigido pelo RD Station em campos personalizados. */
function normalizarCamposCustom(
  extras: EventoFunil["camposExtras"],
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!extras) return out;
  for (const [chave, valor] of Object.entries(extras)) {
    if (valor === null || valor === undefined || valor === "") continue;
    const nome = chave.startsWith("cf_") ? chave : `cf_${chave}`;
    out[nome] = valor;
  }
  return out;
}

/**
 * Envia um evento de funil ao RD Station. Nunca lança exceção: em qualquer
 * falha (rede, token ausente, resposta não-OK) apenas registra um log. Deve ser
 * chamada do BFF nos pontos do funil (reconhecimento, cadastro, boleto, etc.).
 */
export async function registrarEventoFunil(ev: EventoFunil): Promise<void> {
  const email = ev.email?.trim();
  if (!email) return; // sem identificador não há contato a atualizar no RD

  const identificador = ev.segmento
    ? `inscricao-${ANO_PROCESSO}-${ev.etapa}-${ev.segmento}`
    : `inscricao-${ANO_PROCESSO}-${ev.etapa}`;

  // Fonte da conversão: preserva a atribuição real (cookie de rastreamento ou
  // UTM) e, quando ela não existe, usa a fonte padrão (SOURCE_PADRAO /
  // RD_SOURCE_PADRAO) para não cair em "unknown" no RD.
  const trafficSource =
    ev.trafficSource ?? (ev.clientTrackingId ? undefined : SOURCE_PADRAO);

  const payload = {
    event_type: "CONVERSION",
    event_family: "CDP",
    payload: {
      conversion_identifier: identificador,
      email,
      ...(ev.nome ? { name: ev.nome } : {}),
      ...(ev.telefone ? { mobile_phone: ev.telefone } : {}),
      cf_etapa_funil: ev.etapa,
      cf_ano_processo: ANO_PROCESSO,
      ...(ev.segmento ? { cf_segmento_interesse: ev.segmento } : {}),
      ...(ev.idps ? { cf_idps: ev.idps } : {}),
      // Atribuição de origem: o RD resolve a origem (inclusive Social) a partir do
      // client_tracking_id (cookie __trf.src gravado pelo código de rastreamento).
      ...(ev.clientTrackingId
        ? { client_tracking_id: ev.clientTrackingId }
        : {}),
      ...(trafficSource ? { traffic_source: trafficSource } : {}),
      ...(ev.trafficMedium ? { traffic_medium: ev.trafficMedium } : {}),
      ...(ev.trafficCampaign ? { traffic_campaign: ev.trafficCampaign } : {}),
      ...normalizarCamposCustom(ev.camposExtras),
    },
  };

  const token = process.env.RD_STATION_TOKEN;
  if (!token) {
    console.info(
      "[rdstation] (stub — RD_STATION_TOKEN ausente):",
      identificador,
      email,
    );
    return;
  }

  try {
    const res = await fetch(
      `${RD_CONVERSIONS_URL}?api_key=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      console.warn("[rdstation] resposta não-OK:", res.status, identificador);
    }
  } catch (e) {
    console.warn("[rdstation] falha ao enviar evento:", ev.etapa, e);
  }
}
