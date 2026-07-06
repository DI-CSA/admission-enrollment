// GET de um deal por id (leitura). Uso: node --env-file=.env.local scripts/rdcrm-get-deal.mjs <dealId>
const TOKEN = process.env.RD_CRM_TOKEN;
const id = process.argv[2];
if (!TOKEN || !id) {
  console.error("uso: RD_CRM_TOKEN + <dealId>");
  process.exit(1);
}
const r = await fetch(
  `https://crm.rdstation.com/api/v1/deals/${id}?token=${TOKEN}`,
);
const txt = await r.text();
console.log(r.status);
console.log(txt);
