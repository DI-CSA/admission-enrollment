import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autossuficiente para deploy como processo Node nativo (systemd) na VM Linux.
  output: "standalone",
  // Fixa a raiz neste projeto (há outro lockfile fora dele no ambiente local).
  turbopack: {
    root: import.meta.dirname,
  },
  // Inclui os PDFs de programas (acesso restrito, fora de public/) no bundle
  // standalone, para a rota /api/programas/[codigo] conseguir lê-los na VM.
  outputFileTracingIncludes: {
    "/api/programas/[codigo]": ["./private/programas/**"],
  },
};

export default nextConfig;
