import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AcessoInscricao } from "@/components/AcessoInscricao";
import { ANO_PROCESSO } from "@/lib/processos";
import { listarProcessosSeletivos } from "@/lib/totvs/queries";

export const metadata: Metadata = {
  title: "Inscrição 2027 · Acesso do responsável — Colégio Santo Agostinho",
  description:
    "Inicie a inscrição informando o CPF do responsável. Reconhecemos cadastros " +
    "existentes no sistema do colégio para agilizar o processo.",
};

export const dynamic = "force-dynamic";

// IDPS usado APENAS para autenticar o responsável (o login da EduPS exige um PS).
// A conta do responsável é da coligada (login por CPF), então qualquer PS de
// admissão aberto serve. O PS efetivo da inscrição é escolhido na etapa de série,
// dentro do wizard — e a lista de candidatos do painel cobre TODOS os PS (SQL).
// NUNCA usar ID de PS fixo: o valor vem sempre do RM (PS abertos do ano). Se não
// houver PS aberto, não há como autenticar — a página mostra aviso.
async function idpsParaLogin(): Promise<number | null> {
  try {
    const ps = await listarProcessosSeletivos({
      apenasPortal: true,
      apenasAbertos: true,
    });
    const do2027 = ps.filter((p) => p.nome.includes(String(ANO_PROCESSO)));
    return (do2027[0] ?? ps[0])?.idps ?? null;
  } catch {
    return null;
  }
}

export default async function InscricoesPage() {
  const idps = await idpsParaLogin();

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-areia">
        <div className="mx-auto flex max-w-2xl flex-col px-4 py-16 md:py-24">
          {idps == null ? (
            <>
              <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-csa-navy">
                Acesso do responsável
              </h1>
              <div className="mt-8 rounded-2xl border border-black/5 bg-white p-7 shadow-sm">
                <p className="text-cinza-suave">
                  No momento não há processo seletivo com inscrições abertas.
                  Por favor, tente novamente mais tarde.
                </p>
              </div>
            </>
          ) : (
            <AcessoInscricao idps={idps} />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
