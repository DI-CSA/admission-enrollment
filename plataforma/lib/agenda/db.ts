// Banco COMPARTILHADO com a plataforma AGOS (Cloud SQL PostgreSQL, banco `csa`,
// schema `agos`) — dados que NÃO pertencem ao TOTVS RM. Aqui: agendamento de visitas.
//
// Divisão de responsabilidades: a ADMINISTRAÇÃO das visitas (criar horários,
// presença, gestão) é da AGOS. Este portal apenas LÊ os horários disponíveis e
// GRAVA a reserva do visitante nesse mesmo schema. O RM segue autoritativo só para
// inscrição/matrícula.
//
// Conexão via DATABASE_URL (a mesma string usada pela AGOS). O driver `pg` NÃO
// interpreta os parâmetros `?schema=`/`search_path=` da URL (isso é convenção do
// Prisma) — então removemos a query string e aplicamos o schema via `options`.
//
// REGRA: sempre consultas PARAMETRIZADAS ($1, $2, ...). Nunca interpolar entrada
// do usuário no texto do SQL.

import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

// Aceita DATABASE_URL (compartilhada com a AGOS) e, se quiser separar, VISITAS_DATABASE_URL.
const CONN_BRUTA =
  process.env.VISITAS_DATABASE_URL || process.env.DATABASE_URL || "";
// Remove a query string Prisma (?schema=agos&search_path=...) que o `pg` não entende.
const CONN = CONN_BRUTA ? CONN_BRUTA.split("?")[0] : "";

// Schema onde as tabelas de visita vivem (compartilhado com a AGOS). Padrão: agos.
export const SCHEMA = (process.env.VISITAS_DB_SCHEMA || "agos").replace(
  /[^a-zA-Z0-9_]/g,
  "",
);

// SSL: Cloud SQL aceita TLS. Em IP privado dentro da VPC o SSL pode ser dispensado;
// deixamos configurável por VISITAS_DB_SSL (default: desligado p/ IP privado/local).
const usarSsl =
  (process.env.VISITAS_DB_SSL ?? "").toLowerCase() === "true" ||
  process.env.VISITAS_DB_SSL === "1";

// Singleton em globalThis: evita recriar o pool a cada hot-reload/rebuild do Next
// (o mesmo motivo do store de sessão em lib/totvs/session.ts).
const g = globalThis as typeof globalThis & { __visitasPool?: Pool };

/** Retorna (ou cria) o pool singleton de conexão com o Postgres de visitas. */
export function getPool(): Pool {
  if (!CONN) {
    throw new Error("DATABASE_URL não configurado (.env.local).");
  }
  if (g.__visitasPool) return g.__visitasPool;
  g.__visitasPool = new Pool({
    connectionString: CONN,
    ssl: usarSsl ? { rejectUnauthorized: false } : undefined,
    // Aplica o search_path a TODA conexão do pool (equivale ao PGOPTIONS do libpq).
    options: `-c search_path=${SCHEMA},public`,
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 30_000,
  });
  return g.__visitasPool;
}

/** Indica se o store está configurado (para as rotas degradarem com elegância). */
export function visitasHabilitado(): boolean {
  return Boolean(CONN);
}

/**
 * Executa uma query parametrizada e devolve as linhas tipadas.
 * Ex.: query<{ id: string }>("SELECT id FROM visita_slot WHERE ativo = $1", [true])
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

/**
 * Executa uma função dentro de uma TRANSAÇÃO (BEGIN/COMMIT, ROLLBACK em erro).
 * Usado pelo agendamento para checar capacidade e inserir atomicamente.
 */
export async function comTransacao<T>(
  fn: (cliente: PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await getPool().connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await fn(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (erro) {
    try {
      await cliente.query("ROLLBACK");
    } catch {
      /* ignora falha de rollback */
    }
    throw erro;
  } finally {
    cliente.release();
  }
}
