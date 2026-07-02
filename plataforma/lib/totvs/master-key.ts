import "server-only";
import { timingSafeEqual } from "node:crypto";

// Chave-mestra de autenticação (SOMENTE PARA TESTE, inclusive em produção).
//
// Quando `AUTH_MASTER_KEY` está definida (não vazia), o login aceita QUALQUER CPF
// já cadastrado no PS usando essa senha única — sem validar a senha real e SEM
// gravar/alterar nenhuma senha no banco. A sessão criada NÃO tem cookie de sessão
// do RM (rmCookie vazio): serve para exercitar o painel e o fluxo de inscrição
// (a NovaInscricao do RM é anônima), mas chamadas "owner-scoped" do RM que exigem
// o cookie (ex.: 2ª via de boleto) não funcionam nesse modo.
//
// É um BACKDOOR: mantenha a variável VAZIA em operação normal. Ative apenas em
// janelas de teste controladas e desative logo depois.

/** A chave-mestra está ativa? (env definida e não vazia) */
export function masterKeyAtiva(): boolean {
  return (process.env.AUTH_MASTER_KEY ?? "").length > 0;
}

/**
 * A senha informada corresponde à chave-mestra? Comparação em tempo constante
 * para não vazar o segredo por timing. Só retorna true se a chave estiver ativa.
 */
export function senhaEhMasterKey(senha: string): boolean {
  const chave = process.env.AUTH_MASTER_KEY ?? "";
  if (chave.length === 0) return false;
  const a = Buffer.from(senha, "utf8");
  const b = Buffer.from(chave, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
