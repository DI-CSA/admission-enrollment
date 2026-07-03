import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import {
  obterDocumentosExigidosMatricula,
  listarDocumentosCandidatoMatricula,
  enviarDocumentosMatricula,
  removerDocumentoMatricula,
  matriculaSomenteLeitura,
  type DocumentoMatriculaUpload,
} from "@/lib/totvs/matricula";

export const dynamic = "force-dynamic";

// Limite do upload: base64 infla ~33%; o limite abaixo é sobre os BYTES
// DECODIFICADOS. Manter em sincronia com o client e o Nginx da VM.
const MAX_ARQUIVO_BYTES = 5 * 1024 * 1024; // 5 MB por arquivo
const MAX_DOCS = 30;
const RE_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

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
    return NextResponse.json(
      { ok: true, exigidos },
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
  documentos?: Array<{
    codDocumento?: number;
    detalhe?: string;
    nomeArquivo?: string;
    arquivoBase64?: string;
  }>;
}

/**
 * Valida os documentos enviados contra a lista exigida (autoritativa) do RM:
 * só aceita CODDOCUMENTO exigido, exige arquivo para os obrigatórios e checa
 * base64/assinatura %PDF/tamanho. O DETALHE gravado vem sempre da configuração.
 */
async function validar(
  rmCookie: string,
  idAreaOfertada: number,
  enviados: UploadBody["documentos"],
): Promise<
  | { ok: true; documentos: DocumentoMatriculaUpload[] }
  | { ok: false; erro: string; mensagem?: string }
> {
  const exigidos = await obterDocumentosExigidosMatricula(
    rmCookie,
    idAreaOfertada,
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

  const validados: DocumentoMatriculaUpload[] = [];
  for (const d of lista) {
    const cod = Number(d?.codDocumento);
    const nome = (d?.nomeArquivo ?? "").trim();
    const b64 = (d?.arquivoBase64 ?? "").trim();
    if (!Number.isInteger(cod) || !nome || !b64) continue; // ignora item vazio
    const exig = porCodigo.get(cod);
    if (!exig) {
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
    // Assinatura %PDF (25 50 44 46).
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
  if (faltando.length > 0) {
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

  try {
    const validado = await validar(rmCookie, idAreaOfertada, body.documentos);
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
