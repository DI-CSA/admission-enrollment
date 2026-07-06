// Busca registros SPSUSUARIO por padrão de NOME (para achar colisões de nome/CPF).
// Uso: node --env-file=.env.local scripts/debug-busca-nome.mjs "%MANUELA%GASPARONI%"
import sql from "mssql";

const PADRAO = process.argv[2] || "%GASPARONI%";

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

console.log(`>>> DB=${process.env.TOTVS_DB_NAME} NOME LIKE ${PADRAO}`);

const rows = await q(
  `SELECT CODUSUARIOPS, CODPESSOA,
          '[' + NOME + ']' AS NOME_DELIM, LEN(NOME) AS LEN_NOME,
          CPF, EMAIL,
          CONVERT(varchar(10), DTNASCIMENTO, 120) AS DTNASC, SEXO,
          CONVERT(varchar(19), RECCREATEDON, 120) AS CRIADO
     FROM SPSUSUARIO
    WHERE NOME LIKE @p
    ORDER BY NOME, RECCREATEDON`,
  { p: PADRAO },
);

console.log(`\n=== ${rows.length} registro(s) ===`);
for (const r of rows) {
  console.log(
    `COD=${r.CODUSUARIOPS} PESSOA=${r.CODPESSOA} CPF=${r.CPF} NASC=${r.DTNASC} SEXO=${r.SEXO} CRIADO=${r.CRIADO}`,
  );
  console.log(`   NOME=${r.NOME_DELIM} (len=${r.LEN_NOME})  EMAIL=${r.EMAIL}`);
}

await pool.close();
