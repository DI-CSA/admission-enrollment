import { conciliarFunilCrm } from "../plataforma/lib/marketing/conciliar-funil-crm";

async function main() {
  console.log("Iniciando dry run...");
  const result = await conciliarFunilCrm({ dryRun: true });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch(console.error);
