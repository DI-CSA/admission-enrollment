// Aplica o CONTRATO das tabelas de visita no Postgres — voltado ao banco de DEV
// (localhost:6510). Em PRODUÇÃO quem cria/possui essas tabelas é a AGOS; não rode
// aqui contra a base de produção depois que a AGOS assumir o schema.
//
// Uso: pnpm visitas:migrate   (usa DATABASE_URL do .env.local ativo)
// Idempotente: o schema.sql usa CREATE ... IF NOT EXISTS.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

// Remove a query string Prisma (?schema=&search_path=) que o driver `pg` não entende.
const conn = (
  process.env.VISITAS_DATABASE_URL ||
  process.env.DATABASE_URL ||
  ""
).split("?")[0];
if (!conn) {
  console.error("✗ DATABASE_URL ausente no .env.local ativo.");
  process.exit(1);
}

const aqui = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(aqui, "..", "lib", "agenda", "schema.sql");
const sql = readFileSync(sqlPath, "utf8");

const ssl =
  (process.env.VISITAS_DB_SSL ?? "").toLowerCase() === "true" ||
  process.env.VISITAS_DB_SSL === "1"
    ? { rejectUnauthorized: false }
    : undefined;

const client = new pg.Client({ connectionString: conn, ssl });

try {
  await client.connect();
  await client.query(sql);
  console.log("✓ Schema de visitas aplicado com sucesso.");
} catch (e) {
  console.error("✗ Falha ao aplicar o schema:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
