// Diagnóstico: verifica se a criação de candidato (NovaInscricao) corrompe a
// SENHA do responsável. Para cada CPF, mostra o hash atual da senha, quando o
// registro foi modificado, testa se ainda bate com a senha esperada, e lista as
// inscrições/datas dos candidatos vinculados (para correlacionar com RECMODIFIEDON).
//
// Uso: node --env-file=.env.local scripts/totvs-senha-corrompida.mjs <cpf> [senhaEsperada]
import sql from "mssql";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const CPF = (process.argv[2] || "").replace(/\D/g, "");
const SENHA_ESPERADA = process.argv[3] || null;

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME,
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: 1433,
  requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const q = (text, inputs = {}) => {
  const req = pool.request();
  for (const [k, v] of Object.entries(inputs)) req.input(k, v);
  return req.query(text).then((r) => r.recordset);
};

// Extrai o hash bcrypt do formato TOTVS (#...#H=$2a$...) e testa a senha.
function testarSenha(senhaArmazenada, senhaClara) {
  if (!senhaArmazenada || !senhaClara) return "sem dados";
  const m = senhaArmazenada.match(/#H=(\$2[aby]\$.+)$/);
  if (!m) return `formato não reconhecido: ${senhaArmazenada.slice(0, 30)}`;
  const hash = m[1];
  const sha256b64 = crypto
    .createHash("sha256")
    .update(senhaClara, "utf8")
    .digest("base64");
  try {
    return bcrypt.compareSync(sha256b64, hash) ? "BATE ✅" : "NÃO BATE ❌";
  } catch (e) {
    return "erro: " + e.message;
  }
}

const users = await q(
  `SELECT CODUSUARIOPS, NOME, SENHA, LEN(SENHA) AS TAM,
          CONVERT(varchar(19), RECCREATEDON, 120) AS CRIADO,
          CONVERT(varchar(19), RECMODIFIEDON, 120) AS MODIF,
          CODPESSOA, CODUSUARIOLOGINRM
   FROM SPSUSUARIO WHERE CPF=@cpf ORDER BY RECCREATEDON`,
  { cpf: CPF },
);

console.log(`>>> DB=${process.env.TOTVS_DB_NAME} CPF=${CPF}\n`);
for (const u of users) {
  console.log(`— CODUSUARIOPS ${u.CODUSUARIOPS} (${u.NOME})`);
  console.log(`  criado=${u.CRIADO}  modificado=${u.MODIF}`);
  console.log(`  CODPESSOA=${u.CODPESSOA}  LOGINRM=${u.CODUSUARIOLOGINRM}`);
  console.log(`  SENHA=${u.SENHA}`);
  if (SENHA_ESPERADA)
    console.log(
      `  teste "${SENHA_ESPERADA}": ${testarSenha(u.SENHA, SENHA_ESPERADA)}`,
    );

  // Inscrições/candidatos onde este user é responsável
  const cands = await q(
    `SELECT r.TIPORELAC, u.CODUSUARIOPS AS CAND, u.NOME AS CAND_NOME,
            i.IDPS, i.NUMEROINSCRICAO,
            CONVERT(varchar(19), i.DATAINSCRICAO, 120) AS DT_INSC
     FROM SPSUSUARIOTIPORELAC r
     JOIN SPSUSUARIO u ON u.CODUSUARIOPS = r.CODUSUARIOPS
     LEFT JOIN SPSINSCRICAOAREAOFERTADA i ON i.CODUSUARIOPS = r.CODUSUARIOPS
     WHERE r.CODUSUARIOTIPORELAC = @resp AND r.CODUSUARIOPS <> r.CODUSUARIOTIPORELAC
     ORDER BY i.DATAINSCRICAO`,
    { resp: u.CODUSUARIOPS },
  );
  if (cands.length) {
    console.log(`  candidatos/inscrições:`);
    for (const c of cands)
      console.log(
        `    cand ${c.CAND} ${c.CAND_NOME} | IDPS ${c.IDPS} | insc ${c.NUMEROINSCRICAO} | ${c.DT_INSC} | tipo ${c.TIPORELAC}`,
      );
  }
  console.log("");
}

await pool.close();
