// Descobre tabelas auxiliares do PS: nome da área de interesse, PKs e colunas de
// SCANDIDATOPROCSEL — para modelar oferta de áreas e vínculo candidato↔PS.
// Uso: node --env-file=.env.local scripts/totvs-aux-probe.mjs

import sql from "mssql";

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const q = (text) =>
  pool
    .request()
    .query(text)
    .then((r) => r.recordset);
const cols = (t) =>
  pool
    .request()
    .input("t", t)
    .query(
      "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@t ORDER BY ORDINAL_POSITION",
    )
    .then((r) =>
      r.recordset.map((c) => `${c.COLUMN_NAME}:${c.DATA_TYPE}`).join(", "),
    );
const pk = (t) =>
  pool
    .request()
    .input("t", t)
    .query(
      `SELECT c.COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE c
       JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS k ON c.CONSTRAINT_NAME=k.CONSTRAINT_NAME
       WHERE k.TABLE_NAME=@t AND k.CONSTRAINT_TYPE='PRIMARY KEY' ORDER BY c.ORDINAL_POSITION`,
    )
    .then((r) => r.recordset.map((x) => x.COLUMN_NAME).join(", "));

const areaTabs = await q(
  "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%AREAINTERESSE%' ORDER BY TABLE_NAME",
);
console.log(
  "TABELAS AREAINTERESSE:",
  areaTabs.map((r) => r.TABLE_NAME).join(", "),
);

for (const t of ["SPSAREAINTERESSE", "SAREAINTERESSE"]) {
  const c = await cols(t);
  if (c) console.log(`\n${t}: ${c}`);
}

console.log("\nPK SPSUSUARIO:", await pk("SPSUSUARIO"));
console.log("PK SPSAREAOFERTADA:", await pk("SPSAREAOFERTADA"));
console.log("PK SCANDIDATOPROCSEL:", await pk("SCANDIDATOPROCSEL"));
console.log("\nSCANDIDATOPROCSEL cols:", await cols("SCANDIDATOPROCSEL"));

await pool.close();
