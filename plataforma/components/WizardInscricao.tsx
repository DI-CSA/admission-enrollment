"use client";

import { useEffect, useState } from "react";
import { CpfInput } from "@/components/CpfInput";
import { cpfValido } from "@/lib/cpf";
import { formatarTelefone } from "@/lib/telefone";
import { ANO_PROCESSO } from "@/lib/processos";

type Etapa =
  | "candidato"
  | "complemento"
  | "area"
  | "documentos"
  | "respfin"
  | "revisao"
  | "enviando"
  | "resultado";

interface AreaItem {
  // IDPS de origem: cada série pertence a um PS (um por ano/série). O responsável
  // escolhe a série e o PS correto vem daqui — sem depender de ?segmento no link.
  idps: number;
  nomeProcesso: string;
  idAreaInteresse: number;
  nome: string;
  grupo: string | null;
  numeroVagas: number;
  // Código da habilitação (série) do RM, resolvido via
  // SPSAREAINTERESSE.IDHABILITACAOFILIAL → SHABILITACAOFILIAL.CODHABILITACAO
  // (EFI1..EFI5, EFII6..EFII9, EM1/EM2). Base do mapeamento da programação.
  codHabilitacao: string | null;
}

interface DocumentoExigidoItem {
  codDocumento: number;
  descricao: string;
  obrigatorio: boolean;
  quantidade: number;
  orientacao: string | null;
}

interface ResultadoInscricao {
  numeroInscricao: number | null;
  mostrarBoleto: boolean;
  ra: string | null;
  avisos?: string[];
}

// Lookups do RM (GCONSIST) — série atual do candidato e grupo de candidato.
const CURSO_SERIE: Array<{ valor: string; rotulo: string }> = [
  { valor: "1", rotulo: "Pré-Escola I" },
  { valor: "2", rotulo: "Pré-Escola II" },
  { valor: "3", rotulo: "1º Ano do Fundamental" },
  { valor: "4", rotulo: "2º Ano do Fundamental" },
  { valor: "5", rotulo: "3º Ano do Fundamental" },
  { valor: "6", rotulo: "4º Ano do Fundamental" },
  { valor: "7", rotulo: "5º Ano do Fundamental" },
  { valor: "8", rotulo: "6º Ano do Fundamental" },
  { valor: "9", rotulo: "7º Ano do Fundamental" },
  { valor: "A", rotulo: "8º Ano do Fundamental" },
  { valor: "B", rotulo: "9º Ano do Fundamental" },
  { valor: "C", rotulo: "1ª Série do Ensino Médio" },
  { valor: "D", rotulo: "2ª Série do Ensino Médio" },
];

const GRUPO_CANDIDATO: Array<{ valor: string; rotulo: string }> = [
  { valor: "GRP1A", rotulo: "Irmão(s) de aluno(s) matriculado(s)" },
  { valor: "GRP1B", rotulo: "Filho de funcionário/professor do CSA Leblon" },
  { valor: "GRP2", rotulo: "Filho de ex-aluno" },
  { valor: "GRP3", rotulo: "Demais candidatos" },
];

const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

/** Converte dd/mm/aaaa → yyyy-MM-dd; "" se incompleto. */
function dataParaIso(ddmmaaaa: string): string {
  const m = ddmmaaaa.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Máscara leve de data dd/mm/aaaa. */
function formatarData(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length >= 3) out += "/" + d.slice(2, 4);
  if (d.length >= 5) out += "/" + d.slice(4, 8);
  return out;
}

/** Máscara de CEP 00000-000. */
function formatarCep(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Deriva o código do programa de avaliações a partir do CODHABILITACAO da série
 * (vínculo estrutural do RM: SPSAREAINTERESSE.IDHABILITACAOFILIAL →
 * SHABILITACAOFILIAL.CODHABILITACAO). EFI1..EFI5/EFII6..EFII9 → F1..F9; EM1/EM2 →
 * M1/M2. O 1º ano do Fundamental (EFI1 → F1) NÃO tem programa — só edital público —
 * e retorna null. Robusto a renomeações do PS (não depende do nome).
 */
function codigoProgramaAvaliacoes(
  codHabilitacao: string | undefined | null,
): string | null {
  if (!codHabilitacao) return null;
  const c = codHabilitacao.toUpperCase().trim();
  const ef = c.match(/^EFI+(\d+)$/); // EFI1..EFI5, EFII6..EFII9
  const em = c.match(/^EM(\d+)$/); // EM1, EM2
  const cod = ef ? `F${ef[1]}` : em ? `M${em[1]}` : null;
  if (!cod) return null;
  return cod === "F1" ? null : cod; // F1 não tem programa
}

// Tamanho máximo por documento (PDF). Mantido em sincronia com o backend
// (MAX_ARQUIVO_BYTES em app/api/inscricao/route.ts) e com o Nginx da VM.
const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB

/** Lê um arquivo como base64 PURO (sem o prefixo `data:...;base64,`). */
function lerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result);
      const i = res.indexOf(",");
      resolve(i >= 0 ? res.slice(i + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const rotuloCampo = "mb-1 block text-sm font-medium text-grafite";
const inputBase =
  "w-full rounded-lg border border-black/10 px-4 py-2.5 text-grafite outline-none transition focus:border-csa-azul focus:ring-2 focus:ring-csa-azul/20";
const botaoPrimario =
  "w-full rounded-full bg-csa-dourado px-6 py-2.5 text-sm font-semibold text-csa-azul shadow-sm transition hover:bg-csa-dourado-escuro disabled:opacity-60";
// Ação de boleto (transacional/financeira): azul sólido, distinta do CTA dourado.
const botaoBoleto =
  "block w-full rounded-full bg-csa-azul px-6 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-csa-azul-claro disabled:opacity-60";
const botaoSecundario = "w-full text-sm text-cinza-suave hover:text-grafite";

type SimNao = "1" | "2" | "";

/** Select Sim(1)/Não(2) reutilizável para os campos complementares. */
function SelectSimNao({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: SimNao;
  onChange: (v: SimNao) => void;
}) {
  return (
    <label className="block">
      <span className={rotuloCampo}>
        {rotulo} <span className="text-csa-vermelho">*</span>
      </span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as SimNao)}
        className={inputBase}
      >
        <option value="">Selecione</option>
        <option value="1">Sim</option>
        <option value="2">Não</option>
      </select>
    </label>
  );
}

