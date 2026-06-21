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

## Stack

Single-file static HTML. No build step. No dependencies.

- `index.html` — full page (inline CSS, vanilla JS for the code-panel tabs)
- `robots.txt` — allows all crawlers + AI bots, points to sitemap
- `sitemap.xml` — root + section anchors
- `_headers` — Cloudflare Pages: HSTS, CSP, security headers, cache policy
- `_redirects` — Cloudflare Pages: www → apex 301

## Analytics

Google Analytics 4: **G-30NBV0P9QN** loaded by `assets/consent.js` only after explicit analytics consent.

`assets/attribution.js` records the visit's first-touch source (AI assistant /
search / social / direct) in `sessionStorage` and fires a GA4 `book_click` event
on booking-CTA clicks (post-consent only). Register the event params
`book_source`, `book_medium`, and `landing_page` as custom dimensions in GA4 to
break bookings down by source.

## SEO

Baked into `index.html`:
- Full meta stack (title, description, keywords, canonical, hreflang, OG, Twitter)
- 3 JSON-LD blocks: `Organization`, `SoftwareApplication`, `FAQPage`
- Semantic HTML (`<main>`, `<article>` via `<aside>`, `<section aria-labelledby>`, skip link)
- Single H1, keyword-rich H2s

## Deploy — Cloudflare Pages

```bash
# 1. Push to GitHub (one-time)
gh repo create llmcfo --public --source=. --push --description "llmcfo.com — managed AI cost optimization"

# 2. Connect to Cloudflare Pages
#    Dashboard → Workers & Pages → Create → Pages → Connect to Git
#    - Repository: <your-org>/llmcfo
#    - Production branch: main
#    - Build command: (leave empty)
#    - Build output directory: /
#    - Root directory: /

# 3. Custom domain
#    Pages project → Custom domains → Set up a custom domain → llmcfo.com
#    (Cloudflare auto-creates the CNAME if the domain is on Cloudflare DNS)

# 4. Verify
#    curl -I https://llmcfo.com
#    curl https://llmcfo.com/robots.txt
#    curl https://llmcfo.com/sitemap.xml
```

## Submit to Google

1. **Search Console** → add `llmcfo.com` as a Domain property
2. Verify via DNS TXT (Cloudflare auto-handles if domain is on Cloudflare)
3. Submit `https://llmcfo.com/sitemap.xml`
4. Request indexing for `https://llmcfo.com/`

## Required assets (todo)

- [ ] `og.png` — 1200×630 social card (referenced by OG/Twitter meta)
- [ ] `logo.png` — referenced by Organization JSON-LD
- [ ] `favicon.ico` / `favicon.svg`
