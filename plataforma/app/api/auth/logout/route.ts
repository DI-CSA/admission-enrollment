import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESSAO, encerrarSessao } from "@/lib/totvs/session";

// BFF — encerra a sessão do responsável: remove a sessão server-side (cookie do RM)
// e apaga o cookie httpOnly `sid` do browser. Idempotente: sem sessão, responde ok.
export async function POST(req: NextRequest) {
  const sid = req.cookies.get(COOKIE_SESSAO)?.value;
  encerrarSessao(sid);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
