// Discovery dos DataServers do TOTVS RM — roda fora do Next (Node puro).
//
// Obtém JWT de serviço e baixa o SCHEMA (e uma amostra) de cada DataServer alvo,
// para modelarmos o fluxo de inscrição/cadastro/boleto SEM captura no navegador.
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/rm-discovery.mjs
//   node --env-file=.env.local scripts/rm-discovery.mjs EduCandidatoProcSelData EduPessoaData
//
// Saída: scripts/discovery-out/<DataServer>.schema.json e <DataServer>.sample.json
// ATENÇÃO: a amostra pode conter dados pessoais (LGPD). A pasta é git-ignored.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST_BASE = (process.env.RM_HOST_BASE ?? "").replace(/\/$/, "");
const USER = process.env.RM_HOST_USER ?? "";
const PASSWORD = process.env.RM_HOST_PASSWORD ?? "";
const COD_COLIGADA = process.env.RM_COD_COLIGADA ?? "1";
const RMSREST_BASE =
  process.env.RM_RMSREST_BASE ??
  (HOST_BASE ? `${HOST_BASE}/RMSRestDataServer` : "");

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "discovery-out");

// DataServers relevantes para inscrição/cadastro/boleto (sobrescreva via CLI args).
const ALVOS_PADRAO = [
  "EduCandidatoProcSelData",
  "EduControleCandMatrProcSelData",
  "EduPessoaData",
  "EduResponsavelData",
  "EduPlanoPgtoData",
  "EduBoletoData",
  "EduCursoData",
  "EduHabilitacaoFilialData",
];

function exigeConfig() {
  const faltando = [];
  if (!HOST_BASE) faltando.push("RM_HOST_BASE");
  if (!USER) faltando.push("RM_HOST_USER");
  if (!PASSWORD) faltando.push("RM_HOST_PASSWORD");
  if (faltando.length) {
    console.error(`✗ Variáveis ausentes em .env.local: ${faltando.join(", ")}`);
    process.exit(1);
  }
}

async function getToken() {
  const res = await fetch(`${HOST_BASE}/api/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: USER, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `Auth falhou (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  const data = await res.json();
  const token = data.access_token ?? data.token;
  if (!token)
    throw new Error("Token ausente na resposta de /api/connect/token.");
  console.log(`✓ Autenticado (expira em ${data.expires_in ?? "?"}s)`);
  return token;
}

async function getJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      CodColigada: COD_COLIGADA,
    },
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${res.status} — ${texto.slice(0, 300)}`);
  try {
    return JSON.parse(texto);
  } catch {
    return texto; // alguns endpoints (schema/WADL) podem retornar XML
  }
}

async function processa(ds, token) {
  console.log(`\n→ ${ds}`);
  try {
    const schema = await getJson(`${RMSREST_BASE}/service/${ds}/schema`, token);
    await writeFile(
      join(OUT_DIR, `${ds}.schema.json`),
      JSON.stringify(schema, null, 2),
    );
    console.log(`  ✓ schema salvo`);
  } catch (e) {
    console.log(`  ✗ schema: ${e.message}`);
  }
  try {
    const amostra = await getJson(
      `${RMSREST_BASE}/rest/${ds}?start=0&limit=1&filter=1=1`,
      token,
    );
    await writeFile(
      join(OUT_DIR, `${ds}.sample.json`),
      JSON.stringify(amostra, null, 2),
    );
    console.log(`  ✓ amostra salva`);
  } catch (e) {
    console.log(`  ✗ amostra: ${e.message}`);
  }
}

async function main() {
  exigeConfig();
  await mkdir(OUT_DIR, { recursive: true });
  const alvos = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ALVOS_PADRAO;
  const token = await getToken();
  for (const ds of alvos) {
    await processa(ds, token);
  }
  console.log(`\n✓ Concluído. Arquivos em ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(`\n✗ Erro: ${e.message}`);
  process.exit(1);
});
