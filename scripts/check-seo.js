// Postbuild SEO guards. Run via postbuild: node scripts/check-seo.js [--strict]
//
// Each guard here is a regression that shipped (or nearly shipped) without the
// build noticing: a locale with articles and no hub, two pages competing for one
// title, sitemap entries with invented dates, a sitemap URL canonicalised
// elsewhere, and a thin-page rule that drifted from the template it mirrors.
// Failures print "file: reason" and exit 1. Warnings (translation length) print
// but only fail with --strict.
//
// HTML is read with a quote-aware tag/attribute tokenizer (tagsOf/attrsOf), not
// `[^"']` regexes: a value such as content="Don't" must not end at the apostrophe.
const fs = require("fs");
const path = require("path");
const { THIN_WORD_THRESHOLD, isThin, wordCount, countWords, stripTags } = require("../lib/thin-pages.js");

const root = path.join(__dirname, "..");
const site = path.join(root, "_site");
const SITE_URL = "https://llmcfo.com";
const STRICT = process.argv.includes("--strict");

const errors = [];
const warnings = [];
const fail = (guard, file, reason) => errors.push(`[${guard}] ${file}: ${reason}`);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// ---- HTML helpers ----------------------------------------------------------
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b((?:"[^"]*"|'[^']*'|[^>"'])*)>`, "gi"))].map((m) => m[1]);
const attrsOf = (inner) => {
  const out = {};
  for (const m of inner.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
};
const headOf = (html) => {
  const i = html.search(/<\/head>/i);
  return i < 0 ? html : html.slice(0, i);
};
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", middot: "·", hellip: "…", laquo: "«", raquo: "»", rarr: "→", larr: "←" };
const decode = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
    if (dec || hex) {
      const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[name.toLowerCase()] ?? m;
  });
const metaOf = (head, key, value) => {
  for (const t of tagsOf(head, "meta")) {
    const a = attrsOf(t);
    if ((a[key] || "").toLowerCase() === value) return a.content;
  }
  return undefined;
};
const linksOf = (head, rel) => tagsOf(head, "link").map(attrsOf).filter((a) => (a.rel || "").toLowerCase().split(/\s+/).includes(rel));
const titleOf = (head) => {
  const m = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]).replace(/\s+/g, " ").trim() : undefined;
};
const stripSlash = (u) => (u.length > 1 ? u.replace(/\/$/, "") : u);

// ---- Pages -----------------------------------------------------------------
const pages = walk(site)
  .filter((f) => f.endsWith(".html"))
  .map((file) => {
    const rel = path.relative(site, file).split(path.sep).join("/");
    const urlPath = "/" + rel.replace(/(?:^|\/)index\.html$/, "").replace(/\.html$/, "");
    const html = fs.readFileSync(file, "utf8");
    const head = headOf(html);
    const canonical = (linksOf(head, "canonical")[0] || {}).href;
    return {
      file,
      rel,
      html,
      head,
      url: SITE_URL + stripSlash(urlPath === "/" ? "/" : urlPath.replace(/\/$/, "")),
      canonical: canonical && stripSlash(canonical),
      robots: metaOf(head, "name", "robots") || "",
      title: titleOf(head),
    };
  });
const byRel = new Map(pages.map((p) => [p.rel, p]));
const isNoindex = (p) => /noindex/i.test(p.robots);
const selfUrl = (p) => (p.url === SITE_URL + "/" ? SITE_URL : p.url);

// A locale is a top-level dir holding translated article pages.
const localeDirs = fs
  .readdirSync(site, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^[a-z]{2,3}$/.test(e.name))
  .map((e) => e.name)
  .filter((l) => fs.existsSync(path.join(site, l, "research")) && fs.readdirSync(path.join(site, l, "research")).some((f) => f.endsWith(".html")));
const localeOf = (p) => {
  const seg = p.rel.split("/")[0];
  return localeDirs.includes(seg) ? seg : "en";
};

// ---- Sitemap ---------------------------------------------------------------
const sitemapEntries = [];
const readSitemap = (file, seen = new Set()) => {
  if (seen.has(file)) return;
  seen.add(file);
  if (!fs.existsSync(file)) {
    fail("sitemap", path.relative(root, file), "sitemap file does not exist");
    return;
  }
  const s = fs.readFileSync(file, "utf8");
  if (/<sitemapindex/.test(s)) {
    for (const m of s.matchAll(/<loc>([^<]+)<\/loc>/g)) readSitemap(path.join(site, new URL(m[1].trim()).pathname), seen);
    return;
  }
  for (const m of s.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = (m[1].match(/<loc>([^<]*)<\/loc>/) || [])[1];
    const lastmod = (m[1].match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1];
    sitemapEntries.push({ loc: loc && decode(loc.trim()), lastmod: lastmod && lastmod.trim() });
  }
};
const robots = path.join(site, "robots.txt");
const sitemapFiles = fs.existsSync(robots) ? [...fs.readFileSync(robots, "utf8").matchAll(/^Sitemap:\s*(\S+)/gim)].map((m) => path.join(site, new URL(m[1]).pathname)) : [];
for (const f of sitemapFiles.length ? sitemapFiles : [path.join(site, "sitemap.xml")]) readSitemap(f);
if (!sitemapEntries.length) fail("sitemap", "_site/sitemap.xml", "no <url> entries found");

