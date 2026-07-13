import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import {
  obterDocumentosExigidosMatricula,
  listarDocumentosCandidatoMatricula,
  enviarDocumentosMatricula,
  removerDocumentoMatricula,
  matriculaSomenteLeitura,
  obterDocumentosReaproveitaveisMatricula,
  resolverChaveReaproveitamento,
  type DocumentoMatriculaUpload,
} from "@/lib/totvs/matricula";
import {
  mapaArquivosInscricaoPorCod,
  baixarArquivoDocumento,
} from "@/lib/totvs/inscricao";

export const dynamic = "force-dynamic";

// Coligada padrão do RM (mesma convenção de lib/totvs/queries.ts).
const COD_COLIGADA = Number(process.env.RM_COD_COLIGADA) || 1;

// Limite do upload: base64 infla ~33%; o limite abaixo é sobre os BYTES
// DECODIFICADOS. Manter em sincronia com o client e o Nginx da VM.
const MAX_ARQUIVO_BYTES = 5 * 1024 * 1024; // 5 MB por arquivo
const MAX_DOCS = 30;
const RE_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Aceita PDF (%PDF), JPEG (FF D8 FF) ou PNG (89 50 4E 47) pela assinatura dos
// primeiros bytes, evitando upload de outros tipos de arquivo.
function assinaturaAceita(bytes: Buffer): boolean {
  const pdf =
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  return pdf || jpeg || png;
}

function cookieDe(
  req: NextRequest,
  sessao: Parameters<typeof garantirSessaoNoIdps>[0],
): Promise<string> {
  const idps = Number(req.nextUrl.searchParams.get("idps"));
  return Number.isInteger(idps) && idps > 0
    ? garantirSessaoNoIdps(sessao, idps)
    : Promise.resolve(sessao.rmCookie);
}

