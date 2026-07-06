// Lista os funis (deal_pipelines) e etapas (deal_stages) do RD Station CRM.
// Uso: node --env-file=.env.local scripts/rdcrm-stages.mjs
const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente no ambiente");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";

async function getJson(path) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${TOKEN}`;
  const r = await fetch(url);
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

const norm = (arr) =>
  Array.isArray(arr) ? arr : (arr?.deal_pipelines ?? arr?.deal_stages ?? []);

const pipelines = norm(await getJson("/deal_pipelines"));
for (const p of pipelines) {
  const pid = p.id ?? p._id;
  console.log(`\n# FUNIL: ${p.name}  (id=${pid})`);
  const stages = norm(await getJson(`/deal_stages?deal_pipeline_id=${pid}`));
  for (const s of stages) {
    console.log(`   ${s.name}  ->  ${s.id ?? s._id}`);
  }
}
