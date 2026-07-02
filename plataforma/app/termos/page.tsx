import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { DocumentoLegalView } from "@/components/DocumentoLegalView";
import { TERMOS_USO } from "@/lib/legal/conteudo";

export const metadata: Metadata = {
  title: "Termos de Uso — Colégio Santo Agostinho",
  description:
    "Termos de Uso do site do Colégio Santo Agostinho - Leblon: condições de " +
    "acesso, navegação e serviços disponibilizados.",
};

export default function TermosPage() {
  return (
    <>
      <SiteHeader />
      <DocumentoLegalView doc={TERMOS_USO} />
      <SiteFooter />
    </>
  );
}
