"use client";

import { useCallback, useEffect, useState } from "react";
import { BlocoMatriculaCandidato } from "./BlocoMatriculaCandidato";

interface CandidatoElegivel {
  codUsuarioPS: number;
  nome: string;
  numeroInscricao: number | null;
  idps: number | null;
  idAreaInteresse: number | null;
  statusOpcao: number | null;
  nomeProcesso: string | null;
}

const botaoSecundario = "w-full text-sm text-cinza-suave hover:text-grafite";

// NUMEROINSCRICAO é sequencial por PS — combinamos idps+número p/ chave única.
function chaveCand(c: {
  idps: number | null;
  numeroInscricao: number | null;
}): string {
  return `${c.idps ?? "x"}-${c.numeroInscricao ?? "x"}`;
}

/**
 * Rótulo da série a partir do NOME do processo seletivo. Remove o prefixo
 * institucional/ano e o código de segmento para exibir só a série.
 */
function rotuloProcesso(nomeProcesso: string | null): string | null {
  if (!nomeProcesso) return null;
  const limpo = nomeProcesso.replace(/^.*?\d{4}-(?:[A-Za-z]+\d+-)?/, "").trim();
  return limpo || nomeProcesso.trim();
}

/**
 * Painel de matrícula do responsável logado: lista os candidatos APROVADOS e
 * elegíveis à matrícula (SPSOPCAOINSCRITO.STATUS ∈ {5,7} e área com
 * DISPONIBILIZAMATRICULAPORTAL='T'), obtidos via /api/matricula/elegiveis.
 * Ao selecionar um candidato, carrega o contexto de matrícula
 * (/api/matricula/contexto) — parâmetros e período que dirigem o assistente.
 */
export function PainelMatricula({
  responsavelNome,
  onSair,
  onSessaoExpirada,
}: {
  responsavelNome: string;
  onSair?: () => void;
  /** Chamado quando a sessão expira (401): o container volta ao login por CPF. */
  onSessaoExpirada?: () => void;
}) {
  const [elegiveis, setElegiveis] = useState<CandidatoElegivel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/matricula/elegiveis", {
        cache: "no-store",
      });
      if (res.status === 401) {
        if (onSessaoExpirada) {
          onSessaoExpirada();
          return;
        }
        setErro("Sua sessão expirou. Recarregue a página e entre novamente.");
        return;
      }
      const data = (await res.json()) as
        | { ok: true; candidatos: CandidatoElegivel[] }
        | { ok: false };
      if (!data.ok) {
        setErro("Não foi possível carregar os candidatos agora.");
        return;
      }
      setElegiveis(data.candidatos);
    } catch {
      setErro("Não foi possível carregar os candidatos agora.");
    } finally {
      setCarregando(false);
    }
  }, [onSessaoExpirada]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function selecionar(c: CandidatoElegivel) {
    setSelecionado(chaveCand(c));
  }

  const candidatoAtual =
    selecionado != null
      ? (elegiveis.find((c) => chaveCand(c) === selecionado) ?? null)
      : null;

  // Tela dedicada da matrícula do candidato (sequência de passos do assistente).
  if (candidatoAtual) {
    const rotuloPs = rotuloProcesso(candidatoAtual.nomeProcesso);
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelecionado(null)}
          className="inline-flex items-center gap-1 text-sm font-medium text-csa-azul hover:underline"
        >
          <span aria-hidden>←</span> Voltar aos candidatos
        </button>

        <div className="rounded-lg bg-areia px-4 py-3">
          <p className="text-base font-semibold text-grafite">
            {candidatoAtual.nome}
          </p>
          {rotuloPs && (
            <p className="text-sm font-medium text-csa-azul">{rotuloPs}</p>
          )}
          {candidatoAtual.numeroInscricao && (
            <p className="text-sm text-cinza-suave">
              Inscrição nº {candidatoAtual.numeroInscricao}
            </p>
          )}
        </div>

        <BlocoMatriculaCandidato
          candidato={{
            codUsuarioPS: candidatoAtual.codUsuarioPS,
            nome: candidatoAtual.nome,
            numeroInscricao: candidatoAtual.numeroInscricao,
            idps: candidatoAtual.idps,
          }}
          onConcluir={() => {
            setSelecionado(null);
            void carregar();
          }}
          onSessaoExpirada={onSessaoExpirada}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-areia px-4 py-3 text-sm">
        <p className="text-grafite">
          Olá, <strong>{responsavelNome}</strong>.
        </p>
        <p className="text-cinza-suave">
          {elegiveis.length > 0
            ? "Os candidatos abaixo estão aptos à matrícula."
            : "No momento não há candidatos aptos à matrícula neste acesso."}
        </p>
      </div>

      {carregando && (
        <p className="text-sm text-cinza-suave">Carregando candidatos…</p>
      )}

      {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}

      {!carregando && !erro && elegiveis.length === 0 && (
        <div className="rounded-lg border border-black/10 bg-white px-4 py-4 text-sm text-cinza-suave">
          <p>
            A matrícula fica disponível aqui assim que o resultado do processo
            seletivo for divulgado e o candidato for convocado. Se você já
            recebeu a convocação, verifique se está usando o CPF do responsável
            correto.
          </p>
        </div>
      )}

      {!carregando && elegiveis.length > 0 && (
        <ul className="space-y-2">
          {elegiveis.map((c, i) => {
            const chave = chaveCand(c);
            const rotuloPs = rotuloProcesso(c.nomeProcesso);
            return (
              <li
                key={`${c.codUsuarioPS}-${chave}-${i}`}
                className="overflow-hidden rounded-lg border border-black/10 bg-white text-sm shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => selecionar(c)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-areia/60"
                >
                  <div>
                    <p className="font-medium text-grafite">{c.nome}</p>
                    {rotuloPs && (
                      <p className="font-medium text-csa-azul">{rotuloPs}</p>
                    )}
                    <p className="text-cinza-suave">
                      {c.numeroInscricao
                        ? `Inscrição nº ${c.numeroInscricao}`
                        : "Inscrição não localizada"}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-csa-azul">
                    Ver matrícula <span aria-hidden>→</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={onSair} className={botaoSecundario}>
          Sair
        </button>
      </div>
    </div>
  );
}
