// Descobre o schema real das tabelas de vínculo do PS e onde estão candidatos.
// Uso: node --env-file=.env.local scripts/totvs-schema-vinculo.mjs
import sql from "mssql";

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const q = (query, inputs = {}) => {
  const req = pool.request();
  for (const [k, v] of Object.entries(inputs)) req.input(k, v);
  return req.query(query).then((r) => r.recordset);
};

console.log(`>>> DB=${process.env.TOTVS_DB_NAME}`);

// Tabelas que tenham USUARIO, RESP, CANDIDATO, FILIACAO, RELAC no nome
const tabs = await q(`
  SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_TYPE='BASE TABLE'
    AND (TABLE_NAME LIKE 'SPS%USUARIO%' OR TABLE_NAME LIKE 'SPS%RESP%'
         OR TABLE_NAME LIKE 'S%CANDIDAT%' OR TABLE_NAME LIKE 'SPS%RELAC%'
         OR TABLE_NAME LIKE 'SPS%FILIA%' OR TABLE_NAME LIKE '%DEPENDENTE%')
  ORDER BY TABLE_NAME`);
console.log("\n=== Tabelas candidatas ===");
console.log(tabs.map((t) => t.TABLE_NAME).join("\n"));

const cols = (t) =>
  q(
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME=@t ORDER BY ORDINAL_POSITION`,
    { t },
  ).then((r) => r.map((c) => `${c.COLUMN_NAME}:${c.DATA_TYPE}`).join(", "));

for (const t of [
  "SPSUSUARIO",
  "SPSUSUARIOTIPORELAC",
  "SCANDIDATOPROCSEL",
  "SCANDIDATO",
]) {
  console.log(`\n=== ${t} ===`);
  console.log(await cols(t).catch((e) => "erro: " + e.message));
}

await pool.close();
