// Cria (idempotente por label) os CAMPOS PERSONALIZADOS de negociação usados no
// enriquecimento das VISITAS no RD Station CRM e imprime os UUIDs (para o .env).
// Uso: node --env-file=.env.local scripts/rdcrm-cria-campos-visita.mjs [--commit]
const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";
const COMMIT = process.argv.includes("--commit");

// label -> chave de env
const CAMPOS = [
  ["Data da visita", "RD_CRM_CF_VISITA_DATA_ID"],
  ["Tipo da visita", "RD_CRM_CF_VISITA_TIPO_ID"],
  ["Situação da visita", "RD_CRM_CF_VISITA_SITUACAO_ID"],
  ["Operador", "RD_CRM_CF_VISITA_OPERADOR_ID"],
  ["Participantes", "RD_CRM_CF_VISITA_PARTICIPANTES_ID"],
  ["Local da visita", "RD_CRM_CF_VISITA_LOCAL_ID"],
  ["Origem do contato", "RD_CRM_CF_VISITA_ORIGEM_ID"],
];

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
const sid = (x) => x?.id || x?._id;

const lista = await j(tok(`/custom_fields`));
const existentes = Array.isArray(lista.body)
  ? lista.body
  : (lista.body?.custom_fields ?? []);
const porLabel = new Map(existentes.map((c) => [c.label, c]));
console.log(
  `Campos existentes: ${existentes.map((c) => c.label).join(" | ") || "(nenhum)"}`,
);

const out = {};
for (const [label, envKey] of CAMPOS) {
  let campo = porLabel.get(label);
  if (campo) {
    console.log(`= já existe: "${label}"`);
  } else if (COMMIT) {
    const r = await j(tok(`/custom_fields`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        custom_field: { label, type: "text", for: "deal" },
      }),
    });
    console.log(`POST "${label}" -> ${r.status}`);
    if (r.status < 300) {
      campo = r.body;
      porLabel.set(label, campo);
    } else console.log(JSON.stringify(r.body).slice(0, 200));
  } else {
    console.log(`+ criaria: "${label}"`);
  }
  if (campo) out[envKey] = sid(campo);
}

console.log("\n--- Para o .env (VM + local) ---");
for (const [, envKey] of CAMPOS)
  if (out[envKey]) console.log(`${envKey}=${out[envKey]}`);
if (!COMMIT) console.log("\n(DRY — rode com --commit para criar)");
