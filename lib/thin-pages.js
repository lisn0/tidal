// Thin-page rule for translated research articles.
//
// A non-English locale of a JSON research article is "thin" when the words a
// reader actually sees (body + visible FAQ questions and answers) fall under
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

// Reader-visible text of one locale: body plus each FAQ question and answer.
const visibleText = (locale) =>
  [locale.body, ...(locale.faq || []).flatMap((q) => [q.question, q.answer])].map(stripTags).join(" ");

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
  return locale ? countWords(visibleText(locale), lang) : 0;
};

const isThin = (article, lang) =>
  lang !== "en" && !!(article && article.languages && article.languages[lang]) && wordCount(article, lang) < THIN_WORD_THRESHOLD;

module.exports = { THIN_WORD_THRESHOLD, wordCount, isThin };
