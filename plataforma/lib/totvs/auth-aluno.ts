// Validação da senha do Portal do Aluno (RM core) — server-only.
//
// O Portal do Aluno/Professor/Biblioteca autentica via OAuth2 "password flow":
//   POST {RM_API_BASE}/connect/token  (application/x-www-form-urlencoded)
//   body: grant_type=password&username=<login>&password=<senha>
//   → 200 com { access_token, ... } quando a credencial é válida.
//
// Usamos isso como GATE de segurança da sincronização de senha: só sincronizamos a
// senha do Processo Seletivo com a senha do aluno DEPOIS de confirmar que a senha do
// aluno é válida. Sem este gate, qualquer senha digitada seria gravada no PS (takeover).

import "server-only";

const RM_API_BASE = process.env.RM_API_BASE ?? "";

/** URL do endpoint OAuth2. Padrão: ${RM_API_BASE}/connect/token. */
function tokenUrl(): string {
  const override = process.env.RM_ALUNO_TOKEN_URL?.trim();
  if (override) return override;
  if (!RM_API_BASE) return "";
  return `${RM_API_BASE.replace(/\/$/, "")}/connect/token`;
}

/**
 * Valida a senha do Portal do Aluno para um dado login (CPF, por padrão).
 * Retorna true se as credenciais forem aceitas (token emitido).
 */
export async function validarSenhaPortalAluno(
  login: string,
  senha: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const url = tokenUrl();
  if (!url) throw new Error("RM_ALUNO_TOKEN_URL/RM_API_BASE não configurado.");

  const corpo = new URLSearchParams({
    grant_type: "password",
    username: login.replace(/\D/g, ""),
    password: senha,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo.toString(),
    signal,
    cache: "no-store",
  });

  if (!res.ok) return false;

  try {
    const data = (await res.json()) as { access_token?: string };
    return (
      typeof data.access_token === "string" && data.access_token.length > 0
    );
  } catch {
    return false;
  }
}
