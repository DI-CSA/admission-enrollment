// DEBUG WebAPI (LEITURA) — inspeciona CentralCandidato/v1/StatusCadastro para
// mapear o campo "STATUS DA INSCRIÇÃO" do comprovante (STATUS 0/1/2 + ORDEMEXCEDENTE).
// Conta SINTÉTICA (Digo). NÃO imprime a senha. O usuário digita no terminal.
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/debug-statuscadastro.mjs <cpf> <idps> <numeroInscricao> <codColigada>

const RM_API_BASE = process.env.RM_API_BASE ?? "";
const WEBAPI = "TOTVSProcessoSeletivo";
const COD_FILIAL = Number(process.env.RM_COD_FILIAL) || 1;

const [, , cpfArg, idpsArg, numArg, colArg] = process.argv;
if (!RM_API_BASE || !cpfArg || !idpsArg || !numArg || !colArg) {
  console.error(
    "Uso: node scripts/debug-statuscadastro.mjs <cpf> <idps> <numeroInscricao> <codColigada>",
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
  temCookie: !!cookie,
});
if (!cookie) process.exit(1);

const url = `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/StatusCadastro?numeroInscricao=${numeroInscricao}`;
const res = await fetch(url, {
  headers: { Cookie: cookie },
  cache: "no-store",
});
const txt = await res.text();
let json = null;
try {
  json = JSON.parse(txt);
} catch {
  /* HTML de erro */
}
const arr = Array.isArray(json?.data)
  ? json.data
  : Array.isArray(json)
    ? json
    : null;
console.log(`\n== StatusCadastro == status ${res.status}`);
if (arr) {
  console.log("itens:", arr.length);
  console.log("registro[0]:", JSON.stringify(arr[0], null, 2));
} else {
  console.log("resposta bruta:", txt.slice(0, 300));
}

console.log("\n>>> Concluído.");
process.exit(0);
