import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AcessoMatricula } from "@/components/AcessoMatricula";
import { ANO_PROCESSO } from "@/lib/processos";
import { listarProcessosSeletivos } from "@/lib/totvs/queries";

export const metadata: Metadata = {
  title: `Matrícula ${ANO_PROCESSO} · Acesso do responsável — Colégio Santo Agostinho`,
  description:
    "Efetive a matrícula do candidato aprovado no processo seletivo. Acesse com " +
    "o CPF do responsável.",
};

export const dynamic = "force-dynamic";

// IDPS usado APENAS para autenticar o responsável (o login da EduPS exige um PS).
// A conta do responsável é da coligada (login por CPF), então qualquer PS de
// admissão do ciclo serve. A lista de candidatos aptos à matrícula cobre TODOS os
// PS (SQL no BFF). NUNCA usar ID de PS fixo: o valor vem sempre do RM.
async function idpsParaLogin(): Promise<number | null> {
  try {
    const ps = await listarProcessosSeletivos({
      apenasPortal: true,
      apenasAbertos: true,
    });
    const doAno = ps.filter((p) => p.nome.includes(String(ANO_PROCESSO)));
    return (doAno[0] ?? ps[0])?.idps ?? null;
  } catch {
    return null;
  }
}

export default async function MatriculaPage() {
  const idps = await idpsParaLogin();

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-areia">
        <div className="mx-auto flex max-w-2xl flex-col px-4 py-16 md:py-24">
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-csa-navy">
            Matrícula do candidato aprovado
          </h1>
          {idps == null ? (
            <div className="mt-8 rounded-2xl border border-black/5 bg-white p-7 shadow-sm">
              <p className="text-cinza-suave">
                No momento não há processo seletivo ativo. Por favor, tente
                novamente mais tarde.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-3 text-cinza-suave">
                Informe o CPF do responsável para acessar a matrícula do
                candidato aprovado.
              </p>

              <div className="mt-8 rounded-2xl border border-black/5 bg-white p-7 shadow-sm">
                <AcessoMatricula idps={idps} />
              </div>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
