"use client";

import { useCallback, useEffect, useState } from "react";

interface CandidatoElegivel {
  codUsuarioPS: number;
  nome: string;
  numeroInscricao: number | null;
  idps: number | null;
  idAreaInteresse: number | null;
  statusOpcao: number | null;
  nomeProcesso: string | null;
}

interface ParametrosMatricula {
  idAreaOfertada: number | null;
  cadastraContrato: boolean;
  utilizaTokenAssinaturaContrato: boolean;
  permiteEnvioDeDocumentos: boolean;
  exibirItinerario: boolean;
  fichaMedicaFlexivelHabilitada: boolean;
  textoInstrucoes: string | null;
}

interface PeriodoMatricula {
  aberto: boolean;
  dataInicio: string | null;
  dataFim: string | null;
}

interface Contexto {
  elegivel: boolean;
  idAreaOfertada: number | null;
  parametros: ParametrosMatricula | null;
  periodo: PeriodoMatricula | null;
}

type EstadoContexto = Contexto | "carregando" | "erro" | undefined;

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
}: {
  responsavelNome: string;
  onSair?: () => void;
}) {
  const [elegiveis, setElegiveis] = useState<CandidatoElegivel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [contextos, setContextos] = useState<Record<string, EstadoContexto>>(
    {},
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/matricula/elegiveis", {
        cache: "no-store",
      });
      if (res.status === 401) {
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
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const carregarContexto = useCallback(async (c: CandidatoElegivel) => {
    const chave = chaveCand(c);
    setContextos((m) => ({ ...m, [chave]: "carregando" }));
    try {
      const res = await fetch(
        `/api/matricula/contexto?numeroInscricao=${c.numeroInscricao ?? ""}&idps=${c.idps ?? ""}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as
        | ({ ok: true } & Contexto)
        | { ok: false };
      setContextos((m) => ({
        ...m,
        [chave]: data.ok ? data : "erro",
      }));
    } catch {
      setContextos((m) => ({ ...m, [chave]: "erro" }));
    }
  }, []);

  function selecionar(c: CandidatoElegivel) {
    const chave = chaveCand(c);
    if (selecionado === chave) {
      setSelecionado(null);
      return;
    }
    setSelecionado(chave);
    if (!contextos[chave]) void carregarContexto(c);
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
            const aberto = selecionado === chave;
            const ctx = contextos[chave];
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
                  <span className="shrink-0 text-xs font-medium text-csa-azul">
                    {aberto ? "Ocultar" : "Ver matrícula"}
                  </span>
                </button>

                {aberto && (
                  <div className="space-y-3 border-t border-black/10 px-4 py-3">
                    {ctx === "carregando" || ctx === undefined ? (
                      <p className="text-cinza-suave">
                        Carregando dados da matrícula…
                      </p>
                    ) : ctx === "erro" ? (
                      <div className="space-y-2">
                        <p className="text-csa-vermelho">
                          Não foi possível carregar a matrícula deste candidato
                          agora.
                        </p>
                        <button
                          type="button"
                          onClick={() => carregarContexto(c)}
                          className={botaoSecundario}
                        >
                          Tentar novamente
                        </button>
                      </div>
                    ) : !ctx.elegivel ? (
                      <p className="text-cinza-suave">
                        Este candidato ainda não está apto à matrícula pelo
                        portal.
                      </p>
                    ) : (
                      <div className="space-y-2 rounded-lg bg-areia px-3 py-3">
                        <p className="font-medium text-grafite">
                          Candidato apto à matrícula.
                        </p>
                        {ctx.periodo && !ctx.periodo.aberto && (
                          <p className="text-csa-vermelho">
                            O período de matrícula não está aberto no momento.
                          </p>
                        )}
                        {ctx.parametros?.textoInstrucoes && (
                          <p className="whitespace-pre-line text-cinza-suave">
                            {ctx.parametros.textoInstrucoes}
                          </p>
                        )}
                        <p className="text-xs text-cinza-suave">
                          O assistente de matrícula será habilitado nesta etapa.
                        </p>
                      </div>
                    )}
                  </div>
                )}
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
