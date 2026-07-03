// DEBUG WebAPI (LEITURA) — inspeciona a situação financeira/pagamento da taxa de
// inscrição pela API EduPS. Objetivo: descobrir quais campos indicam se o boleto
// foi PAGO (baixa), data e valor. Conta SINTÉTICA (leitura, sem efeitos).
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/debug-financeiro-status.mjs <cpf> <idps> <numeroInscricao> <codColigada>
// Ex.: node --env-file=.env.local scripts/debug-financeiro-status.mjs 15737850757 210 14 1

import readline from "node:readline";

const RM_API_BASE = process.env.RM_API_BASE ?? "";
const WEBAPI = "TOTVSProcessoSeletivo";
const COD_FILIAL = Number(process.env.RM_COD_FILIAL) || 1;

const [, , cpfArg, idpsArg, numArg, colArg] = process.argv;
if (!RM_API_BASE || !cpfArg || !idpsArg || !numArg || !colArg) {
  console.error(
    "Uso: node scripts/debug-financeiro-status.mjs <cpf> <idps> <numeroInscricao> <codColigada>",
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
const senha = await perguntarSenhaOculta("Senha (não será exibida): ");
const encodeSenhaRm = (s) =>
  Buffer.from(encodeURIComponent(s)).toString("base64");

function extrairCookie(res) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.length ? cookies.map((c) => c.split(";")[0]).join("; ") : null;
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

const alvos = [
  [
    "InfoBoletoInscricao",
    `Financeiro/InfoBoletoInscricao?numeroInscricao=${numeroInscricao}`,
  ],
  [
    "GetLancamentosAluno (calcularValorLiquido=true)",
    `Financeiro/v1/GetLancamentosAluno?numeroInscricao=${numeroInscricao}&calcularValorLiquido=true`,
  ],
  [
    "GetLancamentosAluno (sem calc)",
    `Financeiro/v1/GetLancamentosAluno?numeroInscricao=${numeroInscricao}`,
  ],
];

for (const [rotulo, path] of alvos) {
  console.log(`\n== ${rotulo} ==`);
  const r = await getJson(`${RM_API_BASE}/${WEBAPI}/${path}`, cookie);
  console.log("status:", r.status);
  console.log(JSON.stringify(r.body, null, 1).slice(0, 4000));
}

console.log("\n>>> Concluído.");
process.exit(0);
