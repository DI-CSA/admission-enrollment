// DEBUG SQL: reproduz a leitura de documentos (listarDocumentosInscricao) por
// SQL para uma inscrição, imprimindo a situação/observação/arquivo de cada doc.
//
// Uso:
//   cd plataforma
//   node --env-file=.env.local scripts/debug-docs-sql.mjs <codColigada> <idps> <idAreaInteresse> <numeroInscricao>
// Ex.: node --env-file=.env.local scripts/debug-docs-sql.mjs 1 210 590 14

import sql from "mssql";

const [, , colArg, idpsArg, areaArg, numArg] = process.argv;
const codColigada = Number(colArg);
const idps = Number(idpsArg);
const idAreaInteresse = Number(areaArg);
const numeroInscricao = Number(numArg);

const config = {
  server: process.env.TOTVS_DB_SERVER,
  database: process.env.TOTVS_DB_NAME || "CorporeRM",
  user: process.env.TOTVS_DB_USER,
  password: process.env.TOTVS_DB_PASSWORD,
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  options: { encrypt: true, trustServerCertificate: true },
};

function codDocumentoDoArquivo(nome) {
  const p = nome.lastIndexOf("¶");
  if (p < 0) return null;
  let s = nome.substring(p + 1);
  const e = s.lastIndexOf(".");
  if (e >= 0) s = s.substring(0, e);
  const parts = s.split("-");
  const c = Number(parts[parts.length - 1]);
  return Number.isFinite(c) ? c : null;
}

const pool = await new sql.ConnectionPool(config).connect();

const exigidos = (
  await pool
    .request()
    .input("cod", codColigada)
    .input("idps", idps)
    .input("area", idAreaInteresse)
    .input("num", numeroInscricao).query(`
SELECT de.CODDOCUMENTO, de.OBRIGATORIO, d.DESCRICAO, ent.ENTREGUE, ent.MOTIVO
  FROM SPSDOCUMENTOEXIGIDO de
  LEFT JOIN SDOCUMENTO d ON d.CODDOCUMENTO = de.CODDOCUMENTO
  LEFT JOIN SPSDOCUMENTOENTREGUE ent
         ON ent.CODCOLIGADA = de.CODCOLIGADA AND ent.IDPS = de.IDPS
        AND ent.CODDOCUMENTO = de.CODDOCUMENTO AND ent.NUMEROINSCRICAO = @num
 WHERE de.CODCOLIGADA = @cod AND de.IDPS = @idps
   AND de.IDAREAINTERESSE = @area AND de.EXIGEINSCRICAO = 'T'
 ORDER BY de.CODDOCUMENTO`)
).recordset;

const arquivos = (
  await pool
    .request()
    .input("cod", codColigada)
    .input("idps", idps)
    .input("num", numeroInscricao).query(`
SELECT NOMEARQUIVO, DATAENVIO FROM SPSARQUIVOSCANDIDATO
 WHERE CODCOLIGADA = @cod AND IDPS = @idps AND NUMEROINSCRICAO = @num`)
).recordset;

const arquivoPorDoc = new Map();
for (const a of arquivos) {
  const cod = codDocumentoDoArquivo(a.NOMEARQUIVO ?? "");
  if (cod != null && !arquivoPorDoc.has(cod))
    arquivoPorDoc.set(cod, a.NOMEARQUIVO);
}

console.log("\n== ARQUIVOS ENVIADOS ==");
for (const a of arquivos)
  console.log(
    ` - ${a.NOMEARQUIVO}  (CODDOC=${codDocumentoDoArquivo(a.NOMEARQUIVO ?? "")})`,
  );

console.log("\n== DOCUMENTOS EXIGIDOS + SITUAÇÃO ==");
for (const doc of exigidos) {
  const file = arquivoPorDoc.get(doc.CODDOCUMENTO) ?? "";
  const entregue =
    String(doc.ENTREGUE ?? "")
      .trim()
      .toUpperCase() === "T";
  const situacao = entregue ? "entregue" : file ? "em_analise" : "pendente";
  console.log(
    JSON.stringify({
      codDocumento: doc.CODDOCUMENTO,
      descricao: String(doc.DESCRICAO ?? "")
        .replace(/^\s*\(\*\)\s*/, "")
        .trim(),
      obrigatorio:
        String(doc.OBRIGATORIO ?? "")
          .trim()
          .toUpperCase() === "T",
      situacao,
      podeSubstituir: !entregue,
      observacao: doc.MOTIVO?.trim() || null,
      nomeArquivo: file || null,
    }),
  );
}

await pool.close();
console.log("\n>>> Concluído.");
process.exit(0);
