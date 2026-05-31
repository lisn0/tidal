# Product Marketing — LLM CFO

> Single source of truth for positioning, messaging, and audience. Every marketing
> skill (copywriting, cro, seo, competitors, content-strategy, ads…) should read
> this first. Derived from the live site (llmcfo.com) on 2026-05-31.
>
> **Claims discipline:** Numbers already published on the site are kept as-is.
> Any proof point NOT yet verifiable on the site is marked
> `[VERIFY — do not publish until confirmed]`. Do not promote a placeholder to a
> live claim without real data.

## One-liner

Managed AI FinOps for teams with $20K+/month LLM spend — audit, optimize, reconcile.
We implement the cost reductions; you only pay on verified savings.

## ICP (Ideal Customer Profile)

- **Primary:** Engineering teams at post-MVP stage running production LLMs across
  multi-provider spend ($20K+/month baseline).
- **Buyers:** VP Engineering, CTO, or Finance Lead at B2B SaaS / AI-native companies,
  or enterprises piloting LLM features.
- **Secondary:** Platform / DevOps teams responsible for cost controls.

### Who it's NOT for
- Teams under ~$20K/month spend (observability tools are a better ROI at that stage).
- Teams still deciding whether to run LLMs in production (that's R&D, not FinOps).
- Teams that require SOC 2 Type II / HIPAA certification *today*
  (available via DPA/NDA; certification is roadmap, not current — `[VERIFY]`).

## Top value props

1. **Reconciled cost reduction (40–60% typical).** We audit spend against raw provider
   invoices, implement proven levers (model routing, semantic caching, prompt caching,
   prompt compression), and reconcile delivered savings monthly — no estimates.
2. **Quality-first.** Every change is A/B tested (7+ days) against your baseline;
   regressions auto-rollback. We own the operational risk.
3. **Performance pricing (risk-reversed).** Free audit, then a fee on delivered savings
   only. No savings = no fee.

## Differentiators

- **Operator-led, not sales-led** — the person who reads your invoices writes your
  routing rules. We do the engineering; we don't recommend and hand off.
- **Audit-first** — we baseline before any code ships.
- **No provider lock-in** — OpenAI, Anthropic, Google Vertex, AWS Bedrock, Azure OpenAI
  and others; we optimize across total spend, not one vendor.
- **Monthly reconciliation** — every claimed saving is checked against raw invoices.

## Primary claim / proof discipline

- Published & allowed: "Targeting 40–60% reduction", "3–5 week kickoff",
  "no fee if no savings" (already on site).
- `[VERIFY — do not publish until confirmed]`: any specific customer outcome,
  case-study metric, customer count, retention %, logo, rating, or named testimonial.
  The site's case-studies page currently says "No public case studies yet" — keep it
  honest until a real (even anonymized, NDA-covered) result exists.

## Booking / GTM hook

Free audit — ~2 weeks, read-only access to your spend, no implementation commitment.
We return a ranked map of cost-reduction opportunities and a tracked baseline. Move to
paid optimization only if you approve the plan and ROI. Booking route: site-owned `/book`.

## Content pillars (by buyer journey)

1. **Awareness** — what is AI FinOps, why LLM costs are hard, industry benchmarks.
2. **Consideration** — DIY vs managed, observability ≠ optimization, provider cost
   comparisons, "safe" (A/B-tested) optimization.
3. **Decision** — role guides (CFO, eng lead, PM, platform), how to evaluate a
   cost-optimization service.
4. **Implementation** — 30/60/90-day roadmap, routing patterns, semantic-caching setup,
   per-provider guides (OpenAI live; Anthropic / Bedrock / Vertex / Azure are gaps).

## Voice

Technical, transparent, results-focused. Cite real pricing, acknowledge trade-offs,
no hype, no inflated guarantees. Conservative claims only (see CLAUDE.md).
