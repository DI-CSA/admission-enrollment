// DEBUG SQL — confirma a ligação inscrição→FLAN (via SPSLANCAMENTO) e o
// significado de STATUSLAN/DATABAIXA em taxas de inscrição reais.
// Uso: node --env-file=.env.local scripts/debug-fin-link.mjs [idps]
import sql from "mssql";

const idps = Number(process.argv[2] || 210);
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
    console.log(JSON.stringify(r.recordset));
  } catch (e) {
    console.log(`\n== ${label} == ERRO:`, e.message);
  }
}

await q(
  "SPSLANCAMENTO colunas",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SPSLANCAMENTO' ORDER BY COLUMN_NAME",
);
await q(
  "SPSHISTLANINSCRICAO colunas",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SPSHISTLANINSCRICAO' ORDER BY COLUMN_NAME",
);
// Distribuição de STATUSLAN das taxas do PS (via SPSLANCAMENTO → FLAN)
await q(
  `STATUSLAN das taxas (idps=${idps})`,
  `SELECT l.STATUSLAN, COUNT(*) AS QTD, SUM(CASE WHEN l.DATABAIXA IS NOT NULL THEN 1 ELSE 0 END) AS COM_DATABAIXA
     FROM SPSLANCAMENTO sl
     JOIN FLAN l ON l.CODCOLIGADA=sl.CODCOLIGADA AND l.IDLAN=sl.IDLAN
    WHERE sl.IDPS=${idps}
    GROUP BY l.STATUSLAN`,
);
// Amostra de taxas PAGAS (DATABAIXA preenchida)
await q(
  `Amostra taxas com DATABAIXA (idps=${idps})`,
  `SELECT TOP 5 sl.NUMEROINSCRICAO, l.IDLAN, l.STATUSLAN, l.VALORORIGINAL, l.VALORBAIXADO, l.DATABAIXA, l.DATAPAG, l.DATAVENCIMENTO, l.IDBOLETO
     FROM SPSLANCAMENTO sl
     JOIN FLAN l ON l.CODCOLIGADA=sl.CODCOLIGADA AND l.IDLAN=sl.IDLAN
    WHERE sl.IDPS=${idps} AND l.DATABAIXA IS NOT NULL
    ORDER BY l.DATABAIXA DESC`,
);
// Amostra de taxas EM ABERTO
await q(
  `Amostra taxas SEM baixa (idps=${idps})`,
  `SELECT TOP 3 sl.NUMEROINSCRICAO, l.IDLAN, l.STATUSLAN, l.VALORORIGINAL, l.VALORBAIXADO, l.DATABAIXA, l.DATAVENCIMENTO, l.IDBOLETO
     FROM SPSLANCAMENTO sl
     JOIN FLAN l ON l.CODCOLIGADA=sl.CODCOLIGADA AND l.IDLAN=sl.IDLAN
    WHERE sl.IDPS=${idps} AND l.DATABAIXA IS NULL
    ORDER BY sl.NUMEROINSCRICAO DESC`,
);

await pool.close();
process.exit(0);
