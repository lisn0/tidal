# llmcfo.com

Static site for **LLM CFO** — managed AI cost optimization. Live at **https://llmcfo.com**.

## Research

Vendor-neutral research on LLM cost and observability:

- [LiteLLM vs Helicone vs LangFuse](https://llmcfo.com/research/litellm-vs-helicone-vs-langfuse) — gateway vs proxy vs observability, and how to choose
- [LLM cost optimization](https://llmcfo.com/research/llm-cost-optimization)
- [LLM cost monitoring](https://llmcfo.com/research/llm-cost-monitoring)
- [How to build an LLM CFO function](https://llmcfo.com/research/how-to-build-an-llm-cfo-function)
- [Full research index](https://llmcfo.com/research)

Discovery: [sitemap.xml](https://llmcfo.com/sitemap.xml) · [llms.txt](https://llmcfo.com/llms.txt)

## Stack — Eleventy

**Eleventy 3.1.6** (`@11ty/eleventy`, the only dependency). Input `src/`, output
`_site/`. 58 source templates build 56 HTML pages.

```bash
npm install
npm run build     # eleventy  -> _site/
npm run serve     # eleventy --serve (local dev)
```

- `src/index.html` — landing page
- `src/*.njk` — about, research, benchmarks, glossary, methodology, case-studies,
  changelog, careers, security, terms
- `src/research/*.njk` — the research articles
- `src/_includes/` — shared layouts/partials
- `eleventy.config.js` — build config; every static file (`robots.txt`,
  `sitemap.xml`, `_headers`, `_redirects`, `worker.js`, icons, …) is an explicit
  `addPassthroughCopy` entry. **A new static file is not copied unless you add it there.**

`_site/` is committed build output — regenerate it with `npm run build`, don't
hand-edit it.

## Analytics

Google Analytics 4: **G-30NBV0P9QN** loaded by `assets/consent.js` only after explicit analytics consent.

`assets/attribution.js` records the visit's first-touch source (AI assistant /
search / social / direct) in `sessionStorage` and fires a GA4 `book_click` event
on booking-CTA clicks (post-consent only). Register the event params
`book_source`, `book_medium`, and `landing_page` as custom dimensions in GA4 to
break bookings down by source.

## SEO

Baked into the landing page:
- Full meta stack (title, description, keywords, canonical, hreflang, OG, Twitter)
- 3 JSON-LD blocks: `Organization`, `SoftwareApplication`, `FAQPage`
- Semantic HTML (`<main>`, `<article>` via `<aside>`, `<section aria-labelledby>`, skip link)
- Single H1, keyword-rich H2s

## Deploy — Cloudflare Workers

Not Pages. `wrangler.jsonc` deploys a **Worker** named `tidal`, serving `_site/`
as static assets with `src/worker.js` in front (`run_worker_first: true`).

- Repo: `git@github.com:lisn0/tidal.git`, branch `main`
- Build runs from the wrangler config (`build.command: npm run build`, watching `src`)
- Verify: `curl -I https://llmcfo.com` · `/robots.txt` · `/sitemap.xml`

## IndexNow

Key file `src/9f7a91c496064b7e96137c3326d9b895.txt` is copied to the site root —
that key must stay served for submissions to be accepted. Submit with
`scripts/indexnow-submit.mjs`.

## Submit to Google

1. **Search Console** → add `llmcfo.com` as a Domain property
2. Verify via DNS TXT (Cloudflare auto-handles if domain is on Cloudflare)
3. Submit `https://llmcfo.com/sitemap.xml`
4. Request indexing for `https://llmcfo.com/`

## Required assets

- [x] `og.png` — 1200×630 social card (referenced by OG/Twitter meta)
- [x] `favicon.ico` / `favicon.svg`
- [ ] `logo.png` — referenced by `Organization` JSON-LD, still missing
