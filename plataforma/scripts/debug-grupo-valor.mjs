// DEBUG SQL — localiza onde o valor do campo complementar GRUPO (GRPCAND) de uma
// inscrição é gravado, para filtrar o documento de ex-aluno.
// Uso: node --env-file=.env.local scripts/debug-grupo-valor.mjs [numeroInscricao]
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
  "Tabelas SPS com NUMEROINSCRICAO + coluna de campo/valor",
  `SELECT c1.TABLE_NAME, STRING_AGG(c2.COLUMN_NAME, ',') AS COLS
     FROM INFORMATION_SCHEMA.COLUMNS c1
     JOIN INFORMATION_SCHEMA.COLUMNS c2 ON c2.TABLE_NAME = c1.TABLE_NAME
    WHERE c1.TABLE_NAME LIKE 'SPS%'
      AND c1.COLUMN_NAME = 'NUMEROINSCRICAO'
      AND (c2.COLUMN_NAME LIKE '%CAMPO%' OR c2.COLUMN_NAME LIKE '%VALOR%' OR c2.COLUMN_NAME LIKE '%CONTEUDO%' OR c2.COLUMN_NAME LIKE '%GRUP%')
    GROUP BY c1.TABLE_NAME`,
);

await q(
  "Definição do campo GRUPO (SPSCAMPOCOMPLFILIAL / SPSPARAMSCAMPOS)",
  "SELECT TOP 40 * FROM SPSCAMPOCOMPLFILIAL WHERE NOMECAMPO LIKE '%GRUPO%' OR NOMECAMPO LIKE '%GRP%' OR TITULO LIKE '%rupo%'",
);

await q(
  "SPSPARAMSCAMPOS colunas",
  "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SPSPARAMSCAMPOS' ORDER BY COLUMN_NAME",
);

await q(
  "Amostra de valores complementares da inscrição alvo (todas as tabelas candidatas serão testadas manualmente depois)",
  `SELECT TOP 5 * FROM SPSCAMPOCOMPLFILIAL`,
);

await pool.close();
process.exit(0);
