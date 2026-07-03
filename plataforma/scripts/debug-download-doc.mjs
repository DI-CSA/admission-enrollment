// DEBUG WebAPI (LEITURA) — descobre a rota REST de LISTAGEM/DOWNLOAD de arquivos
// do candidato na Central do Candidato (EduPSAreaOfertadaController:
// InscriptionFiles/DownloadFile). Os arquivos estão gravados NO SERVIDOR de
// arquivos ("file on server" no blob SQL), então só a WebAPI recupera os bytes.
//
// Conta SINTÉTICA (Digo). NÃO imprime a senha. O usuário digita no terminal.
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/debug-download-doc.mjs <cpf> <idps> <numeroInscricao> <codColigada>
// Ex.: node --env-file=.env.local scripts/debug-download-doc.mjs 15737850757 210 14 1

const RM_API_BASE = process.env.RM_API_BASE ?? "";
const WEBAPI = "TOTVSProcessoSeletivo";
const COD_FILIAL = Number(process.env.RM_COD_FILIAL) || 1;

const [, , cpfArg, idpsArg, numArg, colArg] = process.argv;
if (!RM_API_BASE || !cpfArg || !idpsArg || !numArg || !colArg) {
  console.error(
    "Uso: node scripts/debug-download-doc.mjs <cpf> <idps> <numeroInscricao> <codColigada>",
  );
  process.exit(1);
}

function perguntarSenhaOculta(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let senha = "";
    const onData = (ch) => {
      if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(senha);
      } else if (ch === "\u0003") {
        process.exit(1);
      } else if (ch === "\u007f" || ch === "\b") {
        senha = senha.slice(0, -1);
      } else {
        senha += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const cpf = cpfArg.replace(/\D/g, "");
const idps = Number(idpsArg);
const numeroInscricao = Number(numArg);
const codColigada = Number(colArg);
const senha = await perguntarSenhaOculta("Senha (não será exibida): ");
const encodeSenhaRm = (s) =>
  Buffer.from(encodeURIComponent(s)).toString("base64");

function extrairCookie(res) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.length ? cookies.map((c) => c.split(";")[0]).join("; ") : null;
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
const loginData = loginBody?.data ?? loginBody;
console.log("\n== LOGIN ==", loginRes.status, {
  logado: loginData?.LOGADOSUCESSO,
  msg: loginData?.MENSAGEM ?? loginData?.MENSAGEMRETORNO ?? null,
  temCookie: !!cookie,
});
if (!cookie) process.exit(1);

async function getJson(path) {
  const url = `${RM_API_BASE}/${WEBAPI}/${path}`;
  const res = await fetch(url, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const txt = buf.toString("utf8");
  let json = null;
  try {
    json = JSON.parse(txt);
  } catch {
    /* provavelmente HTML de erro */
  }
  return { status: res.status, bytes: buf.length, json, txt };
}

// LISTAGEM (InscriptionFiles/ApplicantRegistries) — o portal usa com sucesso.
// getArquivosCandidato: id = cod|idps|idAreaInteresse ; query = inscriptionNumber=X
// idAreaInteresse do Digo = 590
{
  const idArea = 590;
  const idL = `${codColigada}|${idps}|${idArea}`;
  const q = `inscriptionNumber=${numeroInscricao}`;
  const listas = [
    ["path pipes crus", `CentralCandidato/v1/ApplicantRegistries/${idL}?${q}`],
    [
      "path pipes enc",
      `CentralCandidato/v1/ApplicantRegistries/${encodeURIComponent(idL)}?${q}`,
    ],
    [
      "query id",
      `CentralCandidato/v1/ApplicantRegistries?id=${encodeURIComponent(idL)}&${q}`,
    ],
    [
      "query id+query",
      `CentralCandidato/v1/ApplicantRegistries?id=${encodeURIComponent(idL)}&query=${encodeURIComponent(q)}`,
    ],
  ];
  for (const [rotulo, path] of listas) {
    const r = await getJson(path);
    const arr = Array.isArray(r.json?.data)
      ? r.json.data
      : Array.isArray(r.json)
        ? r.json
        : null;
    console.log(
      `\n== LISTAGEM [${rotulo}] == status ${r.status} bytes ${r.bytes} itens ${arr?.length ?? "-"}`,
    );
    if (arr?.length) {
      console.log(
        "   ex:",
        JSON.stringify(arr[0]).slice(0, 200).replace(/\s+/g, " "),
      );
    } else {
      console.log("   amostra:", r.txt.slice(0, 120).replace(/\s+/g, " "));
    }
  }
}

// DOWNLOAD — chave = COD|IDPS|NUMEROINSCRICAO|NOMEARQUIVO (NOMEARQUIVO cru, com ¶)
// Rota nativa da Central do Candidato:
//   GET CentralCandidato/v1/ApplicantFiles/{chave}  ->  [{ file: base64, fileName }]
const nomes = process.argv.slice(6);
const alvos = nomes.length
  ? nomes
  : ["TESTE_ESCRITA_DIGO_1783085348409¶1-210-14-3.pdf"];

for (const nome of alvos) {
  const chave = `${codColigada}|${idps}|${numeroInscricao}|${nome}`;
  const b64key = Buffer.from(chave, "utf8").toString("base64");
  const semExt = nome.replace(/\.[^.]+$/, "");
  const chaveSemExt = `${codColigada}|${idps}|${numeroInscricao}|${semExt}`;
  // O ".pdf" no fim do path faz o IIS tratar como arquivo estático (404).
  // Testa variantes para achar a forma que o app nativo usa.
  const variantes = [
    // Convenção confirmada na listagem: id + query ambos como query string.
    // Native getArquivoDownload: id = chave, query = '' (vazio).
    [
      "id+query vazio",
      `CentralCandidato/v1/ApplicantFiles?id=${encodeURIComponent(chave)}&query=${encodeURIComponent("")}`,
    ],
    [
      "id só",
      `CentralCandidato/v1/ApplicantFiles?id=${encodeURIComponent(chave)}`,
    ],
    [
      "id b64 + query vazio",
      `CentralCandidato/v1/ApplicantFiles?id=${encodeURIComponent(b64key)}&query=${encodeURIComponent("")}`,
    ],
    [
      "id sem ext + query vazio",
      `CentralCandidato/v1/ApplicantFiles?id=${encodeURIComponent(chaveSemExt)}&query=${encodeURIComponent("")}`,
    ],
  ];
  for (const [rotulo, path] of variantes) {
    const r = await getJson(path);
    const arr = Array.isArray(r.json?.data)
      ? r.json.data
      : Array.isArray(r.json)
        ? r.json
        : null;
    const first = arr?.[0] ?? null;
    const b64 = first?.file ?? first?.File ?? null;
    console.log(
      `\n== DOWNLOAD [${rotulo}] == status ${r.status} bytes ${r.bytes}`,
    );
    if (b64) {
      const bin = Buffer.from(b64, "base64");
      console.log("   fileName:", first.fileName ?? first.FileName);
      console.log(
        "   arquivoBytes:",
        bin.length,
        "início:",
        bin.subarray(0, 8).toString("hex"),
        "%PDF?",
        bin.subarray(0, 4).toString("ascii") === "%PDF",
      );
    } else {
      console.log(
        "   sem 'file'. Amostra:",
        r.txt.slice(0, 120).replace(/\s+/g, " "),
      );
    }
  }
}

console.log("\n>>> Concluído.");
process.exit(0);
