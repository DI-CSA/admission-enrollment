import "server-only";
import { randomUUID } from "node:crypto";
import { loginResponsavel } from "./auth";

// Store de sessão do BFF (em memória — 1 instância, conforme a arquitetura).
// Mapeia um id de sessão opaco (cookie httpOnly `sid`) ao cookie de sessão do RM,
// que NUNCA é exposto ao browser. Para múltiplas instâncias, trocar por Redis.

export const COOKIE_SESSAO = "sid";
const TTL_MS = 30 * 60 * 1000; // 30 min

export interface SessaoBFF {
  rmCookie: string;
  /** PS ao qual o `rmCookie` atual está escopado (o RM amarra a sessão a UM idps). */
  idps: number;
  /**
   * Credenciais do PS para RE-LOGIN sob demanda em outro idps. O RM mantém UMA
   * sessão ativa por usuário e `Inscricao/Comprovante`/`InfoBoletoInscricao`
   * dependem do PS da sessão, então para emitir de um candidato de OUTRO PS é
   * preciso re-autenticar naquele idps. Ficam só em memória do servidor, nunca
   * vão ao browser. Ausente na sessão de chave-mestra.
   */
  credenciais?: { cpf: string; senha: string; tipoIdentificacao?: number };
  codUsuarioPS: number | null;
  /** Sessão criada via chave-mestra de teste (sem cookie do RM). */
  master?: boolean;
  criadaEm: number;
  expiraEm: number;
}

const sessoes = new Map<string, SessaoBFF>();

function limparExpiradas(agora: number) {
  for (const [sid, s] of sessoes) {
    if (s.expiraEm <= agora) sessoes.delete(sid);
  }
}

/** Cria uma sessão e devolve o id opaco a guardar no cookie httpOnly. */
export function criarSessao(dados: {
  rmCookie: string;
  credenciais?: { cpf: string; senha: string; tipoIdentificacao?: number };
  codUsuarioPS: number | null;
  idps: number;
  master?: boolean;
}): string {
  const agora = Date.now();
  limparExpiradas(agora);
  const sid = randomUUID();
  sessoes.set(sid, {
    rmCookie: dados.rmCookie,
    idps: dados.idps,
    credenciais: dados.credenciais,
    codUsuarioPS: dados.codUsuarioPS,
    master: dados.master,
    criadaEm: agora,
    expiraEm: agora + TTL_MS,
  });
  return sid;
}

/**
 * Garante que a sessão do RM esteja escopada ao `idps` pedido e devolve o cookie
 * válido para ele. Como o RM mantém UMA sessão ativa por usuário, quando o idps
 * pedido difere do atual re-autenticamos com as credenciais guardadas e
 * atualizamos a sessão (o cookie anterior é invalidado pelo próprio RM). Sem
 * credenciais (ex.: chave-mestra) ou idps inválido/igual, devolve o cookie atual.
 */
export async function garantirSessaoNoIdps(
  sessao: SessaoBFF,
  idps: number,
): Promise<string> {
  if (!idps || idps === sessao.idps || !sessao.credenciais) {
    return sessao.rmCookie;
  }
  const r = await loginResponsavel({
    cpf: sessao.credenciais.cpf,
    senha: sessao.credenciais.senha,
    idps,
    tipoIdentificacao: sessao.credenciais.tipoIdentificacao,
  });
  if (r.logado && r.rmCookie) {
    sessao.rmCookie = r.rmCookie;
    sessao.idps = idps;
    return r.rmCookie;
  }
  // Re-login falhou: mantém o cookie atual (a chamada provavelmente retornará a
  // mensagem de "não pertence ao usuário logado", tratada pela rota).
  return sessao.rmCookie;
}

/** Recupera uma sessão válida (renova a expiração); null se ausente/expirada. */
export function obterSessao(sid: string | undefined): SessaoBFF | null {
  if (!sid) return null;
  const s = sessoes.get(sid);
  if (!s) return null;
  const agora = Date.now();
  if (s.expiraEm <= agora) {
    sessoes.delete(sid);
    return null;
  }
  s.expiraEm = agora + TTL_MS; // sliding
  return s;
}

/** Encerra a sessão (logout). */
export function encerrarSessao(sid: string | undefined): void {
  if (sid) sessoes.delete(sid);
}
