// Camada de conteúdo institucional do CSA Leblon.
//
// O site oficial (www.csa.com.br) é servido por um CMS headless (Wagtail) cuja
// API pública entrega o conteúdo já estruturado em JSON:
//   https://api-novo.csa.com.br/api/v2/pages/{id}/
//
// Em vez de "raspar" HTML, consumimos essa API e normalizamos os blocos do CMS
// para um formato simples que o modal dos diferenciais sabe renderizar. Assim o
// conteúdo dos cards vem direto do site da escola e acompanha as atualizações.

const CSA_MEDIA = "https://api-novo.csa.com.br";
const CSA_SITE = "https://www.csa.com.br";

/** Cada card da seção "Por que o CSA Leblon" → uma página do CMS. */
export type CardCSA = {
  slug: string;
  titulo: string;
  resumo: string;
  /** ID estável da página no Wagtail (resolvido via /api/v2/pages/find). */
  pageId: number;
  /** URL pública para "ver no site". */
  site: string;
};

export const CARDS_CSA: CardCSA[] = [
  {
    slug: "anos-iniciais",
    titulo: "Fundamental — Anos Iniciais",
    resumo:
      "A base da leitura, da escrita e do raciocínio, com acolhimento e protagonismo desde o 1º ano.",
    pageId: 15,
    site: `${CSA_SITE}/educacao/fundamental-i/visao-geral`,
  },
  {
    slug: "anos-finais",
    titulo: "Fundamental — Anos Finais",
    resumo:
      "Aprofundamento acadêmico e autonomia, preparando a transição para o Ensino Médio.",
    pageId: 49,
    site: `${CSA_SITE}/educacao/fundamental-ii/visao-geral`,
  },
  {
    slug: "ensino-medio",
    titulo: "Ensino Médio",
    resumo:
      "Excelência acadêmica e projeto de vida rumo às melhores universidades.",
    pageId: 52,
    site: `${CSA_SITE}/educacao/ensino-medio/visao-geral`,
  },
  {
    slug: "bilingue",
    titulo: "Educação Bilíngue",
    resumo:
      "Português-Inglês integrado ao currículo, formando cidadãos do mundo.",
    pageId: 36,
    site: `${CSA_SITE}/educacao/projeto-educacao-bilingue`,
  },
  {
    slug: "socioemocional",
    titulo: "Educação Socioemocional",
    resumo:
      "Habilidades para a vida desenvolvidas em cada fase da caminhada escolar.",
    pageId: 329,
    site: `${CSA_SITE}/educacao/socioemocional/visao-geral`,
  },
  {
    slug: "estudos-exterior",
    titulo: "Estudos no Exterior",
    resumo: "Programas e parcerias internacionais que ampliam horizontes.",
    pageId: 39,
    site: `${CSA_SITE}/educacao/estudos-no-exterior`,
  },
  {
    slug: "certificacoes",
    titulo: "Certificações Internacionais",
    resumo: "Exames oficiais que comprovam a proficiência dos nossos alunos.",
    pageId: 44,
    site: `${CSA_SITE}/educacao/exames-de-certificacao-internacional`,
  },
  {
    slug: "extracurriculares",
    titulo: "Atividades Extracurriculares",
    resumo: "Esporte, arte e cultura que complementam a formação integral.",
    pageId: 100,
    site: `${CSA_SITE}/educacao/atividades-extracurriculares`,
  },
  {
    slug: "infraestrutura",
    titulo: "Infraestrutura Completa",
    resumo:
      "Ambientes modernos no coração do Leblon. Conheça também o Tour Virtual 360º.",
    pageId: 6,
    site: `${CSA_SITE}/infraestrutura`,
  },
];

export type BlocoCSA =
  | {
      tipo: "destaque";
      titulo: string;
      resumo: string;
      imagem?: string;
      alt: string;
    }
  | { tipo: "texto"; titulo?: string; html: string }
  | { tipo: "imagem"; src: string; alt: string; legenda?: string }
  | {
      tipo: "lista";
      titulo?: string;
      itens: { titulo: string; resumo: string }[];
    };

export type PaginaCSA = {
  slug: string;
  titulo: string;
  resumo: string;
  blocos: BlocoCSA[];
  fonteUrl: string;
};

function abs(src?: string | null): string | undefined {
  if (!src) return undefined;
  return src.startsWith("http") ? src : `${CSA_MEDIA}${src}`;
}

