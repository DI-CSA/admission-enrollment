import "server-only";
import { rmFetch } from "@/lib/rm/client";
import { query } from "./db";
import { ANO_PROCESSO } from "@/lib/processos";

// ---------------------------------------------------------------------------
// Camada de INSCRIÇÃO (escrita/leitura autenticada) — WebAPI EduPS
// ---------------------------------------------------------------------------
//
// Endpoints CONFIRMADOS no código-fonte do portal TOTVS
// (FrameHTML/Web/App/Edu/PortalProcessoSeletivo/js/inscricoes/inscricoes.factory.js):
//
//   POST Inscricao/NovaInscricao          → cria a inscrição (model completo)
//   GET  Inscricao/v1/BuscaUsuario        → dados do usuário logado
//   GET  Inscricao/ExisteUsuario          → checagem de duplicidade (Bloqueia)
//   GET  Financeiro/InfoBoletoInscricao   → boleto da taxa (após inscrição)
//
// Todas exigem sessão autenticada (cookie do RM, guardado server-side). O webapi
// base é "TOTVSProcessoSeletivo". A escrita SEMPRE passa por aqui (a EduPS aplica
// as regras do PS); leitura de referência continua via SQL direto (queries.ts).

const WEBAPI = "TOTVSProcessoSeletivo";

// ---------------------------------------------------------------------------
// Modelo do RM (nomes fiéis ao DataServer da EduPS — validado E2E em homolog)
// ---------------------------------------------------------------------------
//
// As flags são varchar(1) "T"/"F" (NÃO boolean). O modelo abaixo reproduz
// EXATAMENTE o payload aceito pela NovaInscricao (PS210), descoberto via diag.

type SN = "T" | "F"; // Sim/Não em varchar(1)

export interface SpsInscricaoAreaOfertada {
  CODCOLIGADA: number;
  IDPS: number;
  DATAINSCRICAO: string; // ISO
  VALORINSCRICAO: number;
  VALORDESCONTO: number;
  IDFORMAINSCRICAO: number;
  IDCAMPUS: number;
  UTILIZANOTAENEM: SN;
  CODMUNICIPIO: string;
  CODETDMUNICIPIO: string;
  COTAFEDERAL: SN;
  COTAFEDERALENSINOPUBLICO: SN;
  COTAFEDERALRENDA: SN;
  COTAFEDERALCORACA: SN;
  COTAFEDERALPCD: SN;
  TREINEIRO: SN;
  DEFAUDITIVA: SN;
  DEFVISUAL: SN;
  DEFFISICA: SN;
  DEFMENTAL: SN;
  DEFINTELECTUAL: SN;
  DEFFALA: SN;
  BRPDH: SN;
  DEFMULTIPLA: SN;
  DEFOUTRAS: SN;
}

export interface SpsOpcaoInscrito {
  CODCOLIGADA: number;
  IDPS: number;
  IDAREAINTERESSE: number;
  NUMEROOPCAO: number;
  DATAINSCRICAO: string;
}

/**
 * Documento exigido enviado junto do NovaInscricao. Um item POR ARQUIVO — espelha
 * exatamente o payload do portal original (inscricoes.service.js): a WebAPI EduPS
 * grava os bytes em SPSARQUIVOSCANDIDATO (coluna ARQUIVO image) e marca a entrega
 * em SPSDOCUMENTOENTREGUE. `ARQUIVO[0].Arquivo` é o base64 puro (sem prefixo data:).
 */
export interface SpsDocumentoExigido {
  CODDOCUMENTO: number;
  DETALHE: string;
  NOMEARQUIVO: string;
  ARQUIVO: Array<{ Arquivo: string }>;
}

/** Campos complementares obrigatórios do PS210 (grupo DadosBasicos). */
export interface SpsInscAreaOfertaCompl {
  CODCOLIGADA: number;
  IDPS: number;
  CA: string; // colégio atual (texto livre)
  CURSOSERIE: string; // série atual do candidato (lookup GCONSIST)
  GRUPO: string; // grupo de candidato (lookup GRPCAND)
  IG: SN1; // irmão gêmeo inscrito?
  MF: SN1; // mãe falecida?
  MM: SN1; // mãe mora com o candidato?
  PF: SN1; // pai falecido?
  PM: SN1; // pai mora com o candidato?
  NECESSIDADEESPECIAL: SN1; // necessita atenção especial?
  // Irmão gemelar (IG="1"): nome e CPF do irmão. Por decisão de negócio o CPF
  // é gravado JUNTO do nome neste campo NOME(100) — o campo MATRICULA da tabela
  // é varchar(10) e não comporta um CPF (11 dígitos). Fica null quando IG="2".
  NOME?: string | null;
}

/** Sim/Não complementar: "1"=Sim, "2"=Não. */
type SN1 = "1" | "2";

export interface SpsUsuario {
  CODUSUARIOPS: number | null;
  /**
   * Identificador de cliente (UUID) gerado pelo portal para cada SPSUSUARIO.
   * O RM usa este valor para vincular candidato ↔ responsáveis quando um papel
   * reaproveita os dados de outro. O portal original gera um por registro via
   * `EdupsUtilsService.geraUUID()`; replicamos com `crypto.randomUUID()`.
   */
  CLIENTID?: string;
  NOME: string;
  SEXO: string | null;
  DTNASCIMENTO: string | null; // yyyy-MM-dd
  /**
   * Demais colunas DateTime que a EduPS espera em CADA SPSUSUARIO. A 1ª linha
   * (candidato) precisa tê-las presentes para o DataServer inferir o tipo de
   * cada coluna e conseguir converter as datas dos responsáveis; ausentes, a
   * NovaInscricao estoura 500 ("An error has occurred."). Preenchidas com uma
   * data mínima quando nulas — replica o `trataCamposParseJson` do portal.
   */
  DTEMISSAOIDENT?: string;
  DTVENCCARTTRAB?: string;
  DTEMISSAORIC?: string;
  DTEMISSAORNE?: string;
  DATANATURALIZACAO?: string;
  DTEMISSAOCNH?: string;
  DTCARTTRAB?: string;
  DTEXPCML?: string;
  DTVALPASSAPORTE?: string;
  DTEMISSPASSAPORTE?: string;
  DTVENCIDENT?: string;
  DATACHEGADA?: string;
  DTVENCHABILIT?: string;
  DTTITELEITOR?: string;
  DTAPROVEITOUDADOSPESSOA?: string;
  CPF: string | null;
  EMAIL: string | null;
  TELEFONE1: string | null;
  TELEFONE2?: string | null;
  NACIONALIDADE: string | null;
  RUA: string | null;
  NUMERO: string | null;
  COMPLEMENTO?: string | null;
  BAIRRO: string | null;
  CIDADE: string | null;
  ESTADO: string | null;
  CEP: string | null;
  IDPAIS: number | null;
  /**
   * Senha do portal do PS. O RM exige quando o processo está parametrizado para
   * usar senha de login (UsaSenhaLogin). No ensino básico a senha é gravada no
   * registro do RESPONSÁVEL pela inscrição (não no candidato).
   */
  SENHA?: string | null;
  REPETESENHA?: string | null;
  // Vínculos ("T"/"F")
  EHCANDIDATO: SN;
  EHRESPINSC: SN;
  EHRESPFIN: SN;
  EHRESPACAD: SN;
  EHPAI: SN;
  EHMAE: SN;
  /** Tipo de pessoa: C=candidato, RI=resp. inscrição, RF=resp. financeiro, P=pai, M=mãe. */
  CODESTRUTURATIPO: string;
  CODCOLIGADA: number;
  IDPS: number;
}

export interface ModeloNovaInscricao {
  SPSINSCRICAOAREAOFERTADA: SpsInscricaoAreaOfertada[];
  SPSOPCAOINSCRITO: SpsOpcaoInscrito[];
  SPSINSCAREAOFERTACOMPL: SpsInscAreaOfertaCompl[];
  SPSUSUARIO: SpsUsuario[];
  // Coleções que o portal original SEMPRE envia (mesmo vazias). O DataServer da
  // EduPS itera sobre elas; ausentes, pode estourar NullReference (500).
  SPSIDIOMAINSCRITO: unknown[];
  SPSINSCRICAOITINERARIO: unknown[];
  SPSATIVIDADEAGENDADAPS: unknown[];
  SPSINSCRICAOAREAOFERTADASUBDEF: unknown[];
  SPSDOCUMENTOSEXIGIDOS: SpsDocumentoExigido[];
  SPSOFERTAONLINE: unknown[];
  SPSCUSTOM: unknown[];
  SPSETAPA: unknown[];
}

