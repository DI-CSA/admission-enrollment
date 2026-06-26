// Configuração dos Processos Seletivos do Portal de Inscrições (CSA Leblon · 2027).
//
// O hot site É o portal de inscrições: cada card da landing corresponde a um PS no RM.
// Na Fase 1, o CTA "Inscrever" faz deep-link ao portal TOTVS existente usando estes IDs.
// Na Fase 2, o mesmo módulo passará a rodar o fluxo nativo (apontando para /inscricoes).
//
// IMPORTANTE: os valores de `ps` mudam a cada processo. Confirme os IDs de 2027 com
// quem configura o RM e atualize APENAS aqui — nenhum link fica espalhado pelo código.

export type ChaveProcesso = "fundamental1" | "demais";

export interface Processo {
  chave: ChaveProcesso;
  rotulo: string;
  selo: string;
  descricao: string;
  edital: string;
  codColigada: number;
  codFilial: number;
  ps: number; // ← ID do Processo Seletivo de 2027 (CONFIRMAR no RM)
}

export const PORTAL_BASE =
  "https://portal.csa.com.br/FrameHTML/web/app/Edu/PortalProcessoSeletivo/";

export const PROCESSOS: Record<ChaveProcesso, Processo> = {
  fundamental1: {
    chave: "fundamental1",
    rotulo: "1º Ano do Ensino Fundamental",
    selo: "Anos Iniciais · Alfabetização",
    descricao:
      "A porta de entrada no Ensino Fundamental. Uma fase de descobertas — a leitura, " +
      "a escrita, os números, um novo idioma e o Carisma Agostiniano.",
    edital: "/editais/edital-1ano-fundamental.pdf",
    codColigada: 1,
    codFilial: 1,
    ps: 0, // TODO: preencher com o ps de 2027
  },
  demais: {
    chave: "demais",
    rotulo: "2º Ano do Fundamental à 2ª Série do Ensino Médio",
    selo: "Anos Iniciais · Finais · Ensino Médio",
    descricao:
      "Para as demais séries com vagas disponíveis, dos Anos Iniciais ao Ensino Médio. " +
      "Formação acadêmica de excelência aliada a valores cristãos.",
    edital: "/editais/edital-2ano-a-2serie.pdf",
    codColigada: 1,
    codFilial: 1,
    ps: 0, // TODO: preencher com o ps de 2027
  },
};

export const listaProcessos: Processo[] = Object.values(PROCESSOS);

/** Monta o deep-link para o Portal do Processo Seletivo (TOTVS RM) — Fase 1. */
export function urlInscricao(p: Processo): string {
  return `${PORTAL_BASE}?c=${p.codColigada}&f=${p.codFilial}&ps=${p.ps}#/eb/informacoes`;
}
