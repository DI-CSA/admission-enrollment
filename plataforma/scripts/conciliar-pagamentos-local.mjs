// Conciliação da INSCRIÇÃO (taxa R$200) — versão LOCAL (roda no Mac, on-demand).
//
// Lê o RM de PRODUÇÃO (via --env-file=.env.local) e atualiza o RD Station CRM,
// replicando o job do servidor /api/jobs/conciliar-pagamentos:
//   - move o deal de "Inscrito" → "Taxa paga" quando a taxa (R$200) está baixada
//     (FLAN.STATUSLAN=1); forward-only (só quem está em "Inscrito");
//   - garante o VALOR R$200 (produto "Taxa de inscrição") no deal;
//   - dispara o evento de Marketing "pagamento-confirmado" (RD_STATION_TOKEN).
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/conciliar-pagamentos-local.mjs            # DRY-RUN
//   node --env-file=.env.local scripts/conciliar-pagamentos-local.mjs --commit   # aplica
import sql from "mssql";

const COMMIT = process.argv.includes("--commit");
const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente (rode com --env-file=.env.local).");
  process.exit(1);
}
const MKT_TOKEN = process.env.RD_STATION_TOKEN; // Marketing (opcional)
const ANO =
  process.env.PS_ANO_ATUAL?.trim() || process.env.RD_ANO_PROCESSO || "2027";
const SOURCE_PADRAO = process.env.RD_SOURCE_PADRAO || "Portal de Inscrição";
const BASE = "https://crm.rdstation.com/api/v1";

const PIPELINE =
  process.env.RD_CRM_DEAL_PIPELINE_ID?.trim() || "6a4bb56342e296001faf851f";
const STAGE_INSCRITO =
  process.env.RD_CRM_DEAL_STAGE_ID?.trim() || "6a4bb5634eabe9001d666600";
const STAGE_PAGO =
  process.env.RD_CRM_DEAL_STAGE_PAGO_ID?.trim() || "6a4bb564aa4cb20022b93a3c";
const PRODUTO_TAXA =
  process.env.RD_CRM_PRODUCT_TAXA_ID?.trim() || "6a46b79dc5417b0024bd0171";
const NOME_TAXA = "Taxa de inscrição";
const VALOR_TAXA = 200;

async function rd(method, path, body) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(TOKEN)}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const t = await res.text();
  let b;
  try {
    b = JSON.parse(t);
  } catch {
    b = t;
  }
  return { status: res.status, ok: res.ok, body: b };
}
const sid = (x) => x?.id || x?._id;

async function listarDeals() {
  const out = [];
  for (let page = 1; page <= 100; page++) {
    const r = await rd(
      "GET",
      `/deals?limit=200&page=${page}&deal_pipeline_id=${encodeURIComponent(PIPELINE)}`,
    );
    if (!r.ok) break;
    const lista = Array.isArray(r.body) ? r.body : (r.body?.deals ?? []);
    if (!lista.length) break;
    for (const d of lista) {
      const nome = typeof d.name === "string" ? d.name : "";
      const m = /\[LAN:(\d+)\]/.exec(nome);
      out.push({
        id: sid(d),
        stage: sid(d.deal_stage),
        idLan: m ? m[1] : null,
      });
    }
    if (r.body?.has_more === false || lista.length < 200) break;
  }
  return out;
}

async function garantirValorTaxa(dealId) {
  const g = await rd("GET", `/deals/${dealId}`);
  if (!g.ok) return;
  const produtos = Array.isArray(g.body.deal_products)
    ? g.body.deal_products
    : [];
  const temTaxa = produtos.some(
    (p) => p.product_id === PRODUTO_TAXA || (p.name ?? "").trim() === NOME_TAXA,
  );
  if (!temTaxa) {
    await rd("POST", `/deals/${dealId}/deal_products`, {
      deal_product: {
        product_id: PRODUTO_TAXA,
        name: NOME_TAXA,
        base_price: VALOR_TAXA,
        price: VALOR_TAXA,
        amount: 1,
        recurrence: "spare",
      },
    });
  }
}

