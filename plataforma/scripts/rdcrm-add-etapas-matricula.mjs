// Adiciona DUAS etapas ao funil "Admissão 2027" do RD Station CRM, de forma
// ADITIVA e idempotente, e reposiciona "Matriculado" para o fim:
//
//   … Taxa paga → Prova/Entrevista → [Cadastro de matrícula] → [Pré-matrícula] → Matriculado
//
//   - "Cadastro de matrícula": boleto de reserva (R$2.200) GERADO = cadastro de
//      matrícula preenchido e válido.
//   - "Pré-matrícula": boleto de reserva PAGO = pré-matrícula confirmada.
//
// A API RD CRM v1 permite POST /deal_stages (criar) e PUT /deal_stages/:id
// (renomear/reordenar). DELETE não é suportado (excluir só na UI).
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/rdcrm-add-etapas-matricula.mjs           # DRY-RUN (só mostra o plano)
//   node --env-file=.env.local scripts/rdcrm-add-etapas-matricula.mjs --commit  # aplica no CRM

const token = process.env.RD_CRM_TOKEN;
if (!token) {
  console.error("RD_CRM_TOKEN ausente. Rode com --env-file=.env.local");
  process.exit(1);
}
const COMMIT = process.argv.includes("--commit");
const BASE = "https://crm.rdstation.com/api/v1";
const PIPELINE_ID =
  process.env.RD_CRM_DEAL_PIPELINE_ID?.trim() || "6a4bb56342e296001faf851f";

// Etapas novas (na ordem em que devem aparecer, logo após "Prova/Entrevista").
const NOVAS = ["Cadastro de matrícula", "Pré-matrícula"];
const APOS = "Prova/Entrevista"; // âncora: as novas entram depois desta
const ULTIMA = "Matriculado"; // deve permanecer por último

// Sequência COMPLETA desejada do funil (usada para normalizar a ordem — a API
// do RD desloca ordens ao inserir, então convergimos com PUTs idempotentes).
const ORDEM_ALVO = [
  "Sem contato",
  "Inscrito",
  "Taxa paga",
  APOS,
  ...NOVAS,
  ULTIMA,
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
const ancora = porNome.get(APOS);
if (!ancora) {
  console.error(`Etapa âncora "${APOS}" não existe — abortando.`);
  process.exit(1);
}

// Ordem-alvo: âncora mantém sua ordem; novas entram logo após; "Matriculado" ao fim.
const ordemAncora = ancora.order ?? 4;
const plano = NOVAS.map((name, i) => ({ name, order: ordemAncora + 1 + i }));
const ordemUltima = ordemAncora + 1 + NOVAS.length;

console.log("\nPLANO:");
for (const p of plano)
  console.log(
    `  ${porNome.has(p.name) ? "PUT (reordena)" : "POST (cria)"} "${p.name}" -> order ${p.order}`,
  );
console.log(`  PUT "${ULTIMA}" -> order ${ordemUltima}`);

if (!COMMIT) {
  console.log("\n(DRY-RUN — nada aplicado. Rode com --commit para efetivar.)");
  process.exit(0);
}

// 1) Cria as novas etapas que faltarem (a ordem é normalizada no passo 2).
for (const p of plano) {
  if (porNome.get(p.name)) continue;
  const r = await req("POST", "/deal_stages", {
    deal_stage: {
      name: p.name,
      deal_pipeline_id: PIPELINE_ID,
      order: p.order,
    },
  });
  console.log(`POST "${p.name}" ->`, r.status);
  if (r.status >= 300) console.log(JSON.stringify(r.body, null, 2));
}

// 2) Normaliza a ORDEM completa (convergência: a API desloca ordens ao inserir).
for (let passe = 1; passe <= 5; passe++) {
  pipe = await lerPipeline();
  const atual = new Map((pipe.deal_stages || []).map((s) => [s.name, s]));
  let okTudo = true;
  for (let i = 0; i < ORDEM_ALVO.length; i++) {
    const nome = ORDEM_ALVO[i];
    const s = atual.get(nome);
    if (!s) continue; // etapa opcional ausente (nomes divergentes)
    if ((s.order ?? -1) !== i + 1) {
      okTudo = false;
      await req("PUT", `/deal_stages/${sid(s)}`, {
        deal_stage: { name: nome, order: i + 1 },
      });
    }
  }
  if (okTudo) break;
}

// 3) Relê e imprime o estado final + IDs para o .env.
pipe = await lerPipeline();
stages = (pipe.deal_stages || [])
  .slice()
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
console.log("\n=== ESTADO FINAL ===");
for (const s of stages) console.log(`  ${s.order}. ${s.name}  ${sid(s)}`);

const cad = stages.find((s) => s.name === "Cadastro de matrícula");
const pre = stages.find((s) => s.name === "Pré-matrícula");
console.log("\n--- Para o .env ---");
if (cad) console.log(`RD_CRM_DEAL_STAGE_CADASTRO_MATRICULA_ID=${sid(cad)}`);
if (pre) console.log(`RD_CRM_DEAL_STAGE_PRE_MATRICULA_ID=${sid(pre)}`);
const mat = stages.find((s) => s.name === ULTIMA);
if (mat) console.log(`RD_CRM_DEAL_STAGE_MATRICULADO_ID=${sid(mat)}`);
