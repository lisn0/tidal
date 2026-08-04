# LLM spend policy — template

> Fill in every `[BRACKET]`. Delete any section you will not actually enforce:
> an unenforced clause teaches people the whole document is decorative.
>
> Template published by LLM CFO (https://llmcfo.com). Use it freely, no attribution required.

**Owner:** [NAME, ROLE]
**Approver:** [NAME, ROLE]
**Effective:** [DATE]
**Review cadence:** [quarterly / on every provider price change]

---

## 1. Scope

This policy covers spend on hosted large-language-model APIs and inference
endpoints, including [OpenAI, Anthropic, AWS Bedrock, Google Vertex AI, Azure
OpenAI, and any OpenAI-compatible endpoint reached through a gateway].

It does not cover [GPU instances for training, embedding-only workloads,
seat-based AI tooling such as coding assistants]. Those are governed by
[OTHER POLICY].

## 2. Attribution requirements

Every call to a covered provider must be attributable to a workload and an
owning team before it reaches production.

- **Required metadata on every request:** `workload`, `team`, `environment`,
  and `cost_center`. Implementation: [provider metadata field / gateway virtual
  key per workload / Bedrock cost allocation tags / Vertex billing labels].
- **Unattributed spend is capped at [5]% of the monthly total.** Above that, the
  [PLATFORM TEAM] opens a remediation ticket and it is treated as an incident,
  not a backlog item.
- **Production traffic must route through [GATEWAY].** Direct provider keys in
  application code are not permitted outside [sandbox accounts]. Rationale: a
  key that does not pass through a gateway cannot be attributed, rate-limited,
  or revoked independently.

## 3. Budgets and thresholds

| Scope | Monthly budget | Soft alert | Hard action |
|---|---|---|---|
| Total LLM spend | $[X] | [80]% | Notify [ROLE] |
| Per workload | $[X] | [80]% | Notify workload owner |
| Per non-production environment | $[X] | [80]% | [Throttle to N rps] |
| Any single workload, day over day | — | [+50]% in 24h | [Page on-call] |

Budgets are set on **cost per unit of work** where a unit is defined
(per ticket, per document, per conversation), and on absolute spend only where
it is not. Absolute-only budgets fail during growth and nobody trusts them
afterwards.

## 4. Model selection

- New workloads start on the **cheapest model that passes the workload's
  evaluation set**, not the most capable model available. Moving up is a
  documented decision with the evaluation delta attached.
- Reasoning-capable models require an explicit justification recorded in
  [WHERE], because reasoning tokens bill as output and are invisible in the
  response body.
- A model may not be changed in production without an A/B test of at least
  [7] days against the incumbent, measured on both cost per unit and
  [QUALITY METRIC].

## 5. Mandatory cost controls

The following are not optional for production workloads:

- **Prompt caching enabled** wherever the provider supports it and the prompt
  has a stable prefix of [1024]+ tokens. Static content goes at the top of the
  prompt; variable content at the bottom.
- **`max_tokens` set on every call.** An unbounded generation is an unbounded
  invoice line.
- **Retry budget capped** at [2] retries with exponential backoff. Retries are
  billed in full and are the most common cause of a spend spike that no feature
  launch explains.
- **Agent loops carry a step cap** of [N] and emit a metric when they hit it.
  Work that hits the cap is billed and delivers nothing; it must be visible.
- **Batch or off-peak tiers used** for anything without a latency requirement.
  Document the latency requirement rather than assuming there is one.

## 6. Review and reporting

- [MONTHLY]: spend by workload, team and model, and cost per unit of work,
  reconciled against the raw provider invoice. A dashboard figure that does not
  reconcile to an invoice is reported as unreconciled, not as the number.
- [QUARTERLY]: review of the top [5] workloads by spend, with the owning team
  presenting cost per unit over time and any quality trade-offs made.
- **On every provider price change:** re-run the model selection decision for
  workloads within [20]% of a routing threshold.

## 7. Exceptions

Exceptions are granted by [ROLE], recorded in [WHERE], and expire after
[90] days unless renewed. An exception with no expiry is a policy change and
should be made as one.

---

*Adapted from the policy skeleton LLM CFO uses during cost audits. If you want
this filled in against your actual invoices, the audit is free:
https://llmcfo.com/book*
