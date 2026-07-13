#!/usr/bin/env node
// ---------------------------------------------------------------------------
// simular-login.mjs — troca TEMPORÁRIA da senha de um usuário do Processo
// Seletivo (SPSUSUARIO.SENHA) por uma senha conhecida, para simular o uso do
// sistema como esse usuário. Faz BACKUP do hash original ANTES de trocar.
// ---------------------------------------------------------------------------
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/simular-login.mjs <cpf> <senha>
//
// Ex.: node --env-file=.env.local scripts/simular-login.mjs 04812275636 asc321
//
// O que faz:
//   1) Lê o estado atual (CODUSUARIOPS, NOME, SENHA) de TODAS as contas do CPF.
//   2) Salva esse estado em scripts/.senha-backups/<cpf>.json (o HASH ORIGINAL
//      fica guardado nesse arquivo, por conta).
//   3) Grava o envelope Bcrypt da <senha> em TODAS as contas do CPF, tornando o
//      login válido com essa senha conhecida.
//
// IMPORTANTE:
//   - O envelope é IDÊNTICO ao gerado por lib/totvs/senha-envelope.ts
//     (base64(sha256(senha)) -> bcrypt custo 10 -> prefixo #P=False...#H=).
//   - Aborta se já existir backup para o CPF (para NÃO sobrescrever o hash
//     original com o hash temporário). Restaure antes de rodar de novo.
//   - Ao terminar, SEMPRE restaure:
//       node --env-file=.env.local scripts/restaurar-login.mjs <cpf>
//   - Enquanto a senha estiver trocada, o usuário real NÃO consegue logar com a
//     senha dele e a conta está com uma senha fraca/conhecida. Prefira um CPF de
//     TESTE ou o ambiente de homologação em vez de um usuário real em produção.
// ---------------------------------------------------------------------------

import sql from "mssql";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PREFIXO_ENVELOPE =
  "#P=False#PT=None#WF=10#HT=SHA256#HA=Bcrypt#V=4.0.2.0#H=";

/** Reproduz gerarEnvelopeSenhaPS de lib/totvs/senha-envelope.ts. */
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
    "Uso: node --env-file=.env.local scripts/simular-login.mjs <cpf> <senha> [--confirmo-producao]",
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
const backupFile = join(backupDir, `${cpf}.json`);

async function main() {
  if (!config.server || !config.user || !config.password) {
    console.error(
      "TOTVS_DB_SERVER/USER/PASSWORD ausentes. Rode com --env-file=.env.local.",
    );
    process.exit(1);
  }
  console.log(`Banco: ${config.database} @ ${config.server}`);

  // Trava de PRODUÇÃO: o banco de produção é "CorporeRM" (homolog = "HomologacaoWEB").
  // Trocar a senha de um usuário REAL exige confirmação explícita --confirmo-producao.
  const ehProducao = (config.database || "").trim() === "CorporeRM";
  if (ehProducao && !confirmaProd) {
    console.error(
      `\nTRAVA DE PRODUÇÃO: o banco alvo é "${config.database}" (PRODUÇÃO).\n` +
        `Isso trocaria a senha de um usuário REAL. Para prosseguir, repita o\n` +
        `comando adicionando a flag --confirmo-producao:\n\n` +
        `  node --env-file=.env.local scripts/simular-login.mjs ${cpf} ${senha} --confirmo-producao\n`,
    );
    process.exit(4);
  }

  if (existsSync(backupFile)) {
    console.error(
      `ABORTADO: já existe backup em ${backupFile}.\n` +
        `Restaure primeiro (scripts/restaurar-login.mjs ${cpf}) para não perder ` +
        `o hash ORIGINAL — rodar de novo salvaria o hash temporário por cima.`,
    );
    process.exit(3);
  }

  const pool = await new sql.ConnectionPool(config).connect();
  try {
    const sel = await pool
      .request()
      .input("cpf", cpf)
      .query(
        `SELECT CODUSUARIOPS, NOME, SENHA FROM SPSUSUARIO
         WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF,''),'.',''),'-',''),' ','') = @cpf`,
      );
    const contas = sel.recordset ?? [];
    if (!contas.length) {
      console.error("Nenhuma conta SPSUSUARIO encontrada para esse CPF.");
      process.exit(2);
    }

    mkdirSync(backupDir, { recursive: true });
    writeFileSync(
      backupFile,
      JSON.stringify(
        { cpf, criadoEm: new Date().toISOString(), contas },
        null,
        2,
      ),
      "utf8",
    );
    console.log(
      `Backup do hash ORIGINAL salvo: ${backupFile} (${contas.length} conta[s])`,
    );

    const envelope = gerarEnvelopeSenhaPS(senha);
    const upd = await pool
      .request()
      .input("env", envelope)
      .input("cpf", cpf)
      .query(
        `UPDATE SPSUSUARIO SET SENHA = @env
         WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF,''),'.',''),'-',''),' ','') = @cpf`,
      );
    console.log(`Senha "${senha}" gravada em ${upd.rowsAffected[0]} conta[s].`);
    for (const c of contas) {
      console.log(
        `  - CODUSUARIOPS ${c.CODUSUARIOPS} (${(c.NOME || "").trim()})`,
      );
    }
    console.log(`\n>>> Ao terminar de testar, RESTAURE o hash original:`);
    console.log(
      `    node --env-file=.env.local scripts/restaurar-login.mjs ${cpf}`,
    );
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
