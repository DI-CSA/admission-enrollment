"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatarTelefone } from "@/lib/telefone";
import { apenasDigitos, formatarCpf } from "@/lib/cpf";
import { CODS_DOCS_OBRIGATORIOS_MATRICULA } from "@/lib/matricula-documentos";
import {
  MATRICULA_EXIBIR_PLANO_PAGAMENTO,
  MATRICULA_EXIBIR_MINUTA_CONTRATO,
  MATRICULA_DEBUG,
} from "@/lib/matricula-flags";
import type { MatriculaResumo } from "@/components/DetalhesMatricula";
import { LinhaDigitavelBoleto } from "@/components/LinhaDigitavelBoleto";
import { rastrearEventoMeta } from "@/lib/marketing/meta-client";
import { eventIdMatricula } from "@/lib/marketing/meta-event-id";
// ---------------------------------------------------------------------------
// Tipos (espelham lib/totvs/matricula.ts — redefinidos aqui porque aquele
// módulo é server-only e não pode ser importado em componente cliente).
// ---------------------------------------------------------------------------

export interface ParametrosMatriculaCliente {
  cadastraContrato: boolean;
  utilizaTokenAssinaturaContrato: boolean;
  permiteEnvioDeDocumentos: boolean;
  exibirItinerario: boolean;
  fichaMedicaFlexivelHabilitada: boolean;
  atualizaDadosFiliacao1: boolean;
  atualizaDadosFiliacao2: boolean;
  atualizaDadosResponsavelFinanceiro: boolean;
  atualizaDadosResponsavelAcademico: boolean;
  obrigaFiliacao1: boolean;
  obrigaFiliacao2: boolean;
  obrigaResponsavelFinanceiro: boolean;
  obrigaResponsavelAcademico: boolean;
  validarDebitosResponsavelFinanceiro: boolean;
  exibeEtapaFiador: boolean;
  codPlanoPgtoPadrao: string | null;
  alteraPlanoPagamentoPortal: boolean;
  codColigadaRelatorioContrato: number | null;
  idRelatorioContrato: number | null;
  idHabilitacaoFilial: number | null;
  textoInstrucoes: string | null;
}

interface CampoMatricula {
  grupo: string | null;
  idCampo: string | null;
  nomeCampo: string | null;
  visivelCandidato: boolean;
  obrigatorioCandidato: boolean;
  visivelResponsavel: boolean;
  obrigatorioResponsavel: boolean;
}

interface PessoaMatricula {
  codUsuarioPS: number | null;
  nome: string | null;
  cpf: string | null;
  email: string | null;
  tipoRelac: number | null;
  codUsuarioPSDep: number | null;
  bruto: Record<string, unknown>;
}

interface PlanoPagamento {
  codPlanoPgto: string | null;
  descricao: string | null;
  valor: number | null;
  numeroParcelas: number | null;
}

interface ItemLista {
  codigo: string;
  descricao: string;
}

interface DebitosResponsavelFinanceiro {
  cpf: string | null;
  possuiDebitos: boolean;
  bloqueia: boolean;
  mensagem: string | null;
}

interface DocumentoExigidoCliente {
  codDocumento: number | null;
  descricao: string | null;
  obrigatorio: boolean;
}

/**
 * Documento já enviado na inscrição que pode ser pré-anexado no passo de
 * documentos da matrícula (aparece primeiro, marcado como "aproveitado da
 * inscrição"). O arquivo em si fica no servidor — o cliente só conhece o nome e
 * o código de destino na matrícula.
 */
interface DocumentoReaproveitadoCliente {
  codDocumento: number;
  descricao: string | null;
  nomeArquivo: string;
  chaveDownload: string;
}

/**
 * Documento anexado pelo candidato no passo de documentos. O upload é feito
 * automaticamente ao selecionar o arquivo (feedback imediato), então cada item
 * carrega o status do envio ao RM.
 */
interface DocumentoSelecionado {
  nomeArquivo: string;
  arquivoBase64: string;
  status: "enviando" | "enviado" | "erro";
  erro?: string;
}

type TipoLista =
  | "paises"
  | "estados"
  | "municipios"
  | "estadoCivil"
  | "nacionalidade"
  | "corRaca"
  | "grauInstrucao"
  | "profissao"
  | "tipoRua"
  | "tipoBairro"
  | "tipoSanguineo";

// ---------------------------------------------------------------------------
// Motor de campos: mapeia o IdCampo (parametrização RM) para o campo SPSUSUARIO
// correspondente e o tipo de input. Campos desconhecidos caem para texto simples.
// ---------------------------------------------------------------------------

interface CampoDef {
  sps: string;
  tipo: "text" | "email" | "tel" | "date" | "select";
  lista?: TipoLista;
  /** Campo unívoco: bloqueia edição quando já vier preenchido. */
  unicidade?: boolean;
  /** Para municípios: campo que recebe o NOME (além do código). */
  campoNome?: string;
  /**
   * SPS do qual este campo depende:
   * - listas de municípios dependem da UF selecionada (ex.: ESTADONATAL);
   * - listas de estados dependem do país selecionado (ex.: IDPAISNATAL),
   *   reproduzindo o combo país→estado→cidade do portal nativo.
   */
  dependeDe?: string;
  /** Opções fixas (quando não é lista de apoio). */
  opcoes?: ItemLista[];
  /** Rótulo fixo que substitui o NomeCampo vindo da API. */
  rotulo?: string;
  /** Máscara de formatação aplicada ao valor digitado. */
  mascara?: "cep" | "telefone" | "cpf";
}

/** IDPAIS do Brasil na base RM (GPais); padrão da naturalidade/estado natal. */
const IDPAIS_BRASIL = "1";

const DEF_CAMPOS: Record<string, CampoDef> = {
  nome: { sps: "NOME", tipo: "text", unicidade: true },
  nomesocial: { sps: "NOMESOCIAL", tipo: "text" },
  apelido: { sps: "APELIDO", tipo: "text" },
  datanascimento: { sps: "DTNASCIMENTO", tipo: "date", unicidade: true },
  email: { sps: "EMAIL", tipo: "email" },
  cpf: { sps: "CPF", tipo: "text", unicidade: true, mascara: "cpf" },
  estadocivil: { sps: "ESTADOCIVIL", tipo: "select", lista: "estadoCivil" },
  estadonatal: {
    sps: "ESTADONATAL",
    tipo: "select",
    lista: "estados",
    unicidade: true,
    // O estado natal lista os estados do país natal (não fixo no Brasil):
    // evita país=Argentina com estado/cidade do Brasil.
    dependeDe: "IDPAISNATAL",
  },
  naturalidade: {
    sps: "CODNATURALIDADE",
    tipo: "select",
    lista: "municipios",
    unicidade: true,
    campoNome: "NATURALIDADE",
    dependeDe: "ESTADONATAL",
  },
  paisnatal: { sps: "IDPAISNATAL", tipo: "select", lista: "paises" },
  nacionalidade: {
    sps: "NACIONALIDADE",
    tipo: "select",
    lista: "nacionalidade",
    unicidade: true,
  },
  corraca: { sps: "CORRACA", tipo: "select", lista: "corRaca" },
  grauinstrucao: {
    sps: "GRAUINSTRUCAO",
    tipo: "select",
    lista: "grauInstrucao",
  },
  // O RM envia o IdCampo com um typo ("GrauIstrucao", sem o "n") em
  // CarregaCamposObrigatoriosMatricula — ver frmDadosCandidato.html nativo
  // (campoVisivel('GrauIstrucao', ...)). Mapeamos a chave com o typo para o
  // combo não cair no fallback de texto.
  grauistrucao: {
    sps: "GRAUINSTRUCAO",
    tipo: "select",
    lista: "grauInstrucao",
  },
  profissao: { sps: "CODPROFISSAO", tipo: "select", lista: "profissao" },
  regprofissional: {
    sps: "REGPROFISSIONAL",
    tipo: "text",
    rotulo: "Registro profissional",
  },
  tiposanguineo: { sps: "TIPOSANG", tipo: "select", lista: "tipoSanguineo" },
  sexo: {
    sps: "SEXO",
    tipo: "select",
    unicidade: true,
    opcoes: [
      { codigo: "M", descricao: "Masculino" },
      { codigo: "F", descricao: "Feminino" },
    ],
  },
  telefone1: {
    sps: "TELEFONE1",
    tipo: "tel",
    rotulo: "Telefone 1",
    mascara: "telefone",
  },
  telefone2: {
    sps: "TELEFONE2",
    tipo: "tel",
    rotulo: "Telefone 2",
    mascara: "telefone",
  },
  telefoneresidencial: {
    sps: "TELEFONE1",
    tipo: "tel",
    rotulo: "Telefone 1",
    mascara: "telefone",
  },
  telefonecelular: {
    sps: "TELEFONE2",
    tipo: "tel",
    rotulo: "Telefone 2",
    mascara: "telefone",
  },
  celular: {
    sps: "TELEFONE1",
    tipo: "tel",
    rotulo: "Telefone 1",
    mascara: "telefone",
  },
  telefonecomercial: {
    sps: "TELEFONE3",
    tipo: "tel",
    rotulo: "Telefone comercial",
    mascara: "telefone",
  },
  cep: { sps: "CEP", tipo: "text", mascara: "cep" },
  rua: { sps: "RUA", tipo: "text" },
  tiporua: { sps: "CODTIPORUA", tipo: "select", lista: "tipoRua" },
  numero: { sps: "NUMERO", tipo: "text" },
  complemento: { sps: "COMPLEMENTO", tipo: "text" },
  bairro: { sps: "BAIRRO", tipo: "text" },
  tipobairro: { sps: "CODTIPOBAIRRO", tipo: "select", lista: "tipoBairro" },
  cidade: {
    sps: "CODMUNICIPIO",
    tipo: "select",
    lista: "municipios",
    campoNome: "CIDADE",
    dependeDe: "ESTADO",
  },
  estado: { sps: "ESTADO", tipo: "select", lista: "estados" },
  pais: { sps: "IDPAIS", tipo: "select", lista: "paises" },
  // Documentos — carteira de identidade (RG)
  rgnumero: { sps: "CARTIDENTIDADE", tipo: "text" },
  rgdataemissao: { sps: "DTEMISSAOIDENT", tipo: "date" },
  rgorgaoemissor: { sps: "ORGEMISSORIDENT", tipo: "text" },
  rgestadoemissor: { sps: "UFCARTIDENT", tipo: "select", lista: "estados" },
  rgpaisemissor: { sps: "PAISCARTIDENT", tipo: "select", lista: "paises" },
  // Passaporte
  passaportenumero: { sps: "NPASSAPORTE", tipo: "text" },
  passaportedataemissao: { sps: "DTEMISSPASSAPORTE", tipo: "date" },
  passaportedatavalidade: { sps: "DTVALPASSAPORTE", tipo: "date" },
  passaportepaisorigem: { sps: "PAISORIGEM", tipo: "text" },
};

function defDoCampo(idCampo: string | null): CampoDef {
  const chave = (idCampo ?? "").toLowerCase();
  return (
    DEF_CAMPOS[chave] ?? { sps: (idCampo ?? "").toUpperCase(), tipo: "text" }
  );
}

// ---------------------------------------------------------------------------
// Rótulos legíveis dos grupos de campos. O RM devolve a chave técnica em
// GrupoCampo (ex.: "DadosBasicos") — nunca exibir isso cru na interface.
// ---------------------------------------------------------------------------

const ROTULO_GRUPO: Record<string, string> = {
  dadosbasicos: "Dados básicos",
  documentos: "Documentos",
  endereco: "Endereço",
  passaporte: "Passaporte",
  dadosestrangeiros: "Dados de estrangeiro",
  informacoesadicionais: "Informações adicionais",
};

