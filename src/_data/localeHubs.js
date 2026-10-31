// One research hub per non-English locale that has translated articles, listing
// that locale's articles. src/research-locale.njk paginates over this, so a new
// locale needs nothing beyond its first translated article and a hub label set
// in articleUi.js. Before this, /{locale}/research 404'd while article bodies and
// nav linked to it.
const articles = require("./articles.js")();

// -v2 articles are A/B variants that stay out of the sitemap and hubs.
const isV2 = (slug) => /-v2$/.test(slug);

module.exports = function () {
  const locales = [...new Set(Object.values(articles).flatMap((a) => Object.keys(a.languages || {})))]
    .filter((l) => l !== "en")
    .sort();
  return locales.map((lang) => {
    const items = [];
    let dateModified = "";
    for (const [key, article] of Object.entries(articles)) {
      const slug = article.slug || key;
      const loc = article.languages[lang];
      if (!loc || isV2(slug)) continue;
      items.push({ url: `/${lang}/research/${slug}`, title: loc.titleCore || loc.title });
      const d = article.dateModified || article.datePublished || "";
      if (d > dateModified) dateModified = d;
    }
    items.sort((a, b) => a.title.localeCompare(b.title, lang));
    return { lang, permalink: `${lang}/research.html`, locales, articles: items, dateModified };
  });
};