const pageForLoc = (loc) => {
  let p;
  try { p = decodeURIComponent(new URL(loc).pathname); } catch { return undefined; }
  p = p.replace(/^\/|\/$/g, "");
  return [p + ".html", p ? p + "/index.html" : "index.html", p].map((x) => byRel.get(x)).find(Boolean);
};

// 1. Every locale with article pages has a hub, and every sitemap URL exists.
for (const l of localeDirs) {
  const hub = path.join(site, l, "research.html");
  if (!fs.existsSync(hub) || fs.statSync(hub).size === 0 || !/<title\b/i.test(fs.readFileSync(hub, "utf8"))) {
    fail("locale-hub", `_site/${l}/research.html`, `locale "${l}" has article pages but no 200 hub file`);
  }
}
for (const e of sitemapEntries) {
  if (!e.loc) { fail("sitemap-exists", "_site/sitemap.xml", "<url> without <loc>"); continue; }
  if (!e.loc.startsWith(SITE_URL + "/") && e.loc !== SITE_URL) fail("sitemap-exists", e.loc, `sitemap URL is not on ${SITE_URL}`);
  else if (!pageForLoc(e.loc)) fail("sitemap-exists", e.loc, "sitemap URL has no file in _site");
}

// 2. No duplicate <title> within one locale among indexable pages. Noindex pages
//    and pages canonicalised to another URL are not competing for the title.
const titleSeen = new Map();
for (const p of pages) {
  if (p.rel === "404.html" || isNoindex(p) || !p.title) continue;
  if (p.canonical && p.canonical !== selfUrl(p)) continue;
  const k = localeOf(p) + "\u0000" + p.title;
  titleSeen.set(k, [...(titleSeen.get(k) || []), p.rel]);
}
for (const [k, files] of titleSeen) {
  if (files.length > 1) fail("duplicate-title", files.join(", "), `${files.length} indexable pages in locale "${k.split("\u0000")[0]}" share <title> "${k.split("\u0000")[1]}"`);
}

// 3. Every sitemap <url> has a real lastmod, and nobody falls back to file mtime.
//    The config must not read mtimes: it is the checkout time, so every deploy
//    would re-stamp every page as modified today.
const tomorrow = Date.now() + 86400000;
for (const e of sitemapEntries) {
  const file = (e.loc && pageForLoc(e.loc) || {}).rel || e.loc;
  if (!e.lastmod) { fail("lastmod", file, "sitemap <url> has no <lastmod> (page declares no explicit dateModified/datePublished)"); continue; }
  const t = Date.parse(e.lastmod);
  if (!/^\d{4}-\d{2}-\d{2}/.test(e.lastmod) || Number.isNaN(t)) fail("lastmod", file, `<lastmod> "${e.lastmod}" is not a valid W3C date`);
  else if (t > tomorrow) fail("lastmod", file, `<lastmod> "${e.lastmod}" is in the future`);
}
const cfgLines = fs.readFileSync(path.join(root, "eleventy.config.js"), "utf8").split("\n");
cfgLines.forEach((line, i) => {
  if (/\.mtime(?:Ms)?\b/.test(line)) fail("no-mtime", `eleventy.config.js:${i + 1}`, "file mtime used for dates; use a declared dateModified instead");
});

