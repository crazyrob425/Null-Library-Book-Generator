# Gateways (optional sidecars)

Null Library works out of the box with Gemini direct. This folder runs
two optional, self-hosted gateways that chapter generation can be
routed through instead:

| Gateway | What it's for | Dashboard | API base URL |
|---|---|---|---|
| **FreeLLMAPI** | Stacks many providers' published free tiers into one endpoint; tracks per-key quotas; fails over on rate limits | http://localhost:3001 | `http://localhost:3001/v1` |
| **Portkey Gateway** | General routing gateway across 250+ providers, with fallbacks, caching, and guardrails | http://localhost:8787/public/ | `http://localhost:8787/v1` |

```bash
docker compose up -d freellmapi   # and/or
docker compose up -d portkey
```

Then, in Null Library: footer → **Gateway Routing** → pick the gateway
→ paste its key → set a model id → **Test Connection**.

See **docs/GATEWAYS.md** in the repo root for the full setup guide,
including which parts of the pipeline use the gateway and which stay on
Gemini.
