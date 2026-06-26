export function Identidade() {
  return (
    <section id="identidade" className="bg-white">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:px-6">
        <div>
          <p className="mb-4 inline-flex rounded-full bg-csa-navy/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-csa-azul">
            O hub de desenvolvimento educacional, desde sempre
          </p>
          <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight text-csa-navy md:text-4xl">
            A vanguarda da Pedagogia Agostiniana
          </h2>
          <p className="mt-5 text-grafite/80">
            Um dos maiores diferenciais competitivos do Colégio Santo Agostinho
            é a atemporalidade de sua proposta. A Pedagogia Agostiniana tem como
            objetivo educar a mente e o coração da pessoa de forma abrangente —
            em sua integralidade espiritual, intelectual, moral e da vontade.
          </p>
          <p className="mt-4 text-grafite/80">
            Acreditamos que o primeiro passo de uma jornada deve ser guiado por
            uma conexão de propósitos. Por isso, nosso processo de admissão é,
            antes de tudo, um momento de encontro: mais do que conhecer a
            estrutura, você compreende a essência do que vivemos diariamente.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            {["Sólido", "Atemporal", "Inquieto"].map((s) => (
              <span
                key={s}
                className="rounded-full border border-csa-dourado/40 bg-csa-amarelo/10 px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-csa-dourado-escuro"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <figure className="relative">
          <div
            className="absolute -inset-3 rounded-3xl opacity-40 blur-2xl"
            style={{
              background:
                "radial-gradient(circle, rgba(43,179,230,0.55), transparent 70%)",
            }}
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/campanha.jpg"
            alt="Campanha institucional do Colégio Santo Agostinho — Leblon e Barra"
            className="relative w-full rounded-3xl shadow-xl ring-1 ring-black/5"
          />
        </figure>
      </div>
    </section>
  );
}
