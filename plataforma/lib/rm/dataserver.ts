// Cliente para os DataServers do TOTVS RM (RM.Host) — uso exclusivamente server-side.
//
// Diferente de lib/rm/client.ts (que fala com a WebAPI EduPS para AÇÕES TRANSACIONAIS
// do candidato), este módulo serve para LEITURA / dados de referência via REST T-Talk:
//   - autentica em /api/connect/token (JWT de serviço, credenciais de staff)
//   - consome o RMSRestDataServer (GetAll/Get/Schema) de qualquer DataServer do RM
//
// Objetivo: obter PS ativos, oferta de cursos, planos de pagamento e fazer lookup de
// pessoa (CPF já cadastrado) SEM precisar capturar payloads no navegador.
//
// NUNCA hardcode credenciais — tudo vem do ambiente (.env.local).

import "server-only";

const HOST_BASE = (process.env.RM_HOST_BASE ?? "").replace(/\/$/, "");
const USER = process.env.RM_HOST_USER ?? "";
const PASSWORD = process.env.RM_HOST_PASSWORD ?? "";
const COD_COLIGADA = process.env.RM_COD_COLIGADA ?? "1";

/** Raiz do serviço RMSRestDataServer. Sobrescreva via RM_RMSREST_BASE se o seu host expuser noutro caminho. */
const RMSREST_BASE =
  process.env.RM_RMSREST_BASE ??
  (HOST_BASE ? `${HOST_BASE}/RMSRestDataServer` : "");

function assertConfig(): void {
  if (!HOST_BASE) throw new Error("RM_HOST_BASE não configurado (.env.local).");
  if (!USER || !PASSWORD)
    throw new Error(
      "RM_HOST_USER / RM_HOST_PASSWORD não configurados (.env.local).",
    );
}

// --- Autenticação (JWT de serviço, com cache em memória) ---------------------------

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}
let tokenCache: TokenCache | null = null;

/** Obtém (e cacheia) o Bearer token de serviço via /api/connect/token. */
export async function getServiceToken(signal?: AbortSignal): Promise<string> {
  assertConfig();
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }

  const res = await fetch(`${HOST_BASE}/api/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: USER, password: PASSWORD }),
    signal,
    cache: "no-store",
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    throw new Error(
      `Falha ao autenticar no RM.Host (${res.status}): ${detalhe.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as {
    access_token?: string;
    token?: string;
    expires_in?: number;
  };
  const token = data.access_token ?? data.token;
  if (!token) throw new Error("Token não retornado por /api/connect/token.");

  const ttlSeg = data.expires_in ?? 3600;
  tokenCache = { token, expiresAt: Date.now() + ttlSeg * 1000 };
  return token;
}

// --- Requisição autenticada genérica ----------------------------------------------

async function authedFetch(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  const token = await getServiceToken(signal);
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      CodColigada: COD_COLIGADA,
    },
    signal,
    cache: "no-store",
  });
}

async function jsonOrThrow(res: Response, contexto: string): Promise<unknown> {
  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    throw new Error(
      `${contexto} falhou (${res.status}): ${detalhe.slice(0, 300)}`,
    );
  }
  return res.json();
}

// --- API de DataServers ------------------------------------------------------------

export interface GetAllParams {
  /** Filtro RM (cláusula WHERE), ex.: "CODCOLIGADA=1 AND IDPS=10". */
  filter?: string;
  start?: number;
  limit?: number;
  signal?: AbortSignal;
}

/** Lista registros de um DataServer (GetAll). */
export async function dataServerGetAll(
  dataServerName: string,
  { filter = "1=1", start = 0, limit = 100, signal }: GetAllParams = {},
): Promise<unknown> {
  const qs = new URLSearchParams({
    start: String(start),
    limit: String(limit),
    filter,
  });
  const res = await authedFetch(
    `${RMSREST_BASE}/rest/${dataServerName}?${qs}`,
    signal,
  );
  return jsonOrThrow(res, `GetAll ${dataServerName}`);
}

/** Retorna um único registro de um DataServer pela chave (Get). */
export async function dataServerGet(
  dataServerName: string,
  id: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await authedFetch(
    `${RMSREST_BASE}/rest/${dataServerName}/${encodeURIComponent(id)}`,
    signal,
  );
  return jsonOrThrow(res, `Get ${dataServerName}/${id}`);
}

/** Lista os serviços REST disponíveis (GetAvailableServices). Útil para descoberta. */
export async function listAvailableServices(
  name = "",
  start = 0,
  limit = 100,
  signal?: AbortSignal,
): Promise<unknown> {
  const qs = new URLSearchParams({
    name,
    start: String(start),
    limit: String(limit),
  });
  const res = await authedFetch(
    `${RMSREST_BASE}/getavailableservices?${qs}`,
    signal,
  );
  return jsonOrThrow(res, "GetAvailableServices");
}

/** Retorna o schema (GetExternalGrammar) dos dados de um DataServer. */
export async function getServiceSchema(
  serviceName: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await authedFetch(
    `${RMSREST_BASE}/service/${serviceName}/schema`,
    signal,
  );
  return jsonOrThrow(res, `Schema ${serviceName}`);
}
