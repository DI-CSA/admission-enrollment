// Investiga TODOS os registros SPSUSUARIO do CPF 878.087.260-36 e seus vínculos,
// para entender por que a lista de dependentes vem vazia e o login é negado.
// Uso: node --env-file=.env.local scripts/totvs-cpf-probe.mjs 87808726036
import sql from "mssql";

const CPF = (process.argv[2] || "87808726036").replace(/\D/g, "");

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

console.log(`>>> DB=${process.env.TOTVS_DB_NAME} CPF=${CPF}`);

// 1) TODOS os SPSUSUARIO desse CPF
const users = await q(
  `
  SELECT CODUSUARIOPS, NOME, CPF, EMAIL,
         CASE WHEN SENHA IS NULL OR SENHA='' THEN 'VAZIA' ELSE 'DEFINIDA' END AS TEM_SENHA,
         CODUSUARIOLOGINRM,
         CONVERT(varchar(19), RECCREATEDON, 120) AS CRIADO
  FROM SPSUSUARIO WHERE CPF=@cpf ORDER BY RECCREATEDON`,
  { cpf: CPF },
);
console.log(`\n=== SPSUSUARIO com CPF ${CPF}: ${users.length} registro(s) ===`);
console.table(
  users.map((u) => ({
    COD: u.CODUSUARIOPS,
    NOME: (u.NOME || "").slice(0, 24),
    SENHA: u.TEM_SENHA,
    LOGINRM: u.CODUSUARIOLOGINRM,
    CRIADO: u.CRIADO,
  })),
);

// 2) Para cada CODUSUARIOPS, os vínculos onde ele é RESPONSÁVEL (lado direito)
const cods = users.map((u) => u.CODUSUARIOPS);
if (cods.length) {
  const comoResp = await q(`
    SELECT r.CODUSUARIOTIPORELAC AS RESP, r.TIPORELAC, r.CODUSUARIOPS AS CAND,
           c.NOME AS CAND_NOME, c.CPF AS CAND_CPF
    FROM SPSUSUARIOTIPORELAC r
    JOIN SPSUSUARIO c ON c.CODUSUARIOPS=r.CODUSUARIOPS
    WHERE r.CODUSUARIOTIPORELAC IN (${cods.join(",")})
    ORDER BY r.CODUSUARIOTIPORELAC, r.CODUSUARIOPS, r.TIPORELAC`);
  console.log(
    `\n=== Vínculos onde o CPF é RESPONSÁVEL (CODUSUARIOTIPORELAC = ele) ===`,
  );
  console.table(
    comoResp.map((x) => ({
      RESP_COD: x.RESP,
      TIPO: TIPO[x.TIPORELAC] || x.TIPORELAC,
      CAND_COD: x.CAND,
      CAND: (x.CAND_NOME || "").slice(0, 22),
      CAND_CPF: x.CAND_CPF,
    })),
  );

  // 3) E onde ele é candidato (lado esquerdo) — só p/ completar o quadro
  const comoCand = await q(`
    SELECT r.CODUSUARIOPS AS CAND, r.TIPORELAC, r.CODUSUARIOTIPORELAC AS RESP,
           resp.NOME AS RESP_NOME
    FROM SPSUSUARIOTIPORELAC r
    LEFT JOIN SPSUSUARIO resp ON resp.CODUSUARIOPS=r.CODUSUARIOTIPORELAC
    WHERE r.CODUSUARIOPS IN (${cods.join(",")})
    ORDER BY r.CODUSUARIOPS, r.TIPORELAC`);
  console.log(
    `\n=== Vínculos onde o CPF é o lado esquerdo (CODUSUARIOPS = ele) ===`,
  );
  console.table(
    comoCand.map((x) => ({
      COD: x.CAND,
      TIPO: TIPO[x.TIPORELAC] || x.TIPORELAC,
      RESP_COD: x.RESP,
      RESP: (x.RESP_NOME || "").slice(0, 22),
    })),
  );
}

await pool.close();
