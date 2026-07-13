"use client";

import { useEffect, useState } from "react";
import { CpfInput } from "@/components/CpfInput";
import { PainelMatricula } from "@/components/PainelMatricula";
import { cpfValido } from "@/lib/cpf";

type Reconhecimento = {
  existe: boolean;
  temSenhaCadastrada: boolean;
  ehResponsavelDeAluno: boolean;
  nome: string | null;
  emailMascarado: string | null;
};

type Etapa =
  | "verificando"
  | "cpf"
  | "login"
  | "recuperar"
  | "inexistente"
  | "logado";

/** Máscara leve de data dd/mm/aaaa. */
function formatarData(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length >= 3) out += "/" + d.slice(2, 4);
  if (d.length >= 5) out += "/" + d.slice(4, 8);
  return out;
}

const botaoPrimario =
  "w-full rounded-full bg-csa-dourado px-6 py-2.5 text-sm font-semibold text-csa-azul shadow-sm transition hover:bg-csa-dourado-escuro disabled:opacity-60";
const botaoSecundario = "w-full text-sm text-cinza-suave hover:text-grafite";

/**
 * Acesso do responsável ao fluxo de MATRÍCULA. Reusa o login da EduPS (mesmos
 * endpoints /api/auth) da inscrição: informa o CPF, é reconhecido e entra com a
 * senha do Portal do Aluno. Não há cadastro novo aqui — a matrícula pressupõe um
 * candidato já inscrito e aprovado. Após o login, o PainelMatricula lista os
 * candidatos aptos à matrícula.
 *
 * O `idps` é usado APENAS para autenticar o responsável (o login EduPS exige um
 * PS). A lista de candidatos aptos cobre todos os PS do ciclo (SQL no BFF).
 */
