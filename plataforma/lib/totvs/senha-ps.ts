import "server-only";
import { executar, query } from "./db";
import { gerarEnvelopeSenhaPS } from "./senha-envelope";

// ---------------------------------------------------------------------------
// Definição da senha do Processo Seletivo (SPSUSUARIO.SENHA) por gravação direta.
// ---------------------------------------------------------------------------
//
// Substitui o antigo "truque" (injeção de hash de referência + AlterarSenha): como
// reproduzimos o envelope Bcrypt do RM (lib/totvs/senha-envelope.ts), basta gravar
// a senha desejada diretamente na coluna — o EduPS valida com a mesma transformação
// no login. Sem senha antiga, sem cookie, sem AlterarSenha.
//
// SEGURANÇA: para responsáveis de aluno (ANTIGO), a senha SÓ pode ser gravada após
// validação no Portal do Aluno (lib/totvs/senha-portal-aluno.ts). Caso contrário, gravar
// uma senha arbitrária seria account takeover.

/**
 * Grava `senha` como senha do PS para TODAS as contas (SPSUSUARIO) do CPF.
 * Retorna o nº de linhas atualizadas (0 = o CPF ainda não tem conta no PS).
 */
export async function definirSenhaPSporCpf(
  cpf: string,
  senha: string,
): Promise<number> {
  const digitos = (cpf || "").replace(/\D/g, "");
  if (digitos.length !== 11) return 0;
  const envelope = gerarEnvelopeSenhaPS(senha);
  return executar(
    `UPDATE SPSUSUARIO SET SENHA = @env
     WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf`,
    { env: envelope, cpf: digitos },
  );
}

// ---------------------------------------------------------------------------
// Preservação da senha do responsável na inscrição de candidato (fluxo logado).
// ---------------------------------------------------------------------------
//
// O NovaInscricao do RM REGRAVA a coluna SENHA do responsável mesmo quando não a
// enviamos no payload — o que corrompe o login de um usuário de PS que já existe
// (comprovado via log antes/depois). Para blindar isso, o fluxo logado captura o
// envelope atual ANTES da inscrição e o restaura DEPOIS, garantindo que inscrever
// um candidato nunca altere a senha do responsável.

/** Lê o envelope de senha (SPSUSUARIO.SENHA) atual do CPF; null se não houver. */
export async function lerEnvelopeSenhaPSporCpf(
  cpf: string,
): Promise<string | null> {
  const digitos = (cpf || "").replace(/\D/g, "");
  if (digitos.length !== 11) return null;
  const rows = await query<{ SENHA: string | null }>(
    `SELECT TOP 1 SENHA FROM SPSUSUARIO
     WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf
       AND NULLIF(LTRIM(RTRIM(SENHA)), '') IS NOT NULL
     ORDER BY CODUSUARIOPS DESC`,
    { cpf: digitos },
  );
  return rows[0]?.SENHA ?? null;
}

/**
 * Restaura o envelope de senha (verbatim) para TODAS as contas do CPF. Usado para
 * desfazer a regravação que o RM faz na inscrição. Retorna o nº de linhas.
 */
export async function restaurarEnvelopeSenhaPSporCpf(
  cpf: string,
  envelope: string,
): Promise<number> {
  const digitos = (cpf || "").replace(/\D/g, "");
  if (digitos.length !== 11 || !envelope) return 0;
  return executar(
    `UPDATE SPSUSUARIO SET SENHA = @env
     WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf`,
    { env: envelope, cpf: digitos },
  );
}

// ---------------------------------------------------------------------------
// Alinhamento da senha do Portal do Aluno (GUSUARIO) — reconciliação pós-matrícula.
// ---------------------------------------------------------------------------
//
// Ao efetivar a matrícula, o RM PROVISIONA uma conta no Portal do Aluno (GUSUARIO
// com login = CPF) com uma senha PRÓPRIA (gerada por ele), diferente da que o
// usuário usa no Processo Seletivo. Como o nosso login prefere o Portal do Aluno
// quando a conta existe, isso quebra o acesso do usuário com a senha que ele já
// conhecia. Para manter UMA senha nos dois cofres, gravamos o mesmo envelope em
// GUSUARIO logo após a matrícula. O UPDATE só afeta a conta se ela existir
// (CODUSUARIO = CPF); se não houver GUSUARIO, não faz nada.

/**
 * Grava `senha` (mesmo envelope Bcrypt do PS) na conta do Portal do Aluno cujo
 * login é o CPF. Retorna o nº de linhas atualizadas (0 = o CPF não tem GUSUARIO).
 */
export async function definirSenhaPortalAlunoPorCpf(
  cpf: string,
  senha: string,
): Promise<number> {
  const digitos = (cpf || "").replace(/\D/g, "");
  if (digitos.length !== 11) return 0;
  const envelope = gerarEnvelopeSenhaPS(senha);
  return executar(`UPDATE GUSUARIO SET SENHA = @env WHERE CODUSUARIO = @cpf`, {
    env: envelope,
    cpf: digitos,
  });
}

/**
 * Reconcilia a senha nos DOIS cofres (Processo Seletivo e Portal do Aluno) para o
 * CPF, deixando ambos com a mesma senha `senha`. Idempotente. Best-effort do lado
 * do chamador: uma falha aqui não deve derrubar a operação principal (matrícula).
 * Retorna quantas linhas foram atualizadas em cada cofre.
 */
export async function reconciliarSenhaPosMatricula(
  cpf: string,
  senha: string,
): Promise<{ ps: number; portalAluno: number }> {
  const ps = await definirSenhaPSporCpf(cpf, senha);
  const portalAluno = await definirSenhaPortalAlunoPorCpf(cpf, senha);
  return { ps, portalAluno };
}
