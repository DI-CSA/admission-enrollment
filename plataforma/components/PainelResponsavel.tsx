"use client";

import { useCallback, useEffect, useState } from "react";
import { WizardInscricao } from "@/components/WizardInscricao";

interface Dependente {
  idUsuario: number | null;
  nome: string;
  dependente: boolean;
  numeroInscricao: number | null;
  idps: number | null;
  nomeProcesso: string | null;
  codPrograma: string | null;
}

interface Boleto {
  numeroInscricao: number;
  idBoleto: number | null;
  tipoBoleto: string | null;
  boletoRegistrado: boolean;
  urlBoletoFixo: string | null;
  temPdf: boolean;
}

const botaoPrimario =
  "w-full rounded-full bg-csa-dourado px-6 py-2.5 text-sm font-semibold text-csa-azul shadow-sm transition hover:bg-csa-dourado-escuro disabled:opacity-60";
const botaoContorno =
  "w-full rounded-full border border-csa-azul/30 px-6 py-2.5 text-sm font-semibold text-csa-azul transition hover:bg-csa-azul/5 disabled:opacity-60";
// Ação de boleto (transacional/financeira): azul sólido, distinta do CTA dourado
// de "Inscrever outro candidato" para não competirem visualmente.
const botaoBoleto =
  "block w-full rounded-full bg-csa-azul px-6 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-csa-azul-claro disabled:opacity-60";
const botaoSecundario = "w-full text-sm text-cinza-suave hover:text-grafite";

/**
 * Rótulo da série a partir do NOME do processo seletivo (SPSPROCESSOSELETIVO.NOME,
 * ex.: "CSA Leblon - Processo Seletivo 2027-F3-3º Ano do Fund."). Remove o prefixo
 * institucional/ano e o código de segmento (F3-/M1-) para exibir só a série. Cai
 * para o nome completo se o padrão não casar.
 */
function rotuloProcesso(nomeProcesso: string | null): string | null {
  if (!nomeProcesso) return null;
  const limpo = nomeProcesso.replace(/^.*?\d{4}-(?:[A-Za-z]+\d+-)?/, "").trim();
  return limpo || nomeProcesso.trim();
}

// Chave de estado por dependente. O NUMEROINSCRICAO é sequencial POR PS (não é
// único entre processos), então combinamos idps+número para evitar colisão entre
// candidatos de séries diferentes com o mesmo número de inscrição.
function chaveDep(d: {
  idps: number | null;
  numeroInscricao: number | null;
}): string {
  return `${d.idps ?? "x"}-${d.numeroInscricao ?? "x"}`;
}

/**
 * Painel do responsável logado: lista os candidatos já cadastrados (com nº de
 * inscrição e boleto) e permite inscrever um novo candidato. Os dados vêm do
 * EduPS (CentralCandidato/v1/CandidatosDependentes) via BFF autenticado.
 */
