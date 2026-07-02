// Investiga, em dados REAIS, como o vínculo responsável↔candidato (dependente)
// é persistido no RM, usando o PS 147 (1º ano 2026 — já encerrado, muitos
// candidatos/usuários). Somente LEITURA.
//
// Uso: node --env-file=.env.local scripts/totvs-ps147-vinculo.mjs
// (opcional) IDPS por argv: node --env-file=.env.local scripts/totvs-ps147-vinculo.mjs 147

import sql from "mssql";

const IDPS = Number(process.argv[2] || 147);

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const q = (query, inputs = {}) => {
  const req = pool.request();
  for (const [k, v] of Object.entries(inputs)) req.input(k, v);
  return req.query(query).then((r) => r.recordset);
};

console.log(
  `\n>>> DB=${process.env.TOTVS_DB_NAME} SERVER=${process.env.TOTVS_DB_SERVER}`,
);

// 0) O PS existe? Nome/datas
const ps = await q(
  `SELECT CODCOLIGADA, IDPS, NOME, STATUS,
          CONVERT(varchar(10),DTINIINSCRICAO,103) INI,
          CONVERT(varchar(10),DTFIMINSCRICAO,103) FIM
   FROM SPSPROCESSOSELETIVO WHERE IDPS=@idps`,
  { idps: IDPS },
);
console.log(`\n=== SPSPROCESSOSELETIVO IDPS=${IDPS} ===`);
console.table(ps);
if (ps.length === 0) {
  console.log("PS não encontrado neste banco. Abortando.");
  await pool.close();
  process.exit(0);
}

// 1) Quantos candidatos inscritos
const cnt = await q(
  `SELECT COUNT(*) N FROM SCANDIDATOPROCSEL WHERE IDPROCSEL=@idps`,
  { idps: IDPS },
);
console.log(`\nSCANDIDATOPROCSEL: ${cnt[0].N} inscrições`);

// 2) Usuários do PS (candidatos + responsáveis) — flags de vínculo
console.log(
  `\n=== SPSUSUARIO (amostra 15) — flags EHCANDIDATO/EHPAI/EHMAE/EHRESPINSC ===`,
);
const usu = await q(
  `SELECT TOP 15 CODUSUARIO, NOME, CPF, EHCANDIDATO, EHPAI, EHMAE,
          EHRESPFINANCEIRO, EHRESPINSC, CODESTRUTURATIPO, EMAIL
   FROM SPSUSUARIO WHERE IDPS=@idps ORDER BY CODUSUARIO DESC`,
  { idps: IDPS },
).catch((e) => {
  console.log("erro SPSUSUARIO:", e.message);
  return [];
});
console.table(usu);

// 3) Tabela de relacionamento entre usuários (SPSUSUARIOTIPORELAC)
console.log(`\n=== SPSUSUARIOTIPORELAC (amostra 20) ===`);
const rel = await q(
  `SELECT TOP 20 * FROM SPSUSUARIOTIPORELAC
   WHERE CODUSUARIO IN (SELECT CODUSUARIO FROM SPSUSUARIO WHERE IDPS=@idps)`,
  { idps: IDPS },
).catch((e) => {
  console.log("erro SPSUSUARIOTIPORELAC:", e.message);
  return [];
});
console.table(rel);

// 4) Um candidato concreto + seu(s) responsável(is), montando a cadeia
console.log(`\n=== CADEIA candidato→responsável (1 exemplo real) ===`);
const umCand = await q(
  `SELECT TOP 1 c.IDCANDIDATO, c.CODUSUARIO, u.NOME, u.CPF
   FROM SCANDIDATOPROCSEL c
   JOIN SPSUSUARIO u ON u.CODUSUARIO=c.CODUSUARIO AND u.IDPS=@idps
   WHERE u.EHCANDIDATO='T'
   ORDER BY c.IDCANDIDATO DESC`,
  { idps: IDPS },
).catch((e) => {
  console.log("erro cadeia:", e.message);
  return [];
});
console.table(umCand);

if (umCand.length) {
  const cod = umCand[0].CODUSUARIO;
  console.log(`\nRelacionamentos do candidato CODUSUARIO=${cod}:`);
  const relacs = await q(
    `SELECT * FROM SPSUSUARIOTIPORELAC WHERE CODUSUARIO=@cod OR CODUSUARIOTIPORELAC=@cod`,
    { cod },
  ).catch((e) => {
    console.log("erro:", e.message);
    return [];
  });
  console.table(relacs);
}

await pool.close();
