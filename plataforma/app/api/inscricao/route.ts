import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { consumir } from "@/lib/rate-limit";
import { apenasDigitos, cpfValido } from "@/lib/cpf";
import {
  obterProcessoSeletivo,
  obterResponsavelVerbatim,
  obterResponsavelVerbatimPorCpf,
  obterNomeRmPorCpf,
  reconhecerResponsavelPorCpf,
  listarDocumentosExigidos,
} from "@/lib/totvs/queries";
import {
  criarInscricao,
  existeUsuario,
  montarModeloNovaInscricao,
  obterIdLanInscricao,
  type DadosCandidato,
  type DadosComplementares,
  type DocumentoInscricao,
  type OpcaoAreaInscricao,
  type ResponsavelParaModelo,
} from "@/lib/totvs/inscricao";
import { registrarEventoFunil } from "@/lib/marketing/rdstation";
import { extrairOrigem } from "@/lib/marketing/origem";
import { registrarNegociacaoInscricao } from "@/lib/marketing/rdcrm";
import {
  definirSenhaPSporCpf,
  lerEnvelopeSenhaPSporCpf,
  restaurarEnvelopeSenhaPSporCpf,
} from "@/lib/totvs/senha-ps";
import { loginResponsavel } from "@/lib/totvs/auth";
import {
  criarSessao,
  encerrarSessao,
  COOKIE_SESSAO,
} from "@/lib/totvs/session";

export const dynamic = "force-dynamic";

const COD_COLIGADA = Number(process.env.RM_COD_COLIGADA) || 1;
const LIMITE = 6;
const JANELA_MS = 60_000;

/** Normaliza um nome para COMPARAÇÃO (ignora acento, maiúsc./minúsc. e espaços
 *  repetidos/nas pontas). Serve só para decidir se avisamos o usuário; o nome
 *  ENVIADO ao RM continua sendo o verbatim gravado. */
