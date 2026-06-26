import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autossuficiente para deploy como processo Node nativo (systemd) na VM Linux.
  output: "standalone",
  // Fixa a raiz neste projeto (há outro lockfile fora dele no ambiente local).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
