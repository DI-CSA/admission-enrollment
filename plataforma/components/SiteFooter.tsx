export function SiteFooter() {
  return (
    <footer className="bg-csa-navy text-white/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-3 md:px-6">
        <div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/brasao-csa.svg"
              alt="Brasão do Colégio Santo Agostinho"
              className="h-12 w-auto"
            />
            <span className="font-display text-base font-bold uppercase tracking-tight text-white">
              Santo Agostinho
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
                href="https://www.facebook.com/csaleblon/"
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
      </div>

      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-center text-xs text-white/60 md:px-6">
          © {new Date().getFullYear()} Colégio Santo Agostinho — Leblon. Todos
          os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
