"use client";

import { useEffect, useState } from "react";
import { CpfInput } from "@/components/CpfInput";
import { PainelResponsavel } from "@/components/PainelResponsavel";
import { WizardInscricao } from "@/components/WizardInscricao";
import { cpfValido } from "@/lib/cpf";
import { formatarTelefone } from "@/lib/telefone";

type Reconhecimento = {
  existe: boolean;
  temSenhaCadastrada: boolean;
  ehResponsavelDeAluno: boolean;
  nome: string | null;
  emailMascarado: string | null;
};

type Etapa = "verificando" | "cpf" | "login" | "recuperar" | "novo" | "logado";

/** Máscara leve de data dd/mm/aaaa para os campos de nascimento. */
function formatarData(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length >= 3) out += "/" + d.slice(2, 4);
  if (d.length >= 5) out += "/" + d.slice(4, 8);
  return out;
}

/**
 * Fluxo de acesso do responsável: informa o CPF, é reconhecido (ou não) e segue
 * para login (senha / data de nascimento) ou cadastro novo. Login e recuperação
 * de senha passam pela WebAPI EduPS via BFF; o reconhecimento é leitura (SQL).
 */
export function ReconhecimentoForm({
  idps,
  onLogadoChange,
}: {
  idps: number;
  onLogadoChange?: (logado: boolean) => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>("verificando");
  const [cpf, setCpf] = useState("");
  const [reconh, setReconh] = useState<Reconhecimento | null>(null);
  const [senha, setSenha] = useState("");
  const [dataNasc, setDataNasc] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Cadastro novo (anônimo): o responsável define nome, e-mail (contato/RD),
  // celular e senha antes do wizard. O e-mail é do RESPONSÁVEL, não do candidato.
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novoCelular, setNovoCelular] = useState("");
  const [novoDataNasc, setNovoDataNasc] = useState("");
  const [novoSenha, setNovoSenha] = useState("");
  const [novoSenha2, setNovoSenha2] = useState("");
  const [cadastroIniciado, setCadastroIniciado] = useState(false);

  const cpfOk = cpfValido(cpf);

  // Informa o container se o responsável já está logado, para ele esconder o
  // cabeçalho de acesso (título + instrução do CPF) fora da etapa de login.
  useEffect(() => {
    onLogadoChange?.(etapa === "logado");
  }, [etapa, onLogadoChange]);

  // Restaura o estado logado a partir da sessão (cookie `sid`) no mount. Sem
  // isso, ao navegar para outra página do topo e voltar para /inscricoes o
  // React reinicia em "cpf" e força novo login, mesmo com a sessão válida.
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
      // Cadastro NOVO: garante que não há sessão de outro responsável presa no
      // browser (cookie obsoleto), senão o candidato seria atribuído a ela.
      if (!data.existe) {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch {
          // best-effort; o backend também descarta a sessão obsoleta no submit.
        }
      }
      setEtapa(data.existe ? "login" : "novo");
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
    setNovoNome("");
    setNovoEmail("");
    setNovoCelular("");
    setNovoDataNasc("");
    setNovoSenha("");
    setNovoSenha2("");
    setCadastroIniciado(false);
  }

  async function sair() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // logout é best-effort; o cookie de sessão expira sozinho em 30 min.
    }
    recomecar();
  }

  // Sessão expirada (401 em qualquer painel): volta ao login por CPF com um
  // aviso — em vez de oferecer um "tentar novamente" que sempre falharia.
  function sessaoExpirada() {
    recomecar();
    setErro("Sua sessão expirou. Entre novamente com seu CPF.");
  }

  // ---- Etapa: verificando sessão -------------------------------------------
  if (etapa === "verificando") {
    return (
      <p className="text-sm text-cinza-suave" aria-live="polite">
        Verificando sua sessão…
      </p>
    );
  }

  // ---- Etapa: CPF -----------------------------------------------------------
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
          className="w-full rounded-full bg-csa-dourado px-6 py-2.5 text-sm font-semibold text-csa-azul shadow-sm transition hover:bg-csa-dourado-escuro disabled:opacity-60"
        >
          {carregando ? "Consultando…" : "Continuar"}
        </button>
        <p className="text-xs text-cinza-suave">
          Usamos o CPF do responsável para localizar ou iniciar a inscrição.
          Seus dados são tratados de acordo com a nossa{" "}
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
              {semSenhaNoPS
                ? " Na primeira vez, ela passa a valer também para a inscrição."
                : ""}
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

        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-full bg-csa-dourado px-6 py-2.5 text-sm font-semibold text-csa-azul shadow-sm transition hover:bg-csa-dourado-escuro disabled:opacity-60"
        >
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

        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-full bg-csa-dourado px-6 py-2.5 text-sm font-semibold text-csa-azul shadow-sm transition hover:bg-csa-dourado-escuro disabled:opacity-60"
        >
          {carregando ? "Enviando…" : "Enviar instruções"}
        </button>
        <button
          type="button"
          onClick={() => {
            setErro(null);
            setAviso(null);
            setEtapa("login");
          }}
          className="w-full text-sm text-cinza-suave hover:text-grafite"
        >
          Voltar ao login
        </button>
      </form>
    );
  }

  // ---- Etapa: novo cadastro -------------------------------------------------
  if (etapa === "novo") {
    // Já definiu nome+senha → segue para o wizard (cadastro anônimo + auto-login).
    if (cadastroIniciado) {
      return (
        <WizardInscricao
          idps={idps}
          responsavelNome={novoNome.trim()}
          modo="novo"
          novoCpf={cpf}
          novoSenha={novoSenha}
          novoEmail={novoEmail.trim()}
          novoCelular={novoCelular}
          novoDataNascimento={novoDataNasc}
          onConcluir={() => setEtapa("logado")}
        />
      );
    }

    const iniciarCadastro = (e: React.FormEvent) => {
      e.preventDefault();
      setErro(null);
      if (novoNome.trim().length < 3)
        return setErro("Informe o nome completo do responsável.");
      if (!/.+@.+\..+/.test(novoEmail.trim()))
        return setErro("Informe um e-mail válido do responsável.");
      if (novoDataNasc.length !== 10)
        return setErro(
          "Informe a data de nascimento do responsável (dd/mm/aaaa).",
        );
      if (novoCelular.replace(/\D/g, "").length < 10)
        return setErro("Informe um celular válido do responsável com DDD.");
      if (novoSenha.length < 6)
        return setErro("A senha deve ter ao menos 6 caracteres.");
      if (novoSenha !== novoSenha2) return setErro("As senhas não conferem.");
      setCadastroIniciado(true);
    };

    return (
      <form onSubmit={iniciarCadastro} className="space-y-4" noValidate>
        <p className="text-sm text-grafite">
          Não localizamos um cadastro para este CPF. Vamos criar um acesso e
          seguir com a inscrição.
        </p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-grafite">
            Nome do responsável <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="text"
            autoComplete="name"
            autoFocus
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-grafite">
            E-mail do responsável <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="email"
            autoComplete="email"
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20"
          />
          <span className="mt-1 block text-xs text-cinza-suave">
            Usaremos este e-mail para falar sobre a inscrição.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-grafite">
            Celular do responsável <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={16}
            placeholder="(21) 99876-5432"
            value={novoCelular}
            onChange={(e) => setNovoCelular(formatarTelefone(e.target.value))}
            className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-grafite">
            Data de nascimento do responsável{" "}
            <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            maxLength={10}
            value={novoDataNasc}
            onChange={(e) => setNovoDataNasc(formatarData(e.target.value))}
            className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-grafite">
            Crie uma senha <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={novoSenha}
            onChange={(e) => setNovoSenha(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20"
          />
          <span className="mt-1 block text-xs text-cinza-suave">
            Use ao menos 6 caracteres. Ela valerá para acessar a sua inscrição.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-grafite">
            Confirme a senha <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={novoSenha2}
            onChange={(e) => setNovoSenha2(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20"
          />
        </label>

        {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}

        <button
          type="submit"
          className="w-full rounded-full bg-csa-amarelo px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-csa-navy shadow-sm transition hover:bg-csa-dourado"
        >
          Iniciar cadastro
        </button>
        <button
          type="button"
          onClick={recomecar}
          className="w-full text-sm text-cinza-suave hover:text-grafite"
        >
          Corrigir CPF
        </button>
      </form>
    );
  }

  // ---- Etapa: logado --------------------------------------------------------
  return (
    <PainelResponsavel
      idps={idps}
      responsavelNome={reconh?.nome ?? (novoNome.trim() || "responsável")}
      onSair={() => void sair()}
      onSessaoExpirada={sessaoExpirada}
    />
  );
}