export function AcessoMatricula({ idps }: { idps: number }) {
  const [etapa, setEtapa] = useState<Etapa>("verificando");
  const [cpf, setCpf] = useState("");
  const [reconh, setReconh] = useState<Reconhecimento | null>(null);
  const [senha, setSenha] = useState("");
  const [dataNasc, setDataNasc] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cpfOk = cpfValido(cpf);

  // Continuidade com a inscrição: a sessão é a MESMA (cookie `sid`). Se o
  // responsável já está logado (ex.: veio do painel de inscrição), pula o login
  // e abre direto o painel de matrícula.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!ativo) return;
        if (res.ok) {
          const data = (await res.json()) as {
            ok: boolean;
            nome?: string | null;
          };
          if (data.ok) {
            setReconh({
              existe: true,
              temSenhaCadastrada: true,
              ehResponsavelDeAluno: false,
              nome: data.nome ?? null,
              emailMascarado: null,
            });
            setEtapa("logado");
            return;
          }
        }
        setEtapa("cpf");
      } catch {
        if (ativo) setEtapa("cpf");
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function consultarCpf(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!cpfOk) return setErro("Informe um CPF válido.");

    setCarregando(true);
    try {
      const res = await fetch("/api/auth/reconhecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf }),
      });
      if (res.status === 429)
        return setErro("Muitas tentativas. Aguarde um instante.");
      const data = (await res.json()) as
        | ({ ok: true } & Reconhecimento)
        | { ok: false; erro: string };
      if (!data.ok)
        return setErro(
          data.erro === "cpf-invalido"
            ? "Informe um CPF válido."
            : "Serviço indisponível. Tente novamente.",
        );
      setReconh(data);
      setEtapa(data.existe ? "login" : "inexistente");
    } catch {
      setErro("Não foi possível consultar agora. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  async function autenticar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!senha) return setErro("Informe sua senha.");

    setCarregando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf, senha, idps }),
      });
      if (res.status === 429)
        return setErro("Muitas tentativas. Aguarde um instante.");
      if (res.status === 401) return setErro("CPF ou senha incorretos.");
      if (res.status === 409) {
        const d = (await res.json().catch(() => null)) as {
          erro?: string;
        } | null;
        if (d?.erro === "senha-formato-legado")
          return setErro(
            "Sua senha do Portal do Aluno está em um formato antigo. Por favor, redefina-a no Portal do Aluno e tente novamente.",
          );
        return setErro("Não foi possível entrar. Tente novamente.");
      }
      if (res.status === 503)
        return setErro(
          "Não foi possível validar sua senha agora. Tente novamente em instantes.",
        );
      const data = (await res.json()) as { ok: boolean };
      if (!data.ok) return setErro("Não foi possível entrar. Tente novamente.");
      setEtapa("logado");
    } catch {
      setErro("Não foi possível entrar agora. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  async function enviarRecuperacao(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    if (dataNasc.length !== 10)
      return setErro("Informe a data de nascimento (dd/mm/aaaa).");

    setCarregando(true);
    try {
      const res = await fetch("/api/auth/recuperar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf, dataNascimento: dataNasc, idps }),
      });
      if (res.status === 429)
        return setErro("Muitas tentativas. Aguarde um instante.");
      const data = (await res.json()) as { ok: boolean; mensagem?: string };
      setAviso(
        data.mensagem ??
          "Se os dados conferirem, enviaremos as instruções por e-mail.",
      );
    } catch {
      setErro("Não foi possível solicitar agora. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  function recomecar() {
    setEtapa("cpf");
    setReconh(null);
    setSenha("");
    setDataNasc("");
    setErro(null);
    setAviso(null);
  }

  async function sair() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // logout é best-effort; o cookie de sessão expira sozinho em 30 min.
    }
    recomecar();
  }

  // Sessão expirada (401 no painel): volta ao login por CPF com um aviso — em
  // vez de oferecer um "tentar novamente" que sempre falharia.
  function sessaoExpirada() {
    recomecar();
    setErro("Sua sessão expirou. Entre novamente com seu CPF.");
  }

  // ---- Etapa: CPF -----------------------------------------------------------
  if (etapa === "verificando") {
    return <p className="text-sm text-cinza-suave">Verificando seu acesso…</p>;
  }

  if (etapa === "cpf") {
    return (
      <form onSubmit={consultarCpf} className="space-y-4" noValidate>
        <CpfInput
          value={cpf}
          onChange={setCpf}
          obrigatorio
          erro={erro}
          autoFocus
        />
        <button
          type="submit"
          disabled={carregando || !cpfOk}
          className={botaoPrimario}
        >
          {carregando ? "Consultando…" : "Continuar"}
        </button>
        <p className="text-xs text-cinza-suave">
          Use o CPF do responsável para acessar a matrícula do candidato
          aprovado. Seus dados são tratados de acordo com a nossa{" "}
          <a href="/privacidade" className="underline hover:text-grafite">
            Política de Privacidade
          </a>
          .
        </p>
      </form>
    );
  }

  // ---- Etapa: login (reconhecido) ------------------------------------------
  if (etapa === "login" && reconh) {
    const semSenhaNoPS = !reconh.temSenhaCadastrada;
    return (
      <form onSubmit={autenticar} className="space-y-4" noValidate>
        <div className="rounded-lg bg-areia px-4 py-3 text-sm">
          <p className="text-grafite">
            {reconh.nome ? (
              <>
                Olá, <strong>{reconh.nome}</strong>.
              </>
            ) : (
              "Cadastro localizado."
            )}
          </p>
          {reconh.emailMascarado && (
            <p className="text-cinza-suave">E-mail: {reconh.emailMascarado}</p>
          )}
        </div>

        {reconh.ehResponsavelDeAluno && (
          <div className="rounded-lg border border-csa-azul/20 bg-csa-azul/5 px-4 py-3 text-sm">
            <p className="font-medium text-csa-azul">
              Reconhecemos este CPF como de um responsável do colégio. 👋
            </p>
            <p className="mt-1 text-grafite">
              Para entrar, use a <strong>mesma senha do Portal do Aluno</strong>{" "}
              (sistema acadêmico TOTVS).
            </p>
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-grafite">
            Senha <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20"
          />
          {semSenhaNoPS && !reconh.ehResponsavelDeAluno && (
            <span className="mt-1 block text-xs text-cinza-suave">
              Ainda não há senha definida para este cadastro. Use “Esqueci minha
              senha” para receber uma por e-mail.
            </span>
          )}
        </label>

        {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}

        <button type="submit" disabled={carregando} className={botaoPrimario}>
          {carregando ? "Entrando…" : "Entrar"}
        </button>

        <div className="flex justify-between text-sm">
          <button
            type="button"
            onClick={recomecar}
            className="text-cinza-suave hover:text-grafite"
          >
            Não sou eu
          </button>
          <button
            type="button"
            onClick={() => {
              setErro(null);
              setEtapa("recuperar");
            }}
            className="font-medium text-csa-azul-claro hover:underline"
          >
            Esqueci minha senha
          </button>
        </div>
      </form>
    );
  }

  // ---- Etapa: recuperar senha ----------------------------------------------
  if (etapa === "recuperar") {
    return (
      <form onSubmit={enviarRecuperacao} className="space-y-4" noValidate>
        <p className="text-sm text-grafite">
          Para redefinir a senha, confirme sua data de nascimento. Enviaremos as
          instruções por e-mail.
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-grafite">
            Data de nascimento <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            maxLength={10}
            autoFocus
            value={dataNasc}
            onChange={(e) => setDataNasc(formatarData(e.target.value))}
            className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20"
          />
        </label>

        {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}
        {aviso && <p className="text-sm text-csa-azul">{aviso}</p>}

        <button type="submit" disabled={carregando} className={botaoPrimario}>
          {carregando ? "Enviando…" : "Enviar instruções"}
        </button>
        <button
          type="button"
          onClick={() => {
            setErro(null);
            setAviso(null);
            setEtapa("login");
          }}
          className={botaoSecundario}
        >
          Voltar ao login
        </button>
      </form>
    );
  }

  // ---- Etapa: CPF não reconhecido ------------------------------------------
  if (etapa === "inexistente") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-csa-azul/20 bg-csa-azul/5 px-4 py-3 text-sm">
          <p className="text-grafite">
            Não localizamos um cadastro para este CPF. A matrícula é feita pelo
            responsável que realizou a inscrição do candidato aprovado.
          </p>
          <p className="mt-2 text-cinza-suave">
            Confira se digitou o CPF correto do responsável.
          </p>
        </div>
        <button type="button" onClick={recomecar} className={botaoSecundario}>
          Corrigir CPF
        </button>
      </div>
    );
  }

  // ---- Etapa: logado --------------------------------------------------------
  return (
    <PainelMatricula
      responsavelNome={reconh?.nome ?? "responsável"}
      onSair={() => void sair()}
      onSessaoExpirada={sessaoExpirada}
    />
  );
}
