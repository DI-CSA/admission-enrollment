// DEBUG SQL — mapeia o modelo financeiro da taxa de inscrição (FLAN/FBOLETO/baixa)
// e um exemplo de taxa PAGA, para descobrir os campos autoritativos de pagamento.
// Uso: node --env-file=.env.local scripts/debug-fin-schema.mjs
import sql from "mssql";

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
  "IDBOLETO em tabelas SPS/FLAN/FBOLETO",
  "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='IDBOLETO' AND (TABLE_NAME LIKE 'SPS%' OR TABLE_NAME LIKE 'FLAN%' OR TABLE_NAME='FBOLETO') ORDER BY TABLE_NAME",
);
await q(
  "FLAN campos baixa/status/valor/data",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='FLAN' AND (COLUMN_NAME LIKE '%BAIX%' OR COLUMN_NAME LIKE '%STATUS%' OR COLUMN_NAME LIKE '%PAG%' OR COLUMN_NAME LIKE '%VALOR%' OR COLUMN_NAME LIKE '%DATA%' OR COLUMN_NAME LIKE '%QUITA%') ORDER BY COLUMN_NAME",
);
await q(
  "FBOLETO colunas",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='FBOLETO' ORDER BY COLUMN_NAME",
);
await q(
  "FLANBOLETO colunas",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='FLANBOLETO' ORDER BY COLUMN_NAME",
);
await q(
  "FLANBOLETOBAIXA colunas",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='FLANBOLETOBAIXA' ORDER BY COLUMN_NAME",
);
await q(
  "SPS tabelas com CODUSUARIO/inscricao ligadas a boleto",
  "SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME LIKE 'SPS%' AND COLUMN_NAME IN ('IDBOLETO','IDLAN','NUMEROINSCRICAO') ORDER BY TABLE_NAME",
);

await pool.close();
process.exit(0);
