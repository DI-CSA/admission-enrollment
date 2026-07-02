// ANÁLISE do vínculo responsável↔candidato em dados REAIS do PS 147 (produção).
// Somente LEITURA. Roda contra o banco apontado pelas env TOTVS_DB_*.
// Uso (produção, inline):
//   TOTVS_DB_SERVER=35.199.126.125 TOTVS_DB_NAME=CorporeRM TOTVS_DB_USER=rm \
//   TOTVS_DB_PASSWORD=rm node --env-file=.env.local scripts/totvs-ps147-analise.mjs 147
import sql from "mssql";

const IDPS = Number(process.argv[2] || 147);
const TIPO = {
  1: "Pai",
  2: "Mae",
  3: "RespFinanceiro",
  4: "RespAcademico",
  5: "RespInscricao",
};

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

console.log(
  `>>> DB=${process.env.TOTVS_DB_NAME} SERVER=${process.env.TOTVS_DB_SERVER} IDPS=${IDPS}`,
);

const ps = await q(
  `SELECT IDPS, NOME, STATUS FROM SPSPROCESSOSELETIVO WHERE IDPS=@idps`,
  { idps: IDPS },
);
console.table(ps);

// 1) Quantos candidatos (inscrições) no PS
const insc = await q(
  `SELECT COUNT(DISTINCT CODUSUARIOPS) NCAND, COUNT(*) NINSC
   FROM SPSINSCRICAOAREAOFERTADA WHERE IDPS=@idps`,
  { idps: IDPS },
);
console.log(
  `\nInscrições PS ${IDPS}: candidatos distintos=${insc[0].NCAND}, linhas=${insc[0].NINSC}`,
);

// 2) Distribuição de TIPORELAC: vínculos onde o CANDIDATO do PS é o CODUSUARIOPS
const distA = await q(
  `SELECT r.TIPORELAC, COUNT(*) N
   FROM SPSINSCRICAOAREAOFERTADA i
   JOIN SPSUSUARIOTIPORELAC r ON r.CODUSUARIOPS = i.CODUSUARIOPS
   WHERE i.IDPS=@idps
   GROUP BY r.TIPORELAC ORDER BY N DESC`,
  { idps: IDPS },
);
console.log(
  `\n=== TIPORELAC quando candidato = CODUSUARIOPS (lado esquerdo) ===`,
);
console.table(
  distA.map((d) => ({
    TIPORELAC: d.TIPORELAC,
    LABEL: TIPO[d.TIPORELAC] || "?",
    N: d.N,
  })),
);

// 2b) Distribuição quando o CANDIDATO é o CODUSUARIOTIPORELAC (lado direito)
const distB = await q(
  `SELECT r.TIPORELAC, COUNT(*) N
   FROM SPSINSCRICAOAREAOFERTADA i
   JOIN SPSUSUARIOTIPORELAC r ON r.CODUSUARIOTIPORELAC = i.CODUSUARIOPS
   WHERE i.IDPS=@idps
   GROUP BY r.TIPORELAC ORDER BY N DESC`,
  { idps: IDPS },
);
console.log(
  `\n=== TIPORELAC quando candidato = CODUSUARIOTIPORELAC (lado direito) ===`,
);
console.table(
  distB.map((d) => ({
    TIPORELAC: d.TIPORELAC,
    LABEL: TIPO[d.TIPORELAC] || "?",
    N: d.N,
  })),
);

// 3) 8 cadeias concretas candidato -> responsáveis (com nome/CPF e tipo)
const cadeias = await q(
  `SELECT TOP 8
     cand.CODUSUARIOPS AS COD_CAND, cand.NOME AS CAND_NOME, cand.CPF AS CAND_CPF,
     r.TIPORELAC,
     resp.CODUSUARIOPS AS COD_RESP, resp.NOME AS RESP_NOME, resp.CPF AS RESP_CPF, resp.EMAIL AS RESP_EMAIL
   FROM SPSINSCRICAOAREAOFERTADA i
   JOIN SPSUSUARIO cand ON cand.CODUSUARIOPS = i.CODUSUARIOPS
   JOIN SPSUSUARIOTIPORELAC r ON r.CODUSUARIOPS = cand.CODUSUARIOPS
   JOIN SPSUSUARIO resp ON resp.CODUSUARIOPS = r.CODUSUARIOTIPORELAC
   WHERE i.IDPS=@idps
   ORDER BY cand.CODUSUARIOPS DESC`,
  { idps: IDPS },
);
console.log(
  `\n=== Cadeias candidato -> responsável (direção CODUSUARIOPS=cand) ===`,
);
console.table(
  cadeias.map((c) => ({
    COD_CAND: c.COD_CAND,
    CAND: (c.CAND_NOME || "").slice(0, 22),
    CAND_CPF: c.CAND_CPF,
    TIPO: TIPO[c.TIPORELAC] || c.TIPORELAC,
    COD_RESP: c.COD_RESP,
    RESP: (c.RESP_NOME || "").slice(0, 22),
    RESP_CPF: c.RESP_CPF,
  })),
);

// 4) Mesma coisa mas testando a direção inversa (resp -> cand)
const cadeias2 = await q(
  `SELECT TOP 8
     cand.CODUSUARIOPS AS COD_CAND, cand.NOME AS CAND_NOME, cand.CPF AS CAND_CPF,
     r.TIPORELAC,
     resp.CODUSUARIOPS AS COD_RESP, resp.NOME AS RESP_NOME, resp.CPF AS RESP_CPF
   FROM SPSINSCRICAOAREAOFERTADA i
   JOIN SPSUSUARIO cand ON cand.CODUSUARIOPS = i.CODUSUARIOPS
   JOIN SPSUSUARIOTIPORELAC r ON r.CODUSUARIOTIPORELAC = cand.CODUSUARIOPS
   JOIN SPSUSUARIO resp ON resp.CODUSUARIOPS = r.CODUSUARIOPS
   WHERE i.IDPS=@idps
   ORDER BY cand.CODUSUARIOPS DESC`,
  { idps: IDPS },
);
console.log(`\n=== Cadeias na direção inversa (CODUSUARIOTIPORELAC=cand) ===`);
console.table(
  cadeias2.map((c) => ({
    COD_CAND: c.COD_CAND,
    CAND: (c.CAND_NOME || "").slice(0, 22),
    CAND_CPF: c.CAND_CPF,
    TIPO: TIPO[c.TIPORELAC] || c.TIPORELAC,
    COD_RESP: c.COD_RESP,
    RESP: (c.RESP_NOME || "").slice(0, 22),
    RESP_CPF: c.RESP_CPF,
  })),
);

await pool.close();
