// Lista os funis (pipelines) e etapas (stages) do RD Station CRM, para descobrir
// os IDs de etapa (RD_CRM_DEAL_STAGE_ID / etapa "Taxa paga") sem mexer na UI.
// Somente LEITURA (GET). Uso:
//   node --env-file=.env.local scripts/rdcrm-pipelines.mjs
const token = process.env.RD_CRM_TOKEN;
if (!token) {
  console.error("RD_CRM_TOKEN ausente no ambiente.");
  process.exit(1);
}

const BASE = "https://crm.rdstation.com/api/v1";

async function get(path) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const pipelines = await get("/deal_pipelines");
console.log("=== GET /deal_pipelines ===", "status", pipelines.status);
console.log(JSON.stringify(pipelines.body, null, 2));

const stages = await get("/deal_stages");
console.log("\n=== GET /deal_stages ===", "status", stages.status);
console.log(JSON.stringify(stages.body, null, 2));
