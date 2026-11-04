# Gateway Routing — FreeLLMAPI & Portkey

Null Library generates with **Google Gemini directly** by default. For
the plain-text stages — **chapter writing, streamed chapter writing, and
the humanize pass** — you can instead route generation through a
self-hosted, OpenAI-compatible gateway running on your own machine.

Why bother?

- **FreeLLMAPI** aggregates the *published free tiers* of dozens of
  providers (Gemini, Groq, OpenRouter, Cerebras, Mistral, and more)
  behind a single endpoint. It keeps a per-key quota ledger so routing
  stays under every provider's caps, and fails over to the next provider
  automatically when one rate-limits. Stacked together, free tiers that
  are toys individually become a real working budget for a book
  pipeline.
- **Portkey Gateway** is a general-purpose routing layer (250+
  providers) with fallback chains, caching, retries, and guardrails —
  useful if you already run it, or want one endpoint for paid and free
  providers alike.

Structured stages — **book bible, outlines, character sheets, market
research, marketing metadata, review** — use Gemini's native
JSON-schema responses and **always run on Gemini directly**, regardless
of the gateway setting. If the gateway errors or is offline, the text
stages **fall back to Gemini automatically**; selecting a gateway can
never make generation less reliable than the default.

## 0. Automatic mode (default) — do nothing

Gateway Routing ships in **Fully automatic** mode. In the desktop app,
a built-in supervisor (`gateways/supervisor.mjs`, spawned by the app —
no terminal, no Docker commands, nothing to configure):

1. **Detects your machine** — OS/arch, whether Docker (and its daemon)
   or Node/npx is available, which ports are free, and whether a
   gateway is already running (it adopts healthy ones instead of
   starting duplicates).
2. **Provisions with the best settings for the machine** — Docker
   Compose when available (npx for Portkey otherwise), localhost-only
   binding, alternate ports on conflict, and a generated, persisted
   encryption key for FreeLLMAPI. It also builds FreeLLMAPI's
   *declarative startup config* from the provider keys Null Library
   already holds (your Gemini key, plus Groq/OpenRouter if you ever add
   them), so FreeLLMAPI boots pre-loaded — no dashboard step.
3. **Runs and maintains them** — health checks every 20 seconds,
   restarts with exponential backoff and an hourly budget, port
   failover, and a primary-gateway choice (FreeLLMAPI first, Portkey
   second) that the app follows automatically, including picking the
   best available model for book generation from the gateway's live
   model list.
4. **Asks the AI when it's stuck** — if a gateway fails in a way the
   rules don't cover, the in-app manager sends the (secret-free) error
   to Gemini once and lets it pick from a fixed menu: restart, switch
   gateway, wait, or give up. The AI never gets a shell.

Watch it work — or ignore it entirely — in the footer **Gateway
Routing** panel, which shows live status and the supervisor's decision
log. Turn the toggle off there to manage gateways manually (below).
State and logs live outside the repo in the app's data folder
(`gateways/status.json`, `supervisor.log`); seed keys travel only via
process environment, never into files in this repo or into logs.

Standalone use: `node gateways/supervisor.mjs probe|start|status|stop`.

## 1. Start a gateway (manual mode)

### Option A — Docker (from this repo)

```bash
cd gateways
docker compose up -d freellmapi   # FreeLLMAPI on :3001
docker compose up -d portkey      # Portkey on :8787
docker compose down               # stop both
```

### Option B — Upstream installers

- FreeLLMAPI: see its repo for the one-line Docker installer or desktop
  app — <https://github.com/tashfeenahmed/freellmapi>
- Portkey: `npx @portkey-ai/gateway` (Node 18+) —
  <https://github.com/Portkey-AI/gateway>

## 2. Configure the gateway itself

**FreeLLMAPI** — open <http://localhost:3001>, go to the **Keys** page,
and add your own API keys for whichever free-tier providers you use
(each provider's signup is free; quotas belong to your accounts). Order
the **Fallback Chain** to taste. Your **unified key** is shown in the
Keys page header — that's the key Null Library needs.

**Portkey** — open <http://localhost:8787/public/>, configure a provider
(model + credentials) in the console, and note the model id and the
virtual key / config your setup exposes.

## 3. Point Null Library at it

1. Footer → **Gateway Routing** pill.
2. Pick **FreeLLMAPI** or **Portkey Gateway** (base URLs prefill to the
   local defaults above; edit if you run them elsewhere).
3. Paste the gateway key (stored only in this browser's local storage).
4. Set the **model id** — for FreeLLMAPI, any id from its dashboard
   model list; for Portkey, the model your config exposes.
5. **Test Connection** — it probes `GET /v1/models` and reports how
   many models the gateway lists.

From then on, chapter generation (including the full-pipeline runner,
which calls the same services) goes through the gateway, with Gemini as
the automatic fallback.

## Notes & honest limits

- **Free-tier quotas are per account/project, not per key.** FreeLLMAPI
  stacks *different providers'* tiers; adding ten keys from the *same*
  provider does not multiply that provider's free tier, and trying to
  evade caps with multiple accounts violates those providers' terms.
- FreeLLMAPI is a young project (2026). It runs as a replaceable
  sidecar: if it ever breaks, switch the footer pill back to Gemini
  Direct and the app is exactly as it was.
- Gateway keys and provider keys never leave your machine except to the
  gateway URL you configured. Nothing about this feature phones home.
- Any other OpenAI-compatible endpoint (LiteLLM, Ollama at
  `http://localhost:11434/v1`, LocalAI, a cloud endpoint) works through
  the **Custom** preset the same way.
