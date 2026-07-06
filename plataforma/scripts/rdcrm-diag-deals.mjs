// Diagnóstico (SOMENTE LEITURA) das negociações do funil "Admissão 2027" no RD CRM.
// Classifica quais estão "incompletas" (sem o valor da taxa / sem produto / sem contato).
// Uso: node --env-file=.env.local scripts/rdcrm-diag-deals.mjs
const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";
const PIPELINE = "6a4bb56342e296001faf851f"; // Admissão 2027

async function getJson(path) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${TOKEN}`;
  const r = await fetch(url);
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

const arr = (b) => (Array.isArray(b) ? b : (b?.deals ?? []));

// Pagina todos os deals do funil.
let page = 1;
const deals = [];
for (;;) {
  const body = await getJson(
    `/deals?deal_pipeline_id=${PIPELINE}&limit=200&page=${page}`,
  );
  const lote = arr(body);
  deals.push(...lote);
  const hasMore = body?.has_more ?? lote.length === 200;
  if (!hasMore || lote.length === 0) break;
  page++;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

let comValor = 0;
let semValor = 0;
const incompletos = [];
for (const d of deals) {
  const amount = num(d.amount_total ?? d.amount_montly ?? 0);
  const nProdutos = Array.isArray(d.deal_products) ? d.deal_products.length : 0;
  const nContatos = Array.isArray(d.contacts) ? d.contacts.length : 0;
  const stage = d.deal_stage?.name ?? d.deal_stage_id ?? "?";
  const ok = amount === 200 || nProdutos > 0;
  if (ok) comValor++;
  else {
    semValor++;
    incompletos.push({
      id: d.id ?? d._id,
      name: d.name,
      amount,
      nProdutos,
      nContatos,
      stage,
    });
  }
}

console.log(`TOTAL deals no funil: ${deals.length}`);
console.log(`  com valor/produto: ${comValor}`);
console.log(`  SEM valor (incompletos): ${semValor}`);
console.log(
  "\n--- incompletos (id | nome | amount | #prod | #contatos | etapa) ---",
);
for (const i of incompletos) {
  console.log(
    `${i.id} | ${i.name} | ${i.amount} | ${i.nProdutos} | ${i.nContatos} | ${i.stage}`,
  );
}

// Amostra 1 deal completo para ver o shape real dos campos.
const completo = deals.find(
  (d) => num(d.amount_total) === 200 || (d.deal_products?.length ?? 0) > 0,
);
if (completo) {
  console.log("\n--- amostra de deal COMPLETO (shape) ---");
  console.log(JSON.stringify(completo, null, 2).slice(0, 2000));
}
