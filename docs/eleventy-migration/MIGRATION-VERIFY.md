# Eleventy migration verification

Generated: 2026-06-21T10:13:06.656Z

## Summary

- HTML pages checked: 47
- HTML identical: 26
- HTML drift-only: 21
- HTML unexpected: 0
- Static/passthrough files checked: 35
- Static/passthrough identical: 35
- Static/passthrough unexpected: 0
- AI-signal mismatches: 0
- Nested index.html outputs: 0
- Extra output files: 0

## HTML pages

- 404.html: identical
- about.html: drift-only (allowed glyph drift on lines 36)
- benchmarks.html: drift-only (allowed glyph drift on lines 39)
- careers.html: drift-only (allowed glyph drift on lines 36)
- case-studies.html: drift-only (allowed glyph drift on lines 36)
- changelog.html: drift-only (allowed glyph drift on lines 36)
- glossary.html: drift-only (allowed glyph drift on lines 48)
- index.html: identical
- methodology.html: identical
- privacy.html: identical
- research.html: drift-only (allowed glyph drift on lines 39)
- research/agent-spend-guardrails.html: identical
- research/ai-chargeback-showback.html: identical
- research/ai-finops-2026.html: identical
- research/ai-finops.html: identical
- research/ai-governance-framework.html: identical
- research/ai-governance.html: identical
- research/background-mode-economics.html: identical
- research/batch-api-routing.html: drift-only (allowed glyph drift on lines 6, 26)
- research/built-in-tools-costs.html: identical
- research/cache-invalidation-cost.html: drift-only (allowed glyph drift on lines 6)
- research/cache-read-tokens-baseline-trap.html: drift-only (allowed glyph drift on lines 6, 26)
- research/conversation-state-costs.html: identical
- research/evals-cost-discipline.html: identical
- research/genai-telemetry-schema.html: identical
- research/how-to-build-an-llm-cfo-function.html: drift-only (allowed glyph drift on lines 6)
- research/langfuse-vs-litellm-vs-openlit.html: drift-only (allowed glyph drift on lines 6)
- research/litellm-vs-helicone-vs-langfuse.html: drift-only (allowed glyph drift on lines 6, 29)
- research/llm-cost-dashboards.html: identical
- research/llm-cost-monitoring.html: identical
- research/llm-cost-optimization.html: drift-only (allowed glyph drift on lines 6, 26)
- research/llm-cost-per-request.html: identical
- research/llm-token-usage-tracking.html: identical
- research/model-routing.html: drift-only (allowed glyph drift on lines 6, 26)
- research/multimodal-costs.html: identical
- research/openai-cost-optimization.html: identical
- research/openai-flex-vs-batch.html: identical
- research/opentelemetry-genai-cost-tracking.html: identical
- research/prompt-caching-2026.html: identical
- research/prompt-caching-explained.html: drift-only (allowed glyph drift on lines 6, 26)
- research/provider-arbitrage.html: drift-only (allowed glyph drift on lines 6, 26)
- research/reasoning-tokens-cost.html: identical
- research/scale-tier-decision.html: drift-only (allowed glyph drift on lines 6)
- research/semantic-caching.html: drift-only (allowed glyph drift on lines 6, 26)
- research/what-is-ai-governance.html: identical
- security.html: drift-only (allowed glyph drift on lines 36)
- terms.html: drift-only (allowed glyph drift on lines 36)

## Static and edge files

- .assetsignore: identical
- .well-known/agent-skills/book-audit.md: identical
- .well-known/agent-skills/index.json: identical
- .well-known/agent-skills/research-llm-cost-optimization.md: identical
- .well-known/security.txt: identical
- 9f7a91c496064b7e96137c3326d9b895.txt: identical
- README.md: identical
- _headers: identical
- _redirects: identical
- apple-touch-icon.png: identical
- assets/attribution.js: identical
- assets/consent.js: identical
- assets/fonts/geist-latin-400-normal.woff2: identical
- assets/fonts/geist-latin-500-normal.woff2: identical
- assets/fonts/geist-latin-600-normal.woff2: identical
- assets/fonts/geist-latin-700-normal.woff2: identical
- assets/fonts/geist-latin-800-normal.woff2: identical
- assets/fonts/geist-mono-latin-400-normal.woff2: identical
- assets/fonts/geist-mono-latin-500-normal.woff2: identical
- assets/fonts/geist-mono-latin-600-normal.woff2: identical
- assets/fonts/instrument-serif-latin-400-italic.woff2: identical
- assets/fonts/instrument-serif-latin-400-normal.woff2: identical
- assets/page.css: identical
- favicon.ico: identical
- favicon.svg: identical
- humans.txt: identical
- llms.txt: identical
- og-template.html: identical
- og.png: identical
- robots.txt: identical
- seo-keyword-research.md: identical
- site.webmanifest: identical
- sitemap.xml: identical
- worker.js: identical
- wrangler.jsonc: identical

## AI-signal count check

- All tracked signal counts match per page.

## Flat URL check

- No nested index.html outputs found.

## Extra output file check

- No extra files found in `_site/`.

## Shared edit demonstration

- Research article shared head/nav/footer markup now lives in `src/_includes/research.njk`.
- Regular page shared shell markup now lives in `src/_includes/page.njk`.
- The `consent.js` + `attribution.js` script line for those page families is now edited in one layout file per family instead of each converted page.
