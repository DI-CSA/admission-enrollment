// Autenticação do responsável na WebAPI EduPS (TOTVSProcessoSeletivo) — server-only.
//
// A ESCRITA/AUTENTICAÇÃO sempre passa pela EduPS (preserva as regras do PS). A leitura
// de reconhecimento (existe cadastro?) é feita por SQL; aqui validamos a SENHA e
// capturamos o cookie de sessão do RM para chamadas autenticadas seguintes.
//
// Endpoints (confirmados no portal TOTVS, login.factory.js):
//   POST  .../TOTVSProcessoSeletivo/v1/Login        body: { CodColigada, CodFilial, IdPs,
//          TipoIdentificacao, Login, Senha(base64), GuidsReservaVaga }
//          → { data: { CODUSUARIOPS, NOME, TOKEN, LOGADOSUCESSO }, messages, HttpStatusCode }
//   POST  .../TOTVSProcessoSeletivo/RecuperarSenha  query: login, tipoIdentificacao,
//          codColigada, codFilial, dataNascimento, idPS

import "server-only";
import { rmFetch, encodeSenhaRm } from "@/lib/rm/client";

const WEBAPI = "TOTVSProcessoSeletivo";
const COD_COLIGADA = Number(process.env.RM_COD_COLIGADA) || 1;
const COD_FILIAL = Number(process.env.RM_COD_FILIAL) || 1;

/** Tipo de identificação aceito pelo login do PS. */
export enum TipoIdentificacao {
  CPF = 0,
  RG = 1,
  Usuario = 2,
  Email = 3,
}

export interface LoginResultado {
  logado: boolean;
  codUsuarioPS: number | null;
  /** Cookie de sessão do RM, para replay em chamadas autenticadas (nunca vai ao browser). */
  rmCookie: string | null;
}

interface LoginRespostaRM {
  // O RM aninha o resultado em `data` (LOGADOSUCESSO/CODUSUARIOPS ficam aqui dentro).
  data?: {
    LOGADOSUCESSO?: boolean;
    CODUSUARIOPS?: number;
    NOME?: string;
    TOKEN?: string;
  };
}

/** Junta os Set-Cookie da resposta em um header Cookie reutilizável. */
function extrairCookie(res: Response): string | null {
  const cookies = res.headers.getSetCookie?.() ?? [];
  if (cookies.length === 0) return null;
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

/**
 * Autentica o responsável por CPF + senha (ou data de nascimento dd/MM/yyyy, que o RM
 * também aceita no mesmo campo). A senha é codificada em base64 antes do tráfego.
 */
export async function loginResponsavel(params: {
  cpf: string;
  senha: string;
  idps: number;
  tipoIdentificacao?: TipoIdentificacao;
}): Promise<LoginResultado> {
  const model = {
    CodColigada: COD_COLIGADA,
    CodFilial: COD_FILIAL,
    IdPs: params.idps,
    TipoIdentificacao: params.tipoIdentificacao ?? TipoIdentificacao.CPF,
    Login: params.cpf.replace(/\D/g, ""),
    Senha: encodeSenhaRm(params.senha),
    // O RM espera uma STRING (guids separados por ";"), não um array. Enviar []
    // faz o servidor estourar NullReferenceException no Split(';').
    GuidsReservaVaga: "",
  };

  const res = await rmFetch("v1/Login", {
    webapi: WEBAPI,
    method: "POST",
    body: model,
  });

  if (!res.ok) {
    return { logado: false, codUsuarioPS: null, rmCookie: null };
  }

  let data: LoginRespostaRM;
  try {
    data = (await res.json()) as LoginRespostaRM;
  } catch {
    return { logado: false, codUsuarioPS: null, rmCookie: null };
  }

  const logado = data.data?.LOGADOSUCESSO === true;
  return {
    logado,
    codUsuarioPS: logado ? (data.data?.CODUSUARIOPS ?? null) : null,
    rmCookie: logado ? extrairCookie(res) : null,
  };
}

/**
 * Dispara a recuperação de senha do RM (envio de e-mail), validando por data de
 * nascimento (dd/MM/yyyy). Retorna apenas se a requisição foi aceita pelo RM.
 */
export async function recuperarSenha(params: {
  cpf: string;
  dataNascimento: string; // dd/MM/yyyy
  idps: number;
  tipoIdentificacao?: TipoIdentificacao;
}): Promise<boolean> {
  const qs = new URLSearchParams({
    login: params.cpf.replace(/\D/g, ""),
    tipoIdentificacao: String(
      params.tipoIdentificacao ?? TipoIdentificacao.CPF,
    ),
    codColigada: String(COD_COLIGADA),
    codFilial: String(COD_FILIAL),
    dataNascimento: params.dataNascimento,
    idPS: String(params.idps),
  });

  const res = await rmFetch(`RecuperarSenha?${qs.toString()}`, {
    webapi: WEBAPI,
    method: "POST",
    body: {},
  });

  return res.ok;
}
