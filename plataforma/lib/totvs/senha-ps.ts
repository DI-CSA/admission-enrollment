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
