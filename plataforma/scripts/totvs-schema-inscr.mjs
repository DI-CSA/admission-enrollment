// Descobre a tabela que liga SPSUSUARIO(candidato) ao PS/inscrição.
// Uso: node --env-file=.env.local scripts/totvs-schema-inscr.mjs
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

const tabs = await q(`
  SELECT t.TABLE_NAME FROM INFORMATION_SCHEMA.TABLES t
  WHERE t.TABLE_TYPE='BASE TABLE' AND t.TABLE_NAME LIKE 'SPS%'
    AND EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS c
                WHERE c.TABLE_NAME=t.TABLE_NAME AND c.COLUMN_NAME='CODUSUARIOPS')
  ORDER BY t.TABLE_NAME`);
console.log("\n=== Tabelas SPS% que têm CODUSUARIOPS ===");
console.log(tabs.map((t) => t.TABLE_NAME).join("\n"));

const cols = (t) =>
  q(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME=@t ORDER BY ORDINAL_POSITION`,
    { t },
  ).then((r) => r.map((c) => c.COLUMN_NAME).join(", "));

// tabelas de inscrição prováveis
const inscTabs = await q(`
  SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_TYPE='BASE TABLE'
    AND (TABLE_NAME LIKE 'SPS%INSCR%' OR TABLE_NAME LIKE 'SPSINSCRICAO%')
  ORDER BY TABLE_NAME`);
console.log("\n=== Tabelas de inscrição ===");
for (const t of inscTabs) {
  console.log(`\n--- ${t.TABLE_NAME} ---`);
  console.log(await cols(t.TABLE_NAME));
}

await pool.close();
