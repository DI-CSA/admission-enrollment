// TESTE de UPLOAD de documentos da MATRÍCULA via WebAPI (ESCRITA REAL no RM).
// Envia os arquivos de docs/sample_docs para um candidato, um a um, e mostra:
//   - se o POST foi aceito (efetivamente enviado);
//   - como a WebAPI CONVERTE o nome do arquivo (sufixo com códigos), lendo de volta
//     via DocumentosCandidatoMatricula.
//
// ⚠️ Grava de verdade no RM (ignora a flag MATRICULA_SOMENTE_LEITURA, que é do BFF).
//    Use com um candidato de TESTE. Default: FILHO DIOGO #1 (inscrição 14, área 590).
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.prod scripts/debug-matricula-upload.mjs \
//        [cpfResponsavel] [idps] [numeroInscricao] [idAreaOfertada] [codColigada]
// Ex.: node --env-file=.env.prod scripts/debug-matricula-upload.mjs 15737850757 210 14 590 1
//
// A senha é pedida de forma oculta (não vai por argumento nem fica no histórico).

import readline from "node:readline";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RM_API_BASE = process.env.RM_API_BASE ?? "";
const WEBAPI = "TOTVSProcessoSeletivo";
const COD_FILIAL = Number(process.env.RM_COD_FILIAL) || 1;

const [, , cpfArg, idpsArg, numArg, areaArg, colArg] = process.argv;
const cpf = (cpfArg ?? "15737850757").replace(/\D/g, "");
const idps = Number(idpsArg ?? 210);
const numeroInscricao = Number(numArg ?? 14);
const idAreaOfertada = Number(areaArg ?? 590);
const codColigada = Number(colArg ?? 1);

if (!RM_API_BASE) {
  console.error(
    "RM_API_BASE ausente. Rode com --env-file=.env.prod (ou .env.homolog).",
  );
  process.exit(1);
}

const SAMPLE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/sample_docs",
);

const encodeSenhaRm = (s) =>
  Buffer.from(encodeURIComponent(s)).toString("base64");
const extToMime = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function perguntarSenhaOculta(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const onData = () => {
      process.stdout.write(
        "\x1B[2K\x1B[200D" + prompt + "*".repeat(rl.line.length),
      );
    };
    process.stdin.on("data", onData);
    rl.question(prompt, (value) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(value);
    });
  });
}

function extrairCookie(res) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.length ? cookies.map((c) => c.split(";")[0]).join("; ") : null;
}

function desembrulhar(json) {
  let corpo =
    json && typeof json === "object" && "data" in json ? json.data : json;
  if (
    corpo &&
    typeof corpo === "object" &&
    !Array.isArray(corpo) &&
    "data" in corpo
  ) {
    corpo = corpo.data;
  }
  if (Array.isArray(corpo)) return corpo;
  if (corpo && typeof corpo === "object") return [corpo];
  return [];
}

async function getJson(url, cookie) {
  const res = await fetch(url, {
    headers: { ...(cookie ? { Cookie: cookie } : {}) },
    cache: "no-store",
  });
  let out;
  try {
    out = await res.json();
  } catch {
    out = null;
  }
  return { status: res.status, body: out };
}

async function postJson(url, cookie, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let out;
  try {
    out = await res.json();
  } catch {
    out = await res.text().catch(() => null);
  }
  return { status: res.status, body: out };
}

