// Lista os Processos Seletivos cadastrados no CorporeRM (SPSPROCESSOSELETIVO),
// para descobrir os IDPS reais (hoje placeholders ps:0 em lib/processos.ts).
//
// Uso: node --env-file=.env.local scripts/totvs-ps-list.mjs

import sql from "mssql";

const config = {
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
};

const pool = await new sql.ConnectionPool(config).connect();
const r = await pool.request().query(`
  SELECT TOP 30 CODCOLIGADA, CODFILIAL, IDPS, NOME, STATUS, EXIBENOPORTAL,
         USANOVOPORTAL, VALORINSCRICAO,
         CONVERT(varchar(10), DTINIINSCRICAO, 103) AS INI,
         CONVERT(varchar(10), DTFIMINSCRICAO, 103) AS FIM
  FROM SPSPROCESSOSELETIVO
  ORDER BY DTINIINSCRICAO DESC, IDPS DESC
`);
console.table(
  r.recordset.map((x) => ({
    COL: x.CODCOLIGADA,
    FIL: x.CODFILIAL,
    IDPS: x.IDPS,
    NOME: (x.NOME || "").slice(0, 45),
    STATUS: x.STATUS,
    PORTAL: x.EXIBENOPORTAL,
    NOVO: x.USANOVOPORTAL,
    VALOR: x.VALORINSCRICAO,
    INI: x.INI,
    FIM: x.FIM,
  })),
);
await pool.close();
