// READ-ONLY: resolução do rótulo de situação (SPSOPCAOINSCRITO -> SPSSTATUSOPCAO)
// e filial das inscrições 2027. Uso: node --env-file=.env.local scripts/descobre-label-situacao.mjs
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

console.log("=== SPSPROCESSOSELETIVO tem CODFILIAL? ===");
console.table(
  await q(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='SPSPROCESSOSELETIVO' AND COLUMN_NAME LIKE '%FILIAL%'`,
  ),
);

console.log("\n=== SPSINSCRICAOAREAOFERTADA colunas c/ FILIAL/COLIGADA ===");
console.table(
  await q(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='SPSINSCRICAOAREAOFERTADA' AND (COLUMN_NAME LIKE '%FILIAL%' OR COLUMN_NAME LIKE '%COLIGADA%')`,
  ),
);

console.log(
  "\n=== Amostra 2027: status + rótulo resolvido por filial da opção/área ===",
);
console.table(
  await q(`
    SELECT TOP 30 o.IDPS, o.NUMEROINSCRICAO, o.CODCOLIGADA, o.STATUS,
           ps.CODFILIAL AS FILIAL_PS,
           st1.DESCRICAO AS DESC_FILIAL_PS,
           st0.DESCRICAO AS DESC_FILIAL0
      FROM SPSOPCAOINSCRITO o
      JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA=o.CODCOLIGADA AND ps.IDPS=o.IDPS
      LEFT JOIN SPSSTATUSOPCAO st1 ON st1.CODIGO=o.STATUS AND st1.CODCOLIGADA=o.CODCOLIGADA AND st1.CODFILIAL=ps.CODFILIAL
      LEFT JOIN SPSSTATUSOPCAO st0 ON st0.CODIGO=o.STATUS AND st0.CODCOLIGADA=o.CODCOLIGADA AND st0.CODFILIAL=0
     WHERE ps.NOME LIKE '%2027%'
     ORDER BY o.IDPS DESC, o.NUMEROINSCRICAO DESC`),
);

console.log("\n=== distribuição de STATUS nas opções 2027 ===");
console.table(
  await q(`
    SELECT o.STATUS, COUNT(*) AS N
      FROM SPSOPCAOINSCRITO o
      JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA=o.CODCOLIGADA AND ps.IDPS=o.IDPS
     WHERE ps.NOME LIKE '%2027%'
     GROUP BY o.STATUS ORDER BY N DESC`),
);

await pool.close();
console.log("\n>>> Concluído (nenhuma escrita).");
