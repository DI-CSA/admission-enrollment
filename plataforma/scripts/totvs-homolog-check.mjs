// Verifica o que o fluxo Next.js gravou na HOMOLOGAÇÃO: últimos candidatos criados
// e as linhas de SPSUSUARIOTIPORELAC associadas (para ver se RespInscrição foi gerada).
// Uso: node --env-file=.env.local scripts/totvs-homolog-check.mjs
import sql from "mssql";

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const q = (query, inputs = {}) => {
  const req = pool.request();
  for (const [k, v] of Object.entries(inputs)) req.input(k, v);
  return req.query(query).then((r) => r.recordset);
};
const TIPO = {
  1: "Pai",
  2: "Mae",
  3: "RespFinanceiro",
  4: "RespAcademico",
  5: "RespInscricao",
};

console.log(
  `>>> DB=${process.env.TOTVS_DB_NAME} SERVER=${process.env.TOTVS_DB_SERVER}`,
);

// Últimos usuários criados (candidatos e responsáveis) por data
const ult = await q(`
  SELECT TOP 20 CODUSUARIOPS, NOME, CPF, EMAIL,
         CONVERT(varchar(19), RECCREATEDON, 120) AS CRIADO
  FROM SPSUSUARIO ORDER BY RECCREATEDON DESC`);
console.log("\n=== Últimos 20 SPSUSUARIO criados ===");
console.table(
  ult.map((u) => ({
    COD: u.CODUSUARIOPS,
    NOME: (u.NOME || "").slice(0, 26),
    CPF: u.CPF,
    CRIADO: u.CRIADO,
  })),
);

// Para cada um dos 20, mostra os vínculos onde ele é o candidato (lado esquerdo)
const cods = ult.map((u) => u.CODUSUARIOPS);
if (cods.length) {
  const rel = await q(`
    SELECT r.CODUSUARIOPS, r.CODUSUARIOTIPORELAC, r.TIPORELAC,
           c.NOME AS CAND, resp.NOME AS RESP, resp.CPF AS RESP_CPF
    FROM SPSUSUARIOTIPORELAC r
    JOIN SPSUSUARIO c ON c.CODUSUARIOPS=r.CODUSUARIOPS
    LEFT JOIN SPSUSUARIO resp ON resp.CODUSUARIOPS=r.CODUSUARIOTIPORELAC
    WHERE r.CODUSUARIOPS IN (${cods.join(",")}) OR r.CODUSUARIOTIPORELAC IN (${cods.join(",")})
    ORDER BY r.CODUSUARIOPS DESC, r.TIPORELAC`);
  console.log("\n=== Vínculos SPSUSUARIOTIPORELAC desses usuários ===");
  console.table(
    rel.map((x) => ({
      COD_CAND: x.CODUSUARIOPS,
      CAND: (x.CAND || "").slice(0, 22),
      TIPO: TIPO[x.TIPORELAC] || x.TIPORELAC,
      COD_RESP: x.CODUSUARIOTIPORELAC,
      RESP: (x.RESP || "").slice(0, 22),
      RESP_CPF: x.RESP_CPF,
    })),
  );
}

await pool.close();
