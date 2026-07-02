// Reset da senha do PS (SPSUSUARIO.SENHA) por CPF, reproduzindo EXATAMENTE o
// envelope de lib/totvs/senha-envelope.ts. Uso em HOMOLOG para destravar testes.
//
// Uso: node --env-file=.env.local scripts/totvs-reset-senha.mjs <cpf> <senha>
import sql from "mssql";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const CPF = (process.argv[2] || "").replace(/\D/g, "");
const SENHA = process.argv[3] || "";
if (CPF.length !== 11 || !SENHA) {
  console.error(
    "Uso: node --env-file=.env.local scripts/totvs-reset-senha.mjs <cpf> <senha>",
  );
  process.exit(1);
}

const PREFIXO = "#P=False#PT=None#WF=10#HT=SHA256#HA=Bcrypt#V=4.0.2.0#H=";
const pre = createHash("sha256").update(SENHA, "utf8").digest("base64");
const salt = bcrypt.genSaltSync(10).replace(/^\$2b\$/, "$2a$");
const envelope = PREFIXO + bcrypt.hashSync(pre, salt);

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME,
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: 1433,
  requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const req = pool.request();
req.input("env", envelope);
req.input("cpf", CPF);
const r = await req.query(
  `UPDATE SPSUSUARIO SET SENHA = @env
   WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf`,
);
console.log(
  `DB=${process.env.TOTVS_DB_NAME} CPF=${CPF} linhas=${r.rowsAffected[0]} senha="${SENHA}"`,
);
await pool.close();
