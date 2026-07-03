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
  situacaoCodigo: number | null;
  situacaoDescricao: string | null;
  codColigada: number | null;
  idAreaInteresse: number | null;
  pagamento: SituacaoPagamento | null;
  // Pontos de atenção (rótulos prontos) — ex.: mensagem da secretaria sobre
  // documento. Alimenta o sininho de alerta na listagem.
  atencoes?: string[] | null;
}

interface SituacaoPagamento {
  statusLan: number | null;
  pago: boolean;
  valorOriginal: number | null;
  valorPago: number | null;
  dataPagamento: string | null;
  dataVencimento: string | null;
}

interface Boleto {
  numeroInscricao: number;
  idBoleto: number | null;
  tipoBoleto: string | null;
  boletoRegistrado: boolean;
  urlBoletoFixo: string | null;
  temPdf: boolean;
}

// "STATUS DA INSCRIÇÃO" do comprovante (CentralCandidato/v1/StatusCadastro).
interface StatusCadastro {
  status: number | null;
  ordemExcedente: number | null;
}

type SituacaoDocumento = "entregue" | "em_analise" | "pendente";

interface DocumentoStatus {
  codDocumento: number | null;
  descricao: string;
  obrigatorio: boolean;
  observacao: string | null;
  situacao: SituacaoDocumento;
  podeSubstituir: boolean;
  nomeArquivo: string | null;
  chaveDownload: string | null;
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

// Formata uma data ISO (UTC) como dd/mm/aaaa em pt-BR, preservando o dia do
// calendário armazenado (sem deslocar por fuso). Retorna null se inválida.
function formatarDataBr(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Formata um valor numérico como moeda BRL (R$). Retorna null quando ausente.
function formatarBrl(v: number | null): string | null {
  if (v == null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Cor do badge da situação da inscrição conforme o código (SPSOPCAOINSCRITO.STATUS):
// chamada/aprovação (5,7,10) → verde; desclassificado/cancelado/ausente (2,3,4,8,9)
// → vermelho; demais (0 = aguardando análise) → azul institucional (neutro).
function classesSituacao(codigo: number | null): string {
  if (codigo != null && [5, 7, 10].includes(codigo))
    return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (codigo != null && [2, 3, 4, 8, 9].includes(codigo))
    return "bg-red-50 text-csa-vermelho ring-red-600/20";
  return "bg-csa-azul/10 text-csa-azul ring-csa-azul/20";
}

// Rótulo do "STATUS DA INSCRIÇÃO" (StatusCadastro.STATUS), fiel ao comprovante
// emitido pela EduPS. Espelha o portal nativo (centralcandidato-eb-list.view.html):
//   0 → inscrito, taxa ainda pendente; 1 → inscrição confirmada; 2 → excedente.
function rotuloStatusInscricao(s: StatusCadastro): string | null {
  if (s.status == null) return null;
  if (s.status === 0) return "Inscrito – Pagamento pendente";
  if (s.status === 1) return "Candidato (inscrição confirmada)";
  if (s.status === 2)
    return s.ordemExcedente != null
      ? `Excedente (nº ${s.ordemExcedente})`
      : "Excedente";
  return null;
}

// Cor do badge do STATUS DA INSCRIÇÃO: confirmada (1) → verde; excedente (2) →
// âmbar; inscrito/pagamento pendente (0) → azul institucional (neutro).
function classesStatusInscricao(status: number | null): string {
  if (status === 1) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (status === 2) return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-csa-azul/10 text-csa-azul ring-csa-azul/20";
}

// Rótulo/estilo da situação de um documento enviado.
const situacaoDoc: Record<
  SituacaoDocumento,
  { texto: string; classes: string }
> = {
  entregue: {
    texto: "Entregue",
    classes: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  em_analise: {
    texto: "Em análise",
    classes: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  pendente: {
    texto: "Pendente",
    classes: "bg-csa-azul/10 text-csa-azul ring-csa-azul/20",
  },
};

// Converte base64 puro num Blob para download no browser (espelha o b64toBlob do
// portal nativo). Usa o tipo genérico; o browser infere pela extensão do nome.
function base64ParaBlob(base64: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes]);
}

// Lê um File como base64 puro (sem o prefixo `data:...;base64,`).
function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result ?? "");
      const virgula = r.indexOf(",");
      resolve(virgula >= 0 ? r.slice(virgula + 1) : r);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
  // Estado visual do drawer (translate/opacidade). Separado de `selecionado`
  // (que controla a MONTAGEM) para permitir animar a SAÍDA antes de desmontar.
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [boletos, setBoletos] = useState<
    Record<string, Boleto | "carregando" | "erro">
  >({});
  const [documentos, setDocumentos] = useState<
    Record<string, DocumentoStatus[] | "carregando" | "erro">
  >({});
  const [statusInsc, setStatusInsc] = useState<
    Record<string, StatusCadastro | "carregando" | "erro">
  >({});
  // Estado de envio/erro por documento (chaveDep + '|' + descrição).
  const [enviandoDoc, setEnviandoDoc] = useState<Record<string, boolean>>({});
  const [erroDoc, setErroDoc] = useState<Record<string, string | null>>({});
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

  // Fecha o drawer de detalhes e limpa erros transitórios de download. Anima a
  // saída (translate) e só desmonta após a transição (~300ms).
  const fecharDetalhes = useCallback(() => {
    setDrawerAberto(false);
    setErroPdf(null);
    setErroComprovante(null);
    window.setTimeout(() => setSelecionado(null), 300);
  }, []);

  // Dispara a animação de ENTRADA no frame seguinte à montagem do drawer (o
  // primeiro paint fica fora da tela; o rAF troca para a posição aberta).
  useEffect(() => {
    if (!selecionado) return;
    const id = requestAnimationFrame(() => setDrawerAberto(true));
    return () => cancelAnimationFrame(id);
  }, [selecionado]);

  // Enquanto o drawer está aberto: fecha no Esc e trava o scroll do body (para
  // o fundo não rolar por baixo do painel).
  useEffect(() => {
    if (!selecionado) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharDetalhes();
    };
    document.addEventListener("keydown", onKey);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowAnterior;
    };
  }, [selecionado, fecharDetalhes]);

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

