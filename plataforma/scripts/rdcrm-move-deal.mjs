// Move UMA negociação para a etapa "Inscrito" do funil "Admissão 2027" (teste
// reversível de PUT /deals/:id). Uso:
//   node --env-file=.env.local scripts/rdcrm-move-deal.mjs <dealId> [stageId]
const token = process.env.RD_CRM_TOKEN;
const BASE = "https://crm.rdstation.com/api/v1";
const dealId = process.argv[2] || "6a4bb0b87a0e81001d6ac36f";
const stageId = process.argv[3] || "6a4bb5634eabe9001d666600"; // Inscrito

async function req(method, path, body) {
  const url = `${BASE}${path}?token=${encodeURIComponent(token)}`;
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

const info = (d) =>
  `${d.name} | stage: ${d.deal_stage?.name} | pipeline: ${d.deal_stage?.deal_pipeline?.name}`;

let r = await req("GET", `/deals/${dealId}`);
console.log("ANTES :", info(r.body));

const put = await req("PUT", `/deals/${dealId}`, {
  deal: { deal_stage_id: stageId },
});
console.log("PUT   :", put.status);
if (put.status >= 400) console.log(JSON.stringify(put.body, null, 2));

r = await req("GET", `/deals/${dealId}`);
console.log("DEPOIS:", info(r.body));