function normalizarNomeParaComparar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** CPF em 000.000.000-00 (para mensagens de aviso). */
function formatarCpf(cpf: string): string {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Reconcilia o nome de uma pessoa que PODE já existir no RM (por CPF). Se
 * existir, o DataServer trata a pessoa como imutável: enviar um nome diferente
 * (até por acento/maiúscula/espaço) aborta a inscrição. Então reaproveitamos o
 * nome VERBATIM do RM. Só geramos aviso ao usuário quando a diferença é VISÍVEL
 * (após normalizar), para não assustar por divergências invisíveis.
 */
async function reconciliarNomePorCpf(
  cpf: string,
  nomeDigitado: string,
  rotulo: string,
): Promise<{ nome: string; aviso: string | null }> {
  const registro = await obterNomeRmPorCpf(cpf);
  if (!registro) return { nome: nomeDigitado, aviso: null };
  const nomeRm = registro.nome.trim();
  if (!nomeRm) return { nome: nomeDigitado, aviso: null };
  const diferencaVisivel =
    normalizarNomeParaComparar(nomeRm) !==
    normalizarNomeParaComparar(nomeDigitado);
  const aviso = diferencaVisivel
    ? `Já existe um cadastro para o CPF ${formatarCpf(cpf)} (${rotulo}) com o nome "${nomeRm}". ` +
      `Para não bloquear a inscrição, usamos esse nome. Se estiver incorreto, procure a secretaria.`
    : null;
  // Enviamos sempre o nome do RM (verbatim) quando a pessoa já existe.
  return { nome: nomeRm, aviso };
}

// Guard de ambiente: enquanto o BFF apontar para a base/WebAPI de PRODUÇÃO, a
// submissão final (única operação que GRAVA no RM) fica bloqueada. Só liberar
// quando RM_API_BASE apontar para a WebAPI de HOMOLOGAÇÃO. Falha segura: se a
// variável não estiver definida, assume-se somente leitura.
function somenteLeitura(): boolean {
  const v = (process.env.INSCRICAO_SOMENTE_LEITURA ?? "true")
    .trim()
    .toLowerCase();
  return (
    v !== "false" && v !== "0" && v !== "off" && v !== "nao" && v !== "não"
  );
}

// Só aceita inscrição em PS publicado no portal (EXIBENOPORTAL='T'), ativo
// (STATUS='T') e com inscrições abertas hoje. Como o IDPS agora vem da série
// escolhida pelo cliente (link único), o servidor revalida antes de gravar.
function processoInscritivel(ps: {
  status: string;
  exibeNoPortal: boolean;
  dtIniInscricao: Date | null;
  dtFimInscricao: Date | null;
}): boolean {
  if (!ps.exibeNoPortal || ps.status !== "T") return false;
  const agora = Date.now();
  const ini = ps.dtIniInscricao ? new Date(ps.dtIniInscricao).getTime() : null;
  const fim = ps.dtFimInscricao ? new Date(ps.dtFimInscricao).getTime() : null;
  if (ini !== null && agora < ini) return false;
  if (fim !== null && agora > fim) return false;
  return true;
}

/** Dados do responsável NOVO (cadastro anônimo): define a própria senha do PS. */
interface DadosNovo {
  cpf?: string;
  nome?: string;
  email?: string;
  celular?: string | null;
  senha?: string;
  /** Endereço/identidade do responsável novo (necessário no SPSUSUARIO). */
  sexo?: string | null;
  dataNascimento?: string | null;
  nacionalidade?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}

/**
 * Responsável FINANCEIRO (opcional). Quando `outraPessoa` é verdadeiro, a taxa
 * de inscrição é emitida em nome desta pessoa (3º registro SPSUSUARIO). Caso
 * contrário, o próprio responsável de inscrição é o financeiro.
 */
interface DadosRespFinanceiro {
  outraPessoa?: boolean;
  cpf?: string;
  nome?: string;
  email?: string;
  celular?: string | null;
  sexo?: string | null;
  dataNascimento?: string | null;
  nacionalidade?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}

interface Body {
  candidato?: Partial<DadosCandidato>;
  complementares?: Partial<DadosComplementares>;
  opcao?: Partial<OpcaoAreaInscricao>;
  segmento?: string;
  /** NOVO (anônimo): processo seletivo escolhido. */
  idps?: number;
  /** NOVO (anônimo): responsável + senha. Ausente quando há sessão. */
  novo?: DadosNovo;
  /** Responsável financeiro distinto (opcional). */
  respFinanceiro?: DadosRespFinanceiro;
  /**
   * E-mail de contato do responsável (editável nos dois fluxos). Usado APENAS
   * para o funil RD Station/CRM desta inscrição — NÃO altera a identidade nem o
   * registro do responsável no RM (logado permanece verbatim).
   */
  emailResponsavel?: string;
  /**
   * Celular de contato do responsável (obrigatório na revisão). Usado para o
   * funil RD Station/CRM. No fluxo NOVO o celular do RM vem de `novo.celular`.
   */
  celularResponsavel?: string | null;
  /**
   * Relação do responsável pela inscrição com o candidato: "P" (pai), "M" (mãe)
   * ou "O" (outro). Apenas Pai/Mãe são representáveis na NovaInscricao (flags
   * EHPAI/EHMAE); "Outro" NÃO é gravado no RM, mas é enviado ao RD Station
   * (marketing/CRM) como dado de perfil do lead.
   */
  relacaoResponsavel?: string;
  /**
   * Documentos exigidos anexados. Cada item é um PDF em base64 PURO (sem o
   * prefixo `data:...;base64,`). O servidor revalida contra a lista exigida do
   * PS/área antes de gravar (a obrigatoriedade é autoritativa no backend).
   */
  documentos?: Array<{
    codDocumento?: number;
    nomeArquivo?: string;
    arquivoBase64?: string;
  }>;
}

const SN1 = new Set(["1", "2"]);

/** Valida os campos complementares obrigatórios do PS. */
function complementaresValidos(
  c: Partial<DadosComplementares> | undefined,
): c is DadosComplementares {
  if (!c) return false;
  // Irmão gemelar (IG="1"): exige nome e um CPF válido do irmão.
  if (String(c.irmaoGemeo) === "1") {
    if (
      typeof c.irmaoNome !== "string" ||
      c.irmaoNome.trim().length < 2 ||
      !cpfValido(String(c.irmaoCpf ?? ""))
    ) {
      return false;
    }
  }
  // Grupo "irmão de aluno matriculado" (GRP1A): exige nome e matrícula do irmão.
  if (String(c.grupo) === "GRP1A") {
    if (
      typeof c.irmaoMatriculadoNome !== "string" ||
      c.irmaoMatriculadoNome.trim().length < 2 ||
      typeof c.irmaoMatricula !== "string" ||
      c.irmaoMatricula.trim().length < 1
    ) {
      return false;
    }
  }
  return (
    typeof c.colegioAtual === "string" &&
    c.colegioAtual.trim().length > 0 &&
    typeof c.cursoSerie === "string" &&
    c.cursoSerie.length > 0 &&
    typeof c.grupo === "string" &&
    c.grupo.length > 0 &&
    SN1.has(String(c.irmaoGemeo)) &&
    SN1.has(String(c.maeFalecida)) &&
    SN1.has(String(c.maeMora)) &&
    SN1.has(String(c.paiFalecido)) &&
    SN1.has(String(c.paiMora)) &&
    SN1.has(String(c.necessidadeEspecial))
  );
}

/** Valida o endereço do candidato. */
function enderecoCandidatoValido(
  c: Partial<DadosCandidato> | undefined,
): boolean {
  const e = c?.endereco;
  if (!e) return false;
  return (
    !!e.rua?.trim() &&
    !!e.numero?.trim() &&
    !!e.bairro?.trim() &&
    !!e.cidade?.trim() &&
    !!e.estado?.trim() &&
    !!e.cep?.trim()
  );
}

/**
 * Valida uma data de nascimento no formato yyyy-MM-dd garantindo que o ano
 * esteja num intervalo plausível. Datas antes de 1900 estouram o range do
 * SQL Server (datetime mínimo 1753-01-01) e provocam erro 500 na NovaInscricao.
 */
function dataNascimentoValida(iso: string | null | undefined): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const ano = Number(iso.slice(0, 4));
  return ano >= 1900 && ano <= new Date().getFullYear();
}

