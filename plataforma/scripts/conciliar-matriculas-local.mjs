// Conciliação da PRÉ-MATRÍCULA — versão LOCAL (roda no Mac, on-demand).
//
// Lê o RM de PRODUÇÃO (via --env-file=.env.local: TOTVS_DB_* + RD_CRM_TOKEN) e
// atualiza o RD Station CRM pela API v1, replicando o job do servidor:
//   - move o deal p/ "Cadastro de matrícula" (reserva gerada) ou "Pré-matrícula" (paga);
//   - ajusta o VALOR p/ a reserva (R$2.200) via deal_products;
//   - grava os CAMPOS personalizados: Pai/Mãe/Resp. financeiro + datas.
// Forward-only e idempotente. NÃO dispara eventos de Marketing (ficam a cargo do
// cron/servidor, p/ não duplicar conversões).
//
// Uso (a partir de plataforma/):
//   node --env-file=.env.local scripts/conciliar-matriculas-local.mjs            # DRY-RUN (só mostra)
//   node --env-file=.env.local scripts/conciliar-matriculas-local.mjs --commit   # aplica no RD
import sql from "mssql";

const COMMIT = process.argv.includes("--commit");
const TOKEN = process.env.RD_CRM_TOKEN;
if (!TOKEN) {
  console.error("RD_CRM_TOKEN ausente (rode com --env-file=.env.local).");
  process.exit(1);
}
const ANO =
  process.env.PS_ANO_ATUAL?.trim() || process.env.RD_ANO_PROCESSO || "2027";
const BASE = "https://crm.rdstation.com/api/v1";

// IDs do funil/campos (não são segredos) — defaults com override por env.
const PIPELINE =
  process.env.RD_CRM_DEAL_PIPELINE_ID?.trim() || "6a4bb56342e296001faf851f";
const STAGE = {
  cadastro:
    process.env.RD_CRM_DEAL_STAGE_CADASTRO_MATRICULA_ID?.trim() ||
    "6a561c418a2db10030cd46f8",
  pre:
    process.env.RD_CRM_DEAL_STAGE_PRE_MATRICULA_ID?.trim() ||
    "6a561c419bbce7001d6e30e0",
  matriculado:
    process.env.RD_CRM_DEAL_STAGE_MATRICULADO_ID?.trim() ||
    "6a4bb565faefb6001de1fe7b",
};
const PRODUTO_RESERVA =
  process.env.RD_CRM_PRODUCT_RESERVA_ID?.trim() || "6a5630ae4ef88300258b6328";
const CF = {
  pai: process.env.RD_CRM_CF_PAI_ID?.trim() || "6a5646cf313cce0028711b62",
  mae: process.env.RD_CRM_CF_MAE_ID?.trim() || "6a564922ca06c40021e29311",
  respFin:
    process.env.RD_CRM_CF_RESP_FINANCEIRO_ID?.trim() ||
    "6a564923638fac0027d71183",
  dataCadastro:
    process.env.RD_CRM_CF_DATA_CADASTRO_ID?.trim() ||
    "6a5649239895af00265a2e0b",
  dataPagamento:
    process.env.RD_CRM_CF_DATA_PAGAMENTO_ID?.trim() ||
    "6a56492323902e001f3a02b7",
};
const NOME_RESERVA = "Reserva de matrícula";
const VALOR_RESERVA = 2200;

// ---- RD CRM helpers --------------------------------------------------------
async function rd(method, path, body) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(TOKEN)}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const t = await res.text();
  let b;
  try {
    b = JSON.parse(t);
  } catch {
    b = t;
  }
  return { status: res.status, ok: res.ok, body: b };
}
const sid = (x) => x?.id || x?._id;

async function listarDeals() {
  const out = [];
  for (let page = 1; page <= 100; page++) {
    const r = await rd(
      "GET",
      `/deals?limit=200&page=${page}&deal_pipeline_id=${encodeURIComponent(PIPELINE)}`,
    );
    if (!r.ok) break;
    const lista = Array.isArray(r.body) ? r.body : (r.body?.deals ?? []);
    if (!lista.length) break;
    for (const d of lista) {
      const nome = typeof d.name === "string" ? d.name : "";
      const m = /\[LAN:(\d+)\]/.exec(nome);
      out.push({
        id: sid(d),
        nome,
        stage: sid(d.deal_stage),
        idLan: m ? m[1] : null,
      });
    }
    if (r.body?.has_more === false || lista.length < 200) break;
  }
  return out;
}

async function moverEtapa(dealId, stageId) {
  const r = await rd("PUT", `/deals/${dealId}`, {
    deal: { deal_stage_id: stageId },
  });
  return r.ok;
}

