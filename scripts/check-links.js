// Postbuild gate. Nothing here is optional cleverness: a broken internal link or
// a redirect pointing at a deleted page is exactly what orphaned /research/*
// from search in July, and nothing in the build noticed for weeks.
const fs = require("fs");
const path = require("path");

const site = path.join(__dirname, "..", "_site");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const redirectLines = fs.readFileSync(path.join(site, "_redirects"), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const redirects = new Map(redirectLines.map((l) => l.split(/\s+/)).map(([from, to]) => [from.replace(/\/$/, ""), to]));

const resolves = (p) => {
  const f = path.join(site, p.replace(/^\//, ""));
  return fs.existsSync(f) || fs.existsSync(f + ".html") || fs.existsSync(path.join(f, "index.html"));
};

const canonicalOf = (s) => ((s.match(/<link[^>]+rel="canonical"[^>]*>/) || [])[0]?.match(/href="([^"]+)"/) || [])[1]?.replace(/\/$/, "");
const DOMAIN = "llmcfo.com";
const errors = [];

// A redirect whose target is a dead internal path is a 404 with extra steps.
for (const [from, to] of redirects) {
  if (!to.startsWith("/") || to.includes(":splat") || to.includes("*")) continue;
  if (!resolves(to)) errors.push(`_redirects: ${from} -> ${to} (target does not exist)`);
}

for (const f of walk(site).filter((f) => f.endsWith(".html"))) {
  const rel = "/" + path.relative(site, f);
  for (const m of fs.readFileSync(f, "utf8").matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const u = m[1];
    if (u.startsWith("//")) continue;
    if (resolves(u) || redirects.has(u.replace(/\/$/, ""))) continue;
    errors.push(`${rel} -> ${u}`);
  }
}

// hreflang/canonical/og:url are absolute, so the relative-link scan above never
// sees them — and a stale hreflang pointing at a deleted translation is exactly
// the kind of rot that hand-copied locale pages accumulate.
const abs = new RegExp("https?://(?:www\\.)?" + DOMAIN.replace(/\./g, "\\.") + "(/[^\"\\s]*)", "g");
for (const f of walk(site).filter((f) => f.endsWith(".html"))) {
  const rel = "/" + path.relative(site, f);
  for (const m of fs.readFileSync(f, "utf8").matchAll(abs)) {
    const u = m[1].replace(/[?#].*$/, "");
    if (resolves(u) || redirects.has(u.replace(/\/$/, ""))) continue;
    errors.push(`${rel} -> ${m[0]} (absolute)`);
  }
}

// Bing flags any <title> over 70 characters as a High-severity issue, and long
// titles get truncated in results. Hand-written per-page titles drift over the
// limit one article at a time, so assert it here instead of finding out in
// Webmaster Tools weeks later.
for (const f of walk(site).filter((f) => f.endsWith(".html"))) {
  const m = fs.readFileSync(f, "utf8").match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) continue;
  const t = m[1].trim().replace(/&amp;/g, "&").replace(/&middot;/g, "\u00b7").replace(/&mdash;/g, "\u2014");
  if (t.length > 70) errors.push(`/${require("path").relative(site, f)}: title is ${t.length} chars (max 70) — "${t}"`);
}

// hreflang has to be reciprocal: if /de/x lists /fr/x as an alternate, /fr/x must
// list /de/x back, or search engines discard the whole cluster. The links all
// resolve individually, so the check above cannot see a one-way cluster.
const alts = new Map();
for (const f of walk(site).filter((f) => f.endsWith(".html"))) {
  const rel = "/" + require("path").relative(site, f);
  const s = fs.readFileSync(f, "utf8");
  const set = new Set();
  for (const m of s.matchAll(/<link[^>]+rel="alternate"[^>]*>/g)) {
    const href = (m[0].match(/href="([^"]+)"/) || [])[1];
    const lang = (m[0].match(/hreflang="([^"]+)"/) || [])[1];
    if (!href || !lang || lang === "x-default") continue;
    set.add(href.replace(/\/$/, ""));
  }
  if (set.size) alts.set(canonicalOf(s) || rel, set);
}
for (const [self, set] of alts) {
  for (const other of set) {
    if (other === self) continue;
    const back = alts.get(other);
    if (!back) errors.push(`hreflang: ${self} -> ${other} (target declares no alternates)`);
    else if (!back.has(self)) errors.push(`hreflang: ${self} -> ${other} (not reciprocal)`);
  }
}

// Descriptions over ~165 chars get truncated in results. Same reason as the
// title check: hand-written per-page descriptions drift over one article at a
// time, so fail the build instead of discovering it in Webmaster Tools.
for (const f of walk(site).filter((f) => f.endsWith(".html"))) {
  const m = fs.readFileSync(f, "utf8").match(/<meta name="description" content="([^"]*)"/i);
  if (!m) continue;
  const d = m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  if (d.length > 165) errors.push(`/${require("path").relative(site, f)}: description is ${d.length} chars (max 165)`);
}


// Malformed JSON-LD is dropped entirely by every consumer — the page keeps
// rendering, so nothing tells you the schema is gone. One stray quote in a
// hand-copied FAQ blob is all it takes.
// Structured data that contradicts the visible page is a Google-flagged mismatch,
// and it is how 10 pages ended up advertising a headline their own <title> had
// stopped saying, plus 30 a stale description. The article schema reads the page's
// own fields now, so this only fires if someone reintroduces a separate copy.
const decode = (s) =>
  (s || "").replace(/&amp;/g, "&").replace(/&middot;/g, "·").replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

for (const f of walk(site).filter((f) => f.endsWith(".html"))) {
  const html = fs.readFileSync(f, "utf8");
  const rel = `/${path.relative(site, f)}`;
  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1]).replace(/\s*·\s*LLM CFO$/, "");
  const desc = decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1]);
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let node;
    try { node = JSON.parse(m[1]); } catch (e) { errors.push(`${rel}: invalid JSON-LD (${e.message})`); continue; }
    if (!/Article/.test([].concat(node["@type"]).join(""))) continue;
    if (decode(node.headline) !== title) errors.push(`${rel}: JSON-LD headline "${node.headline}" does not match <title> "${title}"`);
    if (decode(node.description) !== desc) errors.push(`${rel}: JSON-LD description does not match meta description`);
  }
}