// ---------------------------------------------------------------------------
// Entradas "amigáveis" do wizard (mapeadas para o modelo do RM server-side)
// ---------------------------------------------------------------------------

export interface ContextoInscricao {
  codColigada: number;
  idps: number;
  valorInscricao: number;
  nomeProcesso: string;
  /** Conta do portal do responsável logado (da sessão). */
  codUsuarioPS: number | null;
  /** Campus/forma de inscrição do PS (defaults: 1/1). */
  idCampus?: number;
  idFormaInscricao?: number;
  /** Município do candidato (default Rio de Janeiro "04557"/"RJ"). */
  codMunicipio?: string;
  codEstadoMunicipio?: string;
}

/** Endereço de uma pessoa (candidato ou responsável). */
export interface EnderecoPessoa {
  rua: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  /** Código do país no RM (1 = Brasil). */
  idPais: number;
}

export interface DadosCandidato {
  nome: string;
  sexo: "M" | "F";
  /** ISO yyyy-MM-dd. */
  dataNascimento: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  /** Código de nacionalidade no RM ("10" = brasileiro). */
  nacionalidade: string;
  endereco: EnderecoPessoa;
}

/** Campos complementares do PS (coletados no wizard). */
export interface DadosComplementares {
  /** Colégio atual (texto livre). */
  colegioAtual: string;
  /** Série atual do candidato (código GCONSIST 'CURSOSERIE'). */
  cursoSerie: string;
  /** Grupo de candidato (código GRPCAND). */
  grupo: string;
  irmaoGemeo: SN1;
  maeFalecida: SN1;
  maeMora: SN1;
  paiFalecido: SN1;
  paiMora: SN1;
  necessidadeEspecial: SN1;
  /** Nome do irmão gemelar (só quando irmaoGemeo="1"). */
  irmaoNome?: string | null;
  /** CPF do irmão gemelar (só quando irmaoGemeo="1"); gravado junto do nome. */
  irmaoCpf?: string | null;
}

/**
 * Responsável JÁ PRONTO para o modelo (decidido pelo servidor).
 * - Logado/existente: lido VERBATIM do RM (SPSUSUARIO). Qualquer divergência é
 *   tratada pelo DataServer como "alteração não permitida".
 * - Novo (anônimo): montado com os dados digitados.
 */
export interface ResponsavelParaModelo {
  codUsuarioPS: number | null;
  nome: string;
  sexo: string | null;
  dtNascimento: string | null; // yyyy-MM-dd
  cpf: string | null;
  email: string | null;
  telefone1: string | null;
  telefone2?: string | null;
  nacionalidade: string | null;
  rua: string | null;
  numero: string | null;
  complemento?: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  idPais: number | null;
  /**
   * Relação do responsável pela inscrição com o candidato. A NovaInscricao só
   * representa este vínculo por dois flags booleanos no SPSUSUARIO: "P" = pai
   * (EHPAI="T") e "M" = mãe (EHMAE="T"). Não há outro grau de parentesco no
   * modelo da inscrição. Só se aplica ao responsável de inscrição — no
   * financeiro é sempre `null`.
   */
  relacaoComCandidato: "P" | "M" | null;
}

export interface OpcaoAreaInscricao {
  areaInteresseId: number;
  /** Ordem da opção (1ª opção = 1). */
  numeroOpcao?: number;
}

/**
 * Documento a enviar na inscrição (entrada "amigável" do wizard). O conteúdo é o
 * base64 PURO do arquivo (sem o prefixo `data:...;base64,`). Vira um item da
 * coleção SPSDOCUMENTOSEXIGIDOS no NovaInscricao.
 */
export interface DocumentoInscricao {
  codDocumento: number;
  descricao: string;
  nomeArquivo: string;
  arquivoBase64: string;
}

// Data mínima que a EduPS interpreta como "sem valor" para colunas DateTime.
// Serve para o DataServer tipar as colunas (ver comentário em SpsUsuario).
const DATA_MINIMA_RM = "0001-01-01T00:00:00";

/**
 * Retorna DTNASCIMENTO (real ou mínima) + as demais colunas DateTime do
 * SPSUSUARIO preenchidas com a data mínima. Replica o `trataCamposParseJson`
 * do portal original, que garante que a 1ª linha (candidato) tenha todas as
 * colunas de data para o DataServer inferir os tipos.
 */
function camposDataRm(
  dtNascimento: string | null,
): Required<
  Pick<
    SpsUsuario,
    | "DTNASCIMENTO"
    | "DTEMISSAOIDENT"
    | "DTVENCCARTTRAB"
    | "DTEMISSAORIC"
    | "DTEMISSAORNE"
    | "DATANATURALIZACAO"
    | "DTEMISSAOCNH"
    | "DTCARTTRAB"
    | "DTEXPCML"
    | "DTVALPASSAPORTE"
    | "DTEMISSPASSAPORTE"
    | "DTVENCIDENT"
    | "DATACHEGADA"
    | "DTVENCHABILIT"
    | "DTTITELEITOR"
    | "DTAPROVEITOUDADOSPESSOA"
  >
> {
  return {
    DTNASCIMENTO:
      dtNascimento && dtNascimento.trim() ? dtNascimento : DATA_MINIMA_RM,
    DTEMISSAOIDENT: DATA_MINIMA_RM,
    DTVENCCARTTRAB: DATA_MINIMA_RM,
    DTEMISSAORIC: DATA_MINIMA_RM,
    DTEMISSAORNE: DATA_MINIMA_RM,
    DATANATURALIZACAO: DATA_MINIMA_RM,
    DTEMISSAOCNH: DATA_MINIMA_RM,
    DTCARTTRAB: DATA_MINIMA_RM,
    DTEXPCML: DATA_MINIMA_RM,
    DTVALPASSAPORTE: DATA_MINIMA_RM,
    DTEMISSPASSAPORTE: DATA_MINIMA_RM,
    DTVENCIDENT: DATA_MINIMA_RM,
    DATACHEGADA: DATA_MINIMA_RM,
    DTVENCHABILIT: DATA_MINIMA_RM,
    DTTITELEITOR: DATA_MINIMA_RM,
    DTAPROVEITOUDADOSPESSOA: DATA_MINIMA_RM,
  };
}

/**
 * Monta o modelo do RM a partir dos dados do wizard. Identidade vem do servidor.
 *
 * `respFinanceiro`: quando `null`, o próprio responsável de inscrição é o
 * financeiro (recebe `EHRESPFIN="T"`). Quando informado, o responsável de
 * inscrição deixa de ser financeiro (`EHRESPFIN="F"`) e é acrescentado um 3º
 * registro `SPSUSUARIO` (`CODESTRUTURATIPO="RF"`) — a cobrança da taxa é emitida
 * em nome dele. O PS exige RF quando `USADADOSRESPFIN="T"` (parâmetro do RM).
 */
