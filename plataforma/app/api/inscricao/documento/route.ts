import { NextRequest, NextResponse } from "next/server";
import { sessaoDaRequisicao } from "@/lib/totvs/sessao-req";
import { garantirSessaoNoIdps } from "@/lib/totvs/session";
import {
  listarDependentesDoResponsavel,
  listarDocumentosInscricao,
  substituirArquivoDocumento,
} from "@/lib/totvs/inscricao";

export const dynamic = "force-dynamic";

// Guard de ambiente idêntico ao do POST de inscrição: enquanto o BFF apontar
// para a base de PRODUÇÃO em desenvolvimento, a gravação fica bloqueada. Falha
// segura: sem a variável, assume-se somente leitura.
function somenteLeitura(): boolean {
  const v = (process.env.INSCRICAO_SOMENTE_LEITURA ?? "true")
    .trim()
    .toLowerCase();
  return (
    v !== "false" && v !== "0" && v !== "off" && v !== "nao" && v !== "não"
  );
}

// Limite de tamanho do arquivo (base64) — ~7MB de base64 ≈ 5MB de binário.
const MAX_BASE64_LEN = 7_000_000;

// BFF — substitui (envia) o arquivo de um documento de uma inscrição. Só é
// permitido quando o documento AINDA NÃO foi conferido pela secretaria
// (podeSubstituir === true). Revalida a posse da inscrição e a permissão no
// servidor antes de gravar no RM.
export async function POST(req: NextRequest) {
  const sessao = sessaoDaRequisicao(req);
  if (!sessao || sessao.codUsuarioPS == null) {
    return NextResponse.json(
      { ok: false, erro: "nao-autenticado" },
      { status: 401 },
    );
  }

  if (somenteLeitura()) {
    return NextResponse.json(
      { ok: false, erro: "somente-leitura" },
      { status: 403 },
    );
  }

  let corpo: {
    numeroInscricao?: unknown;
    idps?: unknown;
    descricao?: unknown;
    nomeArquivo?: unknown;
    arquivoBase64?: unknown;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, erro: "json-invalido" },
      { status: 400 },
    );
  }

  const numeroInscricao = Number(corpo.numeroInscricao);
  const idps = Number(corpo.idps);
  const descricao = String(corpo.descricao ?? "").trim();
  const nomeArquivo = String(corpo.nomeArquivo ?? "").trim();
  const arquivoBase64 = String(corpo.arquivoBase64 ?? "").trim();

  if (
    !Number.isInteger(numeroInscricao) ||
    numeroInscricao <= 0 ||
    !Number.isInteger(idps) ||
    idps <= 0 ||
    descricao === "" ||
    nomeArquivo === "" ||
    arquivoBase64 === ""
  ) {
    return NextResponse.json(
      { ok: false, erro: "parametros-invalidos" },
      { status: 400 },
    );
  }
  if (arquivoBase64.length > MAX_BASE64_LEN) {
    return NextResponse.json(
      { ok: false, erro: "arquivo-muito-grande" },
      { status: 413 },
    );
  }

  try {
    const dependentes = await listarDependentesDoResponsavel(
      sessao.codUsuarioPS,
    );
    const dep = dependentes.find(
      (d) => d.numeroInscricao === numeroInscricao && d.idps === idps,
    );
    if (!dep || dep.codColigada == null || dep.idAreaInteresse == null) {
      return NextResponse.json(
        { ok: false, erro: "inscricao-nao-encontrada" },
        { status: 404 },
      );
    }

    const rmCookie = await garantirSessaoNoIdps(sessao, idps);

    // Revalida a permissão: o documento precisa existir e permitir substituição.
    const documentos = await listarDocumentosInscricao({
      codColigada: dep.codColigada,
      idps,
      idAreaInteresse: dep.idAreaInteresse,
      numeroInscricao,
    });
    const doc = documentos.find((d) => d.descricao === descricao);
    if (!doc) {
      return NextResponse.json(
        { ok: false, erro: "documento-nao-encontrado" },
        { status: 404 },
      );
    }
    if (!doc.podeSubstituir) {
      return NextResponse.json(
        { ok: false, erro: "documento-conferido" },
        { status: 409 },
      );
    }

    const resultado = await substituirArquivoDocumento({
      rmCookie,
      codColigada: dep.codColigada,
      idps,
      numeroInscricao,
      descricao: doc.descricao,
      nomeArquivo,
      arquivoBase64,
    });
    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, erro: resultado.erro ?? "falha-upload" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[inscricao/documento] falha:", e);
    return NextResponse.json(
      { ok: false, erro: "indisponivel" },
      { status: 503 },
    );
  }
}
