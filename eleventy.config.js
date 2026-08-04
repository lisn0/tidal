// Eleventy config for llmcfo.com.
// Shared layouts rebuild HTML pages while Cloudflare edge/static files pass through verbatim.
const fs = require("fs");

const SITE_URL = "https://llmcfo.com";
// Pages that exist but must never be advertised. Anything else opts out with
// `sitemap: false` in its frontmatter.
// -v2 pages are A/B variants canonicalized to their control, so none of them
// belong in the sitemap. Listing them by hand missed /es/research/…-v2, which
// then shipped as the only Spanish URL Google was told about.
const SITEMAP_SKIP = new Set(["/404.html"]);
const skipFromSitemap = (url) => SITEMAP_SKIP.has(url) || /-v2(\.html)?$/.test(url);

const cleanUrl = (url) => url.replace(/index\.html$/, "").replace(/\.html$/, "");

// Collections only ever contain the first page of a paginated template, so the
// data-driven article pages (src/articles.njk) are invisible to getAll(). Read
// them from the same data file the template paginates over.
const articlePages = require("./src/_data/articlePages.js")();
const articles = require("./src/_data/articles.js")();

// Articles carry dateModified in frontmatter or in the article data; page.njk
// pages only have it inside their pageHead JSON-LD blob. Fall back to the source
// file's mtime so a page can never land in the sitemap without a lastmod.
const lastmodOf = (item) => {
  const direct = item.data.dateModified || item.data.article?.dateModified || item.data.datePublished;
  if (direct) return direct;
  const m = String(item.data.pageHead || "").match(/dateModified\W+(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return fs.statSync(item.inputPath).mtime.toISOString().slice(0, 10);
};

module.exports = function (eleventyConfig) {
  // Utility pages (about, terms, tools…) ship no schema and no date, so an AI
  // answer engine has nothing to attribute and cites them without a link, if at
  // all. Inject a WebPage node wherever the page carries no dateModified —
  // valid alongside any existing block, and the date is the source file mtime
  // so freshness is real rather than a hardcoded build stamp.
  eleventyConfig.addTransform("webPageSchema", function (content) {
    if (!this.page.outputPath?.endsWith(".html")) return content;
    if (/dateModified/.test(content)) return content;
    const url = "https://llmcfo.com" + this.page.url;
    const node = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": url + "#webpage",
      url,
      name: (content.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.trim(),
      description: (content.match(/<meta name="description" content="([^"]*)"/i) || [])[1],
      dateModified: require("fs").statSync(this.page.inputPath).mtime.toISOString().slice(0, 10),
      isPartOf: { "@id": "https://llmcfo.com/#website" },
      publisher: { "@id": "https://llmcfo.com/#org" },
    };
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
      .filter((p) => !skipFromSitemap("/" + p.permalink))
      .map((p) => ({
        loc: SITE_URL + cleanUrl("/" + p.permalink),
        lastmod: articles[p.key].dateModified || articles[p.key].datePublished,
        priority: "0.9",
      }));
    return api
      .getAll()
      .filter((item) => {
        const url = item.url;
        if (!url || !(url.endsWith(".html") || url.endsWith("/"))) return false;
        if (skipFromSitemap(url)) return false;
        if (item.data.sitemap === false) return false;
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
      .filter((item) => !item.url.includes("-v2"))
      .map((item) => ({
        url: cleanUrl(item.url),
        title: item.data.titleCore || item.data.title,
      }));
    // Data-driven articles (src/articles.njk) are paginated, so getAll() only
    // ever sees their first page — merge them in from the same data file.
    for (const p of articlePages) {
      if (p.lang !== "en" || p.permalink.includes("-v2")) continue;
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
