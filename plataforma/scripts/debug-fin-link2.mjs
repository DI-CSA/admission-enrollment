// DEBUG SQL — ligação inscrição→FLAN via SPSHISTLANINSCRICAO + significado de STATUSLAN.
// Uso: node --env-file=.env.local scripts/debug-fin-link2.mjs [idps]
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
  `STATUSLAN distrib (idps=${idps})`,
  `SELECT l.STATUSLAN, COUNT(*) AS QTD, SUM(CASE WHEN l.DATABAIXA IS NOT NULL THEN 1 ELSE 0 END) AS COM_BAIXA
     FROM SPSHISTLANINSCRICAO h
     JOIN FLAN l ON l.CODCOLIGADA=h.CODCOLIGADALAN AND l.IDLAN=h.IDLAN
    WHERE h.IDPS=${idps}
    GROUP BY l.STATUSLAN`,
);
await q(
  `Amostra PAGAS (idps=${idps})`,
  `SELECT TOP 5 h.NUMEROINSCRICAO, l.IDLAN, l.STATUSLAN, l.VALORORIGINAL, l.VALORBAIXADO, CONVERT(varchar,l.DATABAIXA,120) AS DATABAIXA, CONVERT(varchar,l.DATAPAG,120) AS DATAPAG, CONVERT(varchar,l.DATAVENCIMENTO,23) AS DATAVENCIMENTO, l.IDBOLETO
     FROM SPSHISTLANINSCRICAO h
     JOIN FLAN l ON l.CODCOLIGADA=h.CODCOLIGADALAN AND l.IDLAN=h.IDLAN
    WHERE h.IDPS=${idps} AND l.DATABAIXA IS NOT NULL
    ORDER BY l.DATABAIXA DESC`,
);
await q(
  `Amostra ABERTAS (idps=${idps})`,
  `SELECT TOP 3 h.NUMEROINSCRICAO, l.IDLAN, l.STATUSLAN, l.VALORORIGINAL, l.VALORBAIXADO, CONVERT(varchar,l.DATAVENCIMENTO,23) AS DATAVENCIMENTO, l.IDBOLETO
     FROM SPSHISTLANINSCRICAO h
     JOIN FLAN l ON l.CODCOLIGADA=h.CODCOLIGADALAN AND l.IDLAN=h.IDLAN
    WHERE h.IDPS=${idps} AND l.DATABAIXA IS NULL
    ORDER BY h.NUMEROINSCRICAO DESC`,
);
// Digo (inscrição 14)
await q(
  `Digo inscrição 14 (idps=${idps})`,
  `SELECT h.NUMEROINSCRICAO, l.IDLAN, l.STATUSLAN, l.VALORORIGINAL, l.VALORBAIXADO, CONVERT(varchar,l.DATABAIXA,120) AS DATABAIXA, CONVERT(varchar,l.DATAVENCIMENTO,23) AS DATAVENCIMENTO, l.IDBOLETO
     FROM SPSHISTLANINSCRICAO h
     JOIN FLAN l ON l.CODCOLIGADA=h.CODCOLIGADALAN AND l.IDLAN=h.IDLAN
    WHERE h.IDPS=${idps} AND h.NUMEROINSCRICAO=14`,
);

await pool.close();
process.exit(0);
