import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import MetaPixel from "@/components/MetaPixel";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Inscrições 2027 · Colégio Santo Agostinho — Leblon",
  description:
    "Processo de Admissão de Novos Alunos 2027 do Colégio Santo Agostinho, unidade Leblon. " +
    "Inscreva-se no 1º Ano do Ensino Fundamental ou do 2º Ano à 2ª Série do Ensino Médio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Código de rastreamento do RD Station (grava o cookie __trf.src e classifica a
  // origem do visitante, incluindo Social). O UUID é específico da conta; sem ele
  // o script não é carregado. Obtenha em: RD Station Marketing → Configurações →
  // Conta → Script do RD Station (loader-scripts/<UUID>-loader.js).
  const rdTrackingUuid = process.env.NEXT_PUBLIC_RD_TRACKING_UUID;
  // Google Analytics (GA4). O Measurement ID é público; usa env quando definido e
  // cai para o ID da conta CSA como padrão, garantindo o carregamento em produção.
  const gaId = process.env.NEXT_PUBLIC_GA_ID ?? "G-929XVXSEH2";
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <MetaPixel />
        {children}
        {gaId ? (
          <>
            <Script
              id="ga-gtag-src"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-gtag-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
            </Script>
          </>
        ) : null}
        {rdTrackingUuid ? (
          <Script
            id="rd-station-tracking"
            src={`https://d335luupugsy2.cloudfront.net/js/loader-scripts/${rdTrackingUuid}-loader.js`}
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
