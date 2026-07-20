import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3"
          aria-label="Colégio Santo Agostinho – Leblon"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/brasao-csa.svg"
            alt="Brasão do Colégio Santo Agostinho"
            className="h-11 w-auto shrink-0"
          />
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-sm font-bold uppercase tracking-tight text-csa-navy sm:text-base">
              Colégio Santo Agostinho
            </span>
            <span className="block truncate text-xs tracking-wide text-cinza-suave">
              Unidade Leblon · Admissão 2027
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-csa-navy md:flex">
          <Link href="/#processos" className="hover:text-csa-azul-claro">
            Processos
          </Link>
          <Link href="/#diferenciais" className="hover:text-csa-azul-claro">
            Diferenciais
          </Link>
          <Link href="/#passos" className="hover:text-csa-azul-claro">
            Como funciona
          </Link>
          <Link href="/#duvidas" className="hover:text-csa-azul-claro">
            Dúvidas
          </Link>
        </nav>

        <div className="ml-3 flex shrink-0 items-center gap-2">
          <Link
            href="/agendar-visita"
            className="hidden whitespace-nowrap rounded-full border-2 border-csa-navy px-5 py-2 font-display text-sm font-bold uppercase tracking-wide text-csa-navy transition hover:bg-csa-navy hover:text-white sm:inline-flex"
          >
            Marque uma visita
          </Link>
          <Link
            href="/#processos"
            className="whitespace-nowrap rounded-full bg-csa-amarelo px-5 py-2 font-display text-sm font-bold uppercase tracking-wide text-csa-navy shadow-sm transition hover:bg-csa-dourado"
          >
            Inscreva-se
          </Link>
        </div>
      </div>
    </header>
  );
}
