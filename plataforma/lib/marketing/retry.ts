import "server-only";

// ---------------------------------------------------------------------------
// Retentativa com backoff exponencial para chamadas de Marketing (RD Station)
// ---------------------------------------------------------------------------
//
// Diferente do CRM — que tem crons de conciliação idempotentes se auto-corrigindo
// a cada execução —, os eventos de funil do Marketing são "dispare e esqueça":
// uma falha transitória (rede, 429, 5xx) perderia o evento PARA SEMPRE. Este
// helper reexecuta o `fetch` algumas vezes com backoff exponencial + jitter,
// respeitando `Retry-After` em 429.
//
// NÃO-BLOQUEANTE por contrato: nunca lança. Esgotadas as tentativas, devolve a
// última `Response` (mesmo não-OK) ou `undefined` (erro de rede sem resposta) —
// o chamador decide como logar. Roda in-process no servidor standalone
// (long-running), então as esperas em background sobrevivem à resposta HTTP.

export interface OpcoesRetentativa {
  /** Total de tentativas, incluindo a primeira. Padrão: 3. */
  tentativas?: number;
  /** Atraso base do backoff, em ms. Padrão: 500. */
  baseMs?: number;
  /** Fator do backoff exponencial. Padrão: 2. */
  fator?: number;
  /** Teto de cada espera, em ms. Padrão: 10s. */
  maxMs?: number;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jitter "full": um valor aleatório em [0, ms], para dessincronizar retentativas. */
function jitter(ms: number): number {
  return Math.floor(Math.random() * ms);
}

/** Lê `Retry-After` (segundos ou HTTP-date) e devolve o atraso em ms, ou null. */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const segundos = Number(h);
  if (Number.isFinite(segundos)) return Math.min(segundos * 1000, 60_000);
  const data = Date.parse(h);
  if (!Number.isNaN(data)) return Math.min(Math.max(0, data - Date.now()), 60_000);
  return null;
}

/**
 * `fetch` com retentativa em 429/5xx e erros de rede. Repete somente falhas
 * transitórias — respostas 4xx (exceto 429) são definitivas e retornam de imediato.
 * Nunca lança.
 */
export async function fetchComRetentativa(
  url: string,
  init: RequestInit,
  opcoes: OpcoesRetentativa = {},
): Promise<Response | undefined> {
  const tentativas = opcoes.tentativas ?? 3;
  const baseMs = opcoes.baseMs ?? 500;
  const fator = opcoes.fator ?? 2;
  const maxMs = opcoes.maxMs ?? 10_000;

  let ultima: Response | undefined;
  for (let i = 0; i < tentativas; i++) {
    let transitorio = false;
    try {
      const res = await fetch(url, init);
      // Sucesso ou erro definitivo (4xx exceto 429): não adianta repetir.
      if (res.ok || (res.status !== 429 && res.status < 500)) return res;
      ultima = res;
      transitorio = true;
    } catch {
      ultima = undefined; // erro de rede: sem resposta
      transitorio = true;
    }

    // Se ainda há tentativa seguinte e a falha foi transitória, espera com backoff.
    if (transitorio && i < tentativas - 1) {
      const backoff = Math.min(baseMs * fator ** i, maxMs);
      const espera =
        ultima?.status === 429
          ? Math.min(Math.max(retryAfterMs(ultima) ?? 0, backoff), maxMs)
          : backoff + jitter(backoff);
      await dormir(espera);
    }
  }
  return ultima;
}
