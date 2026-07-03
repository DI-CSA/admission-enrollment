// DEBUG: inspeciona o blob SPSARQUIVOSCANDIDATO.ARQUIVO — tamanho real, tipo da
// coluna e primeiros bytes — para diagnosticar download de documentos com 14 bytes.
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/debug-arquivo-blob.mjs <codColigada> <idps> <numeroInscricao>
// Ex.: node --env-file=.env.local scripts/debug-arquivo-blob.mjs 1 210 14

import sql from "mssql";

const [, , colArg, idpsArg, numArg] = process.argv;
const codColigada = Number(colArg);
const idps = Number(idpsArg);
const numeroInscricao = Number(numArg);

const config = {
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
};

const pool = await new sql.ConnectionPool(config).connect();

console.log("\n== COLUNAS de SPSARQUIVOSCANDIDATO ==");
const cols = (
  await pool.request().query(`
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_NAME = 'SPSARQUIVOSCANDIDATO'
 ORDER BY ORDINAL_POSITION`)
).recordset;
for (const c of cols)
  console.log(
    ` - ${c.COLUMN_NAME} : ${c.DATA_TYPE}(${c.CHARACTER_MAXIMUM_LENGTH ?? ""})`,
  );

console.log("\n== ARQUIVOS da inscrição (tamanho real do blob) ==");
const linhas = (
  await pool
    .request()
    .input("cod", codColigada)
    .input("idps", idps)
    .input("num", numeroInscricao).query(`
SELECT NOMEARQUIVO,
       DATALENGTH(ARQUIVO) AS TAM_BYTES,
       CONVERT(VARCHAR(64), CONVERT(VARBINARY(32), ARQUIVO)) AS PRIMEIROS_HEX,
       CAST(SUBSTRING(ARQUIVO, 1, 32) AS VARCHAR(64)) AS PRIMEIROS_TXT
  FROM SPSARQUIVOSCANDIDATO
 WHERE CODCOLIGADA = @cod AND IDPS = @idps AND NUMEROINSCRICAO = @num`)
).recordset;

for (const l of linhas) {
  console.log(
    JSON.stringify({
      nomeArquivo: l.NOMEARQUIVO,
      tamanhoBytes: l.TAM_BYTES,
      primeirosHex: l.PRIMEIROS_HEX,
      primeirosTxt: l.PRIMEIROS_TXT,
    }),
  );
}

if (linhas.length === 0) console.log("(nenhum arquivo para essa inscrição)");

await pool.close();
console.log("\n>>> Concluído.");
process.exit(0);
