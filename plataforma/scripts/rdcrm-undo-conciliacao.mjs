// Desfaz a conciliação: move as negociações que estão na etapa "Taxa paga" de
// volta para "Inscrito". Serve para re-testar a conciliação com o novo critério
// (IDLAN). LEITURA por padrão; só ESCREVE com --commit.
// Uso:
//   node --env-file=.env.local scripts/rdcrm-undo-conciliacao.mjs            (dry)
//   node --env-file=.env.local scripts/rdcrm-undo-conciliacao.mjs --commit   (escreve)
const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";
const PIPELINE =
  process.env.RD_CRM_DEAL_PIPELINE_ID?.trim() || "6a4bb56342e296001faf851f";
const STAGE_PAGO =
  process.env.RD_CRM_DEAL_STAGE_PAGO_ID?.trim() || "6a4bb564aa4cb20022b93a3c";
const STAGE_INSCRITO =
  process.env.RD_CRM_DEAL_STAGE_ID?.trim() || "6a4bb5634eabe9001d666600";

const commit = process.argv.slice(2).includes("--commit");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, init, tentativas = 4) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    const r = await fetch(url, init);
    const txt = await r.text();
    let body;
    try {
      body = JSON.parse(txt);
    } catch {
      body = null;
    }
    if (r.status < 500 && body !== null) return { status: r.status, body };
    ultimo = { status: r.status, body: body ?? txt.slice(0, 200) };
    await sleep(1500 * (i + 1));
  }
  return ultimo;
}

const stageId = (ds) =>
  ds && typeof ds === "object" ? (ds.id ?? ds._id ?? null) : null;

const deals = [];
for (let page = 1; page <= 100; page++) {
  const { status, body } = await fetchJson(
    `${BASE}/deals?token=${TOKEN}&limit=200&page=${page}&deal_pipeline_id=${PIPELINE}`,
  );
  if (status >= 400 || !body) {
    console.error("falha ao listar deals:", status, body);
    process.exit(1);
  }
  const lista = Array.isArray(body) ? body : (body.deals ?? []);
  if (lista.length === 0) break;
  deals.push(...lista);
  const hasMore =
    typeof body.has_more === "boolean" ? body.has_more : lista.length === 200;
  if (!hasMore) break;
}

const alvos = deals.filter((d) => stageId(d.deal_stage) === STAGE_PAGO);
console.log(
  `Funil: ${deals.length} negociações; em "Taxa paga": ${alvos.length}.\n`,
);

let movidos = 0;
let falhas = 0;
for (const d of alvos) {
  const id = String(d.id ?? d._id ?? "");
  const nome = typeof d.name === "string" ? d.name : "";
  if (!commit) {
    console.log(`  [dry] ${id} :: "${nome}" → Inscrito`);
    movidos++;
    continue;
  }
  const res = await fetchJson(`${BASE}/deals/${id}?token=${TOKEN}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deal: { deal_stage_id: STAGE_INSCRITO } }),
  });
  if (res.status >= 400) {
    console.error(`  [FALHA ${res.status}] ${id} ::`, res.body);
    falhas++;
    continue;
  }
  console.log(`  [ok] ${id} → Inscrito :: "${nome}"`);
  movidos++;
}

console.log(
  `\nResumo: ${commit ? "movidos" : "seriam movidos"}=${movidos}, falhas=${falhas}`,
);
