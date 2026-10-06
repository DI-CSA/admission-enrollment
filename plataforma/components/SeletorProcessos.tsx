import { listaProcessos } from "@/lib/processos";

export function SeletorProcessos() {
  return (
    <section id="processos" className="bg-areia">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight text-csa-navy md:text-4xl">
            Editais para o processo de admissão
          </h2>
          <p className="mt-3 text-cinza-suave">
            Confira os editais oficiais com todas as informações sobre vagas,
            calendário e procedimentos. Clique no segmento do(a) candidato(a) e
            siga as orientações.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {listaProcessos.map((p) => (
            <article
              key={p.chave}
              className="flex flex-col rounded-2xl border border-black/5 bg-white p-7 shadow-sm transition hover:shadow-md"
            >
              <span className="inline-flex w-fit rounded-full bg-csa-azul/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-csa-azul-claro">
                {p.selo}
              </span>
              <h3 className="mt-4 font-display text-2xl font-semibold text-csa-azul">
                {p.rotulo}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-grafite/80">
                {p.descricao}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={p.edital}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-csa-azul/20 px-5 py-2.5 text-sm font-semibold text-csa-azul transition hover:bg-csa-azul/5"
                >
                  Baixar edital
                </a>
                <a
                  href="/inscricoes"
                  className="rounded-full bg-csa-amarelo px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-csa-navy shadow-sm transition hover:bg-csa-dourado"
                >
                  Inscrever →
                </a>
              </div>

              {p.editalComplementar && (
                <a
                  href={p.editalComplementar}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex w-fit items-center gap-2 rounded-full border-2 border-csa-vermelho bg-csa-vermelho/5 px-5 py-2.5 text-sm font-bold text-csa-vermelho transition hover:bg-csa-vermelho/10"
                >
                  <span className="rounded-full bg-csa-vermelho px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                    Novo
                  </span>
                  Baixar edital complementar
                </a>
              )}
            </article>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-cinza-suave">
          Vagas sujeitas à disponibilidade por série.
        </p>
      </div>
    </section>
  );
}