// 4. hreflang (reciprocity and noindex are in check-links.js): valid codes, a
//    self-reference, and one URL per code.
for (const p of pages) {
  const alts = linksOf(p.head, "alternate").filter((a) => a.hreflang !== undefined);
  if (!alts.length) continue;
  const byLang = new Map();
  for (const a of alts) {
    const code = a.hreflang;
    let ok = code === "x-default" || /^[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?$/i.test(code); // BCP 47 is case-insensitive; "en-us" is valid
    if (ok && code !== "x-default") { try { Intl.getCanonicalLocales(code); } catch { ok = false; } }
    if (!ok) fail("hreflang-code", p.rel, `invalid hreflang code "${code}"`);
    if (!a.href) { fail("hreflang-code", p.rel, `hreflang "${code}" has no href`); continue; }
    const href = stripSlash(a.href);
    if (byLang.has(code) && byLang.get(code) !== href) fail("hreflang-code", p.rel, `hreflang "${code}" points at two URLs (${byLang.get(code)}, ${href})`);
    byLang.set(code, href);
  }
  const self = p.canonical || selfUrl(p);
  if (!alts.some((a) => a.href && stripSlash(a.href) === self)) fail("hreflang-self", p.rel, `declares hreflang alternates but none references the page itself (${self})`);
}

// 5. A sitemap URL must canonicalise to itself.
for (const e of sitemapEntries) {
  const p = e.loc && pageForLoc(e.loc);
  if (!p) continue;
  if (!p.canonical) fail("sitemap-canonical", p.rel, `listed in the sitemap as ${e.loc} but has no canonical`);
  else if (p.canonical !== stripSlash(e.loc)) fail("sitemap-canonical", p.rel, `listed in the sitemap as ${e.loc} but canonical is ${p.canonical}`);
}

// 6. Thin-rule drift. lib/thin-pages.js decides noindex from article data; this
//    recounts the words actually rendered in <main> and fails when the two
//    disagree, which is what happens when article.njk changes and the helper
//    does not follow. The page's own robots meta must agree with the helper too.
const articles = require("../src/_data/articles.js")();
const entries = new Map(require("../src/_data/articlePages.js")().map((e) => [e.lang === "en" ? "research/" + (articles[e.key].slug || e.key) + ".html" : `${e.lang}/research/${articles[e.key].slug || e.key}.html`, e]));
const mainText = (html) => {
  const m = html.match(/<main\b[\s\S]*?<\/main>/i);
  if (!m) return undefined;
  return decode(
    m[0]
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ") // breadcrumbs and language switcher
      .replace(/<[^>]+>/g, " ")
  );
};
let thinChecked = 0;
for (const p of pages) {
  const seg = p.rel.split("/");
  if (!(localeDirs.includes(seg[0]) && seg[1] === "research" && seg.length === 3)) continue;
  const entry = entries.get(p.rel);
  if (!entry) { fail("thin-drift", p.rel, "locale article page has no article data entry, so its thin status cannot be verified"); continue; }
  const lang = entry.lang;
  const text = mainText(p.html);
  if (text === undefined) { fail("thin-drift", p.rel, "no <main> element"); continue; }
  thinChecked++;
  const helperThin = isThin(articles[entry.key], lang);
  const pageCount = countWords(text, lang);
  const pageThin = pageCount < THIN_WORD_THRESHOLD;
  if (helperThin !== pageThin) {
    fail("thin-drift", p.rel, `helper says thin=${helperThin} (${wordCount(articles[entry.key], lang)} words), rendered <main> says thin=${pageThin} (${pageCount} words), threshold ${THIN_WORD_THRESHOLD}`);
  }
  if (helperThin !== isNoindex(p)) fail("thin-drift", p.rel, `helper says thin=${helperThin} but the page ships robots "${p.robots}"`);
}

// 7. Translation length (warning). A translation far shorter than its English
//    source is usually a truncated or summarised machine translation.
const MIN_RATIO = 0.5;
const short = [];
let bodiesChecked = 0;
for (const [key, a] of Object.entries(articles)) {
  const en = a.languages && a.languages.en;
  if (!en) continue;
  const enWords = countWords(stripTags(en.body), "en");
  if (!enWords) continue;
  for (const [lang, loc] of Object.entries(a.languages)) {
    if (lang === "en") continue;
    bodiesChecked++;
    const words = countWords(stripTags(loc.body), lang);
    if (words / enWords < MIN_RATIO) short.push({ file: `${lang}/research/${a.slug || key}.html`, words, enWords, ratio: words / enWords });
  }
}
short.sort((a, b) => a.ratio - b.ratio);
if (short.length) {
  warnings.push(`${short.length} of ${bodiesChecked} translated bodies are under ${MIN_RATIO * 100}% of their English word count (worst 10):`);
  for (const s of short.slice(0, 10)) warnings.push(`  ${s.file}: ${s.words} words vs ${s.enWords} English (${Math.round(s.ratio * 100)}%)`);
  if (STRICT) for (const s of short) fail("translation-length", s.file, `${s.words} words vs ${s.enWords} English (${Math.round(s.ratio * 100)}%)`);
}

if (warnings.length) {
  console.warn(`\n[check-seo] warning: ${warnings[0]}`);
  for (const w of warnings.slice(1)) console.warn(w);
}
if (errors.length) {
  console.error(`\n[check-seo] ${errors.length} SEO regression(s):`);
  const unique = [...new Set(errors)];
  for (const e of unique.slice(0, 60)) console.error("  " + e);
  if (unique.length > 60) console.error(`  ... and ${unique.length - 60} more`);
  process.exit(1);
}
console.log(
  `[check-seo] ok — ${localeDirs.length} locale hubs, ${sitemapEntries.length} sitemap URLs (all exist, dated, self-canonical), ` +
    `${titleSeen.size} unique indexable titles, ${thinChecked} locale pages match the thin rule, ${short.length} short translations (warning).`
);
