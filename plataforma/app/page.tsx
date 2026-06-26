import { SiteHeader } from "@/components/SiteHeader";
import { Hero } from "@/components/Hero";
import { SeletorProcessos } from "@/components/SeletorProcessos";
import { Identidade } from "@/components/Identidade";
import { Diferenciais } from "@/components/Diferenciais";
import { PassoAPasso } from "@/components/PassoAPasso";
import { FAQ } from "@/components/FAQ";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <SeletorProcessos />
        <Identidade />
        <Diferenciais />
        <PassoAPasso />
        <FAQ />
      </main>
      <SiteFooter />
    </>
  );
}