export function montarModeloNovaInscricao(
  ctx: ContextoInscricao,
  candidato: DadosCandidato,
  complementares: DadosComplementares,
  opcao: OpcaoAreaInscricao,
  responsavel: ResponsavelParaModelo,
  respFinanceiro: ResponsavelParaModelo | null = null,
  /**
   * Senha do portal (fluxo NOVO/anônimo). Quando informada, o RM grava no
   * registro do responsável pela inscrição — exigência dos PS com senha de login.
   */
  senhaResponsavel: string | null = null,
  /**
   * Documentos exigidos anexados (PDFs em base64). Cada arquivo vira um item da
   * coleção SPSDOCUMENTOSEXIGIDOS; a EduPS grava os bytes em SPSARQUIVOSCANDIDATO.
   */
  documentos: DocumentoInscricao[] = [],
): ModeloNovaInscricao {
  const agoraIso = new Date().toISOString();

  const inscricaoArea: SpsInscricaoAreaOfertada = {
    CODCOLIGADA: ctx.codColigada,
    IDPS: ctx.idps,
    DATAINSCRICAO: agoraIso,
    VALORINSCRICAO: ctx.valorInscricao,
    VALORDESCONTO: 0,
    IDFORMAINSCRICAO: ctx.idFormaInscricao ?? 1,
    IDCAMPUS: ctx.idCampus ?? 1,
    UTILIZANOTAENEM: "F",
    CODMUNICIPIO: ctx.codMunicipio ?? "04557",
    CODETDMUNICIPIO: ctx.codEstadoMunicipio ?? "RJ",
    COTAFEDERAL: "F",
    COTAFEDERALENSINOPUBLICO: "F",
    COTAFEDERALRENDA: "F",
    COTAFEDERALCORACA: "F",
    COTAFEDERALPCD: "F",
    TREINEIRO: "F",
    DEFAUDITIVA: "F",
    DEFVISUAL: "F",
    DEFFISICA: "F",
    DEFMENTAL: "F",
    DEFINTELECTUAL: "F",
    DEFFALA: "F",
    BRPDH: "F",
    DEFMULTIPLA: "F",
    DEFOUTRAS: "F",
  };

  const opcaoInscrito: SpsOpcaoInscrito = {
    CODCOLIGADA: ctx.codColigada,
    IDPS: ctx.idps,
    IDAREAINTERESSE: opcao.areaInteresseId,
    NUMEROOPCAO: opcao.numeroOpcao ?? 1,
    DATAINSCRICAO: agoraIso,
  };

  // Irmão gemelar (IG="1"): grava "<nome> (CPF <cpf>)" no campo NOME(100).
  // O sufixo do CPF é reservado e o nome é truncado se necessário para caber.
  const nomeIrmaoGemelar = (() => {
    if (complementares.irmaoGemeo !== "1") return null;
    const nome = (complementares.irmaoNome ?? "").trim();
    if (!nome) return null;
    const cpf = (complementares.irmaoCpf ?? "").trim();
    const sufixo = cpf ? ` (CPF ${cpf})` : "";
    const limiteNome = 100 - sufixo.length;
    return `${nome.slice(0, Math.max(0, limiteNome))}${sufixo}`;
  })();

  const complemento: SpsInscAreaOfertaCompl = {
    CODCOLIGADA: ctx.codColigada,
    IDPS: ctx.idps,
    CA: complementares.colegioAtual,
    CURSOSERIE: complementares.cursoSerie,
    GRUPO: complementares.grupo,
    IG: complementares.irmaoGemeo,
    MF: complementares.maeFalecida,
    MM: complementares.maeMora,
    PF: complementares.paiFalecido,
    PM: complementares.paiMora,
    NECESSIDADEESPECIAL: complementares.necessidadeEspecial,
    NOME: nomeIrmaoGemelar,
  };

  const usuarioCandidato: SpsUsuario = {
    CODUSUARIOPS: null,
    CLIENTID: crypto.randomUUID(),
    NOME: candidato.nome,
    SEXO: candidato.sexo,
    ...camposDataRm(candidato.dataNascimento),
    CPF: candidato.cpf,
    EMAIL: candidato.email,
    TELEFONE1: candidato.telefone,
    NACIONALIDADE: candidato.nacionalidade,
    RUA: candidato.endereco.rua,
    NUMERO: candidato.endereco.numero,
    COMPLEMENTO: candidato.endereco.complemento ?? null,
    BAIRRO: candidato.endereco.bairro,
    CIDADE: candidato.endereco.cidade,
    ESTADO: candidato.endereco.estado,
    CEP: candidato.endereco.cep,
    IDPAIS: candidato.endereco.idPais,
    EHCANDIDATO: "T",
    EHRESPINSC: "F",
    EHRESPFIN: "F",
    EHRESPACAD: "F",
    EHPAI: "F",
    EHMAE: "F",
    CODESTRUTURATIPO: "C",
    CODCOLIGADA: ctx.codColigada,
    IDPS: ctx.idps,
  };

  // Responsável: enviado VERBATIM (logado) ou com os dados digitados (novo).
  const usuarioResponsavel: SpsUsuario = {
    CODUSUARIOPS: responsavel.codUsuarioPS,
    CLIENTID: crypto.randomUUID(),
    NOME: responsavel.nome,
    SEXO: responsavel.sexo,
    ...camposDataRm(responsavel.dtNascimento),
    CPF: responsavel.cpf,
    EMAIL: responsavel.email,
    TELEFONE1: responsavel.telefone1,
    TELEFONE2: responsavel.telefone2 ?? null,
    NACIONALIDADE: responsavel.nacionalidade,
    RUA: responsavel.rua,
    NUMERO: responsavel.numero,
    COMPLEMENTO: responsavel.complemento ?? null,
    BAIRRO: responsavel.bairro,
    CIDADE: responsavel.cidade,
    ESTADO: responsavel.estado,
    CEP: responsavel.cep,
    IDPAIS: responsavel.idPais,
    // Senha do PS: exigida pelo RM quando o processo usa senha de login. No
    // ensino básico ela pertence ao responsável pela inscrição, não ao candidato.
    ...(senhaResponsavel
      ? { SENHA: senhaResponsavel, REPETESENHA: senhaResponsavel }
      : {}),
    EHCANDIDATO: "F",
    EHRESPINSC: "T",
    // Só é o responsável FINANCEIRO quando não foi indicada outra pessoa.
    EHRESPFIN: respFinanceiro ? "F" : "T",
    EHRESPACAD: "T",
    // Relação do responsável com o candidato (pai/mãe). Replica o comportamento
    // do portal nativo, que grava EHPAI/EHMAE no responsável de inscrição.
    EHPAI: responsavel.relacaoComCandidato === "P" ? "T" : "F",
    EHMAE: responsavel.relacaoComCandidato === "M" ? "T" : "F",
    CODESTRUTURATIPO: "RI",
    CODCOLIGADA: ctx.codColigada,
    IDPS: ctx.idps,
  };

  // Responsável financeiro distinto (opcional): 3º registro. A cobrança da taxa
  // de inscrição é emitida em nome dele.
  const usuarioRespFinanceiro: SpsUsuario | null = respFinanceiro
    ? {
        CODUSUARIOPS: respFinanceiro.codUsuarioPS,
        CLIENTID: crypto.randomUUID(),
        NOME: respFinanceiro.nome,
        SEXO: respFinanceiro.sexo,
        ...camposDataRm(respFinanceiro.dtNascimento),
        CPF: respFinanceiro.cpf,
        EMAIL: respFinanceiro.email,
        TELEFONE1: respFinanceiro.telefone1,
        TELEFONE2: respFinanceiro.telefone2 ?? null,
        NACIONALIDADE: respFinanceiro.nacionalidade,
        RUA: respFinanceiro.rua,
        NUMERO: respFinanceiro.numero,
        COMPLEMENTO: respFinanceiro.complemento ?? null,
        BAIRRO: respFinanceiro.bairro,
        CIDADE: respFinanceiro.cidade,
        ESTADO: respFinanceiro.estado,
        CEP: respFinanceiro.cep,
        IDPAIS: respFinanceiro.idPais,
        EHCANDIDATO: "F",
        EHRESPINSC: "F",
        EHRESPFIN: "T",
        EHRESPACAD: "F",
        EHPAI: "F",
        EHMAE: "F",
        CODESTRUTURATIPO: "RF",
        CODCOLIGADA: ctx.codColigada,
        IDPS: ctx.idps,
      }
    : null;

  // Documentos exigidos: um item POR ARQUIVO, no mesmo formato do portal original
  // (CODDOCUMENTO/DETALHE/NOMEARQUIVO + ARQUIVO:[{Arquivo:base64}]). A EduPS grava
  // os bytes em SPSARQUIVOSCANDIDATO e marca a entrega em SPSDOCUMENTOENTREGUE.
  const documentosExigidos: SpsDocumentoExigido[] = documentos
    .filter((d) => d.arquivoBase64 && d.nomeArquivo)
    .map((d) => ({
      CODDOCUMENTO: d.codDocumento,
      DETALHE: d.descricao,
      NOMEARQUIVO: d.nomeArquivo,
      ARQUIVO: [{ Arquivo: d.arquivoBase64 }],
    }));

  return {
    SPSINSCRICAOAREAOFERTADA: [inscricaoArea],
    SPSOPCAOINSCRITO: [opcaoInscrito],
    SPSINSCAREAOFERTACOMPL: [complemento],
    SPSUSUARIO: usuarioRespFinanceiro
      ? [usuarioCandidato, usuarioResponsavel, usuarioRespFinanceiro]
      : [usuarioCandidato, usuarioResponsavel],
    // Coleções vazias exigidas pelo DataServer (ver ModeloNovaInscricao).
    SPSIDIOMAINSCRITO: [],
    SPSINSCRICAOITINERARIO: [],
    SPSATIVIDADEAGENDADAPS: [],
    SPSINSCRICAOAREAOFERTADASUBDEF: [],
    SPSDOCUMENTOSEXIGIDOS: documentosExigidos,
    SPSOFERTAONLINE: [],
    SPSCUSTOM: [],
    SPSETAPA: [],
  };
}

// ---------------------------------------------------------------------------
// Chamadas à WebAPI EduPS
// ---------------------------------------------------------------------------

export interface ResultadoNovaInscricao {
  ok: boolean;
  numeroInscricao: number | null;
  mostrarBoleto: boolean;
  ra: string | null;
  bruto: unknown;
}