// CODDOCUMENTO a partir do nome do arquivo de amostra (prefixo numérico; foto -> 2).
function codDocumentoDoArquivo(nome) {
  if (/^foto/i.test(nome)) return 2;
  const m = nome.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

console.log("== Alvo ==", {
  cpf,
  idps,
  numeroInscricao,
  idAreaOfertada,
  codColigada,
  RM_API_BASE,
});
console.log("== Amostras ==", SAMPLE_DIR);

const senha = await perguntarSenhaOculta(
  "Senha do responsável (não será exibida): ",
);

// 1) LOGIN
const loginRes = await fetch(`${RM_API_BASE}/${WEBAPI}/v1/Login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    CodColigada: codColigada,
    CodFilial: COD_FILIAL,
    IdPs: idps,
    TipoIdentificacao: 0,
    Login: cpf,
    Senha: encodeSenhaRm(senha),
    GuidsReservaVaga: "",
  }),
  cache: "no-store",
});
const cookie = extrairCookie(loginRes);
const loginBody = await loginRes.json().catch(() => null);
console.log("\n== LOGIN ==", loginRes.status, {
  logado: loginBody?.data?.LOGADOSUCESSO,
  temCookie: !!cookie,
});
if (!cookie) {
  console.error(
    "Sem cookie de sessão — senha incorreta? (master-key devolve cookie vazio).",
  );
  process.exit(1);
}

// 2) DOCUMENTOS EXIGIDOS (para DETALHE/DESCRICAO por CODDOCUMENTO)
const exig = await getJson(
  `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/DocumentosExigidosMatricula?idAreaOfertada=${idAreaOfertada}`,
  cookie,
);
const descricaoPorCod = new Map();
for (const d of desembrulhar(exig.body)) {
  const cod = d.CODDOCUMENTO ?? d.CodDocumento;
  const desc = d.DESCRICAO ?? d.Descricao;
  if (cod != null) descricaoPorCod.set(Number(cod), desc ?? "");
}
console.log(
  `\n== EXIGIDOS (${descricaoPorCod.size}) ==`,
  [...descricaoPorCod.entries()]
    .map(([c, d]) => `${c}:${d?.trim?.()}`)
    .join(" | "),
);

// 3) ESTADO ANTES
const antes = await getJson(
  `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/DocumentosCandidatoMatricula?numeroInscricao=${numeroInscricao}`,
  cookie,
);
console.log(
  `\n== ANTES: ${desembrulhar(antes.body).length} documento(s) no candidato ==`,
);

// 4) UPLOAD (um por vez), com o NOME CRU (a WebAPI converte server-side)
const arquivos = readdirSync(SAMPLE_DIR)
  .filter((f) => /\.(pdf|jpe?g|png)$/i.test(f))
  .sort();

let ok = 0,
  falhas = 0;
for (const nome of arquivos) {
  const cod = codDocumentoDoArquivo(nome);
  if (cod == null) {
    console.log(`  - ${nome}: SEM CODDOCUMENTO reconhecível — pulado`);
    continue;
  }
  if (!descricaoPorCod.has(cod)) {
    console.log(
      `  - ${nome} (cod ${cod}): não está na lista de exigidos da área — pulado`,
    );
    continue;
  }
  const base64 = readFileSync(path.join(SAMPLE_DIR, nome)).toString("base64");
  const item = {
    CODDOCUMENTO: cod,
    DETALHE: descricaoPorCod.get(cod) || nome,
    NOMEARQUIVO: nome, // nome CRU — a WebAPI adiciona os códigos
    NOMEORIGINAL: nome,
    ARQUIVO: base64, // base64 puro
  };
  const url =
    `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/UploadDocumentosMatricula` +
    `?idAreaOfertada=${idAreaOfertada}&numeroInscricao=${numeroInscricao}`;
  const r = await postJson(url, cookie, { SPSDOCUMENTOSEXIGIDOS: [item] });
  const erro =
    r.body && typeof r.body === "object"
      ? Object.keys(r.body.data ?? r.body).find((k) => /exception/i.test(k))
      : null;
  if (r.status >= 200 && r.status < 300 && !erro) {
    ok++;
    console.log(
      `  ✓ ${nome} (cod ${cod}, ${(base64.length / 1.37 / 1024).toFixed(1)} KB) -> HTTP ${r.status}`,
    );
  } else {
    falhas++;
    console.log(
      `  ✗ ${nome} (cod ${cod}) -> HTTP ${r.status} ${erro ? "| " + JSON.stringify(r.body).slice(0, 300) : JSON.stringify(r.body).slice(0, 300)}`,
    );
  }
}

// 5) ESTADO DEPOIS — mostra como o RM guardou (nome convertido)
const depois = await getJson(
  `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/DocumentosCandidatoMatricula?numeroInscricao=${numeroInscricao}`,
  cookie,
);
const lista = desembrulhar(depois.body);
console.log(`\n== DEPOIS: ${lista.length} documento(s) no candidato ==`);
for (const d of lista) {
  const cod = d.CODDOCUMENTO ?? d.CodDocumento ?? "?";
  const det = d.DETALHE ?? d.Detalhe ?? "";
  const nomeOrig = d.NOMEORIGINAL ?? d.NomeOriginal ?? "";
  console.log(`  cod ${cod} | nomeOriginal=[${nomeOrig}] | ${det?.trim?.()}`);
}

console.log(`\n>>> Enviados OK: ${ok} | Falhas: ${falhas}`);
console.log(
  ">>> Confira no banco: SELECT NOMEARQUIVO, DETALHE, DATAENVIO FROM SPSARQUIVOSCANDIDATO " +
    `WHERE IDPS=${idps} AND NUMEROINSCRICAO=${numeroInscricao} ORDER BY DATAENVIO DESC;`,
);
process.exit(0);
