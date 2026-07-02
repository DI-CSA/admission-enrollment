"use client";

import { forwardRef, useId } from "react";
import { formatarCpf } from "@/lib/cpf";

type CpfInputProps = {
  value: string;
  onChange: (valorFormatado: string) => void;
  rotulo?: string;
  obrigatorio?: boolean;
  erro?: string | null;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>;

/**
 * Campo de CPF com máscara de digitação (000.000.000-00). Aceita apenas
 * dígitos e formata em tempo real; `onChange` recebe o valor já mascarado.
 */
export const CpfInput = forwardRef<HTMLInputElement, CpfInputProps>(
  function CpfInput(
    {
      value,
      onChange,
      rotulo = "CPF do responsável",
      obrigatorio,
      erro,
      ...rest
    },
    ref,
  ) {
    const id = useId();
    const erroId = `${id}-erro`;

    return (
      <label htmlFor={id} className="block">
        <span className="mb-1 block text-sm font-medium text-grafite">
          {rotulo} {obrigatorio && <span className="text-csa-vermelho">*</span>}
        </span>
        <input
          {...rest}
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          placeholder="000.000.000-00"
          value={value}
          onChange={(e) => onChange(formatarCpf(e.target.value))}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? erroId : undefined}
          className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20 aria-invalid:border-csa-vermelho"
        />
        {erro && (
          <span id={erroId} className="mt-1 block text-sm text-csa-vermelho">
            {erro}
          </span>
        )}
      </label>
    );
  },
);
