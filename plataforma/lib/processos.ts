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

// Ano-base dos processos seletivos de admissão. A "chave" para listar as opções no
// portal é o ano no NOME do PS (ex.: "...2027..."): há um PS por ano/série, do 1º Ano
// do Fundamental à 2ª Série do Médio. Atualize ao virar o ciclo de admissão.
export const ANO_PROCESSO = 2027;

export const PROCESSOS: Record<ChaveProcesso, Processo> = {
  fundamental1: {
    chave: "fundamental1",
    rotulo: "1º Ano do Ensino Fundamental",
    selo: "Anos Iniciais",
    descricao:
      "A porta de entrada no Ensino Fundamental. Uma fase de descobertas — a leitura, " +
      "a escrita, os números, um novo idioma e o Carisma Agostiniano.",
    edital: "/editais/edital-2027-f1.pdf",
    codColigada: 1,
    codFilial: 1,
    // IDPS 210 — "CSA Leblon - Processo Seletivo 2027-1º Ano do Fundamental"
    // (R$200; inscrições 01/07/2026→04/04/2027). Confirmado direto no CorporeRM.
    // OBS: EXIBENOPORTAL='F' no RM — publicar o PS no portal antes de divulgar o link.
    ps: 210,
  },
  demais: {
    chave: "demais",
    rotulo: "2º Ano do Fundamental à 2ª Série do Ensino Médio",
    selo: "Anos Iniciais · Finais · Ensino Médio",
    descricao:
      "Para as demais séries com vagas disponíveis, dos Anos Iniciais ao Ensino Médio. " +
      "Formação acadêmica de excelência aliada a valores cristãos.",
    edital: "/editais/edital-2027-F2-M2.pdf",
    codColigada: 1,
    codFilial: 1,
    // IDPS 212 — "F2-M2-2027" (2º Ano do Fundamental → 2ª Série do Ensino Médio;
    // "demais séries"). STATUS='T'/EXIBENOPORTAL='T', R$200. Confirmado no
    // CorporeRM (homolog). OBS: os IDs de PS mudam por ambiente — confirmar o
    // IDPS de produção antes de divulgar o link.
    ps: 212,
  },
};

export const listaProcessos: Processo[] = Object.values(PROCESSOS);

/** Monta o deep-link para o Portal do Processo Seletivo (TOTVS RM) — Fase 1. */
export function urlInscricao(p: Processo): string {
  return `${PORTAL_BASE}?c=${p.codColigada}&f=${p.codFilial}&ps=${p.ps}#/eb/informacoes`;
}
