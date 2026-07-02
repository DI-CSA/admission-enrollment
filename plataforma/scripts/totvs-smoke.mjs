// Smoke test das queries de leitura (replica o SQL de lib/totvs/queries.ts).
// Uso: node --env-file=.env.local scripts/totvs-smoke.mjs

import sql from "mssql";

const COL = Number(process.env.RM_COD_COLIGADA) || 1;
const IDPS = 210; // CSA Leblon 2027 - 1º Ano Fundamental

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

// 1) Processos abertos hoje
const ps = await pool
  .request()
  .input("col", COL)
  .query(
    `SELECT IDPS, NOME, VALORINSCRICAO, EXIBENOPORTAL,
          CONVERT(varchar(10), DTFIMINSCRICAO, 103) FIM
   FROM SPSPROCESSOSELETIVO
   WHERE CODCOLIGADA=@col AND STATUS='T' AND GETDATE() BETWEEN DTINIINSCRICAO AND DTFIMINSCRICAO
   ORDER BY DTINIINSCRICAO DESC`,
  );
console.log(`\n1) Processos ABERTOS hoje: ${ps.recordset.length}`);
ps.recordset
  .slice(0, 8)
  .forEach((r) =>
    console.log(
      `   IDPS ${r.IDPS} | portal=${r.EXIBENOPORTAL} | R$${r.VALORINSCRICAO} | até ${r.FIM} | ${r.NOME}`,
    ),
  );

// 2) Áreas ofertadas do IDPS 210
const ao = await pool
  .request()
  .input("col", COL)
  .input("idps", IDPS)
  .query(
    `SELECT ao.IDAREAINTERESSE, ai.NOME, ai.GRUPO, ao.NUMEROVAGAS, ao.VALORINSCRICAO,
          CONVERT(varchar(10), ao.DTNASCIMENTOMINIMA, 103) MIN, CONVERT(varchar(10), ao.DTNASCIMENTOMAXIMA, 103) MAX
   FROM SPSAREAOFERTADA ao JOIN SPSAREAINTERESSE ai ON ai.IDAREAINTERESSE=ao.IDAREAINTERESSE
   WHERE ao.CODCOLIGADA=@col AND ao.IDPS=@idps AND ao.STATUS='T' ORDER BY ai.NOME`,
  );
console.log(`\n2) Áreas ofertadas do IDPS ${IDPS}: ${ao.recordset.length}`);
ao.recordset.forEach((r) =>
  console.log(
    `   #${r.IDAREAINTERESSE} | ${r.NOME} | grupo=${r.GRUPO ?? "-"} | vagas=${r.NUMEROVAGAS} | R$${r.VALORINSCRICAO} | nasc ${r.MIN ?? "-"}..${r.MAX ?? "-"}`,
  ),
);

// 3) Lookup pessoa por CPF inexistente (valida o SQL, sem PII)
const pp = await pool
  .request()
  .input("cpf", "00000000000")
  .query(
    `SELECT TOP 1 CODIGO FROM PPESSOA
   WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF,''),'.',''),'-',''),' ','')=@cpf`,
  );
console.log(
  `\n3) buscarPessoaPorCpf('000...'): ${pp.recordset.length ? "ACHOU (inesperado)" : "null (ok)"}`,
);

// 4) existeCandidatoPorCpf inexistente
const su = await pool
  .request()
  .input("cpf", "00000000000")
  .query(
    `SELECT TOP 1 1 N FROM SPSUSUARIO
   WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF,''),'.',''),'-',''),' ','')=@cpf`,
  );
console.log(`4) existeCandidatoPorCpf('000...'): ${su.recordset.length > 0}`);

// 5) reconhecerResponsavelPorCpf — valida o SQL e a contagem de contas com senha
const rc = await pool
  .request()
  .input("cpf", "00000000000")
  .query(
    `SELECT TOP 1 NOME, EMAIL, DTNASCIMENTO,
          CASE WHEN NULLIF(LTRIM(RTRIM(SENHA)),'') IS NOT NULL THEN 1 ELSE 0 END TEMSENHA
   FROM SPSUSUARIO
   WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF,''),'.',''),'-',''),' ','')=@cpf
   ORDER BY CODUSUARIOPS DESC`,
  );
console.log(
  `5) reconhecerResponsavelPorCpf('000...'): ${rc.recordset.length ? "existe (inesperado)" : "não reconhecido (ok)"}`,
);
const tot = await pool
  .request()
  .query(
    `SELECT COUNT(*) TOTAL, SUM(CASE WHEN NULLIF(LTRIM(RTRIM(SENHA)),'') IS NOT NULL THEN 1 ELSE 0 END) COMSENHA FROM SPSUSUARIO`,
  );
console.log(
  `   SPSUSUARIO: ${tot.recordset[0].TOTAL} contas (${tot.recordset[0].COMSENHA} com senha própria)`,
);

await pool.close();
console.log("\n✓ Smoke OK");
