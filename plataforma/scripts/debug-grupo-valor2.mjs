// DEBUG SQL — confirma a coluna GRUPO em SPSINSCAREAOFERTACOMPL e os códigos do
// lookup GRPCAND (para saber qual código = ex-aluno / GRP2).
// Uso: node --env-file=.env.local scripts/debug-grupo-valor2.mjs [numeroInscricao]
import sql from "mssql";

const NUM = Number(process.argv[2] || 14);

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME,
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

async function q(label, text) {
  try {
    const r = await pool.request().query(text);
    console.log(`\n== ${label} ==`);
    console.log(JSON.stringify(r.recordset, null, 1));
  } catch (e) {
    console.log(`\n== ${label} == ERRO:`, e.message);
  }
}

await q(
  "Colunas de SPSINSCAREAOFERTACOMPL",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SPSINSCAREAOFERTACOMPL' ORDER BY COLUMN_NAME",
);

await q(
  `Valores GRUPO para inscrições nº ${NUM} (todas colig/PS)`,
  `SELECT CODCOLIGADA, IDPS, NUMEROINSCRICAO, GRUPO FROM SPSINSCAREAOFERTACOMPL WHERE NUMEROINSCRICAO = ${NUM}`,
);

await q(
  "Distribuição de valores de GRUPO gravados",
  "SELECT GRUPO, COUNT(*) AS N FROM SPSINSCAREAOFERTACOMPL GROUP BY GRUPO ORDER BY N DESC",
);

await q(
  "Lookup GRPCAND (GCONSIST) — códigos e descrições",
  "SELECT CODCOLIGADA, CODTABELA, CODCONSISTE, DESCRICAO FROM GCONSIST WHERE CODTABELA IN ('GRPCAND','GRUPO','GRPCANDIDATO') ORDER BY CODCONSISTE",
);

await pool.close();
process.exit(0);
