// Cliente genérico para a WebAPI do TOTVS RM — uso exclusivamente server-side (BFF).
//
// Infra compartilhada da plataforma: aponta para QUALQUER WebAPI do RM via RM_API_BASE.
// Hoje serve ao Portal de Inscrições (TOTVSProcessoSeletivo); amanhã, aos portais do
// aluno/professor (RM.Edu.WebAPI), reaproveitando o mesmo padrão de sessão por cookie.
//
// Em desenvolvimento local, RM_API_BASE pode apontar diretamente para o servidor RM
// (ex.: http://35.247.225.83/FrameHTML/RM/API), já que a máquina tem acesso direto.

import "server-only";

const RM_API_BASE = process.env.RM_API_BASE ?? "";

export interface RmRequestOptions {
  /** Sufixo da WebAPI, ex.: "TOTVSProcessoSeletivo". Concatenado a RM_API_BASE. */
  webapi?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Cookie de sessão do RM, quando a chamada exige usuário autenticado. */
  cookie?: string;
  signal?: AbortSignal;
}

export async function rmFetch(
  path: string,
  opts: RmRequestOptions = {},
): Promise<Response> {
  if (!RM_API_BASE) {
    throw new Error("RM_API_BASE não configurado (.env.local).");
  }
  const base = opts.webapi ? `${RM_API_BASE}/${opts.webapi}` : RM_API_BASE;
  const url = `${base}/${path.replace(/^\//, "")}`;

  return fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    cache: "no-store",
  });
}

/** Codifica a senha no formato esperado pelo RM: base64(encodeURIComponent(senha)). */
export function encodeSenhaRm(senha: string): string {
  return Buffer.from(encodeURIComponent(senha)).toString("base64");
}
