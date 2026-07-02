import type { DocumentoLegal } from "@/lib/legal/conteudo";

export function DocumentoLegalView({ doc }: { doc: DocumentoLegal }) {
  return (
    <main className="flex-1 bg-areia">
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-24">
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-csa-navy md:text-4xl">
          {doc.titulo}
        </h1>
        <p className="mt-4 text-cinza-suave">{doc.descricao}</p>

        <div className="mt-10 space-y-10">
          {doc.secoes.map((secao) => (
            <section key={secao.titulo}>
              <h2 className="font-display text-xl font-bold text-csa-navy">
                {secao.titulo}
              </h2>
              <div className="mt-3 space-y-3 text-grafite/90">
                {secao.blocos.map((bloco, i) => {
                  if (bloco.tipo === "sub") {
                    return (
                      <h3
                        key={i}
                        className="pt-2 font-display text-base font-semibold text-csa-azul"
                      >
                        {bloco.texto}
                      </h3>
                    );
                  }
                  if (bloco.tipo === "lista") {
                    return (
                      <ul key={i} className="list-disc space-y-2 pl-5">
                        {bloco.itens.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p key={i} className="leading-relaxed">
                      {bloco.texto}
                    </p>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