export function PainelResponsavel({
  idps,
  responsavelNome,
  onSair,
}: {
  idps: number;
  responsavelNome: string;
  onSair?: () => void;
}) {
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [inscrevendo, setInscrevendo] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [boletos, setBoletos] = useState<
    Record<string, Boleto | "carregando" | "erro">
  >({});
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const [baixandoComprovante, setBaixandoComprovante] = useState(false);
  const [erroComprovante, setErroComprovante] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async (opts?: { silencioso?: boolean }) => {
    // Refresh silencioso: mantém a lista atual visível (sem trocar para o estado
    // "Carregando…"), evitando o "pisca" da tela ao atualizar.
    if (opts?.silencioso) setAtualizando(true);
    else setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/inscricao/minhas", { cache: "no-store" });
      if (res.status === 401) {
        setErro("Sua sessão expirou. Recarregue a página e entre novamente.");
        return;
      }
      const data = (await res.json()) as
        | { ok: true; dependentes: Dependente[] }
        | { ok: false };
      if (!data.ok) {
        setErro("Não foi possível carregar seus candidatos agora.");
        return;
      }
      setDependentes(data.dependentes);
    } catch {
      setErro("Não foi possível carregar seus candidatos agora.");
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const carregarBoleto = useCallback(async (dep: Dependente) => {
    const chave = chaveDep(dep);
    const numeroInscricao = dep.numeroInscricao!;
    setBoletos((b) => ({ ...b, [chave]: "carregando" }));
    try {
      const res = await fetch(
        `/api/inscricao/boleto?numeroInscricao=${numeroInscricao}&idps=${dep.idps ?? ""}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { ok: boolean; boleto?: Boleto };
      setBoletos((b) => ({
        ...b,
        [chave]: data.ok && data.boleto ? data.boleto : "erro",
      }));
    } catch {
      setBoletos((b) => ({ ...b, [chave]: "erro" }));
    }
  }, []);

  function selecionar(dep: Dependente) {
    setErroPdf(null);
    setErroComprovante(null);
    const chave = chaveDep(dep);
    if (selecionado === chave) {
      setSelecionado(null);
      return;
    }
    setSelecionado(chave);
    if (!boletos[chave]) void carregarBoleto(dep);
  }

  async function baixarBoletoPdf(idBoleto: number) {
    setErroPdf(null);
    setBaixandoPdf(true);
    try {
      const res = await fetch(`/api/inscricao/boleto/pdf?idBoleto=${idBoleto}`);
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as {
          mensagem?: string;
        } | null;
        setErroPdf(
          d?.mensagem ??
            "Não foi possível gerar o boleto agora. Tente novamente mais tarde.",
        );
        return;
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch {
      setErroPdf(
        "Não foi possível gerar o boleto agora. Tente novamente mais tarde.",
      );
    } finally {
      setBaixandoPdf(false);
    }
  }

  // Comprovante de inscrição em PDF (GET /api/inscricao/comprovante).
  async function baixarComprovante(
    numeroInscricao: number,
    idps: number | null,
  ) {
    setErroComprovante(null);
    setBaixandoComprovante(true);
    try {
      const res = await fetch(
        `/api/inscricao/comprovante?numeroInscricao=${numeroInscricao}&idps=${idps ?? ""}`,
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as {
          mensagem?: string;
        } | null;
        setErroComprovante(
          d?.mensagem ??
            "Não foi possível gerar o comprovante agora. Tente novamente mais tarde.",
        );
        return;
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch {
      setErroComprovante(
        "Não foi possível gerar o comprovante agora. Tente novamente mais tarde.",
      );
    } finally {
      setBaixandoComprovante(false);
    }
  }
  if (inscrevendo) {
    return (
      <WizardInscricao
        idps={idps}
        responsavelNome={responsavelNome}
        onConcluir={() => {
          setInscrevendo(false);
          void carregar();
        }}
      />
    );
  }

  // ---- Painel ---------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-areia px-4 py-3 text-sm">
        <p className="text-grafite">
          Olá, <strong>{responsavelNome}</strong>.
        </p>
        <p className="text-cinza-suave">
          {dependentes.length > 0
            ? "Acompanhe os candidatos que você inscreveu."
            : "Você ainda não inscreveu nenhum candidato."}
        </p>
      </div>

      {carregando && (
        <p className="text-sm text-cinza-suave">Carregando seus candidatos…</p>
      )}

      {!carregando && dependentes.length > 0 && (
        <ul className="space-y-2">
          {dependentes.map((d, i) => {
            const chave = chaveDep(d);
            const aberto = d.numeroInscricao != null && selecionado === chave;
            const boleto = d.numeroInscricao ? boletos[chave] : undefined;
            const rotuloPs = rotuloProcesso(d.nomeProcesso);
            return (
              <li
                key={`${d.idUsuario ?? "x"}-${chave}-${i}`}
                className="overflow-hidden rounded-lg border border-black/10 bg-white text-sm shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => d.numeroInscricao && selecionar(d)}
                  disabled={!d.numeroInscricao}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-areia/60 disabled:cursor-default"
                >
                  <div>
                    <p className="font-medium text-grafite">{d.nome}</p>
                    {rotuloPs && (
                      <p className="font-medium text-csa-azul">{rotuloPs}</p>
                    )}
                    <p className="text-cinza-suave">
                      {d.numeroInscricao
                        ? `Inscrição nº ${d.numeroInscricao}`
                        : "Inscrição não localizada"}
                    </p>
                  </div>
                  {d.numeroInscricao && (
                    <span className="shrink-0 text-xs font-medium text-csa-azul">
                      {aberto ? "Ocultar" : "Ver detalhes"}
                    </span>
                  )}
                </button>

                {aberto && d.numeroInscricao && (
                  <div className="space-y-3 border-t border-black/10 px-4 py-3">
                    <div className="space-y-2 rounded-lg bg-areia px-3 py-3">
                      <p className="font-medium text-grafite">
                        Boleto da taxa de inscrição
                      </p>
                      {boleto === "carregando" ? (
                        <p className="text-cinza-suave">Carregando boleto…</p>
                      ) : boleto && boleto !== "erro" ? (
                        boleto.temPdf && boleto.idBoleto ? (
                          <>
                            <button
                              type="button"
                              onClick={() => baixarBoletoPdf(boleto.idBoleto!)}
                              disabled={baixandoPdf}
                              className={botaoBoleto}
                            >
                              {baixandoPdf
                                ? "Gerando boleto…"
                                : "Baixar boleto (PDF)"}
                            </button>
                            {erroPdf && (
                              <p className="text-xs text-csa-vermelho">
                                {erroPdf}
                              </p>
                            )}
                          </>
                        ) : boleto.urlBoletoFixo ? (
                          <a
                            href={boleto.urlBoletoFixo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={botaoBoleto}
                          >
                            Abrir boleto
                          </a>
                        ) : (
                          <p className="text-cinza-suave">
                            Boleto indisponível no momento. Você poderá emiti-lo
                            depois na central do candidato.
                          </p>
                        )
                      ) : (
                        <div className="space-y-2">
                          <p className="text-cinza-suave">
                            O boleto ainda está sendo gerado. Tente atualizar em
                            instantes.
                          </p>
                          <button
                            type="button"
                            onClick={() => carregarBoleto(d)}
                            className={botaoSecundario}
                          >
                            Atualizar boleto
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 rounded-lg bg-areia px-3 py-3">
                      <p className="font-medium text-grafite">
                        Comprovante de inscrição
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          baixarComprovante(d.numeroInscricao!, d.idps)
                        }
                        disabled={baixandoComprovante}
                        className={botaoBoleto}
                      >
                        {baixandoComprovante
                          ? "Gerando comprovante…"
                          : "Baixar comprovante (PDF)"}
                      </button>
                      {erroComprovante && (
                        <p className="text-xs text-csa-vermelho">
                          {erroComprovante}
                        </p>
                      )}
                    </div>

                    {d.codPrograma && (
                      <div className="space-y-2 rounded-lg bg-areia px-3 py-3">
                        <p className="font-medium text-grafite">
                          Programação das avaliações
                        </p>
                        <a
                          href={`/api/programas/${d.codPrograma}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={botaoBoleto}
                        >
                          Baixar programação (PDF)
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}

      <button
        type="button"
        onClick={() => {
          setErro(null);
          setInscrevendo(true);
        }}
        className={botaoPrimario}
      >
        {dependentes.length > 0
          ? "Inscrever outro candidato"
          : "Inscrever candidato"}
      </button>

      {!carregando && (
        <button
          type="button"
          onClick={() => void carregar({ silencioso: true })}
          disabled={atualizando}
          className={botaoContorno}
        >
          {atualizando ? "Atualizando…" : "Atualizar lista"}
        </button>
      )}

      {onSair && (
        <button type="button" onClick={onSair} className={botaoContorno}>
          Sair
        </button>
      )}
    </div>
  );
}
