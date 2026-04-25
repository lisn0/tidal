# llmcfo.com

Static landing page for **LLM CFO** — managed AI cost optimization platform.

## Stack

Single-file static HTML. No build step. No dependencies.

- `index.html` — full page (inline CSS, vanilla JS for the code-panel tabs)
- `robots.txt` — allows all crawlers + AI bots, points to sitemap
- `sitemap.xml` — root + section anchors
- `_headers` — Cloudflare Pages: HSTS, CSP, security headers, cache policy
- `_redirects` — Cloudflare Pages: www → apex 301

## Analytics

Google Analytics 4: **G-QLN7D39SDK** loaded by `assets/consent.js` only after explicit analytics consent.

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