interface TbMatricRow {
  IDLAN: number | null;
  PGBOLETO: string | null;
  RA: string | null;
  NUMEROINSCRICAO?: number | null;
}

interface InscricaoAreaRetorno {
  NUMEROINSCRICAO?: number | null;
  IDLAN?: number | null;
  RA?: string | null;
}

/** Conteúdo útil da NovaInscricao (após desembrulhar o envelope `data`). */
interface RetornoData {
  _TBMATRIC_?: TbMatricRow[];
  SPSINSCRICAOAREAOFERTADA?: InscricaoAreaRetorno[];
  NUMEROINSCRICAO?: number | null;
  // Erros de validação da EduPS vêm no corpo mesmo com HTTP 200.
  exception?: unknown;
  Exception?: unknown;
  message?: string;
  Message?: string;
  erro?: string;
  Erro?: string;
}

/** Envelope padrão da WebAPI RM: { data, messages, length, HttpStatusCode }. */
interface EnvelopeRM extends RetornoData {
  data?: RetornoData;
}

/** Extrai uma mensagem de erro do corpo (quando a EduPS retorna 200 com exceção). */
function mensagemDeErro(data: RetornoData | undefined): string | null {
  if (!data) return null;
  const cand =
    data.exception ??
    data.Exception ??
    data.message ??
    data.Message ??
    data.erro ??
    data.Erro;
  if (cand == null) return null;
  if (typeof cand === "string") return cand.trim() || null;
  if (typeof cand === "object") {
    const o = cand as Record<string, unknown>;
    const m = o.Message ?? o.message ?? o.ExceptionMessage;
    if (typeof m === "string") return m.trim() || null;
    return JSON.stringify(cand);
  }
  return String(cand);
}