// Orphans: a page can be in the sitemap, build fine, and still be uncitable
// because nothing links to it. This is what killed /research/* in July and it
// took two days of Webmaster Tools to notice.
//
// Only links FROM sitemap-listed pages count. A page reachable solely from
// something no crawler visits is still an orphan, so harvesting hrefs out of
// every built file would quietly pass the exact failure this exists to catch.
const sitemapPaths = new Set();
const collectSitemap = (file) => {
  if (!fs.existsSync(file)) return;
  const s = fs.readFileSync(file, "utf8");
  const locs = [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  for (const loc of locs) {
    if (/<sitemapindex/.test(s)) collectSitemap(path.join(site, new URL(loc).pathname));
    else sitemapPaths.add(new URL(loc).pathname.replace(/\/$/, "") || "/");
  }
};
for (const m of fs.readFileSync(path.join(site, "robots.txt"), "utf8").matchAll(/^Sitemap:\s*(\S+)/gim)) {
  collectSitemap(path.join(site, new URL(m[1]).pathname));
}

const fileFor = (p) => [p + ".html", path.join(p, "index.html"), p].map((x) => path.join(site, x)).find((x) => fs.existsSync(x) && x.endsWith(".html"));
const linked = new Set();
for (const p of sitemapPaths) {
  const f = fileFor(p === "/" ? "index.html" : p.replace(/^\//, ""));
  if (!f) continue;
  for (const m of fs.readFileSync(f, "utf8").matchAll(/<a[^>]+href="([^"#?]+)"/gi)) {
    let u = m[1];
    if (/^https?:/i.test(u)) { if (!u.includes(DOMAIN)) continue; u = new URL(u).pathname; }
    else if (!u.startsWith("/")) continue;
    linked.add(u.replace(/\/$/, "") || "/");
  }
}
for (const p of sitemapPaths) {
  if (p === "/") continue;
  if (linked.has(p) || linked.has(p + ".html") || linked.has(p.replace(/\.html$/, ""))) continue;
  errors.push(`orphan: ${p} is in the sitemap but no crawlable page links to it`);
}

if (errors.length) {
  console.error(`\n[check-links] ${errors.length} broken internal link(s):`);
  for (const e of [...new Set(errors)]) console.error("  " + e);
  process.exit(1);
}
console.log("[check-links] ok — every internal link and redirect target resolves.");
