"use client";

import { useCallback, useEffect, useState } from "react";
import { CARDS_CSA, type CardCSA, type PaginaCSA } from "@/lib/csa/conteudo";

export function Diferenciais() {
  const [aberto, setAberto] = useState<CardCSA | null>(null);

  return (
    <section id="diferenciais" className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold text-csa-azul md:text-4xl">
            Por que o CSA Leblon
          </h2>
          <p className="mt-3 text-cinza-suave">
            Tradição e excelência a serviço da formação integral do seu filho.
            Clique em cada tema para conhecer mais, com conteúdo do site da
            escola.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS_CSA.map((card) => (
            <button
              key={card.slug}
              type="button"
              onClick={() => setAberto(card)}
              className="group flex flex-col rounded-2xl border border-black/5 bg-areia/60 p-6 text-left transition hover:-translate-y-0.5 hover:border-csa-azul/20 hover:bg-white hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-csa-azul/40"
            >
              <h3 className="font-display text-lg font-semibold text-csa-azul">
                {card.titulo}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-grafite/80">
                {card.resumo}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-csa-azul-claro">
                Saiba mais
                <svg
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    d="M4 10h12M11 5l5 5-5 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </div>

      {aberto && (
        <ModalConteudo
          key={aberto.slug}
          card={aberto}
          onClose={() => setAberto(null)}
        />
      )}
    </section>
  );
}

function ModalConteudo({
  card,
  onClose,
}: {
  card: CardCSA;
  onClose: () => void;
}) {
  const [pagina, setPagina] = useState<PaginaCSA | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">(
    "carregando",
  );

  useEffect(() => {
    let ativo = true;

    fetch(`/api/csa/${card.slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!ativo) return;
        if (data?.ok && data.pagina) {
          setPagina(data.pagina as PaginaCSA);
          setEstado("ok");
        } else {
          setEstado("erro");
        }
      })
      .catch(() => ativo && setEstado("erro"));

    return () => {
      ativo = false;
    };
  }, [card.slug]);

  const fechar = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-csa-navy/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={card.titulo}
      onClick={fechar}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 border-b border-black/5 bg-csa-azul px-6 py-5 text-white">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
              CSA Leblon
            </p>
            <h3 className="mt-1 font-display text-xl font-bold md:text-2xl">
              {card.titulo}
            </h3>
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="-mr-1 shrink-0 rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {estado === "carregando" && <SkeletonConteudo />}

          {estado === "erro" && (
            <div className="py-8 text-center">
              <p className="text-grafite/80">
                Não foi possível carregar este conteúdo agora.
              </p>
              <a
                href={card.site}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex rounded-full bg-csa-azul px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-csa-azul-claro"
              >
                Ver no site do CSA
              </a>
            </div>
          )}

          {estado === "ok" && pagina && (
            <div className="space-y-7">
              {pagina.blocos.map((bloco, i) => (
                <BlocoRender key={i} bloco={bloco} />
              ))}
            </div>
          )}
        </div>

        {/* Rodapé */}
        {estado === "ok" && pagina && (
          <div className="border-t border-black/5 bg-areia/60 px-6 py-4">
            <a
              href={pagina.fonteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-csa-azul transition hover:text-csa-azul-claro"
            >
              Ver página completa no site do CSA
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  d="M7 13L13 7M8 7h5v5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function BlocoRender({ bloco }: { bloco: PaginaCSA["blocos"][number] }) {
  switch (bloco.tipo) {
    case "destaque":
      return (
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-areia/50">
          {bloco.imagem && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bloco.imagem}
              alt={bloco.alt}
              loading="lazy"
              className="h-52 w-full object-cover"
            />
          )}
          <div className="p-5">
            {bloco.titulo && (
              <h4 className="font-display text-lg font-semibold text-csa-azul">
                {bloco.titulo}
              </h4>
            )}
            {bloco.resumo && (
              <p className="mt-2 text-sm leading-relaxed text-grafite/80">
                {bloco.resumo}
              </p>
            )}
          </div>
        </div>
      );

    case "texto":
      return (
        <div>
          {bloco.titulo && (
            <h4 className="mb-2 font-display text-lg font-semibold text-csa-azul">
              {bloco.titulo}
            </h4>
          )}
          <div
            className="csa-prose text-sm leading-relaxed text-grafite/80"
            dangerouslySetInnerHTML={{ __html: bloco.html }}
          />
        </div>
      );

    case "imagem":
      return (
        <figure className="overflow-hidden rounded-2xl border border-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bloco.src}
            alt={bloco.alt}
            loading="lazy"
            className="w-full object-cover"
          />
          {bloco.legenda && (
            <figcaption className="bg-areia/60 px-4 py-2 text-xs text-cinza-suave">
              {bloco.legenda}
            </figcaption>
          )}
        </figure>
      );

    case "lista":
      return (
        <div>
          {bloco.titulo && (
            <h4 className="mb-3 font-display text-lg font-semibold text-csa-azul">
              {bloco.titulo}
            </h4>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {bloco.itens.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-black/5 bg-white p-4 shadow-sm"
              >
                {item.titulo && (
                  <p className="font-semibold text-csa-azul">{item.titulo}</p>
                )}
                {item.resumo && (
                  <p className="mt-1 text-sm leading-relaxed text-grafite/75">
                    {item.resumo}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

function SkeletonConteudo() {
  return (
    <div className="animate-pulse space-y-5" aria-hidden="true">
      <div className="h-48 w-full rounded-2xl bg-areia" />
      <div className="space-y-2.5">
        <div className="h-4 w-3/4 rounded bg-areia" />
        <div className="h-4 w-full rounded bg-areia" />
        <div className="h-4 w-5/6 rounded bg-areia" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-20 rounded-xl bg-areia" />
        <div className="h-20 rounded-xl bg-areia" />
      </div>
    </div>
  );
}
