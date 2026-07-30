import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import {
  COOKIE_SESSAO,
  opcoesCookieSessao,
} from "@/lib/totvs/session";
import { obterResponsavelVerbatim } from "@/lib/totvs/queries";

export const dynamic = "force-dynamic";

// BFF — dados de contato do responsável LOGADO (identidade vem SEMPRE da sessão,
// via CODUSUARIOPS; o cliente não informa quem é). Usado para pré-preencher o
// campo de e-mail editável do wizard.
//
// Também atua como HEARTBEAT da sessão: `sessaoDaRequisicao` desliza o TTL no
// servidor e aqui REEMITIMOS o cookie `sid` com max-age renovado. Um ping
// periódico do cliente (ex.: durante o passo de documentos, que fica minutos sem
// requisições) mantém sessão e cookie vivos, evitando o 401 "nao-autenticado".
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao || sessao.codUsuarioPS == null) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  try {
    const resp = await obterResponsavelVerbatim(sessao.codUsuarioPS);
    const res = NextResponse.json(
      {
        ok: true,
        email: resp?.email ?? null,
        nome: resp?.nome ?? null,
        telefone: resp?.telefone1 ?? resp?.telefone2 ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    // Renova o cookie (sessão já foi deslizada no servidor por sessaoDaRequisicao).
    const sid = req.cookies.get(COOKIE_SESSAO)?.value;
    if (sid) res.cookies.set(COOKIE_SESSAO, sid, opcoesCookieSessao());
    return res;
  } catch (e) {
    console.error("[auth/me] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
