import sql from "mssql";

const config = {
  server: process.env.PDB_SERVER,
  database: process.env.PDB_NAME,
  user: process.env.PDB_USER,
  password: process.env.PDB_PASSWORD,
  port: Number(process.env.PDB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 60000,
  connectionTimeout: 30000,
};
const pool = await new sql.ConnectionPool(config).connect();

console.log("=== Colunas de SPSDOCUMENTOENTREGUE ===");
const cols = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'SPSDOCUMENTOENTREGUE'
  ORDER BY ORDINAL_POSITION
`);
console.table(cols.recordset);

console.log(
  "\n=== Amostra: inscrições COM arquivo (SPSARQUIVOSCANDIDATO) e o status de entrega ===",
);
const amostra = await pool.request().query(`
  SELECT TOP 25 a.IDPS, a.NUMEROINSCRICAO, a.NOMEARQUIVO, a.DETALHE,
         e.CODDOCUMENTO, e.ENTREGUE, e.MOTIVO
  FROM SPSARQUIVOSCANDIDATO a
  LEFT JOIN SPSDOCUMENTOENTREGUE e
    ON e.CODCOLIGADA = a.CODCOLIGADA AND e.IDPS = a.IDPS
   AND e.NUMEROINSCRICAO = a.NUMEROINSCRICAO
  ORDER BY a.IDPS DESC, a.NUMEROINSCRICAO DESC
`);
console.table(
  amostra.recordset.map((r) => ({
    IDPS: r.IDPS,
    NUMINSC: r.NUMEROINSCRICAO,
    ARQ: (r.NOMEARQUIVO || "").slice(0, 30),
    DETALHE: (r.DETALHE || "").slice(0, 22),
    E_COD: r.CODDOCUMENTO,
    ENTREGUE: r.ENTREGUE,
    MOTIVO: r.MOTIVO,
  })),
);

console.log("\n=== Distribuição ENTREGUE em SPSDOCUMENTOENTREGUE (geral) ===");
const dist = await pool.request().query(`
  SELECT ENTREGUE, COUNT(*) AS N FROM SPSDOCUMENTOENTREGUE GROUP BY ENTREGUE
`);
console.table(dist.recordset);

await pool.close();
