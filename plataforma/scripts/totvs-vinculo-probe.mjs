// Descobre como o vínculo candidato↔PS↔responsável é persistido, para modelar o
// pré-check de "mesmo candidato já inscrito neste PS".
// Uso: node --env-file=.env.local scripts/totvs-vinculo-probe.mjs

import sql from "mssql";

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

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

for (const t of [
  "SPSINSCRICAOAREAOFERTADA",
  "SPSUSUARIOTIPORELAC",
  "SPSRESPONSAVELCANDIDATO",
  "SCANDIDATOPROCSEL",
  "SVAGASCANDIDATOS",
]) {
  console.log(`\n=== ${t} ===`);
  console.log("PK:", await pk(t));
  console.log("COLS:", await cols(t));
}

// Contagens p/ o PS 210 (2027) e um PS movimentado (193) p/ entender volume
for (const idps of [210, 193]) {
  const sc = await pool
    .request()
    .input("idps", idps)
    .query("SELECT COUNT(*) N FROM SCANDIDATOPROCSEL WHERE IDPROCSEL=@idps");
  console.log(
    `\nSCANDIDATOPROCSEL IDPROCSEL=${idps}: ${sc.recordset[0].N} inscrições`,
  );
}

await pool.close();
