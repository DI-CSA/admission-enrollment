// DEBUG: descobre o(s) idAreaOfertada da inscrição do candidato, para testar a
// rota de LISTAGEM de arquivos (InscriptionFiles/ApplicantRegistries) do WebAPI.
//
// Uso: node --env-file=.env.local scripts/debug-idarea.mjs <cod> <idps> <numeroInscricao>

import sql from "mssql";

const [, , colArg, idpsArg, numArg] = process.argv;
const cod = Number(colArg);
const idps = Number(idpsArg);
const num = Number(numArg);

const config = {
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
};

const pool = await new sql.ConnectionPool(config).connect();

// Procura colunas com "AREAOFERTADA" em tabelas de inscrição
const tabs = (
  await pool.request().input("num", num).query(`
SELECT TABLE_NAME, COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
 WHERE COLUMN_NAME LIKE '%AREAOFERTADA%'
   AND TABLE_NAME LIKE 'SPS%'
 ORDER BY TABLE_NAME`)
).recordset;
console.log("== Colunas AREAOFERTADA em tabelas SPS ==");
for (const t of tabs) console.log(` - ${t.TABLE_NAME}.${t.COLUMN_NAME}`);

// Tenta a inscrição principal
try {
  const r = (
    await pool.request().input("cod", cod).input("idps", idps).input("num", num)
      .query(`
SELECT TOP 20 * FROM SPSCANDIDATOAREAOFERTADA
 WHERE CODCOLIGADA=@cod AND IDPS=@idps AND NUMEROINSCRICAO=@num`)
  ).recordset;
  console.log("\n== SPSCANDIDATOAREAOFERTADA ==");
  console.log(JSON.stringify(r, null, 2).slice(0, 1500));
} catch (e) {
  console.log("SPSCANDIDATOAREAOFERTADA:", e.message);
}

await pool.close();
console.log("\n>>> Concluído.");
