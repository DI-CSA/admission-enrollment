#!/usr/bin/env node
// ---------------------------------------------------------------------------
// simular-login-aluno.mjs — troca TEMPORÁRIA da senha de um usuário do Portal
// do Aluno (GUSUARIO.SENHA) por uma senha conhecida, para simular o login como
// esse usuário. Faz BACKUP do hash original ANTES de trocar. Irmão de
// simular-login.mjs (que trata SPSUSUARIO, do Processo Seletivo) — contas
// "ANTIGO" (com conta no Portal do Aluno) autenticam no nosso login por
// GUSUARIO, não por SPSUSUARIO (ver app/api/auth/login/route.ts).
// ---------------------------------------------------------------------------
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/simular-login-aluno.mjs <cpf> <senha> [--confirmo-producao]
//
// O que faz:
//   1) Lê o estado atual (CODUSUARIO, STATUS, SENHA) de GUSUARIO pro CPF.
//   2) Salva esse estado em scripts/.senha-backups/aluno-<cpf>.json.
//   3) Grava o envelope Bcrypt da <senha> em GUSUARIO.SENHA.
//
// IMPORTANTE:
//   - Aborta se já existir backup para o CPF. Restaure antes de rodar de novo.
//   - Ao terminar, SEMPRE restaure:
//       node --env-file=.env.local scripts/restaurar-login-aluno.mjs <cpf>
// ---------------------------------------------------------------------------

import sql from "mssql";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PREFIXO_ENVELOPE =
  "#P=False#PT=None#WF=10#HT=SHA256#HA=Bcrypt#V=4.0.2.0#H=";

function gerarEnvelopeSenhaPS(senha) {
  const pre = createHash("sha256").update(senha, "utf8").digest("base64");
  const salt = bcrypt.genSaltSync(10).replace(/^\$2b\$/, "$2a$");
  return PREFIXO_ENVELOPE + bcrypt.hashSync(pre, salt);
}

const args = process.argv.slice(2);
const confirmaProd = args.includes("--confirmo-producao");
const posicionais = args.filter((a) => !a.startsWith("--"));
const [cpfArg, senha] = posicionais;
const cpf = (cpfArg || "").replace(/\D/g, "");
if (cpf.length !== 11 || !senha) {
  console.error(
    "Uso: node --env-file=.env.local scripts/simular-login-aluno.mjs <cpf> <senha> [--confirmo-producao]",
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
const backupDir = join(__dirname, ".senha-backups");
const backupFile = join(backupDir, `aluno-${cpf}.json`);

async function main() {
  if (!config.server || !config.user || !config.password) {
    console.error(
      "TOTVS_DB_SERVER/USER/PASSWORD ausentes. Rode com --env-file=.env.local.",
    );
    process.exit(1);
  }
  console.log(`Banco: ${config.database} @ ${config.server}`);

  const ehProducao = (config.database || "").trim() === "CorporeRM";
  if (ehProducao && !confirmaProd) {
    console.error(
      `\nTRAVA DE PRODUÇÃO: o banco alvo é "${config.database}" (PRODUÇÃO).\n` +
        `Isso trocaria a senha REAL do Portal do Aluno. Para prosseguir, repita\n` +
        `o comando adicionando a flag --confirmo-producao:\n\n` +
        `  node --env-file=.env.local scripts/simular-login-aluno.mjs ${cpf} ${senha} --confirmo-producao\n`,
    );
    process.exit(4);
  }

  if (existsSync(backupFile)) {
    console.error(
      `ABORTADO: já existe backup em ${backupFile}.\n` +
        `Restaure primeiro (scripts/restaurar-login-aluno.mjs ${cpf}) para não ` +
        `perder o hash ORIGINAL.`,
    );
    process.exit(3);
  }

  const pool = await new sql.ConnectionPool(config).connect();
  try {
    const sel = await pool
      .request()
      .input("cpf", cpf)
      .query(
        `SELECT TOP 1 CODUSUARIO, STATUS, SENHA FROM GUSUARIO WHERE CODUSUARIO = @cpf`,
      );
    const conta = sel.recordset?.[0];
    if (!conta) {
      console.error("Nenhuma conta GUSUARIO encontrada para esse CPF.");
      process.exit(2);
    }

    mkdirSync(backupDir, { recursive: true });
    writeFileSync(
      backupFile,
      JSON.stringify(
        { cpf, criadoEm: new Date().toISOString(), conta },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`Backup do hash ORIGINAL salvo: ${backupFile}`);

    const envelope = gerarEnvelopeSenhaPS(senha);
    const upd = await pool
      .request()
      .input("env", envelope)
      .input("cpf", cpf)
      .query(`UPDATE GUSUARIO SET SENHA = @env WHERE CODUSUARIO = @cpf`);
    console.log(
      `Senha "${senha}" gravada em GUSUARIO (${upd.rowsAffected[0]} linha[s]).`,
    );
    console.log(`\n>>> Ao terminar de testar, RESTAURE o hash original:`);
    console.log(
      `    node --env-file=.env.local scripts/restaurar-login-aluno.mjs ${cpf}`,
    );
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
