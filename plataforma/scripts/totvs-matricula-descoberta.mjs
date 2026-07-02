// FASE 0 (matrícula) — DESCOBERTA read-only da modelagem de aprovação/elegibilidade e
// dos parâmetros de matrícula no CorporeRM. SOMENTE LEITURA.
// Uso (produção, inline):
//   TOTVS_DB_SERVER=35.199.126.125 TOTVS_DB_NAME=CorporeRM TOTVS_DB_USER=rm \
//   TOTVS_DB_PASSWORD=rm node --env-file=.env.local scripts/totvs-matricula-descoberta.mjs
// Filtra o ciclo pelo NOME do PS (ANO), default 2027 (override: 1º argv).
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

// 0) PSs do ciclo (pelo NOME)
linha("PROCESSOS SELETIVOS DO CICLO");
const psCiclo = await q(
  `SELECT IDPS, NOME, STATUS FROM SPSPROCESSOSELETIVO WHERE NOME LIKE @ano ORDER BY IDPS`,
  { ano: `%${ANO}%` },
);
console.table(psCiclo);
const idpsList = psCiclo.map((p) => p.IDPS);

// 1) Tabelas com MATRICULA no nome
linha("TABELAS COM 'MATRICULA' NO NOME");
console.table(
  await q(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE '%MATRICULA%' ORDER BY TABLE_NAME`,
  ),
);

// 2) Colunas de SPSAREAOFERTADA (achar DISPONIBILIZAMATRICULAPORTAL / datas / contrato / plano)
linha("COLUNAS SPSAREAOFERTADA (filtro matrícula/contrato/plano/data)");
console.table(
  await q(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
     FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SPSAREAOFERTADA'
       AND (COLUMN_NAME LIKE '%MATRIC%' OR COLUMN_NAME LIKE '%CONTRAT%'
            OR COLUMN_NAME LIKE '%PLANO%' OR COLUMN_NAME LIKE '%DISPONIBILIZA%'
            OR COLUMN_NAME LIKE '%DOCUMENT%' OR COLUMN_NAME LIKE '%DT%')
     ORDER BY COLUMN_NAME`,
  ),
);

// 3) Colunas de SPSOPCAOINSCRITO (achar STATUS / resultado / chamada)
linha("COLUNAS SPSOPCAOINSCRITO");
console.table(
  await q(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
     FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SPSOPCAOINSCRITO' ORDER BY ORDINAL_POSITION`,
  ),
);

// 4) Distribuição de STATUS em SPSOPCAOINSCRITO para o ciclo
if (idpsList.length) {
  linha("DISTRIBUIÇÃO DE STATUS (SPSOPCAOINSCRITO) NO CICLO");
  console.table(
    await q(
      `SELECT o.STATUS, COUNT(*) N
       FROM SPSOPCAOINSCRITO o
       WHERE o.IDPS IN (${idpsList.join(",")})
       GROUP BY o.STATUS ORDER BY N DESC`,
    ),
  );

  // 5) Chave real de SPSAREAOFERTADA + mapa área ofertada <-> área interesse
  linha("COLUNAS SPSAREAOFERTADA (todas)");
  const colsAO = await q(
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME='SPSAREAOFERTADA' ORDER BY ORDINAL_POSITION`,
  );
  console.table(colsAO);
  const setAO = new Set(colsAO.map((c) => c.COLUMN_NAME));
  const chaveAO = [
    "IDAREAOFERTADA",
    "IDOFERTA",
    "IDAREAOFERTA",
    "CODAREAOFERTADA",
  ].find((c) => setAO.has(c));
  const flagsAO = colsAO
    .map((c) => c.COLUMN_NAME)
    .filter((n) => /MATRIC|CONTRAT|DISPONIBILIZA/.test(n));

  linha("SPSAREAOFERTADA DO CICLO (flags de matrícula/itinerário)");
  const selCols = [
    "ao.IDPS",
    chaveAO ? `ao.${chaveAO}` : null,
    setAO.has("IDAREAINTERESSE") ? "ao.IDAREAINTERESSE" : null,
    setAO.has("STATUS") ? "ao.STATUS" : null,
    setAO.has("MINIMOITINERARIOS") ? "ao.MINIMOITINERARIOS" : null,
    setAO.has("MAXIMOITINERARIOS") ? "ao.MAXIMOITINERARIOS" : null,
    ...flagsAO.map((f) => `ao.${f}`),
  ].filter(Boolean);
  console.table(
    await q(
      `SELECT ${selCols.join(", ")}
       FROM SPSAREAOFERTADA ao
       WHERE ao.IDPS IN (${idpsList.join(",")}) ORDER BY ao.IDPS`,
    ),
  );

  linha("NOME DAS ÁREAS DE INTERESSE DO CICLO");
  console.table(
    await q(
      `SELECT DISTINCT ao.IDPS, ao.IDAREAINTERESSE, ai.NOME
       FROM SPSAREAOFERTADA ao
       LEFT JOIN SPSAREAINTERESSE ai ON ai.IDAREAINTERESSE=ao.IDAREAINTERESSE
       WHERE ao.IDPS IN (${idpsList.join(",")}) ORDER BY ao.IDPS`,
    ),
  );
}

// 7) Tabela(s) de parâmetros de matrícula / planos de pagamento (nomes prováveis)
linha("TABELAS DE PARÂMETRO/PLANO (SPS/G) COM MATRIC/PLANO/CONTRATO/PERIODO");
console.table(
  await q(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE'
       AND (TABLE_NAME LIKE '%PLANOPGTO%' OR TABLE_NAME LIKE '%PLANOPAG%'
            OR TABLE_NAME LIKE '%CONTRATO%' OR TABLE_NAME LIKE 'SPSPARAM%'
            OR TABLE_NAME LIKE '%PERIODOMATRIC%')
     ORDER BY TABLE_NAME`,
  ),
);

// 8) Colunas de SPSPARAMETROPS relacionadas a matrícula/contrato
linha("SPSPARAMETROPS — COLUNAS MATRÍCULA/CONTRATO/DOC");
console.table(
  await q(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
     FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SPSPARAMETROPS'
       AND (COLUMN_NAME LIKE '%MATRIC%' OR COLUMN_NAME LIKE '%CONTRAT%'
            OR COLUMN_NAME LIKE '%DOC%' OR COLUMN_NAME LIKE '%TOKEN%'
            OR COLUMN_NAME LIKE '%ITINER%' OR COLUMN_NAME LIKE '%FICHA%')
     ORDER BY COLUMN_NAME`,
  ),
);

await pool.close();
console.log("\n>>> FIM da descoberta.");
