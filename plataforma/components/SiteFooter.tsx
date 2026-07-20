export function SiteFooter() {
  return (
    <footer className="bg-csa-navy text-white/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:px-6 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center rounded-xl bg-white p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/brasao-csa.svg"
                alt="Brasão do Colégio Santo Agostinho"
                className="h-12 w-auto"
              />
            </span>
            <span className="font-display text-base font-bold uppercase tracking-tight text-white">
              Colégio Santo Agostinho
            </span>
          </div>
          <p className="mt-4 text-sm">
            Unidade Leblon — Agostinianos Recoletos. Sólido, atemporal e
            inquieto: o hub de desenvolvimento educacional, desde sempre.
          </p>
        </div>

        <div className="text-sm">
          <h3 className="mb-3 font-display text-base font-semibold text-white">
            Contato
          </h3>
          <p>
            Rua José Linhares, 88 — Leblon — Rio de Janeiro/RJ — CEP 22430-220
          </p>
          <p className="mt-1">
            Entrada Social: Rua Cupertino Durão, 75 — Leblon
          </p>
          <p className="mt-2">
            Telefone:{" "}
            <a href="tel:+552132067850" className="text-white hover:underline">
              (21) 3206-7850
            </a>
          </p>
          <p>
            E-mail:{" "}
            <a
              href="mailto:secretaria@csa.com.br"
              className="text-white hover:underline"
            >
              secretaria@csa.com.br
            </a>
          </p>
          <a
            href="https://www.csa.com.br/fale-conosco"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Fale conosco
            <svg
              className="h-4 w-4"
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
          </a>
        </div>

        <div className="text-sm">
          <h3 className="mb-3 font-display text-base font-semibold text-white">
            Acompanhe
          </h3>
          <ul className="space-y-1">
            <li>
              <a
                href="https://www.instagram.com/csaleblon_rj/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                Instagram @csaleblonoficial
              </a>
            </li>
            <li>
              <a
                href="https://www.facebook.com/csaleblonoficial"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                Facebook
              </a>
            </li>
            <li>
              <a
                href="https://www.csa.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                www.csa.com.br
              </a>
            </li>
          </ul>
        </div>

        <div className="text-sm">
          <h3 className="mb-3 font-display text-base font-semibold text-white">
            Editais 2027
          </h3>
          <ul className="space-y-1">
            <li>
              <a
                href="/editais/edital-2027-f1.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                Edital — 1º Ano do Fundamental
              </a>
            </li>
            <li>
              <a
                href="/editais/edital-2027-F2-M2.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                Edital — 2º Ano do Fund. à 2ª Série do Médio
              </a>
            </li>
            <li>
              <a href="/agendar-visita" className="hover:text-white">
                Marque uma visita
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-5 text-center text-xs text-white/60 md:flex-row md:justify-between md:px-6">
          <p>
            © {new Date().getFullYear()} Colégio Santo Agostinho — Leblon. Todos
            os direitos reservados.
          </p>
          <nav className="flex items-center gap-4">
            <a href="/privacidade" className="hover:text-white">
              Aviso de Privacidade
            </a>
            <a href="/termos" className="hover:text-white">
              Termos de Uso
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
