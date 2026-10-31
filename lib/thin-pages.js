// Thin-page rule for translated research articles.
//
// A non-English locale of a JSON research article is "thin" when the words a
// reader actually sees in the page's main content (heading, body, FAQ, related
// list, closing callout; see visibleText) fall under
// THIN_WORD_THRESHOLD. Thin pages stay live (200) and linked, but ship
// `noindex, follow`, stay out of the sitemap and out of every hreflang cluster.
// The count is computed from the article data at build time, so a translation
// that grows past the threshold becomes indexable on the next build with no
// further edit. English is never thin.
const THIN_WORD_THRESHOLD = 300;

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", middot: "·", hellip: "…", laquo: "«", raquo: "»" };
const decodeEntities = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) => {
    if (dec || hex) {
      const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    const v = NAMED[name.toLowerCase()];
    return v === undefined ? m : v;
  });

const stripTags = (html) =>
  decodeEntities(String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

const articleUi = require("../src/_data/articleUi.js");

const formatDate = (d) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "");

// Everything src/_includes/article.njk renders inside <main> as text, nav blocks
// (breadcrumbs, language switcher) excluded: H1, updated line, byline, quick
// answer, body, FAQ, related list, back link and the closing callout. Keep this
// in step with the template.
const visibleText = (article, locale, lang) => {
  const ui = articleUi[lang] || articleUi.en;
  const related = locale.related || [];
  const body = related.length > 0
    ? String(locale.body || "").replace(/<h2>Related<\/h2><ul>(?:(?!<\/ul>)[\s\S])*<\/ul>\s*$/, "")
    : locale.body;
  const parts = [locale.titleCore, `${ui.updated}: ${formatDate(article.dateModified)}`, ui.byline];
  if (article.agentMode) parts.push(`${ui.quick}: ${locale.description}`);
  parts.push(body);
  if ((locale.faq || []).length) parts.push(ui.faq, ...locale.faq.flatMap((q) => [q.question, q.answer]));
  if (related.length) parts.push(ui.related, ...related.map((r) => (r && r.label) || ""));
  parts.push(`← ${ui.back}`, ui.bottomLead, ui.bottomBody, `${ui.auditButton} →`);
  return parts.map(stripTags).join(" ");
};

const countWords = (text, lang) => {
  if (lang === "ja" || lang === "zh") {
    const cjk = (text.match(CJK) || []).length;
    const rest = text.replace(CJK, " ").split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
    return cjk / 2 + rest;
  }
  return text.split(/\s+/).filter(Boolean).length;
};

const wordCount = (article, lang) => {
  const locale = article && article.languages && article.languages[lang];
  return locale ? countWords(visibleText(article, locale, lang), lang) : 0;
};

const isThin = (article, lang) =>
  lang !== "en" && !!(article && article.languages && article.languages[lang]) && wordCount(article, lang) < THIN_WORD_THRESHOLD;

module.exports = { THIN_WORD_THRESHOLD, wordCount, isThin, countWords, stripTags };
