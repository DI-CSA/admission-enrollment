"use client";

import { useState } from "react";
import { listaProcessos, urlInscricao, type Processo } from "@/lib/processos";

type Status = "idle" | "enviando" | "erro";

export function SeletorProcessos() {
  const [aberto, setAberto] = useState<Processo | null>(null);

  return (
    <section id="processos" className="bg-areia">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight text-csa-navy md:text-4xl">
            Editais para o processo de admissão
          </h2>
          <p className="mt-3 text-cinza-suave">
            Confira os editais oficiais com todas as informações sobre vagas,
            calendário e procedimentos. Clique no segmento do(a) candidato(a) e
            siga as orientações.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {listaProcessos.map((p) => (
            <article
              key={p.chave}
              className="flex flex-col rounded-2xl border border-black/5 bg-white p-7 shadow-sm transition hover:shadow-md"
            >
              <span className="inline-flex w-fit rounded-full bg-csa-azul/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-csa-azul-claro">
                {p.selo}
              </span>
              <h3 className="mt-4 font-display text-2xl font-semibold text-csa-azul">
                {p.rotulo}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-grafite/80">
                {p.descricao}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={p.edital}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-csa-azul/20 px-5 py-2.5 text-sm font-semibold text-csa-azul transition hover:bg-csa-azul/5"
                >
                  Baixar edital
                </a>
                <button
                  type="button"
                  onClick={() => setAberto(p)}
                  className="rounded-full bg-csa-amarelo px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-csa-navy shadow-sm transition hover:bg-csa-dourado"
                >
                  Inscrever →
                </button>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-cinza-suave">
          Vagas sujeitas à disponibilidade por série.
        </p>
      </div>

      {aberto && (
        <LeadModal processo={aberto} onClose={() => setAberto(null)} />
      )}
    </section>
  );
}

function LeadModal({
  processo,
  onClose,
}: {
  processo: Processo;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setStatus("enviando");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.get("nome"),
          email: form.get("email"),
          telefone: form.get("telefone"),
          segmento: processo.chave,
          consentimento: form.get("consentimento") === "on",
        }),
      });
      if (!res.ok) throw new Error("falha");
      // Segue para o portal oficial de inscrição (TOTVS RM).
      window.location.href = urlInscricao(processo);
    } catch {
      setStatus("erro");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inscrição — ${processo.rotulo}`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-semibold text-csa-azul">
          Iniciar inscrição
        </h3>
        <p className="mt-1 text-sm text-cinza-suave">{processo.rotulo}</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Campo
            nome="nome"
            rotulo="Nome do responsável"
            tipo="text"
            obrigatorio
          />
          <Campo nome="email" rotulo="E-mail" tipo="email" obrigatorio />
          <Campo nome="telefone" rotulo="Telefone / WhatsApp" tipo="tel" />

          <label className="flex items-start gap-2 text-xs text-grafite/80">
            <input
              type="checkbox"
              name="consentimento"
              required
              className="mt-0.5"
            />
            <span>
              Autorizo o contato do Colégio Santo Agostinho e concordo com a{" "}
              <a
                href="https://www.csa.com.br"
                className="text-csa-azul-claro underline"
              >
                Política de Privacidade
              </a>
              .
            </span>
          </label>

          {status === "erro" && (
            <p className="text-sm text-csa-vermelho">
              Não foi possível enviar. Tente novamente.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-cinza-suave hover:text-grafite"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={status === "enviando"}
              className="rounded-full bg-csa-dourado px-6 py-2.5 text-sm font-semibold text-csa-azul shadow-sm transition hover:bg-csa-dourado-escuro disabled:opacity-60"
            >
              {status === "enviando"
                ? "Enviando…"
                : "Continuar para a inscrição"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Campo({
  nome,
  rotulo,
  tipo,
  obrigatorio,
}: {
  nome: string;
  rotulo: string;
  tipo: string;
  obrigatorio?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-grafite">
        {rotulo} {obrigatorio && <span className="text-csa-vermelho">*</span>}
      </span>
      <input
        name={nome}
        type={tipo}
        required={obrigatorio}
        className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-csa-azul-claro focus:ring-2 focus:ring-csa-azul-claro/20"
      />
    </label>
  );
}
