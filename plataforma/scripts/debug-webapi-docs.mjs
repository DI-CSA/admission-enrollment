// DEBUG WebAPI: reproduz EXATAMENTE as chamadas de documentos da lib
// (SelectionProcesses + ApplicantRegistries) para uma inscrição, imprimindo o
// JSON cru. A senha é digitada no terminal (não fica em log nem no código).
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/debug-webapi-docs.mjs <cpf> <idps> <numeroInscricao> <idAreaInteresse>
// Ex.: node --env-file=.env.local scripts/debug-webapi-docs.mjs 87808726036 210 4 590

import readline from "node:readline";

const RM_API_BASE = process.env.RM_API_BASE ?? "";
const WEBAPI = "TOTVSProcessoSeletivo";
const COD_COLIGADA = Number(process.env.RM_COD_COLIGADA) || 1;
const COD_FILIAL = Number(process.env.RM_COD_FILIAL) || 1;

const [, , cpfArg, idpsArg, numArg, areaArg] = process.argv;
if (!RM_API_BASE || !cpfArg || !idpsArg || !numArg || !areaArg) {
  console.error(
    "Uso: node scripts/debug-webapi-docs.mjs <cpf> <idps> <numeroInscricao> <idAreaInteresse>",
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
const idAreaInteresse = Number(areaArg);
const senha = await perguntarSenhaOculta("Senha (não será exibida): ");
const encodeSenhaRm = (s) =>
  Buffer.from(encodeURIComponent(s)).toString("base64");

function extrairCookie(res) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.length ? cookies.map((c) => c.split(";")[0]).join("; ") : null;
}

async function getJson(url, cookie) {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    cache: "no-store",
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, body };
}

// 1) Login
const loginRes = await fetch(`${RM_API_BASE}/${WEBAPI}/v1/Login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    CodColigada: COD_COLIGADA,
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
  cod: loginBody?.data?.CODUSUARIOPS,
  temCookie: !!cookie,
});
if (!cookie) {
  console.error("Sem cookie de sessão — abortando.");
  process.exit(1);
}

const idExig = `${COD_COLIGADA}|${idps}|${idAreaInteresse}|${numeroInscricao}`;
const idArq = `${COD_COLIGADA}|${idps}|${idAreaInteresse}`;

// 2) SelectionProcesses (como a lib: id via URLSearchParams = pipe encodado)
console.log("\n== SelectionProcesses (id encodado %7C) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/SelectionProcesses?${new URLSearchParams(
        { id: idExig },
      ).toString()}&expand=RequiredDocument`,
      cookie,
    ),
    null,
    1,
  ),
);

// 2b) SelectionProcesses com pipe LITERAL (sem encodar)
console.log("\n== SelectionProcesses (id literal |) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/SelectionProcesses?id=${idExig}&expand=RequiredDocument`,
      cookie,
    ),
    null,
    1,
  ),
);

// 3) ApplicantRegistries (como a lib)
console.log("\n== ApplicantRegistries (id encodado) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/ApplicantRegistries?${new URLSearchParams(
        { id: idArq, inscriptionNumber: String(numeroInscricao) },
      ).toString()}`,
      cookie,
    ),
    null,
    1,
  ),
);

// 3b) ApplicantRegistries com pipe LITERAL
console.log("\n== ApplicantRegistries (id literal |) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/ApplicantRegistries?id=${idArq}&inscriptionNumber=${numeroInscricao}`,
      cookie,
    ),
    null,
    1,
  ),
);

// 4) VARIANTE SEGMENTO DE PATH — hipótese: a rota WebAPI exige o id no path
//    (`[Route(".../{id}")]`); sem ele, 404. Testa pipe encodado e literal.
const idExigEnc = encodeURIComponent(idExig);
const idArqEnc = encodeURIComponent(idArq);

console.log("\n== SelectionProcesses (id no PATH, encodado %7C) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/SelectionProcesses/${idExigEnc}?expand=RequiredDocument`,
      cookie,
    ),
    null,
    1,
  ),
);

console.log("\n== SelectionProcesses (id no PATH, literal |) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/SelectionProcesses/${idExig}?expand=RequiredDocument`,
      cookie,
    ),
    null,
    1,
  ),
);

console.log("\n== ApplicantRegistries (id no PATH, encodado) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/ApplicantRegistries/${idArqEnc}?inscriptionNumber=${numeroInscricao}`,
      cookie,
    ),
    null,
    1,
  ),
);

console.log("\n== ApplicantRegistries (id no PATH, literal |) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/ApplicantRegistries/${idArq}?inscriptionNumber=${numeroInscricao}`,
      cookie,
    ),
    null,
    1,
  ),
);

// 5) NOMES REAIS DA DLL (RM.EduPS.WebAPI.XML) — o JS do portal (SelectionProcesses/
//    ApplicantRegistries) está defasado; o controller EduPSAreaOfertadaController
//    expõe AvailableCourse / InscriptionFiles / DownloadFile / UploadFiles.
console.log("\n== AvailableCourse (?id, expand) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/AvailableCourse?id=${idExig}&expand=RequiredDocument`,
      cookie,
    ),
    null,
    1,
  ),
);

console.log("\n== InscriptionFiles (?id, inscriptionNumber) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/InscriptionFiles?id=${idArq}&inscriptionNumber=${numeroInscricao}`,
      cookie,
    ),
    null,
    1,
  ),
);

console.log("\n== InscriptionFiles (?id completo) ==");
console.log(
  JSON.stringify(
    await getJson(
      `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/InscriptionFiles?id=${idExig}`,
      cookie,
    ),
    null,
    1,
  ),
);

console.log("\n>>> Concluído.");
process.exit(0);
