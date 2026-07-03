// Descoberta READ-ONLY: como o RM armazena a situação da inscrição e o status
// dos documentos (entregue / em análise / observação), para confirmar o
// mapeamento que a WebAPI EduPS expõe à Central do Candidato:
//
//   WebAPI (JS)                         <-  Banco (CorporeRM)
//   RequiredDocument.reason             <-  SPSDOCUMENTOENTREGUE.MOTIVO
//   ApplicantRegistries.allowupdate     <-  SPSDOCUMENTOENTREGUE.ENTREGUE (invertido)
//   ResultadoAreaInteresse.STATUS_OPCAO_DESC <- SPSOPCAOINSCRICAO / enum StatusOpcao
//
// Nada é escrito. Apenas SELECT. As senhas ficam no .env.local (não no código).
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/descobre-docs-situacao.mjs
//
// Requer TOTVS_DB_* no .env.local (mesma base de leitura do app).

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

// Executa uma seção isolando erros (uma falha não aborta as demais).
async function secao(titulo, fn) {
  console.log(`\n${"=".repeat(72)}\n${titulo}\n${"=".repeat(72)}`);
  try {
    await fn();
  } catch (e) {
    console.log(`  (falhou: ${e.message})`);
  }
}

const colunas = (t) =>
  q(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS LEN, IS_NULLABLE
       FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@t ORDER BY ORDINAL_POSITION`,
    { t },
  );

const existeTabela = (t) =>
  q(`SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME=@t`, {
    t,
  }).then((r) => r.length > 0);

console.log(
  `>>> DB=${process.env.TOTVS_DB_NAME} @ ${process.env.TOTVS_DB_SERVER}`,
);

// ---------------------------------------------------------------------------
await secao(
  "1) Tabelas candidatas (documento/arquivo/opção/situação)",
  async () => {
    const tabs = await q(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE='BASE TABLE'
      AND (TABLE_NAME LIKE 'SPS%DOCUMENTO%'
        OR TABLE_NAME LIKE 'SPS%ARQUIVO%'
        OR TABLE_NAME LIKE 'SPS%OPCAO%'
        OR TABLE_NAME LIKE 'SPS%STATUS%')
    ORDER BY TABLE_NAME`);
    console.log(tabs.map((t) => t.TABLE_NAME).join("\n") || "  (nenhuma)");
  },
);

// ---------------------------------------------------------------------------
await secao(
  "2) Colunas de SPSDOCUMENTOENTREGUE (entregue + motivo/observação)",
  async () => {
    console.table(await colunas("SPSDOCUMENTOENTREGUE"));
  },
);

await secao(
  "3) Colunas de SPSARQUIVOSCANDIDATO (arquivos enviados)",
  async () => {
    console.table(await colunas("SPSARQUIVOSCANDIDATO"));
  },
);

// ---------------------------------------------------------------------------
await secao("4) Distribuição de ENTREGUE em SPSDOCUMENTOENTREGUE", async () => {
  const dist = await q(`
    SELECT ENTREGUE, COUNT(*) AS N FROM SPSDOCUMENTOENTREGUE GROUP BY ENTREGUE`);
  console.table(dist);
});

await secao(
  "5) Amostra: documentos com ENTREGUE marcado (mostra MOTIVO)",
  async () => {
    const rows = await q(`
    SELECT TOP 20 CODCOLIGADA, IDPS, NUMEROINSCRICAO, CODDOCUMENTO, ENTREGUE, MOTIVO
    FROM SPSDOCUMENTOENTREGUE
    WHERE ENTREGUE IS NOT NULL AND ENTREGUE <> 0 AND ENTREGUE <> 'N'
    ORDER BY IDPS DESC, NUMEROINSCRICAO DESC`);
    console.table(
      rows.map((r) => ({
        IDPS: r.IDPS,
        NUMINSC: r.NUMEROINSCRICAO,
        CODDOC: r.CODDOCUMENTO,
        ENTREGUE: r.ENTREGUE,
        MOTIVO: (r.MOTIVO ?? "").toString().slice(0, 50),
      })),
    );
  },
);

await secao(
  "6) Amostra: documentos COM observação (MOTIVO preenchido)",
  async () => {
    const rows = await q(`
    SELECT TOP 20 IDPS, NUMEROINSCRICAO, CODDOCUMENTO, ENTREGUE, MOTIVO
    FROM SPSDOCUMENTOENTREGUE
    WHERE MOTIVO IS NOT NULL AND LTRIM(RTRIM(MOTIVO)) <> ''
    ORDER BY IDPS DESC, NUMEROINSCRICAO DESC`);
    console.table(
      rows.map((r) => ({
        IDPS: r.IDPS,
        NUMINSC: r.NUMEROINSCRICAO,
        CODDOC: r.CODDOCUMENTO,
        ENTREGUE: r.ENTREGUE,
        MOTIVO: (r.MOTIVO ?? "").toString().slice(0, 60),
      })),
    );
  },
);

// ---------------------------------------------------------------------------
await secao("7) Correlação arquivo enviado x entrega (join real)", async () => {
  const rows = await q(`
    SELECT TOP 25 a.IDPS, a.NUMEROINSCRICAO,
           LEFT(a.NOMEARQUIVO, 28) AS ARQ, LEFT(a.DETALHE, 22) AS DETALHE,
           e.CODDOCUMENTO, e.ENTREGUE, LEFT(e.MOTIVO, 30) AS MOTIVO
    FROM SPSARQUIVOSCANDIDATO a
    LEFT JOIN SPSDOCUMENTOENTREGUE e
      ON e.CODCOLIGADA = a.CODCOLIGADA AND e.IDPS = a.IDPS
     AND e.NUMEROINSCRICAO = a.NUMEROINSCRICAO
    ORDER BY a.IDPS DESC, a.NUMEROINSCRICAO DESC`);
  console.table(rows);
});

// ---------------------------------------------------------------------------
await secao("8) Situação da inscrição — tabela SPSOPCAOINSCRICAO", async () => {
  if (!(await existeTabela("SPSOPCAOINSCRICAO"))) {
    console.log(
      "  SPSOPCAOINSCRICAO não existe; procurando colunas STATUS_OPCAO...",
    );
    const cols = await q(`
      SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME LIKE '%STATUS%OPCAO%' OR COLUMN_NAME='STATUSOPCAO'
      ORDER BY TABLE_NAME`);
    console.table(cols);
    return;
  }
  console.log("--- colunas ---");
  console.table(await colunas("SPSOPCAOINSCRICAO"));
  const statusCol = (await colunas("SPSOPCAOINSCRICAO")).find((c) =>
    /STATUS.*OPCAO|STATUSOPCAO/i.test(c.COLUMN_NAME),
  );
  if (statusCol) {
    console.log(`\n--- distribuição de ${statusCol.COLUMN_NAME} ---`);
    console.table(
      await q(
        `SELECT ${statusCol.COLUMN_NAME} AS STATUS, COUNT(*) AS N
           FROM SPSOPCAOINSCRICAO GROUP BY ${statusCol.COLUMN_NAME}
           ORDER BY N DESC`,
      ),
    );
  }
});

// ---------------------------------------------------------------------------
await secao(
  "9) DISPONIBILIZAMATRICULAPORTAL — onde está e distribuição",
  async () => {
    const cols = await q(`
    SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME LIKE '%DISPONIBILIZAMATRICULA%'
    ORDER BY TABLE_NAME`);
    console.table(cols);
  },
);

await pool.close();
console.log("\n>>> Concluído (nenhuma escrita realizada).");
