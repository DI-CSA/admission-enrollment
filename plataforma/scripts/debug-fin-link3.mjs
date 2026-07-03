// DEBUG SQL — descobre a ligação real inscrição/candidato → FLAN/FBOLETO.
// Uso: node --env-file=.env.local scripts/debug-fin-link3.mjs [idps] [numeroInscricao]
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
    console.log(JSON.stringify(r.recordset).slice(0, 2500));
  } catch (e) {
    console.log(`\n== ${label} == ERRO:`, e.message);
  }
}

// Tabelas SPS que têm IDLAN (candidatos a bridge)
await q(
  "SPS* com IDLAN",
  "SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='IDLAN' AND TABLE_NAME LIKE 'SPS%' ORDER BY TABLE_NAME",
);
// Quantas linhas SPSHISTLANINSCRICAO por IDPS (top)
await q(
  "SPSHISTLANINSCRICAO por IDPS (top 10)",
  "SELECT TOP 10 IDPS, COUNT(*) QTD FROM SPSHISTLANINSCRICAO GROUP BY IDPS ORDER BY QTD DESC",
);
// SPSOPCAOINSCRITO colunas que possam referenciar lan/boleto/pessoa
await q(
  "SPSOPCAOINSCRITO cols (lan/boleto/pessoa/usuario)",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SPSOPCAOINSCRITO' AND (COLUMN_NAME LIKE '%LAN%' OR COLUMN_NAME LIKE '%BOLETO%' OR COLUMN_NAME LIKE '%PESSOA%' OR COLUMN_NAME LIKE '%USUARIO%' OR COLUMN_NAME LIKE '%GUID%') ORDER BY COLUMN_NAME",
);
// Dados da inscrição alvo em SPSOPCAOINSCRITO
await q(
  `SPSOPCAOINSCRITO inscr ${num}`,
  `SELECT CODCOLIGADA, IDPS, CODPESSOA, NUMEROINSCRICAO, IDAREAINTERESSE FROM SPSOPCAOINSCRITO WHERE IDPS=${idps} AND NUMEROINSCRICAO=${num}`,
);
// FBOLETO/FLAN pelo CODPESSOA (sacado) do candidato — descobrir taxa
await q(
  `FLAN via SACADO(CODPESSOA) da inscr ${num}`,
  `SELECT TOP 10 l.CODCOLIGADA, l.IDLAN, l.CODPESSOA, l.STATUSLAN, l.VALORORIGINAL, l.VALORBAIXADO, CONVERT(varchar,l.DATABAIXA,120) DATABAIXA, CONVERT(varchar,l.DATAVENCIMENTO,23) VENC, l.IDBOLETO, l.CODTB1FLUXUS
     FROM FLAN l
    WHERE l.CODPESSOA IN (SELECT CODPESSOA FROM SPSOPCAOINSCRITO WHERE IDPS=${idps} AND NUMEROINSCRICAO=${num})`,
);

await pool.close();
process.exit(0);
