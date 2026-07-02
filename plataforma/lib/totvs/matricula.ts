import "server-only";
import { rmFetch } from "@/lib/rm/client";

// ---------------------------------------------------------------------------
// Camada de MATRÍCULA (leitura autenticada + escrita) — WebAPI EduPS
// ---------------------------------------------------------------------------
//
// Endpoints CONFIRMADOS no código-fonte do portal TOTVS
// (FrameHTML/Web/App/Edu/PortalProcessoSeletivo/js/matricula/matricula.factory.js,
//  js/centralcandidato/centralcandidato.factory.js e js/financeiro/financeiro.factory.js).
//
// RESOLUÇÃO DE URL: EDUPS_CONST_GLOBAL_URL_BASE_SERVICOS = base + 'TOTVSProcessoSeletivo/:method'.
// O `:method` é um placeholder de template do $resource; quando não é preenchido, ele
// colapsa. Logo TODOS os endpoints resolvem para `{RM_API_BASE}/TOTVSProcessoSeletivo/<path>`
// — a MESMA convenção usada em inscricao.ts. Aqui: webapi="TOTVSProcessoSeletivo" e o
// `path` é, por ex., "CentralCandidato/v1/ResultadoAreaInteresse".
//
//   GET  CentralCandidato/v1/ResultadoAreaInteresse            → elegibilidade (status da opção)
//   GET  CentralCandidato/v1/ParametrosMatriculaAreaOfertada   → flags que dirigem o wizard
//   GET  CentralCandidato/v1/PeriodoMatricula                  → janela de matrícula aberta?
//   GET  CentralCandidato/v1/CarregaPlanosPagamento            → planos de pagamento
//   GET  CentralCandidato/v1/DocumentosExigidosMatricula       → documentos exigidos
//   POST CentralCandidato/v1/UploadDocumentosMatricula         → upload de documento
//   GET  CentralCandidato/v1/DocumentosCandidatoMatricula      → documentos já enviados
//   DEL  CentralCandidato/v1/DeleteDocumentosMatricula         → remove documento
//   GET  CentralCandidato/v2/GeraRelatorioContratoMatricula    → PDF do contrato
//   GET  CentralCandidato/v1/ValidaTokenAssinaturaContrato     → valida token de assinatura
//   POST CentralCandidato/v2/RealizaAssinaturaContratoToken    → assina contrato com token
//   POST CentralCandidato/v2/ReenviarEmailTokenAssinaturaContrato → reenvia token por e-mail
//   POST CentralCandidato/v1/SalvaMatriculaViaCentral          → EFETIVA a matrícula (escrita)
//   GET  CentralCandidato/v1/InfoAlunoEducacional              → dados do aluno (RA) pós-matrícula
//   GET  Financeiro/InfoBoletoMatricula                        → boleto da matrícula
//
// Todas exigem sessão autenticada (cookie do RM, guardado server-side). O webapi
// base é "TOTVSProcessoSeletivo" (o mesmo da inscrição).

const WEBAPI = "TOTVSProcessoSeletivo";

/**
 * Guard de ambiente para a MATRÍCULA: enquanto o BFF apontar para a base/WebAPI de
 * PRODUÇÃO, as operações que GRAVAM/alteram estado no RM (assinatura, upload de
 * documentos e efetivação) ficam bloqueadas. Só liberar quando `RM_API_BASE`
 * apontar para HOMOLOGAÇÃO. Falha segura: sem a variável, assume somente leitura.
 */
export function matriculaSomenteLeitura(): boolean {
  const v = (process.env.MATRICULA_SOMENTE_LEITURA ?? "true")
    .trim()
    .toLowerCase();
  return (
    v !== "false" && v !== "0" && v !== "off" && v !== "nao" && v !== "não"
  );
}

// ---------------------------------------------------------------------------
// Enum de status da opção do inscrito (fiel ao portal TOTVS)
// FrameHTML/Web/App/Edu/PortalProcessoSeletivo/js/utils/edups-enums.constants.js
// ---------------------------------------------------------------------------

/**
 * Status da opção do inscrito (SPSOPCAOINSCRITO.STATUS). Só `EmChamada` (5) e
 * `CompareceuChamada` (7) habilitam a matrícula via portal — replica os checks
 * de centralcandidatoEB/ES.controller.js.
 */
