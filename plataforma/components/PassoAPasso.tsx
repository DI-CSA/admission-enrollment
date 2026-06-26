const PASSOS = [
  { n: 1, titulo: "Escolha o segmento", texto: "Selecione o processo seletivo do(a) candidato(a)." },
  { n: 2, titulo: "Leia o edital", texto: "Confira regras, prazos e documentos exigidos." },
  { n: 3, titulo: "Cadastre-se no portal", texto: "Preencha os dados e realize a inscrição oficial." },
  { n: 4, titulo: "Acompanhe as etapas", texto: "Siga as orientações apresentadas em cada fase." },
];

export function PassoAPasso() {
  return (
    <section id="passos" className="bg-csa-azul text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">Como funciona a inscrição</h2>
          <p className="mt-3 text-white/75">
            A inscrição é realizada no portal oficial do colégio. É simples e rápido.
          </p>
        </div>

        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PASSOS.map((p) => (
            <li key={p.n} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-csa-dourado font-display text-lg font-bold text-csa-azul">
                {p.n}
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">{p.titulo}</h3>
              <p className="mt-2 text-sm text-white/75">{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
