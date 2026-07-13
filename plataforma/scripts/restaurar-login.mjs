#!/usr/bin/env node
// ---------------------------------------------------------------------------
// restaurar-login.mjs — restaura o hash ORIGINAL de senha (SPSUSUARIO.SENHA)
// guardado por scripts/simular-login.mjs e apaga o backup.
// ---------------------------------------------------------------------------
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/restaurar-login.mjs <cpf>
//
// Restaura o SENHA de CADA conta (por CODUSUARIOPS) exatamente como estava no
// backup scripts/.senha-backups/<cpf>.json — inclusive contas que estavam sem
// senha (NULL). Ao final, remove o arquivo de backup.
// ---------------------------------------------------------------------------

import sql from "mssql";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const cpfArg = process.argv[2];
const cpf = (cpfArg || "").replace(/\D/g, "");
if (cpf.length !== 11) {
  console.error(
    "Uso: node --env-file=.env.local scripts/restaurar-login.mjs <cpf>",
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
const backupFile = join(__dirname, ".senha-backups", `${cpf}.json`);

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
  const contas = dados.contas ?? [];
  if (!contas.length) {
    console.error("Backup vazio (nenhuma conta). Nada a restaurar.");
    process.exit(2);
  }

  const pool = await new sql.ConnectionPool(config).connect();
  try {
    let total = 0;
    for (const c of contas) {
      const upd = await pool
        .request()
        .input("env", c.SENHA ?? null)
        .input("cod", c.CODUSUARIOPS)
        .query(`UPDATE SPSUSUARIO SET SENHA = @env WHERE CODUSUARIOPS = @cod`);
      total += upd.rowsAffected[0] ?? 0;
      console.log(
        `  - CODUSUARIOPS ${c.CODUSUARIOPS} (${(c.NOME || "").trim()}) restaurado`,
      );
    }
    console.log(`Hash original restaurado em ${total} conta[s].`);
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
