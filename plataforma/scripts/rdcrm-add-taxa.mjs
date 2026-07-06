// Adiciona o produto "Taxa de inscrição" (R$200) a negociações existentes que estão
// sem valor. LEITURA por padrão; só ESCREVE com --commit.
// Uso:
//   node --env-file=.env.local scripts/rdcrm-add-taxa.mjs <dealId> [<dealId> ...]           (dry)
//   node --env-file=.env.local scripts/rdcrm-add-taxa.mjs --commit <dealId> [<dealId> ...]  (escreve)
const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";
const PRODUCT_ID = "6a46b79dc5417b0024bd0171"; // "Taxa de inscrição" (catálogo do CRM)
const VALOR = 200;

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const ids = args.filter((a) => a !== "--commit");
if (ids.length === 0) {
  console.error("informe ao menos um dealId");
  process.exit(1);
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch com retry para 5xx / respostas não-JSON (a API do RD às vezes devolve
// uma página HTML 503 transitória).
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

async function getDeal(id) {
  return fetchJson(`${BASE}/deals/${id}?token=${TOKEN}`);
}

async function putProduto(id) {
  const payload = {
    deal_product: {
      product_id: PRODUCT_ID,
      name: "Taxa de inscrição",
      base_price: VALOR,
      price: VALOR,
      amount: 1,
      recurrence: "spare",
    },
  };
  return fetchJson(`${BASE}/deals/${id}/deal_products?token=${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

for (const id of ids) {
  const antes = await getDeal(id);
  const nome = antes.body?.name ?? "?";
  const amtAntes = num(antes.body?.amount_total);
  const nProdAntes = Array.isArray(antes.body?.deal_products)
    ? antes.body.deal_products.length
    : 0;
  if (!commit) {
    console.log(
      `[DRY] ${id} | ${nome} | amount_antes=${amtAntes} | #prod_antes=${nProdAntes} -> adicionaria Taxa ${VALOR}`,
    );
    continue;
  }
  if (amtAntes === VALOR || nProdAntes > 0) {
    console.log(
      `[SKIP] ${id} | ${nome} | já tem produto/valor (amount=${amtAntes})`,
    );
    continue;
  }
  const res = await putProduto(id);
  const criou = res.status >= 200 && res.status < 300;
  // Re-consulta o deal para confirmar o valor recalculado.
  const depois = await getDeal(id);
  const amtDepois = num(depois.body?.amount_total);
  const nProdDepois = Array.isArray(depois.body?.deal_products)
    ? depois.body.deal_products.length
    : 0;
  const ok = criou && (amtDepois === VALOR || nProdDepois > 0);
  console.log(
    `[${ok ? "OK" : "FALHA"}] ${id} | ${nome} | POST ${res.status} | amount_depois=${amtDepois} | #prod_depois=${nProdDepois}`,
  );
  if (!ok) console.log("   resposta:", JSON.stringify(res.body).slice(0, 400));
}
