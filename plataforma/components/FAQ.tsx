const PERGUNTAS = [
  {
    q: "Quem pode se inscrever em cada processo?",
    a: "São dois processos: (1) 1º Ano do Ensino Fundamental e (2) 2º Ano do Fundamental à 2ª Série do Ensino Médio. Escolha o segmento conforme a série pretendida pelo(a) candidato(a).",
  },
  {
    q: "Onde leio as regras completas?",
    a: "Cada processo tem seu edital, disponível para download no card correspondente, com prazos, documentos e critérios.",
  },
  {
    q: "Como é feita a inscrição?",
    a: "Após escolher o segmento, você é direcionado ao portal oficial do colégio para concluir o cadastro e a inscrição.",
  },
  {
    q: "Há taxa de inscrição?",
    a: "Quando houver, o boleto da taxa é gerado no próprio portal de inscrição, conforme o edital do processo.",
  },
  {
    q: "Com quem falo em caso de dúvida?",
    a: "Fale com a Secretaria Escolar pelo telefone (21) 3206-7850 ou pelo e-mail secretaria@csa.com.br.",
  },
];

export function FAQ() {
  return (
    <section id="duvidas" className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-20 md:px-6">
        <h2 className="text-center font-display text-3xl font-bold text-csa-azul md:text-4xl">
          Perguntas frequentes
        </h2>
        <div className="mt-10 divide-y divide-black/5 rounded-2xl border border-black/5">
          {PERGUNTAS.map((item) => (
            <details key={item.q} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-csa-azul">
                {item.q}
                <span className="ml-4 text-csa-dourado transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-grafite/80">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
