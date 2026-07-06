// Limpeza do funil "Admissão 2027": remove as etapas padrão de venda que a API
// criou automaticamente, mantendo só as etapas de admissão, e ajusta a ordem.
// Uso: node --env-file=.env.local scripts/rdcrm-limpa-funil.mjs
const token = process.env.RD_CRM_TOKEN;
if (!token) {
  console.error("RD_CRM_TOKEN ausente.");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";
const NOME_FUNIL = "Admissão 2027";
const MANTER = [
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

const listar = await req("GET", "/deal_pipelines");
const funil = (listar.body || []).find((p) => p.name === NOME_FUNIL);
if (!funil) {
  console.error("Funil não encontrado.");
  process.exit(1);
}
const funilId = funil.id || funil._id;

// Remover etapas que NÃO estão na lista a manter.
for (const s of funil.deal_stages || []) {
  const id = s.id || s._id;
  if (MANTER.includes(s.name)) continue;
  const del = await req("DELETE", `/deal_stages/${id}`);
  console.log(
    `DELETE etapa "${s.name}" (${id}) ->`,
    del.status,
    del.status >= 400 ? JSON.stringify(del.body).slice(0, 200) : "",
  );
}

// Reordenar as mantidas conforme MANTER.
const releitura = await req("GET", "/deal_pipelines");
const f2 =
  (releitura.body || []).find((p) => (p.id || p._id) === funilId) || funil;
for (let i = 0; i < MANTER.length; i++) {
  const s = (f2.deal_stages || []).find((x) => x.name === MANTER[i]);
  if (!s) continue;
  const id = s.id || s._id;
  const upd = await req("PUT", `/deal_stages/${id}`, {
    deal_stage: { order: i + 1 },
  });
  console.log(`PUT ordem "${MANTER[i]}" = ${i + 1} ->`, upd.status);
}

const fim = await req("GET", "/deal_pipelines");
const ff = (fim.body || []).find((p) => (p.id || p._id) === funilId) || f2;
console.log("\n=== FUNIL FINAL ===", ff.name, "| id:", ff.id || ff._id);
for (const s of (ff.deal_stages || []).sort((a, b) => a.order - b.order)) {
  console.log(
    `  ${String(s.order).padStart(2)}. ${s.name.padEnd(20)} id: ${s.id || s._id}`,
  );
}
const inscrito = (ff.deal_stages || []).find((s) => s.name === "Inscrito");
const paga = (ff.deal_stages || []).find((s) => s.name === "Taxa paga");
console.log("\n--- Para o .env.local ---");
if (inscrito)
  console.log(`RD_CRM_DEAL_STAGE_ID=${inscrito.id || inscrito._id}`);
if (paga) console.log(`RD_CRM_DEAL_STAGE_PAGO_ID=${paga.id || paga._id}`);
