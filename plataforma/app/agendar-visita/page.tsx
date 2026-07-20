import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import AgendarVisitaForm from "@/components/AgendarVisitaForm";

export const metadata: Metadata = {
  title: "Agende sua visita · Colégio Santo Agostinho — Leblon",
  description:
    "Marque uma visita ao Colégio Santo Agostinho, unidade Leblon, e conheça de perto nossa proposta pedagógica.",
};

export default function AgendarVisitaPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
          <AgendarVisitaForm />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