// Rótulos dos passos VISÍVEIS da barra de progresso. As telas de pessoa
// (candidato/filiação/responsáveis) são agrupadas sob "Dados cadastrais".
const ROTULO_PASSO_VISIVEL: Record<string, string> = {
  apresentacao: "Apresentação",
  "dados-cadastrais": "Dados cadastrais",
  documentos: "Documentos",
  planos: "Plano de pagamento",
  contrato: "Contrato",
  finalizacao: "Conclusão",
};

// Campos SPSUSUARIO copiados pelo botão "usar endereço do candidato" — mesma
// lista do portal nativo (copiarEnderecoCandidato): endereço + contatos.
const CAMPOS_ENDERECO_SPS = [
  "CEP",
  "CODTIPORUA",
  "RUA",
  "NUMERO",
  "COMPLEMENTO",
  "CODTIPOBAIRRO",
  "BAIRRO",
  "IDPAIS",
  "ESTADO",
  "CODMUNICIPIO",
  "CIDADE",
  "TELEFONE1",
  "TELEFONE2",
  "TELEFONE3",
  "FAX",
];

function rotuloGrupo(grupo: string | null): string | null {
  if (!grupo) return null;
  const chave = grupo.toLowerCase();
  if (ROTULO_GRUPO[chave]) return ROTULO_GRUPO[chave];
  // Fallback: separa CamelCase em palavras e capitaliza a primeira letra.
  const legivel = grupo
    .replace(/([a-z\u00e0-\u00ff])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .trim();
  return legivel.charAt(0).toUpperCase() + legivel.slice(1);
}

/** Formata o CEP como #####-###. */
function formatarCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// ---------------------------------------------------------------------------
// Campos compostos (país/UF/município) — o RM devolve objetos aninhados no GET
// (ex.: ESTADOSENDERECO), mas GRAVA as colunas planas. Replica o round-trip do
// portal nativo (matricula.service.js): deriva as colunas planas na carga e
// remove os objetos compostos antes de gravar.
// ---------------------------------------------------------------------------

const CHAVES_COMPOSTAS: ReadonlyArray<string> = [
  "PAISESENDERECO",
  "ESTADOSENDERECO",
  "MUNICIPIOSENDERECO",
  "ESTADOSCARTIDENT",
  "PAISESCARTIDENT",
  "PAISTELEITOBJ",
  "ESTELEITOBJ",
  "PAISES",
  "ESTADOS",
  "MUNICIPIOS",
];

function objRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Deriva as colunas planas a partir dos objetos compostos vindos do GET. */
function normalizarComposites(
  rec: Record<string, unknown>,
): Record<string, unknown> {
  const r = { ...rec };
  const setSeVazio = (k: string, v: unknown) => {
    if (v != null && String(v).trim() !== "" && !valorSps(r, k).trim())
      r[k] = v;
  };
  const pais = objRec(r["PAISESENDERECO"]);
  if (pais) setSeVazio("IDPAIS", pais["IDPAIS"]);
  const uf = objRec(r["ESTADOSENDERECO"]);
  if (uf) setSeVazio("ESTADO", uf["CODETD"]);
  const mun = objRec(r["MUNICIPIOSENDERECO"]);
  if (mun) {
    setSeVazio("CODMUNICIPIO", mun["CODMUNICIPIO"]);
    setSeVazio("CIDADE", mun["NOMEMUNICIPIO"] ?? mun["CIDADE"]);
  }
  // País natal: a coluna lida é IDPAISESTADONATAL, mas a gravação usa IDPAISNATAL.
  setSeVazio("IDPAISNATAL", r["IDPAISESTADONATAL"]);
  const paisNatal = objRec(r["PAISES"]);
  if (paisNatal) setSeVazio("IDPAISNATAL", paisNatal["IDPAIS"]);
  const ufRg = objRec(r["ESTADOSCARTIDENT"]);
  if (ufRg) setSeVazio("UFCARTIDENT", ufRg["CODETD"]);
  const paisRg = objRec(r["PAISESCARTIDENT"]);
  if (paisRg) setSeVazio("PAISCARTIDENT", paisRg["IDPAIS"]);
  return r;
}

/** Remove os objetos compostos, deixando só as colunas planas para gravar. */
function removerComposites(
  rec: Record<string, unknown>,
): Record<string, unknown> {
  const r = { ...rec };
  for (const k of CHAVES_COMPOSTAS) delete r[k];
  return r;
}

// ---------------------------------------------------------------------------
// Papéis de pessoa e as flags de vínculo gravadas no SPSUSUARIO.
// ---------------------------------------------------------------------------

type Papel =
  | "candidato"
  | "filiacao1"
  | "filiacao2"
  | "respFinanceiro"
  | "respAcademico";

// O DataServer nativo (SalvaDadosDeTodosUsuarios) lê TODAS estas colunas de cada
// linha SPSUSUARIO; enviar só a flag do papel faz o DataSet não ter as demais
// colunas e o RM lança "A coluna 'EHRESPFIN' não pertence à tabela SPSUSUARIO".
// Por isso replicamos o matricula.service.js: as 6 flags em toda pessoa.
const FLAGS_PAPEL: Record<Papel, Record<string, string>> = {
  candidato: {
    EHCANDIDATO: "T",
    EHPAI: "F",
    EHMAE: "F",
    EHRESPFIN: "F",
    EHRESPACAD: "F",
    EHFIADOR: "F",
  },
  filiacao1: {
    EHCANDIDATO: "F",
    EHPAI: "T",
    EHMAE: "F",
    EHRESPFIN: "F",
    EHRESPACAD: "F",
    EHFIADOR: "F",
    TIPOFILIACAO: "P",
  },
  filiacao2: {
    EHCANDIDATO: "F",
    EHPAI: "F",
    EHMAE: "T",
    EHRESPFIN: "F",
    EHRESPACAD: "F",
    EHFIADOR: "F",
    TIPOFILIACAO: "M",
  },
  respFinanceiro: {
    EHCANDIDATO: "F",
    EHPAI: "F",
    EHMAE: "F",
    EHRESPFIN: "T",
    EHRESPACAD: "F",
    EHFIADOR: "F",
  },
  respAcademico: {
    EHCANDIDATO: "F",
    EHPAI: "F",
    EHMAE: "F",
    EHRESPFIN: "F",
    EHRESPACAD: "T",
    EHFIADOR: "F",
  },
};

// ---------------------------------------------------------------------------
// Estilos (tokens CSA, iguais ao WizardInscricao).
// ---------------------------------------------------------------------------

const inputBase =
  "w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20 disabled:bg-areia/60 disabled:text-cinza-suave";
const botaoPrimario =
  "w-full rounded-full bg-csa-dourado px-6 py-2.5 text-sm font-semibold text-csa-azul shadow-sm transition hover:bg-csa-dourado-escuro disabled:opacity-60";
const botaoBoleto =
  "block w-full rounded-full bg-csa-azul px-6 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-csa-azul-claro disabled:opacity-60";
const botaoSecundario = "w-full text-sm text-cinza-suave hover:text-grafite";

// ---------------------------------------------------------------------------
// Definição de passos.
// ---------------------------------------------------------------------------

type PassoId =
  | "apresentacao"
  | Papel
  | "documentos"
  | "planos"
  | "contrato"
  | "finalizacao";

interface Passo {
  id: PassoId;
  titulo: string;
  /** Para passos de pessoa. */
  papel?: Papel;
  /** Bloco obrigatório (exige pelo menos os campos obrigatórios preenchidos). */
  obrigatorioBloco?: boolean;
}

interface Candidato {
  codUsuarioPS: number;
  nome: string;
  numeroInscricao: number;
  idps: number;
}

interface Props {
  candidato: Candidato;
  idAreaOfertada: number;
  parametros: ParametrosMatriculaCliente;
  periodoAberto: boolean;
  periodo?: {
    aberto: boolean;
    dataInicio: string | null;
    dataFim: string | null;
    mensagem: string | null;
    bruto?: Record<string, unknown>;
  } | null;
  onConcluir?: (resumo?: MatriculaResumo) => void;
  /** Chamado quando a sessão expira (401): o container volta ao login por CPF. */
  onSessaoExpirada?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers de valor.
// ---------------------------------------------------------------------------

function valorSps(rec: Record<string, unknown>, sps: string): string {
  const v = rec[sps];
  return v == null ? "" : String(v);
}

function isoParaData(iso: string): string {
  if (!iso) return "";
  // "2020-09-05T00:00:00" | "2020-09-05" → "2020-09-05"
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function moeda(v: number | null): string {
  if (v == null) return "";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// A API (CarregaCamposObrigatoriosMatricula) não garante a ordem dos campos nem
// devolve o "país emissor" do RG como item próprio (no portal nativo ele divide
// a visibilidade com RGEstadoEmissor). Reproduzimos aqui a ordem do template
// oficial (frmDadosCandidato.html): reordenamos DENTRO de cada grupo e injetamos
// o país emissor logo após o estado emissor.

// Ordem desejada por IdCampo (minúsculo). Campos sem posição definida mantêm a
// ordem original, ao final do próprio grupo (ordenação estável).
const ORDEM_CAMPOS: Record<string, number> = {
  // Dados básicos
  nome: 0,
  datanascimento: 1,
  paisnatal: 2,
  estadonatal: 3,
  naturalidade: 4,
  nacionalidade: 5,
  email: 6,
  sexo: 7,
  // Documentos — carteira de identidade (RG)
  rgnumero: 10,
  rgdataemissao: 11,
  rgorgaoemissor: 12,
  rgestadoemissor: 13,
  rgpaisemissor: 14,
  // Endereço
  cep: 20,
  tiporua: 21,
  rua: 22,
  numero: 23,
  complemento: 24,
  tipobairro: 25,
  bairro: 26,
  pais: 27,
  estado: 28,
  cidade: 29,
  telefoneresidencial: 30,
  telefone1: 30,
  telefonecelular: 31,
  telefone2: 31,
  telefonecomercial: 32,
  // Passaporte
  passaportenumero: 40,
  passaportedataemissao: 41,
  passaportedatavalidade: 42,
  passaportepaisorigem: 43,
};

// O país emissor do RG não vem como parâmetro próprio: no portal nativo ele
// compartilha a visibilidade/obrigatoriedade de RGEstadoEmissor. O país natal,
// da mesma forma, compartilha a de EstadoNatal. Injetamos ambos como campos
// sintéticos, herdando as mesmas flags do campo "dono".
function injetarSinteticos(lista: CampoMatricula[]): CampoMatricula[] {
  const temId = (id: string) =>
    lista.some((c) => (c.idCampo ?? "").toLowerCase() === id);
  const temPaisNatal = temId("paisnatal");
  const temPaisEmissor = temId("rgpaisemissor");
  const out: CampoMatricula[] = [];
  for (const c of lista) {
    const k = (c.idCampo ?? "").toLowerCase();
    // País natal aparece ANTES do estado natal (compartilha EstadoNatal).
    if (k === "estadonatal" && !temPaisNatal) {
      out.push({ ...c, idCampo: "PaisNatal", nomeCampo: "País natal" });
    }
    out.push(c);
    // País emissor do RG aparece DEPOIS do estado emissor (RGEstadoEmissor).
    if (k === "rgestadoemissor" && !temPaisEmissor) {
      out.push({ ...c, idCampo: "RGPaisEmissor", nomeCampo: "País emissor" });
    }
  }
  return out;
}

// Ordena os campos dentro de cada grupo conforme ORDEM_CAMPOS, preservando a
// ordem de aparição dos grupos e a ordem relativa dos campos sem posição fixa.
function ordenarCampos(lista: CampoMatricula[]): CampoMatricula[] {
  const grupos: { chave: string; itens: CampoMatricula[] }[] = [];
  const indice = new Map<string, number>();
  for (const c of lista) {
    const g = c.grupo ?? "";
    let bucket = indice.get(g);
    if (bucket === undefined) {
      bucket = grupos.length;
      indice.set(g, bucket);
      grupos.push({ chave: g, itens: [] });
    }
    grupos[bucket].itens.push(c);
  }
  const rank = (c: CampoMatricula) =>
    ORDEM_CAMPOS[(c.idCampo ?? "").toLowerCase()] ?? Number.POSITIVE_INFINITY;
  const out: CampoMatricula[] = [];
  for (const grp of grupos) {
    const ordenado = grp.itens
      .map((c, i) => [c, i] as const)
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
      .map(([c]) => c);
    out.push(...ordenado);
  }
  return out;
}

// ===========================================================================

/**
 * Assistente de matrícula dirigido pela parametrização do PS
 * (ParametrosMatriculaAreaOfertada + CarregaCamposObrigatoriosMatricula). Os
 * passos e os campos são ligados/desligados pelas flags — nada é fixo. Grava
 * cada bloco de pessoa via /api/matricula/dados e efetiva em /api/matricula.
 */
export function WizardMatricula({
  candidato,
  idAreaOfertada,
  parametros,
  periodoAberto,
  onConcluir,
  onSessaoExpirada,
}: Props) {
  const { idps, numeroInscricao, codUsuarioPS } = candidato;

  // Passos derivados dos parâmetros ------------------------------------------
  const passos = useMemo<Passo[]>(() => {
    const lista: Passo[] = [
      { id: "apresentacao", titulo: "Boas-vindas" },
      {
        id: "candidato",
        papel: "candidato",
        titulo: "Candidato",
        obrigatorioBloco: true,
      },
    ];
    if (parametros.atualizaDadosFiliacao1)
      lista.push({
        id: "filiacao1",
        papel: "filiacao1",
        titulo: "Filiação 1",
        obrigatorioBloco: parametros.obrigaFiliacao1,
      });
    if (parametros.atualizaDadosFiliacao2)
      lista.push({
        id: "filiacao2",
        papel: "filiacao2",
        titulo: "Filiação 2",
        obrigatorioBloco: parametros.obrigaFiliacao2,
      });
    if (parametros.atualizaDadosResponsavelFinanceiro)
      lista.push({
        id: "respFinanceiro",
        papel: "respFinanceiro",
        titulo: "Responsável financeiro",
        obrigatorioBloco: parametros.obrigaResponsavelFinanceiro,
      });
    if (parametros.atualizaDadosResponsavelAcademico)
      lista.push({
        id: "respAcademico",
        papel: "respAcademico",
        titulo: "Responsável acadêmico",
        obrigatorioBloco: parametros.obrigaResponsavelAcademico,
      });
    // Entrega de documentos (envio-documentos): posição nativa entre os dados
    // cadastrais/itinerário e o plano de pagamento (matricula.service.js L369).
    if (parametros.permiteEnvioDeDocumentos)
      lista.push({ id: "documentos", titulo: "Documentos" });
    const mostraPlanos =
      parametros.cadastraContrato &&
      (parametros.alteraPlanoPagamentoPortal ||
        !!parametros.codPlanoPgtoPadrao);
    if (mostraPlanos)
      lista.push({ id: "planos", titulo: "Plano de pagamento" });
    if (parametros.cadastraContrato)
      lista.push({ id: "contrato", titulo: "Contrato" });
    lista.push({ id: "finalizacao", titulo: "Confirmação" });
    return lista;
  }, [parametros]);

  const [indice, setIndice] = useState(0);
  const passo = passos[indice];

  // Ao trocar de passo, rola a PÁGINA inteira para o topo (como no primeiro
  // acesso) — evita que o usuário fique perdido na parte de baixo da tela após
  // clicar em "Avançar"/"Voltar".
  const primeiroRender = useRef(true);
  useEffect(() => {
    if (primeiroRender.current) {
      primeiroRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [indice]);

  // Combo "quem é o responsável": guarda o papel de origem quando o usuário
  // reaproveita uma pessoa já cadastrada (filiação), o sentinela "novo" quando
  // opta por CADASTRAR outra pessoa, e "" quando ainda não escolheu.
  const [origemResp, setOrigemResp] = useState<
    Partial<Record<Papel, Papel | "novo" | "">>
  >({});

  // Numeração VISÍVEL: candidato + filiação + responsáveis contam como um único
  // passo "Dados cadastrais" (como no portal nativo da TOTVS); cada tela interna
  // é indicada como sub-etapa. Os demais passos têm número próprio.
  const grupoVisivel = (p: Passo | undefined): string =>
    p?.papel ? "dados-cadastrais" : (p?.id ?? "");
  const gruposVisiveis = useMemo(() => {
    const ordem: string[] = [];
    for (const p of passos) {
      const g = p.papel ? "dados-cadastrais" : p.id;
      if (!ordem.includes(g)) ordem.push(g);
    }
    return ordem;
  }, [passos]);
  const numeroVisivel = gruposVisiveis.indexOf(grupoVisivel(passo)) + 1;
  const totalVisivel = gruposVisiveis.length;
  const rotuloVisivel = ROTULO_PASSO_VISIVEL[grupoVisivel(passo)] ?? "";

  // Reuso de responsável (combo): quando o passo é de responsável e há uma
  // pessoa de origem escolhida, o formulário manual é ocultado e a gravação
  // reaproveita os dados/flags da pessoa escolhida.
  const passoEhResponsavel =
    passo?.papel === "respFinanceiro" || passo?.papel === "respAcademico";
  const origemResponsavel: Papel | "novo" | "" =
    (passo?.papel && origemResp[passo.papel]) || "";
  const reutilizandoResponsavel =
    passoEhResponsavel &&
    origemResponsavel !== "" &&
    origemResponsavel !== "novo";

  // Carregamento inicial: dados pessoais + campos ----------------------------
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [campos, setCampos] = useState<CampoMatricula[]>([]);
  const [registros, setRegistros] = useState<
    Record<Papel, Record<string, unknown>>
  >({} as Record<Papel, Record<string, unknown>>);
  const [originais, setOriginais] = useState<
    Record<Papel, Record<string, unknown>>
  >({} as Record<Papel, Record<string, unknown>>);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const res = await fetch(
        `/api/matricula/dados?numeroInscricao=${numeroInscricao}&idps=${idps}`,
        { cache: "no-store" },
      );
      if (res.status === 401) {
        if (onSessaoExpirada) {
          onSessaoExpirada();
          return;
        }
        setErroCarga("Sua sessão expirou. Entre novamente.");
        return;
      }
      const data = (await res.json()) as
        | { ok: true; pessoas: PessoaMatricula[]; campos: CampoMatricula[] }
        | { ok: false };
      if (!data.ok) {
        setErroCarga("Não foi possível carregar os dados da matrícula.");
        return;
      }
      setCampos(data.campos);

      const pessoas = data.pessoas;
      const candidatoRec =
        pessoas.find(
          (p) => p.codUsuarioPS != null && p.codUsuarioPS === codUsuarioPS,
        ) ??
        pessoas.find((p) => !p.tipoRelac) ??
        pessoas[0];

      // Separa os relacionados por TIPORELAC (enum EduPS: Pai=1, Mãe=2,
      // RespFin=3, RespAcad=4) e distribui pai/mãe entre filiação 1 e 2
      // PRESERVANDO o CODUSUARIOPS de cada um — reproduz resolveDadosResponsaveis
      // do nativo. Sem isso, editar a filiação 2 recria uma pessoa nova e o RM
      // recusa ("O usuário não pode ter mais do que dois pais").
      const pais = pessoas.filter((p) => p.tipoRelac === 1);
      const maes = pessoas.filter((p) => p.tipoRelac === 2);
      const respFinRec = pessoas.find((p) => p.tipoRelac === 3);
      const respAcadRec = pessoas.find((p) => p.tipoRelac === 4);

      let filiacao1Rec: PessoaMatricula | undefined;
      let filiacao2Rec: PessoaMatricula | undefined;
      if (pais.length > 1) {
        [filiacao1Rec, filiacao2Rec] = [pais[0], pais[1]];
      } else if (maes.length > 1) {
        [filiacao1Rec, filiacao2Rec] = [maes[0], maes[1]];
      } else if (pais.length === 1 && maes.length === 1) {
        [filiacao1Rec, filiacao2Rec] = [pais[0], maes[0]];
      } else if (pais.length === 1) {
        filiacao1Rec = pais[0];
      } else if (maes.length === 1) {
        filiacao1Rec = maes[0];
      }

      // Relação (pai/mãe) derivada das flags existentes; fallback pelo TIPORELAC.
      const tipoDe = (
        p: PessoaMatricula | undefined,
        fallback: string,
      ): string => {
        if (!p) return fallback;
        if (String(p.bruto["EHPAI"] ?? "").toUpperCase() === "T") return "P";
        if (String(p.bruto["EHMAE"] ?? "").toUpperCase() === "T") return "M";
        if (p.tipoRelac === 1) return "P";
        if (p.tipoRelac === 2) return "M";
        return fallback;
      };

      const base = normalizarComposites(candidatoRec?.bruto ?? {});
      const fil1 = filiacao1Rec
        ? {
            ...normalizarComposites(filiacao1Rec.bruto),
            TIPOFILIACAO: tipoDe(filiacao1Rec, "P"),
          }
        : { TIPOFILIACAO: "P" };
      const fil2 = filiacao2Rec
        ? {
            ...normalizarComposites(filiacao2Rec.bruto),
            TIPOFILIACAO: tipoDe(filiacao2Rec, "M"),
          }
        : { TIPOFILIACAO: "M" };
      const respFin = respFinRec ? normalizarComposites(respFinRec.bruto) : {};
      const respAcad = respAcadRec
        ? normalizarComposites(respAcadRec.bruto)
        : {};

      const prefill: Record<Papel, Record<string, unknown>> = {
        candidato: { ...base },
        filiacao1: { ...fil1 },
        filiacao2: { ...fil2 },
        respFinanceiro: { ...respFin },
        respAcademico: { ...respAcad },
      };
      setRegistros(prefill);
      setOriginais({
        candidato: { ...base },
        filiacao1: { ...fil1 },
        filiacao2: { ...fil2 },
        respFinanceiro: { ...respFin },
        respAcademico: { ...respAcad },
      });
    } catch {
      setErroCarga("Não foi possível carregar os dados da matrícula.");
    } finally {
      setCarregando(false);
    }
  }, [numeroInscricao, idps, codUsuarioPS, onSessaoExpirada]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  // Listas de apoio (dropdowns) ---------------------------------------------
  const [listas, setListas] = useState<Record<string, ItemLista[]>>({});
  const carregandoListas = useRef<Set<string>>(new Set());

  const chaveLista = useCallback(
    (tipo: TipoLista, param?: string) => `${tipo}:${param ?? ""}`,
    [],
  );

  const garantirLista = useCallback(
    async (tipo: TipoLista, param?: string) => {
      const chave = chaveLista(tipo, param);
      if (listas[chave] || carregandoListas.current.has(chave)) return;
      carregandoListas.current.add(chave);
      try {
        const q = new URLSearchParams({ tipo, idps: String(idps) });
        if (tipo === "estados") q.set("idPais", param ?? "1");
        if (tipo === "municipios") q.set("codEtd", param ?? "");
        const res = await fetch(`/api/matricula/listas?${q.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as
          | { ok: true; itens: ItemLista[] }
          | { ok: false };
        if (data.ok) setListas((m) => ({ ...m, [chave]: data.itens }));
      } catch {
        // silencioso: o select fica vazio e o usuário pode tentar de novo
      } finally {
        carregandoListas.current.delete(chave);
      }
    },
    [chaveLista, listas, idps],
  );

  // Campos visíveis do passo de pessoa atual --------------------------------
  const camposDoPasso = useMemo(() => {
    if (!passo?.papel) return [] as CampoMatricula[];
    const ehCandidato = passo.papel === "candidato";
    const visiveis = campos.filter((c) =>
      ehCandidato ? c.visivelCandidato : c.visivelResponsavel,
    );
    return ordenarCampos(injetarSinteticos(visiveis));
  }, [campos, passo]);

  // Pré-carrega as listas necessárias ao passo de pessoa atual ---------------
  useEffect(() => {
    if (!passo?.papel) return;
    const rec = registros[passo.papel] ?? {};
    for (const c of camposDoPasso) {
      const def = defDoCampo(c.idCampo);
      if (!def.lista) continue;
      if (def.lista === "estados") {
        const idPais = def.dependeDe ? valorSps(rec, def.dependeDe) : "";
        void garantirLista("estados", idPais || IDPAIS_BRASIL);
      } else if (def.lista === "municipios") {
        const uf = def.dependeDe ? valorSps(rec, def.dependeDe) : "";
        if (uf) void garantirLista("municipios", uf);
      } else void garantirLista(def.lista);
    }
  }, [passo, camposDoPasso, registros, garantirLista]);

  // Edição de um campo -------------------------------------------------------
  function editar(
    papel: Papel,
    def: CampoDef,
    valor: string,
    itens?: ItemLista[],
  ) {
    setRegistros((m) => {
      const atual = { ...(m[papel] ?? {}) };
      atual[def.sps] = valor;
      if (def.campoNome && itens) {
        const it = itens.find((i) => i.codigo === valor);
        atual[def.campoNome] = it?.descricao ?? "";
      }
      // Trocar o país natal invalida o estado e a cidade natais: o combo de
      // estado passa a listar os estados do novo país (reproduz o setPais da
      // diretiva nativa). Evita país=Argentina com estado/cidade do Brasil.
      if (def.sps === "IDPAISNATAL") {
        atual["ESTADONATAL"] = "";
        atual["CODNATURALIDADE"] = "";
        atual["NATURALIDADE"] = "";
      }
      // Trocar a UF natal invalida o município selecionado.
      if (def.sps === "ESTADONATAL") {
        atual["CODNATURALIDADE"] = "";
        atual["NATURALIDADE"] = "";
      }
      // Trocar a UF do endereço invalida o município do endereço.
      if (def.sps === "ESTADO") {
        atual["CODMUNICIPIO"] = "";
        atual["CIDADE"] = "";
      }
      return { ...m, [papel]: atual };
    });
  }

  // Copia o endereço (e contatos) do candidato para a pessoa do passo atual —
  // reproduz o botão "usar endereço do aluno" do portal nativo da TOTVS.
  function copiarEnderecoCandidato(papel: Papel) {
    const cand = registros.candidato ?? {};
    setRegistros((m) => {
      const src = m.candidato ?? {};
      const dest = { ...(m[papel] ?? {}) };
      for (const k of CAMPOS_ENDERECO_SPS) dest[k] = src[k] ?? null;
      return { ...m, [papel]: dest };
    });
    const uf = cand["ESTADO"];
    if (typeof uf === "string" && uf) void garantirLista("municipios", uf);
  }

  // Combo "quem é o responsável": o responsável (financeiro/acadêmico) deve ser
  // uma das filiações já cadastradas — só aparecem as filiações cujos dados já
  // foram preenchidos. O valor "" = "Selecione…" (nenhum formulário à mostra).
  function opcoesResponsavel(): {
    valor: Papel | "novo" | "";
    rotulo: string;
  }[] {
    const nomeDe = (p: Papel) => {
      const n = registros[p]?.["NOME"];
      return typeof n === "string" && n.trim() ? ` — ${n.trim()}` : "";
    };
    const preenchida = (p: Papel) =>
      valorSps(registros[p] ?? {}, "NOME").trim() !== "";
    const ops: { valor: Papel | "novo" | ""; rotulo: string }[] = [
      { valor: "", rotulo: "Selecione…" },
    ];
    if (passos.some((p) => p.papel === "filiacao1") && preenchida("filiacao1"))
      ops.push({
        valor: "filiacao1",
        rotulo: `Filiação 1${nomeDe("filiacao1")}`,
      });
    if (passos.some((p) => p.papel === "filiacao2") && preenchida("filiacao2"))
      ops.push({
        valor: "filiacao2",
        rotulo: `Filiação 2${nomeDe("filiacao2")}`,
      });
    // Cadastrar uma pessoa DISTINTA como responsável (SalvarDadosPesoaisUsuarios
    // com EHRESPFIN='T'), como o portal nativo (UsaDadosTipoRelac < 0).
    ops.push({ valor: "novo", rotulo: "Outra pessoa (cadastrar)" });
    return ops;
  }

  // Registra a pessoa de origem escolhida na combo do passo de responsável.
  // Ao reutilizar uma pessoa, garantimos a lista de municípios da UF dela para
  // que os débitos/planos exibam a cidade corretamente.
  function escolherOrigemResponsavel(
    papel: Papel,
    origem: Papel | "novo" | "",
  ) {
    setOrigemResp((m) => ({ ...m, [papel]: origem }));
    setErroPasso(null);
    if (origem === "novo") {
      // Cadastro de pessoa NOVA: formulário em BRANCO e editável. Zeramos o
      // registro e o "original" do papel para não herdar os dados (e as travas
      // de unicidade) do relacionado que veio no carregamento inicial.
      setRegistros((m) => ({ ...m, [papel]: {} }));
      setOriginais((m) => ({ ...m, [papel]: {} }));
    } else if (origem) {
      const uf = registros[origem]?.["ESTADO"];
      if (typeof uf === "string" && uf) void garantirLista("municipios", uf);
    }
  }

  // Validação/gravação do passo de pessoa ------------------------------------
  const [salvando, setSalvando] = useState(false);
  const [erroPasso, setErroPasso] = useState<string | null>(null);
  // Depuração (apenas DEV): guarda a resposta crua da WebAPI no último erro.
  const [depuracao, setDepuracao] = useState<unknown>(null);

  const validarBloco = useCallback(
    (papel: Papel, obrigatorioBloco: boolean): string | null => {
      const rec = registros[papel] ?? {};
      const ehCandidato = papel === "candidato";
      const visiveis = campos.filter((c) =>
        ehCandidato ? c.visivelCandidato : c.visivelResponsavel,
      );
      // Bloco opcional deixado totalmente em branco → nada a validar/gravar.
      const algumPreenchido = visiveis.some((c) => {
        const def = defDoCampo(c.idCampo);
        return valorSps(rec, def.sps).trim() !== "";
      });
      if (!obrigatorioBloco && !algumPreenchido) return null;

      for (const c of visiveis) {
        const obrig = ehCandidato
          ? c.obrigatorioCandidato
          : c.obrigatorioResponsavel;
        if (!obrig) continue;
        const def = defDoCampo(c.idCampo);
        if (valorSps(rec, def.sps).trim() === "") {
          return `Preencha o campo "${c.nomeCampo ?? def.sps}".`;
        }
      }

      // Crítica de naturalidade (local de nascimento): o país natal precisa ser
      // coerente com o estado/cidade natais. Se o país natal informado não é o
      // Brasil, não pode haver cidade natal brasileira (CODNATURALIDADE)
      // preenchida — reproduz a regra do combo país→estado→cidade do portal
      // nativo (edups-pais-uf-cidade), evitando país=Argentina + cidade do Brasil.
      const idPaisNatal = valorSps(rec, "IDPAISNATAL").trim();
      const temCidadeNatalBR = valorSps(rec, "CODNATURALIDADE").trim() !== "";
      if (idPaisNatal && idPaisNatal !== IDPAIS_BRASIL && temCidadeNatalBR) {
        return "Local de nascimento inconsistente: o país natal informado não é o Brasil, mas há cidade natal brasileira preenchida. Ajuste o país, o estado e a cidade natais.";
      }
      return null;
    },
    [registros, campos],
  );

  const gravarBloco = useCallback(
    async (papel: Papel): Promise<boolean> => {
      // Reuso: para respFinanceiro/respAcademico o usuário pode escolher uma
      // pessoa já cadastrada (candidato/filiação). Nesse caso NÃO recriamos a
      // pessoa nem sobrescrevemos as flags de papel dela: gravamos a própria
      // pessoa de origem com as flags dela + a flag de responsável (aditiva),
      // preservando, por ex., EHCANDIDATO="T" do candidato.
      const reuso: Papel | "" =
        (papel === "respFinanceiro" || papel === "respAcademico") &&
        origemResp[papel] &&
        origemResp[papel] !== "novo"
          ? (origemResp[papel] as Papel)
          : "";
      const papelDados: Papel = reuso || papel;
      const rec = registros[papelDados] ?? {};
      const ehCandidato = papelDados === "candidato";
      const visiveis = campos.filter((c) =>
        ehCandidato ? c.visivelCandidato : c.visivelResponsavel,
      );
      const algumPreenchido = visiveis.some((c) => {
        const def = defDoCampo(c.idCampo);
        return valorSps(rec, def.sps).trim() !== "";
      });
      // Bloco opcional vazio (e sem reuso): não grava.
      if (!reuso && !ehCandidato && !algumPreenchido) return true;

      const flags: Record<string, string> = reuso
        ? {
            ...FLAGS_PAPEL[reuso],
            [papel === "respFinanceiro" ? "EHRESPFIN" : "EHRESPACAD"]: "T",
          }
        : { ...FLAGS_PAPEL[papel] };

      // Filiação: a relação (pai/mãe) é escolhida pelo usuário (TIPOFILIACAO);
      // EHPAI/EHMAE derivam dela — reproduz objParseToJSONFiliacao* do nativo.
      if (papelDados === "filiacao1" || papelDados === "filiacao2") {
        const tipo =
          valorSps(rec, "TIPOFILIACAO") ||
          (papelDados === "filiacao1" ? "P" : "M");
        flags.TIPOFILIACAO = tipo;
        flags.EHPAI = tipo === "P" ? "T" : "F";
        flags.EHMAE = tipo === "M" ? "T" : "F";
      }

      const pessoa: Record<string, unknown> = removerComposites({
        ...rec,
        ...flags,
      });
      // Pessoa NOVA (sem CODUSUARIOPS): o DataServer lê CODUSUARIOPS direto da
      // linha do JSON para decidir inserir/atualizar — sem essa coluna ele lança
      // "A coluna 'CODUSUARIOPS' não pertence à tabela SPSUSUARIO". Só ela é
      // obrigatória: as demais colunas (FUMANTE/CANHOTO/…) NÃO devem ser
      // enviadas — o RM copia apenas as colunas presentes para a linha tipada do
      // schema (AtualizaValorNaRow), e valores fabricados quebram a conversão
      // (ex.: FUMANTE é Int16, CANHOTO é char(1)). Herdamos coligada/PS do
      // candidato porque também são lidas/copiadas.
      if (valorSps(rec, "CODUSUARIOPS").trim() === "") {
        const cand = registros.candidato ?? {};
        pessoa["CODUSUARIOPS"] = null;
        if (cand["CODCOLIGADA"] != null)
          pessoa["CODCOLIGADA"] = cand["CODCOLIGADA"];
        pessoa["IDPS"] = cand["IDPS"] ?? idps;
      }
      // Relaciona ao candidato, exceto quando a própria pessoa é o candidato.
      if (papelDados !== "candidato") pessoa["CODUSUARIORELAC"] = codUsuarioPS;
      // CPF é digitado com máscara (000.000.000-00), mas o RM grava só dígitos.
      if (typeof pessoa["CPF"] === "string")
        pessoa["CPF"] = apenasDigitos(pessoa["CPF"]);

      const res = await fetch("/api/matricula/dados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idps, action: "salvar", pessoa }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; erro?: string | null; bruto?: unknown }
        | null;
      if (!res.ok || !data || !data.ok) {
        // DEV: expõe TUDO que a WebAPI retornou para depuração.
        setDepuracao({
          endpoint: "POST /api/matricula/dados",
          status: res.status,
          enviado: pessoa,
          resposta: data,
        });
        const msg =
          (data && "erro" in data && data.erro) ||
          (res.status === 503
            ? "Ambiente em modo somente leitura: a gravação está desativada."
            : null) ||
          "Não foi possível salvar estes dados. Verifique e tente de novo.";
        setErroPasso(msg);
        return false;
      }
      setDepuracao(null);
      return true;
    },
    [registros, campos, codUsuarioPS, idps, origemResp],
  );

  // Débitos do responsável financeiro ---------------------------------------
  const [debitos, setDebitos] = useState<
    DebitosResponsavelFinanceiro | "carregando" | null
  >(null);

  const consultarDebitos =
    useCallback(async (): Promise<DebitosResponsavelFinanceiro | null> => {
      if (!parametros.validarDebitosResponsavelFinanceiro) return null;
      // Reaproveitada (filiação) valida o CPF dela; "novo" valida o CPF digitado
      // no formulário da pessoa distinta (registros.respFinanceiro).
      const origem = origemResp.respFinanceiro || "";
      const rec =
        (origem && origem !== "novo"
          ? registros[origem]
          : registros.respFinanceiro) ?? {};
      const cpf = valorSps(rec, "CPF").replace(/\D/g, "");
      if (!cpf) {
        setDebitos(null);
        return null;
      }
      setDebitos("carregando");
      try {
        const q = new URLSearchParams({
          idAreaOfertada: String(idAreaOfertada),
          cpf,
          nome: valorSps(rec, "NOME"),
          idps: String(idps),
          idHabilitacaoFilial: String(parametros.idHabilitacaoFilial ?? 0),
        });
        const res = await fetch(`/api/matricula/debitos?${q.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as
          | { ok: true; debitos: DebitosResponsavelFinanceiro | null }
          | { ok: false };
        const d = data.ok ? data.debitos : null;
        setDebitos(d);
        return d;
      } catch {
        setDebitos(null);
        return null;
      }
    }, [parametros, registros, idAreaOfertada, idps, origemResp]);

  // Planos de pagamento ------------------------------------------------------
  const [planos, setPlanos] = useState<PlanoPagamento[]>([]);
  const [planoSel, setPlanoSel] = useState<string | null>(
    parametros.codPlanoPgtoPadrao,
  );
  const [planosCarregados, setPlanosCarregados] = useState(false);

  const carregarPlanos = useCallback(async () => {
    if (planosCarregados) return;
    try {
      const q = new URLSearchParams({
        idAreaOfertada: String(idAreaOfertada),
        numeroInscricao: String(numeroInscricao),
        idps: String(idps),
      });
      const res = await fetch(`/api/matricula/planos?${q.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as
        | { ok: true; planos: PlanoPagamento[] }
        | { ok: false };
      if (data.ok) {
        setPlanos(data.planos);
        if (!planoSel && data.planos[0]?.codPlanoPgto)
          setPlanoSel(data.planos[0].codPlanoPgto);
      }
    } catch {
      // segue com plano padrão
    } finally {
      setPlanosCarregados(true);
    }
  }, [idAreaOfertada, numeroInscricao, idps, planoSel, planosCarregados]);

  // Documentos ---------------------------------------------------------------
  const [docsExigidos, setDocsExigidos] = useState<DocumentoExigidoCliente[]>(
    [],
  );
  const [docsReaproveitados, setDocsReaproveitados] = useState<
    DocumentoReaproveitadoCliente[]
  >([]);
  const [docsCarregados, setDocsCarregados] = useState(false);
  const [docsSel, setDocsSel] = useState<Record<number, DocumentoSelecionado>>(
    {},
  );

  const carregarDocumentos = useCallback(async () => {
    if (docsCarregados) return;
    try {
      const q = new URLSearchParams({
        idAreaOfertada: String(idAreaOfertada),
        idps: String(idps),
        numeroInscricao: String(numeroInscricao),
      });
      const res = await fetch(`/api/matricula/documentos?${q.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as
        | {
            ok: true;
            exigidos: DocumentoExigidoCliente[];
            reaproveitados?: DocumentoReaproveitadoCliente[];
          }
        | { ok: false };
      if (data.ok) {
        setDocsExigidos(data.exigidos);
        setDocsReaproveitados(data.reaproveitados ?? []);
      }
    } catch {
      // segue sem lista — o passo é opcional quando nada é obrigatório
    } finally {
      setDocsCarregados(true);
    }
  }, [idAreaOfertada, idps, numeroInscricao, docsCarregados]);

  // Anexa o arquivo localmente (guarda o base64 no estado). O envio ao RM NÃO é
  // por arquivo: acontece em UMA única chamada consolidada no "Avançar"
  // (enviarDocumentos), replicando o portal nativo — que manda todos os
  // documentos de uma vez em UploadDocumentosMatricula. Esse envio único é o que
  // faz o RM registrar os documentos como entregues na matrícula.
  const anexarDocumento = useCallback(
    (cod: number, nomeArquivo: string, arquivoBase64: string) => {
      setErroPasso(null);
      setDocsSel((s) => ({
        ...s,
        [cod]: { nomeArquivo, arquivoBase64, status: "enviado" },
      }));
    },
    [],
  );

  // Remove o arquivo anexado (apenas do estado local — nada foi gravado no RM
  // ainda, pois o envio é consolidado no "Avançar").
  const removerArquivoDoc = useCallback((cod: number) => {
    setDocsSel((s) => {
      const { [cod]: _omit, ...resto } = s;
      void _omit;
      return resto;
    });
  }, []);

  // Chamado ao avançar do passo de documentos. Envia TODOS os documentos
  // (uploads novos + reaproveitados da inscrição) em UMA única chamada
  // UploadDocumentosMatricula, exatamente como o portal nativo. O envio único é
  // o que faz o RM marcar os documentos como entregues na matrícula e, na
  // finalização, copiá-los para o registro do aluno ("documentos solicitados").
  const enviarDocumentos = useCallback(async (): Promise<boolean> => {
    // Um documento reaproveitado da inscrição (e não substituído por upload novo)
    // satisfaz o obrigatório correspondente.
    const reaproveitadosAtivos = new Set(
      docsReaproveitados
        .filter((r) => !docsSel[r.codDocumento])
        .map((r) => r.codDocumento),
    );
    // Obrigatório é satisfeito por arquivo anexado ou por reaproveitamento ativo.
    const faltando = docsExigidos.filter(
      (d) =>
        d.obrigatorio &&
        d.codDocumento != null &&
        docsSel[d.codDocumento]?.status !== "enviado" &&
        !reaproveitadosAtivos.has(d.codDocumento),
    );
    if (faltando.length > 0) {
      setErroPasso(
        `Anexe os documentos obrigatórios: ${faltando
          .map((d) => d.descricao)
          .join(", ")}.`,
      );
      return false;
    }
    // Manifesto COMPLETO: uploads novos (com base64) + reaproveitados da
    // inscrição (o servidor baixa o arquivo pela chave). Enviado de uma vez só.
    const documentos: Array<{
      codDocumento: number;
      detalhe: string;
      nomeArquivo?: string;
      arquivoBase64?: string;
      reaproveitarDaInscricao?: boolean;
    }> = [];
    for (const [codStr, sel] of Object.entries(docsSel)) {
      if (sel.status !== "enviado") continue;
      documentos.push({
        codDocumento: Number(codStr),
        detalhe: "",
        nomeArquivo: sel.nomeArquivo,
        arquivoBase64: sel.arquivoBase64,
      });
    }
    for (const r of docsReaproveitados) {
      if (docsSel[r.codDocumento]) continue; // substituído por upload novo
      documentos.push({
        codDocumento: r.codDocumento,
        detalhe: "",
        reaproveitarDaInscricao: true,
      });
    }
    if (documentos.length === 0) return true; // nada a enviar
    setSalvando(true);
    try {
      const res = await fetch(`/api/matricula/documentos?idps=${idps}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idAreaOfertada, numeroInscricao, documentos }),
      });
      if (res.status === 503) {
        setErroPasso(
          "Ambiente em modo somente leitura: o envio de documentos está desativado.",
        );
        return false;
      }
      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; erro?: string | null; mensagem?: string | null }
        | null;
      if (!res.ok || !data || !data.ok) {
        setErroPasso(
          (data && "mensagem" in data && data.mensagem) ||
            (data && "erro" in data && data.erro) ||
            "Não foi possível enviar os documentos. Tente novamente.",
        );
        return false;
      }
      return true;
    } catch {
      setErroPasso("Não foi possível enviar os documentos. Tente novamente.");
      return false;
    } finally {
      setSalvando(false);
    }
  }, [
    docsExigidos,
    docsReaproveitados,
    docsSel,
    idAreaOfertada,
    numeroInscricao,
    idps,
  ]);

  useEffect(() => {
    if (passo?.id === "planos") void carregarPlanos();
    if (passo?.id === "respFinanceiro") void consultarDebitos();
    if (passo?.id === "documentos") void carregarDocumentos();
  }, [passo, carregarPlanos, consultarDebitos, carregarDocumentos]);

  // Contrato -----------------------------------------------------------------
  // O relatório está disponível quando há id de relatório configurado. A coligada
  // do relatório pode vir 0 (= usa a coligada padrão), valor VÁLIDO no RM — por
  // isso testamos != null, e não truthiness (0 é falsy mas é um código legítimo).
  const contratoTemPdf =
    parametros.codColigadaRelatorioContrato != null &&
    parametros.idRelatorioContrato != null;
  const [aceiteContrato, setAceiteContrato] = useState(false);

  // Efetivação ---------------------------------------------------------------
  const [sucesso, setSucesso] = useState<{
    mensagem: string | null;
    planoDescricao: string | null;
    dataHora: string;
  } | null>(null);

  const efetivar = useCallback(async () => {
    setSalvando(true);
    setErroPasso(null);
    try {
      const res = await fetch("/api/matricula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroInscricao,
          idAreaOfertada,
          idps,
          codPlanoPgto: planoSel,
          arquivoContrato: null,
        }),
      });
      if (res.status === 503) {
        setErroPasso(
          "Ambiente em modo somente leitura: a efetivação está desativada.",
        );
        return;
      }
      if (res.status === 429) {
        setErroPasso("Muitas tentativas. Aguarde um instante e tente de novo.");
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { ok: true; mensagemConfirmacao: string | null }
        | { ok: false; mensagem?: string | null; erro?: string | null }
        | null;
      if (!res.ok || !data || !data.ok) {
        setDepuracao({
          endpoint: "POST /api/matricula",
          status: res.status,
          resposta: data,
        });
        setErroPasso(
          (data && "mensagem" in data && data.mensagem) ||
            (data && "erro" in data && data.erro) ||
            "Não foi possível concluir a matrícula. Tente novamente.",
        );
        return;
      }
      setDepuracao(null);
      const planoDescricao =
        planos.find((p) => p.codPlanoPgto === planoSel)?.descricao ?? null;
      setSucesso({
        mensagem: data.mensagemConfirmacao,
        planoDescricao,
        dataHora: new Date().toISOString(),
      });
      rastrearEventoMeta(
        "CompleteRegistration",
        {
          content_name: "Matrícula efetivada",
          content_category: "matricula",
          content_ids: [String(numeroInscricao)],
          status: true,
        },
        eventIdMatricula(idps, numeroInscricao),
      );
    } catch {
      setErroPasso("Não foi possível concluir a matrícula. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }, [numeroInscricao, idAreaOfertada, idps, planoSel, planos]);

  // Navegação ----------------------------------------------------------------
  async function avancar() {
    setErroPasso(null);
    setDepuracao(null);
    if (!passo) return;

    if (passo.papel) {
      const ehResponsavel =
        passo.papel === "respFinanceiro" || passo.papel === "respAcademico";
      const origem = ehResponsavel ? origemResp[passo.papel] || "" : "";
      // O responsável é escolhido pela combo (Filiação 1/2 ou Outra pessoa). Sem
      // seleção, não há dados para gravar: bloqueia se o passo for obrigatório.
      if (ehResponsavel && origem === "") {
        if (passo.obrigatorioBloco) {
          setErroPasso(
            "Selecione quem será o responsável (Filiação 1, Filiação 2 ou Outra pessoa).",
          );
          return;
        }
        // Passo opcional sem seleção: apenas avança.
        setIndice((i) => Math.min(i + 1, passos.length - 1));
        return;
      }
      // Valida o formulário manual: candidato/filiação sempre; responsável só
      // quando "Outra pessoa" (novo). Ao reutilizar, a gravação usa a origem.
      if (!ehResponsavel || origem === "novo") {
        const msg = validarBloco(passo.papel, !!passo.obrigatorioBloco);
        if (msg) {
          setErroPasso(msg);
          return;
        }
      }
      setSalvando(true);
      const ok = await gravarBloco(passo.papel);
      setSalvando(false);
      if (!ok) return;
    }

    if (
      passo.id === "respFinanceiro" &&
      parametros.validarDebitosResponsavelFinanceiro
    ) {
      // Reconsulta os débitos com o CPF efetivo (reaproveitado OU pessoa nova),
      // aguardando o resultado antes de decidir se bloqueia.
      const d = await consultarDebitos();
      if (d && d.bloqueia) {
        setErroPasso(
          d.mensagem ?? "Há pendências financeiras que impedem a matrícula.",
        );
        return;
      }
    }

    if (passo.id === "documentos") {
      const ok = await enviarDocumentos();
      if (!ok) return;
    }

    if (passo.id === "contrato" && !aceiteContrato) {
      setErroPasso("É necessário aceitar o contrato para prosseguir.");
      return;
    }

    if (passo.id === "finalizacao") {
      await efetivar();
      return;
    }

    setIndice((i) => Math.min(i + 1, passos.length - 1));
  }

  function voltar() {
    setErroPasso(null);
    setIndice((i) => Math.max(i - 1, 0));
  }

  // ----- Render -------------------------------------------------------------

  if (sucesso) {
    return (
      <Resultado
        mensagem={sucesso.mensagem}
        numeroInscricao={numeroInscricao}
        idps={idps}
        onConcluir={() =>
          onConcluir?.({
            mensagem: sucesso.mensagem,
            planoDescricao: sucesso.planoDescricao,
            dataHora: sucesso.dataHora,
          })
        }
      />
    );
  }

  if (carregando) {
    return <p className="text-sm text-cinza-suave">Carregando matrícula…</p>;
  }

  if (erroCarga) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-csa-vermelho">{erroCarga}</p>
        <button
          type="button"
          onClick={() => void carregarDados()}
          className={botaoSecundario}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trilha de passos */}
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-cinza-suave">
        <span>
          Passo {numeroVisivel} de {totalVisivel}
        </span>
        <span className="mx-1">•</span>
        <span className="font-medium text-csa-azul">{rotuloVisivel}</span>
        {passo?.papel && (
          <>
            <span className="mx-1">›</span>
            <span className="text-grafite">{passo.titulo}</span>
          </>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-areia">
        <div
          className="h-full rounded-full bg-csa-azul transition-all"
          style={{ width: `${(numeroVisivel / totalVisivel) * 100}%` }}
        />
      </div>

      {/* Destaque da sub-etapa atual: como as telas de "Dados cadastrais"
          repetem as mesmas legendas, este cabeçalho deixa claro em qual
          pessoa (candidato/filiação/responsável) o usuário está. */}
      {passo?.papel && (
        <div className="flex items-center gap-3 rounded-xl border-l-4 border-csa-dourado bg-csa-azul/5 px-4 py-3">
          <span className="shrink-0 rounded-full bg-csa-azul px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            {rotuloVisivel}
          </span>
          <h3 className="text-lg font-bold leading-tight text-csa-azul">
            {passo.titulo}
          </h3>
        </div>
      )}

      {/* Conteúdo do passo */}
      <div className="min-h-[120px]">
        {passo?.id === "apresentacao" && (
          <div className="space-y-2 rounded-lg bg-csa-azul/5 px-4 py-3 text-sm">
            <p className="font-medium text-grafite">
              Vamos concluir a matrícula de {candidato.nome}.
            </p>
            {parametros.textoInstrucoes ? (
              <p className="whitespace-pre-line text-cinza-suave">
                {parametros.textoInstrucoes}
              </p>
            ) : (
              <p className="text-cinza-suave">
                Confirme os dados nas próximas etapas. Você poderá revisar tudo
                antes de finalizar.
              </p>
            )}
            {!periodoAberto && (
              <p className="text-csa-vermelho">
                Atenção: o período de matrícula não está aberto no momento. A
                confirmação pode ser recusada ao final.
              </p>
            )}
          </div>
        )}

        {MATRICULA_DEBUG && passo?.papel && (
          <details className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-amber-800">
              debug passo — papel: {passo.papel}
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-amber-900">
              {JSON.stringify(
                { papel: passo.papel, registro: registros[passo.papel] ?? {} },
                null,
                2,
              )}
            </pre>
          </details>
        )}

        {/* Combo "quem é o responsável" — permite reaproveitar uma pessoa já
            cadastrada (candidato/filiação) em vez de digitar tudo de novo,
            como no portal nativo (UsaDadosTipoRelac). */}
        {passoEhResponsavel && (
          <div className="mb-4 space-y-1">
            <label className="block text-sm font-medium text-grafite">
              Quem será o responsável{" "}
              {passo?.papel === "respFinanceiro" ? "financeiro" : "acadêmico"}?
            </label>
            <select
              className={inputBase}
              value={origemResponsavel}
              onChange={(e) =>
                escolherOrigemResponsavel(
                  passo!.papel as Papel,
                  e.target.value as Papel | "novo" | "",
                )
              }
            >
              {opcoesResponsavel().map((o) => (
                <option key={o.valor || "manual"} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Relação (pai/mãe) da filiação com o candidato — TIPOFILIACAO do
            nativo (listaTipoFiliacao P/M); EHPAI/EHMAE derivam na gravação. */}
        {(passo?.papel === "filiacao1" || passo?.papel === "filiacao2") && (
          <div className="mb-4 space-y-1">
            <label className="block text-sm font-medium text-grafite">
              Relação com o candidato
              <span className="text-csa-vermelho"> *</span>
            </label>
            <select
              className={inputBase}
              value={valorSps(registros[passo.papel] ?? {}, "TIPOFILIACAO")}
              onChange={(e) =>
                editar(
                  passo.papel as Papel,
                  { sps: "TIPOFILIACAO", tipo: "select" },
                  e.target.value,
                )
              }
            >
              <option value="P">Pai</option>
              <option value="M">Mãe</option>
            </select>
          </div>
        )}

        {passoEhResponsavel && origemResponsavel === "" && (
          <p className="mb-3 rounded-lg bg-areia/60 px-4 py-3 text-sm text-cinza-suave">
            Selecione acima quem será o responsável{" "}
            {passo?.papel === "respFinanceiro" ? "financeiro" : "acadêmico"}{" "}
            (Filiação 1, Filiação 2 ou Outra pessoa) para continuar.
          </p>
        )}

        {reutilizandoResponsavel && (
          <p className="mb-3 rounded-lg bg-csa-azul/5 px-4 py-3 text-sm text-grafite">
            Serão usados os dados de{" "}
            <span className="font-medium">
              {String(
                registros[origemResponsavel as Papel]?.["NOME"] ?? "",
              ).trim() || "a pessoa selecionada"}
            </span>
            .
          </p>
        )}

        {passo?.papel &&
          (!passoEhResponsavel || origemResponsavel === "novo") && (
            <FormularioPessoa
              key={passo.papel}
              campos={camposDoPasso}
              ehCandidato={passo.papel === "candidato"}
              registro={registros[passo.papel] ?? {}}
              original={originais[passo.papel] ?? {}}
              listas={listas}
              chaveLista={chaveLista}
              onEditar={(def, valor, itens) =>
                editar(passo.papel as Papel, def, valor, itens)
              }
              onCopiarEndereco={
                passo.papel !== "candidato"
                  ? () => copiarEnderecoCandidato(passo.papel as Papel)
                  : undefined
              }
              obrigatorioBloco={!!passo.obrigatorioBloco}
            />
          )}

        {passo?.id === "respFinanceiro" &&
          parametros.validarDebitosResponsavelFinanceiro && (
            <BlocoDebitos debitos={debitos} />
          )}

        {passo?.id === "documentos" && (
          <PassoDocumentos
            exigidos={docsExigidos}
            reaproveitados={docsReaproveitados}
            carregados={docsCarregados}
            selecionados={docsSel}
            onArquivo={anexarDocumento}
            onRemover={removerArquivoDoc}
            onErro={setErroPasso}
          />
        )}

        {passo?.id === "planos" && (
          <PassoPlanos
            planos={planos}
            planoSel={planoSel}
            padrao={parametros.codPlanoPgtoPadrao}
            permiteAlterar={parametros.alteraPlanoPagamentoPortal}
            exibirDetalhes={MATRICULA_EXIBIR_PLANO_PAGAMENTO}
            onSelecionar={setPlanoSel}
          />
        )}

        {passo?.id === "contrato" && (
          <PassoContrato
            temPdf={contratoTemPdf}
            numeroInscricao={numeroInscricao}
            idAreaOfertada={idAreaOfertada}
            idps={idps}
            codColigadaRelatorio={parametros.codColigadaRelatorioContrato}
            idRelatorio={parametros.idRelatorioContrato}
            texto={parametros.textoInstrucoes}
            exibirMinuta={MATRICULA_EXIBIR_MINUTA_CONTRATO}
            aceite={aceiteContrato}
            onAceite={setAceiteContrato}
          />
        )}

        {passo?.id === "finalizacao" && (
          <PassoFinalizacao
            candidato={candidato}
            planos={planos}
            planoSel={planoSel}
            exibirPlano={MATRICULA_EXIBIR_PLANO_PAGAMENTO}
          />
        )}
      </div>

      {erroPasso && <p className="text-sm text-csa-vermelho">{erroPasso}</p>}

      {MATRICULA_DEBUG && depuracao != null && (
        <details
          open
          className="rounded-md border border-csa-vermelho/40 bg-red-50 p-2 text-xs"
        >
          <summary className="cursor-pointer font-medium text-csa-vermelho">
            Depuração — resposta completa da WebAPI
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-gray-800">
            {JSON.stringify(depuracao, null, 2)}
          </pre>
        </details>
      )}

      {/* Navegação */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={() => void avancar()}
          disabled={salvando || debitos === "carregando"}
          className={passo?.id === "finalizacao" ? botaoBoleto : botaoPrimario}
        >
          {salvando
            ? "Salvando…"
            : passo?.id === "finalizacao"
              ? "Confirmar matrícula"
              : "Avançar"}
        </button>
        {indice > 0 && (
          <button type="button" onClick={voltar} className={botaoSecundario}>
            Voltar
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Subcomponentes
// ===========================================================================

function FormularioPessoa({
  campos,
  ehCandidato,
  registro,
  original,
  listas,
  chaveLista,
  onEditar,
  onCopiarEndereco,
  obrigatorioBloco,
}: {
  campos: CampoMatricula[];
  ehCandidato: boolean;
  registro: Record<string, unknown>;
  original: Record<string, unknown>;
  listas: Record<string, ItemLista[]>;
  chaveLista: (tipo: TipoLista, param?: string) => string;
  onEditar: (def: CampoDef, valor: string, itens?: ItemLista[]) => void;
  onCopiarEndereco?: () => void;
  obrigatorioBloco: boolean;
}) {
  if (campos.length === 0) {
    return (
      <p className="text-sm text-cinza-suave">
        Não há campos para preencher nesta etapa.
      </p>
    );
  }

  let grupoAtual: string | null = null;

  return (
    <div className="space-y-3">
      {!obrigatorioBloco && (
        <p className="rounded-lg bg-areia px-3 py-2 text-xs text-cinza-suave">
          Preenchimento opcional. Deixe em branco se não se aplica.
        </p>
      )}
      {campos.map((c) => {
        const def = defDoCampo(c.idCampo);
        const obrig = ehCandidato
          ? c.obrigatorioCandidato
          : c.obrigatorioResponsavel;
        const jaPreenchido =
          def.unicidade && valorSps(original, def.sps).trim() !== "";
        const desabilitado = !!jaPreenchido;

        const cabecalho =
          c.grupo && c.grupo !== grupoAtual ? (grupoAtual = c.grupo) : null;

        // Opções do select
        let itens: ItemLista[] | undefined;
        if (def.tipo === "select") {
          if (def.opcoes) itens = def.opcoes;
          else if (def.lista === "estados") {
            const idPais = def.dependeDe
              ? valorSps(registro, def.dependeDe)
              : "";
            itens = listas[chaveLista("estados", idPais || IDPAIS_BRASIL)];
          } else if (def.lista === "municipios") {
            const uf = def.dependeDe ? valorSps(registro, def.dependeDe) : "";
            itens = uf ? listas[chaveLista("municipios", uf)] : [];
          } else if (def.lista) itens = listas[chaveLista(def.lista)];
        }

        const valorAtual =
          def.tipo === "date"
            ? isoParaData(valorSps(registro, def.sps))
            : def.mascara === "cep"
              ? formatarCep(valorSps(registro, def.sps))
              : def.mascara === "telefone"
                ? formatarTelefone(valorSps(registro, def.sps))
                : def.mascara === "cpf"
                  ? formatarCpf(valorSps(registro, def.sps))
                  : valorSps(registro, def.sps);

        return (
          <div key={`${c.idCampo}-${c.grupo}`} className="space-y-1">
            {cabecalho &&
            String(cabecalho).toLowerCase() === "endereco" &&
            onCopiarEndereco ? (
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-cinza-suave">
                  {rotuloGrupo(cabecalho)}
                </p>
                <button
                  type="button"
                  onClick={onCopiarEndereco}
                  className="shrink-0 rounded-full border border-csa-azul px-3 py-1 text-xs font-medium text-csa-azul transition hover:bg-csa-azul/5"
                >
                  Usar o mesmo endereço do candidato
                </button>
              </div>
            ) : (
              cabecalho && (
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-cinza-suave">
                  {rotuloGrupo(cabecalho)}
                </p>
              )
            )}
            <label className="block text-sm font-medium text-grafite">
              {def.rotulo ?? c.nomeCampo ?? def.sps}
              {obrig && <span className="text-csa-vermelho"> *</span>}
            </label>
            {def.tipo === "select" ? (
              <select
                className={inputBase}
                value={valorAtual}
                disabled={desabilitado}
                onChange={(e) => onEditar(def, e.target.value, itens)}
              >
                <option value="">Selecione…</option>
                {(itens ?? []).map((it) => (
                  <option key={it.codigo} value={it.codigo}>
                    {it.descricao}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={def.tipo}
                className={inputBase}
                value={valorAtual}
                disabled={desabilitado}
                inputMode={
                  def.mascara === "cep"
                    ? "numeric"
                    : def.mascara === "telefone"
                      ? "tel"
                      : def.mascara === "cpf"
                        ? "numeric"
                        : undefined
                }
                maxLength={
                  def.mascara === "cep"
                    ? 9
                    : def.mascara === "telefone"
                      ? 16
                      : def.mascara === "cpf"
                        ? 14
                        : undefined
                }
                onChange={(e) =>
                  onEditar(
                    def,
                    def.mascara === "cep"
                      ? formatarCep(e.target.value)
                      : def.mascara === "telefone"
                        ? formatarTelefone(e.target.value)
                        : def.mascara === "cpf"
                          ? formatarCpf(e.target.value)
                          : e.target.value,
                  )
                }
              />
            )}
            {desabilitado && (
              <p className="text-[11px] text-cinza-suave">
                Campo já cadastrado — não pode ser alterado por aqui.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BlocoDebitos({
  debitos,
}: {
  debitos: DebitosResponsavelFinanceiro | "carregando" | null;
}) {
  if (debitos === "carregando")
    return (
      <p className="mt-3 text-sm text-cinza-suave">
        Verificando pendências financeiras…
      </p>
    );
  if (!debitos) return null;
  if (debitos.bloqueia)
    return (
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {debitos.mensagem ??
          "Há pendências financeiras que impedem a matrícula."}
      </div>
    );
  if (debitos.possuiDebitos && debitos.mensagem)
    return (
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {debitos.mensagem}
      </div>
    );
  return (
    <p className="mt-3 text-xs text-cinza-suave">
      Nenhuma pendência financeira encontrada para este responsável.
    </p>
  );
}

function PassoPlanos({
  planos,
  planoSel,
  padrao,
  permiteAlterar,
  exibirDetalhes,
  onSelecionar,
}: {
  planos: PlanoPagamento[];
  planoSel: string | null;
  padrao: string | null;
  permiteAlterar: boolean;
  exibirDetalhes: boolean;
  onSelecionar: (cod: string) => void;
}) {
  const avisoValores = (
    <p className="text-[11px] text-cinza-suave">
      Os valores das mensalidades serão divulgados em breve.
    </p>
  );

  // Enquanto os valores não são divulgados, o passo mostra apenas o aviso.
  if (!exibirDetalhes) {
    return (
      <div className="space-y-1 rounded-lg bg-csa-azul/5 px-4 py-3 text-sm text-cinza-suave">
        <p className="font-medium text-grafite">Plano de pagamento</p>
        {avisoValores}
      </div>
    );
  }

  if (planos.length === 0) {
    return (
      <div className="space-y-1 rounded-lg bg-csa-azul/5 px-4 py-3 text-sm text-cinza-suave">
        <p>
          {padrao
            ? "Plano de pagamento padrão será aplicado à matrícula."
            : "Nenhum plano de pagamento disponível no momento."}
        </p>
        {avisoValores}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {planos.map((p) => {
        const sel = p.codPlanoPgto === planoSel;
        return (
          <label
            key={p.codPlanoPgto ?? p.descricao}
            className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition ${
              sel
                ? "border-csa-azul bg-csa-azul/5"
                : "border-black/10 hover:border-csa-azul/40"
            } ${!permiteAlterar ? "cursor-default" : ""}`}
          >
            <div>
              <p className="font-medium text-grafite">
                {p.descricao ?? "Plano"}
              </p>
            </div>
            <input
              type="radio"
              name="plano"
              checked={sel}
              disabled={!permiteAlterar}
              onChange={() => p.codPlanoPgto && onSelecionar(p.codPlanoPgto)}
              className="h-4 w-4 accent-csa-azul"
            />
          </label>
        );
      })}
      {!permiteAlterar && (
        <p className="text-[11px] text-cinza-suave">
          O plano é definido pela instituição e não pode ser alterado por aqui.
        </p>
      )}
      {avisoValores}
    </div>
  );
}

/** Baixa um arquivo (base64 puro) no browser, para conferência. */
function baixarBase64Local(nomeArquivo: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo || "documento";
  a.click();
  URL.revokeObjectURL(url);
}

/** Baixa (para conferência) um documento reaproveitado da inscrição via BFF. */
async function baixarReaproveitadoRemoto(
  chaveDownload: string,
  nomeArquivo: string,
) {
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
    baixarBase64Local(
      data.arquivo.nomeArquivo || nomeArquivo,
      data.arquivo.base64,
    );
  } catch {
    // silencioso: o botão continua disponível para nova tentativa
  }
}

function PassoDocumentos({
  exigidos,
  reaproveitados,
  carregados,
  selecionados,
  onArquivo,
  onRemover,
  onErro,
}: {
  exigidos: DocumentoExigidoCliente[];
  reaproveitados: DocumentoReaproveitadoCliente[];
  carregados: boolean;
  selecionados: Record<number, DocumentoSelecionado>;
  onArquivo: (cod: number, nomeArquivo: string, base64: string) => void;
  onRemover: (cod: number) => void;
  onErro: (msg: string | null) => void;
}) {
  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (espelha a rota)

  function selecionar(cod: number, file: File | null) {
    onErro(null);
    if (!file) {
      onRemover(cod);
      return;
    }
    if (
      file.type !== "application/pdf" &&
      file.type !== "image/jpeg" &&
      file.type !== "image/png" &&
      !/\.(pdf|jpe?g|png)$/i.test(file.name)
    ) {
      onErro("Envie os documentos em formato PDF, JPG ou PNG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      onErro("Cada arquivo deve ter no máximo 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      const i = s.indexOf(",");
      onArquivo(cod, file.name, i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () =>
      onErro("Não foi possível ler o arquivo. Tente outro.");
    reader.readAsDataURL(file);
  }

  if (carregados && exigidos.length === 0) {
    return (
      <div className="rounded-lg bg-csa-azul/5 px-4 py-3 text-sm text-cinza-suave">
        Não há documentos a enviar nesta etapa. Você pode continuar.
      </div>
    );
  }

  // Reaproveitados (documentos já enviados na inscrição) aparecem primeiro, na
  // ordem recebida do servidor; depois os demais exigidos.
  const reaproveitadosPorCod = new Map(
    reaproveitados.map((r) => [r.codDocumento, r]),
  );
  const codsReaproveitados = reaproveitados
    .map((r) => r.codDocumento)
    .filter((cod) => exigidos.some((d) => d.codDocumento === cod));
  // Ordem de exibição: primeiro os documentos definidos como obrigatórios pelo
  // CSA (na ordem acordada com a secretaria), depois os reaproveitados da
  // inscrição ainda não listados, por fim os demais exigidos.
  const obrigatoriosOrdenados = CODS_DOCS_OBRIGATORIOS_MATRICULA.map((cod) =>
    exigidos.find((d) => d.codDocumento === cod),
  ).filter((d): d is DocumentoExigidoCliente => d != null);
  const jaListado = new Set(
    obrigatoriosOrdenados.map((d) => d.codDocumento as number),
  );
  const ordenados = [
    ...obrigatoriosOrdenados,
    ...codsReaproveitados
      .filter((cod) => !jaListado.has(cod))
      .map((cod) => exigidos.find((d) => d.codDocumento === cod))
      .filter((d): d is DocumentoExigidoCliente => d != null),
    ...exigidos.filter(
      (d) =>
        (d.codDocumento == null || !jaListado.has(d.codDocumento)) &&
        (d.codDocumento == null ||
          !codsReaproveitados.includes(d.codDocumento)),
    ),
  ];

  const grupoObrigatorios = ordenados.filter((d) => d.obrigatorio);
  const grupoFacultativos = ordenados.filter((d) => !d.obrigatorio);

  // Renderiza um item de documento (reutilizado nos dois grupos).
  const renderDoc = (d: DocumentoExigidoCliente) => {
    const cod = d.codDocumento;
    if (cod == null) return null;
    const sel = selecionados[cod];
    const reaproveitado = reaproveitadosPorCod.get(cod);
    // Prioridade de exibição: upload novo do usuário > arquivo da inscrição.
    const usandoReaproveitado = !sel && reaproveitado != null;
    return (
      <li
        key={cod}
        className="space-y-2 rounded-lg border border-black/10 px-4 py-3 text-sm"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-medium text-grafite">
            {d.descricao ?? `Documento ${cod}`}
            {d.obrigatorio && <span className="ml-1 text-csa-vermelho">*</span>}
          </p>
          {usandoReaproveitado && (
            <span className="inline-flex items-center rounded-full bg-csa-azul/10 px-2 py-0.5 text-[11px] font-medium text-csa-azul">
              Aproveitado da sua inscrição
            </span>
          )}
        </div>
        {sel ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-cinza-suave">
                {sel.nomeArquivo}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    baixarBase64Local(sel.nomeArquivo, sel.arquivoBase64)
                  }
                  className="text-xs font-medium text-csa-azul hover:underline"
                >
                  Baixar
                </button>
                <button
                  type="button"
                  onClick={() => onRemover(cod)}
                  className="text-xs font-medium text-csa-vermelho hover:underline"
                >
                  Remover
                </button>
              </div>
            </div>
            {sel.status === "enviando" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cinza-suave">
                <svg
                  className="h-3.5 w-3.5 animate-spin text-csa-azul"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Enviando…
              </span>
            )}
            {sel.status === "enviado" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clipRule="evenodd"
                  />
                </svg>
                Enviado
              </span>
            )}
            {sel.status === "erro" && (
              <span className="block text-xs font-medium text-csa-vermelho">
                {sel.erro ??
                  "Não foi possível enviar. Remova e tente novamente."}
              </span>
            )}
          </div>
        ) : usandoReaproveitado ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="truncate text-cinza-suave">
                {reaproveitado.nomeArquivo}
              </span>
              <button
                type="button"
                onClick={() =>
                  void baixarReaproveitadoRemoto(
                    reaproveitado.chaveDownload,
                    reaproveitado.nomeArquivo,
                  )
                }
                className="shrink-0 text-xs font-medium text-csa-azul hover:underline"
              >
                Baixar
              </button>
            </div>
            <div className="text-xs text-cinza-suave">
              <span className="mb-1 block">
                Se preferir, envie outro arquivo para substituir:
              </span>
              <label className="inline-flex cursor-pointer items-center rounded-full bg-csa-azul/10 px-3 py-1.5 text-xs font-medium text-csa-azul transition hover:bg-csa-azul/20">
                Escolher arquivo
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                  onChange={(e) => selecionar(cod, e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        ) : (
          <label className="inline-flex cursor-pointer items-center rounded-full bg-csa-azul/10 px-3 py-1.5 text-xs font-medium text-csa-azul transition hover:bg-csa-azul/20">
            Escolher arquivo
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              onChange={(e) => selecionar(cod, e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-cinza-suave">
        Anexe os documentos abaixo em formato PDF, JPG ou PNG (até 5 MB cada).
        Os arquivos são enviados quando você avança para a próxima etapa.
      </p>

      {grupoObrigatorios.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-grafite">
              Documentos obrigatórios
            </h3>
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-csa-vermelho/10 px-2 py-0.5 text-[11px] font-semibold text-csa-vermelho">
              {grupoObrigatorios.length}
            </span>
          </div>
          <p className="text-xs text-cinza-suave">
            Necessários para concluir a matrícula. Os itens marcados com{" "}
            <span className="text-csa-vermelho">*</span> são obrigatórios.
          </p>
          <ul className="space-y-2">{grupoObrigatorios.map(renderDoc)}</ul>
        </section>
      )}

      {grupoFacultativos.length > 0 && (
        <section className="space-y-2 border-t border-black/10 pt-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-grafite">
              Documentos complementares
            </h3>
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-csa-azul/10 px-2 py-0.5 text-[11px] font-semibold text-csa-azul">
              {grupoFacultativos.length}
            </span>
          </div>
          <p className="text-xs text-cinza-suave">
            Opcionais — podem ser enviados agora ou depois, na secretaria.
          </p>
          <ul className="space-y-2">{grupoFacultativos.map(renderDoc)}</ul>
        </section>
      )}
    </div>
  );
}

function PassoContrato({
  temPdf,
  numeroInscricao,
  idAreaOfertada,
  idps,
  codColigadaRelatorio,
  idRelatorio,
  texto,
  exibirMinuta,
  aceite,
  onAceite,
}: {
  temPdf: boolean;
  numeroInscricao: number;
  idAreaOfertada: number;
  idps: number;
  codColigadaRelatorio: number | null;
  idRelatorio: number | null;
  texto: string | null;
  exibirMinuta: boolean;
  aceite: boolean;
  onAceite: (v: boolean) => void;
}) {
  // A rota exige codColigadaRelatorio e idRelatorio (mesmos ids que o botão de
  // DetalhesMatricula envia). codColigadaRelatorio=0 é válido (coligada padrão).
  const urlPdf =
    `/api/matricula/contrato?numeroInscricao=${numeroInscricao}` +
    `&idAreaOfertada=${idAreaOfertada}&idps=${idps}` +
    `&codColigadaRelatorio=${codColigadaRelatorio ?? 0}` +
    `&idRelatorio=${idRelatorio ?? ""}&pdf=1`;

  // Enquanto a minuta do contrato de cada processo seletivo não é cadastrada no
  // RM, a exibição fica desativada por env: mostramos apenas um aviso e o aceite
  // não afirma concordância com um contrato ainda indisponível.
  if (!exibirMinuta) {
    return (
      <div className="space-y-3">
        <div className="space-y-3 rounded-lg border border-black/10 bg-areia/40 px-4 py-3 text-sm text-cinza-suave">
          <p>
            O <strong>Contrato de Prestação de Serviços Educacionais</strong>,
            incluindo o valor da anuidade, as parcelas e as demais condições
            financeiras e contratuais, será elaborado e disponibilizado ao
            Contratante/Responsável Financeiro{" "}
            <strong>no momento da efetivação da matrícula</strong>, na forma
            prevista na letra “a” do item 5.2 do Edital.
          </p>
          <div className="space-y-2 border-l-4 border-csa-dourado bg-white/60 px-4 py-3">
            <p className="font-semibold text-grafite">
              5.2 — Matrícula on-line — 2ª etapa
            </p>
            <p>
              De 05/08 até 04/09/2026, exclusivamente o Contratante/Responsável
              Financeiro.
            </p>
            <p className="font-semibold text-grafite">
              a) Assinatura do Contrato de Prestação de Serviços Educacionais
              2027
            </p>
            <p>
              Após o preenchimento da Ficha de Matrícula, a validação dos
              documentos pela Secretaria e a confirmação do pagamento da 1ª
              parcela de 2027 na Primeira Etapa, o Contrato de Prestação de
              Serviços Educacionais/2027 será enviado para o e-mail do
              contratante. A assinatura será feita de forma eletrônica, pela
              plataforma de certificação digital “DocuSign”.
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-grafite">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => onAceite(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-csa-azul"
          />
          <span>
            Estou ciente de que a minuta do contrato será disponibilizada e
            concordo em prosseguir com a matrícula.
          </span>
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {temPdf ? (
        <div className="space-y-2 rounded-lg border border-black/10 px-4 py-3 text-sm">
          <p className="text-cinza-suave">
            Leia o contrato de prestação de serviços educacionais antes de
            aceitar.
          </p>
          <a
            href={urlPdf}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-medium text-csa-azul hover:underline"
          >
            Abrir contrato (PDF)
          </a>
        </div>
      ) : (
        <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-black/10 bg-areia/40 px-4 py-3 text-sm text-cinza-suave">
          {texto ? (
            <p className="whitespace-pre-line">{texto}</p>
          ) : (
            <p>
              Declaro estar ciente e de acordo com os termos do contrato de
              prestação de serviços educacionais e com as normas da instituição
              para o ano letivo.
            </p>
          )}
        </div>
      )}
      <label className="flex cursor-pointer items-start gap-2 text-sm text-grafite">
        <input
          type="checkbox"
          checked={aceite}
          onChange={(e) => onAceite(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-csa-azul"
        />
        <span>Li e aceito os termos do contrato.</span>
      </label>
    </div>
  );
}

function PassoFinalizacao({
  candidato,
  planos,
  planoSel,
  exibirPlano,
}: {
  candidato: Candidato;
  planos: PlanoPagamento[];
  planoSel: string | null;
  exibirPlano: boolean;
}) {
  const plano = planos.find((p) => p.codPlanoPgto === planoSel);
  return (
    <div className="space-y-2 rounded-lg bg-csa-azul/5 px-4 py-3 text-sm">
      <p className="font-medium text-grafite">Revise antes de confirmar</p>
      <ul className="space-y-1 text-cinza-suave">
        <li>
          <strong className="text-grafite">Candidato:</strong> {candidato.nome}
        </li>
        <li>
          <strong className="text-grafite">Inscrição:</strong> nº{" "}
          {candidato.numeroInscricao}
        </li>
        {exibirPlano ? (
          plano && (
            <li>
              <strong className="text-grafite">Plano:</strong>{" "}
              {plano.descricao ?? plano.codPlanoPgto}
              {plano.numeroParcelas ? ` — ${plano.numeroParcelas}x de ` : " — "}
              {moeda(plano.valor)}
            </li>
          )
        ) : (
          <li>
            <strong className="text-grafite">Plano:</strong> os valores das
            mensalidades serão divulgados em breve.
          </li>
        )}
      </ul>
      <p className="text-cinza-suave">
        Ao confirmar, a matrícula será efetivada no sistema acadêmico.
      </p>
    </div>
  );
}

function Resultado({
  mensagem,
  numeroInscricao,
  idps,
  onConcluir,
}: {
  mensagem: string | null;
  numeroInscricao: number;
  idps: number;
  onConcluir?: () => void;
}) {
  const [boleto, setBoleto] = useState<
    | {
        idBoleto: number | null;
        temPdf: boolean;
        urlBoletoFixo: string | null;
        linhaDigitavel: string | null;
      }
    | "carregando"
    | null
  >("carregando");

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const q = new URLSearchParams({
          numeroInscricao: String(numeroInscricao),
          idps: String(idps),
        });
        const res = await fetch(`/api/matricula/boleto?${q.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as
          | {
              ok: true;
              boleto?: {
                idBoleto: number | null;
                temPdf: boolean;
                urlBoletoFixo: string | null;
                linhaDigitavel: string | null;
              } | null;
            }
          | { ok: false };
        if (ativo) setBoleto(data.ok ? (data.boleto ?? null) : null);
      } catch {
        if (ativo) setBoleto(null);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [numeroInscricao, idps]);

  const urlBoletoPdf =
    boleto && boleto !== "carregando" && boleto.temPdf && boleto.idBoleto
      ? `/api/matricula/boleto?numeroInscricao=${numeroInscricao}&idps=${idps}` +
        `&pdf=1&idBoleto=${boleto.idBoleto}`
      : null;

  const urlBoletoFixo =
    boleto && boleto !== "carregando" ? boleto.urlBoletoFixo : null;

  const linhaDigitavel =
    boleto && boleto !== "carregando" ? boleto.linhaDigitavel : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg bg-csa-azul/5 px-4 py-4 text-sm">
        <p className="text-base font-semibold text-csa-azul">
          Matrícula concluída!
        </p>
        <p className="whitespace-pre-line text-cinza-suave">
          {mensagem ??
            "Sua matrícula foi registrada com sucesso. Em breve você receberá as próximas orientações por e-mail."}
        </p>
      </div>

      {boleto === "carregando" && (
        <p className="text-sm text-cinza-suave">Verificando boleto…</p>
      )}

      {urlBoletoPdf && (
        <a
          href={urlBoletoPdf}
          target="_blank"
          rel="noopener noreferrer"
          className={botaoBoleto}
        >
          Baixar boleto da matrícula
        </a>
      )}

      {!urlBoletoPdf && urlBoletoFixo && (
        <a
          href={urlBoletoFixo}
          target="_blank"
          rel="noopener noreferrer"
          className={botaoBoleto}
        >
          Acessar boleto da matrícula
        </a>
      )}

      {linhaDigitavel && (
        <LinhaDigitavelBoleto linhaDigitavel={linhaDigitavel} />
      )}

      <button type="button" onClick={onConcluir} className={botaoSecundario}>
        Voltar aos candidatos
      </button>
    </div>
  );
}
