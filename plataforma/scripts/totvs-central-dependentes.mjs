// Experimento decisivo: reproduz o caminho REAL da Central do Candidato.
//
//   1) POST v1/Login            -> autentica o responsável e captura o cookie de sessão
//   2) GET  CandidatosDependentes -> lista os candidatos vinculados (SEM parâmetros;
//                                     tudo vem do cookie: usuário + PS + coligada)
//
// A senha NUNCA aparece no código nem em log: é digitada direto no terminal (stdin
// oculto) e só trafega no POST de login.
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/totvs-central-dependentes.mjs <cpf> <idps>
//   (o script vai pedir a senha; digite direto no terminal — não fica em log)
//
// Ex.: node --env-file=.env.local scripts/totvs-central-dependentes.mjs 87808726036 210
//
// Requer RM_API_BASE no .env.local (mesma base usada pelo app).

import readline from "node:readline";

const RM_API_BASE = process.env.RM_API_BASE ?? "";
const WEBAPI = "TOTVSProcessoSeletivo";
const COD_COLIGADA = Number(process.env.RM_COD_COLIGADA) || 1;
const COD_FILIAL = Number(process.env.RM_COD_FILIAL) || 1;

const [, , cpfArg, idpsArg] = process.argv;

if (!RM_API_BASE) {
  console.error("ERRO: RM_API_BASE não configurado no .env.local");
  process.exit(1);
}
if (!cpfArg || !idpsArg) {
  console.error(
    "Uso: node scripts/totvs-central-dependentes.mjs <cpf> <idps>  (a senha é pedida no terminal)",
  );
  process.exit(1);
}

// Lê a senha do terminal sem ecoar os caracteres (mascara com *).
function perguntarSenhaOculta(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const onData = (buf) => {
      const ch = buf.toString("utf8");
      if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        process.stdin.removeListener("data", onData);
      } else {
        process.stdout.write(
          "\x1B[2K\x1B[200D" + prompt + "*".repeat(rl.line.length),
        );
      }
    };
    process.stdin.on("data", onData);
    rl.question(prompt, (value) => {
      rl.close();
      process.stdout.write("\n");
      resolve(value);
    });
  });
}

const cpf = cpfArg.replace(/\D/g, "");
const idps = Number(idpsArg);
const senha = await perguntarSenhaOculta("Senha (não será exibida): ");
const encodeSenhaRm = (s) =>
  Buffer.from(encodeURIComponent(s)).toString("base64");

function extrairCookie(res) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  if (cookies.length === 0) return null;
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function login() {
  const model = {
    CodColigada: COD_COLIGADA,
    CodFilial: COD_FILIAL,
    IdPs: idps,
    TipoIdentificacao: 0, // CPF
    Login: cpf,
    Senha: encodeSenhaRm(senha),
    GuidsReservaVaga: "",
  };
  const url = `${RM_API_BASE}/${WEBAPI}/v1/Login`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(model),
    cache: "no-store",
  });
  const cookie = extrairCookie(res);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, ok: res.ok, cookie, body };
}

async function candidatosDependentes(cookie) {
  const url = `${RM_API_BASE}/${WEBAPI}/CentralCandidato/v1/CandidatosDependentes`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    cache: "no-store",
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, ok: res.ok, body };
}

console.log(`>>> RM_API_BASE=${RM_API_BASE}`);
console.log(
  `>>> CPF=${cpf}  IdPs=${idps}  Coligada=${COD_COLIGADA}  Filial=${COD_FILIAL}`,
);

const log = await login();
const logado = log.body?.data?.LOGADOSUCESSO === true;
console.log("\n=== LOGIN ===");
console.log("HTTP:", log.status, log.ok ? "OK" : "FALHOU");
console.log("LOGADOSUCESSO:", log.body?.data?.LOGADOSUCESSO);
console.log("CODUSUARIOPS:", log.body?.data?.CODUSUARIOPS);
console.log("NOME:", log.body?.data?.NOME);
if (!logado) {
  console.log("Resposta bruta do login:", JSON.stringify(log.body));
  console.log("\n>>> Login não autenticou. Não dá para consultar dependentes.");
  process.exit(0);
}

const dep = await candidatosDependentes(log.cookie);
console.log("\n=== CANDIDATOS DEPENDENTES ===");
console.log("HTTP:", dep.status, dep.ok ? "OK" : "FALHOU");
console.log("Resposta bruta:", JSON.stringify(dep.body, null, 2));

const lista = Array.isArray(dep.body?.data) ? dep.body.data : dep.body;
if (Array.isArray(lista)) {
  console.log(`\n>>> ${lista.length} candidato(s) retornado(s).`);
  for (const c of lista) {
    console.log(
      `   IDUSUARIO=${c.IDUSUARIO ?? c.CODUSUARIOPS} NOME=${c.NOME} DEPENDENTE=${c.DEPENDENTE}`,
    );
  }
} else {
  console.log("\n>>> Resposta não é uma lista — ver bruto acima.");
}
