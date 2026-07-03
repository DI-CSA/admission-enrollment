// DEBUG WebAPI (ESCRITA) — testa se o endpoint de upload/substituição de
// documento responde nesta implantação. Conta SINTÉTICA (dados serão apagados).
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/debug-webapi-upload.mjs <cpf> <idps> <numeroInscricao> <codColigada> <codDocumento> <detalhe>
// Ex.: node --env-file=.env.local scripts/debug-webapi-upload.mjs 15737850757 210 14 1 37 "Documento comprobatório do EX-ALUNO"

import readline from "node:readline";

const RM_API_BASE = process.env.RM_API_BASE ?? "";
const WEBAPI = "TOTVSProcessoSeletivo";
const COD_FILIAL = Number(process.env.RM_COD_FILIAL) || 1;

const [, , cpfArg, idpsArg, numArg, colArg, codDocArg, detalheArg] =
  process.argv;
if (!RM_API_BASE || !cpfArg || !idpsArg || !numArg || !colArg || !codDocArg) {
  console.error(
    "Uso: node scripts/debug-webapi-upload.mjs <cpf> <idps> <numeroInscricao> <codColigada> <codDocumento> <detalhe>",
  );
  process.exit(1);
}

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

const cpf = cpfArg.replace(/\D/g, "");
const idps = Number(idpsArg);
const numeroInscricao = Number(numArg);
const codColigada = Number(colArg);
const codDocumento = Number(codDocArg);
const detalhe = detalheArg ?? "";
const senha = await perguntarSenhaOculta("Senha (não será exibida): ");
const encodeSenhaRm = (s) =>
  Buffer.from(encodeURIComponent(s)).toString("base64");

// PDF mínimo válido (assinatura %PDF), em base64.
const pdfMinimo =
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
const base64 = Buffer.from(pdfMinimo, "latin1").toString("base64");
const nomeArquivo = `TESTE_ESCRITA_DIGO_${Date.now()}.pdf`;

function extrairCookie(res) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.length ? cookies.map((c) => c.split(";")[0]).join("; ") : null;
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

// Login
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
if (!cookie) process.exit(1);

const item = {
  CODCOLIGADA: codColigada,
  IDPS: idps,
  NUMEROINSCRICAO: numeroInscricao,
  CODDOCUMENTO: codDocumento,
  DETALHE: detalhe,
  NOMEARQUIVO: nomeArquivo,
  NOMEORIGINAL: nomeArquivo,
};

// Variante A: ARQUIVO objeto {Arquivo: base64}
const modelA = {
  SPSDOCUMENTOSEXIGIDOS: [{ ...item, ARQUIVO: { Arquivo: base64 } }],
};
// Variante B: ARQUIVO string base64 pura
const modelB = {
  SPSDOCUMENTOSEXIGIDOS: [{ ...item, ARQUIVO: base64 }],
};

const alvos = [
  [
    "ApplicantFilesUpload (JS) + ARQUIVO obj",
    "CentralCandidato/v1/ApplicantFilesUpload",
    modelA,
  ],
  [
    "ApplicantFilesUpload (JS) + ARQUIVO str",
    "CentralCandidato/v1/ApplicantFilesUpload",
    modelB,
  ],
  [
    "UploadFiles (DLL) + ARQUIVO obj",
    "CentralCandidato/v1/UploadFiles",
    modelA,
  ],
];

for (const [rotulo, method, model] of alvos) {
  console.log(`\n== ${rotulo} ==`);
  const r = await postJson(`${RM_API_BASE}/${WEBAPI}/${method}`, cookie, model);
  console.log(JSON.stringify(r, null, 1).slice(0, 1500));
}

console.log("\n>>> Concluído.");
process.exit(0);