// BFF — documentos exigidos (?idAreaOfertada=) ou já enviados (?numeroInscricao=&enviados=1).
export async function GET(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  const p = req.nextUrl.searchParams;
  const rmCookie = await cookieDe(req, sessao);

  try {
    if (p.get("enviados") === "1") {
      const numeroInscricao = Number(p.get("numeroInscricao"));
      if (!Number.isInteger(numeroInscricao) || numeroInscricao <= 0) {
        return NextResponse.json(
          { ok: false, erro: "numero-invalido" },
          { status: 400 },
        );
      }
      const documentos = await listarDocumentosCandidatoMatricula(
        rmCookie,
        numeroInscricao,
      );
      return NextResponse.json(
        { ok: true, documentos },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const idAreaOfertada = Number(p.get("idAreaOfertada"));
    if (!Number.isInteger(idAreaOfertada) || idAreaOfertada <= 0) {
      return NextResponse.json(
        { ok: false, erro: "area-invalida" },
        { status: 400 },
      );
    }
    const exigidos = await obterDocumentosExigidosMatricula(
      rmCookie,
      idAreaOfertada,
    );

    // Documentos já enviados na inscrição que podem ser pré-anexados na matrícula
    // (aparecem primeiro no passo). Só quando a inscrição (numeroInscricao/idps)
    // vier na query; falha silenciosa não bloqueia o passo.
    const idps = Number(p.get("idps"));
    const numeroInscricao = Number(p.get("numeroInscricao"));
    let reaproveitados: Awaited<
      ReturnType<typeof obterDocumentosReaproveitaveisMatricula>
    > = [];
    if (
      Number.isInteger(idps) &&
      idps > 0 &&
      Number.isInteger(numeroInscricao) &&
      numeroInscricao > 0
    ) {
      try {
        reaproveitados = await obterDocumentosReaproveitaveisMatricula(
          rmCookie,
          { codColigada: COD_COLIGADA, idps, numeroInscricao, idAreaOfertada },
        );
      } catch (e) {
        console.error("[matricula/documentos] reaproveitados falhou:", e);
      }
    }

    return NextResponse.json(
      { ok: true, exigidos, reaproveitados },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/documentos] GET falhou:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}

interface UploadBody {
  idAreaOfertada?: number;
  numeroInscricao?: number;
  idps?: number;
  /**
   * Upload incremental (um arquivo por vez, feito ao selecionar). Quando `true`,
   * a validação NÃO exige que todos os obrigatórios estejam presentes no payload
   * — a completude é garantida no cliente antes de finalizar a matrícula.
   */
  parcial?: boolean;
  documentos?: Array<{
    codDocumento?: number;
    detalhe?: string;
    nomeArquivo?: string;
    arquivoBase64?: string;
    /**
     * Quando `true`, o arquivo NÃO vem no payload: o servidor reaproveita o
     * documento já enviado na inscrição (baixa o base64 pela chave do mapa de
     * reaproveitamento). Nesse caso `arquivoBase64`/`nomeArquivo` são ignorados.
     */
    reaproveitarDaInscricao?: boolean;
  }>;
}

/**
 * Valida os documentos enviados contra a lista exigida (autoritativa) do RM:
 * só aceita CODDOCUMENTO exigido, exige arquivo para os obrigatórios e checa
 * base64/assinatura %PDF/tamanho. O DETALHE gravado vem sempre da configuração.
 * Itens marcados como `reaproveitarDaInscricao` têm o arquivo baixado da
 * inscrição no servidor (nunca confiando no base64 do cliente).
 */
async function validar(
  rmCookie: string,
  ctx: {
    idAreaOfertada: number;
    numeroInscricao: number;
    idps: number;
    codColigada: number;
  },
  enviados: UploadBody["documentos"],
  parcial: boolean,
): Promise<
  | { ok: true; documentos: DocumentoMatriculaUpload[] }
  | { ok: false; erro: string; mensagem?: string }
> {
  const exigidos = await obterDocumentosExigidosMatricula(
    rmCookie,
    ctx.idAreaOfertada,
  );
  const porCodigo = new Map(
    exigidos
      .filter((d) => d.codDocumento != null)
      .map((d) => [d.codDocumento as number, d]),
  );

  const lista = Array.isArray(enviados) ? enviados : [];
  if (lista.length > MAX_DOCS) {
    return { ok: false, erro: "documentos-invalidos" };
  }

  // Carregado sob demanda apenas quando há item reaproveitado.
  let arquivosInscricao: Awaited<
    ReturnType<typeof mapaArquivosInscricaoPorCod>
  > | null = null;

  const validados: DocumentoMatriculaUpload[] = [];
  for (const d of lista) {
    const cod = Number(d?.codDocumento);
    if (!Number.isInteger(cod)) continue; // ignora item sem código
    const exig = porCodigo.get(cod);
    if (!exig) {
      return { ok: false, erro: "documento-nao-exigido" };
    }

    let nome: string;
    let b64: string;

    if (d?.reaproveitarDaInscricao) {
      // Reaproveitamento: o servidor localiza e baixa o arquivo da inscrição.
      if (!arquivosInscricao) {
        arquivosInscricao = await mapaArquivosInscricaoPorCod({
          codColigada: ctx.codColigada,
          idps: ctx.idps,
          numeroInscricao: ctx.numeroInscricao,
        });
      }
      const chave = resolverChaveReaproveitamento(cod, arquivosInscricao);
      if (!chave) {
        return {
          ok: false,
          erro: "documento-inscricao-ausente",
          mensagem:
            "O documento enviado na inscrição não foi encontrado para reaproveitamento.",
        };
      }
      const baixado = await baixarArquivoDocumento(rmCookie, chave);
      if (!baixado) {
        return {
          ok: false,
          erro: "download-falhou",
          mensagem:
            "Não foi possível recuperar o documento enviado na inscrição. Anexe o arquivo manualmente.",
        };
      }
      nome = baixado.nomeArquivo;
      // Defensivo: remove um eventual prefixo data: para manter base64 puro.
      b64 = baixado.base64.trim().replace(/^data:[^,]*,/, "");
    } else {
      nome = (d?.nomeArquivo ?? "").trim();
      b64 = (d?.arquivoBase64 ?? "").trim();
      if (!nome || !b64) continue; // ignora item vazio
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
        mensagem: "Cada arquivo deve ter no máximo 5 MB.",
      };
    }
    // Assinatura de PDF, JPEG ou PNG.
    if (!assinaturaAceita(bytes)) {
      return {
        ok: false,
        erro: "documento-formato",
        mensagem: "Envie os documentos em formato PDF, JPG ou PNG.",
      };
    }
    validados.push({
      codDocumento: cod,
      detalhe: exig.descricao ?? "",
      nomeArquivo: nome,
      arquivoBase64: b64,
    });
  }

  const enviadosCod = new Set(validados.map((v) => v.codDocumento));
  const faltando = exigidos.filter(
    (d) =>
      d.obrigatorio &&
      d.codDocumento != null &&
      !enviadosCod.has(d.codDocumento),
  );
  if (!parcial && faltando.length > 0) {
    return {
      ok: false,
      erro: "documentos-obrigatorios",
      mensagem: `Anexe os documentos obrigatórios: ${faltando
        .map((d) => d.descricao)
        .join(", ")}.`,
    };
  }

  return { ok: true, documentos: validados };
}

// BFF — upload dos documentos exigidos da matrícula (escrita). Exige sessão.
export async function POST(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  if (matriculaSomenteLeitura()) {
    return NextResponse.json(
      {
        ok: false,
        erro: "somente-leitura",
        mensagem:
          "Ambiente em modo somente leitura: o envio de documentos está desativado enquanto o sistema aponta para a base de produção.",
      },
      { status: 503 },
    );
  }

  let body: UploadBody;
  try {
    body = (await req.json()) as UploadBody;
  } catch {
    return NextResponse.json(
      { ok: false, erro: "payload-invalido" },
      { status: 400 },
    );
  }

  const idAreaOfertada = Number(body.idAreaOfertada);
  const numeroInscricao = Number(body.numeroInscricao);
  if (
    !Number.isInteger(idAreaOfertada) ||
    idAreaOfertada <= 0 ||
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0
  ) {
    return NextResponse.json(
      { ok: false, erro: "parametros-invalidos" },
      { status: 400 },
    );
  }

  const rmCookie = await cookieDe(req, sessao);
  const idps =
    Number(req.nextUrl.searchParams.get("idps")) || Number(body.idps) || 0;
  const parcial =
    req.nextUrl.searchParams.get("parcial") === "1" || body.parcial === true;

  try {
    const validado = await validar(
      rmCookie,
      { idAreaOfertada, numeroInscricao, idps, codColigada: COD_COLIGADA },
      body.documentos,
      parcial,
    );
    if (!validado.ok) {
      return NextResponse.json(
        { ok: false, erro: validado.erro, mensagem: validado.mensagem },
        { status: 400 },
      );
    }

    const r = await enviarDocumentosMatricula(
      rmCookie,
      idAreaOfertada,
      numeroInscricao,
      validado.documentos,
    );
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, erro: "upload-falhou", mensagem: r.erro },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/documentos] POST falhou:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}

// BFF — remoção de um documento enviado (escrita). Exige sessão.
export async function DELETE(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  if (matriculaSomenteLeitura()) {
    return NextResponse.json(
      { ok: false, erro: "somente-leitura" },
      { status: 503 },
    );
  }

  const p = req.nextUrl.searchParams;
  const numeroInscricao = Number(p.get("numeroInscricao"));
  const nomeOriginal = (p.get("nomeOriginal") ?? "").trim();
  if (
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0 ||
    !nomeOriginal
  ) {
    return NextResponse.json(
      { ok: false, erro: "parametros-invalidos" },
      { status: 400 },
    );
  }

  const rmCookie = await cookieDe(req, sessao);

  try {
    const r = await removerDocumentoMatricula(
      rmCookie,
      numeroInscricao,
      nomeOriginal,
    );
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, erro: "remocao-falhou", mensagem: r.erro },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[matricula/documentos] DELETE falhou:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