/** Cria a inscrição no RM (POST Inscricao/NovaInscricao). Requer cookie de sessão. */
export async function criarInscricao(
  rmCookie: string,
  model: ModeloNovaInscricao,
): Promise<ResultadoNovaInscricao> {
  const res = await rmFetch("Inscricao/NovaInscricao", {
    webapi: WEBAPI,
    method: "POST",
    body: model,
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
    return {
      ok: false,
      numeroInscricao: null,
      mostrarBoleto: false,
      ra: null,
      bruto: detalhe,
    };
  }

  // A EduPS retorna SEMPRE HTTP 200; o conteúdo vem embrulhado em `data` e os
  // erros de validação aparecem como `data.exception`. Sucesso = inscrição criada
  // (NUMEROINSCRICAO presente em SPSINSCRICAOAREAOFERTADA). Trate o resto como FALHA.
  const textoOk = await res.text();
  const envelope = JSON.parse(textoOk) as EnvelopeRM;
  const data: RetornoData = envelope?.data ?? envelope;

  const areaRow = Array.isArray(data?.SPSINSCRICAOAREAOFERTADA)
    ? data.SPSINSCRICAOAREAOFERTADA[0]
    : undefined;
  const matric = data?._TBMATRIC_?.[0];
  const numeroInscricao =
    areaRow?.NUMEROINSCRICAO ??
    matric?.NUMEROINSCRICAO ??
    data?.NUMEROINSCRICAO ??
    null;

  if (numeroInscricao == null) {
    const erro = mensagemDeErro(data) ?? mensagemDeErro(envelope);
    return {
      ok: false,
      numeroInscricao: null,
      mostrarBoleto: false,
      ra: null,
      bruto: erro ?? envelope,
    };
  }

  const idlan = areaRow?.IDLAN ?? matric?.IDLAN ?? null;
  const mostrarBoleto =
    (idlan != null && idlan > 0) || matric?.PGBOLETO === "S";

  return {
    ok: true,
    numeroInscricao,
    mostrarBoleto,
    ra: areaRow?.RA ?? matric?.RA ?? null,
    bruto: data,
  };
}

export interface ChecagemDuplicidade {
  existe: boolean;
  bloqueia: boolean;
  mensagem: string | null;
}

/** Verifica se o candidato já existe/está inscrito (GET Inscricao/ExisteUsuario). */
export async function existeUsuario(
  rmCookie: string,
  ctx: { codColigada: number; idps: number },
  candidato: {
    nome: string;
    dataNascimento: string;
    cpf: string | null;
    email: string | null;
  },
): Promise<ChecagemDuplicidade> {
  const qs = new URLSearchParams();
  qs.set("codColigada", String(ctx.codColigada));
  qs.set("idps", String(ctx.idps));
  qs.set("nome", candidato.nome);
  qs.set("dataNascimento", candidato.dataNascimento);
  if (candidato.cpf) qs.set("cpf", candidato.cpf);
  if (candidato.email) qs.set("email", candidato.email);

  const res = await rmFetch(`Inscricao/ExisteUsuario?${qs.toString()}`, {
    webapi: WEBAPI,
    cookie: rmCookie,
  });
  if (!res.ok) {
    return { existe: false, bloqueia: false, mensagem: null };
  }
  const data = (await res.json()) as {
    Existe?: boolean;
    Bloqueia?: boolean;
    Mensagem?: string;
  };
  return {
    existe: !!data.Existe,
    bloqueia: !!data.Bloqueia,
    mensagem: data.Mensagem ?? null,
  };
}

// ---------------------------------------------------------------------------
// Listagem dos candidatos/inscrições do responsável logado
// ---------------------------------------------------------------------------
//
// Lista de candidatos (dependentes) de um responsável, com o nº de inscrição.
//
// Consulta SQL de referência (read-only), e NÃO a WebAPI CandidatosDependentes: a API
// é escopada a UM único processo seletivo (o do cookie de login), enquanto um mesmo
// responsável costuma ter candidatos espalhados por VÁRIOS PS (um por ano/série). O SQL
// cobre TODOS os PS numa única consulta, sem depender de nenhum ID de PS fixo: parte do
// vínculo responsável↔candidato (SPSUSUARIOTIPORELAC) e junta as inscrições de qualquer
// PS (SPSINSCRICAOAREAOFERTADA). A CTE `contas` reúne todas as contas SPSUSUARIO da
// mesma pessoa (por CODUSUARIOPS, CODPESSOA ou CPF), pois o vínculo pode estar em uma
// conta diferente da usada no login.

export interface DependenteCandidato {
  idUsuario: number | null;
  nome: string;
  dependente: boolean;
  numeroInscricao: number | null;
  /**
   * Processo seletivo (idps) da inscrição. Necessário porque o NUMEROINSCRICAO é
   * sequencial POR PS e a emissão de comprovante/boleto é escopada ao PS — o
   * front precisa dizer QUAL idps para o BFF escolher o cookie de sessão certo.
   */
  idps: number | null;
  /**
   * Nome do processo seletivo (SPSPROCESSOSELETIVO.NOME) da inscrição, para
   * exibir a série/PS de cada candidato no painel. Já vem do JOIN da query.
   */
  nomeProcesso: string | null;
  /**
   * Código do programa de avaliações (F2..F9, M1/M2) derivado da habilitação da
   * série inscrita. `null` quando não há programa (F1 / 1º ano) ou não resolvido.
   */
  codPrograma: string | null;
  /** Código da situação da opção (SPSOPCAOINSCRITO.STATUS). */
  situacaoCodigo: number | null;
  /** Rótulo da situação (SPSSTATUSOPCAO.DESCRICAO, resolvido pela filial do PS). */
  situacaoDescricao: string | null;
  /**
   * Coligada da inscrição — necessária para as chamadas de documentos da Central
   * do Candidato (id = CODCOLIGADA|IDPS|IDAREAINTERESSE|NUMEROINSCRICAO).
   */
  codColigada: number | null;
  /** Área de interesse da opção (SPSOPCAOINSCRITO.IDAREAINTERESSE), idem docs. */
  idAreaInteresse: number | null;
  /**
   * Situação de pagamento da taxa de inscrição (título FLAN da inscrição, via
   * SPSINSCRICAOAREAOFERTADA.IDLAN). `null` quando não há título vinculado.
   */
  pagamento: SituacaoPagamento | null;
  /**
   * Pontos de atenção do candidato para destaque na listagem (ex.: sininho).
   * Cada item é um rótulo pronto para exibição. Hoje detecta "mensagem da
   * secretaria sobre documento" (SPSDOCUMENTOENTREGUE.MOTIVO). Extensível.
   */
  atencoes: string[];
}

/**
 * Situação financeira da taxa de inscrição. Lida por SQL do título FLAN (mesmo
 * padrão de leitura da situação/documentos), pois a WebAPI EduPS não expõe a
 * baixa (data/valor do pagamento) — só o InfoBoletoInscricao.STATUS.
 */
export interface SituacaoPagamento {
  /** STATUSLAN do FLAN: 0=em aberto, 1=pago/baixado, 2=cancelado. */
  statusLan: number | null;
  /** true quando o título está baixado (STATUSLAN=1). */
  pago: boolean;
  /** Valor original do título (taxa). */
  valorOriginal: number | null;
  /** Valor efetivamente baixado (pago), quando houver. */
  valorPago: number | null;
  /** Data do pagamento/baixa (ISO), quando pago. */
  dataPagamento: string | null;
  /** Data de vencimento do título (ISO). */
  dataVencimento: string | null;
}

interface DependenteRow {
  CODUSUARIOPS: number;
  NOME: string | null;
  NUMEROINSCRICAO: number | null;
  IDPS: number | null;
  PSNOME: string | null;
  CODHABILITACAO: string | null;
  STATUS: number | null;
  SITUACAODESC: string | null;
  CODCOLIGADA: number | null;
  IDAREAINTERESSE: number | null;
  STATUSLAN: number | null;
  DATABAIXA: Date | string | null;
  VALORBAIXADO: number | null;
  VALORORIGINAL: number | null;
  DATAVENCIMENTO: Date | string | null;
  /** >0 quando há observação/mensagem da secretaria em algum documento. */
  TEMMOTIVODOC: number | null;
}

/**
 * Deriva o código do programa de avaliações a partir do CODHABILITACAO da série
 * (EFI2..EFII9 → F2..F9; EM1/EM2 → M1/M2). O F1 (EFI1) NÃO tem programa (só edital
 * público) e retorna null. Espelha `codigoProgramaAvaliacoes` do WizardInscricao.
 */
function codigoProgramaAvaliacoes(
  codHabilitacao: string | null | undefined,
): string | null {
  if (!codHabilitacao) return null;
  const c = codHabilitacao.toUpperCase().trim();
  const ef = c.match(/^EFI+(\d+)$/); // EFI1..EFI5, EFII6..EFII9
  const em = c.match(/^EM(\d+)$/); // EM1, EM2
  const cod = ef ? `F${ef[1]}` : em ? `M${em[1]}` : null;
  if (!cod) return null;
  return cod === "F1" ? null : cod; // F1 não tem programa
}

/**
 * Lista os candidatos (dependentes) do responsável logado, com o nº de inscrição,
 * restrito ao CICLO DE ADMISSÃO ATUAL. Não usa lista de IDs de PS: o ano do ciclo
 * (ex.: "2027") aparece no NOME do PS, então filtramos por ele — configurável por
 * `PS_ANO_ATUAL` (default = ANO_PROCESSO). Assim, candidatos de processos de anos
 * anteriores não poluem o painel. Recebe o CODUSUARIOPS do responsável (da sessão).
 */
export async function listarDependentesDoResponsavel(
  codUsuarioPS: number,
): Promise<DependenteCandidato[]> {
  // Ano do ciclo atual: no RM o ano só existe no NOME do PS (não há coluna de
  // período letivo). Override por env sem depender de IDs fixos.
  const anoAtual = process.env.PS_ANO_ATUAL?.trim() || String(ANO_PROCESSO);
  const rows = await query<DependenteRow>(
    `
WITH resp AS (
  SELECT s.CODPESSOA,
         REPLACE(REPLACE(REPLACE(ISNULL(s.CPF, ''), '.', ''), '-', ''), ' ', '') AS CPFNUM
  FROM SPSUSUARIO s
  WHERE s.CODUSUARIOPS = @resp
),
contas AS (
  SELECT su.CODUSUARIOPS
  FROM SPSUSUARIO su
  CROSS JOIN resp
  WHERE su.CODUSUARIOPS = @resp
     OR (resp.CODPESSOA IS NOT NULL AND su.CODPESSOA = resp.CODPESSOA)
     OR (resp.CPFNUM <> '' AND REPLACE(REPLACE(REPLACE(ISNULL(su.CPF, ''), '.', ''), '-', ''), ' ', '') = resp.CPFNUM)
)
SELECT u.CODUSUARIOPS, u.NOME, i.NUMEROINSCRICAO, i.IDPS, ps.NOME AS PSNOME,
       MAX(hf.CODHABILITACAO) AS CODHABILITACAO,
       MAX(i.CODCOLIGADA) AS CODCOLIGADA,
       MAX(o.IDAREAINTERESSE) AS IDAREAINTERESSE,
       MAX(o.STATUS) AS STATUS,
       MAX(st.DESCRICAO) AS SITUACAODESC,
       MAX(fl.STATUSLAN) AS STATUSLAN,
       MAX(fl.DATABAIXA) AS DATABAIXA,
       MAX(fl.VALORBAIXADO) AS VALORBAIXADO,
       MAX(fl.VALORORIGINAL) AS VALORORIGINAL,
       MAX(fl.DATAVENCIMENTO) AS DATAVENCIMENTO,
       MAX(CASE WHEN de.MOTIVO IS NOT NULL AND LTRIM(RTRIM(de.MOTIVO)) <> ''
                THEN 1 ELSE 0 END) AS TEMMOTIVODOC
  FROM SPSUSUARIOTIPORELAC r
  JOIN contas c ON c.CODUSUARIOPS = r.CODUSUARIOTIPORELAC
  JOIN SPSUSUARIO u ON u.CODUSUARIOPS = r.CODUSUARIOPS
  JOIN SPSINSCRICAOAREAOFERTADA i ON i.CODUSUARIOPS = r.CODUSUARIOPS
  JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA = i.CODCOLIGADA AND ps.IDPS = i.IDPS
  LEFT JOIN SPSOPCAOINSCRITO o ON o.NUMEROINSCRICAO = i.NUMEROINSCRICAO
       AND o.IDPS = i.IDPS AND o.CODCOLIGADA = i.CODCOLIGADA
  LEFT JOIN SPSSTATUSOPCAO st ON st.CODIGO = o.STATUS
       AND st.CODCOLIGADA = o.CODCOLIGADA AND st.CODFILIAL = ps.CODFILIAL
  LEFT JOIN SPSAREAINTERESSE ai ON ai.IDAREAINTERESSE = o.IDAREAINTERESSE
  LEFT JOIN SHABILITACAOFILIAL hf ON hf.IDHABILITACAOFILIAL = ai.IDHABILITACAOFILIAL
       AND hf.CODCOLIGADA = ai.CODCOLIGADAHABFILIAL
  LEFT JOIN FLAN fl ON fl.CODCOLIGADA = i.CODCOLIGADALAN AND fl.IDLAN = i.IDLAN
  LEFT JOIN SPSDOCUMENTOENTREGUE de ON de.CODCOLIGADA = i.CODCOLIGADA
       AND de.IDPS = i.IDPS AND de.NUMEROINSCRICAO = i.NUMEROINSCRICAO
 WHERE r.CODUSUARIOPS <> r.CODUSUARIOTIPORELAC
   AND ps.NOME LIKE @ano
 GROUP BY u.CODUSUARIOPS, u.NOME, i.NUMEROINSCRICAO, i.IDPS, ps.NOME
 ORDER BY i.NUMEROINSCRICAO`,
    { resp: codUsuarioPS, ano: `%${anoAtual}%` },
  );

  return rows.map((r) => ({
    idUsuario: r.CODUSUARIOPS,
    nome: (r.NOME ?? "").trim(),
    dependente: true,
    numeroInscricao: r.NUMEROINSCRICAO ?? null,
    idps: r.IDPS ?? null,
    nomeProcesso: r.PSNOME?.trim() ?? null,
    codPrograma: codigoProgramaAvaliacoes(r.CODHABILITACAO),
    situacaoCodigo: r.STATUS ?? null,
    situacaoDescricao: r.SITUACAODESC?.trim() ?? null,
    codColigada: r.CODCOLIGADA ?? null,
    idAreaInteresse: r.IDAREAINTERESSE ?? null,
    pagamento: montarSituacaoPagamento(r),
    atencoes: montarAtencoes(r),
  }));
}

/**
 * Deriva os "pontos de atenção" do candidato para destaque na listagem. Hoje:
 * mensagem/observação da secretaria em algum documento (SPSDOCUMENTOENTREGUE.MOTIVO).
 * Nova detecção futura entra aqui (ex.: documento obrigatório pendente).
 */
function montarAtencoes(r: DependenteRow): string[] {
  const lista: string[] = [];
  if ((r.TEMMOTIVODOC ?? 0) > 0)
    lista.push("Mensagem da secretaria sobre documento");
  return lista;
}

/** Converte um valor de data (Date do mssql ou string) em ISO, ou null. */
function paraIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Monta a situação de pagamento a partir dos campos do FLAN na listagem. Retorna
 * null quando não há título vinculado (sem VALORORIGINAL e sem STATUSLAN).
 */
function montarSituacaoPagamento(r: DependenteRow): SituacaoPagamento | null {
  const temTitulo =
    r.STATUSLAN != null || r.VALORORIGINAL != null || r.DATAVENCIMENTO != null;
  if (!temTitulo) return null;
  const statusLan = r.STATUSLAN ?? null;
  return {
    statusLan,
    pago: statusLan === 1,
    valorOriginal: r.VALORORIGINAL ?? null,
    valorPago: r.VALORBAIXADO ?? null,
    dataPagamento: statusLan === 1 ? paraIso(r.DATABAIXA) : null,
    dataVencimento: paraIso(r.DATAVENCIMENTO),
  };
}

// Informações do boleto da taxa de inscrição, conforme retornado por
// Financeiro/InfoBoletoInscricao (mapeado do controller real do portal TOTVS:
// financeiro-pagboleto.controller.js → imprimeBoleto). Campos:
//   IDBOLETO              → id usado para baixar o PDF (2aviaBoletoCandidato)
//   TIPOBOLETO            → "HTML" (boleto fixo, abre URLBOLETOFIXO) ou PDF (2ª via)
//   BOLETOREGISTRADO      → "T"/"F": cobrança registrada no banco
//   SHOWBOLETONAOREGPORTAL→ "T"/"F": mostra boleto não registrado no portal
//   URLBOLETOFIXO         → URL do boleto fixo (quando TIPOBOLETO === "HTML")
//   URLREGONLINE/PERMITEREGONLINE → registro online (redireciona ao banco)
export interface BoletoInscricao {
  numeroInscricao: number;
  idBoleto: number | null;
  tipoBoleto: string | null;
  boletoRegistrado: boolean;
  mostraBoletoNaoRegistrado: boolean;
  permiteRegOnline: boolean;
  urlBoletoFixo: string | null;
  urlRegOnline: string | null;
  /** true quando o PDF pode ser baixado via 2aviaBoletoCandidato(idBoleto). */
  temPdf: boolean;
  bruto: unknown;
}

/** Interpreta flags "T"/"F" (ou boolean) do RM como booleano. */
function flagRm(v: unknown): boolean {
  return v === true || v === "T" || v === "t" || v === "1" || v === 1;
}

/** Desembrulha o envelope da EduPS (`{ data: ... }`) e retorna o 1º registro. */
function primeiroRegistro(
  payload: unknown,
): Record<string, unknown> | undefined {
  const env = payload as { data?: unknown } | undefined;
  const corpo =
    env && typeof env === "object" && "data" in env ? env.data : env;
  if (Array.isArray(corpo)) return corpo[0] as Record<string, unknown>;
  return (corpo ?? undefined) as Record<string, unknown> | undefined;
}

/**
 * Detecta erro da EduPS no envelope. Em erro, a WebAPI devolve HTTP 200 com
 * `data` sendo um objeto contendo uma chave do tipo "RMException:Message"
 * (ex.: "A inscrição N não pertence ao usuário logado.").
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

/**
 * Recupera o IDLAN (lançamento financeiro da taxa) da inscrição por SQL, sem
 * depender de cookie de sessão — funciona no fluxo logado E no cadastro novo
 * (anônimo), logo após a inscrição ser criada. O IDLAN é a chave estável para
 * reconciliar o pagamento no FLAN mais tarde (ex.: sincronizar o CRM quando a
 * taxa for baixada). Retorna null quando ainda não há vínculo financeiro.
 */
export async function obterIdLanInscricao(params: {
  codColigada: number;
  idps: number;
  numeroInscricao: number;
}): Promise<{ idLan: number | null; codColigadaLan: number | null } | null> {
  const { codColigada, idps, numeroInscricao } = params;
  const rows = await query<{
    IDLAN: number | null;
    CODCOLIGADALAN: number | null;
  }>(
    `SELECT TOP 1 i.IDLAN, i.CODCOLIGADALAN
       FROM SPSINSCRICAOAREAOFERTADA i
      WHERE i.CODCOLIGADA = @cod AND i.IDPS = @idps
        AND i.NUMEROINSCRICAO = @num
      ORDER BY i.IDLAN DESC`,
    { cod: codColigada, idps, num: numeroInscricao },
  );
  const r = rows[0];
  if (!r) return null;
  return { idLan: r.IDLAN ?? null, codColigadaLan: r.CODCOLIGADALAN ?? null };
}

/** Recupera as informações do boleto da taxa (GET Financeiro/InfoBoletoInscricao). */
export async function obterBoletoInscricao(
  rmCookie: string,
  numeroInscricao: number,
): Promise<BoletoInscricao | null> {
  const qs = new URLSearchParams({ numeroInscricao: String(numeroInscricao) });
  const res = await rmFetch(`Financeiro/InfoBoletoInscricao?${qs.toString()}`, {
    webapi: WEBAPI,
    cookie: rmCookie,
  });
  if (!res.ok) return null;

  const json = await res.json();
  if (temErroRm(json)) return null;
  const b = primeiroRegistro(json);
  if (!b) return null;

  const num = (k: string) =>
    typeof b[k] === "number"
      ? (b[k] as number)
      : b[k] != null && /^\d+$/.test(String(b[k]))
        ? Number(b[k])
        : null;
  const str = (k: string) =>
    b[k] == null || String(b[k]).trim() === "" ? null : String(b[k]);

  const idBoleto = num("IDBOLETO");
  const tipoBoleto = str("TIPOBOLETO");
  // PDF disponível quando NÃO é boleto fixo HTML e há um idBoleto para a 2ª via.
  const temPdf =
    idBoleto != null && (tipoBoleto ?? "").toUpperCase() !== "HTML";

  return {
    numeroInscricao,
    idBoleto,
    tipoBoleto,
    boletoRegistrado: flagRm(b["BOLETOREGISTRADO"]),
    mostraBoletoNaoRegistrado: flagRm(b["SHOWBOLETONAOREGPORTAL"]),
    permiteRegOnline: flagRm(b["PERMITEREGONLINE"]),
    urlBoletoFixo: str("URLBOLETOFIXO"),
    urlRegOnline: str("URLREGONLINE"),
    temPdf,
    bruto: b,
  };
}

/**
 * "STATUS DA INSCRIÇÃO" — o mesmo campo exibido no comprovante emitido pela
 * EduPS. Fonte: GET CentralCandidato/v1/StatusCadastro?numeroInscricao=N
 * (espelha o portal nativo: centralcandidato.factory.js → getStatusCadastro).
 *
 * A WebAPI devolve um único registro com:
 *   STATUS         → 0 = "Inscrito - Pagamento pendente"
 *                    1 = "Candidato (inscrição confirmada)"
 *                    2 = "Excedente" (usa ORDEMEXCEDENTE)
 *   ORDEMEXCEDENTE → posição na fila de excedentes (só quando STATUS === 2)
 *   DT*INSCRICAO/SELECAO/RESULTADO → janelas do processo (não usadas aqui)
 */
export interface StatusCadastroInscricao {
  status: number | null;
  ordemExcedente: number | null;
}

export async function obterStatusCadastro(
  rmCookie: string,
  numeroInscricao: number,
): Promise<StatusCadastroInscricao | null> {
  const qs = new URLSearchParams({ numeroInscricao: String(numeroInscricao) });
  const res = await rmFetch(
    `CentralCandidato/v1/StatusCadastro?${qs.toString()}`,
    {
      webapi: WEBAPI,
      cookie: rmCookie,
    },
  );
  if (!res.ok) return null;

  const json = await res.json();
  if (temErroRm(json)) return null;
  const b = primeiroRegistro(json);
  if (!b) return null;

  const num = (k: string) =>
    typeof b[k] === "number"
      ? (b[k] as number)
      : b[k] != null && /^\d+$/.test(String(b[k]))
        ? Number(b[k])
        : null;

  return {
    status: num("STATUS"),
    ordemExcedente: num("ORDEMEXCEDENTE"),
  };
}

/**
 * Baixa a 2ª via do boleto do candidato em PDF (GET Financeiro/2aviaBoletoCandidato).
 * Em sucesso, `base64` traz os bytes do PDF (campo BYTES). Em erro do RM (ex.:
 * boleto não registrado no banco), `erro` traz a mensagem retornada pela EduPS.
 */
export interface BoletoPdfResultado {
  base64: string | null;
  erro: string | null;
}

export async function obterBoletoPdfCandidato(
  rmCookie: string,
  idBoleto: number,
): Promise<BoletoPdfResultado> {
  const qs = new URLSearchParams({ idBoleto: String(idBoleto) });
  const res = await rmFetch(
    `Financeiro/2aviaBoletoCandidato?${qs.toString()}`,
    {
      webapi: WEBAPI,
      cookie: rmCookie,
    },
  );
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

  const b = primeiroRegistro(json);
  const bytes = b?.["BYTES"] ?? b?.["Bytes"];
  if (bytes == null || String(bytes).trim() === "") {
    return { base64: null, erro: null };
  }
  return { base64: String(bytes), erro: null };
}

/**
 * Comprovante de inscrição em PDF (GET Inscricao/Comprovante). Espelha o portal
 * nativo (inscricoes.comprovante.factory.js → `/Inscricao/Comprovante`): o RM
 * devolve `TOTVSReport` (base64 do PDF) ou, em processos configurados com HTML
 * fixo, `HTMLFixo`. Retorna o que estiver disponível; `erro` traz a mensagem da
 * EduPS quando o comprovante não pôde ser gerado.
 */
export interface ComprovanteInscricao {
  base64: string | null;
  html: string | null;
  erro: string | null;
}

export async function obterComprovanteInscricao(
  rmCookie: string,
  numeroInscricao: number,
): Promise<ComprovanteInscricao> {
  const qs = new URLSearchParams({ numeroInscricao: String(numeroInscricao) });
  const res = await rmFetch(`Inscricao/Comprovante?${qs.toString()}`, {
    webapi: WEBAPI,
    cookie: rmCookie,
  });
  if (!res.ok) return { base64: null, html: null, erro: null };

  const json = await res.json();

  // Erro da EduPS: `data` é objeto com chave "RMException:Message" (HTTP 200).
  const env = (json as { data?: unknown })?.data ?? json;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const entradaErro = Object.entries(env as Record<string, unknown>).find(
      ([k]) => /exception/i.test(k),
    );
    if (entradaErro)
      return { base64: null, html: null, erro: String(entradaErro[1]) };
  }

  const b = primeiroRegistro(json);
  const report = b?.["TOTVSReport"] ?? b?.["TotvsReport"];
  if (report != null && String(report).trim() !== "") {
    return { base64: String(report), html: null, erro: null };
  }
  const html = b?.["HTMLFixo"] ?? b?.["HtmlFixo"];
  if (html != null && String(html).trim() !== "") {
    return { base64: null, html: String(html), erro: null };
  }
  return { base64: null, html: null, erro: null };
}

