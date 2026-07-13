"use client";

import { useState } from "react";
import { ReconhecimentoForm } from "@/components/ReconhecimentoForm";

/**
 * Envolve o cabeçalho de acesso (título + instrução do CPF) e o
 * `ReconhecimentoForm`. O cabeçalho só aparece nas etapas de acesso (CPF/senha);
 * quando o responsável está logado, some — deixando o painel de candidatos e a
 * matrícula ocuparem a tela sem o título repetido.
 */
export function AcessoInscricao({ idps }: { idps: number }) {
  const [logado, setLogado] = useState(false);

  return (
    <>
      {!logado && (
        <>
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-csa-navy">
            Acesso do responsável
          </h1>
          <p className="mt-3 text-cinza-suave">
            Informe o CPF do responsável para iniciar ou continuar a inscrição.
          </p>
        </>
      )}

      <div className="mt-8 rounded-2xl border border-black/5 bg-white p-7 shadow-sm">
        <ReconhecimentoForm idps={idps} onLogadoChange={setLogado} />
      </div>
    </>
  );
}
