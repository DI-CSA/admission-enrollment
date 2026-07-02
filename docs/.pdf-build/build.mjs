import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

const SRC = process.argv[2];
const OUT_MD = process.argv[3];
const buildDir = join(dirname(SRC), ".pdf-build");
mkdirSync(buildDir, { recursive: true });

const md = readFileSync(SRC, "utf8");
const puppeteerCfg = join(buildDir, "puppeteer.json");

let i = 0;
const out = md.replace(/```mermaid\n([\s\S]*?)```/g, (_m, code) => {
  i += 1;
  const mmd = join(buildDir, `diagram-${i}.mmd`);
  const svg = join(buildDir, `diagram-${i}.svg`);
  writeFileSync(mmd, code);
  execFileSync(
    "npx",
    [
      "-y",
      "@mermaid-js/mermaid-cli",
      "-i",
      mmd,
      "-o",
      svg,
      "-b",
      "white",
      "-p",
      puppeteerCfg,
      "-w",
      "1400",
    ],
    { stdio: "inherit" },
  );
  // Caminho relativo ao OUT_MD (mesma pasta .pdf-build)
  return `![Diagrama ${i}](.pdf-build/diagram-${i}.svg)`;
});

writeFileSync(OUT_MD, out);
console.log(`OK: ${i} diagrama(s) renderizado(s) -> ${OUT_MD}`);
