import { NextRequest, NextResponse } from "next/server";
import { cpfValido } from "@/lib/cpf";
import { consumir } from "@/lib/rate-limit";
import { loginResponsavel } from "@/lib/totvs/auth";
import { validarSenhaPortalAlunoDB } from "@/lib/totvs/senha-portal-aluno";
import { definirSenhaPSporCpf } from "@/lib/totvs/senha-ps";
import { resolverCodUsuarioPSporCpf } from "@/lib/totvs/queries";
import { masterKeyAtiva, senhaEhMasterKey } from "@/lib/totvs/master-key";
import { criarSessao, COOKIE_SESSAO } from "@/lib/totvs/session";

// BFF — autenticação do responsável (EduPS). Em caso de sucesso, guarda o cookie de
// sessão do RM server-side e devolve ao browser apenas um cookie httpOnly opaco (`sid`).
//
// Dois fluxos, definidos pela existência de conta no Portal do Aluno (GUSUARIO):
//  - ANTIGO (tem conta no Portal do Aluno): a senha é a do Portal do Aluno. Validamos
//    DIRETO no banco (GUSUARIO.SENHA, envelope Bcrypt) e re-gravamos a senha do PS igual
//    a ela a cada login — o usuário gerencia a senha sempre pelo Portal do Aluno.
//  - NOVO (sem conta no Portal do Aluno): autentica direto na base do PS, com senha
//    própria do PS.

const LIMITE = 8; // tentativas de login
const JANELA_MS = 60_000; // por minuto, por IP

function ipDe(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

interface LoginBody {
  cpf?: string;
  senha?: string;
  idps?: number;
}

export async function POST(req: NextRequest) {
  const limite = consumir(`login:${ipDe(req)}`, LIMITE, JANELA_MS);
  if (!limite.permitido) {
    const retryAfter = Math.ceil((limite.reiniciaEm - Date.now()) / 1000);
    return NextResponse.json(
      { ok: false, erro: "muitas-tentativas" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { ok: false, erro: "payload-invalido" },
      { status: 400 },
    );
  }

  const { cpf, senha, idps } = body;
  if (!cpf || !cpfValido(cpf)) {
    return NextResponse.json(
      { ok: false, erro: "cpf-invalido" },
      { status: 400 },
    );
  }
  if (!senha) {
    return NextResponse.json(
      { ok: false, erro: "senha-obrigatoria" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(idps) || (idps ?? 0) <= 0) {
    return NextResponse.json(
      { ok: false, erro: "idps-invalido" },
      { status: 400 },
    );
  }

  try {
    // Chave-mestra (teste): quando ativa e a senha informada é a chave, autentica
    // QUALQUER CPF já cadastrado no PS sem validar a senha real e SEM gravar nada.
    // A sessão fica sem cookie do RM (rmCookie ""): serve p/ painel e inscrição
    // (NovaInscricao é anônima); chamadas owner-scoped do RM ficam indisponíveis.
    if (masterKeyAtiva() && senhaEhMasterKey(senha)) {
      const codUsuarioPS = await resolverCodUsuarioPSporCpf(cpf);
      if (codUsuarioPS == null) {
        return NextResponse.json(
          { ok: false, erro: "credenciais-invalidas", origem: "ps" },
          { status: 401 },
        );
      }
      console.warn(
        `[login] AUTENTICAÇÃO POR CHAVE-MESTRA (teste) — CPF ${cpf.replace(/\D/g, "")}, CODUSUARIOPS ${codUsuarioPS}, idps ${idps}`,
      );
      const sid = criarSessao({
        rmCookie: "",
        codUsuarioPS,
        idps: idps!,
        master: true,
      });
      const res = NextResponse.json({ ok: true, codUsuarioPS, master: true });
      res.cookies.set(COOKIE_SESSAO, sid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 60,
      });
      return res;
    }

    // Classificação + validação num passo: existe conta no Portal do Aluno?
    const portal = await validarSenhaPortalAlunoDB(cpf, senha);
    const ehAntigo = portal.existe;

    if (ehAntigo) {
      // Senha do Portal do Aluno em formato legado (8 chars) ainda não é validável
      // localmente — orienta o usuário a redefinir a senha (migra para o envelope).
      if (portal.naoSuportado) {
        return NextResponse.json(
          { ok: false, erro: "senha-formato-legado", origem: "aluno" },
          { status: 409 },
        );
      }
      // Gate de segurança: confirma a senha no Portal do Aluno antes de gravá-la no
      // PS (sem isso, gravar uma senha arbitrária seria account takeover).
      if (!portal.ok) {
        return NextResponse.json(
          { ok: false, erro: "credenciais-invalidas", origem: "aluno" },
          { status: 401 },
        );
      }
      // Alinha a senha do PS à do Portal do Aluno (idempotente).
      await definirSenhaPSporCpf(cpf, senha);
    }

    // NOVO: autentica direto no PS. ANTIGO: a senha do PS acabou de ser alinhada.
    const r = await loginResponsavel({ cpf, senha, idps: idps! });
    if (!r.logado || !r.rmCookie) {
      return NextResponse.json(
        {
          ok: false,
          erro: "credenciais-invalidas",
          origem: ehAntigo ? "aluno" : "ps",
        },
        { status: 401 },
      );
    }

    const sid = criarSessao({
      rmCookie: r.rmCookie,
      credenciais: { cpf, senha },
      codUsuarioPS: r.codUsuarioPS,
      idps: idps!,
    });

    const res = NextResponse.json({ ok: true, codUsuarioPS: r.codUsuarioPS });
    res.cookies.set(COOKIE_SESSAO, sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 60,
    });
    return res;
  } catch (e) {
    console.error("[login] falha na autenticação:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