// ---------------------------------------------------------------------------
// Documentos da inscrição (Central do Candidato)
//
// LEITURA da SITUAÇÃO por SQL (mesmo padrão de listarDocumentosExigidos em
// queries.ts): a situação de entrega é lida direto do CorporeRM porque é mais
// simples e barato que orquestrar várias chamadas WebAPI:
//   - SPSDOCUMENTOEXIGIDO + SDOCUMENTO → documentos exigidos (EXIGEINSCRICAO='T');
//   - SPSARQUIVOSCANDIDATO            → arquivos enviados (nome/data);
//   - SPSDOCUMENTOENTREGUE            → conferência da secretaria (ENTREGUE/MOTIVO).
//
// DOWNLOAD do CONTEÚDO pela WebAPI EduPS (GET CentralCandidato/v1/ApplicantFiles):
// o blob SPSARQUIVOSCANDIDATO.ARQUIVO guarda apenas o marcador "file on server"
// (14 bytes) — os bytes reais ficam no SERVIDOR de arquivos do RM, então SÓ a
// WebAPI recupera o conteúdo. Convenção da rota (validada em produção, 2026-07):
// `id` e `query` vão AMBOS como query string (?id=<chave>&query=), NÃO no path
// (o path faz o IIS tratar como arquivo estático → 404). Resposta: [{ file:
// base64, fileName }].
//
// A ESCRITA (substituição) continua pela WebAPI EduPS, respeitando as regras do PS.
// ---------------------------------------------------------------------------

