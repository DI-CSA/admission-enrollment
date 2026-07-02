// Probe v2 — roda a QUERY DE PRODUÇÃO de listarDependentesDoResponsavel para os
// responsáveis dos cadastros recentes e detecta vazamento entre contas.
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

const PROD_QUERY = `
WITH resp AS (
  SELECT s.CODPESSOA,
         REPLACE(REPLACE(REPLACE(ISNULL(s.CPF, ''), '.', ''), '-', ''), ' ', '') AS CPFNUM
  FROM SPSUSUARIO s
  WHERE s.CODUSUARIOPS = @resp
),
contas AS (
  SELECT su.CODUSUARIOPS
  FROM SPSUSUARIO su
  CROSS JOIN resp
  WHERE su.CODUSUARIOPS = @resp
     OR (resp.CODPESSOA IS NOT NULL AND su.CODPESSOA = resp.CODPESSOA)
     OR (resp.CPFNUM <> '' AND REPLACE(REPLACE(REPLACE(ISNULL(su.CPF, ''), '.', ''), '-', ''), ' ', '') = resp.CPFNUM)
)
SELECT u.CODUSUARIOPS, u.NOME, i.NUMEROINSCRICAO
  FROM SPSUSUARIOTIPORELAC r
  JOIN contas c ON c.CODUSUARIOPS = r.CODUSUARIOTIPORELAC
  JOIN SPSUSUARIO u ON u.CODUSUARIOPS = r.CODUSUARIOPS
  JOIN SPSINSCRICAOAREAOFERTADA i
       ON i.CODUSUARIOPS = r.CODUSUARIOPS AND i.IDPS = @idps
 WHERE r.CODUSUARIOPS <> r.CODUSUARIOTIPORELAC
 GROUP BY u.CODUSUARIOPS, u.NOME, i.NUMEROINSCRICAO
 ORDER BY i.NUMEROINSCRICAO`;

async function main() {
  const pool = await new sql.ConnectionPool(config).connect();
  const q = (text) =>
    pool
      .request()
      .query(text)
      .then((r) => r.recordset);

  // PS abertos 2027 (para iterar idps reais).
  const ps = await q(
    `SELECT IDPS, NOME FROM SPSPROCESSOSELETIVO WHERE NOME LIKE '%2027%'`,
  );
  console.log("PS 2027:", ps.map((p) => p.IDPS).join(","));

  // Responsáveis: todas as contas que aparecem como CODUSUARIOTIPORELAC (lado resp).
  const resps = await q(`
    SELECT DISTINCT r.CODUSUARIOTIPORELAC AS resp
    FROM SPSUSUARIOTIPORELAC r
    WHERE r.CODUSUARIOPS <> r.CODUSUARIOTIPORELAC`);
  console.log("Total responsáveis com vínculo:", resps.length);

  // Para cada resp x cada idps, roda a query de produção; registra quem retorna
  // candidatos. Detecta vazamento: um candidato que aparece para >1 resp distinto.
  const candidatoParaResps = new Map(); // candCod -> Set(resp)
  let maxLista = { resp: null, idps: null, n: 0, nomes: [] };

  for (const { resp } of resps) {
    for (const { IDPS } of ps) {
      const req = pool.request();
      req.input("resp", sql.Int, resp);
      req.input("idps", sql.Int, IDPS);
      const rows = (await req.query(PROD_QUERY)).recordset;
      if (rows.length > maxLista.n) {
        maxLista = {
          resp,
          idps: IDPS,
          n: rows.length,
          nomes: rows.map(
            (r) => `${r.CODUSUARIOPS}:${r.NOME}#${r.NUMEROINSCRICAO}`,
          ),
        };
      }
      for (const r of rows) {
        if (!candidatoParaResps.has(r.CODUSUARIOPS))
          candidatoParaResps.set(r.CODUSUARIOPS, new Set());
        candidatoParaResps.get(r.CODUSUARIOPS).add(resp);
      }
    }
  }

  console.log("\n=== Maior lista retornada por um único responsável ===");
  console.log(maxLista);

  console.log(
    "\n=== VAZAMENTO: candidatos visíveis por >1 responsável distinto ===",
  );
  let leaks = 0;
  for (const [cand, set] of candidatoParaResps) {
    if (set.size > 1) {
      leaks++;
      if (leaks <= 20)
        console.log(
          `candidato ${cand} aparece para resps: ${[...set].join(", ")}`,
        );
    }
  }
  console.log(`Total candidatos vazados (>1 resp): ${leaks}`);

  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
