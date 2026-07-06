// Cria o funil "Admissão 2027" e suas etapas no RD Station CRM (via API v1) e
// imprime os IDs resultantes (para preencher RD_CRM_DEAL_STAGE_ID / _PAGO_ID).
// Idempotente: se já existir um funil com o mesmo nome, reaproveita.
// Uso: node --env-file=.env.local scripts/rdcrm-cria-funil.mjs
const token = process.env.RD_CRM_TOKEN;
if (!token) {
  console.error("RD_CRM_TOKEN ausente.");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";
const NOME_FUNIL = "Admissão 2027";
const ETAPAS = [
  "Inscrito",
  "Taxa paga",
  "Documentação",
  "Prova/Entrevista",
  "Matriculado",
];

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

// 1) Já existe um funil com esse nome?
const listar = await req("GET", "/deal_pipelines");
if (listar.status !== 200 || !Array.isArray(listar.body)) {
  console.error("Falha ao listar funis:", listar.status, listar.body);
  process.exit(1);
}
let funil = listar.body.find((p) => p.name === NOME_FUNIL);

// 2) Criar o funil (com etapas aninhadas) se não existir.
if (!funil) {
  const criar = await req("POST", "/deal_pipelines", {
    deal_pipeline: {
      name: NOME_FUNIL,
      deal_stages: ETAPAS.map((name, i) => ({ name, order: i + 1 })),
    },
  });
  console.log("POST /deal_pipelines ->", criar.status);
  console.log(JSON.stringify(criar.body, null, 2));
  if (criar.status >= 200 && criar.status < 300) {
    funil = criar.body;
  } else {
    console.error("Não foi possível criar o funil. Abortando.");
    process.exit(1);
  }
} else {
  console.log(`Funil "${NOME_FUNIL}" já existe: ${funil.id}`);
}

// 3) Garantir que todas as etapas existam (cria as que faltarem).
const funilId = funil.id || funil._id;
let stagesAtuais = Array.isArray(funil.deal_stages) ? funil.deal_stages : [];
for (let i = 0; i < ETAPAS.length; i++) {
  const nome = ETAPAS[i];
  if (stagesAtuais.some((s) => s.name === nome)) continue;
  const criarEtapa = await req("POST", "/deal_stages", {
    deal_stage: { name: nome, deal_pipeline_id: funilId, order: i + 1 },
  });
  console.log(`POST /deal_stages "${nome}" ->`, criarEtapa.status);
  if (criarEtapa.status >= 200 && criarEtapa.status < 300) {
    stagesAtuais.push(criarEtapa.body);
  } else {
    console.log(JSON.stringify(criarEtapa.body, null, 2));
  }
}

// 4) Reler o funil para imprimir os IDs finais em ordem.
const final = await req("GET", "/deal_pipelines");
const funilFinal =
  (Array.isArray(final.body) &&
    final.body.find((p) => (p.id || p._id) === funilId)) ||
  funil;
console.log("\n=== FUNIL CRIADO / ATUALIZADO ===");
console.log(
  "Funil:",
  funilFinal.name,
  "| id:",
  funilFinal.id || funilFinal._id,
);
for (const s of funilFinal.deal_stages || []) {
  console.log(`  etapa: ${s.name.padEnd(20)} id: ${s.id || s._id}`);
}
const inscrito = (funilFinal.deal_stages || []).find(
  (s) => s.name === "Inscrito",
);
const paga = (funilFinal.deal_stages || []).find((s) => s.name === "Taxa paga");
console.log("\n--- Para o .env.local ---");
if (inscrito)
  console.log(`RD_CRM_DEAL_STAGE_ID=${inscrito.id || inscrito._id}`);
if (paga) console.log(`RD_CRM_DEAL_STAGE_PAGO_ID=${paga.id || paga._id}`);
