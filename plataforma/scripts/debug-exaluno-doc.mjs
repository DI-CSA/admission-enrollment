// DEBUG SQL — descobre (1) o documento de EX-ALUNO na config de documentos exigidos
// e (2) onde fica gravado o GRUPO de candidato (GRP2 = filho de ex-aluno) de uma
// inscrição, para exibir o documento só quando o candidato for do grupo ex-aluno.
// Uso: node --env-file=.env.local scripts/debug-exaluno-doc.mjs [numeroInscricao]
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
  "Documentos com 'aluno/egress/comprov' na descrição",
  "SELECT CODDOCUMENTO, DESCRICAO FROM SDOCUMENTO WHERE DESCRICAO LIKE '%aluno%' OR DESCRICAO LIKE '%egress%' OR DESCRICAO LIKE '%comprov%' ORDER BY DESCRICAO",
);

await q(
  "Documentos exigidos por área (todos) — inscr alvo",
  `SELECT de.IDAREAINTERESSE, de.CODDOCUMENTO, d.DESCRICAO, de.OBRIGATORIO, de.EXIGEINSCRICAO
     FROM SPSDOCUMENTOEXIGIDO de
     LEFT JOIN SDOCUMENTO d ON d.CODDOCUMENTO = de.CODDOCUMENTO
    WHERE de.IDAREAINTERESSE IN (
      SELECT o.IDAREAINTERESSE FROM SPSOPCAOINSCRITO o WHERE o.NUMEROINSCRICAO = ${NUM}
    )
    ORDER BY de.IDAREAINTERESSE, de.CODDOCUMENTO`,
);

await q(
  "Colunas SPS que contenham 'GRUPO'",
  "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME LIKE '%GRUPO%' AND TABLE_NAME LIKE 'SPS%' ORDER BY TABLE_NAME, COLUMN_NAME",
);

await q(
  "Tabelas SPS de campos complementares / candidato",
  "SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'SPS%' AND (TABLE_NAME LIKE '%COMPLEMENT%' OR TABLE_NAME LIKE '%CANDIDATO%' OR TABLE_NAME LIKE '%CAMPO%' OR TABLE_NAME LIKE '%DADOS%') ORDER BY TABLE_NAME",
);

await pool.close();
process.exit(0);
