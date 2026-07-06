// Backfill do token de reconciliação `[LAN:<idlan>]` no NOME das negociações
// existentes do funil de admissão. Resolve o IDLAN de cada deal casando
// (NUMEROINSCRICAO + nome do candidato) contra o RM do ciclo (evita a
// ambiguidade do NUMEROINSCRICAO, que se repete entre PS/séries).
// LEITURA por padrão; só ESCREVE com --commit.
// Uso:
//   node --env-file=.env.local scripts/rdcrm-backfill-idlan.mjs            (dry)
//   node --env-file=.env.local scripts/rdcrm-backfill-idlan.mjs --commit   (escreve)
import sql from "mssql";

const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente");
  process.exit(1);
}
const BASE = "https://crm.rdstation.com/api/v1";
const PIPELINE =
  process.env.RD_CRM_DEAL_PIPELINE_ID?.trim() || "6a4bb56342e296001faf851f";
const ANO = process.env.PS_ANO_ATUAL?.trim() || "2027";

const args = process.argv.slice(2);
const commit = args.includes("--commit");

const config = {
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch com retry para 5xx / respostas não-JSON (503 HTML transitório do RD).
async function fetchJson(url, init, tentativas = 4) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    const r = await fetch(url, init);
    const txt = await r.text();
    let body;
    try {
      body = JSON.parse(txt);
    } catch {
      body = null;
    }
    if (r.status < 500 && body !== null) return { status: r.status, body };
    ultimo = { status: r.status, body: body ?? txt.slice(0, 200) };
    await sleep(1500 * (i + 1));
  }
  return ultimo;
}

const norm = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

// ---- 1) mapa (num + nome candidato) -> IDLAN, do RM ----
await sql.connect(config);
const rm = await sql.query(`
  SELECT DISTINCT i.NUMEROINSCRICAO, u.NOME AS CANDIDATO, i.IDLAN
    FROM SPSINSCRICAOAREAOFERTADA i
    JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA = i.CODCOLIGADA AND ps.IDPS = i.IDPS
    JOIN SPSUSUARIO u ON u.CODUSUARIOPS = i.CODUSUARIOPS
   WHERE ps.NOME LIKE '%${ANO}%'
     AND i.IDLAN IS NOT NULL`);
await sql.close();

const mapa = new Map(); // "num|NOME" -> Set<idlan>
for (const row of rm.recordset) {
  const key = `${row.NUMEROINSCRICAO}|${norm(row.CANDIDATO)}`;
  if (!mapa.has(key)) mapa.set(key, new Set());
  mapa.get(key).add(Number(row.IDLAN));
}
console.log(
  `RM: ${rm.recordset.length} linhas 2027 c/ IDLAN; ${mapa.size} chaves (num+nome).`,
);

// ---- 2) lista deals do funil ----
const deals = [];
for (let page = 1; page <= 100; page++) {
  const { status, body } = await fetchJson(
    `${BASE}/deals?token=${TOKEN}&limit=200&page=${page}&deal_pipeline_id=${PIPELINE}`,
  );
  if (status >= 400 || !body) {
    console.error("falha ao listar deals:", status, body);
    process.exit(1);
  }
  const lista = Array.isArray(body) ? body : (body.deals ?? []);
  if (lista.length === 0) break;
  deals.push(...lista);
  const hasMore =
    typeof body.has_more === "boolean" ? body.has_more : lista.length === 200;
  if (!hasMore) break;
}
console.log(`CRM: ${deals.length} negociações no funil.\n`);

// ---- 3) resolve + (opcional) grava ----
let jaTem = 0;
let gravados = 0;
let naoResolvido = 0;
let ambiguo = 0;

for (const d of deals) {
  const id = String(d.id ?? d._id ?? "");
  const nome = typeof d.name === "string" ? d.name : "";
  if (/\[LAN:\d+\]/.test(nome)) {
    jaTem++;
    continue;
  }
  const semToken = nome.replace(/\s*\[LAN:\d+\]\s*$/u, "").trim();
  const m = /Inscri\u00e7\u00e3o n\u00ba\s*(\d+)\s*(?:—|-)\s*(.+)$/u.exec(
    semToken,
  );
  if (!m) {
    console.warn(`  [sem parse] ${id} :: "${nome}"`);
    naoResolvido++;
    continue;
  }
  const num = m[1];
  const cand = m[2];
  const key = `${num}|${norm(cand)}`;
  const set = mapa.get(key);
  if (!set || set.size === 0) {
    console.warn(`  [nao-resolvido] ${id} :: nº ${num} — ${cand}`);
    naoResolvido++;
    continue;
  }
  if (set.size > 1) {
    console.warn(
      `  [ambiguo] ${id} :: nº ${num} — ${cand} → IDLANs ${[...set].join(",")}`,
    );
    ambiguo++;
    continue;
  }
  const idlan = [...set][0];
  const novoNome = `${semToken} [LAN:${idlan}]`;
  if (!commit) {
    console.log(`  [dry] ${id} :: "${nome}" -> "${novoNome}"`);
    gravados++;
    continue;
  }
  const res = await fetchJson(`${BASE}/deals/${id}?token=${TOKEN}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deal: { name: novoNome } }),
  });
  if (res.status >= 400) {
    console.error(`  [FALHA ${res.status}] ${id} ::`, res.body);
    naoResolvido++;
    continue;
  }
  console.log(`  [ok] ${id} -> "${novoNome}"`);
  gravados++;
}

console.log(
  `\nResumo: ${commit ? "gravados" : "seriam gravados"}=${gravados}, jaTem=${jaTem}, naoResolvido=${naoResolvido}, ambiguo=${ambiguo}`,
);