function ipDe(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}

// Limites do upload de documentos. Base64 infla ~33%; o limite abaixo é sobre os
// BYTES DECODIFICADOS. Manter em sincronia com o client (WizardInscricao) e com o
// `client_max_body_size` do Nginx na VM (precisa comportar vários docs + o payload).
const MAX_ARQUIVO_BYTES = 5 * 1024 * 1024; // 5 MB por arquivo
const MAX_DOCS = 30;
const RE_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

interface DocumentoValidado {
  codDocumento: number;
  nomeArquivo: string;
  arquivoBase64: string;
}

/**
 * Valida os documentos enviados contra a lista exigida (autoritativa) do PS/área:
 * - só aceita CODDOCUMENTO presente na configuração (EXIGEINSCRICAO='T');
 * - exige que TODO documento OBRIGATORIO tenha arquivo;
 * - checa base64 válido, assinatura %PDF e tamanho máximo por arquivo.
 * A `DESCRICAO` (DETALHE) vem SEMPRE da configuração, nunca do cliente.
 */
async function validarDocumentos(
  idps: number,
  idAreaInteresse: number,
  enviados: Body["documentos"],
): Promise<
  | { ok: true; documentos: DocumentoInscricao[] }
  | { ok: false; erro: string; mensagem?: string }
> {
  const exigidos = await listarDocumentosExigidos(idps, idAreaInteresse);
  const porCodigo = new Map(exigidos.map((d) => [d.codDocumento, d]));

  const lista = Array.isArray(enviados) ? enviados : [];
  if (lista.length > MAX_DOCS) {
    return { ok: false, erro: "documentos-invalidos" };
  }

  const validados: DocumentoValidado[] = [];
  for (const d of lista) {
    const cod = Number(d?.codDocumento);
    const nome = (d?.nomeArquivo ?? "").trim();
    const b64 = (d?.arquivoBase64 ?? "").trim();
    if (!Number.isInteger(cod) || !nome || !b64) continue; // ignora item vazio
    // Só aceita documentos realmente exigidos neste PS/área.
    if (!porCodigo.has(cod)) {
      return { ok: false, erro: "documento-nao-exigido" };
    }
    if (!RE_BASE64.test(b64)) {
      return { ok: false, erro: "documentos-invalidos" };
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(b64, "base64");
    } catch {
      return { ok: false, erro: "documentos-invalidos" };
    }
    if (bytes.length === 0 || bytes.length > MAX_ARQUIVO_BYTES) {
      return {
        ok: false,
        erro: "documento-grande",
        mensagem: "Cada arquivo deve ser um PDF de até 5 MB.",
      };
    }
    // Assinatura %PDF (25 50 44 46) — evita upload de outros tipos de arquivo.
    if (
      bytes[0] !== 0x25 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x44 ||
      bytes[3] !== 0x46
    ) {
      return {
        ok: false,
        erro: "documento-formato",
        mensagem: "Envie os documentos em formato PDF.",
      };
    }
    validados.push({
      codDocumento: cod,
      nomeArquivo: nome,
      arquivoBase64: b64,
    });
  }

  // Todo documento OBRIGATORIO precisa ter arquivo.
  const enviadosCod = new Set(validados.map((v) => v.codDocumento));
  const faltando = exigidos.filter(
    (d) => d.obrigatorio && !enviadosCod.has(d.codDocumento),
  );
  if (faltando.length > 0) {
    return {
      ok: false,
      erro: "documentos-obrigatorios",
      mensagem: `Anexe os documentos obrigatórios: ${faltando
        .map((d) => d.descricao)
        .join(", ")}.`,
    };
  }

  const documentos: DocumentoInscricao[] = validados.map((v) => {
    const exig = porCodigo.get(v.codDocumento)!;
    return {
      codDocumento: v.codDocumento,
      // DETALHE gravado no RM = DESCRICAO do catálogo (SDOCUMENTO) verbatim,
      // exatamente como o portal nativo envia. O RM resolve o CODDOCUMENTO do
      // arquivo casando este DETALHE com SDOCUMENTO.DESCRICAO; qualquer prefixo
      // extra (ex.: "(*)") quebra o casamento e o RM grava CODDOCUMENTO=1
      // (Ficha cadastral). NÃO prefixar nada — a "(*)" de alguns itens já vem
      // embutida na própria DESCRICAO do catálogo.
      descricao: exig.descricao,
      nomeArquivo: v.nomeArquivo,
      arquivoBase64: v.arquivoBase64,
    };
  });
  return { ok: true, documentos };
}

