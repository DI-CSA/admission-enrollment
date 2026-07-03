// DEBUG READ-ONLY v2: config de documentos + arquivos enviados nos PS 2027.
// Uso: node --env-file=.env.local scripts/debug-docs-nao-aparecem.mjs
import sql from "mssql";

const pool = await new sql.ConnectionPool({
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 60000,
  connectionTimeout: 30000,
}).connect();

const q = (query, inputs = {}) => {
  const req = pool.request();
  for (const [k, v] of Object.entries(inputs)) req.input(k, v);
  return req.query(query).then((r) => r.recordset);
};
async function secao(t, fn) {
  console.log(`\n${"=".repeat(72)}\n${t}\n${"=".repeat(72)}`);
  try {
    console.log(JSON.stringify(await fn(), null, 1));
  } catch (e) {
    console.log("ERRO:", e.message);
  }
}

await secao("Config docs exigidos (SPSDOCUMENTOEXIGIDO) PS 2027", () =>
  q(`SELECT de.IDPS, de.IDAREAINTERESSE, de.CODDOCUMENTO,
            de.OBRIGATORIO, de.EXIGEINSCRICAO, de.QUANTIDADE
       FROM SPSDOCUMENTOEXIGIDO de
      WHERE de.IDPS BETWEEN 210 AND 220
      ORDER BY de.IDPS, de.CODDOCUMENTO`),
);

await secao("Contagem de arquivos por inscrição (PS 2027)", () =>
  q(`SELECT a.IDPS, a.NUMEROINSCRICAO, COUNT(*) AS N, MAX(a.DATAENVIO) AS ULTIMO
       FROM SPSARQUIVOSCANDIDATO a
      WHERE a.IDPS BETWEEN 210 AND 220
      GROUP BY a.IDPS, a.NUMEROINSCRICAO
      ORDER BY a.IDPS, a.NUMEROINSCRICAO`),
);

await secao("Amostra de arquivos enviados (PS 2027)", () =>
  q(`SELECT TOP 30 a.IDPS, a.NUMEROINSCRICAO, a.DETALHE, a.NOMEARQUIVO, a.DATAENVIO
       FROM SPSARQUIVOSCANDIDATO a
      WHERE a.IDPS BETWEEN 210 AND 220
      ORDER BY a.DATAENVIO DESC`),
);

await pool.close();
console.log("\n>>> Concluído (nenhuma escrita).");
