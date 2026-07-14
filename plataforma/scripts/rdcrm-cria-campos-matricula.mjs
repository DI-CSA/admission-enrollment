// Cria (idempotente por label) os CAMPOS PERSONALIZADOS de negociação usados no
// enriquecimento da matrícula no RD Station CRM e imprime os UUIDs (para o .env).
// Reaproveita o campo de teste "Pai (contato)" renomeando-o para "Pai".
// Uso: node --env-file=.env.local scripts/rdcrm-cria-campos-matricula.mjs [--commit]
const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";
const COMMIT = process.argv.includes("--commit");

// label -> chave de env
const CAMPOS = [
  ["Pai", "RD_CRM_CF_PAI_ID"],
  ["Mãe", "RD_CRM_CF_MAE_ID"],
  ["Responsável financeiro", "RD_CRM_CF_RESP_FINANCEIRO_ID"],
  ["Data do cadastro de matrícula", "RD_CRM_CF_DATA_CADASTRO_ID"],
  ["Data do pagamento da reserva", "RD_CRM_CF_DATA_PAGAMENTO_ID"],
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

// Renomeia o campo de teste "Pai (contato)" -> "Pai" (se houver e "Pai" não existir).
if (COMMIT && porLabel.has("Pai (contato)") && !porLabel.has("Pai")) {
  const id = sid(porLabel.get("Pai (contato)"));
  const r = await j(tok(`/custom_fields/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ custom_field: { label: "Pai" } }),
  });
  console.log(`PUT rename "Pai (contato)" -> "Pai": ${r.status}`);
  if (r.status < 300) porLabel.set("Pai", { id, label: "Pai" });
}

const out = {};
for (const [label, envKey] of CAMPOS) {
  let campo = porLabel.get(label);
  if (!campo && COMMIT) {
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
  }
  if (campo) out[envKey] = sid(campo);
}

console.log("\n--- Para o .env (VM + local) ---");
for (const [, envKey] of CAMPOS)
  if (out[envKey]) console.log(`${envKey}=${out[envKey]}`);
if (!COMMIT) console.log("\n(DRY — rode com --commit para criar/renomear)");
