"use client";

import { useCallback, useEffect, useState } from "react";
import {
  WizardMatricula,
  type ParametrosMatriculaCliente,
} from "./WizardMatricula";
import type { MatriculaResumo } from "@/components/DetalhesMatricula";

type ParametrosMatricula = ParametrosMatriculaCliente;

interface PeriodoMatricula {
  aberto: boolean;
  dataInicio: string | null;
  dataFim: string | null;
  mensagem: string | null;
  bruto?: Record<string, unknown>;
}

interface Contexto {
  elegivel: boolean;
  idAreaOfertada: number | null;
  parametros: ParametrosMatricula | null;
  periodo: PeriodoMatricula | null;
}

type EstadoContexto = Contexto | "carregando" | "erro" | undefined;

const botaoSecundario = "w-full text-sm text-cinza-suave hover:text-grafite";

/** Candidato para o qual carregar o contexto e (se apto) abrir a matrícula. */
export interface CandidatoMatricula {
  codUsuarioPS: number;
  nome: string;
  numeroInscricao: number | null;
  idps: number | null;
}

/**
 * Bloco de matrícula de UM candidato: busca o contexto AUTORITATIVO na WebAPI
 * (/api/matricula/contexto) e, quando apto, renderiza o assistente
 * `WizardMatricula`. Extraído para ser reusado tanto no painel de matrícula
 * (/matricula) quanto inline no painel de inscrição (continuidade sem novo
 * login). O contexto é carregado ao montar — monte o bloco só quando o usuário
 * abrir a matrícula do candidato.
 */
export function BlocoMatriculaCandidato({
  candidato,
  onConcluir,
  onSessaoExpirada,
}: {
  candidato: CandidatoMatricula;
  onConcluir?: (resumo?: MatriculaResumo) => void;
  /** Chamado quando a sessão expira (401): o container volta ao login por CPF. */
  onSessaoExpirada?: () => void;
}) {
  const [ctx, setCtx] = useState<EstadoContexto>(undefined);

  const carregar = useCallback(async () => {
    setCtx("carregando");
    try {
      const res = await fetch(
        `/api/matricula/contexto?numeroInscricao=${candidato.numeroInscricao ?? ""}&idps=${candidato.idps ?? ""}`,
        { cache: "no-store" },
      );
      if (res.status === 401 && onSessaoExpirada) {
        onSessaoExpirada();
        return;
      }
      const data = (await res.json()) as
        | ({ ok: true } & Contexto)
        | { ok: false };
      setCtx(data.ok ? data : "erro");
    } catch {
      setCtx("erro");
    }
  }, [candidato.numeroInscricao, candidato.idps, onSessaoExpirada]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (ctx === "carregando" || ctx === undefined) {
    return (
      <p className="text-sm text-cinza-suave">Carregando dados da matrícula…</p>
    );
  }

  if (ctx === "erro") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-csa-vermelho">
          Não foi possível carregar a matrícula deste candidato agora.
        </p>
        <button
          type="button"
          onClick={() => void carregar()}
          className={botaoSecundario}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!ctx.elegivel) {
    return (
      <p className="text-sm text-cinza-suave">
        Este candidato ainda não está apto à matrícula pelo portal.
      </p>
    );
  }

  if (
    ctx.idAreaOfertada == null ||
    ctx.parametros == null ||
    candidato.numeroInscricao == null ||
    candidato.idps == null
  ) {
    return (
      <p className="text-sm text-cinza-suave">
        Não foi possível preparar a matrícula deste candidato agora. Tente
        novamente em instantes.
      </p>
    );
  }

  return (
    <WizardMatricula
      candidato={{
        codUsuarioPS: candidato.codUsuarioPS,
        nome: candidato.nome,
        numeroInscricao: candidato.numeroInscricao,
        idps: candidato.idps,
      }}
      idAreaOfertada={ctx.idAreaOfertada}
      parametros={ctx.parametros}
      periodoAberto={ctx.periodo?.aberto ?? false}
      periodo={ctx.periodo}
      onConcluir={onConcluir ?? (() => {})}
      onSessaoExpirada={onSessaoExpirada}
    />
  );
}
