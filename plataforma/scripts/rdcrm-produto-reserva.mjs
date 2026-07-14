// Cria (idempotente) o produto de catálogo "Reserva de matrícula" (R$2.200) no
// RD Station CRM e imprime o product_id (para RD_CRM_PRODUCT_RESERVA_ID).
// Opcional: --fix-deal <dealId> adiciona o produto ao deal (corrige valor).
// Uso: node --env-file=.env.local scripts/rdcrm-produto-reserva.mjs [--commit] [--fix-deal <id>]
const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";
const NOME = "Reserva de matrícula";
const VALOR = 2200;
const COMMIT = process.argv.includes("--commit");
const fixIdx = process.argv.indexOf("--fix-deal");
const FIX_DEAL = fixIdx >= 0 ? process.argv[fixIdx + 1] : null;

async function j(url, init) {
  const r = await fetch(url, init);
  const t = await r.text();
  let b;
  try {
    b = JSON.parse(t);
  } catch {
    b = t;
  }
  return { status: r.status, body: b };
}
const tok = (u) =>
  `${BASE}${u}${u.includes("?") ? "&" : "?"}token=${encodeURIComponent(TOKEN)}`;

// 1) Já existe o produto no catálogo?
const lista = await j(tok(`/products?limit=200`));
const arr = Array.isArray(lista.body)
  ? lista.body
  : (lista.body?.products ?? []);
let prod = arr.find((p) => (p.name || "").trim() === NOME);
console.log(
  prod
    ? `Produto já existe: ${prod.id} (${prod.name}, base_price=${prod.base_price})`
    : "Produto não existe ainda.",
);

if (!prod && COMMIT) {
  const criar = await j(tok(`/products`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: { name: NOME, base_price: VALOR } }),
  });
  console.log("POST /products ->", criar.status);
  if (criar.status >= 300) {
    console.log(JSON.stringify(criar.body));
    process.exit(1);
  }
  prod = criar.body;
  console.log("Criado:", prod.id, prod.name, prod.base_price);
}

if (prod) console.log(`\nRD_CRM_PRODUCT_RESERVA_ID=${prod.id || prod._id}`);

// 2) opcional: adiciona ao deal (corrige valor)
if (FIX_DEAL && prod && COMMIT) {
  const pid = prod.id || prod._id;
  const add = await j(tok(`/deals/${FIX_DEAL}/deal_products`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deal_product: {
        product_id: pid,
        name: NOME,
        base_price: VALOR,
        price: VALOR,
        amount: 1,
        recurrence: "spare",
      },
    }),
  });
  console.log(
    `\nfix-deal ${FIX_DEAL}: POST deal_products ->`,
    add.status,
    add.status >= 300 ? JSON.stringify(add.body) : "",
  );
  const d = await j(tok(`/deals/${FIX_DEAL}`));
  console.log(
    "amount_total agora:",
    d.body.amount_total,
    "produtos:",
    (d.body.deal_products || []).map((p) => `${p.name}:${p.total}`),
  );
}
