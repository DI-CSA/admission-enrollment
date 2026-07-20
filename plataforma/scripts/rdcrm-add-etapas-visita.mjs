// Adiciona ao funil "Admissão 2027" do RD Station CRM as etapas de VISITA, de
// forma aditiva e idempotente, logo após "Sem contato":
//
//   Sem contato → [Visita agendada] → [Visita realizada] → Inscrito → Taxa paga → …
//
// Também cria (best-effort) os MOTIVOS DE PERDA de visita.
//
// API RD CRM v1: POST /deal_stages (criar), PUT /deal_stages/:id (reordenar),
// POST /deal_lost_reasons (motivo de perda). DELETE não é suportado (só na UI).
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/rdcrm-add-etapas-visita.mjs           # DRY-RUN
//   node --env-file=.env.local scripts/rdcrm-add-etapas-visita.mjs --commit  # aplica

const token = process.env.RD_CRM_TOKEN;
if (!token) {
  console.error("RD_CRM_TOKEN ausente. Rode com --env-file=.env.local");
  process.exit(1);
}
const COMMIT = process.argv.includes("--commit");
const BASE = "https://crm.rdstation.com/api/v1";
const PIPELINE_ID =
  process.env.RD_CRM_DEAL_PIPELINE_ID?.trim() || "6a4bb56342e296001faf851f";

const NOVAS = ["Visita agendada", "Visita realizada"];
const APOS = "Sem contato"; // âncora: as novas entram depois desta
const ORDEM_ALVO = [
  "Sem contato",
  ...NOVAS,
  "Inscrito",
  "Taxa paga",
  "Prova/Entrevista",
  "Cadastro de matrícula",
  "Pré-matrícula",
  "Matriculado",
];
const MOTIVOS_PERDA = ["Não compareceu (no-show)", "Não avançou após a visita"];

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

const sid = (s) => s?.id || s?._id;

async function lerPipeline() {
  const r = await req("GET", "/deal_pipelines");
  const lista = Array.isArray(r.body) ? r.body : (r.body?.deal_pipelines ?? []);
  const p = lista.find((x) => sid(x) === PIPELINE_ID);
  if (!p) {
    console.error("Funil não encontrado:", PIPELINE_ID);
    process.exit(1);
  }
  return p;
}

let pipe = await lerPipeline();
let stages = (pipe.deal_stages || [])
  .slice()
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

console.log(`\nFUNIL: ${pipe.name} (${PIPELINE_ID}) — estado ATUAL:`);
for (const s of stages) console.log(`  ${s.order}. ${s.name}  ${sid(s)}`);

const porNome = new Map(stages.map((s) => [s.name, s]));
if (!porNome.get(APOS)) {
  console.error(`Etapa âncora "${APOS}" não existe — abortando.`);
  process.exit(1);
}

console.log("\nPLANO (ordem-alvo):");
ORDEM_ALVO.forEach((n, i) => {
  const existe = porNome.has(n);
  const novo = NOVAS.includes(n);
  console.log(`  ${i + 1}. ${n}  ${novo && !existe ? "(POST cria)" : existe ? "(mantém/reordena)" : "(ausente)"}`);
});
console.log("MOTIVOS DE PERDA (best-effort):", MOTIVOS_PERDA.join(" | "));

if (!COMMIT) {
  console.log("\n(DRY-RUN — nada aplicado. Rode com --commit para efetivar.)");
  process.exit(0);
}

// 1) Cria as etapas novas que faltarem.
for (const nome of NOVAS) {
  if (porNome.get(nome)) continue;
  const r = await req("POST", "/deal_stages", {
    deal_stage: { name: nome, deal_pipeline_id: PIPELINE_ID, order: 2 },
  });
  console.log(`POST "${nome}" ->`, r.status);
  if (r.status >= 300) console.log(JSON.stringify(r.body, null, 2));
}

// 2) Normaliza a ORDEM completa (convergência em alguns passes).
for (let passe = 1; passe <= 6; passe++) {
  pipe = await lerPipeline();
  const atual = new Map((pipe.deal_stages || []).map((s) => [s.name, s]));
  let okTudo = true;
  for (let i = 0; i < ORDEM_ALVO.length; i++) {
    const s = atual.get(ORDEM_ALVO[i]);
    if (!s) continue;
    if ((s.order ?? -1) !== i + 1) {
      okTudo = false;
      await req("PUT", `/deal_stages/${sid(s)}`, {
        deal_stage: { name: ORDEM_ALVO[i], order: i + 1 },
      });
    }
  }
  if (okTudo) break;
}

// 3) Motivos de perda (best-effort — endpoint pode variar/não existir).
const lrGet = await req("GET", "/deal_lost_reasons");
if (lrGet.status < 300) {
  const arr = Array.isArray(lrGet.body)
    ? lrGet.body
    : (lrGet.body?.deal_lost_reasons ?? []);
  const nomes = new Set(arr.map((x) => x.name));
  for (const nome of MOTIVOS_PERDA) {
    if (nomes.has(nome)) {
      console.log(`motivo de perda já existe: "${nome}"`);
      continue;
    }
    const r = await req("POST", "/deal_lost_reasons", {
      deal_lost_reason: { name: nome },
    });
    console.log(`POST motivo "${nome}" ->`, r.status);
  }
} else {
  console.log("(motivos de perda: GET /deal_lost_reasons ->", lrGet.status, "— criar pela UI)");
}

// 4) Estado final + IDs para o .env.
pipe = await lerPipeline();
stages = (pipe.deal_stages || [])
  .slice()
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
console.log("\n=== ESTADO FINAL ===");
for (const s of stages) console.log(`  ${s.order}. ${s.name}  ${sid(s)}`);

const ag = stages.find((s) => s.name === "Visita agendada");
const re = stages.find((s) => s.name === "Visita realizada");
console.log("\n--- Para o .env ---");
if (ag) console.log(`RD_CRM_DEAL_STAGE_VISITA_AGENDADA_ID=${sid(ag)}`);
if (re) console.log(`RD_CRM_DEAL_STAGE_VISITA_REALIZADA_ID=${sid(re)}`);