// BFF — submissão da inscrição (escrita no RM via EduPS). Exige sessão. A
// identidade do responsável (CODUSUARIOPS) vem SEMPRE da sessão, nunca do cliente.
export async function POST(req: NextRequest) {
  const sidAtual = req.cookies.get(COOKIE_SESSAO)?.value;
  let sessao = sessaoDaRequisicao(req);

  if (somenteLeitura()) {
    return NextResponse.json(
      {
        ok: false,
        erro: "somente-leitura",
        mensagem:
          "Ambiente em modo somente leitura: a submissão está desativada enquanto o sistema aponta para a base de produção.",
      },
      { status: 503 },
    );
  }

  const limite = consumir(`inscricao:${ipDe(req)}`, LIMITE, JANELA_MS);
  if (!limite.permitido) {
    const retryAfter = Math.ceil((limite.reiniciaEm - Date.now()) / 1000);
    return NextResponse.json(
      { ok: false, erro: "muitas-tentativas" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, erro: "payload-invalido" },
      { status: 400 },
    );
  }

  // Dois modos: responsável já logado (sessão) ou cadastro NOVO anônimo (define a
  // própria senha). A NovaInscricao da EduPS não exige sessão; para o NOVO criamos
  // a inscrição anônima, gravamos a senha do PS e fazemos auto-login em seguida.
  const novo = body.novo;
  // Cookie de sessão obsoleto: se o cliente envia `novo` (cadastro de um NOVO
  // responsável) mas ainda há uma sessão ativa no browser (ex.: outro responsável
  // que não fez logout), NÃO podemos usar a sessão — senão o candidato seria
  // atribuído ao responsável logado, misturando identidades. Encerramos a sessão
  // obsoleta e seguimos o fluxo NOVO (o auto-login ao final emite um cookie novo).
  if (novo && sessao) {
    encerrarSessao(sidAtual);
    sessao = null;
  }
  const ehNovo = !sessao && !!novo;
  if (!sessao && !ehNovo) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const { candidato, complementares, opcao } = body ?? {};
  if (
    !candidato?.nome ||
    !candidato.sexo ||
    !dataNascimentoValida(candidato.dataNascimento) ||
    !candidato.cpf ||
    !cpfValido(candidato.cpf) ||
    !candidato.nacionalidade ||
    !enderecoCandidatoValido(candidato) ||
    !complementaresValidos(complementares) ||
    !opcao?.areaInteresseId
  ) {
    return NextResponse.json(
      { ok: false, erro: "campos-obrigatorios" },
      { status: 400 },
    );
  }

  // Relação do responsável de inscrição com o candidato. "P"/"M" são gravados no
  // RM (flags EHPAI/EHMAE). "O" (outro) NÃO é representável no RM — vira null no
  // modelo — mas é preservado para enviar ao RD Station (marketing/CRM).
  const relacaoInformada: "P" | "M" | "O" | null =
    body.relacaoResponsavel === "P" ||
    body.relacaoResponsavel === "M" ||
    body.relacaoResponsavel === "O"
      ? body.relacaoResponsavel
      : null;
  if (relacaoInformada === null) {
    return NextResponse.json(
      { ok: false, erro: "relacao-responsavel-invalida" },
      { status: 400 },
    );
  }
  // Para o RM: só Pai/Mãe existem (EHPAI/EHMAE). "Outro" → null (sem vínculo).
  const relacaoResp: "P" | "M" | null =
    relacaoInformada === "O" ? null : relacaoInformada;

  // Identidade do responsável e processo: da sessão (logado) ou do corpo (NOVO).
  let idps: number;
  let codUsuarioPS: number | null;
  let rmCookie: string;

  if (sessao) {
    // Logado: o IDPS vem da série escolhida no wizard (link único, sem segmento).
    // A identidade do responsável (CODUSUARIOPS) continua vindo SEMPRE da sessão.
    if (!Number.isInteger(body.idps) || (body.idps ?? 0) <= 0) {
      return NextResponse.json(
        { ok: false, erro: "campos-obrigatorios" },
        { status: 400 },
      );
    }
    idps = body.idps!;
    codUsuarioPS = sessao.codUsuarioPS;
    rmCookie = sessao.rmCookie;
  } else {
    // NOVO anônimo: valida responsável + senha + processo escolhido.
    if (
      !novo!.cpf ||
      !cpfValido(novo!.cpf) ||
      !novo!.nome ||
      !novo!.email ||
      !/.+@.+\..+/.test(novo!.email) ||
      !dataNascimentoValida(novo!.dataNascimento) ||
      !novo!.celular ||
      apenasDigitos(novo!.celular).length < 10 ||
      !novo!.senha ||
      novo!.senha.length < 6 ||
      !Number.isInteger(body.idps) ||
      (body.idps ?? 0) <= 0
    ) {
      return NextResponse.json(
        { ok: false, erro: "campos-obrigatorios" },
        { status: 400 },
      );
    }
    idps = body.idps!;
    codUsuarioPS = null;
    rmCookie = ""; // anônimo
  }

  try {
    // Guard do cadastro NOVO (anônimo): um CPF que JÁ tem conta no PS com senha é
    // um usuário que RETORNA, não um cadastro do zero. O fluxo anônimo não pode
    // recadastrá-lo — isso reescreveria a senha existente (definirSenhaPSporCpf faz
    // UPDATE em TODAS as contas do CPF) e quebraria o login no nosso portal e no da
    // TOTVS; além de ser account takeover (reset de senha sem validar credencial).
    // Ele deve autenticar-se; o fluxo logado nunca toca na senha do responsável.
    if (ehNovo) {
      const jaExiste = await reconhecerResponsavelPorCpf(novo!.cpf!);
      if (jaExiste.existe && jaExiste.temSenhaCadastrada) {
        return NextResponse.json(
          { ok: false, erro: "conta-existente" },
          { status: 409 },
        );
      }
    }

    const ps = await obterProcessoSeletivo(idps);
    if (!ps || !processoInscritivel(ps)) {
      return NextResponse.json(
        { ok: false, erro: "ps-indisponivel" },
        { status: 409 },
      );
    }

    const ctx = {
      codColigada: COD_COLIGADA,
      idps,
      valorInscricao: ps.valorInscricao,
      nomeProcesso: ps.nome,
      codUsuarioPS,
    };

    const dadosCandidato: DadosCandidato = {
      nome: candidato.nome,
      sexo: candidato.sexo,
      dataNascimento: candidato.dataNascimento!,
      cpf: apenasDigitos(candidato.cpf),
      email: candidato.email ?? null,
      telefone: candidato.telefone ? apenasDigitos(candidato.telefone) : null,
      nacionalidade: candidato.nacionalidade,
      endereco: {
        rua: candidato.endereco!.rua,
        numero: candidato.endereco!.numero,
        complemento: candidato.endereco!.complemento ?? null,
        bairro: candidato.endereco!.bairro,
        cidade: candidato.endereco!.cidade,
        estado: candidato.endereco!.estado,
        cep: candidato.endereco!.cep,
        idPais: candidato.endereco!.idPais || 1,
      },
    };

    // Avisos não-bloqueantes devolvidos ao wizard (ex.: nome reaproveitado do RM).
    const avisos: string[] = [];

    // Candidato: se o CPF já existe no RM, o nome é imutável no DataServer.
    // Reaproveitamos o nome gravado (verbatim) e avisamos se houver diferença
    // visível em relação ao digitado.
    {
      const rec = await reconciliarNomePorCpf(
        dadosCandidato.cpf ?? "",
        dadosCandidato.nome,
        "candidato",
      );
      dadosCandidato.nome = rec.nome;
      if (rec.aviso) avisos.push(rec.aviso);
    }

    // Responsável para o modelo: VERBATIM do RM quando logado (qualquer divergência
    // é tratada como "alteração não permitida"); dados digitados quando NOVO.
    let responsavelModelo: ResponsavelParaModelo;
    if (sessao) {
      if (codUsuarioPS == null) {
        return NextResponse.json(
          { ok: false, erro: "responsavel-indisponivel" },
          { status: 409 },
        );
      }
      const verbatim = await obterResponsavelVerbatim(codUsuarioPS);
      if (!verbatim) {
        return NextResponse.json(
          { ok: false, erro: "responsavel-indisponivel" },
          { status: 409 },
        );
      }
      responsavelModelo = { ...verbatim, relacaoComCandidato: relacaoResp };
    } else {
      responsavelModelo = {
        codUsuarioPS: null,
        nome: novo!.nome!,
        sexo: novo!.sexo ?? null,
        dtNascimento: novo!.dataNascimento ?? null,
        cpf: apenasDigitos(novo!.cpf!),
        email: novo!.email!,
        // O telefone residencial caiu em desuso: coletamos apenas o celular
        // (obrigatório) e o gravamos como celular (TELEFONE2) e também como
        // residencial (TELEFONE1), que é o campo exigido pelo RM (TelefoneResidencial).
        telefone1: apenasDigitos(novo!.celular!),
        telefone2: apenasDigitos(novo!.celular!),
        nacionalidade: novo!.nacionalidade ?? "10",
        // O RM exige endereço (Estado etc.) para criar o cliente/fornecedor do
        // responsável. O wizard não coleta endereço do responsável no fluxo novo;
        // reaproveitamos o do candidato (mesma residência), como o próprio portal
        // faz via "copiar endereço do candidato".
        rua: novo!.rua ?? dadosCandidato.endereco.rua,
        numero: novo!.numero ?? dadosCandidato.endereco.numero,
        complemento:
          novo!.complemento ?? dadosCandidato.endereco.complemento ?? null,
        bairro: novo!.bairro ?? dadosCandidato.endereco.bairro,
        cidade: novo!.cidade ?? dadosCandidato.endereco.cidade,
        estado: novo!.estado ?? dadosCandidato.endereco.estado,
        cep: novo!.cep ?? dadosCandidato.endereco.cep,
        idPais: dadosCandidato.endereco.idPais || 1,
        relacaoComCandidato: relacaoResp,
      };
    }

    // Responsável NOVO: mesmo racional do candidato. Se o CPF já existe no RM
    // (sem senha — senão o guard acima já teria barrado), reaproveita o nome
    // verbatim para não colidir com a imutabilidade do DataServer.
    if (!sessao) {
      const rec = await reconciliarNomePorCpf(
        responsavelModelo.cpf ?? "",
        responsavelModelo.nome,
        "responsável",
      );
      responsavelModelo.nome = rec.nome;
      if (rec.aviso) avisos.push(rec.aviso);
    }

    // Pré-checagem de duplicidade (UX). O bloqueio autoritativo é da EduPS.
    const dup = await existeUsuario(rmCookie, ctx, {
      nome: dadosCandidato.nome,
      dataNascimento: dadosCandidato.dataNascimento,
      cpf: dadosCandidato.cpf,
      email: dadosCandidato.email,
    });
    if (dup.bloqueia) {
      return NextResponse.json(
        { ok: false, erro: "ja-inscrito", mensagem: dup.mensagem },
        { status: 409 },
      );
    }

    const opcaoArea: OpcaoAreaInscricao = {
      areaInteresseId: opcao.areaInteresseId,
      numeroOpcao: opcao.numeroOpcao ?? 1,
    };

    // Documentos exigidos: valida contra a configuração do PS/área (autoritativa).
    // Exige os obrigatórios, checa base64/PDF/tamanho e usa a DESCRICAO do banco.
    const docsValidados = await validarDocumentos(
      idps,
      opcaoArea.areaInteresseId,
      body.documentos,
    );
    if (!docsValidados.ok) {
      return NextResponse.json(
        {
          ok: false,
          erro: docsValidados.erro,
          mensagem: docsValidados.mensagem,
        },
        { status: 400 },
      );
    }
    const documentos = docsValidados.documentos;

    // Responsável financeiro distinto (opcional): quando o cliente indica "outra
    // pessoa", monta um 3º registro (RF). A cobrança da taxa é emitida em nome
    // dele. Sem isso, o próprio responsável de inscrição é o financeiro.
    let respFinanceiroModelo: ResponsavelParaModelo | null = null;
    const rf = body.respFinanceiro;
    if (rf?.outraPessoa) {
      const cpfRfDigitos = apenasDigitos(rf.cpf ?? "");
      const cpfRespInscDigitos = apenasDigitos(responsavelModelo.cpf ?? "");

      // Guard: o responsável de inscrição informou o PRÓPRIO CPF em "outra
      // pessoa". Ele já é o financeiro por padrão (1ª opção "sou eu"); criar um
      // 3º registro com a mesma pessoa colidiria com o cadastro dela no RM
      // ("o campo nome não pode ser alterado"). Descartamos os dados repetidos,
      // mantemos ele como financeiro e avisamos para usar a opção correta.
      if (cpfRfDigitos && cpfRfDigitos === cpfRespInscDigitos) {
        avisos.push(
          `O CPF ${formatarCpf(cpfRfDigitos)} informado como responsável ` +
            `financeiro em "outra pessoa" é o seu próprio. Mantivemos você ` +
            `como responsável financeiro (opção "sou eu") e descartamos os ` +
            `dados duplicados.`,
        );
        // respFinanceiroModelo permanece null → o próprio responsável de
        // inscrição é o financeiro (EHRESPFIN do responsável = "T").
      } else {
        if (
          !rf.cpf ||
          !cpfValido(rf.cpf) ||
          !rf.nome ||
          rf.nome.trim().length < 2 ||
          !dataNascimentoValida(rf.dataNascimento) ||
          !rf.email ||
          !/.+@.+\..+/.test(rf.email) ||
          !rf.celular ||
          apenasDigitos(rf.celular).length < 10 ||
          !rf.rua ||
          !rf.numero ||
          !rf.bairro ||
          !rf.cidade ||
          !rf.estado ||
          !rf.cep ||
          apenasDigitos(rf.cep).length !== 8
        ) {
          return NextResponse.json(
            { ok: false, erro: "resp-financeiro-invalido" },
            { status: 400 },
          );
        }

        // Cobertura completa: o "outra pessoa" pode ser alguém JÁ cadastrado no
        // RM. Se o CPF existe, reenviamos TODOS os dados VERBATIM (não só o
        // nome) e referenciamos o CODUSUARIOPS existente — evitando o erro
        // "o campo nome não pode ser alterado", que dispara quando QUALQUER
        // campo diverge do gravado (inclusive um simples espaço à direita).
        const verbatimRf = await obterResponsavelVerbatimPorCpf(cpfRfDigitos);
        if (verbatimRf) {
          respFinanceiroModelo = { ...verbatimRf, relacaoComCandidato: null };
          // Avisa se o nome digitado difere visivelmente do gravado (mantemos o
          // do RM, que é imutável no DataServer).
          if (
            normalizarNomeParaComparar(rf.nome.trim()) !==
            normalizarNomeParaComparar(verbatimRf.nome)
          ) {
            avisos.push(
              `Encontramos um cadastro para o CPF ${formatarCpf(cpfRfDigitos)} ` +
                `(responsável financeiro) com o nome "${verbatimRf.nome.trim()}". ` +
                `Mantivemos o nome já cadastrado.`,
            );
          }
        } else {
          // Pessoa nova: usa os dados digitados.
          respFinanceiroModelo = {
            codUsuarioPS: null,
            nome: rf.nome.trim(),
            sexo: rf.sexo ?? null,
            dtNascimento: rf.dataNascimento ?? null,
            cpf: apenasDigitos(rf.cpf),
            email: rf.email.trim(),
            // Mesmo racional do responsável: só celular, replicado no residencial
            // (TELEFONE1) para satisfazer o campo obrigatório do RM.
            telefone1: apenasDigitos(rf.celular!),
            telefone2: apenasDigitos(rf.celular!),
            nacionalidade: rf.nacionalidade ?? "10",
            rua: rf.rua.trim(),
            numero: rf.numero.trim(),
            complemento: rf.complemento?.trim() || null,
            bairro: rf.bairro.trim(),
            cidade: rf.cidade.trim(),
            estado: rf.estado,
            cep: apenasDigitos(rf.cep),
            idPais: 1,
            // Responsável financeiro não carrega grau de parentesco na inscrição.
            relacaoComCandidato: null,
          };
        }
      }
    }

    const model = montarModeloNovaInscricao(
      ctx,
      dadosCandidato,
      complementares,
      opcaoArea,
      responsavelModelo,
      respFinanceiroModelo,
      ehNovo ? novo!.senha! : null,
      documentos,
    );

    // Blindagem da senha (NovaInscricao REGRAVA SPSUSUARIO.SENHA de usuários já
    // existentes mesmo sem enviarmos senha no payload, corrompendo o login de
    // quem já depende dela). Capturamos o envelope atual de CADA usuário
    // EXISTENTE referenciado ANTES e restauramos DEPOIS. Isso cobre o
    // responsável de inscrição (logado) e o responsável financeiro "outra
    // pessoa" quando este já tem cadastro (codUsuarioPS != null). Não blindamos
    // o CPF do cadastro NOVO: ele define a própria senha logo após.
    const cpfsBlindar = new Set<string>();
    if (sessao) cpfsBlindar.add(apenasDigitos(responsavelModelo.cpf ?? ""));
    if (respFinanceiroModelo?.codUsuarioPS != null) {
      cpfsBlindar.add(apenasDigitos(respFinanceiroModelo.cpf ?? ""));
    }
    cpfsBlindar.delete("");
    if (ehNovo) cpfsBlindar.delete(apenasDigitos(novo!.cpf ?? ""));

    const envelopesSenhaAntes = new Map<string, string>();
    for (const cpfBl of cpfsBlindar) {
      const envelope = await lerEnvelopeSenhaPSporCpf(cpfBl);
      if (envelope) envelopesSenhaAntes.set(cpfBl, envelope);
    }

    const resultado = await criarInscricao(rmCookie, model);

    for (const [cpfBl, envelopeAntes] of envelopesSenhaAntes) {
      const envelopeDepois = await lerEnvelopeSenhaPSporCpf(cpfBl);
      if (envelopeDepois !== envelopeAntes) {
        await restaurarEnvelopeSenhaPSporCpf(cpfBl, envelopeAntes);
      }
    }

    if (!resultado.ok) {
      const mensagem =
        typeof resultado.bruto === "string" ? resultado.bruto : null;
      return NextResponse.json(
        {
          ok: false,
          erro: "falha-inscricao",
          mensagem,
          detalhe: resultado.bruto,
        },
        { status: 422 },
      );
    }

    // NOVO: grava a senha do PS (envelope direto) e faz auto-login do responsável.
    let sid: string | null = null;
    if (ehNovo) {
      await definirSenhaPSporCpf(apenasDigitos(novo!.cpf!), novo!.senha!);
      const login = await loginResponsavel({
        cpf: apenasDigitos(novo!.cpf!),
        senha: novo!.senha!,
        idps,
      });
      if (login.logado && login.rmCookie) {
        sid = criarSessao({
          rmCookie: login.rmCookie,
          credenciais: { cpf: apenasDigitos(novo!.cpf!), senha: novo!.senha! },
          codUsuarioPS: login.codUsuarioPS,
          idps,
        });
      }

      // Evento de funil — NOVO responsável cadastrado (1ª inscrição). Distingue,
      // no RD, quem se cadastra pela 1ª vez de quem retorna (login-responsavel).
      // Server-side e não-bloqueante.
      if (novo!.email) {
        const origemNovo = extrairOrigem(req);
        void registrarEventoFunil({
          etapa: "cadastro-novo-responsavel",
          email: novo!.email,
          nome: novo!.nome,
          telefone: novo!.celular ? apenasDigitos(novo!.celular) : null,
          idps,
          clientTrackingId: origemNovo.clientTrackingId,
          trafficSource: origemNovo.trafficSource,
          trafficMedium: origemNovo.trafficMedium,
          trafficCampaign: origemNovo.trafficCampaign,
        });
      }
    }

    // Evento de funil — inscrição enviada (checkout iniciado, se houver boleto).
    // E-mail de contato: o editável do cliente (validado) tem prioridade; senão,
    // cai para o e-mail do responsável (verbatim no logado / cadastro no novo).
    // Isto afeta APENAS RD Station/CRM — a identidade continua vindo da sessão.
    const emailInformado =
      typeof body.emailResponsavel === "string" &&
      /.+@.+\..+/.test(body.emailResponsavel.trim())
        ? body.emailResponsavel.trim()
        : null;
    const emailContato =
      emailInformado ?? responsavelModelo.email ?? dadosCandidato.email;
    // Celular de contato: o confirmado na revisão tem prioridade; senão, o
    // telefone do responsável no modelo (RM). Só alimenta RD Station/CRM.
    const celularInformado =
      typeof body.celularResponsavel === "string" &&
      apenasDigitos(body.celularResponsavel).length >= 10
        ? apenasDigitos(body.celularResponsavel)
        : null;
    const telefoneContato =
      celularInformado ??
      responsavelModelo.telefone1 ??
      responsavelModelo.telefone2 ??
      null;
    // Perfil do lead para marketing/CRM (RD Station), calculado UMA vez e usado
    // no evento de funil (Marketing) E na negociação (CRM):
    // - relação responsável↔candidato (pai/mãe/outro); "outro" = sem vínculo
    //   pai/mãe no RM, mas relevante para segmentação/atendimento.
    // - responsável FINANCEIRO distinto (outra pessoa paga a taxa) + os dados
    //   dele (nome/e-mail/telefone), quando informado.
    const rotuloRelacao =
      relacaoInformada === "P"
        ? "pai"
        : relacaoInformada === "M"
          ? "mae"
          : "outro";
    const respFinanceiroDistinto = body.respFinanceiro?.outraPessoa === true;
    const rfNome = respFinanceiroModelo?.nome ?? null;
    const rfEmail = respFinanceiroModelo?.email ?? null;
    const rfTelefone =
      respFinanceiroModelo?.telefone1 ??
      respFinanceiroModelo?.telefone2 ??
      null;
    // IDLAN da taxa (chave de reconciliação de pagamento no CRM). Lido por SQL
    // logo após a inscrição, independentemente de cookie (serve fluxo logado e
    // cadastro novo). Não-crítico: se falhar/ainda não existir, segue como null.
    let idLanTaxa: number | null = null;
    if (resultado.numeroInscricao != null) {
      try {
        const vinc = await obterIdLanInscricao({
          codColigada: ctx.codColigada,
          idps,
          numeroInscricao: resultado.numeroInscricao,
        });
        idLanTaxa = vinc?.idLan ?? null;
      } catch {
        idLanTaxa = null;
      }
    }
    if (emailContato) {
      const origem = extrairOrigem(req);
      void registrarEventoFunil({
        etapa: "boleto-gerado",
        email: emailContato,
        nome: responsavelModelo.nome,
        telefone: telefoneContato,
        segmento: body.segmento,
        idps,
        clientTrackingId: origem.clientTrackingId,
        trafficSource: origem.trafficSource,
        trafficMedium: origem.trafficMedium,
        trafficCampaign: origem.trafficCampaign,
        camposExtras: {
          cf_numero_inscricao: resultado.numeroInscricao ?? "",
          cf_valor_taxa: ctx.valorInscricao,
          cf_nome_candidato: dadosCandidato.nome ?? "",
          cf_processo_seletivo: ctx.nomeProcesso ?? "",
          // Reaproveita o campo PADRÃO da conta RD "Course of interest"
          // (cf_course_of_interest): mapeado do nome do PS (curso/ano-série).
          // Permite segmentar por interesse usando um campo que o RD já conhece.
          cf_course_of_interest: ctx.nomeProcesso ?? "",
          cf_relacao_responsavel: rotuloRelacao,
          cf_responsavel_financeiro_distinto: respFinanceiroDistinto
            ? "sim"
            : "nao",
          // Dados do responsável financeiro quando é OUTRA pessoa. Campos vazios
          // são descartados por normalizarCamposCustom (rdstation.ts).
          ...(respFinanceiroDistinto
            ? {
                cf_nome_responsavel_financeiro: rfNome ?? "",
                cf_email_responsavel_financeiro: rfEmail ?? "",
                cf_telefone_responsavel_financeiro: rfTelefone ?? "",
              }
            : {}),
        },
      });
    }

    // CRM — negociação no funil de admissão (não-bloqueante, stub sem RD_CRM_TOKEN).
    void registrarNegociacaoInscricao({
      numeroInscricao: resultado.numeroInscricao,
      nomeResponsavel: responsavelModelo.nome,
      emailResponsavel: emailContato,
      telefoneResponsavel: telefoneContato,
      nomeCandidato: dadosCandidato.nome,
      segmento: body.segmento,
      processoSeletivo: ctx.nomeProcesso,
      valor: ctx.valorInscricao,
      idps,
      relacaoResponsavel: rotuloRelacao,
      respFinanceiroDistinto,
      respFinanceiroNome: rfNome,
      respFinanceiroEmail: rfEmail,
      respFinanceiroTelefone: rfTelefone,
      idLan: idLanTaxa,
    });

    const res = NextResponse.json({
      ok: true,
      numeroInscricao: resultado.numeroInscricao,
      mostrarBoleto: resultado.mostrarBoleto,
      ra: resultado.ra,
      ...(avisos.length ? { avisos } : {}),
      ...(ehNovo ? { logado: sid != null } : {}),
    });
    if (sid) {
      res.cookies.set(COOKIE_SESSAO, sid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 60,
      });
    }
    return res;
  } catch (e) {
    console.error("[inscricao] falha ao submeter:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
