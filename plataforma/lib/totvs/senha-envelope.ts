import "server-only";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Envelope de senha do RM (Processo Seletivo) — reproduz o formato gravado em
// SPSUSUARIO.SENHA para permitir DEFINIR a senha do PS por gravação direta.
// ---------------------------------------------------------------------------
//
// Formato (engenharia reversa, VERIFICADO contra o par conhecido + login E2E):
//   #P=False#PT=None#WF=10#HT=SHA256#HA=Bcrypt#V=4.0.2.0#H=<bcryptHash>
// onde  bcryptHash = bcrypt( base64(sha256(utf8(senha))), salt_cost10 )
//
// O salt fica EMBUTIDO no próprio hash bcrypt ($2a$10$<salt><hash>). Cada senha
// gerada usa um salt novo e aleatório. O EduPS valida a senha aplicando a mesma
// transformação no login (LoginNovoPortal), então gravar este envelope direto na
// coluna torna a `senha` válida — sem AlterarSenha e sem a senha antiga.

const PREFIXO_ENVELOPE =
  "#P=False#PT=None#WF=10#HT=SHA256#HA=Bcrypt#V=4.0.2.0#H=";
const CUSTO_BCRYPT = 10;

/** Pré-hash exigido pelo RM antes do bcrypt: base64(sha256(utf8(senha))). */
function preHashSha256Base64(senha: string): string {
  return createHash("sha256").update(senha, "utf8").digest("base64");
}

/**
 * Gera o envelope de senha do RM para `senha`, pronto para gravar em
 * SPSUSUARIO.SENHA. Usa um salt novo a cada chamada e força o prefixo `$2a$`
 * (formato observado no RM; para a entrada base64/ASCII é idêntico ao `$2b$`).
 */
export function gerarEnvelopeSenhaPS(senha: string): string {
  const pre = preHashSha256Base64(senha);
  const salt = bcrypt.genSaltSync(CUSTO_BCRYPT).replace(/^\$2b\$/, "$2a$");
  const hash = bcrypt.hashSync(pre, salt);
  return `${PREFIXO_ENVELOPE}${hash}`;
}