/**
 * O RM guarda o nome do arquivo como `nome¶sufixo` (o ¶ separa o nome original
 * de um sufixo interno). Para exibição, junta o trecho antes do ¶ com a extensão.
 */
function nomeExibicaoArquivo(fileName: string): string {
  const posSep = fileName.lastIndexOf("¶");
  if (posSep < 0) return fileName;
  const posExt = fileName.lastIndexOf(".");
  const base = fileName.substring(0, posSep);
  const ext = posExt > posSep ? fileName.substring(posExt) : "";
  return base + ext;
}

export type SituacaoDocumento = "entregue" | "em_analise" | "pendente";

export interface DocumentoInscricaoStatus {
  /** CODDOCUMENTO (fileCode) do documento exigido. */
  codDocumento: number | null;
  descricao: string;
  obrigatorio: boolean;
  /** Observação da secretaria (RequiredDocument.reason / MOTIVO), quando houver. */
  observacao: string | null;
  situacao: SituacaoDocumento;
  /** true quando o usuário ainda pode enviar/substituir o arquivo. */
  podeSubstituir: boolean;
  /** Nome do arquivo enviado (para exibição), quando já houver upload. */
  nomeArquivo: string | null;
  /** Chave para baixar o arquivo enviado por SQL (`COLIG|IDPS|NUM|NOMEARQUIVO`). */
  chaveDownload: string | null;
}

/** Extrai o CODDOCUMENTO do NOMEARQUIVO (sufixo `¶CODCOLIGADA-IDPS-NUM-CODDOC.ext`). */
function codDocumentoDoArquivo(nomeArquivo: string): number | null {
  const posSep = nomeArquivo.lastIndexOf("¶");
  if (posSep < 0) return null;
  let sufixo = nomeArquivo.substring(posSep + 1);
  const posExt = sufixo.lastIndexOf(".");
  if (posExt >= 0) sufixo = sufixo.substring(0, posExt);
  const partes = sufixo.split("-");
  const cod = Number(partes[partes.length - 1]);
  return Number.isFinite(cod) ? cod : null;
}

interface DocExigidoRow {
  CODDOCUMENTO: number;
  OBRIGATORIO: string | null;
  DESCRICAO: string | null;
  ENTREGUE: string | null;
  MOTIVO: string | null;
}

interface ArquivoCandidatoRow {
  NOMEARQUIVO: string | null;
  DATAENVIO: Date | null;
}

/**
 * Lista os documentos exigidos de uma inscrição com a situação de cada um
 * (entregue/em análise/pendente), a observação da secretaria e se o candidato
 * ainda pode substituir — TUDO por LEITURA SQL no CorporeRM (mesmo padrão do
 * painel de candidatos). A escrita/substituição continua pela WebAPI EduPS.
 *
 * Regras (espelham a secretaria):
 *  - documento exigido para inscrição = SPSDOCUMENTOEXIGIDO.EXIGEINSCRICAO='T';
 *  - arquivo enviado = SPSARQUIVOSCANDIDATO cujo sufixo do NOMEARQUIVO
 *    (`¶CODCOLIGADA-IDPS-NUM-CODDOCUMENTO`) casa com o CODDOCUMENTO;
 *  - ENTREGUE='T' em SPSDOCUMENTOENTREGUE → conferido pela secretaria → NÃO pode
 *    substituir; MOTIVO = observação exibida ao usuário.
 */
