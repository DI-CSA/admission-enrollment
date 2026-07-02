// Valida volume de inscrições e o padrão "1 responsável -> vários candidatos no
// mesmo PS" no histórico completo. Uso: node --env-file=.env.local scripts/totvs-multi-probe.mjs
import sql from "mssql";

const p = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const tot = await p
  .request()
  .query(
    "SELECT COUNT(*) N, COUNT(DISTINCT IDPS) PS, COUNT(DISTINCT CODUSUARIOPS) CAND FROM SPSINSCRICAOAREAOFERTADA",
  );
console.log("SPSINSCRICAOAREAOFERTADA total:", tot.recordset[0]);

// Mesmo CANDIDATO duas vezes no mesmo PS? (deve ser raríssimo/zero = regra do TOTVS)
const dup = await p.request().query(
  `SELECT TOP 5 IDPS, CODUSUARIOPS, COUNT(*) N
   FROM SPSINSCRICAOAREAOFERTADA
   GROUP BY IDPS, CODUSUARIOPS HAVING COUNT(*) > 1 ORDER BY N DESC`,
);
console.log(
  "\nMesmo CODUSUARIOPS repetido no mesmo IDPS (esperado ~0):",
  dup.recordset.length,
);
dup.recordset.forEach((r) =>
  console.log(`  IDPS ${r.IDPS} cand ${r.CODUSUARIOPS}: ${r.N}x`),
);

// Responsável com vários candidatos no mesmo PS (via SPSRESPONSAVELCANDIDATO)
const multi = await p.request().query(
  `SELECT TOP 5 i.IDPS, rc.CODPESSOARESPONSAVEL, COUNT(DISTINCT rc.CODPESSOACANDIDATO) QTD
   FROM SPSRESPONSAVELCANDIDATO rc
   JOIN SPSINSCRICAOAREAOFERTADA i ON i.CODPESSOA = rc.CODPESSOACANDIDATO
   GROUP BY i.IDPS, rc.CODPESSOARESPONSAVEL
   HAVING COUNT(DISTINCT rc.CODPESSOACANDIDATO) > 1
   ORDER BY QTD DESC`,
);
console.log(
  "\nResponsável c/ vários candidatos no mesmo PS:",
  multi.recordset.length,
);
multi.recordset.forEach((r) =>
  console.log(
    `  IDPS ${r.IDPS} resp ${r.CODPESSOARESPONSAVEL} -> ${r.QTD} candidatos`,
  ),
);

await p.close();
