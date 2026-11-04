# KDP E-Book Generator — Implementation Plan

> **Last updated:** 2026-04-14
> **App version:** 2.1.0

---

## 1) Confirmed Scope and Target Outcome

- **Scope type:** Architecture hardening, operational alignment, and deployment readiness.
- **Coverage:** AI content generation, market-research ingestion/simulation, persistence lifecycle, EPUB/export path, KDP automation, and multi-platform release pipeline.
- **Target platforms:** Web (Vite SPA), Electron desktop, Tauri desktop, and standalone Cloud Run backend.

---

## 2) Baseline Architecture Mapping

- **Frontend shell:** Step-driven React + TypeScript workflow in `App.tsx`.
- **Domain contracts:** Shared interfaces and enums in `types.ts`.
- **AI layer:** `services/geminiService.ts` (Google Gemini, user's own API key) + token/caching helpers in `services/tokenOptimizer.ts`.
- **RAG layer:** `services/ragService.ts` — Xenova embeddings vector store + Book Bible extraction.
- **Persistence:** IndexedDB wrapper in `services/storageService.ts` and periodic autosave behavior in `hooks/useAutoSave.ts`.
- **Desktop integration (Electron):** Bridge via `electron/preload.ts` and `electron/main.ts`.
- **Desktop integration (Tauri):** Native wrapper via `src-tauri/` with `tauri-plugin-dialog` and `tauri-plugin-fs`.
- **Automation backend:** Optional WebSocket service via `server/server.ts`; worker logic in `server/automation-worker.ts`.

---

## 3) Dependency and Runtime Alignment Decisions

### Canonical runtime modes
1. **Web authoring mode** — `npm run dev` / `npm run build` → static SPA.
2. **Electron desktop mode** — `electron/main.ts` + IPC-backed local integrations.
3. **Tauri desktop mode** — `npm run tauri:build` → native installers for Windows / macOS / Linux.
4. **Standalone backend mode (optional)** — Docker → Cloud Run for remote automation.

### Environment variable policy
| Variable | Required | Purpose |
|---|---|---|
| `VITE_GOOGLE_API_KEY` | Yes | Google Gemini AI generation |
| `VITE_TAVILY_API_KEY` | No | Live web research via Tavily |
| `KDP_EMAIL` | Automation only | Amazon KDP login |
| `KDP_PASSWORD` | Automation only | Amazon KDP login |

**Policy:** Never commit real values. Use `.env.example` as the canonical template. The `.env` file is `.gitignore`d.

---

## 4) Completed Work

### ✅ Phase 1 — Contract & Runtime Alignment
- [x] **DOC-01** — Runtime mode + env-var contract documented in README.
- [x] **DOC-02** — Server README updated with optional-mode positioning and Cloud Run deployment guide.
- [x] **ENV-01** — `.env` added to `.gitignore`; `.env.example` created as the canonical template.

### ✅ Phase 2 — Reliability Hardening (PR: `120ab2c`)
- [x] **BUG-01** — `ragService.ts`: Embedder singleton race condition fixed (promise-lock).
- [x] **BUG-02** — `ragService.ts`: Redundant dynamic import removed.
- [x] **BUG-03** — `App.tsx`: `bookBible`/`bookGenre`/`researchContext` now round-trip through save/load.
- [x] **BUG-04** — `aiProvider.ts` (removed 2026-11-04 with the dead provider layer) + `realMarketService.ts`: All `fetch` calls now have timeouts.
- [x] **BUG-05** — `ProviderSettingsPanel.tsx` (removed 2026-11-04 with the dead provider layer): Panel auto-dismisses on outside click.
- [x] **BUG-06 (Critical)** — `ExpansionHub.tsx`: Duplicate old component removed; new tab-based UI is now actually rendered.
- [x] **BUG-07** — `App.tsx`: Sequential humanization branch now actually runs sequentially.
- [x] **BUG-08** — `geminiService.ts`: Guard added for empty `tableOfContents` in outline improvement pass.

### ✅ Phase 3 — Deployment Infrastructure
- [x] **DEPLOY-01** — `src-tauri/tauri.conf.json`: Production identifier (`com.blacklistedbinary.kdpebookgenerator`), version synced to `2.1.0`, window defaults improved.
- [x] **DEPLOY-02** — `src-tauri/Cargo.toml`: Placeholder metadata updated.
- [x] **DEPLOY-03** — `server/Dockerfile`: Two-stage Node 20 + Chromium/Playwright image written.
- [x] **DEPLOY-04** — `.github/workflows/ci.yml`: Frontend build + server type-check on every push/PR.
- [x] **DEPLOY-05** — `.github/workflows/release.yml`: Tauri multi-platform binary build & GitHub Release on version tags.

---

## 5) Subsystem Implementation Requirements (Remaining)

### A. Market Research Pipeline
- Introduce explicit mode selection for AI-simulated vs real ingestion paths.
- Standardize partial-failure fallback policy — missing trends/scrape data must degrade gracefully.
- Normalize UI messaging for unavailable sources and retries.

### B. Book Generation Pipeline
- Add formal token budget boundaries and prompt-size controls.
- Enforce cache-key and TTL policy consistency by operation class.

### C. Persistence and Project Lifecycle
- Define explicit persisted state schema versioning and migration path.
- Add corruption recovery path with safe defaults and user-facing guidance.

### D. Automation Bot Pipeline
- Enforce single-run lock (one active automation per session).
- Deterministic stop/cancel semantics and CAPTCHA pause/resume guarantees.
- Disconnect cleanup guarantees.

---

## 6) Security and Robustness Requirements

- Validate payload shape at all IPC/message entry points.
- Add bounded error handling around async generator transitions.
- Ensure desktop production defaults disable non-essential debug behavior (DevTools open unconditionally in `electron/main.ts` — restrict to `!app.isPackaged`).
- Keep external-link handling explicit and allowlisted where possible.

---

## 7) UX and Observability Requirements

- Create consistent status enums and transitions for long-running actions.
- Define structured logging levels: user-visible, diagnostic, error with actionable context.
- Track telemetry: token usage trend, cache hit/miss, automation milestones and failure stage.
- Ensure every recoverable failure presents clear next-step actions.

---

## 8) Remaining Backlog (Recommended Order)

| ID | Task |
|---|---|
| ARCH-01 | Define shared automation transport contract (IPC primary, WS optional adapter) |
| MR-01 | Market-research fallback normalization and user messaging |
| GEN-01 | Generation contract tightening and prompt-size guardrails |
| PERSIST-01 | Versioned state schema + migration strategy |
| BOT-01 | Automation single-run lock + deterministic cancellation handling |
| SEC-01 | IPC/message payload validation layer |
| SEC-02 | Restrict DevTools to `!app.isPackaged` in `electron/main.ts` |
| UX-01 | Unified status model + recoverable error UX |
| OBS-01 | Logging/telemetry normalization for token/cache/automation events |
| OPS-01 | Final operational runbook and release checklist |

---

## 9) Validation Commands

```bash
# Frontend build
npm run build

# Server TypeScript check
npx tsc -p server/tsconfig.json --noEmit

# Tauri desktop build (requires Rust toolchain)
npm run tauri:build
```

---

## 10) Definition of Done (per release)

- [ ] All CI checks pass on the release branch (`ci.yml`).
- [ ] `src-tauri/tauri.conf.json` version matches `package.json` version.
- [ ] `.env` is not tracked by git; `.env.example` is up to date.
- [ ] Release tag pushed → `release.yml` produces installers for Windows, macOS (arm64 + x86_64), and Linux.
- [ ] Docker image builds successfully (`docker build -f server/Dockerfile .`).
- [ ] Manual validation matrix (below) passes.

### Manual Validation Matrix

1. **Single-book E2E flow** — Research → outline → content → illustration → review.
2. **Real market-research fallback** — Simulate unavailable trends/scrape source; confirm graceful degradation.
3. **Automation lifecycle** — Start → CAPTCHA pause/resume → stop → restart.
4. **Persistence lifecycle** — Save/reload/reset/import with valid and malformed payloads.
5. **API key/credential paths** — Missing and invalid key behavior must be actionable and non-destructive.
6. **Tauri desktop** — Window state persists across close/reopen; file dialogs work.
