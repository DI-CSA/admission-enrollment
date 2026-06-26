const ITENS = [
  {
    titulo: "Formação em valores",
    texto: "Educação cristã e Carisma Agostiniano Recoleto: amor e ciência, educar a mente e o coração.",
  },
  {
    titulo: "Excelência acadêmica",
    texto: "Projeto educativo sólido, do Fundamental ao Ensino Médio, com acompanhamento das famílias.",
  },
  {
    titulo: "Educação bilíngue",
    texto: "Contato com novo idioma e cultura desde os Anos Iniciais.",
  },
  {
    titulo: "Educação socioemocional",
    texto: "Desenvolvimento de habilidades para a vida, em cada fase da caminhada escolar.",
  },
  {
    titulo: "Certificações internacionais",
    texto: "Exames e oportunidades de estudos no exterior.",
  },
  {
    titulo: "Infraestrutura completa",
    texto: "Ambientes modernos no coração do Leblon. Conheça pelo Tour Virtual 360º.",
  },
];

export function Diferenciais() {
  return (
    <section id="diferenciais" className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold text-csa-azul md:text-4xl">
            Por que o CSA Leblon
          </h2>
          <p className="mt-3 text-cinza-suave">
            Tradição e excelência a serviço da formação integral do seu filho.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ITENS.map((item) => (
            <div
              key={item.titulo}
              className="rounded-2xl border border-black/5 bg-areia/60 p-6"
            >
              <h3 className="font-display text-lg font-semibold text-csa-azul">
                {item.titulo}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-grafite/80">{item.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