/** Remove toda a marcação, devolvendo texto puro (para resumos e legendas). */
function semTags(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const TAGS_PERMITIDAS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "h3",
  "h4",
  "span",
]);

/**
 * Sanitiza o HTML vindo do CMS para um subconjunto seguro de tags (OWASP):
 * remove script/style/iframe, atributos de evento (on*), URLs javascript: e
 * qualquer tag fora da allowlist. Em <a>, mantém apenas href (tornando-o
 * absoluto) e força target/rel seguros.
 */
function sanitizar(html?: string | null): string {
  if (!html) return "";
  let out = html;

  // Blocos perigosos inteiros.
  out = out.replace(
    /<(script|style|iframe|object|embed|link|meta)[\s\S]*?<\/\1>/gi,
    "",
  );
  out = out.replace(
    /<(script|style|iframe|object|embed|link|meta)[^>]*>/gi,
    "",
  );

  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, rawTag, attrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!TAGS_PERMITIDAS.has(tag)) return "";

    const fechamento = match.startsWith("</");
    if (fechamento) return `</${tag}>`;

    if (tag === "a") {
      const m = String(attrs).match(/href\s*=\s*("([^"]*)"|'([^']*)')/i);
      let href = (m?.[2] ?? m?.[3] ?? "").trim();
      if (/^javascript:/i.test(href) || href === "") href = "#";
      if (href.startsWith("/")) href = `${CSA_SITE}${href}`;
      const safe = href.replace(/"/g, "&quot;");
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">`;
    }

    return `<${tag}>`;
  });

  return out.trim();
}

type BlocoWagtail = { type?: string; value?: Record<string, unknown> };

/**
 * Busca uma página institucional no CMS do CSA e normaliza para `PaginaCSA`.
 * Usa cache do Next (revalidação diária) para não bater na origem a cada acesso.
 */
export async function carregarConteudoCSA(
  slug: string,
): Promise<PaginaCSA | null> {
  const card = CARDS_CSA.find((c) => c.slug === slug);
  if (!card) return null;

  const res = await fetch(`${CSA_MEDIA}/api/v2/pages/${card.pageId}/`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) {
    throw new Error(
      `CMS CSA respondeu ${res.status} para a página ${card.pageId}`,
    );
  }

  const data = (await res.json()) as {
    title?: string;
    corpo?: BlocoWagtail[];
  };

  const blocos: BlocoCSA[] = [];

  for (const bloco of data.corpo ?? []) {
    const v = (bloco.value ?? {}) as Record<string, unknown>;

    switch (bloco.type) {
      case "titulo_imagem_resumo": {
        const img = v.imagem as
          | { large?: { src?: string; alt?: string } }
          | undefined;
        blocos.push({
          tipo: "destaque",
          titulo: semTags(v.titulo as string),
          resumo: semTags(v.resumo as string),
          imagem: abs(img?.large?.src),
          alt: img?.large?.alt ?? semTags(v.titulo as string),
        });
        break;
      }
      case "titulo_mais_corpo": {
        const html = sanitizar(v.corpo as string);
        if (html) {
          blocos.push({
            tipo: "texto",
            titulo: (v.titulo as string) || undefined,
            html,
          });
        }
        break;
      }
      case "imagem": {
        const img = v.imagem as
          | { large?: { src?: string; alt?: string } }
          | undefined;
        const src = abs(img?.large?.src);
        if (src) {
          const legenda = semTags(v.texto as string);
          blocos.push({
            tipo: "imagem",
            src,
            alt: img?.large?.alt ?? "",
            legenda: legenda || undefined,
          });
        }
        break;
      }
      case "lista": {
        const itensRaw =
          (v.lista as Array<{ titulo?: string; resumo?: string }>) ?? [];
        const itens = itensRaw
          .map((i) => ({
            titulo: semTags(i.titulo),
            resumo: semTags(i.resumo),
          }))
          .filter((i) => i.titulo || i.resumo);
        if (itens.length) {
          blocos.push({
            tipo: "lista",
            titulo: (v.titulo as string) || undefined,
            itens,
          });
        }
        break;
      }
    }
  }

  return {
    slug: card.slug,
    titulo: data.title ?? card.titulo,
    resumo: card.resumo,
    blocos,
    fonteUrl: card.site,
  };
}
