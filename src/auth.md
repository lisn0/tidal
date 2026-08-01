# LLM CFO — Agent Registration & API Access

## Who can use this API

The LLM CFO public API is designed for AI agents, search engines, and integrations that need structured access to LLM CFO content and service status.

## Authentication

No API key is required for public endpoints. The API is rate-limited and intended for discovery, citation, and integration purposes only.

## Available endpoints

- `GET /health.json` — Service health status
- `GET /.well-known/api-catalog` — RFC 9727 API catalog
- `GET /openapi.json` — OpenAPI 3.1 specification
- `GET /llms.txt` — Curated markdown index for AI agents
- `GET /llms-full.txt` — Full concatenated markdown of public pages

## Content usage policy

Content-Signal: search=yes, ai-input=yes, ai-train=no

## Contact

For partnership, bulk access, or questions: hello@llmcfo.com
