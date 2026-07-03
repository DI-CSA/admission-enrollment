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
 * Registra a negociação da inscrição no RD Station CRM. Nunca lança exceção: em
 * qualquer falha apenas registra log. Chamar do BFF após a taxa ser gerada.
 */
export async function registrarNegociacaoInscricao(
  neg: NegociacaoInscricao,
): Promise<void> {
  const token = process.env.RD_CRM_TOKEN;

  const nomeNegociacao = neg.numeroInscricao
    ? `Inscrição nº ${neg.numeroInscricao}${
        neg.nomeCandidato ? ` — ${neg.nomeCandidato}` : ""
      }`
    : `Inscrição${neg.nomeCandidato ? ` — ${neg.nomeCandidato}` : ""}`;

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

  const payload = {
    deal,
    contacts: contatos,
    deal_source: { name: dealSourceName },
    ...(dealProducts.length ? { deal_products: dealProducts } : {}),
  };

  try {
    const res = await fetch(
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
