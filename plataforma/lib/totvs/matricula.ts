import "server-only";
import { rmFetch } from "@/lib/rm/client";
import { CODS_DOCS_OBRIGATORIOS_MATRICULA } from "@/lib/matricula-documentos";
import { query } from "./db";
import {
  mapaArquivosInscricaoPorCod,
  type ArquivoInscricaoPorCod,
} from "./inscricao";

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

/** Converte um valor de erro (string ou objeto) em texto legível. Evita o
 * "[object Object]" quando a EduPS devolve a exceção como objeto. */
function textoDeErroRm(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const m = o.Message ?? o.message ?? o.Mensagem ?? o.mensagem ?? o.Detail;
    if (typeof m === "string" && m.trim() !== "") return m;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
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
    if (entrada) return textoDeErroRm(entrada[1]);
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
  /** true quando o itinerário deve ser exibido NA MATRÍCULA (enum ≠ "Inscrição"). */
  exibirItinerario: boolean;
  fichaMedicaFlexivelHabilitada: boolean;
  atualizaDadosFiliacao1: boolean;
  atualizaDadosFiliacao2: boolean;
  atualizaDadosResponsavelFinanceiro: boolean;
  atualizaDadosResponsavelAcademico: boolean;
  /** Inclusão obrigatória dos respectivos blocos de pessoas. */
  obrigaFiliacao1: boolean;
  obrigaFiliacao2: boolean;
  obrigaResponsavelFinanceiro: boolean;
  obrigaResponsavelAcademico: boolean;
  validarDebitosResponsavelFinanceiro: boolean;
  exibeEtapaFiador: boolean;
  somenteRespFinanceiroAceitaContrato: boolean;
  /** Plano de pagamento padrão e se o portal permite trocar de plano. */
  codPlanoPgtoPadrao: string | null;
  alteraPlanoPagamentoPortal: boolean;
  /** Tipo de curso (usado por termo de imagem/voz e contrato). */
  codTipoCurso: number | null;
  /** Coligada + id do relatório do contrato (quando cadastraContrato=true). 0 = sem PDF. */
  codColigadaRelatorioContrato: number | null;
  idRelatorioContrato: number | null;
  /** Chaves acadêmicas usadas por débitos/fiador. */
  idPerlet: number | null;
  idHabilitacaoFilial: number | null;
  codFilial: number | null;
  /** "N"/"P"/"M"... regra de filiação obrigatória. */
  tipoFiliacaoObrigatoria: string | null;
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

  // ExibirItinerario é um ENUM (0=NãoUtiliza, 1=Inscrição, 2=Matrícula, 3=Ambos),
  // não um booleano. O itinerário só entra na MATRÍCULA quando é 2 ou 3 e existe
  // itinerário configurado na área ofertada (fiel a matricula.service.js).
  const itinerarioEnum =
    num(p, "ExibirItinerario") ?? num(p, "EXIBIRITINERARIO");
  const existeItinerario = flagRm(
    p["ExisteItinerarioAreaOfertada"] ?? p["EXISTEITINERARIOAREAOFERTADA"],
  );

  return {
    cadastraContrato: flagRm(p["CadastraContrato"] ?? p["CADASTRACONTRATO"]),
    utilizaTokenAssinaturaContrato: flagRm(
      p["UtilizaTokenAssinaturaContrato"] ??
        p["UTILIZATOKENASSINATURACONTRATO"],
    ),
    permiteEnvioDeDocumentos: flagRm(
      p["PermiteEnvioDeDocumentos"] ?? p["PERMITEENVIODEDOCUMENTOS"],
    ),
    exibirItinerario:
      existeItinerario &&
      itinerarioEnum != null &&
      (itinerarioEnum === 2 || itinerarioEnum === 3),
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
    obrigaFiliacao1: flagRm(
      p["ObrigaInclusaoDadosFiliacao1"] ?? p["OBRIGAINCLUSAODADOSFILIACAO1"],
    ),
    obrigaFiliacao2: flagRm(
      p["ObrigaInclusaoDadosFiliacao2"] ?? p["OBRIGAINCLUSAODADOSFILIACAO2"],
    ),
    obrigaResponsavelFinanceiro: flagRm(
      p["ObrigaInclusaoDadosResponsavelFinanceiro"] ??
        p["OBRIGAINCLUSAODADOSRESPONSAVELFINANCEIRO"],
    ),
    obrigaResponsavelAcademico: flagRm(
      p["ObrigaInclusaoDadosResponsavelAcademico"] ??
        p["OBRIGAINCLUSAODADOSRESPONSAVELACADEMICO"],
    ),
    validarDebitosResponsavelFinanceiro: flagRm(
      p["ValidarDebitosResponsavelFinanceiro"] ??
        p["VALIDARDEBITOSRESPONSAVELFINANCEIRO"],
    ),
    exibeEtapaFiador: flagRm(p["ExibeEtapaFiador"] ?? p["EXIBEETAPAFIADOR"]),
    somenteRespFinanceiroAceitaContrato: flagRm(
      p["SomenteRespFinAceitaContrato"] ?? p["SOMENTERESPFINACEITACONTRATO"],
    ),
    codPlanoPgtoPadrao: str(p, "CodPlanoPgto") ?? str(p, "CODPLANOPGTO"),
    alteraPlanoPagamentoPortal: flagRm(
      p["AlteraPlnoPgtoPortal"] ?? p["ALTERAPLNOPGTOPORTAL"],
    ),
    codTipoCurso: num(p, "CodTipoCurso") ?? num(p, "CODTIPOCURSO"),
    codColigadaRelatorioContrato:
      num(p, "CodColigadaRelatorioContratoMatricula") ??
      num(p, "CODCOLIGADARELATORIOCONTRATOMATRICULA"),
    idRelatorioContrato:
      num(p, "IdRelatorioContratoMatricula") ??
      num(p, "IDRELATORIOCONTRATOMATRICULA"),
    idPerlet: num(p, "IdPerlet") ?? num(p, "IDPERLET"),
    idHabilitacaoFilial:
      num(p, "IdHabilitacaoFilial") ?? num(p, "IDHABILITACAOFILIAL"),
    codFilial: num(p, "CodFilial") ?? num(p, "CODFILIAL"),
    tipoFiliacaoObrigatoria:
      str(p, "TipoFiliacaoObrigatoria") ?? str(p, "TIPOFILIACAOOBRIGATORIA"),
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
      flagRm(p["PERIODOVALIDO"]) ||
      flagRm(p["PeriodoValido"]) ||
      flagRm(p["PERIODOABERTO"]) ||
      flagRm(p["PeriodoAberto"]) ||
      flagRm(p["MATRICULAABERTA"]),
    dataInicio:
      str(p, "DTINIMATRICCENTRALCANDIDATO") ??
      str(p, "DTINICIO") ??
      str(p, "DataInicio"),
    dataFim:
      str(p, "DTFIMMATRICCENTRALCANDIDATO") ??
      str(p, "DTTERMINO") ??
      str(p, "DataFim"),
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

  return listaRegistros(json).map((r) => {
    // O nativo exibe `nomePlano` como título do plano (ligado ao curso)
    // — ver etapa-planos-pagamento.view.html. Os campos vêm em camelCase;
    // mantemos variações de caixa por segurança.
    const nomePlano =
      str(r, "nomePlano") ?? str(r, "NomePlano") ?? str(r, "NOMEPLANO");
    const descricaoPlano =
      str(r, "descricaoPlano") ??
      str(r, "DescricaoPlano") ??
      str(r, "DESCRICAOPLANO");
    return {
      codPlanoPgto:
        str(r, "codPlanoPgto") ??
        str(r, "CODPLANOPGTO") ??
        str(r, "CodPlanoPgto"),
      descricao:
        nomePlano ??
        descricaoPlano ??
        str(r, "DESCRICAO") ??
        str(r, "Descricao"),
      valor: num(r, "valor") ?? num(r, "VALOR") ?? num(r, "Valor"),
      numeroParcelas:
        num(r, "numeroParcelas") ??
        num(r, "NUMEROPARCELAS") ??
        num(r, "NumeroParcelas"),
      bruto: r,
    };
  });
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

  return (
    listaRegistros(json)
      .map((r) => {
        const codDocumento = num(r, "CODDOCUMENTO") ?? num(r, "CodDocumento");
        // O CSA definiu documentos obrigatórios em acordo com a secretaria que o RM
        // NÃO marca como obrigatórios; aplicamos a regra aqui (vale para a exibição
        // no cliente e para a validação do upload no BFF).
        const obrigatorioCsa =
          codDocumento != null &&
          CODS_DOCS_OBRIGATORIOS_MATRICULA.includes(codDocumento);
        return {
          codDocumento,
          descricao: str(r, "DESCRICAO") ?? str(r, "Descricao"),
          obrigatorio:
            flagRm(r["OBRIGATORIO"] ?? r["Obrigatorio"]) || obrigatorioCsa,
          bruto: r,
        };
      })
      // Remove documentos tratados em outro passo do wizard (o contrato é
      // gerado/assinado no passo de contrato, não é upload manual). Como novos
      // contratos (ex.: 2027) serão cadastrados com códigos diferentes, o filtro
      // é pelo NOME: qualquer documento cuja descrição contenha "contrato".
      .filter((d) => !(d.descricao ?? "").toLowerCase().includes("contrato"))
  );
}

/**
 * Reaproveitamento de documentos da INSCRIÇÃO na MATRÍCULA.
 *
 * O candidato já anexou documentos na inscrição; alguns deles servem também para
 * a matrícula e não precisam ser reenviados. A secretaria, porém, cadastrou o
 * MESMO documento com CÓDIGOS DIFERENTES em cada fase — por isso o mapa abaixo
 * relaciona `codDocumentoInscricao` (origem) → `codDocumento` (destino na
 * matrícula). Só reaproveitamos quando o código de destino EXISTE na lista de
 * exigidos da matrícula (senão o upload seria rejeitado pelo RM).
 */
export interface ParDocReaproveitavel {
  /** CODDOCUMENTO no slot de matrícula (destino do upload). */
  codDocumento: number;
  /** CODDOCUMENTO com que o arquivo foi enviado na inscrição (origem). */
  codDocumentoInscricao: number;
}

export const REAPROVEITAMENTO_DOCS_MATRICULA: ParDocReaproveitavel[] = [
  { codDocumento: 3, codDocumentoInscricao: 3 }, // (*) Certidão de Nascimento
  { codDocumento: 16, codDocumentoInscricao: 36 }, // Declaração de escolaridade
];

/** Documento da inscrição pronto para ser reaproveitado no passo da matrícula. */
export interface DocumentoReaproveitado {
  /** CODDOCUMENTO no slot de matrícula (destino). */
  codDocumento: number;
  /** CODDOCUMENTO com que o arquivo foi enviado na inscrição (origem). */
  codDocumentoInscricao: number;
  /** Descrição do slot de matrícula (usada como DETALHE no upload). */
  descricao: string | null;
  /** Nome amigável do arquivo enviado na inscrição. */
  nomeArquivo: string;
  /** Chave para baixar o arquivo da inscrição (`CODCOLIGADA|IDPS|NUM|NOMEARQUIVO`). */
  chaveDownload: string;
}

/**
 * Cruza os documentos EXIGIDOS na matrícula com os ARQUIVOS já enviados na
 * inscrição (via mapa de reaproveitamento) e devolve os que podem ser
 * pré-anexados. Retorna na ORDEM do `REAPROVEITAMENTO_DOCS_MATRICULA` (para que
 * apareçam como os primeiros do passo de documentos).
 */
export async function obterDocumentosReaproveitaveisMatricula(
  rmCookie: string,
  params: {
    codColigada: number;
    idps: number;
    numeroInscricao: number;
    idAreaOfertada: number;
  },
): Promise<DocumentoReaproveitado[]> {
  const { codColigada, idps, numeroInscricao, idAreaOfertada } = params;
  const exigidos = await obterDocumentosExigidosMatricula(
    rmCookie,
    idAreaOfertada,
  );
  const exigidoPorCod = new Map(
    exigidos
      .filter((d) => d.codDocumento != null)
      .map((d) => [d.codDocumento as number, d]),
  );
  const arquivos = await mapaArquivosInscricaoPorCod({
    codColigada,
    idps,
    numeroInscricao,
  });

  const reaproveitados: DocumentoReaproveitado[] = [];
  for (const par of REAPROVEITAMENTO_DOCS_MATRICULA) {
    const exig = exigidoPorCod.get(par.codDocumento);
    const arq = arquivos.get(par.codDocumentoInscricao);
    if (!exig || !arq) continue; // slot não exigido ou arquivo inexistente
    reaproveitados.push({
      codDocumento: par.codDocumento,
      codDocumentoInscricao: par.codDocumentoInscricao,
      descricao: exig.descricao,
      nomeArquivo: arq.nomeExibicao,
      chaveDownload: arq.chaveDownload,
    });
  }
  return reaproveitados;
}

/**
 * Localiza a CHAVE de download do arquivo de inscrição que reaproveita um slot de
 * matrícula (pela origem do mapa). Retorna `null` quando o slot não é
 * reaproveitável ou o arquivo não existe na inscrição. O base64 em si é baixado
 * na rota (que já usa `baixarArquivoDocumento`).
 */
export function resolverChaveReaproveitamento(
  codDocumentoMatricula: number,
  arquivosInscricao: Map<number, ArquivoInscricaoPorCod>,
): string | null {
  const par = REAPROVEITAMENTO_DOCS_MATRICULA.find(
    (p) => p.codDocumento === codDocumentoMatricula,
  );
  if (!par) return null;
  const arq = arquivosInscricao.get(par.codDocumentoInscricao);
  return arq ? arq.chaveDownload : null;
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
 * nativo: `{ SPSDOCUMENTOSEXIGIDOS: [{ CODDOCUMENTO, DETALHE, NOMEARQUIVO,
 * NOMEORIGINAL, ARQUIVO }] }`. `NOMEORIGINAL` é obrigatório: a WebAPI monta o
 * DataTable a partir das chaves do JSON e lê essa coluna no servidor — omiti-la
 * causa "A coluna 'NOMEORIGINAL' não pertence à tabela SPSDOCUMENTOSEXIGIDOS".
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
      NOMEORIGINAL: d.nomeArquivo,
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

  // O relatório de contrato da matrícula volta em `BytesPDF` (o portal nativo lê
  // report[0].BytesPDF); mantemos os demais nomes como fallback.
  const report =
    b["BytesPDF"] ??
    b["TOTVSReport"] ??
    b["TotvsReport"] ??
    b["BYTES"] ??
    b["Arquivo"];
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
  /** Linha digitável (IPTE) do boleto, para pagamento por copiar-e-colar. */
  linhaDigitavel: string | null;
  bruto: Record<string, unknown>;
}

// Coligada padrão do RM (mesma convenção de lib/totvs/queries.ts).
const COD_COLIGADA = Number(process.env.RM_COD_COLIGADA) || 1;

/**
 * Lê a linha digitável (FBOLETO.IPTE) de um boleto pelo id. Leitura direta no
 * CorporeRM (a WebAPI InfoBoletoMatricula não expõe a linha digitável). Retorna
 * apenas dígitos; null quando não houver boleto registrado com IPTE.
 */
export async function obterLinhaDigitavelBoleto(
  idBoleto: number,
  codColigada: number = COD_COLIGADA,
): Promise<string | null> {
  if (!Number.isInteger(idBoleto) || idBoleto <= 0) return null;
  try {
    const linhas = await query<{ IPTE: string | null }>(
      "SELECT IPTE FROM FBOLETO WHERE IDBOLETO = @id AND CODCOLIGADA = @col",
      { id: idBoleto, col: codColigada },
    );
    const ipte = (linhas[0]?.IPTE ?? "").replace(/\D/g, "");
    return ipte.length > 0 ? ipte : null;
  } catch {
    return null;
  }
}

/**
 * Recupera as informações do boleto da matrícula
 * (GET Financeiro/InfoBoletoMatricula). O PDF em si é baixado por
 * obterBoletoMatriculaPdf (Financeiro/BoletoMatricula).
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
  const linhaDigitavel =
    idBoleto != null ? await obterLinhaDigitavelBoleto(idBoleto) : null;

  return {
    numeroInscricao,
    idBoleto,
    tipoBoleto,
    boletoRegistrado: flagRm(b["BOLETOREGISTRADO"]),
    urlBoletoFixo: str(b, "URLBOLETOFIXO"),
    temPdf,
    linhaDigitavel,
    bruto: b,
  };
}

/**
 * Baixa o PDF do boleto da matrícula (GET Financeiro/BoletoMatricula, por
 * numeroInscricao + idBoleto). Ao contrário do boleto de inscrição, o boleto de
 * matrícula NÃO usa `2aviaBoletoCandidato` (cuja validação de dono é o
 * candidato e recusa o boleto do responsável financeiro com "não pertence ao
 * usuário logado"). Este endpoint devolve o PDF no campo `Bytes`.
 */
export async function obterBoletoMatriculaPdf(
  rmCookie: string,
  numeroInscricao: number,
  idBoleto: number,
): Promise<{ base64: string | null; erro: string | null }> {
  const qs = new URLSearchParams({
    numeroInscricao: String(numeroInscricao),
    idBoleto: String(idBoleto),
  });
  const res = await rmFetch(`Financeiro/BoletoMatricula?${qs.toString()}`, {
    webapi: WEBAPI,
    cookie: rmCookie,
  });
  if (!res.ok) return { base64: null, erro: null };

  const json = await res.json();

  // Erro da EduPS: `data` é objeto com chave "RMException:Message" (HTTP 200).
  const env = (json as { data?: unknown })?.data ?? json;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const entradaErro = Object.entries(env as Record<string, unknown>).find(
      ([k]) => /exception/i.test(k),
    );
    if (entradaErro) return { base64: null, erro: String(entradaErro[1]) };
  }
  if (temErroRm(json)) return { base64: null, erro: mensagemErroRm(json) };

  const b = primeiroRegistro(json);
  const bytes = b?.["Bytes"] ?? b?.["BYTES"];
  return {
    base64: bytes != null && String(bytes).trim() ? String(bytes) : null,
    erro: null,
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

// ---------------------------------------------------------------------------
// 10) Dados pessoais (candidato + relacionados) — leitura e escrita
// ---------------------------------------------------------------------------
//
// Fluxo fiel ao portal nativo (matricula.factory.js / matricula.service.js):
//   GET  CentralCandidato/v1/DadosPessoaisCandidatoResponsavel  → { data: { SPSUSUARIO: [...] } }
//   POST CentralCandidato/v1/DadosPessoaisCandidatoResponsavel  → grava 1+ pessoas
//   POST CentralCandidato/v1/AtualizaResponsavelTipoRelac       → vincula responsável×tipo
//   GET  CentralCandidato/v1/CarregaCamposObrigatoriosMatricula → visibilidade/obrigatoriedade
//   GET  CentralCandidato/v1/DebitosResponsavelFinanceiro       → débitos do resp. financeiro
//   GET  Lista* (Países/Estados/Municípios/Nacionalidade/…)     → listas de apoio
//
// A pessoa é sempre identificada por CODUSUARIOPS (chave do PS). O CPF é apenas
// atributo (e critério de unicidade que trava a edição quando já preenchido).

/** Extrai um array nomeado do envelope EduPS (`{ data: { CHAVE: [...] } }`). */
function arrayPorChave(
  payload: unknown,
  chaves: string[],
): Array<Record<string, unknown>> {
  const env = payload as { data?: unknown } | undefined;
  let corpo: unknown =
    env && typeof env === "object" && "data" in env ? env.data : env;
  // Alguns retornos aninham `data.data` (ex.: CarregaCamposObrigatoriosMatricula).
  if (
    corpo &&
    typeof corpo === "object" &&
    !Array.isArray(corpo) &&
    "data" in (corpo as Record<string, unknown>)
  ) {
    corpo = (corpo as Record<string, unknown>).data;
  }
  if (Array.isArray(corpo)) return corpo as Array<Record<string, unknown>>;
  if (corpo && typeof corpo === "object") {
    const obj = corpo as Record<string, unknown>;
    for (const c of chaves) {
      if (Array.isArray(obj[c]))
        return obj[c] as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/** Campo do cadastro de matrícula: visibilidade/obrigatoriedade por perfil. */
export interface CampoMatricula {
  grupo: string | null;
  idCampo: string | null;
  nomeCampo: string | null;
  visivelCandidato: boolean;
  obrigatorioCandidato: boolean;
  visivelResponsavel: boolean;
  obrigatorioResponsavel: boolean;
}

/**
 * Carrega os campos obrigatórios/visíveis da matrícula
 * (GET CentralCandidato/v1/CarregaCamposObrigatoriosMatricula). Dirige quais campos
 * cada formulário de pessoa mostra e quais são obrigatórios — nunca hardcodar.
 */
export async function obterCamposObrigatoriosMatricula(
  rmCookie: string,
): Promise<CampoMatricula[]> {
  const res = await rmFetch(
    "CentralCandidato/v1/CarregaCamposObrigatoriosMatricula",
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return [];

  const json = await res.json();
  if (temErroRm(json)) return [];

  return arrayPorChave(json, ["ListaParametrosPessoa"]).map((c) => ({
    grupo: str(c, "GrupoCampo"),
    idCampo: str(c, "IdCampo"),
    nomeCampo: str(c, "NomeCampo"),
    visivelCandidato: flagRm(c["VisivelCandidato"]),
    obrigatorioCandidato: flagRm(c["ObrigatorioCandidato"]),
    visivelResponsavel: flagRm(c["VisivelResponsavel"]),
    obrigatorioResponsavel: flagRm(c["ObrigatorioResponsavel"]),
  }));
}

/** Papel de uma pessoa no vínculo com o candidato. */
export type TipoRelacaoMatricula =
  | "candidato"
  | "pai"
  | "mae"
  | "responsavel_financeiro"
  | "responsavel_academico"
  | "fiador";

/** Pessoa (candidato ou relacionado) do cadastro de matrícula. */
export interface PessoaMatricula {
  codUsuarioPS: number | null;
  nome: string | null;
  cpf: string | null;
  email: string | null;
  tipoRelac: number | null;
  codUsuarioPSDep: number | null;
  /** Registro bruto completo (base para edição + POST de volta). */
  bruto: Record<string, unknown>;
}

/**
 * Lê os dados pessoais do candidato e relacionados
 * (GET CentralCandidato/v1/DadosPessoaisCandidatoResponsavel). Retorna o array
 * SPSUSUARIO tipado; `bruto` preserva todos os campos para reenvio no POST.
 */
export async function obterDadosPessoaisMatricula(
  rmCookie: string,
  numeroInscricao: number,
): Promise<PessoaMatricula[]> {
  const qs = new URLSearchParams({ numeroInscricao: String(numeroInscricao) });
  const res = await rmFetch(
    `CentralCandidato/v1/DadosPessoaisCandidatoResponsavel?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return [];

  const json = await res.json();
  if (temErroRm(json)) return [];

  return arrayPorChave(json, ["SPSUSUARIO"]).map((u) => ({
    codUsuarioPS: num(u, "CODUSUARIOPS"),
    nome: str(u, "NOME"),
    cpf: str(u, "CPF"),
    email: str(u, "EMAIL"),
    tipoRelac: num(u, "TIPORELAC"),
    codUsuarioPSDep: num(u, "CODUSUARIOPSDEP"),
    bruto: u,
  }));
}

export interface ResultadoSalvarDados {
  ok: boolean;
  erro: string | null;
  pessoas: Array<Record<string, unknown>> | null;
  bruto: unknown;
}

/**
 * Grava os dados pessoais de UMA pessoa (candidato ou relacionado)
 * (POST CentralCandidato/v1/DadosPessoaisCandidatoResponsavel). Corpo replica o
 * modelJSON nativo: `{ SPSUSUARIO: [pessoa], SPSINSCAREAOFERTACOMPL: [] }`.
 *
 * `pessoa` deve conter o registro completo (bruto carregado) com os campos
 * editados e as flags de papel (EHCANDIDATO/EHPAI/EHMAE/EHRESPFIN/EHRESPACAD/
 * EHFIADOR) já ajustadas; para relacionados, `CODUSUARIORELAC` = CODUSUARIOPS do
 * candidato. A validação do guard de somente-leitura é feita na rota BFF.
 */
export async function salvarDadosPessoaisMatricula(
  rmCookie: string,
  pessoa: Record<string, unknown>,
): Promise<ResultadoSalvarDados> {
  const body = { SPSUSUARIO: [pessoa], SPSINSCAREAOFERTACOMPL: [] };
  const res = await rmFetch(
    "CentralCandidato/v1/DadosPessoaisCandidatoResponsavel",
    { webapi: WEBAPI, method: "POST", body, cookie: rmCookie },
  );
  if (!res.ok) {
    return { ok: false, erro: null, pessoas: null, bruto: null };
  }

  const json = await res.json();
  if (temErroRm(json)) {
    return {
      ok: false,
      erro: mensagemErroRm(json),
      pessoas: null,
      bruto: json,
    };
  }
  const pessoas = arrayPorChave(json, ["SPSUSUARIO"]);
  return {
    ok: pessoas.length > 0,
    erro: null,
    pessoas,
    bruto: json,
  };
}

/**
 * Atualiza o tipo de relacionamento entre o candidato e um responsável
 * (POST CentralCandidato/v1/AtualizaResponsavelTipoRelac). Guard na rota BFF.
 */
export async function atualizarResponsavelTipoRelac(
  rmCookie: string,
  params: {
    numeroInscricao: number;
    codUsuarioPSTipoRelac: number;
    tipoRelacaoUsuario: number;
  },
): Promise<ResultadoSalvarDados> {
  const qs = new URLSearchParams({
    numeroInscricao: String(params.numeroInscricao),
    codUsuarioPSTipoRelac: String(params.codUsuarioPSTipoRelac),
    tipoRelacaoUsuario: String(params.tipoRelacaoUsuario),
  });
  const res = await rmFetch(
    `CentralCandidato/v1/AtualizaResponsavelTipoRelac?${qs.toString()}`,
    { webapi: WEBAPI, method: "POST", body: {}, cookie: rmCookie },
  );
  if (!res.ok) return { ok: false, erro: null, pessoas: null, bruto: null };

  const json = await res.json();
  if (temErroRm(json)) {
    return {
      ok: false,
      erro: mensagemErroRm(json),
      pessoas: null,
      bruto: json,
    };
  }
  return { ok: true, erro: null, pessoas: null, bruto: json };
}

/** Resultado da validação de débitos do responsável financeiro. */
export interface DebitosResponsavelFinanceiro {
  cpf: string | null;
  possuiDebitos: boolean;
  /** true quando os débitos IMPEDEM a matrícula. */
  bloqueia: boolean;
  mensagem: string | null;
  bruto: Record<string, unknown>;
}

/**
 * Valida débitos do responsável financeiro
 * (GET CentralCandidato/v1/DebitosResponsavelFinanceiro). Só relevante quando
 * `ParametrosMatricula.validarDebitosResponsavelFinanceiro` é verdadeiro.
 */
export async function obterDebitosResponsavelFinanceiro(
  rmCookie: string,
  params: {
    idAreaOfertada: number;
    cpf: string;
    nome?: string;
    idHabilitacaoFilial?: number;
  },
): Promise<DebitosResponsavelFinanceiro | null> {
  const qs = new URLSearchParams({
    idAreaOfertada: String(params.idAreaOfertada),
    cpf: params.cpf.replace(/\D/g, ""),
    nome: params.nome ?? "",
    idHabilitacaoFilial: String(params.idHabilitacaoFilial ?? 0),
  });
  const res = await rmFetch(
    `CentralCandidato/v1/DebitosResponsavelFinanceiro?${qs.toString()}`,
    { webapi: WEBAPI, cookie: rmCookie },
  );
  if (!res.ok) return null;

  const json = await res.json();
  if (temErroRm(json)) return null;
  const b = primeiroRegistro(json);
  if (!b) return null;

  return {
    cpf: str(b, "Cpf") ?? str(b, "CPF"),
    possuiDebitos: flagRm(b["PossuiDebitosFinanceiros"]),
    bloqueia: flagRm(b["Bloqueia"]),
    mensagem: str(b, "Mensagem"),
    bruto: b,
  };
}

// ---------------------------------------------------------------------------
// 11) Listas de apoio (lookups) para os formulários de dados pessoais
// ---------------------------------------------------------------------------

/** Item normalizado de uma lista de apoio (dropdown). */
export interface ItemLista {
  codigo: string;
  descricao: string;
}

/** Tipos de lista suportados (fiel a edups-utils.factory.js). */
export type TipoListaMatricula =
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

interface DefLista {
  /** Caminho do endpoint (pode conter `:idPais`/`:codEtd`). */
  path: string;
  /** Chave do array no envelope. */
  chave: string;
  /** Campos (código, descrição) de cada item. */
  campoCodigo: string;
  campoDescricao: string;
}

const DEFS_LISTA: Record<TipoListaMatricula, DefLista> = {
  paises: {
    path: "ListaPaises",
    chave: "GPais",
    campoCodigo: "IDPAIS",
    campoDescricao: "DESCRICAO",
  },
  estados: {
    path: "ListaEstados/:idPais",
    chave: "GEtd",
    campoCodigo: "CODETD",
    campoDescricao: "NOME",
  },
  municipios: {
    path: "ListaMunicipios/:codEtd",
    chave: "GMUNICIPIO",
    campoCodigo: "CODMUNICIPIO",
    campoDescricao: "NOMEMUNICIPIO",
  },
  estadoCivil: {
    path: "ListaEstadoCivil",
    chave: "PCODESTCIVIL",
    campoCodigo: "CODCLIENTE",
    campoDescricao: "DESCRICAO",
  },
  nacionalidade: {
    path: "ListaNacionalidade",
    chave: "PCODNACAO",
    campoCodigo: "CODCLIENTE",
    campoDescricao: "DESCRICAO",
  },
  corRaca: {
    path: "ListaCorRaca",
    chave: "PCORRACA",
    campoCodigo: "CODCLIENTE",
    campoDescricao: "DESCRICAO",
  },
  grauInstrucao: {
    path: "ListaGrauInstrucao",
    chave: "PCODINSTRUCAO",
    campoCodigo: "CODCLIENTE",
    campoDescricao: "DESCRICAO",
  },
  profissao: {
    path: "ListaProfissao",
    chave: "EProfiss",
    campoCodigo: "CODCLIENTE",
    campoDescricao: "DESCRICAO",
  },
  tipoRua: {
    path: "ListaTipoRua",
    chave: "DTipoRua",
    campoCodigo: "CODIGO",
    campoDescricao: "DESCRICAO",
  },
  tipoBairro: {
    path: "ListaTipoBairro",
    chave: "DTipoBairro",
    campoCodigo: "CODIGO",
    campoDescricao: "DESCRICAO",
  },
  tipoSanguineo: {
    path: "ListaTipoSanguineo",
    chave: "STIPOSANGUINEO",
    campoCodigo: "CODIGO",
    campoDescricao: "DESCRICAO",
  },
};

/**
 * Carrega uma lista de apoio para dropdowns dos formulários de matrícula.
 * `estados` exige `idPais`; `municipios` exige `codEtd` (a UF, ex.: "RJ").
 * Retorna itens normalizados `{ codigo, descricao }` ordenados por descrição.
 */
export async function obterListaMatricula(
  rmCookie: string,
  tipo: TipoListaMatricula,
  opts?: { idPais?: number | string; codEtd?: string },
): Promise<ItemLista[]> {
  const def = DEFS_LISTA[tipo];
  let path = def.path;
  if (path.includes(":idPais")) {
    if (opts?.idPais == null) return [];
    path = path.replace(":idPais", encodeURIComponent(String(opts.idPais)));
  }
  if (path.includes(":codEtd")) {
    if (!opts?.codEtd) return [];
    path = path.replace(":codEtd", encodeURIComponent(opts.codEtd));
  }

  const res = await rmFetch(path, { webapi: WEBAPI, cookie: rmCookie });
  if (!res.ok) return [];

  const json = await res.json();
  if (temErroRm(json)) return [];

  const itens = arrayPorChave(json, [def.chave])
    .map((r) => {
      const codigo = r[def.campoCodigo];
      const descricao = r[def.campoDescricao];
      return {
        codigo: codigo == null ? "" : String(codigo),
        descricao: descricao == null ? "" : String(descricao),
      };
    })
    .filter((i) => i.codigo !== "" && i.descricao !== "");

  itens.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  return itens;
}
