// DEBUG SQL — SPSINSCRICAOAREAOFERTADA como bridge para o título/boleto da taxa.
// Uso: node --env-file=.env.local scripts/debug-fin-link4.mjs [idps] [numeroInscricao]
import sql from "mssql";

const idps = Number(process.argv[2] || 210);
const num = Number(process.argv[3] || 14);
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
    console.log(`\n== ${label} == (${r.recordset.length})`);
    console.log(JSON.stringify(r.recordset).slice(0, 3000));
  } catch (e) {
    console.log(`\n== ${label} == ERRO:`, e.message);
  }
}

await q(
  "SPSINSCRICAOAREAOFERTADA colunas",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SPSINSCRICAOAREAOFERTADA' ORDER BY COLUMN_NAME",
);
await q(
  `SPSINSCRICAOAREAOFERTADA inscr ${num}`,
  `SELECT * FROM SPSINSCRICAOAREAOFERTADA WHERE IDPS=${idps} AND NUMEROINSCRICAO=${num}`,
);
// STATUSLAN distribuição das taxas do PS via SPSINSCRICAOAREAOFERTADA
await q(
  `STATUSLAN distrib via AREAOFERTADA (idps=${idps})`,
  `SELECT l.STATUSLAN, COUNT(*) QTD, SUM(CASE WHEN l.DATABAIXA IS NOT NULL THEN 1 ELSE 0 END) COM_BAIXA
     FROM SPSINSCRICAOAREAOFERTADA a
     JOIN FLAN l ON l.CODCOLIGADA=a.CODCOLIGADA AND l.IDLAN=a.IDLAN
    WHERE a.IDPS=${idps} AND a.IDLAN IS NOT NULL
    GROUP BY l.STATUSLAN`,
);
await q(
  `Amostra PAGAS via AREAOFERTADA (idps=${idps})`,
  `SELECT TOP 5 a.NUMEROINSCRICAO, l.IDLAN, l.STATUSLAN, l.VALORORIGINAL, l.VALORBAIXADO, CONVERT(varchar,l.DATABAIXA,120) DATABAIXA, CONVERT(varchar,l.DATAVENCIMENTO,23) VENC, l.IDBOLETO
     FROM SPSINSCRICAOAREAOFERTADA a
     JOIN FLAN l ON l.CODCOLIGADA=a.CODCOLIGADA AND l.IDLAN=a.IDLAN
    WHERE a.IDPS=${idps} AND l.DATABAIXA IS NOT NULL
    ORDER BY l.DATABAIXA DESC`,
);

await pool.close();
process.exit(0);
