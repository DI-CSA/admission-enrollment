// Consulta (LEITURA) o valor da taxa (FLAN) das inscrições do ciclo 2027 informadas.
// Uso: node --env-file=.env.local scripts/rm-valor-taxa.mjs 2 4 5 6 ...
import sql from "mssql";

const config = {
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};

const ano = process.env.PS_ANO_ATUAL?.trim() || "2027";
const nums = process.argv
  .slice(2)
  .map((n) => Number(n))
  .filter(Number.isFinite);
if (nums.length === 0) {
  console.error("informe os números de inscrição");
  process.exit(1);
}

await sql.connect(config);
const inList = nums.join(",");
const r = await sql.query(`
  SELECT i.NUMEROINSCRICAO, u.NOME AS CANDIDATO, ps.NOME AS PS,
         fl.VALORORIGINAL, fl.STATUSLAN, ps.VALORINSCRICAO
    FROM SPSINSCRICAOAREAOFERTADA i
    JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA = i.CODCOLIGADA AND ps.IDPS = i.IDPS
    JOIN SPSUSUARIO u ON u.CODUSUARIOPS = i.CODUSUARIOPS
    LEFT JOIN FLAN fl ON fl.CODCOLIGADA = i.CODCOLIGADALAN AND fl.IDLAN = i.IDLAN
   WHERE ps.NOME LIKE '%${ano}%'
     AND i.NUMEROINSCRICAO IN (${inList})
   ORDER BY i.NUMEROINSCRICAO`);

for (const row of r.recordset) {
  console.log(
    `nº ${row.NUMEROINSCRICAO} | ${row.CANDIDATO} | FLAN.VALORORIGINAL=${row.VALORORIGINAL} | STATUSLAN=${row.STATUSLAN} | ps.VALORINSCRICAO=${row.VALORINSCRICAO}`,
  );
}
console.log(`\nlinhas: ${r.recordset.length}`);
await sql.close();
