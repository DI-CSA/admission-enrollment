#!/usr/bin/env node
// ---------------------------------------------------------------------------
// restaurar-login-aluno.mjs — restaura o hash ORIGINAL de senha
// (GUSUARIO.SENHA) guardado por scripts/simular-login-aluno.mjs e apaga o
// backup. Irmão de restaurar-login.mjs (que trata SPSUSUARIO).
// ---------------------------------------------------------------------------
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/restaurar-login-aluno.mjs <cpf>
// ---------------------------------------------------------------------------

import sql from "mssql";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const cpfArg = process.argv[2];
const cpf = (cpfArg || "").replace(/\D/g, "");
if (cpf.length !== 11) {
  console.error(
    "Uso: node --env-file=.env.local scripts/restaurar-login-aluno.mjs <cpf>",
  );
  process.exit(1);
}

const config = {
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 60000,
  connectionTimeout: 30000,
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupFile = join(__dirname, ".senha-backups", `aluno-${cpf}.json`);

async function main() {
  if (!config.server || !config.user || !config.password) {
    console.error(
      "TOTVS_DB_SERVER/USER/PASSWORD ausentes. Rode com --env-file=.env.local.",
    );
    process.exit(1);
  }
  if (!existsSync(backupFile)) {
    console.error(`Sem backup para o CPF ${cpf} (${backupFile} não existe).`);
    process.exit(2);
  }
  console.log(`Banco: ${config.database} @ ${config.server}`);

  const dados = JSON.parse(readFileSync(backupFile, "utf8"));
  const conta = dados.conta;
  if (!conta) {
    console.error("Backup vazio (sem conta). Nada a restaurar.");
    process.exit(2);
  }

  const pool = await new sql.ConnectionPool(config).connect();
  try {
    const upd = await pool
      .request()
      .input("env", conta.SENHA ?? null)
      .input("cpf", cpf)
      .query(`UPDATE GUSUARIO SET SENHA = @env WHERE CODUSUARIO = @cpf`);
    console.log(
      `Hash original restaurado em GUSUARIO (${upd.rowsAffected[0]} linha[s]).`,
    );
  } finally {
    await pool.close();
  }

  rmSync(backupFile);
  console.log(`Backup removido: ${backupFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
