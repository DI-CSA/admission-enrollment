"use client";

import { useState } from "react";

/**
 * Formata a linha digitável (47 dígitos, padrão Febraban) na máscara com pontos
 * e espaços. Se não tiver 47 dígitos, devolve os dígitos como estão.
 */
function formatarLinhaDigitavel(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length !== 47) return d;
  return (
    `${d.slice(0, 5)}.${d.slice(5, 10)} ` +
    `${d.slice(10, 15)}.${d.slice(15, 21)} ` +
    `${d.slice(21, 26)}.${d.slice(26, 32)} ` +
    `${d.slice(32, 33)} ` +
    `${d.slice(33, 47)}`
  );
}

/**
 * Bloco com a linha digitável do boleto e um botão para copiá-la para a área de
 * transferência, com a instrução de pagar colando no aplicativo do banco.
 * Usado no fim da matrícula (Resultado) e no drawer (DetalhesMatricula).
 */
export function LinhaDigitavelBoleto({
  linhaDigitavel,
}: {
  linhaDigitavel: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const digitos = linhaDigitavel.replace(/\D/g, "");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(digitos);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Fallback: seleção manual não é necessária; o campo já está visível.
      setCopiado(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-csa-azul/20 bg-csa-azul/5 px-4 py-3 text-sm">
      <p className="font-medium text-grafite">
        Pague copiando a linha digitável
      </p>
      <p className="text-xs text-cinza-suave">
        Você pode pagar o boleto copiando a linha digitável abaixo e colando no
        aplicativo do seu banco.
      </p>
      <p className="break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-grafite ring-1 ring-inset ring-black/10">
        {formatarLinhaDigitavel(linhaDigitavel)}
      </p>
      <button
        type="button"
        onClick={() => void copiar()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-csa-azul px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-csa-azul/90"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
          <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
        </svg>
        {copiado ? "Linha copiada!" : "Copiar linha digitável"}
      </button>
    </div>
  );
}