export const STATUS_OPCAO = {
  InscritoParaSelecao: 0,
  DescMeiosIlicitos: 2,
  DescMotivoNota: 3,
  AusenteProva: 4,
  EmChamada: 5,
  CompareceuChamada: 7,
  ProvaCancelada: 8,
  AusenteChamada: 9,
  ClassificadoChamada: 10,
  ChamadaEmOutraOpcao: 11,
  CandidatoTreineiro: 12,
  DescInsuficienciaPerfil: 13,
  DescEntrevista: 14,
  ClassificacaoPendente: 15,
  ClassificadoProximaEtapa: 16,
} as const;

/** Status que habilitam a matrícula pelo portal. */
export const STATUS_OPCAO_ELEGIVEIS: ReadonlyArray<number> = [
  STATUS_OPCAO.EmChamada,
  STATUS_OPCAO.CompareceuChamada,
];

/** Interpreta flags "T"/"F" (ou boolean) do RM como booleano. */
function flagRm(v: unknown): boolean {
  return v === true || v === "T" || v === "t" || v === "1" || v === 1;
}

/** Desembrulha o envelope da EduPS (`{ data: ... }`) e retorna a lista bruta. */
function listaRegistros(payload: unknown): Array<Record<string, unknown>> {
  const env = payload as { data?: unknown } | undefined;
  const corpo =
    env && typeof env === "object" && "data" in env ? env.data : env;
  if (Array.isArray(corpo)) return corpo as Array<Record<string, unknown>>;
  if (corpo && typeof corpo === "object") {
    return [corpo as Record<string, unknown>];
  }
  return [];
}

/** Desembrulha o envelope da EduPS e retorna o 1º registro. */
function primeiroRegistro(
  payload: unknown,
): Record<string, unknown> | undefined {
  return listaRegistros(payload)[0];
}

/**
 * Detecta erro da EduPS no envelope. Em erro, a WebAPI devolve HTTP 200 com
 * `data` sendo um objeto contendo uma chave do tipo "RMException:Message".
 */
function temErroRm(payload: unknown): boolean {
  const env = payload as { data?: unknown } | undefined;
  const corpo =
    env && typeof env === "object" && "data" in env ? env.data : env;
  if (corpo && typeof corpo === "object" && !Array.isArray(corpo)) {
    return Object.keys(corpo).some((k) => /exception/i.test(k));
  }
  return false;
}

/** Extrai a mensagem de erro do envelope da EduPS (chave "RMException:..."). */
function mensagemErroRm(payload: unknown): string | null {
  const env = payload as { data?: unknown } | undefined;
  const corpo =
    env && typeof env === "object" && "data" in env ? env.data : env;
  if (corpo && typeof corpo === "object" && !Array.isArray(corpo)) {
    const entrada = Object.entries(corpo as Record<string, unknown>).find(
      ([k]) => /exception/i.test(k),
    );
    if (entrada) return String(entrada[1]);
  }
  return null;
}

/** Lê um número de um campo do RM (aceita número ou string numérica). */
function num(o: Record<string, unknown>, k: string): number | null {
  const v = o[k];
  if (typeof v === "number") return v;
  if (v != null && /^-?\d+$/.test(String(v))) return Number(v);
  return null;
}

/** Lê uma string não-vazia de um campo do RM. */
function str(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return v == null || String(v).trim() === "" ? null : String(v);
}

// ---------------------------------------------------------------------------
// 1) Elegibilidade — ResultadoAreaInteresse
// ---------------------------------------------------------------------------

/** Resultado do candidato numa área de interesse (base da elegibilidade). */
export interface ResultadoAreaInteresse {
  /** Área de interesse ofertada (usada como `idAreaOfertada` nas demais chamadas). */
  idAreaInteresse: number | null;
  numeroInscricao: number | null;
  /** Código do status da opção (ver STATUS_OPCAO). */
  statusOpcaoCodigo: number | null;
  statusOpcaoDescricao: string | null;
  /** Matrícula liberada no portal para esta área (SPSAREAOFERTADA.DISPONIBILIZAMATRICULAPORTAL). */
  disponibilizaMatriculaPortal: boolean;
  codUsuarioPS: number | null;
  /** true quando o candidato pode se matricular por esta área (status + flag). */
  elegivel: boolean;
  bruto: Record<string, unknown>;
}

