// Compara os registros do nosso candidato/responsável (12231/12232) com um
// candidato/responsável criado pelo PORTAL original que funciona, para achar a
// condição extra que a API CandidatosDependentes exige.
// Uso: node --env-file=.env.local scripts/totvs-compara-insc.mjs
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

console.log(`>>> DB=${process.env.TOTVS_DB_NAME}`);

// Campos-chave dos usuários (nosso vs portal): CODPESSOA e CODUSUARIOLOGINRM
const usuarios = await q(`
  SELECT CODUSUARIOPS, NOME, CPF, CODPESSOA, CODUSUARIOLOGINRM,
         CASE WHEN SENHA IS NULL OR SENHA='' THEN 'VAZIA' ELSE 'DEFINIDA' END AS SENHA
  FROM SPSUSUARIO
  WHERE CODUSUARIOPS IN (12231, 12232, 12211, 12212, 12208, 12209, 12210)
  ORDER BY CODUSUARIOPS`);
console.log(
  `\n=== SPSUSUARIO: nosso(12231 cand/12232 resp) vs portal(12211/12212, 12208/12209/12210) ===`,
);
console.table(
  usuarios.map((u) => ({
    COD: u.CODUSUARIOPS,
    NOME: (u.NOME || "").slice(0, 22),
    CODPESSOA: u.CODPESSOA,
    LOGINRM: u.CODUSUARIOLOGINRM,
    SENHA: u.SENHA,
  })),
);

// Inscrições (SPSINSCRICAOAREAOFERTADA) dos candidatos: STATUS, CODPESSOA, CODPESSOARESPONSAVEL
const insc = await q(`
  SELECT CODUSUARIOPS, NUMEROINSCRICAO, STATUS, CODPESSOA, CODPESSOARESPONSAVEL, IDPS,
         CODCOLIGADAALUNO, RA
  FROM SPSINSCRICAOAREAOFERTADA
  WHERE CODUSUARIOPS IN (12231, 12211, 12208)
  ORDER BY CODUSUARIOPS`);
console.log(
  `\n=== SPSINSCRICAOAREAOFERTADA: nosso(12231) vs portal(12211, 12208) ===`,
);
console.table(
  insc.map((x) => ({
    COD: x.CODUSUARIOPS,
    NUMINSC: x.NUMEROINSCRICAO,
    STATUS: x.STATUS,
    CODPESSOA: x.CODPESSOA,
    CODPESSOARESP: x.CODPESSOARESPONSAVEL,
    IDPS: x.IDPS,
  })),
);

await pool.close();
