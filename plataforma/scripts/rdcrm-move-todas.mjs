// Move TODAS as negociações de inscrição para a etapa "Inscrito" do funil
// "Admissão 2027". Idempotente: pula as que já estão em "Inscrito".
// Segurança: só mexe em negociações cujo nome começa com "Inscrição".
// Uso: node --env-file=.env.local scripts/rdcrm-move-todas.mjs [--apply]
const token = process.env.RD_CRM_TOKEN;
const BASE = "https://crm.rdstation.com/api/v1";
const STAGE_INSCRITO = "6a4bb5634eabe9001d666600";
const APPLY = process.argv.includes("--apply");

async function req(method, path, body) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

// 1) Coletar todas as negociações (paginado).
const deals = [];
let page = 1;
while (true) {
  const r = await req("GET", `/deals?page=${page}&limit=200`);
  if (r.status !== 200) {
    console.error("GET /deals ->", r.status, r.body);
    process.exit(1);
  }
  const arr = r.body.deals || r.body || [];
  if (!arr.length) break;
  deals.push(...arr);
  if (arr.length < 200) break;
  page++;
}
console.log(`Total de negociações: ${deals.length}`);

// 2) Selecionar as de inscrição que ainda NÃO estão em "Inscrito".
const alvos = deals.filter(
  (d) =>
    typeof d.name === "string" &&
    d.name.startsWith("Inscrição") &&
    d.deal_stage?.id !== STAGE_INSCRITO &&
    d.deal_stage?._id !== STAGE_INSCRITO,
);
console.log(`A mover para "Inscrito": ${alvos.length}`);
if (!APPLY) {
  console.log(
    '\n(DRY-RUN — nada foi alterado. Rode com "--apply" para efetivar.)',
  );
  for (const d of alvos.slice(0, 10))
    console.log(`  #${d.id}  ${d.name}  [${d.deal_stage?.name}]`);
  if (alvos.length > 10) console.log(`  … +${alvos.length - 10}`);
  process.exit(0);
}

// 3) Aplicar.
let ok = 0,
  fail = 0;
for (const d of alvos) {
  const put = await req("PUT", `/deals/${d.id}`, {
    deal: { deal_stage_id: STAGE_INSCRITO },
  });
  if (put.status >= 200 && put.status < 300) {
    ok++;
  } else {
    fail++;
    console.warn(`  FALHA #${d.id} (${put.status}) ${d.name}`);
  }
}
console.log(`\nMovidas: ${ok} | falhas: ${fail}`);