  // Carrega o STATUS DA INSCRIÇÃO via BFF (StatusCadastro). Como o NUMEROINSCRICAO
  // é sequencial por PS, o BFF re-autentica no idps da inscrição — mesma lógica
  // já usada por carregarBoleto/carregarDocumentos, por isso carregamos sob demanda.
  const carregarStatus = useCallback(async (dep: Dependente) => {
    const chave = chaveDep(dep);
    setStatusInsc((m) => ({ ...m, [chave]: "carregando" }));
    try {
      const res = await fetch(
        `/api/inscricao/status?numeroInscricao=${dep.numeroInscricao}&idps=${dep.idps ?? ""}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok: boolean;
        status?: StatusCadastro;
      };
      setStatusInsc((m) => ({
        ...m,
        [chave]: data.ok && data.status ? data.status : "erro",
      }));
    } catch {
      setStatusInsc((m) => ({ ...m, [chave]: "erro" }));
    }
  }, []);

  const carregarDocumentos = useCallback(async (dep: Dependente) => {
    const chave = chaveDep(dep);
    setDocumentos((m) => ({ ...m, [chave]: "carregando" }));
    try {
      const res = await fetch(
        `/api/inscricao/documentos?numeroInscricao=${dep.numeroInscricao}&idps=${dep.idps ?? ""}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok: boolean;
        documentos?: DocumentoStatus[];
      };
      setDocumentos((m) => ({
        ...m,
        [chave]: data.ok && data.documentos ? data.documentos : "erro",
      }));
    } catch {
      setDocumentos((m) => ({ ...m, [chave]: "erro" }));
    }
  }, []);

