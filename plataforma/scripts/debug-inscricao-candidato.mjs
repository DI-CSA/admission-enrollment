// Lista as inscrições de um candidato (CODUSUARIOPS) com PS, situação e pagamento.
// Uso: node --env-file=.env.local scripts/debug-inscricao-candidato.mjs <codUsuarioPS>
import sql from "mssql";

const COD = Number(process.argv[2] || "3386");

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

console.log(`>>> DB=${process.env.TOTVS_DB_NAME} CODUSUARIOPS=${COD}`);

const rows = await q(
  `
SELECT i.NUMEROINSCRICAO, i.IDPS, ps.NOME AS PSNOME,
       o.STATUS AS STATUSOPCAO, st.DESCRICAO AS SITUACAO,
       fl.STATUSLAN, fl.VALORORIGINAL, fl.VALORBAIXADO,
       CONVERT(varchar(10), fl.DATAVENCIMENTO, 120) AS VENCIMENTO,
       CONVERT(varchar(10), fl.DATABAIXA, 120) AS BAIXA
  FROM SPSINSCRICAOAREAOFERTADA i
  JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA = i.CODCOLIGADA AND ps.IDPS = i.IDPS
  LEFT JOIN SPSOPCAOINSCRITO o ON o.NUMEROINSCRICAO = i.NUMEROINSCRICAO
       AND o.IDPS = i.IDPS AND o.CODCOLIGADA = i.CODCOLIGADA
  LEFT JOIN SPSSTATUSOPCAO st ON st.CODIGO = o.STATUS
       AND st.CODCOLIGADA = o.CODCOLIGADA AND st.CODFILIAL = ps.CODFILIAL
  LEFT JOIN FLAN fl ON fl.CODCOLIGADA = i.CODCOLIGADALAN AND fl.IDLAN = i.IDLAN
 WHERE i.CODUSUARIOPS = @cod
 ORDER BY ps.NOME, i.NUMEROINSCRICAO`,
  { cod: COD },
);

console.log(`\n=== Inscrições do candidato ${COD}: ${rows.length} ===`);
console.table(
  rows.map((r) => ({
    NUM: r.NUMEROINSCRICAO,
    IDPS: r.IDPS,
    PS: (r.PSNOME || "").slice(0, 40),
    SITUACAO: r.SITUACAO,
    STATUSLAN:
      r.STATUSLAN == null
        ? "(sem título)"
        : r.STATUSLAN === 0
          ? "0=aberto"
          : r.STATUSLAN === 1
            ? "1=pago"
            : `${r.STATUSLAN}`,
    VENC: r.VENCIMENTO,
    BAIXA: r.BAIXA,
  })),
);

await pool.close();
