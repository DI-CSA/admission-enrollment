"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { rastrearEventoMeta } from "@/lib/marketing/meta-client";

const MetaPixel = ({ pixelId }: { pixelId: string }) => {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // O snippet inline abaixo já rastreia a visualização de página inicial.
    // Este efeito só deve rastrear as navegações subsequentes no lado do cliente.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Rastreia as visualizações de página subsequentes
    rastrearEventoMeta("PageView");
  }, [pathname]);

  return (
    <>
      <Script id="fb-pixel-script" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');

          fbq('init', '${pixelId}');
          fbq('consent', 'grant');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
};

export default MetaPixel;