/**
 * Consulta o resultado do candidato por área de interesse
 * (GET CentralCandidato/v1/ResultadoAreaInteresse). A elegibilidade para matrícula
 * exige status `EmChamada`/`CompareceuChamada` E `DISPONIBILIZAMATRICULAPORTAL='T'`.
 */
export async function obterResultadoAreaInteresse(
  rmCookie: string,
  numeroInscricao: number,
): Promise<ResultadoAreaInteresse[]> {
  const qs = new URLSearchParams({ numeroInscricao: String(numeroInscricao) });
  const res = await rmFetch(
    `CentralCandidato/v1/ResultadoAreaInteresse?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return [];

  const json = await res.json();
  if (temErroRm(json)) return [];

  return listaRegistros(json).map((r) => {
    const statusCodigo = num(r, "STATUS_OPCAO_CODIGO") ?? num(r, "STATUS");
    const disponibiliza = flagRm(r["DISPONIBILIZAMATRICULAPORTAL"]);
    const elegivel =
      disponibiliza &&
      statusCodigo != null &&
      STATUS_OPCAO_ELEGIVEIS.includes(statusCodigo);
    return {
      idAreaInteresse: num(r, "IDAREAINTERESSE"),
      numeroInscricao: num(r, "NUMEROINSCRICAO") ?? numeroInscricao,
      statusOpcaoCodigo: statusCodigo,
      statusOpcaoDescricao: str(r, "STATUS_OPCAO_DESC"),
      disponibilizaMatriculaPortal: disponibiliza,
      codUsuarioPS: num(r, "CODUSUARIOPS"),
      elegivel,
      bruto: r,
    };
  });
}

// ---------------------------------------------------------------------------
// 2) Parâmetros de matrícula da área ofertada — dirigem os passos do wizard
// ---------------------------------------------------------------------------

/**
 * Flags de parametrização da matrícula (GET ParametrosMatriculaAreaOfertada).
 * É a FONTE AUTORITATIVA que decide quais passos do wizard ligam — assim como
 * ParametrosProcessoSeletivo foi para a inscrição. Os nomes seguem o retorno da
 * EduPS (booleanos "T"/"F" ou true/false). Campos ausentes viram `false`.
 */
export interface ParametrosMatricula {
  cadastraContrato: boolean;
  utilizaTokenAssinaturaContrato: boolean;
  permiteEnvioDeDocumentos: boolean;
  exibirItinerario: boolean;
  fichaMedicaFlexivelHabilitada: boolean;
  atualizaDadosFiliacao1: boolean;
  atualizaDadosFiliacao2: boolean;
  atualizaDadosResponsavelFinanceiro: boolean;
  atualizaDadosResponsavelAcademico: boolean;
  validarDebitosResponsavelFinanceiro: boolean;
  /** Tipo de curso (usado por termo de imagem/voz e contrato). */
  codTipoCurso: number | null;
  /** Coligada + id do relatório do contrato (quando cadastraContrato=true). */
  codColigadaRelatorioContrato: number | null;
  idRelatorioContrato: number | null;
  /** Texto/instruções de matrícula configurados (SPSPARAMETROPS). */
  textoInstrucoes: string | null;
  bruto: Record<string, unknown>;
}

/**
 * Lê os parâmetros de matrícula da área ofertada
 * (GET CentralCandidato/v1/ParametrosMatriculaAreaOfertada). O wizard deve ligar
 * cada passo conforme estas flags — nunca assumir passos fixos.
 */
export async function obterParametrosMatricula(
  rmCookie: string,
  idAreaOfertada: number,
): Promise<ParametrosMatricula | null> {
  const qs = new URLSearchParams({ idAreaOfertada: String(idAreaOfertada) });
  const res = await rmFetch(
    `CentralCandidato/v1/ParametrosMatriculaAreaOfertada?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return null;

  const json = await res.json();
  if (temErroRm(json)) return null;
  const p = primeiroRegistro(json);
  if (!p) return null;

  return {
    cadastraContrato: flagRm(p["CadastraContrato"] ?? p["CADASTRACONTRATO"]),
    utilizaTokenAssinaturaContrato: flagRm(
      p["UtilizaTokenAssinaturaContrato"] ??
        p["UTILIZATOKENASSINATURACONTRATO"],
    ),
    permiteEnvioDeDocumentos: flagRm(
      p["PermiteEnvioDeDocumentos"] ?? p["PERMITEENVIODEDOCUMENTOS"],
    ),
    exibirItinerario: flagRm(p["ExibirItinerario"] ?? p["EXIBIRITINERARIO"]),
    fichaMedicaFlexivelHabilitada: flagRm(
      p["FichaMedicaFlexivelHabilitada"] ?? p["FICHAMEDICAFLEXIVELHABILITADA"],
    ),
    atualizaDadosFiliacao1: flagRm(
      p["AtualizaDadosFiliacao1"] ?? p["ATUALIZADADOSFILIACAO1"],
    ),
    atualizaDadosFiliacao2: flagRm(
      p["AtualizaDadosFiliacao2"] ?? p["ATUALIZADADOSFILIACAO2"],
    ),
    atualizaDadosResponsavelFinanceiro: flagRm(
      p["AtualizaDadosResponsavelFinanceiro"] ??
        p["ATUALIZADADOSRESPONSAVELFINANCEIRO"],
    ),
    atualizaDadosResponsavelAcademico: flagRm(
      p["AtualizaDadosResponsavelAcademico"] ??
        p["ATUALIZADADOSRESPONSAVELACADEMICO"],
    ),
    validarDebitosResponsavelFinanceiro: flagRm(
      p["ValidarDebitosResponsavelFinanceiro"] ??
        p["VALIDARDEBITOSRESPONSAVELFINANCEIRO"],
    ),
    codTipoCurso: num(p, "CodTipoCurso") ?? num(p, "CODTIPOCURSO"),
    codColigadaRelatorioContrato:
      num(p, "CodColigadaRelatorio") ?? num(p, "CODCOLIGADARELATORIO"),
    idRelatorioContrato: num(p, "IdRelatorio") ?? num(p, "IDRELATORIO"),
    textoInstrucoes:
      str(p, "TextoInstrucoesMatricula") ?? str(p, "TEXTOINSTRUCOESMATRICULA"),
    bruto: p,
  };
}

// ---------------------------------------------------------------------------
// 3) Período de matrícula — a janela está aberta?
// ---------------------------------------------------------------------------

export interface PeriodoMatricula {
  /** true quando a matrícula está dentro do período configurado. */
  aberto: boolean;
  dataInicio: string | null;
  dataFim: string | null;
  mensagem: string | null;
  bruto: Record<string, unknown>;
}

/**
 * Consulta o período de matrícula da área ofertada
 * (GET CentralCandidato/v1/PeriodoMatricula).
 */
export async function obterPeriodoMatricula(
  rmCookie: string,
  idAreaOfertada: number,
): Promise<PeriodoMatricula | null> {
  const qs = new URLSearchParams({ idAreaOfertada: String(idAreaOfertada) });
  const res = await rmFetch(
    `CentralCandidato/v1/PeriodoMatricula?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return null;

  const json = await res.json();
  if (temErroRm(json)) {
    return {
      aberto: false,
      dataInicio: null,
      dataFim: null,
      mensagem: mensagemErroRm(json),
      bruto: {},
    };
  }
  const p = primeiroRegistro(json);
  if (!p) return null;

  return {
    aberto:
      flagRm(p["PERIODOABERTO"]) ||
      flagRm(p["PeriodoAberto"]) ||
      flagRm(p["MATRICULAABERTA"]),
    dataInicio: str(p, "DTINICIO") ?? str(p, "DataInicio"),
    dataFim: str(p, "DTTERMINO") ?? str(p, "DataFim"),
    mensagem: str(p, "MENSAGEM") ?? str(p, "Mensagem"),
    bruto: p,
  };
}

// ---------------------------------------------------------------------------
// 4) Planos de pagamento
// ---------------------------------------------------------------------------

export interface PlanoPagamento {
  codPlanoPgto: string | null;
  descricao: string | null;
  valor: number | null;
  numeroParcelas: number | null;
  bruto: Record<string, unknown>;
}

/**
 * Lista os planos de pagamento disponíveis para a matrícula
 * (GET CentralCandidato/v1/CarregaPlanosPagamento).
 */
export async function carregarPlanosPagamento(
  rmCookie: string,
  idAreaOfertada: number,
  numeroInscricao: number,
): Promise<PlanoPagamento[]> {
  const qs = new URLSearchParams({
    idAreaOfertada: String(idAreaOfertada),
    numeroInscricao: String(numeroInscricao),
  });
  const res = await rmFetch(
    `CentralCandidato/v1/CarregaPlanosPagamento?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return [];

  const json = await res.json();
  if (temErroRm(json)) return [];

  return listaRegistros(json).map((r) => ({
    codPlanoPgto: str(r, "CODPLANOPGTO") ?? str(r, "CodPlanoPgto"),
    descricao: str(r, "DESCRICAO") ?? str(r, "Descricao"),
    valor: num(r, "VALOR") ?? num(r, "Valor"),
    numeroParcelas: num(r, "NUMEROPARCELAS") ?? num(r, "NumeroParcelas"),
    bruto: r,
  }));
}

// ---------------------------------------------------------------------------
// 5) Documentos exigidos na matrícula
// ---------------------------------------------------------------------------

export interface DocumentoExigidoMatricula {
  codDocumento: number | null;
  descricao: string | null;
  obrigatorio: boolean;
  bruto: Record<string, unknown>;
}

/**
 * Lista os documentos exigidos na matrícula da área ofertada
 * (GET CentralCandidato/v1/DocumentosExigidosMatricula).
 */
export async function obterDocumentosExigidosMatricula(
  rmCookie: string,
  idAreaOfertada: number,
): Promise<DocumentoExigidoMatricula[]> {
  const qs = new URLSearchParams({ idAreaOfertada: String(idAreaOfertada) });
  const res = await rmFetch(
    `CentralCandidato/v1/DocumentosExigidosMatricula?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return [];

  const json = await res.json();
  if (temErroRm(json)) return [];

  return listaRegistros(json).map((r) => ({
    codDocumento: num(r, "CODDOCUMENTO") ?? num(r, "CodDocumento"),
    descricao: str(r, "DESCRICAO") ?? str(r, "Descricao"),
    obrigatorio: flagRm(r["OBRIGATORIO"] ?? r["Obrigatorio"]),
    bruto: r,
  }));
}

/**
 * Documento a enviar na matrícula. `arquivoBase64` é o base64 PURO do arquivo
 * (sem o prefixo `data:...;base64,`). Espelha o item montado pelo portal nativo
 * (matricula.service.js → objParseToJSONDocumentosExigidos).
 */
export interface DocumentoMatriculaUpload {
  codDocumento: number;
  detalhe: string;
  nomeArquivo: string;
  arquivoBase64: string;
}

export interface ResultadoUploadDocumentos {
  ok: boolean;
  erro: string | null;
  bruto: unknown;
}

/**
 * Envia os documentos exigidos da matrícula
 * (POST CentralCandidato/v1/UploadDocumentosMatricula). O corpo replica o portal
 * nativo: `{ SPSDOCUMENTOSEXIGIDOS: [{ CODDOCUMENTO, DETALHE, NOMEARQUIVO, ARQUIVO }] }`.
 */
export async function enviarDocumentosMatricula(
  rmCookie: string,
  idAreaOfertada: number,
  numeroInscricao: number,
  documentos: DocumentoMatriculaUpload[],
): Promise<ResultadoUploadDocumentos> {
  const qs = new URLSearchParams({
    idAreaOfertada: String(idAreaOfertada),
    numeroInscricao: String(numeroInscricao),
  });
  const body = {
    SPSDOCUMENTOSEXIGIDOS: documentos.map((d) => ({
      CODDOCUMENTO: d.codDocumento,
      DETALHE: d.detalhe,
      NOMEARQUIVO: d.nomeArquivo,
      ARQUIVO: d.arquivoBase64,
    })),
  };
  const res = await rmFetch(
    `CentralCandidato/v1/UploadDocumentosMatricula?${qs.toString()}`,
    { webapi: WEBAPI, method: "POST", body, cookie: rmCookie },
  );
  if (!res.ok) return { ok: false, erro: null, bruto: null };

  const json = await res.json();
  if (temErroRm(json)) {
    return { ok: false, erro: mensagemErroRm(json), bruto: json };
  }
  return { ok: true, erro: null, bruto: json };
}

export interface DocumentoCandidatoMatricula {
  codDocumento: number | null;
  detalhe: string | null;
  nomeOriginal: string | null;
  bruto: Record<string, unknown>;
}

/**
 * Lista os documentos já enviados pelo candidato
 * (GET CentralCandidato/v1/DocumentosCandidatoMatricula).
 */
export async function listarDocumentosCandidatoMatricula(
  rmCookie: string,
  numeroInscricao: number,
): Promise<DocumentoCandidatoMatricula[]> {
  const qs = new URLSearchParams({ numeroInscricao: String(numeroInscricao) });
  const res = await rmFetch(
    `CentralCandidato/v1/DocumentosCandidatoMatricula?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return [];

  const json = await res.json();
  if (temErroRm(json)) return [];

  return listaRegistros(json).map((r) => ({
    codDocumento: num(r, "CODDOCUMENTO") ?? num(r, "CodDocumento"),
    detalhe: str(r, "DETALHE") ?? str(r, "Detalhe"),
    nomeOriginal: str(r, "NOMEORIGINAL") ?? str(r, "NomeOriginal"),
    bruto: r,
  }));
}

/**
 * Remove um documento enviado pelo candidato
 * (DELETE CentralCandidato/v1/DeleteDocumentosMatricula).
 */
export async function removerDocumentoMatricula(
  rmCookie: string,
  numeroInscricao: number,
  nomeOriginal: string,
): Promise<ResultadoUploadDocumentos> {
  const qs = new URLSearchParams({
    numeroInscricao: String(numeroInscricao),
    nomeOriginal,
  });
  const res = await rmFetch(
    `CentralCandidato/v1/DeleteDocumentosMatricula?${qs.toString()}`,
    { webapi: WEBAPI, method: "DELETE", cookie: rmCookie },
  );
  if (!res.ok) return { ok: false, erro: null, bruto: null };

  const json = await res.json();
  if (temErroRm(json)) {
    return { ok: false, erro: mensagemErroRm(json), bruto: json };
  }
  return { ok: true, erro: null, bruto: json };
}

// ---------------------------------------------------------------------------
// 6) Contrato — geração do PDF, validação e assinatura por token
// ---------------------------------------------------------------------------

export interface ContratoMatricula {
  /** Base64 do PDF/imagem do contrato (para exibir/assinar). */
  base64: string | null;
  erro: string | null;
  bruto: Record<string, unknown> | null;
}

/**
 * Gera o relatório (PDF) do contrato de matrícula
 * (GET CentralCandidato/v2/GeraRelatorioContratoMatricula). Os ids do relatório
 * vêm de `ParametrosMatricula` (codColigadaRelatorioContrato/idRelatorioContrato).
 */
export async function gerarContratoMatricula(
  rmCookie: string,
  params: {
    idAreaOfertada: number;
    codColigadaRelatorio: number;
    idRelatorio: number;
    numeroInscricao: number;
  },
): Promise<ContratoMatricula> {
  const qs = new URLSearchParams({
    idAreaOfertada: String(params.idAreaOfertada),
    codColigadaRelatorio: String(params.codColigadaRelatorio),
    idRelatorio: String(params.idRelatorio),
    numeroInscricao: String(params.numeroInscricao),
  });
  const res = await rmFetch(
    `CentralCandidato/v2/GeraRelatorioContratoMatricula?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return { base64: null, erro: null, bruto: null };

  const json = await res.json();
  if (temErroRm(json)) {
    return { base64: null, erro: mensagemErroRm(json), bruto: null };
  }
  const b = primeiroRegistro(json);
  if (!b) return { base64: null, erro: null, bruto: null };

  const report =
    b["TOTVSReport"] ?? b["TotvsReport"] ?? b["BYTES"] ?? b["Arquivo"];
  return {
    base64: report != null && String(report).trim() ? String(report) : null,
    erro: null,
    bruto: b,
  };
}

export interface ResultadoAssinatura {
  ok: boolean;
  erro: string | null;
  bruto: unknown;
}

/**
 * Valida o token de assinatura do contrato
 * (GET CentralCandidato/v1/ValidaTokenAssinaturaContrato).
 */
export async function validarTokenAssinaturaContrato(
  rmCookie: string,
  params: { idAreaOfertada: number; numeroInscricao: number; token: string },
): Promise<ResultadoAssinatura> {
  const qs = new URLSearchParams({
    idAreaOfertada: String(params.idAreaOfertada),
    numeroInscricao: String(params.numeroInscricao),
    token: params.token,
  });
  const res = await rmFetch(
    `CentralCandidato/v1/ValidaTokenAssinaturaContrato?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return { ok: false, erro: null, bruto: null };

  const json = await res.json();
  if (temErroRm(json)) {
    return { ok: false, erro: mensagemErroRm(json), bruto: json };
  }
  const b = primeiroRegistro(json);
  const valido = b
    ? flagRm(b["VALIDO"] ?? b["Valido"] ?? b["TOKENVALIDO"])
    : true;
  return { ok: valido, erro: null, bruto: json };
}

/**
 * Reenvia o e-mail com o token de assinatura do contrato
 * (POST CentralCandidato/v2/ReenviarEmailTokenAssinaturaContrato).
 */
export async function reenviarEmailTokenAssinatura(
  rmCookie: string,
  params: { idAreaOfertada: number; numeroInscricao: number; ipClient: string },
): Promise<ResultadoAssinatura> {
  const qs = new URLSearchParams({
    idAreaOfertada: String(params.idAreaOfertada),
    numeroInscricao: String(params.numeroInscricao),
    ipClient: params.ipClient,
  });
  const res = await rmFetch(
    `CentralCandidato/v2/ReenviarEmailTokenAssinaturaContrato?${qs.toString()}`,
    { webapi: WEBAPI, method: "POST", body: {}, cookie: rmCookie },
  );
  if (!res.ok) return { ok: false, erro: null, bruto: null };

  const json = await res.json();
  if (temErroRm(json)) {
    return { ok: false, erro: mensagemErroRm(json), bruto: json };
  }
  return { ok: true, erro: null, bruto: json };
}

/**
 * Realiza a assinatura do contrato com token
 * (POST CentralCandidato/v2/RealizaAssinaturaContratoToken).
 */
export async function realizarAssinaturaContratoToken(
  rmCookie: string,
  params: { idAreaOfertada: number; numeroInscricao: number; ipClient: string },
): Promise<ResultadoAssinatura> {
  const qs = new URLSearchParams({
    idAreaOfertada: String(params.idAreaOfertada),
    numeroInscricao: String(params.numeroInscricao),
    ipClient: params.ipClient,
  });
  const res = await rmFetch(
    `CentralCandidato/v2/RealizaAssinaturaContratoToken?${qs.toString()}`,
    { webapi: WEBAPI, method: "POST", body: {}, cookie: rmCookie },
  );
  if (!res.ok) return { ok: false, erro: null, bruto: null };

  const json = await res.json();
  if (temErroRm(json)) {
    return { ok: false, erro: mensagemErroRm(json), bruto: json };
  }
  return { ok: true, erro: null, bruto: json };
}

// ---------------------------------------------------------------------------
// 7) Efetivação da matrícula (ESCRITA)
// ---------------------------------------------------------------------------

export interface ResultadoMatricula {
  ok: boolean;
  /** Mensagem de confirmação personalizada configurada no RM, quando houver. */
  mensagemConfirmacao: string | null;
  erro: string | null;
  bruto: unknown;
}

/**
 * Efetiva a matrícula do candidato (POST CentralCandidato/v1/SalvaMatriculaViaCentral).
 * ÚNICA operação que GRAVA no RM. O corpo replica exatamente o `objMatricula` do
 * portal nativo (fazMatriculaCandidato): numeroInscricao, idAreaOfertada,
 * codPlanoPgto, arquivoContrato (base64 do contrato assinado) e ipClient.
 */
export async function salvarMatricula(
  rmCookie: string,
  params: {
    numeroInscricao: number;
    idAreaOfertada: number;
    codPlanoPgto: string | null;
    arquivoContrato: string | null;
    ipClient: string;
  },
): Promise<ResultadoMatricula> {
  const body = {
    numeroInscricao: params.numeroInscricao,
    idAreaOfertada: params.idAreaOfertada,
    codPlanoPgto: params.codPlanoPgto,
    arquivoContrato: params.arquivoContrato,
    ipClient: params.ipClient,
  };
  const res = await rmFetch("CentralCandidato/v1/SalvaMatriculaViaCentral", {
    webapi: WEBAPI,
    method: "POST",
    body,
    cookie: rmCookie,
  });

  if (!res.ok) {
    const corpo = await res.text().catch(() => null);
    let detalhe: unknown = corpo;
    try {
      detalhe = corpo ? JSON.parse(corpo) : null;
    } catch {
      /* mantém texto cru */
    }
    return { ok: false, mensagemConfirmacao: null, erro: null, bruto: detalhe };
  }

  const json = await res.json();
  if (temErroRm(json)) {
    return {
      ok: false,
      mensagemConfirmacao: null,
      erro: mensagemErroRm(json),
      bruto: json,
    };
  }

  // Retorno de sucesso: coleção MATRICULA com eventual mensagem personalizada.
  const b = primeiroRegistro(json);
  const mensagem = b
    ? (str(b, "PRTMSGCONFIRMACAOMAT") ?? str(b, "MENSAGEM"))
    : null;
  return { ok: true, mensagemConfirmacao: mensagem, erro: null, bruto: json };
}

// ---------------------------------------------------------------------------
// 8) Boleto da matrícula
// ---------------------------------------------------------------------------

export interface BoletoMatricula {
  numeroInscricao: number;
  idBoleto: number | null;
  tipoBoleto: string | null;
  boletoRegistrado: boolean;
  urlBoletoFixo: string | null;
  temPdf: boolean;
  bruto: Record<string, unknown>;
}

/**
 * Recupera as informações do boleto da matrícula
 * (GET Financeiro/InfoBoletoMatricula). O PDF em si é baixado pela 2ª via
 * (Financeiro/2aviaBoletoCandidato), como na inscrição.
 */
export async function obterBoletoMatricula(
  rmCookie: string,
  numeroInscricao: number,
): Promise<BoletoMatricula | null> {
  const qs = new URLSearchParams({ numeroInscricao: String(numeroInscricao) });
  const res = await rmFetch(`Financeiro/InfoBoletoMatricula?${qs.toString()}`, {
    webapi: WEBAPI,
    cookie: rmCookie,
  });
  if (!res.ok) return null;

  const json = await res.json();
  if (temErroRm(json)) return null;
  const b = primeiroRegistro(json);
  if (!b) return null;

  const idBoleto = num(b, "IDBOLETO");
  const tipoBoleto = str(b, "TIPOBOLETO");
  const temPdf =
    idBoleto != null && (tipoBoleto ?? "").toUpperCase() !== "HTML";

  return {
    numeroInscricao,
    idBoleto,
    tipoBoleto,
    boletoRegistrado: flagRm(b["BOLETOREGISTRADO"]),
    urlBoletoFixo: str(b, "URLBOLETOFIXO"),
    temPdf,
    bruto: b,
  };
}

// ---------------------------------------------------------------------------
// 9) Dados do aluno pós-matrícula (RA)
// ---------------------------------------------------------------------------

export interface InfoAlunoEducacional {
  ra: string | null;
  statusMatricula: string | null;
  alunoAtivo: boolean;
  bruto: Record<string, unknown>;
}

/**
 * Recupera os dados do aluno matriculado no Educacional (RA, status)
 * (GET CentralCandidato/v1/InfoAlunoEducacional).
 */
export async function obterInfoAlunoEducacional(
  rmCookie: string,
  params: { codColigada: number; idPS: number; numeroInscricao: number },
): Promise<InfoAlunoEducacional | null> {
  const qs = new URLSearchParams({
    codColigada: String(params.codColigada),
    idPS: String(params.idPS),
    numeroInscricao: String(params.numeroInscricao),
  });
  const res = await rmFetch(
    `CentralCandidato/v1/InfoAlunoEducacional?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return null;

  const json = await res.json();
  if (temErroRm(json)) return null;
  const b = primeiroRegistro(json);
  if (!b) return null;

  return {
    ra: str(b, "RA"),
    statusMatricula: str(b, "STATUSMATRIC") ?? str(b, "STATUSMATRICULA"),
    alunoAtivo: flagRm(b["ALUNOATIVO"]),
    bruto: b,
  };
}
