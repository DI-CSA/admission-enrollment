// Consultas de LEITURA ao CorporeRM (read-only, parametrizadas) para o Portal de
// Inscrições. Modelam o que hoje seria capturado no navegador: processos seletivos,
// oferta de áreas e lookup de pessoa/candidato por CPF.
//
// REGRA: somente SELECT. Escrita (inscrição/boleto) vai pela WebAPI EduPS.
// Schema confirmado direto no banco (jun/2026):
//   SPSPROCESSOSELETIVO(IDPS,CODCOLIGADA,CODFILIAL,NOME,STATUS,EXIBENOPORTAL,USANOVOPORTAL,
//     VALORINSCRICAO,DTINIINSCRICAO,DTFIMINSCRICAO,ARQUIVOEDITAL,NOMEARQUIVOEDITAL)
//   SPSAREAOFERTADA(PK CODCOLIGADA,IDPS,IDAREAINTERESSE; NUMEROVAGAS,VALORINSCRICAO,STATUS,
//     DTNASCIMENTOMINIMA,DTNASCIMENTOMAXIMA,RESUMO) JOIN SPSAREAINTERESSE(IDAREAINTERESSE,NOME,GRUPO)
//   PPESSOA(PK LOGID,CODIGO; CPF,NOME,EMAIL,EMAILPESSOAL,DTNASCIMENTO,TELEFONE1..3)
//   SPSUSUARIO(PK CODUSUARIOPS,LOGID; CPF,NOME,EMAIL,DTNASCIMENTO,CODPESSOA,SENHA,
//     TOKEN,RESETSENHATOKEN,DTEXPIRACAORESETSENHA) = conta de login do portal (responsável)
//   SPSINSCRICAOAREAOFERTADA(PK CODCOLIGADA,IDPS,NUMEROINSCRICAO; CODUSUARIOPS=candidato,
//     CODPESSOA, CODPESSOARESPONSAVEL, STATUS[1=ativa,0/8=cancel/exced], DATAINSCRICAO,
//     IDAREAINTERESSE via SPSINSCRICAOAREAOFERTADASUBDEF) = inscrição do portal (1 linha por
//     área/opção). NÃO há unique no banco para (candidato,PS) — a regra "mesmo candidato não
//     repete no PS" é aplicada pela WebAPI EduPS no submit (/Inscricao/v2/BuscaUsuario -> Bloqueia).
//   SPSRESPONSAVELCANDIDATO(PK CODPESSOARESPONSAVEL,CODPESSOACANDIDATO) = vínculo responsável→candidato.

import "server-only";
import { query } from "./db";
import { ANO_PROCESSO } from "@/lib/processos";

const COD_COLIGADA = Number(process.env.RM_COD_COLIGADA) || 1;

const ehVerdadeiro = (v: unknown) => v === "T" || v === true || v === 1;

/** Normaliza CPF para 11 dígitos; retorna null se inválido. */
function cpfDigitos(cpf: string): string | null {
  const d = (cpf || "").replace(/\D/g, "");
  return d.length === 11 ? d : null;
}

/** Mascara um e-mail para exibição (j***@dominio.com). */
function mascararEmail(email: string | null | undefined): string | null {
  const e = (email || "").trim();
  const at = e.indexOf("@");
  if (at < 1) return null;
  const usuario = e.slice(0, at);
  const dominio = e.slice(at + 1);
  const visivel = usuario.slice(0, 1);
  return `${visivel}${"*".repeat(Math.max(2, usuario.length - 1))}@${dominio}`;
}

// ---------------------------------------------------------------------------
// Processos Seletivos
// ---------------------------------------------------------------------------

export interface ProcessoSeletivoRM {
  idps: number;
  codColigada: number;
  codFilial: number;
  nome: string;
  valorInscricao: number;
  status: string;
  exibeNoPortal: boolean;
  usaNovoPortal: boolean;
  dtIniInscricao: Date | null;
  dtFimInscricao: Date | null;
  temEdital: boolean;
}

interface ProcessoRow {
  IDPS: number;
  CODCOLIGADA: number;
  CODFILIAL: number;
  NOME: string;
  VALORINSCRICAO: number;
  STATUS: string;
  EXIBENOPORTAL: string;
  USANOVOPORTAL: string;
  DTINIINSCRICAO: Date | null;
  DTFIMINSCRICAO: Date | null;
  TEMEDITAL: number;
}

/**
 * Lista os processos seletivos.
 * @param opts.apenasPortal  só os marcados EXIBENOPORTAL='T'
 * @param opts.apenasAbertos só ativos com inscrições abertas hoje
 */
export async function listarProcessosSeletivos(
  opts: { apenasPortal?: boolean; apenasAbertos?: boolean } = {},
): Promise<ProcessoSeletivoRM[]> {
  const where = ["CODCOLIGADA = @col"];
  if (opts.apenasPortal) where.push("EXIBENOPORTAL = 'T'");
  if (opts.apenasAbertos) {
    where.push("STATUS = 'T'");
    where.push("GETDATE() BETWEEN DTINIINSCRICAO AND DTFIMINSCRICAO");
  }

  const rows = await query<ProcessoRow>(
    `SELECT IDPS, CODCOLIGADA, CODFILIAL, NOME, VALORINSCRICAO, STATUS,
            EXIBENOPORTAL, USANOVOPORTAL, DTINIINSCRICAO, DTFIMINSCRICAO,
            CASE WHEN ARQUIVOEDITAL IS NOT NULL THEN 1 ELSE 0 END AS TEMEDITAL
     FROM SPSPROCESSOSELETIVO
     WHERE ${where.join(" AND ")}
     ORDER BY DTINIINSCRICAO DESC, IDPS DESC`,
    { col: COD_COLIGADA },
  );

  return rows.map((r) => ({
    idps: r.IDPS,
    codColigada: r.CODCOLIGADA,
    codFilial: r.CODFILIAL,
    nome: r.NOME?.trim() ?? "",
    valorInscricao: Number(r.VALORINSCRICAO) || 0,
    status: r.STATUS,
    exibeNoPortal: ehVerdadeiro(r.EXIBENOPORTAL),
    usaNovoPortal: ehVerdadeiro(r.USANOVOPORTAL),
    dtIniInscricao: r.DTINIINSCRICAO,
    dtFimInscricao: r.DTFIMINSCRICAO,
    temEdital: r.TEMEDITAL === 1,
  }));
}

