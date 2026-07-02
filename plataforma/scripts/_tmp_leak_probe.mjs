// Probe temporário — investiga o vazamento de candidatos entre responsáveis.
// Uso: node --env-file=.env.local scripts/_tmp_leak_probe.mjs
import sql from "mssql";

const config = {
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true, useUTC: true },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};

async function main() {
  const pool = await new sql.ConnectionPool(config).connect();
  const q = (text) =>
    pool
      .request()
      .query(text)
      .then((r) => r.recordset);

  // 1) Distribuição de CODPESSOA em SPSUSUARIO: quantos NULL, 0, negativos, e o
  //    valor mais repetido (sentinela?).
  console.log("=== 1) CODPESSOA distribution em SPSUSUARIO ===");
  console.log(
    await q(`
      SELECT
        SUM(CASE WHEN CODPESSOA IS NULL THEN 1 ELSE 0 END) AS nulos,
        SUM(CASE WHEN CODPESSOA = 0 THEN 1 ELSE 0 END) AS zeros,
        SUM(CASE WHEN CODPESSOA < 0 THEN 1 ELSE 0 END) AS negativos,
        COUNT(*) AS total
      FROM SPSUSUARIO`),
  );

  console.log("=== 1b) Top CODPESSOA mais repetidos (>1) ===");
  console.log(
    await q(`
      SELECT TOP 10 CODPESSOA, COUNT(*) AS n
      FROM SPSUSUARIO
      GROUP BY CODPESSOA
      HAVING COUNT(*) > 1
      ORDER BY n DESC`),
  );

  // 2) Responsáveis recém-criados (CODUSUARIOPS altos) e seu CODPESSOA + CPF.
  console.log("=== 2) Últimos 15 SPSUSUARIO (CODUSUARIOPS desc) ===");
  console.log(
    await q(`
      SELECT TOP 15 CODUSUARIOPS, NOME, CODPESSOA,
             REPLACE(REPLACE(REPLACE(ISNULL(CPF,''),'.',''),'-',''),' ','') AS CPFNUM,
             CASE WHEN NULLIF(LTRIM(RTRIM(SENHA)),'') IS NOT NULL THEN 1 ELSE 0 END AS TEMSENHA
      FROM SPSUSUARIO
      ORDER BY CODUSUARIOPS DESC`),
  );

  // 3) Para cada responsável presente em SPSUSUARIOTIPORELAC (lado resp =
  //    CODUSUARIOTIPORELAC), simula a CTE `contas` e conta quantas contas casam.
  //    Foco: responsáveis cujo CODPESSOA é NULL/0 (novos) — a explosão denuncia o bug.
  console.log("=== 3) Simulação da CTE contas por responsável (amostra) ===");
  console.log(
    await q(`
      WITH resps AS (
        SELECT DISTINCT r.CODUSUARIOTIPORELAC AS resp
        FROM SPSUSUARIOTIPORELAC r
        WHERE r.CODUSUARIOPS <> r.CODUSUARIOTIPORELAC
      )
      SELECT TOP 20
        x.resp,
        s.CODPESSOA AS resp_codpessoa,
        REPLACE(REPLACE(REPLACE(ISNULL(s.CPF,''),'.',''),'-',''),' ','') AS resp_cpf,
        (
          SELECT COUNT(*) FROM SPSUSUARIO su
          WHERE su.CODUSUARIOPS = x.resp
             OR (s.CODPESSOA IS NOT NULL AND su.CODPESSOA = s.CODPESSOA)
             OR (REPLACE(REPLACE(REPLACE(ISNULL(s.CPF,''),'.',''),'-',''),' ','') <> ''
                 AND REPLACE(REPLACE(REPLACE(ISNULL(su.CPF,''),'.',''),'-',''),' ','')
                     = REPLACE(REPLACE(REPLACE(ISNULL(s.CPF,''),'.',''),'-',''),' ',''))
        ) AS contas_que_casam
      FROM resps x
      JOIN SPSUSUARIO s ON s.CODUSUARIOPS = x.resp
      ORDER BY contas_que_casam DESC`),
  );

  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
