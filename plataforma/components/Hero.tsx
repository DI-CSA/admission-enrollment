export function Hero() {
  return (
    <section className="relative overflow-hidden bg-csa-navy text-white">
      {/* malha de constelação + brilhos de cor (constroem o clima da campanha) */}
      <div
        className="mesh pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 85% 10%, rgba(43,179,230,0.45) 0%, transparent 55%)," +
            "radial-gradient(60% 60% at 0% 100%, rgba(11,77,143,0.65) 0%, transparent 60%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-[1.25fr_0.75fr] md:px-6 md:py-28">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-csa-ciano">
            Admissão 2027 · Unidade Leblon
          </p>

          <h1 className="font-display text-4xl font-extrabold uppercase leading-[1.05] tracking-tight md:text-6xl">
            Venha fazer parte da{" "}
            <span className="text-csa-amarelo">família agostiniana</span>
          </h1>

          <p className="mt-3 inline-block bg-csa-amarelo px-3 py-1 font-display text-sm font-bold uppercase tracking-[0.15em] text-csa-navy md:text-base">
            Sólido · Atemporal · Inquieto
          </p>

          <p className="mt-6 max-w-xl text-lg text-white/85">
            Muito mais que uma matrícula, o início de uma jornada compartilhada.
            Escolha o segmento do(a) candidato(a) e dê o primeiro passo na nossa
            Comunidade Educativa, do Ensino Fundamental ao Ensino Médio.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#processos"
              className="rounded-full bg-csa-amarelo px-7 py-3 font-display font-bold uppercase tracking-wide text-csa-navy shadow-lg shadow-csa-amarelo/20 transition hover:bg-csa-dourado"
            >
              Quero me inscrever
            </a>
            <a
              href="https://www.csa.com.br/tour"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/30 px-7 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Tour Virtual 360º
            </a>
          </div>
        </div>

        <div className="relative hidden justify-center md:flex">
          <div
            className="absolute inset-0 rounded-full opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(43,179,230,0.5), transparent 70%)",
            }}
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/brasao-csa.svg"
            alt="Brasão oficial do Colégio Santo Agostinho"
            className="relative w-44 drop-shadow-2xl lg:w-56"
          />
        </div>
      </div>
    </section>
  );
}
