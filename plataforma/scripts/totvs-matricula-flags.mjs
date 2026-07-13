// DESCOBERTA read-only da MATRIZ DE FLAGS de matrícula (o que dirige os passos do
// wizard). Lê as colunas/valores de SPSPARAMETROSAREAOFERTADA, SPSPARAMETROPS,
// planos (SPLANOPGTO) e contrato (SCONTRATO/FCONTRATOMODELO) para o ciclo do ano.
// SOMENTE LEITURA. Uso: node --env-file=.env.local scripts/totvs-matricula-flags.mjs [ANO]
import sql from "mssql";

const ANO = String(process.argv[2] || "2027");

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  requestTimeout: 120000,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const q = (query, inputs = {}) => {
  const req = pool.request();
  for (const [k, v] of Object.entries(inputs)) req.input(k, v);
  return req.query(query).then((r) => r.recordset);
};
const linha = (t) => console.log(`\n===== ${t} =====`);

console.log(
  `>>> DB=${process.env.TOTVS_DB_NAME} SERVER=${process.env.TOTVS_DB_SERVER} ANO~='%${ANO}%'`,
);

// PS do ciclo + áreas
const ps = await q(
  `SELECT IDPS, NOME FROM SPSPROCESSOSELETIVO WHERE NOME LIKE @ano ORDER BY IDPS`,
  { ano: `%${ANO}%` },
);
const idpsList = ps.map((p) => p.IDPS);
console.table(ps);
if (idpsList.length === 0) {
  console.log("(sem PS no ciclo)");
  process.exit(0);
}
const inClause = idpsList.join(",");

// Existe a tabela SPSPARAMETROSAREAOFERTADA?
linha("TABELAS 'PARAMETRO' RELEVANTES");
console.table(
  await q(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE'
       AND (TABLE_NAME LIKE 'SPSPARAMETR%' OR TABLE_NAME LIKE '%AREAOFERTADA%'
            OR TABLE_NAME LIKE 'SPLANOPGTO%' OR TABLE_NAME LIKE 'SCONTRATO%'
            OR TABLE_NAME LIKE 'FCONTRATOMODELO%' OR TABLE_NAME LIKE 'SASSINATURACONTRATO%')
     ORDER BY TABLE_NAME`,
  ),
);

// Colunas de config que dirigem os passos (nomes prováveis)
async function colsDe(tabela, filtro) {
  const existe = await q(
    `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME=@t`,
    { t: tabela },
  );
  if (!existe.length) {
    console.log(`(tabela ${tabela} não existe)`);
    return [];
  }
  const cols = await q(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
     FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@t ${filtro ? "AND (" + filtro + ")" : ""}
     ORDER BY COLUMN_NAME`,
    { t: tabela },
  );
  return cols;
}

linha("COLUNAS SPSPARAMETROSAREAOFERTADA (flags matrícula)");
const filtroFlags = `COLUMN_NAME LIKE '%CONTRAT%' OR COLUMN_NAME LIKE '%TOKEN%' OR COLUMN_NAME LIKE '%DOCUMENT%'
   OR COLUMN_NAME LIKE '%ITINERAR%' OR COLUMN_NAME LIKE '%FICHA%' OR COLUMN_NAME LIKE '%ATUALIZA%'
   OR COLUMN_NAME LIKE '%OBRIGA%' OR COLUMN_NAME LIKE '%FILIA%' OR COLUMN_NAME LIKE '%RESPONSAV%'
   OR COLUMN_NAME LIKE '%DEBITO%' OR COLUMN_NAME LIKE '%PLANO%' OR COLUMN_NAME LIKE '%RELATORIO%'
   OR COLUMN_NAME LIKE '%TIPOCURSO%' OR COLUMN_NAME LIKE '%INSTRUCO%' OR COLUMN_NAME LIKE '%TERMO%'
   OR COLUMN_NAME LIKE '%IMAGEMVOZ%' OR COLUMN_NAME LIKE '%COLIGADA%'`;
const colsParam = await colsDe("SPSPARAMETROSAREAOFERTADA", filtroFlags);
console.table(colsParam);

if (colsParam.length) {
  linha("VALORES SPSPARAMETROSAREAOFERTADA p/ o ciclo");
  const nomes = colsParam.map((c) => c.COLUMN_NAME);
  const sel = ["CODCOLIGADA", "IDPS", "IDAREAINTERESSE", ...nomes]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((c) => `[${c}]`)
    .join(", ");
  try {
    console.table(
      await q(
        `SELECT ${sel} FROM SPSPARAMETROSAREAOFERTADA WHERE IDPS IN (${inClause}) ORDER BY IDPS, IDAREAINTERESSE`,
      ),
    );
  } catch (e) {
    console.log("erro ao ler valores:", e.message);
  }
}

linha("COLUNAS SPSPARAMETROPS (ficha médica / textos / matrícula)");
console.table(
  await colsDe(
    "SPSPARAMETROPS",
    `COLUMN_NAME LIKE '%MATRIC%' OR COLUMN_NAME LIKE '%FICHA%' OR COLUMN_NAME LIKE '%TERMO%'
     OR COLUMN_NAME LIKE '%IMAGEMVOZ%' OR COLUMN_NAME LIKE '%INSTRUCO%' OR COLUMN_NAME LIKE '%CONFIRMA%'
     OR COLUMN_NAME LIKE '%TOKEN%'`,
  ),
);

linha("VALORES SPSPARAMETROPS p/ o ciclo (flags)");
try {
  console.table(
    await q(
      `SELECT IDPS, UTILIZAFICHAMEDICA, USAHTMLTXTINSTRUCOESMATRICULA,
              CAST(LEFT(CAST(TEXTOINSTRUCOESMATRICULA AS varchar(4000)),80) AS varchar(80)) AS INSTRUCOES80,
              CAST(TEXTOCONFIRMACAOMATRICCENTRAL AS varchar(120)) AS CONFIRMA120
       FROM SPSPARAMETROPS WHERE IDPS IN (${inClause}) ORDER BY IDPS`,
    ),
  );
} catch (e) {
  console.log("erro (colunas podem variar):", e.message);
}

linha("PLANOS DE PAGAMENTO configurados (SPLANOPGTO) — amostra");
try {
  console.table(
    await q(
      `SELECT TOP 20 CODCOLIGADA, CODPLANOPGTO, DESCRICAO FROM SPLANOPGTO ORDER BY CODCOLIGADA, CODPLANOPGTO`,
    ),
  );
} catch (e) {
  console.log("erro:", e.message);
}

await pool.close();
console.log("\n>>> fim");
