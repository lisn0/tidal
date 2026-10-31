// One entry per (article, language) that actually has translated content.
// Adding a language to an article's JSON in _data/articles/ is all it takes to
// publish it — no per-locale .njk stub to write, and no stub can exist for a
// translation that was never written.
const articles = require("./articles.js")();
const { isThin } = require("../../lib/thin-pages.js");

module.exports = function () {
  return Object.entries(articles).flatMap(([key, article]) =>
    Object.keys(article.languages || {}).map((lang) => ({
      key,
      lang,
      // Thin translations are noindex and left out of the sitemap and hreflang.
      thin: isThin(article, lang),
      permalink: (lang === "en" ? "" : lang + "/") + "research/" + (article.slug || key) + ".html",
    }))
  );
};