async function ajustarValor(dealId) {
  const g = await rd("GET", `/deals/${dealId}`);
  if (!g.ok) return false;
  const produtos = Array.isArray(g.body.deal_products)
    ? g.body.deal_products
    : [];
  const ehReserva = (p) =>
    p.product_id === PRODUTO_RESERVA || (p.name ?? "").trim() === NOME_RESERVA;
  if (!produtos.some(ehReserva)) {
    await rd("POST", `/deals/${dealId}/deal_products`, {
      deal_product: {
        product_id: PRODUTO_RESERVA,
        name: NOME_RESERVA,
        base_price: VALOR_RESERVA,
        price: VALOR_RESERVA,
        amount: 1,
        recurrence: "spare",
      },
    });
  }
  for (const p of produtos.filter((x) => !ehReserva(x))) {
    const pid = sid(p);
    if (pid) await rd("DELETE", `/deals/${dealId}/deal_products/${pid}`);
  }
  return true;
}

const fmtContato = (c) => {
  if (!c || !c.nome) return null;
  const partes = [c.nome];
  if (c.cpf) partes.push(`CPF ${c.cpf}`);
  if (c.email) partes.push(c.email);
  if (c.telefone) partes.push(c.telefone);
  return partes.join(" · ");
};
const fmtDataHoraBr = (s) => {
  const m = s && /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : null;
};
const fmtDataBr = (s) => {
  const m = s && /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

async function atualizarCampos(dealId, mat) {
  const cf = [];
  const push = (id, value) => {
    if (id && value) cf.push({ custom_field_id: id, value });
  };
  push(CF.pai, fmtContato(mat.pai));
  push(CF.mae, fmtContato(mat.mae));
  push(CF.respFin, fmtContato(mat.respFinanceiro));
  push(CF.dataCadastro, fmtDataHoraBr(mat.dataCadastroMatricula));
  push(CF.dataPagamento, fmtDataBr(mat.reservaDataPagamento));
  if (!cf.length) return false;
  const r = await rd("PUT", `/deals/${dealId}`, {
    deal: { deal_custom_fields: cf },
  });
  return r.ok;
}

// ---- RM (SQL) --------------------------------------------------------------
const montarContato = (nome, cpf, email, tel) => {
  const n = nome?.trim();
  if (!n) return null;
  return {
    nome: n,
    cpf: cpf?.replace(/\D/g, "") || null,
    email: email?.trim() || null,
    telefone: tel?.trim() || null,
  };
};

async function listarMatriculas() {
  const pool = await new sql.ConnectionPool({
    server: process.env.TOTVS_DB_SERVER,
    database: process.env.TOTVS_DB_NAME || "CorporeRM",
    user: process.env.TOTVS_DB_USER,
    password: process.env.TOTVS_DB_PASSWORD,
    port: Number(process.env.TOTVS_DB_PORT) || 1433,
    requestTimeout: 120000,
    options: { encrypt: true, trustServerCertificate: true },
  }).connect();
  const req = pool.request();
  req.input("ano", `%${ANO}%`);
  const tel =
    "COALESCE(NULLIF(LTRIM(RTRIM(ru.TELEFONE1)),''), NULLIF(LTRIM(RTRIM(ru.TELEFONE2)),''), ru.TELEFONE3)";
  const apply = (t) =>
    `OUTER APPLY (SELECT TOP 1 ru.NOME, ru.CPF, ru.EMAIL, ${tel} AS TEL FROM SPSUSUARIOTIPORELAC r JOIN SPSUSUARIO ru ON ru.CODUSUARIOPS=r.CODUSUARIOTIPORELAC WHERE r.CODUSUARIOPS=i.CODUSUARIOPS AND r.TIPORELAC=${t} ORDER BY ru.CODUSUARIOPS DESC)`;
  const { recordset } = await req.query(`
SELECT i.NUMEROINSCRICAO, i.IDLAN,
       res.STATUSLAN, res.VALORORIGINAL, res.DATABAIXA,
       CONVERT(varchar(16), al.RECCREATEDON, 120) AS CADASTRO_DT,
       pai.NOME PAI_NOME, pai.CPF PAI_CPF, pai.EMAIL PAI_EMAIL, pai.TEL PAI_TEL,
       mae.NOME MAE_NOME, mae.CPF MAE_CPF, mae.EMAIL MAE_EMAIL, mae.TEL MAE_TEL,
       rf.NOME RF_NOME, rf.CPF RF_CPF, rf.EMAIL RF_EMAIL, rf.TEL RF_TEL
  FROM SPSINSCRICAOAREAOFERTADA i
  JOIN SPSPROCESSOSELETIVO ps ON ps.CODCOLIGADA=i.CODCOLIGADA AND ps.IDPS=i.IDPS
  LEFT JOIN SALUNO al ON al.RA=i.RAMAT
  OUTER APPLY (SELECT TOP 1 l.STATUSLAN, l.VALORORIGINAL, l.DATABAIXA FROM SPARCELA p JOIN SLAN s ON s.CODCOLIGADA=p.CODCOLIGADA AND s.IDPARCELA=p.IDPARCELA JOIN FLAN l ON l.CODCOLIGADA=s.CODCOLIGADA AND l.IDLAN=s.IDLAN WHERE p.RA=i.RAMAT ORDER BY l.DATAVENCIMENTO ASC, l.IDLAN ASC) res
  ${apply(1)} pai ${apply(2)} mae ${apply(3)} rf
 WHERE ps.NOME LIKE @ano AND i.RAMAT IS NOT NULL
 ORDER BY i.NUMEROINSCRICAO`);
  await pool.close();
  return recordset.map((r) => ({
    numeroInscricao: r.NUMEROINSCRICAO,
    idLan: r.IDLAN ?? null,
    reservaStatusLan: r.STATUSLAN ?? null,
    reservaValor: r.VALORORIGINAL ?? null,
    reservaDataPagamento: r.DATABAIXA
      ? new Date(r.DATABAIXA).toISOString()
      : null,
    dataCadastroMatricula: r.CADASTRO_DT ? String(r.CADASTRO_DT).trim() : null,
    pai: montarContato(r.PAI_NOME, r.PAI_CPF, r.PAI_EMAIL, r.PAI_TEL),
    mae: montarContato(r.MAE_NOME, r.MAE_CPF, r.MAE_EMAIL, r.MAE_TEL),
    respFinanceiro: montarContato(r.RF_NOME, r.RF_CPF, r.RF_EMAIL, r.RF_TEL),
  }));
}

// ---- Execução --------------------------------------------------------------
const posterioresA = (alvo) =>
  alvo === STAGE.cadastro
    ? new Set([STAGE.cadastro, STAGE.pre, STAGE.matriculado])
    : new Set([STAGE.pre, STAGE.matriculado]);

console.log(
  `>>> Conciliação LOCAL — ano ~%${ANO}% — ${COMMIT ? "COMMIT (escreve no RD)" : "DRY-RUN (só mostra)"}`,
);
const matriculas = await listarMatriculas();
const deals = await listarDeals();
const porIdLan = new Map();
for (const d of deals) if (d.idLan) porIdLan.set(d.idLan, d);
console.log(
  `RM: ${matriculas.length} matrícula(s) | RD: ${deals.length} deal(s) no funil (${porIdLan.size} com [LAN:]).`,
);

let movCad = 0,
  movPre = 0,
  valores = 0,
  campos = 0,
  ja = 0,
  semDeal = 0,
  semReserva = 0,
  falhas = 0;
for (const mat of matriculas) {
  if (mat.idLan == null) continue;
  if (mat.reservaStatusLan == null) {
    semReserva++;
    continue;
  }
  const deal = porIdLan.get(String(mat.idLan));
  if (!deal) {
    semDeal++;
    continue;
  }
  const paga = mat.reservaStatusLan === 1;
  const alvo = paga ? STAGE.pre : STAGE.cadastro;
  const jaEmOuDepois = deal.stage && posterioresA(alvo).has(deal.stage);
  let stageEfetivo = deal.stage;

  if (jaEmOuDepois) {
    ja++;
  } else if (!COMMIT) {
    paga ? movPre++ : movCad++;
    console.log(
      `  [DRY] insc ${mat.numeroInscricao} -> ${paga ? "Pré-matrícula" : "Cadastro de matrícula"}`,
    );
    continue;
  } else {
    const ok = await moverEtapa(deal.id, alvo);
    if (!ok) {
      falhas++;
      continue;
    }
    stageEfetivo = alvo;
    paga ? movPre++ : movCad++;
  }

  if (
    COMMIT &&
    (stageEfetivo === STAGE.cadastro || stageEfetivo === STAGE.pre)
  ) {
    if (await ajustarValor(deal.id)) valores++;
    if (await atualizarCampos(deal.id, mat)) campos++;
  }
}
console.log("\n=== RESULTADO ===");
console.log({
  verificadas: matriculas.length,
  movidasCadastro: movCad,
  movidasPre: movPre,
  valoresAjustados: valores,
  camposAtualizados: campos,
  jaAvancadas: ja,
  semDeal,
  semReserva,
  falhas,
});
if (!COMMIT)
  console.log(
    "\n(DRY-RUN — nada foi escrito. Rode com --commit para aplicar.)",
  );
