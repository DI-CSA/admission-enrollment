import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { DocumentoLegalView } from "@/components/DocumentoLegalView";
import { AVISO_PRIVACIDADE } from "@/lib/legal/conteudo";

export const metadata: Metadata = {
  title: "Aviso de Privacidade — Colégio Santo Agostinho",
  description:
    "Aviso de Privacidade do site do Colégio Santo Agostinho - Leblon: como " +
    "coletamos, usamos e protegemos seus dados pessoais conforme a LGPD.",
};

export default function PrivacidadePage() {
  return (
    <>
      <SiteHeader />
      <DocumentoLegalView doc={AVISO_PRIVACIDADE} />
      <SiteFooter />
    </>
  );
}
