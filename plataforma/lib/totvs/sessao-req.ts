import "server-only";
import { NextRequest } from "next/server";
import {
  COOKIE_SESSAO,
  obterSessao,
  type SessaoBFF,
} from "@/lib/totvs/session";

/**
 * Recupera a sessão autenticada do BFF a partir do cookie `sid` da requisição.
 * Retorna null se não houver sessão válida — as rotas devem responder 401.
 */
export function sessaoDaRequisicao(req: NextRequest): SessaoBFF | null {
  const sid = req.cookies.get(COOKIE_SESSAO)?.value;
  return obterSessao(sid);
}
