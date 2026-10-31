// Eleventy config for llmcfo.com.
// Shared layouts rebuild HTML pages while Cloudflare edge/static files pass through verbatim.
const fs = require("fs");
const { isThin } = require("./lib/thin-pages.js");

const SITE_URL = "https://llmcfo.com";
// Pages that exist but must never be advertised. Anything else opts out with
// `sitemap: false` in its frontmatter.
// -v2 pages are A/B variants canonicalized to their control, so none of them
// belong in the sitemap. Listing them by hand missed /es/research/…-v2, which
// then shipped as the only Spanish URL Google was told about.
const SITEMAP_SKIP = new Set(["/404.html"]);
const isV2Variant = (url) => /-v2(\.html)?$/.test(url);
const skipFromSitemap = (url) => SITEMAP_SKIP.has(url) || isV2Variant(url);

const cleanUrl = (url) => url.replace(/index\.html$/, "").replace(/\.html$/, "");

// Collections only ever contain the first page of a paginated template, so the
// data-driven article pages (src/articles.njk) are invisible to getAll(). Read
// them from the same data file the template paginates over.
const articlePages = require("./src/_data/articlePages.js")();
const articles = require("./src/_data/articles.js")();
const localeHubs = require("./src/_data/localeHubs.js")();

// Articles carry dateModified in frontmatter or in the article data; page.njk
// pages may also have it inside their pageHead JSON-LD blob. There is no mtime
// fallback: a file's mtime is the checkout time, so every deploy re-stamped every
// utility page as "modified today". A page with no real date gets no <lastmod>
// (the sitemap allows that) rather than an invented one.
const lastmodOf = (item) => {
  const direct = item.data.dateModified || item.data.article?.dateModified || item.data.datePublished;
  if (direct) return direct;
  const m = String(item.data.pageHead || "").match(/dateModified\W+(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
};

// Same rule for the injected WebPage node, which only has the output page to go
// on: read the date the source declares in its own frontmatter.
const frontmatterDate = (inputPath) => {
  const m = fs.readFileSync(inputPath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return (m && m[1].match(/^dateModified:\s*["']?(\d{4}-\d{2}-\d{2})/m) || [])[1];
};

module.exports = function (eleventyConfig) {
  // Utility pages (about, terms, tools…) ship no schema and no date, so an AI
  // answer engine has nothing to attribute and cites them without a link, if at
  // all. Inject a WebPage node wherever the page carries no dateModified —
  // valid alongside any existing block. The date is the page's own frontmatter
  // `dateModified` (set to its last git commit date); a page without one gets
  // a node with no dateModified rather than a date that changes every deploy.
  eleventyConfig.addTransform("webPageSchema", function (content) {
    if (!this.page.outputPath?.endsWith(".html")) return content;
    if (/dateModified/.test(content)) return content;
    // Prefer the page's own canonical: A/B variants (index-v2) canonical to the
    // control, so keying the WebPage node off page.url made the schema claim a
    // different URL than the canonical tag one line above it.
    const url = (content.match(/<link rel="canonical" href="([^"]+)"/i) || [])[1] || "https://llmcfo.com" + this.page.url;
    const node = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": url + "#webpage",
      url,
      name: (content.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.trim(),
      description: (content.match(/<meta name="description" content="([^"]*)"/i) || [])[1],
      dateModified: frontmatterDate(this.page.inputPath),
      isPartOf: { "@id": "https://llmcfo.com/#website" },
      publisher: { "@id": "https://llmcfo.com/#org" },
    };
    if (!node.dateModified) delete node.dateModified;
    if (!node.name) delete node.name;
    if (!node.description) delete node.description;
    const tag = `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
    return content.includes("</head>") ? content.replace("</head>", tag + "</head>") : content.replace("</body>", tag + "</body>");
  });

  // The sitemap was a hand-maintained XML file, so every page added since drifted
  // out of it until someone noticed — which is what orphaned /research/* from
  // search. Derive it from the build instead.
  eleventyConfig.addCollection("sitemap", (api) => {
    const seen = new Set();
    const fromData = articlePages
      .filter((p) => !skipFromSitemap("/" + p.permalink) && !p.thin)
      .map((p) => ({
        loc: SITE_URL + cleanUrl("/" + p.permalink),
        lastmod: articles[p.key].dateModified || articles[p.key].datePublished,
        priority: "0.9",
      }))
      // Locale research hubs are paginated too (src/research-locale.njk).
      .concat(
        localeHubs.map((h) => ({
          loc: `${SITE_URL}/${h.lang}/research`,
          lastmod: h.dateModified || undefined,
          priority: "0.7",
        }))
      );
    return api
      .getAll()
      .filter((item) => {
        const url = item.url;
        if (!url || !(url.endsWith(".html") || url.endsWith("/"))) return false;
        if (skipFromSitemap(url)) return false;
        if (item.data.sitemap === false) return false;
        // Only the first page of a paginated template is visible here, with none
        // of the article's own dates. Those pages are listed via fromData above;
        // keeping this copy too would win the de-dupe and drop its lastmod.
        if (item.data.pagination) return false;
        return true;
      })
      .map((item) => ({
        loc: SITE_URL + cleanUrl(item.url),
        lastmod: lastmodOf(item),
        priority: cleanUrl(item.url) === "/" ? "1.0" : item.url.includes("/research/") ? "0.9" : "0.7",
      }))
      .concat(fromData)
      .filter((u) => !seen.has(u.loc) && seen.add(u.loc))
      .sort((a, b) => a.loc.localeCompare(b.loc));
  });

  // Every research article, for the A–Z block on /research. The curated sections
  // there are hand-written and had drifted 10 articles behind, orphaning them
  // from the internal link graph entirely; this block can't drift.
  eleventyConfig.addCollection("research", (api) => {
    const list = api
      .getFilteredByGlob("src/research/*.njk")
      // End-anchored: a bare includes("-v2") also dropped
      // mimo-v2-6-open-weights-price-ceiling, so it never reached this list.
      .filter((item) => !isV2Variant(item.url))
      .map((item) => ({
        url: cleanUrl(item.url),
        title: item.data.titleCore || item.data.title,
      }));
    // Data-driven articles (src/articles.njk) are paginated, so getAll() only
    // ever sees their first page — merge them in from the same data file.
    for (const p of articlePages) {
      if (p.lang !== "en" || isV2Variant(p.permalink)) continue;
      const url = cleanUrl("/" + p.permalink);
      if (list.some((a) => a.url === url)) continue;
      list.push({ url, title: articles[p.key].languages.en.titleCore });
    }
    return list.sort((a, b) => a.title.localeCompare(b.title));
  });

  // The curated /research sections used to be hand-written <ul>s. An article had
  // to be added to the list by hand, so articles that weren't were orphaned. Now
  // an article declares its own `section:` and the index groups on it.
  eleventyConfig.addCollection("researchSections", (api) => {
    const order = require("./src/_data/sectionOrder.js");
    const byName = Object.fromEntries(order.map((n) => [n, []]));
    for (const item of api.getFilteredByGlob("src/research/*.njk")) {
      const s = item.data.section;
      if (!s || !byName[s]) continue;
      byName[s].push({
        url: cleanUrl(item.url),
        title: item.data.sectionTitle || item.data.titleCore,
        blurb: item.data.blurb || "",
        date: item.data.dateModified || item.data.datePublished || "",
      });
    }
    // Newest first inside a section, so a new article surfaces at the top of its
    // group instead of needing a hand-chosen position.
    return order.map((name) => ({ name, items: byName[name].sort((a, b) => b.date.localeCompare(a.date)) }));
  });

  // Format date as "D Month YYYY" (e.g., "29 April 2026")
  eleventyConfig.addFilter("formatDate", (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  });

  // Localized articles link to /research/x, the English page. Point those at
  // /{lang}/research/x when that locale has a translated twin (the data decides,
  // so no JSON is edited and a link upgrades itself when a translation lands).
  // Links to English-only pages such as src/research/*.njk are left alone.
  const localesBySlug = new Map(Object.entries(articles).map(([key, a]) => [a.slug || key, new Set(Object.keys(a.languages || {}))]));
  const localizeHref = (href, lang) => {
    if (!lang || lang === "en" || typeof href !== "string") return href;
    const m = /^\/research\/([a-z0-9-]+)(?=$|[#?])/.exec(href);
    return m && localesBySlug.get(m[1])?.has(lang) ? "/" + lang + href : href;
  };
  eleventyConfig.addFilter("localizeHref", localizeHref);
  eleventyConfig.addFilter("localizeResearchLinks", (html, lang) =>
    (html || "").replace(/(href=)(["'])(\/research\/[^"']*)\2/g, (_m, attr, quote, href) => attr + quote + localizeHref(href, lang) + quote)
  );

  // True when this locale of the article is a thin translation (lib/thin-pages.js).
  eleventyConfig.addFilter("isThinPage", (article, lang) => isThin(article, lang));

  // Return the keys of an object as an array.
  eleventyConfig.addFilter("keys", (obj) => Object.keys(obj || {}));

  // Update visible date in content: replace the date part of "<p class="updated">Label · OldDate</p>"
  // or just "<p class="updated">OldDate</p>" with dateModified. Preserves any label.
  eleventyConfig.addFilter("updateVisibleDate", (content, dateModified, datePublished) => {
    if (!content || !dateModified) return content;
    const displayDate = new Date(dateModified + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    // First try pattern with label and separator: "Label · OldDate"
    let result = content.replace(
      /<p class="updated">([^·]*·\s*)[^<]*(<\/p>)/,
      `<p class="updated">$1${displayDate}$2`
    );
    // If that didn't match, try just the date: "OldDate" (no label)
    if (result === content) {
      result = content.replace(
        /<p class="updated">[^<]*(<\/p>)/,
        `<p class="updated">${displayDate}$1`
      );
    }
    return result;
  });

  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/.well-known");
  eleventyConfig.addPassthroughCopy({ "src/.assetsignore": ".assetsignore" });
  eleventyConfig.addPassthroughCopy({ "src/9f7a91c496064b7e96137c3326d9b895.txt": "9f7a91c496064b7e96137c3326d9b895.txt" });
  eleventyConfig.addPassthroughCopy({ "src/README.md": "README.md" });
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects" });
  eleventyConfig.addPassthroughCopy({ "src/apple-touch-icon.png": "apple-touch-icon.png" });
  eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });
  eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });
  eleventyConfig.addPassthroughCopy({ "src/humans.txt": "humans.txt" });
  eleventyConfig.addPassthroughCopy({ "src/openapi.json": "openapi.json" });
  eleventyConfig.addPassthroughCopy({ "src/auth.md": "auth.md" });
  eleventyConfig.addPassthroughCopy({ "src/health.json": "health.json" });
  eleventyConfig.addPassthroughCopy({ "src/og-template.html": "og-template.html" });
  eleventyConfig.addPassthroughCopy({ "src/og.png": "og.png" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/seo-keyword-research.md": "seo-keyword-research.md" });
  eleventyConfig.addPassthroughCopy({ "src/site.webmanifest": "site.webmanifest" });
  eleventyConfig.addPassthroughCopy({ "src/worker.js": "worker.js" });
  eleventyConfig.addPassthroughCopy({ "src/wrangler.jsonc": "wrangler.jsonc" });
  eleventyConfig.ignores.add("src/og-template.html");

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "html"],
  };
};
