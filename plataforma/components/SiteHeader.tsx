import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-3"
          aria-label="Colégio Santo Agostinho – Leblon"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/brasao-csa.svg"
            alt="Brasão do Colégio Santo Agostinho"
            className="h-11 w-auto"
          />
          <span className="leading-tight">
            <span className="block font-display text-base font-bold uppercase tracking-tight text-csa-navy">
              Santo Agostinho
            </span>
            <span className="block text-xs tracking-wide text-cinza-suave">
              Unidade Leblon · Admissão 2027
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-csa-navy md:flex">
          <a href="#processos" className="hover:text-csa-azul-claro">
            Processos
          </a>
          <a href="#diferenciais" className="hover:text-csa-azul-claro">
            Diferenciais
          </a>
          <a href="#passos" className="hover:text-csa-azul-claro">
            Como funciona
          </a>
          <a href="#duvidas" className="hover:text-csa-azul-claro">
            Dúvidas
          </a>
        </nav>

        <a
          href="#processos"
          className="rounded-full bg-csa-amarelo px-5 py-2 font-display text-sm font-bold uppercase tracking-wide text-csa-navy shadow-sm transition hover:bg-csa-dourado"
        >
          Inscreva-se
        </a>
      </div>
    </header>
  );
}