/**
 * Wizard de inscrição (fluxo nativo, integrado à TOTVS via BFF):
 * dados do candidato → escolha da série/área → revisão → submissão → comprovante/boleto.
 * A submissão chama POST /api/inscricao (EduPS NovaInscricao), protegido por sessão.
 */
export function WizardInscricao({
  idps,
  responsavelNome,
  onConcluir,
  modo = "logado",
  novoCpf,
  novoSenha,
  novoEmail,
  novoCelular,
  novoDataNascimento,
}: {
  idps: number;
  responsavelNome: string;
  /** Chamado ao finalizar (volta ao painel do responsável). */
  onConcluir?: () => void;
  /** "logado": usa a sessão. "novo": cadastro anônimo (responsável + senha). */
  modo?: "logado" | "novo";
  /** NOVO: CPF do responsável (já validado no reconhecimento). */
  novoCpf?: string;
  /** NOVO: senha definida pelo responsável. */
  novoSenha?: string;
  /** NOVO: e-mail do responsável (definido no cadastro, editável na revisão). */
  novoEmail?: string;
  /** NOVO: celular do responsável (definido no cadastro). */
  novoCelular?: string;
  /** NOVO: data de nascimento do responsável (dd/mm/aaaa, exigida pelo RM). */
  novoDataNascimento?: string;
}) {
  const [etapa, setEtapa] = useState<Etapa>("candidato");
  const [erro, setErro] = useState<string | null>(null);

  // Candidato — dados básicos
  const [candNome, setCandNome] = useState("");
  const [candSexo, setCandSexo] = useState<"M" | "F" | "">("");
  const [candData, setCandData] = useState("");
  const [candCpf, setCandCpf] = useState("");
  // Relação do responsável (logado/novo) com o candidato. A NovaInscricao só
  // representa pai ("P") ou mãe ("M") — flags EHPAI/EHMAE no SPSUSUARIO.
  const [relacaoResponsavel, setRelacaoResponsavel] = useState<
    "P" | "M" | "O" | ""
  >("");
  // Contato é SEMPRE do responsável (nunca do candidato). O e-mail é definido no
  // cadastro (novo) ou lido da sessão (logado) e fica editável na revisão — ele
  // é usado como e-mail de contato do funil RD Station/CRM. O candidato não tem
  // e-mail/telefone próprios (evita que a EduPS funda irmãos do mesmo responsável
  // num único candidato pelo grupo de pesquisa por e-mail, GRUPOPESQUISA3).
  const [respEmail, setRespEmail] = useState(novoEmail ?? "");
  // Celular de contato do responsável (obrigatório). No fluxo NOVO vem do
  // cadastro; no LOGADO é pré-preenchido pelo telefone da sessão. Confirmado na
  // revisão e enviado ao RD Station/CRM como telefone de contato.
  const [respCelular, setRespCelular] = useState(novoCelular ?? "");

  // Candidato — endereço/nacionalidade
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("Rio de Janeiro");
  const [estado, setEstado] = useState("RJ");
  const [cep, setCep] = useState("");

  // Complementares (CSA)
  const [colegioAtual, setColegioAtual] = useState("");
  const [cursoSerie, setCursoSerie] = useState("");
  const [grupo, setGrupo] = useState("");
  const [irmaoGemeo, setIrmaoGemeo] = useState<SimNao>("");
  const [maeFalecida, setMaeFalecida] = useState<SimNao>("");
  const [maeMora, setMaeMora] = useState<SimNao>("");
  const [paiFalecido, setPaiFalecido] = useState<SimNao>("");
  const [paiMora, setPaiMora] = useState<SimNao>("");
  const [necessidadeEspecial, setNecessidadeEspecial] = useState<SimNao>("");
  // Irmão gemelar (só quando irmaoGemeo="1"): nome e CPF do irmão. Por decisão
  // de negócio o CPF é gravado junto do nome no campo NOME da API.
  const [irmaoNome, setIrmaoNome] = useState("");
  const [irmaoCpf, setIrmaoCpf] = useState("");
  // Irmão de aluno matriculado (só quando grupo="GRP1A"): nome + nº de matrícula
  // do irmão que já estuda no colégio (gravados em NOME e MATRICULA da API).
  const [irmaoMatNome, setIrmaoMatNome] = useState("");
  const [irmaoMatricula, setIrmaoMatricula] = useState("");

  // Séries pretendidas (agregadas de todos os PS de admissão do ano). O item
  // selecionado carrega o IDPS de destino da inscrição.
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [carregandoAreas, setCarregandoAreas] = useState(false);
  const [serieSel, setSerieSel] = useState<AreaItem | null>(null);

  // Documentos exigidos na inscrição (por PS + série escolhida). Carregados ao
  // entrar na etapa; os arquivos anexados ficam em `docsArquivos` (base64).
  const [documentosExigidos, setDocumentosExigidos] = useState<
    DocumentoExigidoItem[]
  >([]);
  const [docsArquivos, setDocsArquivos] = useState<
    Record<number, { nomeArquivo: string; base64: string } | undefined>
  >({});
  const [carregandoDocs, setCarregandoDocs] = useState(false);
  const [docErro, setDocErro] = useState<string | null>(null);
  // Chave (idps-idArea) já carregada, para não refazer a busca desnecessariamente
  // e para trocar a lista + limpar anexos quando o responsável muda de série.
  const [docsChaveCarregada, setDocsChaveCarregada] = useState<string | null>(
    null,
  );

  // Responsável financeiro — por padrão é o próprio responsável de inscrição.
  // Quando "outra pessoa", a taxa é emitida em nome dele (dados abaixo).
  const [rfOutraPessoa, setRfOutraPessoa] = useState(false);
  const [rfNome, setRfNome] = useState("");
  const [rfCpf, setRfCpf] = useState("");
  const [rfData, setRfData] = useState("");
  const [rfEmail, setRfEmail] = useState("");
  const [rfCelular, setRfCelular] = useState("");
  const [rfRua, setRfRua] = useState("");
  const [rfNumero, setRfNumero] = useState("");
  const [rfComplemento, setRfComplemento] = useState("");
  const [rfBairro, setRfBairro] = useState("");
  const [rfCidade, setRfCidade] = useState("Rio de Janeiro");
  const [rfEstado, setRfEstado] = useState("RJ");
  const [rfCep, setRfCep] = useState("");

  // Resultado
  const [resultado, setResultado] = useState<ResultadoInscricao | null>(null);
  const [erroBoleto, setErroBoleto] = useState<string | null>(null);
  const [baixandoBoleto, setBaixandoBoleto] = useState(false);
  const [baixandoComprovante, setBaixandoComprovante] = useState(false);
  const [erroComprovante, setErroComprovante] = useState<string | null>(null);

  const candidatoOk =
    candNome.trim().length > 1 &&
    !!candSexo &&
    dataParaIso(candData) !== "" &&
    cpfValido(candCpf) &&
    !!relacaoResponsavel;

  // Validade do e-mail de contato do responsável (editável na revisão).
  const respEmailOk = /.+@.+\..+/.test(respEmail.trim());

  // Celular do responsável é OBRIGATÓRIO (contato do funil e do RM).
  const respCelularOk = respCelular.replace(/\D/g, "").length >= 10;

  // Fluxo LOGADO: pré-preenche e-mail e celular de contato com os dados reais da
  // sessão (identidade vem do servidor, via CODUSUARIOPS — nunca do cliente).
  useEffect(() => {
    if (modo === "novo") return;
    let ativo = true;
    void (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as {
          ok: boolean;
          email?: string | null;
          telefone?: string | null;
        };
        if (!ativo || !d.ok) return;
        if (d.email) setRespEmail(d.email);
        if (d.telefone) setRespCelular(formatarTelefone(d.telefone));
      } catch {
        // best-effort; os campos ficam preenchíveis de qualquer forma.
      }
    })();
    return () => {
      ativo = false;
    };
  }, [modo]);

  const enderecoOk =
    rua.trim().length > 1 &&
    numero.trim().length > 0 &&
    bairro.trim().length > 1 &&
    cidade.trim().length > 1 &&
    estado.length === 2 &&
    cep.replace(/\D/g, "").length === 8;

  const complementaresOk =
    colegioAtual.trim().length > 0 &&
    !!cursoSerie &&
    !!grupo &&
    !!irmaoGemeo &&
    !!maeFalecida &&
    !!maeMora &&
    !!paiFalecido &&
    !!paiMora &&
    !!necessidadeEspecial &&
    // Gemelar: exige nome e CPF válido do irmão.
    (irmaoGemeo !== "1" ||
      (irmaoNome.trim().length > 1 && cpfValido(irmaoCpf))) &&
    // Irmão de aluno matriculado (GRP1A): exige nome e matrícula do irmão.
    (grupo !== "GRP1A" ||
      (irmaoMatNome.trim().length > 1 && irmaoMatricula.trim().length > 0));

  // Documentos: todos os OBRIGATÓRIOS precisam ter um arquivo anexado.
  const documentosOk = documentosExigidos
    .filter((d) => d.obrigatorio)
    .every((d) => !!docsArquivos[d.codDocumento]);

  // Quando o responsável financeiro é "outra pessoa", exige CPF, nome, e-mail e
  // endereço completos (a taxa é emitida em nome dele).
  const respFinOk =
    !rfOutraPessoa ||
    (cpfValido(rfCpf) &&
      rfNome.trim().length > 1 &&
      dataParaIso(rfData) !== "" &&
      /.+@.+\..+/.test(rfEmail) &&
      rfCelular.replace(/\D/g, "").length >= 10 &&
      rfRua.trim().length > 1 &&
      rfNumero.trim().length > 0 &&
      rfBairro.trim().length > 1 &&
      rfCidade.trim().length > 1 &&
      rfEstado.length === 2 &&
      rfCep.replace(/\D/g, "").length === 8);

  useEffect(() => {
    if (etapa !== "area" || areas.length > 0) return;
    let ativo = true;
    const carregar = async () => {
      setCarregandoAreas(true);
      try {
        const r = await fetch(`/api/series`, { cache: "no-store" });
        const d = (await r.json()) as { ok: boolean; series?: AreaItem[] };
        if (ativo && d.ok && d.series) setAreas(d.series);
      } catch {
        if (ativo) setErro("Não foi possível carregar as séries.");
      } finally {
        if (ativo) setCarregandoAreas(false);
      }
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, [etapa, areas.length]);

  // Carrega os documentos exigidos ao entrar na etapa (por PS + série). Ao trocar
  // de série, a chave muda: recarrega a lista e limpa os anexos da série anterior.
  useEffect(() => {
    if (etapa !== "documentos" || !serieSel) return;
    const chave = `${serieSel.idps}-${serieSel.idAreaInteresse}`;
    if (docsChaveCarregada === chave) return;
    let ativo = true;
    const carregar = async () => {
      setCarregandoDocs(true);
      setDocErro(null);
      try {
        const r = await fetch(
          `/api/documentos-exigidos?idps=${serieSel.idps}&idAreaInteresse=${serieSel.idAreaInteresse}`,
          { cache: "no-store" },
        );
        const d = (await r.json()) as {
          ok: boolean;
          documentos?: DocumentoExigidoItem[];
        };
        if (!ativo) return;
        if (d.ok && d.documentos) {
          setDocumentosExigidos(d.documentos);
          setDocsArquivos({});
          setDocsChaveCarregada(chave);
        } else {
          setDocErro("Não foi possível carregar os documentos exigidos.");
        }
      } catch {
        if (ativo)
          setDocErro("Não foi possível carregar os documentos exigidos.");
      } finally {
        if (ativo) setCarregandoDocs(false);
      }
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, [etapa, serieSel, docsChaveCarregada]);

  // Anexa/remove um documento (valida PDF + tamanho no cliente; guarda o base64).
  async function selecionarArquivo(codDocumento: number, file: File | null) {
    setDocErro(null);
    if (!file) {
      setDocsArquivos((m) => ({ ...m, [codDocumento]: undefined }));
      return;
    }
    if (file.type !== "application/pdf") {
      setDocErro("Envie os documentos em formato PDF.");
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      setDocErro("Cada arquivo deve ter no máximo 5 MB.");
      return;
    }
    try {
      const base64 = await lerBase64(file);
      setDocsArquivos((m) => ({
        ...m,
        [codDocumento]: { nomeArquivo: file.name, base64 },
      }));
    } catch {
      setDocErro("Não foi possível ler o arquivo. Tente novamente.");
    }
  }

  async function enviar() {
    setErro(null);
    if (!respEmailOk) {
      setErro("Informe um e-mail de contato válido do responsável.");
      setEtapa("revisao");
      return;
    }
    if (!respCelularOk) {
      setErro("Informe um celular válido do responsável, com DDD.");
      setEtapa("revisao");
      return;
    }
    setEtapa("enviando");
    // IDPS de destino: vem da série escolhida (um PS por ano/série). Fallback ao
    // idps de entrada por segurança, mas a etapa de série sempre define um.
    const idEnvio = serieSel?.idps ?? idps;
    try {
      const candidatoPayload = {
        nome: candNome.trim(),
        sexo: candSexo,
        dataNascimento: dataParaIso(candData),
        cpf: candCpf,
        // O candidato NÃO possui e-mail/telefone próprios: o contato é sempre do
        // responsável. E-mail nulo impede a EduPS de fundir irmãos (mesmo
        // responsável) num único candidato pelo grupo de pesquisa por e-mail.
        email: null,
        telefone: null,
        nacionalidade: "10", // brasileiro
        endereco: {
          rua: rua.trim(),
          numero: numero.trim(),
          complemento: complemento.trim() || null,
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          estado,
          cep: cep.replace(/\D/g, ""),
          idPais: 1,
        },
      };
      const complementaresPayload = {
        colegioAtual: colegioAtual.trim(),
        cursoSerie,
        grupo,
        irmaoGemeo,
        maeFalecida,
        maeMora,
        paiFalecido,
        paiMora,
        necessidadeEspecial,
        irmaoNome: irmaoGemeo === "1" ? irmaoNome.trim() : null,
        irmaoCpf: irmaoGemeo === "1" ? irmaoCpf : null,
        irmaoMatriculadoNome: grupo === "GRP1A" ? irmaoMatNome.trim() : null,
        irmaoMatricula: grupo === "GRP1A" ? irmaoMatricula.trim() : null,
      };
      const res = await fetch("/api/inscricao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidato: candidatoPayload,
          complementares: complementaresPayload,
          opcao: { areaInteresseId: serieSel?.idAreaInteresse, numeroOpcao: 1 },
          // O IDPS vem SEMPRE da série escolhida (link único, sem ?segmento). O
          // servidor revalida que é um PS publicado e aberto antes de gravar.
          idps: idEnvio,
          // NOVO (anônimo): manda dados do responsável + senha. O servidor cria a
          // inscrição, grava a senha do PS e faz o auto-login.
          ...(modo === "novo"
            ? {
                novo: {
                  nome: responsavelNome,
                  email: respEmail.trim(),
                  celular: respCelular || null,
                  dataNascimento: dataParaIso(novoDataNascimento ?? "") || null,
                  cpf: novoCpf,
                  senha: novoSenha,
                },
              }
            : {}),
          // E-mail de contato do responsável (editável): usado APENAS para o funil
          // RD Station/CRM. Não altera a identidade nem o registro do RM.
          emailResponsavel: respEmail.trim(),
          // Celular de contato do responsável (obrigatório): enviado ao RD
          // Station/CRM. No fluxo NOVO também vai para o RM (via `novo.celular`).
          celularResponsavel: respCelular.replace(/\D/g, "") || null,
          // Relação do responsável com o candidato (pai/mãe): grava EHPAI/EHMAE.
          relacaoResponsavel,
          // Responsável financeiro: só enviado quando é "outra pessoa". Do
          // contrário, o próprio responsável de inscrição é o financeiro.
          ...(rfOutraPessoa
            ? {
                respFinanceiro: {
                  outraPessoa: true,
                  nome: rfNome.trim(),
                  cpf: rfCpf,
                  dataNascimento: dataParaIso(rfData) || null,
                  email: rfEmail.trim(),
                  celular: rfCelular || null,
                  nacionalidade: "10",
                  rua: rfRua.trim(),
                  numero: rfNumero.trim(),
                  complemento: rfComplemento.trim() || null,
                  bairro: rfBairro.trim(),
                  cidade: rfCidade.trim(),
                  estado: rfEstado,
                  cep: rfCep.replace(/\D/g, ""),
                },
              }
            : {}),
          segmento: serieSel?.grupo ?? undefined,
          // Documentos exigidos anexados: cada PDF em base64 puro. O servidor
          // revalida a obrigatoriedade contra a configuração do PS/série.
          documentos: documentosExigidos
            .map((d) => {
              const arq = docsArquivos[d.codDocumento];
              return arq
                ? {
                    codDocumento: d.codDocumento,
                    nomeArquivo: arq.nomeArquivo,
                    arquivoBase64: arq.base64,
                  }
                : null;
            })
            .filter((x) => x !== null),
        }),
      });

      if (res.status === 401) {
        setErro("Sua sessão expirou. Recarregue a página e entre novamente.");
        setEtapa("revisao");
        return;
      }
      if (res.status === 503) {
        setErro(
          "Inscrições temporariamente em modo de testes (somente leitura). A confirmação será liberada em breve.",
        );
        setEtapa("revisao");
        return;
      }
      const data = (await res.json()) as
        | {
            ok: true;
            numeroInscricao: number | null;
            mostrarBoleto: boolean;
            ra: string | null;
            avisos?: string[];
          }
        | { ok: false; erro: string; mensagem?: string };

      if (!data.ok) {
        setErro(
          data.erro === "conta-existente"
            ? "Este CPF já possui cadastro no Processo Seletivo. Volte e entre com sua senha para inscrever o candidato."
            : (data.erro === "ja-inscrito" ||
                  data.erro === "falha-inscricao") &&
                data.mensagem
              ? data.mensagem
              : "Não foi possível concluir a inscrição. Confira os dados e tente novamente.",
        );
        setEtapa("revisao");
        return;
      }

      setResultado(data);
      setEtapa("resultado");
    } catch {
      setErro("Não foi possível concluir agora. Tente novamente.");
      setEtapa("revisao");
    }
  }

  // Fluxo unificado do boleto da taxa. Em um único clique: resolve o boleto da
  // inscrição, FORÇA o registro no banco (2aviaBoletoCandidato) e baixa o PDF.
  // O RM registra de forma ASSÍNCRONA, então re-tenta algumas vezes antes de
  // avisar. Boleto fixo (HTML) não tem 2ª via em PDF: abre a URL do banco.
  // O registro só ocorre neste clique explícito (nunca automaticamente ao
  // concluir a inscrição), evitando gerar cobrança sem ação do usuário.
  async function obterBoleto(numeroInscricao: number, idps: number) {
    setErroBoleto(null);
    setBaixandoBoleto(true);
    try {
      for (let tentativa = 0; tentativa < 6; tentativa++) {
        const res = await fetch(
          `/api/inscricao/boleto/pdf?numeroInscricao=${numeroInscricao}&idps=${idps}`,
        );
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank", "noopener,noreferrer");
          return;
        }
        // Boleto fixo (HTML): abre a URL do banco retornada pelo BFF.
        if (res.status === 409) {
          const d = (await res.json().catch(() => null)) as {
            url?: string;
          } | null;
          if (d?.url) {
            window.open(d.url, "_blank", "noopener,noreferrer");
            return;
          }
        }
        // 404 = boleto ainda não disponível no RM: aguarda e tenta de novo.
        if (res.status === 404) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        // 502 (falha ao registrar no banco) ou outro erro: mostra a mensagem.
        const d = (await res.json().catch(() => null)) as {
          mensagem?: string;
        } | null;
        setErroBoleto(
          d?.mensagem ??
            "Não foi possível gerar o boleto agora. Tente novamente mais tarde.",
        );
        return;
      }
      setErroBoleto(
        "O boleto ainda está sendo gerado. Tente novamente em alguns instantes ou emita-o depois na central do candidato.",
      );
    } catch {
      setErroBoleto(
        "Não foi possível gerar o boleto agora. Tente novamente mais tarde.",
      );
    } finally {
      setBaixandoBoleto(false);
    }
  }

  // Baixa o comprovante de inscrição em PDF (GET /api/inscricao/comprovante).
  async function baixarComprovante(numeroInscricao: number, idps: number) {
    setErroComprovante(null);
    setBaixandoComprovante(true);
    try {
      const res = await fetch(
        `/api/inscricao/comprovante?numeroInscricao=${numeroInscricao}&idps=${idps}`,
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
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setErroComprovante(
        "Não foi possível gerar o comprovante agora. Tente novamente mais tarde.",
      );
    } finally {
      setBaixandoComprovante(false);
    }
  }

  // ---- Etapa: dados do candidato -------------------------------------------
  if (etapa === "candidato") {
    return (
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          if (!candidatoOk)
            return setErro(
              "Preencha nome, sexo, data de nascimento, CPF válidos e sua relação com o candidato.",
            );
          setEtapa("complemento");
        }}
      >
        <p className="text-sm text-grafite">
          Olá, <strong>{responsavelNome}</strong>. Informe os dados do
          candidato.
        </p>

        <label className="block">
          <span className={rotuloCampo}>
            Nome do candidato <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="text"
            autoFocus
            value={candNome}
            onChange={(e) => setCandNome(e.target.value)}
            className={inputBase}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={rotuloCampo}>
              Sexo <span className="text-csa-vermelho">*</span>
            </span>
            <select
              value={candSexo}
              onChange={(e) => setCandSexo(e.target.value as "M" | "F" | "")}
              className={inputBase}
            >
              <option value="">Selecione</option>
              <option value="F">Feminino</option>
              <option value="M">Masculino</option>
            </select>
          </label>
          <label className="block">
            <span className={rotuloCampo}>
              Nascimento <span className="text-csa-vermelho">*</span>
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/aaaa"
              maxLength={10}
              value={candData}
              onChange={(e) => setCandData(formatarData(e.target.value))}
              className={inputBase}
            />
          </label>
        </div>

        <CpfInput
          value={candCpf}
          onChange={setCandCpf}
          rotulo="CPF do candidato"
          obrigatorio
        />

        <label className="block">
          <span className={rotuloCampo}>
            Sua relação com o candidato{" "}
            <span className="text-csa-vermelho">*</span>
          </span>
          <select
            value={relacaoResponsavel}
            onChange={(e) =>
              setRelacaoResponsavel(e.target.value as "P" | "M" | "O" | "")
            }
            className={inputBase}
          >
            <option value="">Selecione</option>
            <option value="P">Pai</option>
            <option value="M">Mãe</option>
            <option value="O">Outro</option>
          </select>
        </label>

        {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}
        <button type="submit" className={botaoPrimario}>
          Continuar
        </button>
      </form>
    );
  }

  // ---- Etapa: endereço + dados complementares ------------------------------
  if (etapa === "complemento") {
    return (
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          if (!enderecoOk)
            return setErro("Preencha o endereço completo do candidato.");
          if (!complementaresOk)
            return setErro("Preencha todos os dados complementares.");
          setEtapa("area");
        }}
      >
        <p className="text-sm font-semibold text-csa-azul">
          Endereço do candidato
        </p>

        <div className="grid grid-cols-3 gap-3">
          <label className="col-span-2 block">
            <span className={rotuloCampo}>
              Rua/Logradouro <span className="text-csa-vermelho">*</span>
            </span>
            <input
              type="text"
              value={rua}
              onChange={(e) => setRua(e.target.value)}
              className={inputBase}
            />
          </label>
          <label className="block">
            <span className={rotuloCampo}>
              Número <span className="text-csa-vermelho">*</span>
            </span>
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              className={inputBase}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={rotuloCampo}>Complemento</span>
            <input
              type="text"
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
              className={inputBase}
            />
          </label>
          <label className="block">
            <span className={rotuloCampo}>
              Bairro <span className="text-csa-vermelho">*</span>
            </span>
            <input
              type="text"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              className={inputBase}
            />
          </label>
        </div>

        <div className="grid grid-cols-6 gap-3">
          <label className="col-span-3 block">
            <span className={rotuloCampo}>
              Cidade <span className="text-csa-vermelho">*</span>
            </span>
            <input
              type="text"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className={inputBase}
            />
          </label>
          <label className="col-span-1 block">
            <span className={rotuloCampo}>
              UF <span className="text-csa-vermelho">*</span>
            </span>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className={inputBase}
            >
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block">
            <span className={rotuloCampo}>
              CEP <span className="text-csa-vermelho">*</span>
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="00000-000"
              maxLength={9}
              value={cep}
              onChange={(e) => setCep(formatarCep(e.target.value))}
              className={inputBase}
            />
          </label>
        </div>

        <p className="pt-2 text-sm font-semibold text-csa-azul">
          Dados complementares
        </p>

        <label className="block">
          <span className={rotuloCampo}>
            Colégio atual <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="text"
            value={colegioAtual}
            onChange={(e) => setColegioAtual(e.target.value)}
            className={inputBase}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={rotuloCampo}>
              Série atual <span className="text-csa-vermelho">*</span>
            </span>
            <select
              value={cursoSerie}
              onChange={(e) => setCursoSerie(e.target.value)}
              className={inputBase}
            >
              <option value="">Selecione</option>
              {CURSO_SERIE.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={rotuloCampo}>
              Grupo <span className="text-csa-vermelho">*</span>
            </span>
            <select
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              className={inputBase}
            >
              <option value="">Selecione</option>
              {GRUPO_CANDIDATO.map((g) => (
                <option key={g.valor} value={g.valor}>
                  {g.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SelectSimNao
            rotulo="Possui irmão gêmeo inscrito?"
            valor={irmaoGemeo}
            onChange={setIrmaoGemeo}
          />
          <SelectSimNao
            rotulo="A mãe é falecida?"
            valor={maeFalecida}
            onChange={setMaeFalecida}
          />
          <SelectSimNao
            rotulo="A mãe mora com o candidato?"
            valor={maeMora}
            onChange={setMaeMora}
          />
          <SelectSimNao
            rotulo="O pai é falecido?"
            valor={paiFalecido}
            onChange={setPaiFalecido}
          />
          <SelectSimNao
            rotulo="O pai mora com o candidato?"
            valor={paiMora}
            onChange={setPaiMora}
          />
          <SelectSimNao
            rotulo="Necessita atenção especial?"
            valor={necessidadeEspecial}
            onChange={setNecessidadeEspecial}
          />
        </div>

        {grupo === "GRP1A" && (
          <div className="space-y-3 rounded-lg border border-black/10 px-4 py-3">
            <p className="text-sm font-medium text-grafite">
              Dados do irmão já matriculado
            </p>
            <label className="block">
              <span className={rotuloCampo}>
                Nome do irmão <span className="text-csa-vermelho">*</span>
              </span>
              <input
                type="text"
                value={irmaoMatNome}
                onChange={(e) => setIrmaoMatNome(e.target.value)}
                className={inputBase}
              />
            </label>
            <label className="block">
              <span className={rotuloCampo}>
                Número de matrícula do irmão{" "}
                <span className="text-csa-vermelho">*</span>
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={irmaoMatricula}
                onChange={(e) =>
                  setIrmaoMatricula(
                    e.target.value.replace(/\D/g, "").slice(0, 10),
                  )
                }
                className={inputBase}
                maxLength={10}
              />
            </label>
          </div>
        )}

        {irmaoGemeo === "1" && (
          <div className="space-y-3 rounded-lg border border-black/10 px-4 py-3">
            <p className="text-sm font-medium text-grafite">
              Dados do irmão gemelar
            </p>
            <label className="block">
              <span className={rotuloCampo}>
                Nome do irmão <span className="text-csa-vermelho">*</span>
              </span>
              <input
                type="text"
                value={irmaoNome}
                onChange={(e) => setIrmaoNome(e.target.value)}
                className={inputBase}
              />
            </label>
            <CpfInput
              value={irmaoCpf}
              onChange={setIrmaoCpf}
              rotulo="CPF do irmão"
              obrigatorio
            />
          </div>
        )}

        {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}
        <button type="submit" className={botaoPrimario}>
          Continuar
        </button>
        <button
          type="button"
          onClick={() => setEtapa("candidato")}
          className={botaoSecundario}
        >
          Voltar
        </button>
      </form>
    );
  }

  // ---- Etapa: escolha da série/processo -----------------------------------
  if (etapa === "area") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-grafite">
          Escolha a série pretendida para {String(ANO_PROCESSO)}.
        </p>
        {carregandoAreas && (
          <p className="text-sm text-cinza-suave">Carregando séries…</p>
        )}
        {!carregandoAreas && areas.length === 0 && (
          <p className="text-sm text-cinza-suave">
            Nenhuma série disponível para inscrição neste momento.
          </p>
        )}
        <div className="space-y-2">
          {areas.map((a) => {
            const selecionada =
              serieSel?.idps === a.idps &&
              serieSel?.idAreaInteresse === a.idAreaInteresse;
            return (
              <label
                key={`${a.idps}-${a.idAreaInteresse}`}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                  selecionada
                    ? "border-csa-azul bg-csa-azul/5"
                    : "border-black/10 hover:border-csa-azul/40"
                }`}
              >
                <input
                  type="radio"
                  name="area"
                  checked={selecionada}
                  onChange={() => setSerieSel(a)}
                />
                <span className="text-grafite">
                  {a.nome}
                  {a.grupo ? (
                    <span className="text-cinza-suave"> — {a.grupo}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}
        <button
          type="button"
          disabled={!serieSel}
          onClick={() => {
            setErro(null);
            setEtapa("documentos");
          }}
          className={botaoPrimario}
        >
          Continuar
        </button>
        <button
          type="button"
          onClick={() => setEtapa("complemento")}
          className={botaoSecundario}
        >
          Voltar
        </button>
      </div>
    );
  }

  // ---- Etapa: documentos ---------------------------------------------------
  if (etapa === "documentos") {
    const temObrigatorios = documentosExigidos.some((d) => d.obrigatorio);
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-csa-azul">Documentos</p>
        <p className="text-sm text-grafite">
          Anexe os documentos solicitados em formato PDF (até 5 MB cada).
          {temObrigatorios
            ? " Os marcados com * são obrigatórios para concluir a inscrição."
            : ""}
        </p>

        {carregandoDocs && (
          <p className="text-sm text-cinza-suave">Carregando documentos…</p>
        )}
        {!carregandoDocs && documentosExigidos.length === 0 && (
          <p className="text-sm text-cinza-suave">
            Nenhum documento é exigido nesta etapa. Você pode continuar.
          </p>
        )}

        <div className="space-y-3">
          {documentosExigidos.map((d) => {
            const arq = docsArquivos[d.codDocumento];
            return (
              <div
                key={d.codDocumento}
                className="rounded-lg border border-black/10 px-4 py-3"
              >
                <span className="text-sm font-medium text-grafite">
                  {d.descricao}
                  {d.obrigatorio ? (
                    <span className="text-csa-vermelho"> *</span>
                  ) : (
                    <span className="text-cinza-suave"> (opcional)</span>
                  )}
                </span>
                {d.orientacao && (
                  <p className="mt-1 text-xs text-cinza-suave">
                    {d.orientacao}
                  </p>
                )}
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) =>
                    void selecionarArquivo(
                      d.codDocumento,
                      e.target.files?.[0] ?? null,
                    )
                  }
                  className="mt-2 block w-full text-sm text-grafite file:mr-3 file:rounded-md file:border-0 file:bg-csa-azul/10 file:px-3 file:py-1.5 file:text-sm file:text-csa-azul hover:file:bg-csa-azul/20"
                />
                {arq && (
                  <p className="mt-1 text-xs text-csa-azul">
                    ✓ {arq.nomeArquivo}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {(docErro || erro) && (
          <p className="text-sm text-csa-vermelho">{docErro ?? erro}</p>
        )}
        <button
          type="button"
          disabled={!documentosOk || carregandoDocs}
          onClick={() => {
            setErro(null);
            setDocErro(null);
            setEtapa("respfin");
          }}
          className={botaoPrimario}
        >
          Continuar
        </button>
        <button
          type="button"
          onClick={() => setEtapa("area")}
          className={botaoSecundario}
        >
          Voltar
        </button>
      </div>
    );
  }

  // ---- Etapa: responsável financeiro ---------------------------------------
  if (etapa === "respfin") {
    return (
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          if (!respFinOk)
            return setErro(
              "Preencha os dados do responsável financeiro (CPF, nome, e-mail e endereço).",
            );
          setEtapa("revisao");
        }}
      >
        <p className="text-sm font-semibold text-csa-azul">
          Responsável financeiro
        </p>
        <p className="text-sm text-grafite">
          A cobrança da taxa de inscrição é emitida em nome do responsável
          financeiro.
        </p>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/10 px-4 py-3 text-sm hover:border-csa-azul/40">
            <input
              type="radio"
              name="respfin"
              checked={!rfOutraPessoa}
              onChange={() => setRfOutraPessoa(false)}
            />
            <span className="text-grafite">
              Sou eu, <strong>{responsavelNome}</strong> (responsável pela
              inscrição)
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/10 px-4 py-3 text-sm hover:border-csa-azul/40">
            <input
              type="radio"
              name="respfin"
              checked={rfOutraPessoa}
              onChange={() => setRfOutraPessoa(true)}
            />
            <span className="text-grafite">Informar outra pessoa</span>
          </label>
        </div>

        {rfOutraPessoa && (
          <div className="space-y-4 rounded-lg bg-areia px-4 py-4">
            <label className="block">
              <span className={rotuloCampo}>
                Nome completo <span className="text-csa-vermelho">*</span>
              </span>
              <input
                type="text"
                value={rfNome}
                onChange={(e) => setRfNome(e.target.value)}
                className={inputBase}
              />
            </label>

            <CpfInput
              value={rfCpf}
              onChange={setRfCpf}
              rotulo="CPF do responsável financeiro"
              obrigatorio
            />

            <label className="block">
              <span className={rotuloCampo}>
                Data de nascimento <span className="text-csa-vermelho">*</span>
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="dd/mm/aaaa"
                maxLength={10}
                value={rfData}
                onChange={(e) => setRfData(formatarData(e.target.value))}
                className={inputBase}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={rotuloCampo}>
                  E-mail <span className="text-csa-vermelho">*</span>
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={rfEmail}
                  onChange={(e) => setRfEmail(e.target.value)}
                  className={inputBase}
                />
              </label>
              <label className="block">
                <span className={rotuloCampo}>
                  Celular <span className="text-csa-vermelho">*</span>
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  maxLength={16}
                  placeholder="(21) 99876-5432"
                  value={rfCelular}
                  onChange={(e) =>
                    setRfCelular(formatarTelefone(e.target.value))
                  }
                  className={inputBase}
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 block">
                <span className={rotuloCampo}>
                  Rua/Logradouro <span className="text-csa-vermelho">*</span>
                </span>
                <input
                  type="text"
                  value={rfRua}
                  onChange={(e) => setRfRua(e.target.value)}
                  className={inputBase}
                />
              </label>
              <label className="block">
                <span className={rotuloCampo}>
                  Número <span className="text-csa-vermelho">*</span>
                </span>
                <input
                  type="text"
                  value={rfNumero}
                  onChange={(e) => setRfNumero(e.target.value)}
                  className={inputBase}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={rotuloCampo}>Complemento</span>
                <input
                  type="text"
                  value={rfComplemento}
                  onChange={(e) => setRfComplemento(e.target.value)}
                  className={inputBase}
                />
              </label>
              <label className="block">
                <span className={rotuloCampo}>
                  Bairro <span className="text-csa-vermelho">*</span>
                </span>
                <input
                  type="text"
                  value={rfBairro}
                  onChange={(e) => setRfBairro(e.target.value)}
                  className={inputBase}
                />
              </label>
            </div>

            <div className="grid grid-cols-6 gap-3">
              <label className="col-span-3 block">
                <span className={rotuloCampo}>
                  Cidade <span className="text-csa-vermelho">*</span>
                </span>
                <input
                  type="text"
                  value={rfCidade}
                  onChange={(e) => setRfCidade(e.target.value)}
                  className={inputBase}
                />
              </label>
              <label className="col-span-1 block">
                <span className={rotuloCampo}>
                  UF <span className="text-csa-vermelho">*</span>
                </span>
                <select
                  value={rfEstado}
                  onChange={(e) => setRfEstado(e.target.value)}
                  className={inputBase}
                >
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block">
                <span className={rotuloCampo}>
                  CEP <span className="text-csa-vermelho">*</span>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00000-000"
                  maxLength={9}
                  value={rfCep}
                  onChange={(e) => setRfCep(formatarCep(e.target.value))}
                  className={inputBase}
                />
              </label>
            </div>
          </div>
        )}

        {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}
        <button type="submit" className={botaoPrimario}>
          Continuar
        </button>
        <button
          type="button"
          onClick={() => setEtapa("documentos")}
          className={botaoSecundario}
        >
          Voltar
        </button>
      </form>
    );
  }

  // ---- Etapa: revisão -------------------------------------------------------
  if (etapa === "revisao" || etapa === "enviando") {
    const area = serieSel;
    const serieAtual = CURSO_SERIE.find((s) => s.valor === cursoSerie);
    const enviando = etapa === "enviando";
    return (
      <div className="space-y-4">
        <p className="text-sm text-grafite">
          Confira os dados antes de enviar.
        </p>
        <dl className="space-y-2 rounded-lg bg-areia px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-cinza-suave">Candidato</dt>
            <dd className="text-grafite">{candNome}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-cinza-suave">Nascimento</dt>
            <dd className="text-grafite">{candData}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-cinza-suave">Série atual</dt>
            <dd className="text-grafite">{serieAtual?.rotulo ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-cinza-suave">Série pretendida</dt>
            <dd className="text-grafite">{area?.nome ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-cinza-suave">Responsável</dt>
            <dd className="text-grafite">{responsavelNome}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-cinza-suave">Responsável financeiro</dt>
            <dd className="text-grafite">
              {rfOutraPessoa ? rfNome.trim() || "—" : responsavelNome}
            </dd>
          </div>
        </dl>

        <p className="rounded-lg bg-areia px-4 py-3 text-xs leading-relaxed text-grafite">
          Ao inscrever-me, estou ciente da importância das informações aqui
          descritas. Sei também que devo manter meus dados sempre atualizados,
          através deles poderei receber notícias durante e após o término das
          inscrições.
        </p>

        {/* Contato do responsável. O e-mail é apenas informativo (identidade /
            já definido no cadastro ou na sessão); o celular é obrigatório e
            confirmado aqui. Ambos alimentam o funil RD Station/CRM. */}
        <div className="rounded-lg bg-areia px-4 py-3">
          <p className="text-xs text-cinza-suave">E-mail do responsável</p>
          <p className="break-all font-medium text-grafite">
            {respEmail || "—"}
          </p>
          <p className="mt-1 text-xs text-cinza-suave">
            Usaremos este e-mail para falar sobre a inscrição.
          </p>
        </div>

        <label className="block">
          <span className={rotuloCampo}>
            Celular do responsável <span className="text-csa-vermelho">*</span>
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={respCelular}
            onChange={(e) => setRespCelular(formatarTelefone(e.target.value))}
            disabled={enviando}
            placeholder="(21) 99999-9999"
            className={inputBase}
          />
          <span className="mt-1 block text-xs text-cinza-suave">
            Usaremos este número para falar sobre a inscrição.
          </span>
        </label>

        {erro && <p className="text-sm text-csa-vermelho">{erro}</p>}
        <button
          type="button"
          disabled={enviando}
          onClick={enviar}
          className={botaoPrimario}
        >
          {enviando ? (
            "Enviando inscrição…"
          ) : (
            <span className="flex flex-col leading-tight">
              <span>Confirmar inscrição</span>
              <span className="text-xs font-normal">
                Li e aceito os termos e condições
              </span>
            </span>
          )}
        </button>
        {!enviando && (
          <button
            type="button"
            onClick={() => setEtapa("respfin")}
            className={botaoSecundario}
          >
            Voltar
          </button>
        )}
      </div>
    );
  }

  // ---- Etapa: resultado / comprovante --------------------------------------
  const codPrograma = codigoProgramaAvaliacoes(serieSel?.codHabilitacao);
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-csa-azul/5 px-4 py-3 text-sm">
        <p className="font-semibold text-csa-azul">Inscrição registrada!</p>
        {resultado?.numeroInscricao && (
          <p className="text-grafite">
            Número da inscrição: <strong>{resultado.numeroInscricao}</strong>
          </p>
        )}
      </div>

      {resultado?.avisos && resultado.avisos.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Atenção</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {resultado.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {resultado?.numeroInscricao && (
        <div className="space-y-2 rounded-lg border border-black/10 px-4 py-3 text-sm">
          <p className="font-medium text-grafite">Comprovante de inscrição</p>
          <button
            type="button"
            onClick={() =>
              baixarComprovante(resultado.numeroInscricao!, serieSel!.idps)
            }
            disabled={baixandoComprovante}
            className={botaoBoleto}
          >
            {baixandoComprovante
              ? "Gerando comprovante…"
              : "Baixar comprovante (PDF)"}
          </button>
          {erroComprovante && (
            <p className="text-xs text-csa-vermelho">{erroComprovante}</p>
          )}
        </div>
      )}

      {codPrograma && (
        <div className="space-y-2 rounded-lg border border-black/10 px-4 py-3 text-sm">
          <p className="font-medium text-grafite">Programação das avaliações</p>
          <a
            href={`/api/programas/${codPrograma}`}
            target="_blank"
            rel="noopener noreferrer"
            className={botaoBoleto}
          >
            Baixar programação (PDF)
          </a>
        </div>
      )}

      {resultado?.mostrarBoleto && resultado?.numeroInscricao && (
        <div className="space-y-2 rounded-lg border border-black/10 px-4 py-3 text-sm">
          <p className="font-medium text-grafite">
            Boleto da taxa de inscrição
          </p>
          <button
            type="button"
            onClick={() =>
              obterBoleto(resultado.numeroInscricao!, serieSel!.idps)
            }
            disabled={baixandoBoleto}
            className={botaoBoleto}
          >
            {baixandoBoleto ? "Gerando boleto…" : "Obter boleto (PDF)"}
          </button>
          {erroBoleto && (
            <p className="text-xs text-csa-vermelho">{erroBoleto}</p>
          )}
          <p className="text-xs text-cinza-suave">
            Ao clicar, o boleto é registrado no banco e aberto em PDF. Se ainda
            não estiver disponível, tente novamente em alguns instantes.
          </p>
        </div>
      )}

      <p className="text-xs text-cinza-suave">
        Você receberá a confirmação por e-mail. Guarde o número da inscrição.
      </p>

      {onConcluir && (
        <button type="button" onClick={onConcluir} className={botaoPrimario}>
          Voltar aos meus candidatos
        </button>
      )}
    </div>
  );
}
