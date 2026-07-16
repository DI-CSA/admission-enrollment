"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

const MetaPixel = () => {
  const [loaded, setLoaded] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!loaded) return;

    // Rastreia a visualização de página a cada mudança de rota
    window.fbq("track", "PageView");
  }, [pathname, loaded]);

  if (!PIXEL_ID) {
    return null;
  }

  return (
    <>
      <Script
        id="fb-pixel"
        src="/scripts/meta-pixel.js"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
};

export default MetaPixel;