  // Baixa o arquivo enviado (JSON base64 → blob → nova aba).
  async function baixarDocumento(chaveDownload: string, nomeArquivo: string) {
    try {
      const res = await fetch(
        `/api/inscricao/documento-download?chave=${encodeURIComponent(chaveDownload)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok: boolean;
        arquivo?: { base64: string; nomeArquivo: string };
      };
      if (!data.ok || !data.arquivo) return;
      const blob = base64ParaBlob(data.arquivo.base64);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.arquivo.nomeArquivo || nomeArquivo || "documento";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silencioso: o botão continua disponível para nova tentativa
    }
  }

  // Substitui/envia o arquivo de um documento; ao concluir, recarrega a lista.
  async function substituirDoc(dep: Dependente, descricao: string, file: File) {
    const chave = chaveDep(dep);
    const chaveDoc = `${chave}|${descricao}`;
    setErroDoc((m) => ({ ...m, [chaveDoc]: null }));
    setEnviandoDoc((m) => ({ ...m, [chaveDoc]: true }));
    try {
      const arquivoBase64 = await arquivoParaBase64(file);
      const res = await fetch("/api/inscricao/documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroInscricao: dep.numeroInscricao,
          idps: dep.idps,
          descricao,
          nomeArquivo: file.name,
          arquivoBase64,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        erro?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        setErroDoc((m) => ({
          ...m,
          [chaveDoc]:
            data?.erro === "documento-conferido"
              ? "Este documento já foi conferido pela secretaria e não pode mais ser substituído."
              : data?.erro === "somente-leitura"
                ? "Envio de documentos indisponível no momento."
                : "Não foi possível enviar o arquivo agora. Tente novamente.",
        }));
        return;
      }
      await carregarDocumentos(dep);
    } catch {
      setErroDoc((m) => ({
        ...m,
        [chaveDoc]: "Não foi possível enviar o arquivo agora. Tente novamente.",
      }));
    } finally {
      setEnviandoDoc((m) => ({ ...m, [chaveDoc]: false }));
    }
  }

  function selecionar(dep: Dependente) {
    setErroPdf(null);
    setErroComprovante(null);
    const chave = chaveDep(dep);
    if (selecionado === chave) {
      fecharDetalhes();
      return;
    }
    setSelecionado(chave);
    if (!boletos[chave]) void carregarBoleto(dep);
    if (!documentos[chave]) void carregarDocumentos(dep);
    if (!statusInsc[chave]) void carregarStatus(dep);
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
            const docs = d.numeroInscricao ? documentos[chave] : undefined;
            const status = d.numeroInscricao ? statusInsc[chave] : undefined;
            const rotuloPs = rotuloProcesso(d.nomeProcesso);
            const atencoes = d.atencoes ?? [];
            const temAtencao = atencoes.length > 0;
            return (
              <li
                key={`${d.idUsuario ?? "x"}-${chave}-${i}`}
                className="overflow-hidden rounded-lg border border-black/10 bg-white text-sm shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => d.numeroInscricao && selecionar(d)}
                  disabled={!d.numeroInscricao}
                  className="group flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-areia/60 disabled:cursor-default"
                >
                  <div className="flex w-full items-center justify-between gap-3">
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
                      <div className="flex shrink-0 items-center gap-2">
                        {temAtencao && (
                          <span
                            className="relative inline-flex origin-top text-csa-dourado motion-safe:animate-sino"
                            title={atencoes.join(" • ")}
                            aria-label={`Pontos de atenção: ${atencoes.join("; ")}`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-5 w-5"
                            >
                              <path d="M10 2a1 1 0 0 1 1 1v.6a5 5 0 0 1 4 4.9v2.764l.894 1.789A1 1 0 0 1 15 14.5H5a1 1 0 0 1-.894-1.447L5 11.264V8.5a5 5 0 0 1 4-4.9V3a1 1 0 0 1 1-1Zm-2 14h4a2 2 0 1 1-4 0Z" />
                            </svg>
                            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-csa-vermelho opacity-75" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-csa-vermelho" />
                            </span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-csa-azul/10 px-3 py-1 text-xs font-semibold text-csa-azul transition group-hover:bg-csa-azul group-hover:text-white">
                          Ver detalhes
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      </div>
                    )}
                  </div>
                  {d.numeroInscricao &&
                    (d.situacaoDescricao || d.pagamento) && (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {d.situacaoDescricao && (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${classesSituacao(
                              d.situacaoCodigo,
                            )}`}
                          >
                            {d.situacaoDescricao}
                          </span>
                        )}
                        {d.pagamento && (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                              d.pagamento.pago
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                : "bg-amber-50 text-amber-700 ring-amber-600/20"
                            }`}
                          >
                            {d.pagamento.pago
                              ? formatarDataBr(d.pagamento.dataPagamento)
                                ? `Taxa paga em ${formatarDataBr(d.pagamento.dataPagamento)}`
                                : "Taxa paga"
                              : "Taxa em aberto"}
                          </span>
                        )}
                      </div>
                    )}
                </button>

                {aberto && d.numeroInscricao && (
                  <div
                    className="fixed inset-0 z-50 flex justify-end"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Detalhes da inscrição de ${d.nome}`}
                  >
                    <button
                      type="button"
                      aria-label="Fechar detalhes"
                      onClick={fecharDetalhes}
                      className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
                        drawerAberto ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <aside
                      className={`relative ml-auto flex h-full w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-out sm:max-w-md ${
                        drawerAberto ? "translate-x-0" : "translate-x-full"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-3">
                        <div>
                          <p className="font-semibold text-grafite">{d.nome}</p>
                          {rotuloPs && (
                            <p className="text-sm font-medium text-csa-azul">
                              {rotuloPs}
                            </p>
                          )}
                          <p className="text-xs text-cinza-suave">
                            Inscrição nº {d.numeroInscricao}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {status &&
                              status !== "carregando" &&
                              status !== "erro" &&
                              rotuloStatusInscricao(status) && (
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${classesStatusInscricao(
                                    status.status,
                                  )}`}
                                >
                                  {rotuloStatusInscricao(status)}
                                </span>
                              )}
                            {d.situacaoDescricao && (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${classesSituacao(
                                  d.situacaoCodigo,
                                )}`}
                              >
                                {d.situacaoDescricao}
                              </span>
                            )}
                            {d.pagamento && (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                                  d.pagamento.pago
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                    : "bg-amber-50 text-amber-700 ring-amber-600/20"
                                }`}
                              >
                                {d.pagamento.pago
                                  ? formatarDataBr(d.pagamento.dataPagamento)
                                    ? `Taxa paga em ${formatarDataBr(d.pagamento.dataPagamento)}`
                                    : "Taxa paga"
                                  : "Taxa em aberto"}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={fecharDetalhes}
                          aria-label="Fechar"
                          autoFocus
                          className="shrink-0 rounded-full bg-csa-azul p-2 text-white shadow-sm ring-1 ring-csa-azul/20 transition hover:bg-csa-azul-claro focus:outline-none focus-visible:ring-2 focus-visible:ring-csa-azul focus-visible:ring-offset-2"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-6 w-6"
                          >
                            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                        <div className="space-y-2 rounded-lg bg-areia px-3 py-3">
                          <p className="font-medium text-grafite">
                            Boleto da taxa de inscrição
                          </p>
                          {d.pagamento?.pago ? (
                            <p className="text-xs font-medium text-emerald-700">
                              Pagamento confirmado
                              {formatarDataBr(d.pagamento.dataPagamento)
                                ? ` em ${formatarDataBr(d.pagamento.dataPagamento)}`
                                : ""}
                              {formatarBrl(
                                d.pagamento.valorPago ??
                                  d.pagamento.valorOriginal,
                              )
                                ? ` — ${formatarBrl(
                                    d.pagamento.valorPago ??
                                      d.pagamento.valorOriginal,
                                  )}`
                                : ""}
                              .
                            </p>
                          ) : d.pagamento?.dataVencimento &&
                            formatarDataBr(d.pagamento.dataVencimento) ? (
                            <p className="text-xs text-cinza-suave">
                              Vencimento:{" "}
                              {formatarDataBr(d.pagamento.dataVencimento)}
                            </p>
                          ) : null}
                          {/* Pagamento confirmado: não faz sentido oferecer 2ª via
                             nem o fallback de "boleto sendo gerado". Só exibimos a
                             confirmação acima. */}
                          {!d.pagamento?.pago &&
                            (boleto === "carregando" ? (
                              <p className="text-cinza-suave">
                                Carregando boleto…
                              </p>
                            ) : boleto && boleto !== "erro" ? (
                              boleto.temPdf && boleto.idBoleto ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      baixarBoletoPdf(boleto.idBoleto!)
                                    }
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
                                  Boleto indisponível no momento. Você poderá
                                  emiti-lo depois na central do candidato.
                                </p>
                              )
                            ) : (
                              <div className="space-y-2">
                                <p className="text-cinza-suave">
                                  O boleto ainda está sendo gerado. Tente
                                  atualizar em instantes.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => carregarBoleto(d)}
                                  className={botaoSecundario}
                                >
                                  Atualizar boleto
                                </button>
                              </div>
                            ))}
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

                        <div className="space-y-2 rounded-lg bg-areia px-3 py-3">
                          <p className="font-medium text-grafite">Documentos</p>
                          {docs === "carregando" ? (
                            <p className="text-cinza-suave">
                              Carregando documentos…
                            </p>
                          ) : docs === "erro" ? (
                            <div className="space-y-2">
                              <p className="text-cinza-suave">
                                Não foi possível carregar os documentos agora.
                              </p>
                              <button
                                type="button"
                                onClick={() => void carregarDocumentos(d)}
                                className={botaoSecundario}
                              >
                                Tentar novamente
                              </button>
                            </div>
                          ) : Array.isArray(docs) && docs.length > 0 ? (
                            <ul className="space-y-2">
                              {docs.map((doc, di) => {
                                const chaveDoc = `${chave}|${doc.descricao}`;
                                const enviando = enviandoDoc[chaveDoc];
                                const erroEnvio = erroDoc[chaveDoc];
                                // Documento OPCIONAL ainda sem arquivo não é
                                // "pendência": mostramos "Opcional" (neutro) para não
                                // dar impressão de obrigação.
                                const est =
                                  !doc.obrigatorio &&
                                  doc.situacao === "pendente"
                                    ? {
                                        texto: "Opcional",
                                        classes:
                                          "bg-black/5 text-cinza-suave ring-black/10",
                                      }
                                    : situacaoDoc[doc.situacao];
                                return (
                                  <li
                                    key={`${doc.codDocumento ?? "d"}-${di}`}
                                    className="rounded-lg border border-black/10 bg-white px-3 py-2"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="font-medium text-grafite">
                                        {doc.descricao.replace(
                                          /^\s*\(\*\)\s*/,
                                          "",
                                        )}
                                        {doc.obrigatorio && (
                                          <span className="text-csa-vermelho">
                                            {" "}
                                            *
                                          </span>
                                        )}
                                      </p>
                                      <span
                                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${est.classes}`}
                                      >
                                        {est.texto}
                                      </span>
                                    </div>

                                    {doc.observacao && (
                                      <div className="mt-2 rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                        <span className="font-semibold">
                                          Observação da secretaria:
                                        </span>{" "}
                                        {doc.observacao}
                                      </div>
                                    )}

                                    {doc.nomeArquivo && doc.chaveDownload && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void baixarDocumento(
                                            doc.chaveDownload!,
                                            doc.nomeArquivo!,
                                          )
                                        }
                                        className="mt-1 block w-full text-center text-xs font-medium text-csa-azul underline underline-offset-2"
                                      >
                                        Baixar arquivo enviado (
                                        {doc.nomeArquivo})
                                      </button>
                                    )}

                                    {doc.podeSubstituir ? (
                                      <div className="mt-2 text-center">
                                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-csa-azul">
                                          <span className="rounded-full border border-csa-azul/30 px-3 py-1 transition hover:bg-csa-azul/5">
                                            {enviando
                                              ? "Enviando…"
                                              : doc.nomeArquivo
                                                ? "Substituir arquivo"
                                                : "Enviar arquivo"}
                                          </span>
                                          <input
                                            type="file"
                                            className="hidden"
                                            disabled={enviando}
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file)
                                                void substituirDoc(
                                                  d,
                                                  doc.descricao,
                                                  file,
                                                );
                                              e.target.value = "";
                                            }}
                                          />
                                        </label>
                                        {erroEnvio && (
                                          <p className="mt-1 text-xs text-csa-vermelho">
                                            {erroEnvio}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="mt-1 text-xs text-cinza-suave">
                                        Documento conferido pela secretaria —
                                        não pode ser substituído.
                                      </p>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-cinza-suave">
                              Nenhum documento a exibir para esta inscrição.
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
                    </aside>
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