/** Busca um processo seletivo específico por IDPS. */
export async function obterProcessoSeletivo(
  idps: number,
): Promise<ProcessoSeletivoRM | null> {
  const rows = await query<ProcessoRow>(
    `SELECT IDPS, CODCOLIGADA, CODFILIAL, NOME, VALORINSCRICAO, STATUS,
            EXIBENOPORTAL, USANOVOPORTAL, DTINIINSCRICAO, DTFIMINSCRICAO,
            CASE WHEN ARQUIVOEDITAL IS NOT NULL THEN 1 ELSE 0 END AS TEMEDITAL
     FROM SPSPROCESSOSELETIVO
     WHERE CODCOLIGADA = @col AND IDPS = @idps`,
    { col: COD_COLIGADA, idps },
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    idps: r.IDPS,
    codColigada: r.CODCOLIGADA,
    codFilial: r.CODFILIAL,
    nome: r.NOME?.trim() ?? "",
    valorInscricao: Number(r.VALORINSCRICAO) || 0,
    status: r.STATUS,
    exibeNoPortal: ehVerdadeiro(r.EXIBENOPORTAL),
    usaNovoPortal: ehVerdadeiro(r.USANOVOPORTAL),
    dtIniInscricao: r.DTINIINSCRICAO,
    dtFimInscricao: r.DTFIMINSCRICAO,
    temEdital: r.TEMEDITAL === 1,
  };
}

// ---------------------------------------------------------------------------
// Áreas ofertadas (segmentos/séries com vaga)
// ---------------------------------------------------------------------------

export interface AreaOfertadaRM {
  idps: number;
  idAreaInteresse: number;
  nome: string;
  grupo: string | null;
  numeroVagas: number;
  valorInscricao: number;
  dtNascimentoMinima: Date | null;
  dtNascimentoMaxima: Date | null;
  resumo: string | null;
}

interface AreaRow {
  IDPS: number;
  IDAREAINTERESSE: number;
  NOME: string;
  GRUPO: string | null;
  NUMEROVAGAS: number;
  VALORINSCRICAO: number;
  DTNASCIMENTOMINIMA: Date | null;
  DTNASCIMENTOMAXIMA: Date | null;
  RESUMO: string | null;
}

/** Lista as áreas ofertadas ativas de um processo seletivo (com o nome da área). */
export async function listarAreasOfertadas(
  idps: number,
): Promise<AreaOfertadaRM[]> {
  const rows = await query<AreaRow>(
    `SELECT ao.IDPS, ao.IDAREAINTERESSE, ai.NOME, ai.GRUPO,
            ao.NUMEROVAGAS, ao.VALORINSCRICAO,
            ao.DTNASCIMENTOMINIMA, ao.DTNASCIMENTOMAXIMA, ao.RESUMO
     FROM SPSAREAOFERTADA ao
     JOIN SPSAREAINTERESSE ai ON ai.IDAREAINTERESSE = ao.IDAREAINTERESSE
     WHERE ao.CODCOLIGADA = @col AND ao.IDPS = @idps AND ao.STATUS = 'T'
     ORDER BY ai.NOME`,
    { col: COD_COLIGADA, idps },
  );
  return rows.map((r) => ({
    idps: r.IDPS,
    idAreaInteresse: r.IDAREAINTERESSE,
    nome: r.NOME?.trim() ?? "",
    grupo: r.GRUPO?.trim() || null,
    numeroVagas: Number(r.NUMEROVAGAS) || 0,
    valorInscricao: Number(r.VALORINSCRICAO) || 0,
    dtNascimentoMinima: r.DTNASCIMENTOMINIMA,
    dtNascimentoMaxima: r.DTNASCIMENTOMAXIMA,
    resumo: r.RESUMO?.trim() || null,
  }));
}

// ---------------------------------------------------------------------------
// Documentos exigidos na inscrição (por PS + área de interesse)
// ---------------------------------------------------------------------------
//
// Schema confirmado no banco (jul/2026):
//   SPSDOCUMENTOEXIGIDO(PK CODCOLIGADA,IDPS,IDAREAINTERESSE,CODDOCUMENTO;
//     OBRIGATORIO varchar(1) 'T'/'F', QUANTIDADE smallint, EXIGEINSCRICAO varchar(1))
//     = configuração por processo/série de quais documentos são pedidos.
//   SDOCUMENTO(CODDOCUMENTO smallint, DESCRICAO varchar(60),
//     TXTORIENTACAOUPLDDOCUMENTOPRT varchar(4000)) = catálogo de tipos de documento.
//
// Os arquivos enviados são gravados pela WebAPI EduPS em SPSARQUIVOSCANDIDATO
// (coluna ARQUIVO image) no MESMO POST Inscricao/NovaInscricao — não há endpoint
// de upload separado. Só listamos os que valem no ato da inscrição (EXIGEINSCRICAO='T').

