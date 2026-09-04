/** Static document catalog for the documents / PDF plugin */

export type DocEntry = {
  id: string;
  title: string;
  keywords: string[];
  pdfUrl?: string;
  mdUrl?: string;
  defaultPage?: number;
  blurb: string;
};

export const DOC_CATALOG: DocEntry[] = [
  {
    id: "user-manual",
    title: "LIVIS MES User Manual",
    keywords: [
      "user manual", "manual", "documentation", "docs", "help",
      "getting started", "glossary", "troubleshoot",
    ],
    pdfUrl: "/docs/LIVIS_COPILOT_GUIDE.pdf",
    mdUrl: "/docs/USER_MANUAL.md",
    defaultPage: 1,
    blurb: "Product manual covering apps, shell, Context Graph, and Evidence-to-Action loops.",
  },
  {
    id: "copilot-guide",
    title: "Copilot Document Guide",
    keywords: ["copilot", "pdf", "guide", "plugin", "chart", "table"],
    pdfUrl: "/docs/LIVIS_COPILOT_GUIDE.pdf",
    defaultPage: 1,
    blurb: "Short PDF describing chart, table, and PDF plugins (2 pages).",
  },
  {
    id: "context-graph",
    title: "Context Graph · object bindings",
    keywords: ["context graph", "bindings", "spine", "explore", "cinema"],
    pdfUrl: "/docs/LIVIS_COPILOT_GUIDE.pdf",
    mdUrl: "/docs/USER_MANUAL.md",
    defaultPage: 2,
    blurb: "Engineer Context Graph cinema, lenses, and object binding rollups.",
  },
];

export function matchDocs(query: string, limit = 3): DocEntry[] {
  const q = query.toLowerCase();
  const scored = DOC_CATALOG.map((d) => {
    let score = 0;
    for (const kw of d.keywords) {
      if (q.includes(kw)) score += kw.length;
    }
    if (q.includes(d.title.toLowerCase())) score += 20;
    return { d, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.d);
}
