// READ-ONLY: mapeia os campos STATUS DA INSCRIÇÃO x RESULTADO do comprovante.
// Uso: node --env-file=.env.local scripts/debug-status-resultado.mjs [cod] [idps] [num]
import sql from "mssql";

const [, , colArg = "1", idpsArg = "210", numArg = "14"] = process.argv;
const cod = Number(colArg);
const idps = Number(idpsArg);
const num = Number(numArg);

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const q = (s, p = {}) => {
  const r = pool.request();
  for (const [k, v] of Object.entries(p)) r.input(k, v);
  return r.query(s).then((x) => x.recordset);
};

console.log("== SPSINSCRICAOAREAOFERTADA (colunas) ==");
console.log(
  (
    await q(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME='SPSINSCRICAOAREAOFERTADA'
          AND (COLUMN_NAME LIKE '%STATUS%' OR COLUMN_NAME LIKE '%SITUACAO%')`,
    )
  )
    .map((c) => c.COLUMN_NAME)
    .join(", "),
);

console.log("\n== SPSINSCRICAOAREAOFERTADA (inscrição) ==");
console.log(
  JSON.stringify(
    await q(
      `SELECT NUMEROINSCRICAO,IDPS,STATUS FROM SPSINSCRICAOAREAOFERTADA
        WHERE CODCOLIGADA=@cod AND IDPS=@idps AND NUMEROINSCRICAO=@num`,
      { cod, idps, num },
    ),
  ),
);

console.log("\n== SPSOPCAOINSCRITO (opção/resultado) ==");
console.log(
  JSON.stringify(
    await q(
      `SELECT NUMEROINSCRICAO,IDPS,IDAREAINTERESSE,STATUS FROM SPSOPCAOINSCRITO
        WHERE CODCOLIGADA=@cod AND IDPS=@idps AND NUMEROINSCRICAO=@num`,
      { cod, idps, num },
    ),
  ),
);

console.log("\n== SPSSTATUSOPCAO (rótulos por filial) ==");
console.log(
  JSON.stringify(
    await q(
      `SELECT CODIGO,CODFILIAL,DESCRICAO FROM SPSSTATUSOPCAO
        WHERE CODCOLIGADA=@cod ORDER BY CODFILIAL,CODIGO`,
      { cod },
    ),
  ),
);

console.log("\n== tabelas SPS com STATUS/SITUACAO no nome ==");
console.log(
  (
    await q(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME LIKE 'SPS%'
          AND (TABLE_NAME LIKE '%STATUS%' OR TABLE_NAME LIKE '%SITUACAO%')`,
    )
  )
    .map((t) => t.TABLE_NAME)
    .join(", "),
);

await pool.close();
console.log("\n>>> Concluído.");