export interface DocumentoExigidoRM {
  codDocumento: number;
  descricao: string;
  obrigatorio: boolean;
  quantidade: number;
  orientacao: string | null;
}

interface DocumentoExigidoRow {
  CODDOCUMENTO: number;
  DESCRICAO: string;
  OBRIGATORIO: string;
  QUANTIDADE: number;
  ORIENTACAO: string | null;
}

/**
 * Lista os documentos exigidos na inscrição de uma série (PS + área de interesse).
 * Retorna obrigatórios e opcionais; o chamador decide como apresentar cada um.
 * Filtra EXIGEINSCRICAO='T' (os demais só valem na matrícula).
 */
export async function listarDocumentosExigidos(
  idps: number,
  idAreaInteresse: number,
): Promise<DocumentoExigidoRM[]> {
  const rows = await query<DocumentoExigidoRow>(
    `SELECT de.CODDOCUMENTO, d.DESCRICAO, de.OBRIGATORIO, de.QUANTIDADE,
            d.TXTORIENTACAOUPLDDOCUMENTOPRT AS ORIENTACAO
     FROM SPSDOCUMENTOEXIGIDO de
     JOIN SDOCUMENTO d ON d.CODDOCUMENTO = de.CODDOCUMENTO
     WHERE de.CODCOLIGADA = @col AND de.IDPS = @idps
       AND de.IDAREAINTERESSE = @idarea AND de.EXIGEINSCRICAO = 'T'
     ORDER BY de.OBRIGATORIO DESC, d.DESCRICAO`,
    { col: COD_COLIGADA, idps, idarea: idAreaInteresse },
  );
  return rows.map((r) => ({
    codDocumento: r.CODDOCUMENTO,
    descricao: r.DESCRICAO?.trim() ?? "",
    obrigatorio: ehVerdadeiro(r.OBRIGATORIO),
    quantidade: Number(r.QUANTIDADE) || 1,
    orientacao: r.ORIENTACAO?.trim() || null,
  }));
}

// ---------------------------------------------------------------------------
// Séries de admissão abertas (agregadas por todos os PS do ano)
// ---------------------------------------------------------------------------

export interface SerieAbertaRM {
  idps: number;
  nomeProcesso: string;
  idAreaInteresse: number;
  nome: string;
  grupo: string | null;
  numeroVagas: number;
  valorInscricao: number;
  /**
   * Código da habilitação (série) do RM, resolvido pelo vínculo estrutural
   * SPSAREAINTERESSE.IDHABILITACAOFILIAL → SHABILITACAOFILIAL.CODHABILITACAO
   * (ex.: EFI1..EFI5, EFII6..EFII9, EM1/EM2). Estável entre renomeações do PS —
   * usado para mapear a programação de avaliações. `null` se não vinculada.
   */
  codHabilitacao: string | null;
}

interface SerieRow {
  IDPS: number;
  NOMEPS: string;
  IDAREAINTERESSE: number;
  NOME: string;
  GRUPO: string | null;
  NUMEROVAGAS: number;
  VALORINSCRICAO: number;
  CODHABILITACAO: string | null;
}

/**
 * Lista TODAS as séries ofertadas abertas dos processos seletivos de admissão de um
 * ano, agregando as áreas de todos os PS cujo NOME contém o ano (ex.: "2027"). Cada
 * item carrega o IDPS de origem, de modo que a inscrição não dependa de um link por
 * segmento: o responsável escolhe a série e o PS correto é resolvido a partir dela.
 *
 * Só inclui PS publicados (EXIBENOPORTAL='T'), ativos (STATUS='T') e com inscrições
 * abertas hoje — e áreas ativas (ao.STATUS='T'). O filtro por ano no NOME exclui
 * eventos (nivelamento, revisão de conteúdos etc.) que não são admissão.
 */
export async function listarSeriesAbertas(
  ano: number,
): Promise<SerieAbertaRM[]> {
  const rows = await query<SerieRow>(
    `SELECT ps.IDPS, ps.NOME AS NOMEPS, ao.IDAREAINTERESSE, ai.NOME, ai.GRUPO,
            ao.NUMEROVAGAS, ao.VALORINSCRICAO, hf.CODHABILITACAO
     FROM SPSPROCESSOSELETIVO ps
     JOIN SPSAREAOFERTADA ao
       ON ao.CODCOLIGADA = ps.CODCOLIGADA AND ao.IDPS = ps.IDPS
     JOIN SPSAREAINTERESSE ai ON ai.IDAREAINTERESSE = ao.IDAREAINTERESSE
     LEFT JOIN SHABILITACAOFILIAL hf
       ON hf.IDHABILITACAOFILIAL = ai.IDHABILITACAOFILIAL
      AND hf.CODCOLIGADA = ai.CODCOLIGADAHABFILIAL
     WHERE ps.CODCOLIGADA = @col
       AND ps.EXIBENOPORTAL = 'T' AND ps.STATUS = 'T'
       AND GETDATE() BETWEEN ps.DTINIINSCRICAO AND ps.DTFIMINSCRICAO
       AND ao.STATUS = 'T'
       AND ps.NOME LIKE @ano
     ORDER BY ps.NOME, ai.NOME`,
    { col: COD_COLIGADA, ano: `%${ano}%` },
  );
  return rows.map((r) => ({
    idps: r.IDPS,
    nomeProcesso: r.NOMEPS?.trim() ?? "",
    idAreaInteresse: r.IDAREAINTERESSE,
    nome: r.NOME?.trim() ?? "",
    grupo: r.GRUPO?.trim() || null,
    numeroVagas: Number(r.NUMEROVAGAS) || 0,
    valorInscricao: Number(r.VALORINSCRICAO) || 0,
    codHabilitacao: r.CODHABILITACAO?.trim() || null,
  }));
}

