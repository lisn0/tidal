// Generates llms-full.txt from the BUILT site, not from src/.
// Reading src/ meant the file leaked non-pages (README, og-template, the
// llms.njk template itself), lost every templated page's body to the {{ }}
// stripper, and missed data-driven articles entirely. The sitemap is the
// definition of "public page", so use it.
const fs = require("fs");
const path = require("path");

const siteDir = path.join(__dirname, "..", "_site");
const outputFile = path.join(siteDir, "llms-full.txt");

const sitemaps = fs.readdirSync(siteDir).filter((f) => /^sitemap.*\.xml$/.test(f) && !f.includes("index"));
if (!sitemaps.length) throw new Error("no sitemap in _site — run eleventy first");

const urls = [...new Set(sitemaps.flatMap((f) =>
  [...fs.readFileSync(path.join(siteDir, f), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
))].sort();

const fileFor = (u) => {
  const p = path.join(siteDir, new URL(u).pathname);
  for (const c of [p, p + ".html", path.join(p, "index.html")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};

const textOf = (html) => {
  const main = html.match(/<main[\s\S]*?<\/main>/i);
  return (main ? main[0] : html)
    .replace(/<(script|style|nav|footer|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&middot;/g, "·")
    .replace(/\s+/g, " ").trim();
};

const pages = [];
for (const u of urls) {
  const f = fileFor(u);
  if (!f) { console.warn(`[llms-full] sitemap URL has no file: ${u}`); continue; }
  const html = fs.readFileSync(f, "utf8");
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [, new URL(u).pathname])[1].trim();
  pages.push(`# ${title}\nURL: ${u}\n\n${textOf(html)}\n\n---\n\n`);
}

const out = `# LLM CFO — Complete Executive Guides & Financial Models (llms-full.txt)\n\nContent-Signal: ai-train=no, search=yes, ai-input=yes\n\n` +
  `This document contains the complete text of all ${pages.length} public pages on llmcfo.com.\n\n` +
  "=".repeat(80) + "\n\n" + pages.join("");

fs.writeFileSync(outputFile, out, "utf8");
console.log(`Generated ${outputFile} (${out.length} bytes, ${pages.length} pages).`);
