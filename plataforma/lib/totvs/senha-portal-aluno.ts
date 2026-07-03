import "server-only";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { obterUsuarioPortalAluno } from "./queries";

// ---------------------------------------------------------------------------
// Validação da senha do Portal do Aluno DIRETO no banco (GUSUARIO).
// ---------------------------------------------------------------------------
//
// O login self-service do Portal do Aluno usa o CPF como GUSUARIO.CODUSUARIO
// (confirmado no banco de homologação). A senha vive em GUSUARIO.SENHA em dois
// formatos:
//   - envelope Bcrypt do RM ("#P=...#H=$2a$..."), o mesmo de SPSUSUARIO.SENHA —
//     validável localmente com bcrypt.compare(base64(sha256(senha)), hash);
//   - legado de 8 chars do RM antigo (sem salt) — algoritmo ainda NÃO reproduzido.
//
// Validar aqui evita depender do connect/token (404 em homolog) e do formulário
// ASPX. SEGURANÇA: só gravamos/alinhamos a senha do PS (account takeover) quando
// a senha confere no envelope; o legado retorna `naoSuportado` para fallback.

export type FormatoSenhaPortal = "envelope" | "legado" | "vazio" | "outro";

/** Detecta o formato da senha armazenada em GUSUARIO.SENHA. */
export function formatoSenhaPortal(
  armazenado: string | null | undefined,
): FormatoSenhaPortal {
  if (!armazenado) return "vazio";
  if (armazenado.startsWith("#P=") || armazenado.includes("#H=$2"))
    return "envelope";
  if (/^[A-Za-z]{8}$/.test(armazenado)) return "legado";
  return "outro";
}

/** Pré-hash exigido pelo RM antes do bcrypt: base64(sha256(utf8(senha))). */
function preHashSha256Base64(senha: string): string {
  return createHash("sha256").update(senha, "utf8").digest("base64");
}

/** Valida `senha` contra o envelope Bcrypt do RM (#...#H=$2a$...). */
function validarEnvelope(senha: string, armazenado: string): boolean {
  const i = armazenado.indexOf("#H=");
  const hash = i >= 0 ? armazenado.slice(i + 3) : armazenado;
  if (!hash.startsWith("$2")) return false;
  try {
    return bcrypt.compareSync(preHashSha256Base64(senha), hash);
  } catch {
    return false;
  }
}

export interface ResultadoValidacaoPortal {
  /** Conta existe no Portal do Aluno (GUSUARIO com login = CPF). */
  existe: boolean;
  /** Formato da senha armazenada. */
  formato: FormatoSenhaPortal;
  /** Senha confere (confiável apenas quando formato === "envelope"). */
  ok: boolean;
  /** true quando o formato ainda não é validável localmente (legado/outro). */
  naoSuportado: boolean;
}

/**
 * Valida a senha do Portal do Aluno consultando o banco (GUSUARIO), sem depender
 * de endpoints REST/ASPX. Hoje cobre o envelope Bcrypt; o legado de 8 chars do RM
 * antigo ainda não é reproduzido (naoSuportado=true) e exige fallback (ex.: pedir
 * que o usuário redefina a senha no Portal do Aluno, o que a migra para envelope).
 */
export async function validarSenhaPortalAlunoDB(
  cpf: string,
  senha: string,
): Promise<ResultadoValidacaoPortal> {
  const u = await obterUsuarioPortalAluno(cpf);
  if (!u) {
    return { existe: false, formato: "vazio", ok: false, naoSuportado: false };
  }
  const formato = formatoSenhaPortal(u.senha);
  if (formato === "envelope") {
    return {
      existe: true,
      formato,
      ok: validarEnvelope(senha, u.senha),
      naoSuportado: false,
    };
  }
  // Legado/outro: conta existe, mas não conseguimos validar localmente ainda.
  return { existe: true, formato, ok: false, naoSuportado: true };
}