// ---------------------------------------------------------------------------
// Pessoa / candidato por CPF (prefill de cadastro, verificação de duplicidade)
// ---------------------------------------------------------------------------

export interface PessoaRM {
  codPessoa: number;
  nome: string;
  cpf: string | null;
  email: string | null;
  dtNascimento: Date | null;
  telefone: string | null;
}

interface PessoaRow {
  CODIGO: number;
  NOME: string;
  CPF: string | null;
  EMAIL: string | null;
  DTNASCIMENTO: Date | null;
  TELEFONE: string | null;
}

/**
 * Lookup de pessoa cadastrada no RM por CPF (PPESSOA). Útil para pré-preencher o
 * cadastro quando o responsável/aluno já existe. Retorna null se não houver match.
 */
export async function buscarPessoaPorCpf(
  cpf: string,
): Promise<PessoaRM | null> {
  const digitos = cpfDigitos(cpf);
  if (!digitos) return null;

  const rows = await query<PessoaRow>(
    `SELECT TOP 1 CODIGO, NOME, CPF,
            COALESCE(NULLIF(LTRIM(RTRIM(EMAIL)), ''), EMAILPESSOAL) AS EMAIL,
            DTNASCIMENTO,
            COALESCE(NULLIF(LTRIM(RTRIM(TELEFONE1)), ''), TELEFONE2, TELEFONE3) AS TELEFONE
     FROM PPESSOA
     WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf
     ORDER BY CODIGO DESC`,
    { cpf: digitos },
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    codPessoa: r.CODIGO,
    nome: r.NOME?.trim() ?? "",
    cpf: r.CPF?.trim() || null,
    email: r.EMAIL?.trim() || null,
    dtNascimento: r.DTNASCIMENTO,
    telefone: r.TELEFONE?.trim() || null,
  };
}

/**
 * Verifica se já existe usuário/candidato do Portal (SPSUSUARIO) com este CPF.
 * Apenas leitura — a criação efetiva continua pela WebAPI EduPS.
 */