async function eventoPagamentoConfirmado(insc) {
  if (!MKT_TOKEN || !insc.emailResponsavel) return;
  const payload = {
    event_type: "CONVERSION",
    event_family: "CDP",
    payload: {
      conversion_identifier: `inscricao-${ANO}-pagamento-confirmado`,
      email: insc.emailResponsavel,
      ...(insc.nomeResponsavel ? { name: insc.nomeResponsavel } : {}),
      cf_etapa_funil: "pagamento-confirmado",
      cf_ano_processo: String(ANO),
      cf_idps: insc.idps,
      traffic_source: SOURCE_PADRAO,
      cf_numero_inscricao: insc.numeroInscricao,
      ...(insc.nomeCandidato ? { cf_nome_candidato: insc.nomeCandidato } : {}),
      ...(insc.dataPagamento
        ? { cf_data_pagamento_taxa: insc.dataPagamento }
        : {}),
    },
  };
  await fetch(
    `https://api.rd.services/platform/conversions?api_key=${encodeURIComponent(MKT_TOKEN)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  ).catch(() => {});
}

async function listarPagas() {
  const pool = await new sql.ConnectionPool({
    server: process.env.TOTVS_DB_SERVER,
    database: process.env.TOTVS_DB_NAME || "CorporeRM",
    user: process.env.TOTVS_DB_USER,
    password: process.env.TOTVS_DB_PASSWORD,
    port: Number(process.env.TOTVS_DB_PORT) || 1433,
    requestTimeout: 120000,
    options: { encrypt: true, trustServerCertificate: true },
  }).connect();
  const req = pool.request();
  req.input("ano", `%${ANO}%`);
  const { recordset } = await req.query(`
SELECT i.NUMEROINSCRICAO, i.IDPS, i.IDLAN,
       u.NOME AS NOMECANDIDATO, CONVERT(varchar(19), fl.DATABAIXA, 126) AS DATABAIXA,
       resp.NOME AS NOMERESP, resp.EMAIL AS EMAILRESP
  FROM SPSINSCRICAOAREAOFERTADA i
  JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA=i.CODCOLIGADA AND ps.IDPS=i.IDPS
  JOIN FLAN fl ON fl.CODCOLIGADA=i.CODCOLIGADALAN AND fl.IDLAN=i.IDLAN AND fl.STATUSLAN=1
  JOIN SPSUSUARIO u ON u.CODUSUARIOPS=i.CODUSUARIOPS
  OUTER APPLY (SELECT TOP 1 ru.NOME, ru.EMAIL FROM SPSUSUARIOTIPORELAC r JOIN SPSUSUARIO ru ON ru.CODUSUARIOPS=r.CODUSUARIOTIPORELAC WHERE r.CODUSUARIOPS=i.CODUSUARIOPS AND r.TIPORELAC=5 AND r.CODUSUARIOPS<>r.CODUSUARIOTIPORELAC AND ru.EMAIL IS NOT NULL AND LTRIM(RTRIM(ru.EMAIL))<>'' ORDER BY ru.CODUSUARIOPS DESC) resp
 WHERE ps.NOME LIKE @ano
 ORDER BY i.NUMEROINSCRICAO`);
  await pool.close();
  return recordset.map((r) => ({
    numeroInscricao: r.NUMEROINSCRICAO,
    idps: r.IDPS,
    idLan: r.IDLAN ?? null,
    nomeCandidato: r.NOMECANDIDATO?.trim() ?? null,
    dataPagamento: r.DATABAIXA ? String(r.DATABAIXA).trim() : null,
    emailResponsavel: r.EMAILRESP?.trim() || null,
    nomeResponsavel: r.NOMERESP?.trim() || null,
  }));
}

// ---- Execução --------------------------------------------------------------
console.log(
  `>>> Conciliação INSCRIÇÃO (taxa R$200) — LOCAL — ano ~%${ANO}% — ${COMMIT ? "COMMIT" : "DRY-RUN"}`,
);
const pagas = await listarPagas();
const deals = await listarDeals();
const porIdLan = new Map();
for (const d of deals) if (d.idLan) porIdLan.set(d.idLan, d);
console.log(
  `RM: ${pagas.length} inscrição(ões) com taxa PAGA | RD: ${deals.length} deal(s) (${porIdLan.size} com [LAN:]).`,
);

let movidas = 0,
  ja = 0,
  semDeal = 0,
  semIdLan = 0,
  falhas = 0;
for (const insc of pagas) {
  if (insc.idLan == null) {
    semIdLan++;
    continue;
  }
  const deal = porIdLan.get(String(insc.idLan));
  if (!deal) {
    semDeal++;
    continue;
  }
  // Forward-only: só move quem está em "Inscrito".
  if (deal.stage !== STAGE_INSCRITO) {
    ja++;
    continue;
  }
  if (!COMMIT) {
    movidas++;
    console.log(`  [DRY] insc ${insc.numeroInscricao} -> Taxa paga`);
    continue;
  }
  const ok = await rd("PUT", `/deals/${deal.id}`, {
    deal: { deal_stage_id: STAGE_PAGO },
  });
  if (!ok.ok) {
    falhas++;
    continue;
  }
  movidas++;
  await garantirValorTaxa(deal.id);
  await eventoPagamentoConfirmado(insc);
}
console.log("\n=== RESULTADO ===");
console.log({
  verificadas: pagas.length,
  movidas,
  jaAvancadas: ja,
  semDeal,
  semIdLan,
  falhas,
});
if (!COMMIT)
  console.log(
    "\n(DRY-RUN — nada foi escrito. Rode com --commit para aplicar.)",
  );
