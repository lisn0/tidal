/* attribution.js — first-party source attribution for the /book funnel.
 *
 * Captures the visit's first-touch traffic source (AI assistant / search /
 * social / direct) for the session and attaches it to the booking CTA, so we
 * can tell whether AI citations and search clicks actually produce a booking.
 *
 * Privacy: first-party only. Uses sessionStorage (cleared when the tab closes)
 * and a GA4 `book_click` event that fires ONLY after the visitor has granted
 * analytics consent (i.e. when window.gtag exists, loaded by consent.js). No
 * third-party calls, no cross-site identifiers, no persistent cookie.
 *
 * Read it in GA4 → Reports/Explore on the `book_click` event. Register the
 * event params `book_source`, `book_medium`, `landing_page` as custom
 * (event-scoped) dimensions to break bookings down by source.
 */
(function () {
  'use strict';

  var FT_KEY = 'fa_first_touch';

  // AI assistants / answer engines. Many strip the Referer header, so this is
  // best-effort: a hit is a strong positive, a miss is not proof of absence.
  var AI = /(?:^|\.)(?:chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|bard\.google\.com|claude\.ai|you\.com|phind\.com|poe\.com|edgeservices\.bing\.com)$/;
  var SEARCH = /(?:^|\.)(?:google\.[a-z.]+|bing\.com|duckduckgo\.com|ecosia\.org|brave\.com|search\.brave\.com|yahoo\.com|baidu\.com|yandex\.[a-z.]+|startpage\.com|kagi\.com)$/;
  var SOCIAL = /(?:^|\.)(?:linkedin\.com|t\.co|twitter\.com|x\.com|reddit\.com|news\.ycombinator\.com|facebook\.com|github\.com|youtube\.com|medium\.com|substack\.com)$/;

  function host(u) {
    try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); }
    catch (e) { return ''; }
  }

  function classify() {
    var params = new URLSearchParams(location.search);
    var utmSource = params.get('utm_source');
    if (utmSource) {
      return {
        source: utmSource,
        medium: params.get('utm_medium') || 'campaign',
        ref: document.referrer || '',
        landing: location.pathname
      };
    }
    var h = host(document.referrer);
    var self = location.hostname.replace(/^www\./, '').toLowerCase();
    if (!h) return { source: 'direct', medium: 'none', ref: '', landing: location.pathname };
    if (h === self) return null; // internal navigation — keep the first touch
    var medium = 'referral';
    if (AI.test(h)) medium = 'ai_assistant';
    else if (SEARCH.test(h)) medium = 'organic_search';
    else if (SOCIAL.test(h)) medium = 'social';
    return { source: h, medium: medium, ref: document.referrer, landing: location.pathname };
  }

  function firstTouch() {
    try {
      var saved = sessionStorage.getItem(FT_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    var c = classify();
    if (c) { try { sessionStorage.setItem(FT_KEY, JSON.stringify(c)); } catch (e) {} }
    return c;
  }

  function isBookLink(a) {
    var href = a.getAttribute('href') || '';
    return /(?:^|\/)book(?:\/|\?|#|$)/.test(href) ||
           href.indexOf('calendar.app.google') > -1 ||
           href.indexOf('cal.eu') > -1;
  }

  function decorate(href, ft) {
    if (!href || !ft) return href;
    if (href.indexOf('utm_source=') > -1) return href; // already decorated
    var sep = href.indexOf('?') > -1 ? '&' : '?';
    return href + sep +
      'utm_source=' + encodeURIComponent(ft.source) +
      '&utm_medium=' + encodeURIComponent(ft.medium) +
      '&utm_campaign=book';
  }

  function init() {
    var ft = firstTouch();
    if (!ft) return;

    // 1. Best-effort: tag book links in the DOM. The edge 302 may drop the query
    //    string, so the GA4 event below is the reliable signal — this is a bonus
    //    for booking tools that read UTM params.
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (isBookLink(links[i])) {
        links[i].setAttribute('href', decorate(links[i].getAttribute('href'), ft));
      }
    }

    // 2. Reliable signal: fire a GA4 event on book click. Sends only when
    //    analytics consent has been granted (gtag present). Capture phase so it
    //    runs before the browser navigates away.
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a || !isBookLink(a)) return;
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'book_click', {
          book_source: ft.source,
          book_medium: ft.medium,
          landing_page: ft.landing
        });
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