export async function existeCandidatoPorCpf(cpf: string): Promise<boolean> {
  const digitos = cpfDigitos(cpf);
  if (!digitos) return false;
  const rows = await query<{ N: number }>(
    `SELECT TOP 1 1 AS N FROM SPSUSUARIO
     WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf`,
    { cpf: digitos },
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Reconhecimento do responsável por CPF (gate de login da Fase 2)
// ---------------------------------------------------------------------------
//
// Fluxo de login (definido com a escola):
//  1. O responsável informa SOMENTE o CPF.
//  2. `reconhecerResponsavelPorCpf` consulta o portal (SPSUSUARIO):
//     - existe → exibir os dados (nome / e-mail mascarado) APENAS para confirmação
//       e pedir a senha. A autenticação e a redefinição de senha vão pela WebAPI
//       EduPS (LoginNovoPortal / RecuperarSenha — "opção da TOTVS").
//     - não existe → segue o cadastro normal (nome e demais dados nas próximas
//       etapas, conforme configurado no PS / InsereInscricao via EduPS).
//  3. `temSenhaCadastrada` indica se o login usa senha própria ou data de
//     nascimento (parametrização do RM em LoginNovoPortal).
//
// ATENÇÃO (segurança): este endpoint expõe a existência de um cadastro a partir de
// um CPF. A rota BFF que o usar DEVE ter rate-limit / proteção contra enumeração e
// só retornar dados mascarados.

export interface ReconhecimentoResponsavel {
  existe: boolean;
  temSenhaCadastrada: boolean;
  nome: string | null;
  emailMascarado: string | null;
  /** E-mail completo — USO SERVER-SIDE apenas (ex.: evento de funil RD Station).
   *  NUNCA repassar ao cliente; a rota BFF só devolve `emailMascarado`. */
  email: string | null;
  dtNascimento: Date | null;
}

interface ReconhecimentoRow {
  NOME: string | null;
  EMAIL: string | null;
  DTNASCIMENTO: Date | null;
  ANYSENHA: number;
}

const NAO_RECONHECIDO: ReconhecimentoResponsavel = {
  existe: false,
  temSenhaCadastrada: false,
  nome: null,
  emailMascarado: null,
  email: null,
  dtNascimento: null,
};

/**
 * Reconhece um responsável a partir do CPF, para o gate de login.
 * Retorna se há conta no portal e, em caso afirmativo, os dados (com e-mail
 * mascarado) para confirmação. Não verifica senha — isso é feito pela EduPS.
 */
export async function reconhecerResponsavelPorCpf(
  cpf: string,
): Promise<ReconhecimentoResponsavel> {
  const digitos = cpfDigitos(cpf);
  if (!digitos) return NAO_RECONHECIDO;

  // Um mesmo CPF pode ter VÁRIAS contas em SPSUSUARIO (CODUSUARIOPS é a única PK;
  // não há unicidade por CPF). Para um reconhecimento determinístico:
  //  - `temSenhaCadastrada` = QUALQUER conta do CPF tem senha (janela MAX OVER());
  //  - a linha representativa (NOME/EMAIL) prefere a conta "de login": com senha,
  //    depois com e-mail, depois vinculada ao RM, e por fim a mais recente.
  const rows = await query<ReconhecimentoRow>(
    `SELECT TOP 1 NOME, EMAIL, DTNASCIMENTO,
            MAX(CASE WHEN NULLIF(LTRIM(RTRIM(SENHA)), '') IS NOT NULL THEN 1 ELSE 0 END) OVER () AS ANYSENHA
     FROM SPSUSUARIO
     WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf
     ORDER BY CASE WHEN NULLIF(LTRIM(RTRIM(SENHA)), '') IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN NULLIF(LTRIM(RTRIM(EMAIL)), '') IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN CODUSUARIOLOGINRM IS NOT NULL THEN 0 ELSE 1 END,
              CODUSUARIOPS DESC`,
    { cpf: digitos },
  );
  if (!rows[0]) return NAO_RECONHECIDO;

  const r = rows[0];
  return {
    existe: true,
    temSenhaCadastrada: r.ANYSENHA === 1,
    nome: r.NOME?.trim() || null,
    emailMascarado: mascararEmail(r.EMAIL),
    email: r.EMAIL?.trim() || null,
    dtNascimento: r.DTNASCIMENTO,
  };
}

/**
 * Resolve o CODUSUARIOPS "de login" a partir do CPF, com o MESMO critério
 * determinístico do reconhecimento (prefere a conta com senha, depois com
 * e-mail, depois vinculada ao RM, e por fim a mais recente). Usado pela
 * autenticação por chave-mestra (teste), que não passa pelo login do RM e
 * portanto não recebe o CODUSUARIOPS de volta. Retorna null se o CPF não
 * existir em SPSUSUARIO.
 */
export async function resolverCodUsuarioPSporCpf(
  cpf: string,
): Promise<number | null> {
  const digitos = cpfDigitos(cpf);
  if (!digitos) return null;
  const rows = await query<{ CODUSUARIOPS: number }>(
    `SELECT TOP 1 CODUSUARIOPS
     FROM SPSUSUARIO
     WHERE REPLACE(REPLACE(REPLACE(ISNULL(CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf
     ORDER BY CASE WHEN NULLIF(LTRIM(RTRIM(SENHA)), '') IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN NULLIF(LTRIM(RTRIM(EMAIL)), '') IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN CODUSUARIOLOGINRM IS NOT NULL THEN 0 ELSE 1 END,
              CODUSUARIOPS DESC`,
    { cpf: digitos },
  );
  return rows[0]?.CODUSUARIOPS ?? null;
}

// ---------------------------------------------------------------------------
// Classificação do CPF: é/foi responsável de aluno? (NOVO vs ANTIGO)
// ---------------------------------------------------------------------------
//
// Regra de negócio (definida com a escola): um CPF é tratado como ANTIGO quando
// já é ou foi RESPONSÁVEL DE ALUNO do colégio — caso em que ele acessa o sistema
// acadêmico (Portal do Aluno) e deve entrar na inscrição com a MESMA senha. Caso
// contrário, é NOVO e segue o cadastro próprio do Processo Seletivo.
//
// Vínculo (schema confirmado no banco): SALUNORESPONSAVEL(RA, CODPESSOA, STATUS)
// liga um aluno (RA) ao responsável (CODPESSOA = PPESSOA.CODIGO). "Já foi ou é"
// => não filtra STATUS (qualquer vínculo, ativo ou histórico, conta).

/**
 * Indica se o CPF já é/foi responsável de algum aluno (vínculo em
 * SALUNORESPONSAVEL via PPESSOA). Usado para classificar NOVO vs ANTIGO no
 * início da inscrição. Apenas leitura.
 */
export async function cpfEhResponsavelDeAluno(cpf: string): Promise<boolean> {
  const digitos = cpfDigitos(cpf);
  if (!digitos) return false;
  const rows = await query<{ N: number }>(
    `SELECT TOP 1 1 AS N
     FROM SALUNORESPONSAVEL sr
     JOIN PPESSOA p ON p.CODIGO = sr.CODPESSOA
     WHERE REPLACE(REPLACE(REPLACE(ISNULL(p.CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf`,
    { cpf: digitos },
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Conta no Portal do Aluno (GUSUARIO) — base da autenticação do usuário ANTIGO
// ---------------------------------------------------------------------------
//
// O login self-service do Portal do Aluno usa o CPF como GUSUARIO.CODUSUARIO
// (confirmado no banco). A senha vive em GUSUARIO.SENHA (envelope Bcrypt do RM ou
// legado de 8 chars). Ter uma conta GUSUARIO com login = CPF é o sinal de que o
// usuário já acessa o Portal do Aluno (ANTIGO) e deve usar/alinhar essa senha na
// inscrição. Diferente de SALUNORESPONSAVEL, que nem sempre reflete o acesso real.

export interface UsuarioPortalAluno {
  /** Hash armazenado (envelope Bcrypt ou legado de 8 chars). */
  senha: string;
  status: number | null;
}

/** Lê a conta do Portal do Aluno (GUSUARIO) cujo login é o CPF. null se não houver. */
export async function obterUsuarioPortalAluno(
  cpf: string,
): Promise<UsuarioPortalAluno | null> {
  const digitos = cpfDigitos(cpf);
  if (!digitos) return null;
  const rows = await query<{ SENHA: string | null; STATUS: number | null }>(
    `SELECT TOP 1 SENHA, STATUS FROM GUSUARIO WHERE CODUSUARIO = @cpf`,
    { cpf: digitos },
  );
  const u = rows[0];
  if (!u || !u.SENHA) return null;
  return { senha: u.SENHA, status: u.STATUS ?? null };
}

/** ANTIGO = tem conta no Portal do Aluno (GUSUARIO com login = CPF e senha definida). */
export async function cpfTemContaPortalAluno(cpf: string): Promise<boolean> {
  return (await obterUsuarioPortalAluno(cpf)) != null;
}

// ---------------------------------------------------------------------------
// Duplicidade de candidato no processo seletivo
// ---------------------------------------------------------------------------
//
// Regra de negócio (confirmada no portal TOTVS): um responsável (CPF) pode
// inscrever VÁRIOS candidatos no mesmo PS, mas NÃO o MESMO candidato duas vezes.
// "Mesmo candidato" = mesma conta do portal (CODUSUARIOPS) — ou, para um novo
// cadastro, o mesmo CPF do candidato. A inscrição vive em SPSINSCRICAOAREAOFERTADA
// (1 linha por área/opção; STATUS=1 ativa).
//
// IMPORTANTE: este é um PRÉ-CHECK de UX (leitura). O bloqueio AUTORITATIVO continua
// na WebAPI EduPS no momento de salvar (/Inscricao/v2/BuscaUsuario -> Bloqueia), que
// respeita os critérios de busca configurados no PS. Não substitua a validação do RM.

export interface SituacaoInscricaoCandidato {
  jaInscrito: boolean; // existe inscrição ATIVA (STATUS=1) do candidato no PS
  inscricoesAtivas: number;
  total: number; // inclui canceladas/excedentes
}

interface SituacaoRow {
  ATIVAS: number | null;
  TOTAL: number | null;
}

function mapSituacao(row: SituacaoRow | undefined): SituacaoInscricaoCandidato {
  const ativas = Number(row?.ATIVAS) || 0;
  const total = Number(row?.TOTAL) || 0;
  return { jaInscrito: ativas > 0, inscricoesAtivas: ativas, total };
}

/**
 * Pré-check: o candidato (conta do portal) já possui inscrição ativa neste PS?
 * Use quando o responsável seleciona um dependente JÁ existente (CODUSUARIOPS
 * conhecido) para inscrever em um novo PS.
 */
export async function candidatoJaInscritoNoProcesso(
  idps: number,
  codUsuarioPS: number,
): Promise<SituacaoInscricaoCandidato> {
  const rows = await query<SituacaoRow>(
    `SELECT SUM(CASE WHEN STATUS = 1 THEN 1 ELSE 0 END) AS ATIVAS, COUNT(*) AS TOTAL
     FROM SPSINSCRICAOAREAOFERTADA
     WHERE CODCOLIGADA = @col AND IDPS = @idps AND CODUSUARIOPS = @cod`,
    { col: COD_COLIGADA, idps, cod: codUsuarioPS },
  );
  return mapSituacao(rows[0]);
}

/**
 * Pré-check por CPF do candidato (quando ele tem CPF próprio). Resolve o
 * CODUSUARIOPS via SPSUSUARIO e verifica inscrição ativa no PS.
 */
export async function candidatoCpfJaInscritoNoProcesso(
  idps: number,
  cpfCandidato: string,
): Promise<SituacaoInscricaoCandidato> {
  const digitos = cpfDigitos(cpfCandidato);
  if (!digitos) return { jaInscrito: false, inscricoesAtivas: 0, total: 0 };
  const rows = await query<SituacaoRow>(
    `SELECT SUM(CASE WHEN i.STATUS = 1 THEN 1 ELSE 0 END) AS ATIVAS, COUNT(*) AS TOTAL
     FROM SPSINSCRICAOAREAOFERTADA i
     JOIN SPSUSUARIO u ON u.CODUSUARIOPS = i.CODUSUARIOPS
     WHERE i.CODCOLIGADA = @col AND i.IDPS = @idps
       AND REPLACE(REPLACE(REPLACE(ISNULL(u.CPF, ''), '.', ''), '-', ''), ' ', '') = @cpf`,
    { col: COD_COLIGADA, idps, cpf: digitos },
  );
  return mapSituacao(rows[0]);
}

// ---------------------------------------------------------------------------
// Responsável VERBATIM (SPSUSUARIO) — para reenviar na NovaInscricao sem alterar
// ---------------------------------------------------------------------------
//
// REGRA crítica (descoberta jun/2026): o responsável já existente (CODUSUARIOPS)
// deve ser enviado na NovaInscricao com os dados EXATAMENTE como estão no RM. O
// DataServer trata qualquer campo ausente/divergente como "alteração não
// permitida" e aborta a inscrição (ex.: usuário do tipo funcionário). Por isso
// lemos a linha original do SPSUSUARIO e a repassamos verbatim ao modelo.

export interface ResponsavelVerbatimRM {
  codUsuarioPS: number;
  nome: string;
  sexo: string | null;
  /** yyyy-MM-dd (date-only, como o modelo espera). */
  dtNascimento: string | null;
  cpf: string | null;
  email: string | null;
  telefone1: string | null;
  telefone2: string | null;
  nacionalidade: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  idPais: number | null;
}

interface ResponsavelVerbatimRow {
  CODUSUARIOPS: number;
  NOME: string | null;
  SEXO: string | null;
  DTNASCIMENTO: Date | null;
  CPF: string | null;
  EMAIL: string | null;
  TELEFONE1: string | null;
  TELEFONE2: string | null;
  NACIONALIDADE: string | null;
  RUA: string | null;
  NUMERO: string | null;
  COMPLEMENTO: string | null;
  BAIRRO: string | null;
  CIDADE: string | null;
  ESTADO: string | null;
  CEP: string | null;
  IDPAIS: number | null;
}

/** Formata uma data do banco em yyyy-MM-dd (date-only). Usa componentes UTC para
 *  não deslocar o dia (mssql devolve datetime com useUTC; getters locais em fuso
 *  negativo retornariam o dia anterior). */
function dataIso(d: Date | null): string | null {
  if (!d) return null;
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

const str = (v: string | null | undefined) =>
  v == null ? null : String(v).trim() || null;

/**
 * Lê o responsável (SPSUSUARIO) por CODUSUARIOPS para reenvio VERBATIM na
 * NovaInscricao. Retorna null se não existir.
 */
export async function obterResponsavelVerbatim(
  codUsuarioPS: number,
): Promise<ResponsavelVerbatimRM | null> {
  const rows = await query<ResponsavelVerbatimRow>(
    `SELECT TOP 1 CODUSUARIOPS, NOME, SEXO, DTNASCIMENTO, CPF, EMAIL,
            TELEFONE1, TELEFONE2, NACIONALIDADE, RUA, NUMERO, COMPLEMENTO,
            BAIRRO, CIDADE, ESTADO, CEP, IDPAIS
     FROM SPSUSUARIO
     WHERE CODUSUARIOPS = @cod`,
    { cod: codUsuarioPS },
  );
  const r = rows[0];
  if (!r) return null;
  return {
    codUsuarioPS: r.CODUSUARIOPS,
    nome: str(r.NOME) ?? "",
    sexo: str(r.SEXO),
    dtNascimento: dataIso(r.DTNASCIMENTO),
    cpf: str(r.CPF),
    email: str(r.EMAIL),
    telefone1: str(r.TELEFONE1),
    telefone2: str(r.TELEFONE2),
    nacionalidade: str(r.NACIONALIDADE),
    rua: str(r.RUA),
    numero: str(r.NUMERO),
    complemento: str(r.COMPLEMENTO),
    bairro: str(r.BAIRRO),
    cidade: str(r.CIDADE),
    estado: str(r.ESTADO),
    cep: str(r.CEP),
    idPais: r.IDPAIS ?? null,
  };
}

/**
 * Nome VERBATIM já gravado no RM para um CPF (dígitos), quando a pessoa já
 * existe. Serve para candidato/responsável financeiro "novos" cujo CPF já tem
 * cadastro: o DataServer do EduPS trata pessoa existente como imutável e aborta
 * a inscrição ("o campo nome não pode ser alterado") se o NOME divergir — nem
 * que seja por acento/maiúscula/espaço. Reenviamos então o nome como está.
 * Havendo mais de um registro para o mesmo CPF, usa o mais recente.
 * Retorna null se o CPF ainda não existir.
 */
export async function obterNomeRmPorCpf(
  cpf: string,
): Promise<{ codUsuarioPS: number; nome: string } | null> {
  const digitos = (cpf || "").replace(/\D/g, "");
  if (digitos.length !== 11) return null;
  const rows = await query<{ CODUSUARIOPS: number; NOME: string | null }>(
    `SELECT TOP 1 CODUSUARIOPS, NOME
     FROM SPSUSUARIO
     WHERE CPF = @cpf AND NOME IS NOT NULL AND LTRIM(RTRIM(NOME)) <> ''
     ORDER BY RECCREATEDON DESC`,
    { cpf: digitos },
  );
  const r = rows[0];
  const nome = r?.NOME ?? "";
  if (!r || !nome.trim()) return null;
  return { codUsuarioPS: r.CODUSUARIOPS, nome };
}

// ---------------------------------------------------------------------------
// Elegibilidade à matrícula (candidatos aprovados/em chamada do responsável)
// ---------------------------------------------------------------------------
//
// Pré-filtro RÁPIDO (read-only) das inscrições do responsável que estão APROVADAS
// e com matrícula liberada no portal, do CICLO ATUAL. A fonte AUTORITATIVA em
// runtime continua sendo a WebAPI (ResultadoAreaInteresse/ParametrosMatricula):
// esta consulta apenas monta a lista inicial da página de matrícula, sem repetir a
// lógica de negócio no banco além do necessário. Espelha a estrutura de
// `listarDependentesDoResponsavel` (CTE resp/contas p/ reunir todas as contas da
// mesma pessoa), acrescentando os vínculos de elegibilidade:
//   SPSOPCAOINSCRITO.STATUS ∈ (5=EmChamada, 7=CompareceuChamada)  E
//   SPSAREAOFERTADA.DISPONIBILIZAMATRICULAPORTAL = 'T'.

export interface CandidatoElegivelMatricula {
  codUsuarioPS: number | null;
  nome: string;
  numeroInscricao: number | null;
  idps: number | null;
  /** Área de interesse ofertada (usada como `idAreaOfertada` na WebAPI de matrícula). */
  idAreaInteresse: number | null;
  /** Status da opção (5=EmChamada, 7=CompareceuChamada). */
  statusOpcao: number | null;
  nomeProcesso: string | null;
}

interface CandidatoElegivelRow {
  CODUSUARIOPS: number;
  NOME: string | null;
  NUMEROINSCRICAO: number | null;
  IDPS: number | null;
  IDAREAINTERESSE: number | null;
  STATUSOPCAO: number | null;
  PSNOME: string | null;
}

/**
 * Lista os candidatos (dependentes) do responsável logado que estão elegíveis à
 * matrícula pelo portal, restrito ao CICLO ATUAL (ano no NOME do PS, override por
 * `PS_ANO_ATUAL`). Recebe o CODUSUARIOPS do responsável (da sessão).
 */
export async function listarCandidatosElegiveisMatricula(
  codUsuarioPS: number,
): Promise<CandidatoElegivelMatricula[]> {
  const anoAtual = process.env.PS_ANO_ATUAL?.trim() || String(ANO_PROCESSO);
  const rows = await query<CandidatoElegivelRow>(
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
SELECT u.CODUSUARIOPS, u.NOME, i.NUMEROINSCRICAO, i.IDPS,
       o.IDAREAINTERESSE, o.STATUS AS STATUSOPCAO, ps.NOME AS PSNOME
  FROM SPSUSUARIOTIPORELAC r
  JOIN contas c ON c.CODUSUARIOPS = r.CODUSUARIOTIPORELAC
  JOIN SPSUSUARIO u ON u.CODUSUARIOPS = r.CODUSUARIOPS
  JOIN SPSINSCRICAOAREAOFERTADA i ON i.CODUSUARIOPS = r.CODUSUARIOPS
  JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA = i.CODCOLIGADA AND ps.IDPS = i.IDPS
  JOIN SPSOPCAOINSCRITO o ON o.NUMEROINSCRICAO = i.NUMEROINSCRICAO
       AND o.IDPS = i.IDPS AND o.CODCOLIGADA = i.CODCOLIGADA
  JOIN SPSAREAOFERTADA ao ON ao.CODCOLIGADA = o.CODCOLIGADA
       AND ao.IDPS = o.IDPS AND ao.IDAREAINTERESSE = o.IDAREAINTERESSE
 WHERE r.CODUSUARIOPS <> r.CODUSUARIOTIPORELAC
   AND ps.NOME LIKE @ano
   AND o.STATUS IN (5, 7)
   AND ao.DISPONIBILIZAMATRICULAPORTAL = 'T'
 ORDER BY i.NUMEROINSCRICAO`,
    { resp: codUsuarioPS, ano: `%${anoAtual}%` },
  );

  return rows.map((r) => ({
    codUsuarioPS: r.CODUSUARIOPS,
    nome: str(r.NOME) ?? "",
    numeroInscricao: r.NUMEROINSCRICAO ?? null,
    idps: r.IDPS ?? null,
    idAreaInteresse: r.IDAREAINTERESSE ?? null,
    statusOpcao: r.STATUSOPCAO ?? null,
    nomeProcesso: str(r.PSNOME),
  }));
}

// ---------------------------------------------------------------------------
// Conciliação de pagamento da taxa (job de sincronização com o RD Station CRM)
// ---------------------------------------------------------------------------

/** Inscrição do ciclo atual com a taxa PAGA (título FLAN baixado). */
export interface InscricaoPagaConciliar {
  numeroInscricao: number;
  idps: number;
  codColigada: number;
  nomeCandidato: string | null;
  /** Data da baixa do título (ISO) — quando a taxa foi paga. */
  dataPagamento: string | null;
  /** Contato do responsável pela inscrição (para o evento de Marketing). */
  emailResponsavel: string | null;
  nomeResponsavel: string | null;
}

interface InscricaoPagaRow {
  NUMEROINSCRICAO: number;
  IDPS: number;
  CODCOLIGADA: number;
  NOMECANDIDATO: string | null;
  DATABAIXA: Date | string | null;
  EMAILRESP: string | null;
  NOMERESP: string | null;
}

/**
 * Lista as inscrições do ciclo atual cuja taxa já foi PAGA (FLAN.STATUSLAN=1),
 * com o contato do responsável pela inscrição. Usada pelo job de conciliação
 * para avançar a negociação no RD Station CRM (etapa "Taxa paga") e disparar o
 * evento de Marketing "pagamento-confirmado".
 *
 * O ano do ciclo só existe no NOME do PS (não há coluna de período letivo) →
 * filtramos por ele; configurável por `PS_ANO_ATUAL` (default = ANO_PROCESSO).
 */
export async function listarInscricoesPagasParaConciliar(): Promise<
  InscricaoPagaConciliar[]
> {
  const anoAtual = process.env.PS_ANO_ATUAL?.trim() || String(ANO_PROCESSO);
  const rows = await query<InscricaoPagaRow>(
    `
SELECT i.NUMEROINSCRICAO, i.IDPS, i.CODCOLIGADA,
       u.NOME AS NOMECANDIDATO,
       fl.DATABAIXA,
       resp.NOME AS NOMERESP,
       resp.EMAIL AS EMAILRESP
  FROM SPSINSCRICAOAREAOFERTADA i
  JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA = i.CODCOLIGADA AND ps.IDPS = i.IDPS
  JOIN FLAN fl ON fl.CODCOLIGADA = i.CODCOLIGADALAN AND fl.IDLAN = i.IDLAN
       AND fl.STATUSLAN = 1
  JOIN SPSUSUARIO u ON u.CODUSUARIOPS = i.CODUSUARIOPS
  OUTER APPLY (
    SELECT TOP 1 ru.NOME, ru.EMAIL
      FROM SPSUSUARIOTIPORELAC r
      JOIN SPSUSUARIO ru ON ru.CODUSUARIOPS = r.CODUSUARIOTIPORELAC
     WHERE r.CODUSUARIOPS = i.CODUSUARIOPS
       AND r.TIPORELAC = 5
       AND r.CODUSUARIOPS <> r.CODUSUARIOTIPORELAC
       AND ru.EMAIL IS NOT NULL AND LTRIM(RTRIM(ru.EMAIL)) <> ''
     ORDER BY ru.CODUSUARIOPS DESC
  ) resp
 WHERE ps.NOME LIKE @ano
 ORDER BY i.NUMEROINSCRICAO`,
    { ano: `%${anoAtual}%` },
  );

  return rows.map((r) => ({
    numeroInscricao: r.NUMEROINSCRICAO,
    idps: r.IDPS,
    codColigada: r.CODCOLIGADA,
    nomeCandidato: r.NOMECANDIDATO?.trim() ?? null,
    dataPagamento: dataParaIso(r.DATABAIXA),
    emailResponsavel: r.EMAILRESP?.trim() || null,
    nomeResponsavel: r.NOMERESP?.trim() || null,
  }));
}

/** Converte data do mssql (Date ou string) em ISO, ou null. */
function dataParaIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
