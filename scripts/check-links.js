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

if (errors.length) {
  console.error(`\n[check-links] ${errors.length} broken internal link(s):`);
  for (const e of [...new Set(errors)]) console.error("  " + e);
  process.exit(1);
}
console.log("[check-links] ok — every internal link and redirect target resolves.");
