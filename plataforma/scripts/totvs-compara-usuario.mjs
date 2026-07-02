// Compara TODAS as colunas de SPSUSUARIO entre o usuário criado pelo nosso
// sistema (NOVO1 / CPF 878.087.260-36) e um usuário "de verdade" do portal
// TOTVS (ex.: BEATRIZ FURTADO MARTINS, responsável no PS de 2026).
//
// Objetivo: descobrir quais campos o portal preenche que o nosso NovaInscricao
// não preenche — o que pode explicar diferenças de comportamento (login/portal).
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/totvs-compara-usuario.mjs
//   (produção)  TOTVS_DB_SERVER=35.199.126.125 TOTVS_DB_NAME=CorporeRM \
//               TOTVS_DB_USER=rm TOTVS_DB_PASSWORD=rm \
//               node --env-file=.env.local scripts/totvs-compara-usuario.mjs
import sql from "mssql";

const CPF_NOSSO = "87808726036"; // NOVO1
const NOME_PORTAL = "BEATRIZ FURTADO MARTINS";

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

console.log(
  `>>> DB=${process.env.TOTVS_DB_NAME} SERVER=${process.env.TOTVS_DB_SERVER}`,
);

const nosso = (
  await q(
    `SELECT TOP 1 * FROM SPSUSUARIO WHERE CPF=@cpf ORDER BY RECCREATEDON DESC`,
    {
      cpf: CPF_NOSSO,
    },
  )
)[0];

const portal = (
  await q(
    `SELECT TOP 1 * FROM SPSUSUARIO WHERE NOME=@nome ORDER BY RECCREATEDON DESC`,
    {
      nome: NOME_PORTAL,
    },
  )
)[0];

if (!nosso) console.log(`!! Não achei o usuário NOSSO (CPF ${CPF_NOSSO})`);
if (!portal) console.log(`!! Não achei o usuário PORTAL (NOME ${NOME_PORTAL})`);
if (!nosso || !portal) {
  await pool.close();
  process.exit(0);
}

console.log(`\nNOSSO  = CODUSUARIOPS ${nosso.CODUSUARIOPS} (${nosso.NOME})`);
console.log(`PORTAL = CODUSUARIOPS ${portal.CODUSUARIOPS} (${portal.NOME})`);

// Mascara valores sensíveis / longos p/ exibição
const fmt = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return v.toISOString();
  let s = String(v);
  if (s.length > 60) s = s.slice(0, 57) + "...";
  return s;
};

const cols = Object.keys(nosso);
const rows = [];
for (const c of cols) {
  const a = nosso[c];
  const b = portal[c];
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  // Marca diferença de "preenchido vs vazio" (o que mais interessa)
  let flag = "";
  if (aNull && !bNull) flag = "<< PORTAL preenche, NOSSO vazio";
  else if (!aNull && bNull) flag = ">> NOSSO preenche, PORTAL vazio";
  rows.push({
    COLUNA: c,
    NOSSO: fmt(a),
    PORTAL: fmt(b),
    DIF: flag,
  });
}

console.log(`\n=== TODAS as colunas (${cols.length}) ===`);
console.table(rows);

console.log(
  `\n=== Só as colunas com diferença de preenchimento (vazio vs preenchido) ===`,
);
console.table(rows.filter((r) => r.DIF));

await pool.close();
