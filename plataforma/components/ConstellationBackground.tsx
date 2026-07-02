"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo de "constelação luminosa" inspirado na arte da campanha (campanha.jpg):
 * uma rede de nós com linhas que brilham conforme a proximidade, sobre o azul CSA.
 *
 * - Canvas leve, com drift sutil dos nós.
 * - Respeita `prefers-reduced-motion`: renderiza um quadro estático.
 * - Adapta-se ao tamanho do container e ao devicePixelRatio.
 */
export function ConstellationBackground({
  className = "",
  density = 0.00009,
}: {
  className?: string;
  /** nós por pixel² (mais alto = mais nós). */
  density?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const CIANO = "43,179,230"; // csa-ciano
    const BRANCO = "255,255,255";
    const MAX_DIST = 150; // distância máx. p/ ligar dois nós

    let width = 0;
    let height = 0;
    let dpr = 1;
    let nodes: { x: number; y: number; vx: number; vy: number; r: number }[] =
      [];
    let raf = 0;

    function build() {
      const parent = canvas!.parentElement;
      width = parent?.clientWidth ?? window.innerWidth;
      height = parent?.clientHeight ?? window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const total = Math.max(
        24,
        Math.min(110, Math.round(width * height * density)),
      );
      nodes = Array.from({ length: total }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.6 + 0.6,
      }));
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);

      // linhas
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.35;
            ctx!.strokeStyle = `rgba(${CIANO},${alpha})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      // nós (com brilho)
      ctx!.shadowBlur = 8;
      for (const n of nodes) {
        ctx!.shadowColor = `rgba(${CIANO},0.9)`;
        ctx!.fillStyle = `rgba(${BRANCO},0.9)`;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.shadowBlur = 0;
    }

    function tick() {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }
      draw();
      raf = requestAnimationFrame(tick);
    }

    build();
    if (reduceMotion) {
      draw();
    } else {
      raf = requestAnimationFrame(tick);
    }

    const onResize = () => {
      cancelAnimationFrame(raf);
      build();
      if (reduceMotion) draw();
      else raf = requestAnimationFrame(tick);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [density]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
