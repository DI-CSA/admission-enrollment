// CorporeRM (TOTVS RM) — conexão SQL Server direta, EXCLUSIVAMENTE para LEITURA.
//
// Padrão herdado do projeto AGOS (que já usa este CorporeRM em produção). Aqui serve
// para dados de referência/lookup do Portal de Inscrições: processos seletivos ativos,
// oferta de áreas/cursos, planos de pagamento e verificação de pessoa por CPF — evitando
// captura de payloads no navegador.
//
// REGRAS:
//  - SOMENTE leitura (SELECT). Escrita do candidato (inscrição/boleto) vai pela WebAPI EduPS,
//    que aplica as regras de negócio do PS.
//  - SEMPRE consultas PARAMETRIZADAS (request.input). Nunca interpolar entrada do usuário.

import "server-only";
import sql from "mssql";

if (
  !process.env.TOTVS_DB_SERVER ||
  !process.env.TOTVS_DB_USER ||
  !process.env.TOTVS_DB_PASSWORD
) {
  throw new Error(
    "TOTVS_DB_SERVER, TOTVS_DB_USER e TOTVS_DB_PASSWORD são obrigatórias (.env.local).",
  );
}

const config: sql.config = {
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  requestTimeout: 60000,
  connectionTimeout: 30000,
  pool: { max: 10, min: 1, idleTimeoutMillis: 60000 },
};

let pool: sql.ConnectionPool | null = null;

/** Retorna (ou cria) o pool singleton de conexão com o CorporeRM. */
export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

export type SqlParams = Record<string, string | number | boolean | Date | null>;

/**
 * Executa um SELECT parametrizado e devolve as linhas tipadas.
 * Ex.: query<{ CPF: string }>("SELECT CPF FROM PPESSOA WHERE CGCCFO = @cpf", { cpf })
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: SqlParams = {},
): Promise<T[]> {
  const pool = await getPool();
  const req = pool.request();
  for (const [nome, valor] of Object.entries(params)) {
    req.input(nome, valor);
  }
  const result = await req.query<T>(text);
  return result.recordset ?? [];
}

/**
 * Executa um comando parametrizado de ESCRITA (UPDATE) e devolve o nº de linhas afetadas.
 *
 * EXCEÇÃO CONTROLADA à regra read-only: usado SOMENTE pela definição de senha do PS
 * (lib/totvs/senha-ps.ts), que grava o envelope Bcrypt diretamente em SPSUSUARIO.SENHA.
 * Toda entrada do usuário deve continuar PARAMETRIZADA (@param).
 */
export async function executar(
  text: string,
  params: SqlParams = {},
): Promise<number> {
  const pool = await getPool();
  const req = pool.request();
  for (const [nome, valor] of Object.entries(params)) {
    req.input(nome, valor);
  }
  const result = await req.query(text);
  return result.rowsAffected?.[0] ?? 0;
}

export { sql };
