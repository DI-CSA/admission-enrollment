// Probe do CorporeRM (SQL Server) — valida conexão e DESCOBRE o schema das tabelas
// de Processo Seletivo / candidato / inscrição / boleto, direto do banco (sem navegador).
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/totvs-sql-probe.mjs
//
// Saída: scripts/discovery-out/sql-*.json (git-ignored — pode conter metadados sensíveis).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sql from "mssql";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "discovery-out");

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

// Padrões de nomes de tabela ligados ao Processo Seletivo (EduPS).
const PADROES = [
  "%PROCESSOSEL%",
  "%CANDIDAT%",
  "%PSUSUARIO%",
  "%INSCRI%",
  "%AREAOFERTAD%",
  "%PLANOPGTO%",
];

async function main() {
  for (const k of ["TOTVS_DB_SERVER", "TOTVS_DB_USER", "TOTVS_DB_PASSWORD"]) {
    if (!process.env[k]) {
      console.error(`✗ Variável ausente: ${k} (.env.local)`);
      process.exit(1);
    }
  }
  await mkdir(OUT_DIR, { recursive: true });

  console.log(
    `→ Conectando em ${config.server}:${config.port}/${config.database} ...`,
  );
  const pool = await new sql.ConnectionPool(config).connect();
  console.log("✓ Conectado");

  const ver = await pool
    .request()
    .query("SELECT DB_NAME() AS db, @@VERSION AS versao");
  console.log(`  DB=${ver.recordset[0].db}`);

  // 1) Descobrir tabelas candidatas
  const orClauses = PADROES.map((_, i) => `TABLE_NAME LIKE @p${i}`).join(
    " OR ",
  );
  const reqTab = pool.request();
  PADROES.forEach((p, i) => reqTab.input(`p${i}`, p));
  const tabelas = await reqTab.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND (${orClauses})
     ORDER BY TABLE_NAME`,
  );
  const nomes = tabelas.recordset.map((r) => r.TABLE_NAME);
  await writeFile(
    join(OUT_DIR, "sql-tabelas-ps.json"),
    JSON.stringify(nomes, null, 2),
  );
  console.log(
    `\n✓ ${nomes.length} tabelas ligadas a PS encontradas (sql-tabelas-ps.json):`,
  );
  nomes.forEach((n) => console.log(`    ${n}`));

  // 2) Colunas das tabelas-chave (as que existirem entre estas)
  const chaves = [
    "SPSPROCESSOSELETIVO",
    "SPSCANDIDATO",
    "SPSUSUARIO",
    "SPSINSCRICAO",
    "SPSAREAOFERTADA",
    "PPESSOA",
  ];
  const colunasOut = {};
  for (const t of chaves) {
    if (!nomes.includes(t) && t !== "PPESSOA") continue;
    const cols = await pool
      .request()
      .input("t", t)
      .query(
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@t ORDER BY ORDINAL_POSITION`,
      );
    if (cols.recordset.length) {
      colunasOut[t] = cols.recordset;
      console.log(`\n  • ${t}: ${cols.recordset.length} colunas`);
    }
  }
  await writeFile(
    join(OUT_DIR, "sql-colunas-chave.json"),
    JSON.stringify(colunasOut, null, 2),
  );

  await pool.close();
  console.log(`\n✓ Concluído. Arquivos em ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(`\n✗ Erro: ${e.message}`);
  process.exit(1);
});
