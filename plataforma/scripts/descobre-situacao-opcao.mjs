// READ-ONLY: situação da inscrição (SPSOPCAOINSCRITO + SPSSTATUSOPCAO).
// Uso: cd plataforma && node --env-file=.env.local scripts/descobre-situacao-opcao.mjs
import sql from "mssql";

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const q = (s) =>
  pool
    .request()
    .query(s)
    .then((r) => r.recordset);
const cols = (t) =>
  q(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS LEN
       FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`,
  );

console.log("=== colunas SPSOPCAOINSCRITO ===");
console.table(await cols("SPSOPCAOINSCRITO"));

console.log("\n=== colunas SPSSTATUSOPCAO ===");
console.table(await cols("SPSSTATUSOPCAO"));

console.log("\n=== conteúdo SPSSTATUSOPCAO (rótulos) ===");
try {
  console.table(await q("SELECT * FROM SPSSTATUSOPCAO ORDER BY 1"));
} catch (e) {
  console.log("  (falhou:", e.message, ")");
}

console.log("\n=== distribuição STATUSOPCAO em SPSOPCAOINSCRITO ===");
try {
  console.table(
    await q(
      `SELECT STATUSOPCAO, COUNT(*) AS N FROM SPSOPCAOINSCRITO
         GROUP BY STATUSOPCAO ORDER BY N DESC`,
    ),
  );
} catch (e) {
  console.log("  (falhou:", e.message, ")");
}

await pool.close();
console.log("\n>>> Concluído (nenhuma escrita).");
