"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import MetaPixel from "@/components/MetaPixel";
import {
  CONSENTIMENTO_UI_ATIVO,
  COOKIE_CONSENTIMENTO,
  VERSAO_CONSENTIMENTO,
  type PreferenciasConsentimento,
  lerConsentimentoSerializado,
} from "@/lib/consentimento";

const STORAGE_KEY = "csa:consentimento";
const UM_ANO = 60 * 60 * 24 * 365;

interface Props {
  metaPixelId?: string;
  gaId?: string;
  /** Conta do Google Ads (AW-...), para conversões. Categoria: marketing. */
  googleAdsId?: string;
  rdTrackingUuid?: string;
}

function persistir(preferencias: PreferenciasConsentimento) {
  const valor = encodeURIComponent(JSON.stringify(preferencias));
  localStorage.setItem(STORAGE_KEY, valor);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${COOKIE_CONSENTIMENTO}=${valor}; Path=/; Max-Age=${UM_ANO}; ` +
    `SameSite=Lax${secure}`;
  window.dispatchEvent(
    new CustomEvent("csa:consentimento-alterado", { detail: preferencias }),
  );
}

function apagarCookie(nome: string) {
  document.cookie = `${nome}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${nome}=; Path=/; Domain=.${window.location.hostname}; Max-Age=0; SameSite=Lax`;
}

export default function TrackingConsent({
  metaPixelId,
  gaId,
  googleAdsId,
  rdTrackingUuid,
}: Props) {
  const [preferencias, setPreferencias] =
    useState<PreferenciasConsentimento | null>(null);
  const [aberto, setAberto] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // Sem a UI de consentimento (padrão): não lê cookie nem abre o banner. As
    // preferências efetivas (abaixo) liberam as integrações por consentimento implícito.
    if (!CONSENTIMENTO_UI_ATIVO) return;
    queueMicrotask(() => {
      const cookie = document.cookie
        .split("; ")
        .find((item) => item.startsWith(`${COOKIE_CONSENTIMENTO}=`))
        ?.slice(COOKIE_CONSENTIMENTO.length + 1);
      const salvo =
        lerConsentimentoSerializado(cookie) ??
        lerConsentimentoSerializado(localStorage.getItem(STORAGE_KEY));
      if (salvo) {
        setPreferencias(salvo);
        setAnalytics(salvo.analytics);
        setMarketing(salvo.marketing);
      } else {
        setAberto(true);
      }
    });
  }, []);

  // Quando a UI está desativada, todas as integrações são liberadas diretamente.
  const prefsEfetivas: PreferenciasConsentimento | null = CONSENTIMENTO_UI_ATIVO
    ? preferencias
    : {
        versao: VERSAO_CONSENTIMENTO,
        analytics: true,
        marketing: true,
        atualizadoEm: "",
      };

  function salvar(novoAnalytics: boolean, novoMarketing: boolean) {
    const novo: PreferenciasConsentimento = {
      versao: VERSAO_CONSENTIMENTO,
      analytics: novoAnalytics,
      marketing: novoMarketing,
      atualizadoEm: new Date().toISOString(),
    };
    if (!novoMarketing) {
      window.fbq?.("consent", "revoke");
      apagarCookie("_fbp");
      apagarCookie("_fbc");
      apagarCookie("__trf.src");
      // Cookies de clique/atribuição do Google Ads.
      for (const item of document.cookie.split("; ")) {
        const nome = item.split("=")[0];
        if (nome.startsWith("_gcl")) apagarCookie(nome);
      }
    }
    if (!novoAnalytics) {
      for (const item of document.cookie.split("; ")) {
        const nome = item.split("=")[0];
        if (nome === "_ga" || nome.startsWith("_ga_")) apagarCookie(nome);
      }
    }
    persistir(novo);
    setPreferencias(novo);
    setAnalytics(novoAnalytics);
    setMarketing(novoMarketing);
    setAberto(false);
  }

  return (
    <>
      {prefsEfetivas?.marketing && metaPixelId ? (
        <MetaPixel pixelId={metaPixelId} />
      ) : null}

      {(prefsEfetivas?.analytics && gaId) ||
      (prefsEfetivas?.marketing && googleAdsId) ? (
        <>
          <Script
            id="ga-gtag-src"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId || googleAdsId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-gtag-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${prefsEfetivas?.analytics && gaId ? `gtag('config', '${gaId}');` : ""}
${prefsEfetivas?.marketing && googleAdsId ? `gtag('config', '${googleAdsId}');` : ""}`}
          </Script>
        </>
      ) : null}

      {prefsEfetivas?.marketing && rdTrackingUuid ? (
        <Script
          id="rd-station-tracking"
          src={`https://d335luupugsy2.cloudfront.net/js/loader-scripts/${rdTrackingUuid}-loader.js`}
          strategy="afterInteractive"
        />
      ) : null}

      {CONSENTIMENTO_UI_ATIVO ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="fixed bottom-4 left-4 z-40 rounded-full bg-csa-navy px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-csa-azul"
        >
          Privacidade
        </button>
      ) : null}

      {aberto ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-csa-navy/55 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-consentimento"
            className="w-full max-w-xl rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
          >
            <h2
              id="titulo-consentimento"
              className="font-display text-xl font-bold text-csa-navy"
            >
              Preferências de privacidade
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-cinza-suave">
              Cookies necessários mantêm o portal funcionando. Com sua escolha,
              podemos usar análises de audiência e tecnologias de marketing para
              medir campanhas. Você pode alterar esta decisão a qualquer momento.
            </p>

            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-black/10 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-grafite">Necessários</p>
                    <p className="text-xs text-cinza-suave">
                      Sessão, segurança e funcionamento do processo.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-csa-azul">
                    Sempre ativos
                  </span>
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-black/10 p-4">
                <span>
                  <span className="block font-semibold text-grafite">
                    Análise de audiência
                  </span>
                  <span className="block text-xs text-cinza-suave">
                    Google Analytics para estatísticas de uso.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="h-5 w-5 accent-csa-azul"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-black/10 p-4">
                <span>
                  <span className="block font-semibold text-grafite">
                    Marketing
                  </span>
                  <span className="block text-xs text-cinza-suave">
                    Meta Pixel e RD Station para atribuição e campanhas.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="h-5 w-5 accent-csa-azul"
                />
              </label>
            </div>

            <a
              href="/privacidade"
              className="mt-4 inline-block text-sm font-medium text-csa-azul underline"
            >
              Ler o Aviso de Privacidade
            </a>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => salvar(false, false)}
                className="rounded-xl border border-csa-navy px-4 py-3 text-sm font-semibold text-csa-navy"
              >
                Rejeitar opcionais
              </button>
              <button
                type="button"
                onClick={() => salvar(analytics, marketing)}
                className="rounded-xl bg-csa-azul px-4 py-3 text-sm font-semibold text-white"
              >
                Salvar preferências
              </button>
              <button
                type="button"
                onClick={() => salvar(true, true)}
                className="rounded-xl bg-csa-navy px-4 py-3 text-sm font-semibold text-white"
              >
                Aceitar todos
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