export async function listarDocumentosInscricao(params: {
  codColigada: number;
  idps: number;
  idAreaInteresse: number;
  numeroInscricao: number;
}): Promise<DocumentoInscricaoStatus[]> {
  const { codColigada, idps, idAreaInteresse, numeroInscricao } = params;

  const exigidos = await query<DocExigidoRow>(
    `
SELECT de.CODDOCUMENTO,
       de.OBRIGATORIO,
       d.DESCRICAO,
       ent.ENTREGUE,
       ent.MOTIVO
  FROM SPSDOCUMENTOEXIGIDO de
  LEFT JOIN SDOCUMENTO d ON d.CODDOCUMENTO = de.CODDOCUMENTO
  LEFT JOIN SPSDOCUMENTOENTREGUE ent
         ON ent.CODCOLIGADA = de.CODCOLIGADA
        AND ent.IDPS = de.IDPS
        AND ent.CODDOCUMENTO = de.CODDOCUMENTO
        AND ent.NUMEROINSCRICAO = @num
 WHERE de.CODCOLIGADA = @cod
   AND de.IDPS = @idps
   AND de.IDAREAINTERESSE = @area
   AND de.EXIGEINSCRICAO = 'T'
 ORDER BY de.CODDOCUMENTO`,
    { cod: codColigada, idps, area: idAreaInteresse, num: numeroInscricao },
  );
  if (exigidos.length === 0) return [];

  const arquivos = await query<ArquivoCandidatoRow>(
    `
SELECT NOMEARQUIVO, DATAENVIO
  FROM SPSARQUIVOSCANDIDATO
 WHERE CODCOLIGADA = @cod AND IDPS = @idps AND NUMEROINSCRICAO = @num
 ORDER BY DATAENVIO DESC`,
    { cod: codColigada, idps, num: numeroInscricao },
  );

  // Indexa os arquivos enviados por CODDOCUMENTO (mais recente primeiro).
  const arquivoPorDoc = new Map<number, string>();
  for (const a of arquivos) {
    const nome = a.NOMEARQUIVO ?? "";
    const cod = codDocumentoDoArquivo(nome);
    if (cod != null && !arquivoPorDoc.has(cod)) arquivoPorDoc.set(cod, nome);
  }

  // Grupo do candidato (campo complementar GRUPO em SPSINSCAREAOFERTACOMPL):
  // GRP2 = "Filho de ex-aluno". O documento comprobatório de ex-aluno é opcional
  // e só faz sentido para esse grupo — para os demais, escondemos da lista (não
  // é pendência nem exigência). Se o grupo não puder ser lido, mantemos o doc.
  const grupoRows = await query<{ GRUPO: string | null }>(
    `SELECT TOP 1 GRUPO FROM SPSINSCAREAOFERTACOMPL
      WHERE CODCOLIGADA = @cod AND IDPS = @idps AND NUMEROINSCRICAO = @num`,
    { cod: codColigada, idps, num: numeroInscricao },
  );
  const ehExAluno =
    String(grupoRows[0]?.GRUPO ?? "")
      .trim()
      .toUpperCase() === "GRP2";
  const ehDocExAluno = (descricao: string) => /ex[\s-]*aluno/i.test(descricao);

  return exigidos
    .filter((doc) => ehExAluno || !ehDocExAluno(String(doc.DESCRICAO ?? "")))
    .map((doc) => {
      const codDoc = doc.CODDOCUMENTO;
      const fileNameBruto = arquivoPorDoc.get(codDoc) ?? "";
      const temArquivo = fileNameBruto !== "";
      const entregue =
        String(doc.ENTREGUE ?? "")
          .trim()
          .toUpperCase() === "T";
      const observacao =
        doc.MOTIVO != null && String(doc.MOTIVO).trim() !== ""
          ? String(doc.MOTIVO).trim()
          : null;

      return {
        codDocumento: codDoc,
        // Descrição CRUA (com eventual prefixo "(*)"): além de exibir, ela é o
        // DETALHE usado na substituição — o backend identifica o documento pelo
        // match EXATO do DETALHE com a descrição da config (o CODDOCUMENTO enviado
        // no payload é ignorado). Limpar o "(*)" quebraria a substituição.
        descricao: String(doc.DESCRICAO ?? "").trim(),
        obrigatorio:
          String(doc.OBRIGATORIO ?? "")
            .trim()
            .toUpperCase() === "T",
        observacao,
        situacao: entregue
          ? "entregue"
          : temArquivo
            ? "em_analise"
            : "pendente",
        podeSubstituir: !entregue,
        nomeArquivo: temArquivo ? nomeExibicaoArquivo(fileNameBruto) : null,
        chaveDownload: temArquivo
          ? `${codColigada}|${idps}|${numeroInscricao}|${fileNameBruto}`
          : null,
      };
    });
}

/** Arquivo de documento para download (base64 + nome de exibição). */
export interface ArquivoDocumento {
  base64: string;
  nomeArquivo: string;
}

/**
 * Baixa o conteúdo de um arquivo já enviado pela WebAPI EduPS
 * (GET CentralCandidato/v1/ApplicantFiles). `chave` =
 * `CODCOLIGADA|IDPS|NUMEROINSCRICAO|NOMEARQUIVO` (NOMEARQUIVO cru, com o sufixo
 * `¶...`). Espelha o `getArquivoDownload` do portal nativo: `id` = chave e
 * `query` = '' vão AMBOS na query string. Retorna o base64 e o nome de exibição,
 * ou null quando indisponível. `rmCookie` deve estar escopado ao IDPS da chave.
 */
export async function baixarArquivoDocumento(
  rmCookie: string,
  chave: string,
): Promise<ArquivoDocumento | null> {
  const partes = chave.split("|");
  if (partes.length < 4) return null;
  // O NOMEARQUIVO pode teoricamente conter "|"? Não — o separador do sufixo é
  // "¶". Ainda assim, reconstituímos o restante para robustez.
  const nomeArquivo = partes.slice(3).join("|");
  if (nomeArquivo === "") return null;

  // Convenção confirmada: id (chave) e query ('') AMBOS na query string. Enviar
  // no path faz o IIS servir como estático (404).
  const path =
    "CentralCandidato/v1/ApplicantFiles" +
    `?id=${encodeURIComponent(chave)}&query=${encodeURIComponent("")}`;
  const res = await rmFetch(path, { webapi: WEBAPI, cookie: rmCookie });
  if (!res.ok) return null;

  const json = (await res.json().catch(() => null)) as unknown;
  const arr = Array.isArray((json as { data?: unknown })?.data)
    ? ((json as { data: unknown[] }).data as Array<Record<string, unknown>>)
    : Array.isArray(json)
      ? (json as Array<Record<string, unknown>>)
      : null;
  const primeiro = arr?.[0];
  if (!primeiro) return null;

  const base64 = (primeiro.file ?? primeiro.File) as string | undefined;
  if (!base64 || String(base64).trim() === "") return null;
  const fileName =
    (primeiro.fileName as string | undefined) ??
    (primeiro.FileName as string | undefined) ??
    nomeArquivo;

  return {
    base64: String(base64),
    nomeArquivo: nomeExibicaoArquivo(fileName),
  };
}

/** Resultado de uma substituição/envio de documento. */
export interface ResultadoSubstituicao {
  ok: boolean;
  erro: string | null;
}

/**
 * Envia (ou substitui) o arquivo de um documento da inscrição
 * (POST CentralCandidato/v1/ApplicantFilesUpload), espelhando o `saveSelectedFiles`
 * do portal nativo. Validado em produção (2026-07): o endpoint EXISTE e aceita o
 * modelo `{ SPSDOCUMENTOSEXIGIDOS: [{ ...ARQUIVO: <base64 STRING> }] }`.
 *
 * DETALHES CRÍTICOS (descobertos em teste):
 *  - `ARQUIVO` deve ser a STRING base64 pura — enviar `{ Arquivo: base64 }` dá HTTP 500;
 *  - o backend identifica o documento pelo MATCH EXATO de `DETALHE` com a descrição
 *    da config (SDOCUMENTO.DESCRICAO, COM eventual prefixo "(*)"). Por isso `descricao`
 *    deve ser a descrição CRUA; um CODDOCUMENTO no payload é ignorado.
 * O upload SUBSTITUI o arquivo do documento. A permissão (podeSubstituir) é
 * revalidada na camada de rota antes de chamar aqui.
 */
export async function substituirArquivoDocumento(params: {
  rmCookie: string;
  codColigada: number;
  idps: number;
  numeroInscricao: number;
  descricao: string;
  nomeArquivo: string;
  arquivoBase64: string;
}): Promise<ResultadoSubstituicao> {
  const {
    rmCookie,
    codColigada,
    idps,
    numeroInscricao,
    descricao,
    nomeArquivo,
    arquivoBase64,
  } = params;

  const model = {
    SPSDOCUMENTOSEXIGIDOS: [
      {
        CODCOLIGADA: codColigada,
        IDPS: idps,
        NUMEROINSCRICAO: numeroInscricao,
        DETALHE: descricao,
        NOMEARQUIVO: nomeArquivo,
        ARQUIVO: arquivoBase64,
        NOMEORIGINAL: nomeArquivo,
      },
    ],
  };

  const res = await rmFetch("CentralCandidato/v1/ApplicantFilesUpload", {
    webapi: WEBAPI,
    method: "POST",
    body: model,
    cookie: rmCookie,
  });

  if (!res.ok) {
    return { ok: false, erro: `HTTP ${res.status}` };
  }

  // A EduPS pode responder 200 com envelope de exceção (mesmo padrão do upload
  // de documentos na NovaInscricao). Detecta chave "*exception*".
  const json = await res.json().catch(() => null);
  const env = (json as { data?: unknown })?.data ?? json;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const entradaErro = Object.entries(env as Record<string, unknown>).find(
      ([k]) => /exception/i.test(k),
    );
    if (entradaErro) return { ok: false, erro: String(entradaErro[1]) };
  }
  return { ok: true, erro: null };
}
