# Authentication

## Who can use this API

The LLM CFO public API is designed for AI agents, search engines, and integrations that need structured access to LLM CFO content and service status.

## Authentication

No API key is required to read public pages or use the public contact endpoint. `POST /api/contact` accepts JSON or form data and is rate-limited. It sends a message to the team; it does not create an account.

Tidal Telemetry uses a separate login at https://openlit.llmcfo.com/login. Existing account holders sign in there. General self-service registration is closed; new companies should request access from the team. Human passwords must never be sent through MCP.

The hosted Tidal MCP endpoint is https://otlp.llmcfo.com/mcp. It requires a tenant token issued for the telemetry account. Its existing tools report setup and usage and can send a test trace. The marketing site's public contact API does not use Tidal credentials.

## Available endpoints

- `GET /health.json` — Service health status
- `GET /.well-known/api-catalog` — RFC 9727 API catalog
- `GET /openapi.json` — OpenAPI 3.1 specification
- `GET /llms.txt` — Curated markdown index for AI agents
- `GET /llms-full.txt` — Full concatenated markdown of public pages
- `GET /api/contact` — Contact API fields and limits
- `POST /api/contact` — Send a message (JSON or form data; no account creation)

## Content usage policy

Content-Signal: search=yes, ai-input=yes, ai-train=no

## Contact

Use https://llmcfo.com/contact or book a call at https://llmcfo.com/book/schedule. Email: hello@llmcfo.com (delivery has not been verified end to end).
