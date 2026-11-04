# KDP E-Book Generator — Deployment Roadmap

> Last updated: 2026-04-14 · App v2.1.0

This document is the single source of truth for getting every deployment target of the app live. Three independent targets exist; deploy whichever ones you need.

---

## Deployment Targets at a Glance

| Target | Audience | Trigger | Artifacts |
|---|---|---|---|
| **Web SPA** (GitHub Pages / Vercel / Netlify) | Anyone with a browser | `npm run build` → host `dist/` | Static files |
| **Desktop (Tauri)** | Windows / macOS / Linux users | `git tag v2.1.0 && git push origin v2.1.0` | `.msi`, `.exe`, `.dmg`, `.AppImage`, `.deb` |
| **Automation Backend** (Docker → Cloud Run) | Headless KDP automation | Push image, `gcloud run deploy` | Docker image → HTTPS WebSocket service |

---

## Pre-Flight Checklist (all targets)

- [ ] **Revoke the leaked API key** — A real `VITE_GOOGLE_API_KEY` value was committed to the repo. Immediately go to [Google AI Studio](https://aistudio.google.com/app/apikey), delete the old key, and create a new one.
- [ ] `.env` is in `.gitignore` (fixed in this PR — verify with `git check-ignore .env`).
- [ ] `.env.example` is the canonical setup template and contains only placeholders.
- [ ] `src-tauri/tauri.conf.json` has the real app identifier (not `com.tauri.dev`). ✅ Fixed to `com.blacklistedbinary.kdpebookgenerator`.
- [ ] `tauri.conf.json` version matches `package.json` version. ✅ Both now at `2.1.0`.
- [ ] CI passes on the branch you want to release from (`Actions → CI`).

---

## Target 1 — Web SPA

The web build is a pure static site. It runs entirely in the browser — no server needed.

### Hosting options

| Platform | Free tier | Custom domain | Notes |
|---|---|---|---|
| **GitHub Pages** | ✅ | ✅ | Needs `base: './'` in `vite.config.ts` ✅ (already set) |
| **Vercel** | ✅ | ✅ | Zero-config; connect repo and it auto-deploys |
| **Netlify** | ✅ | ✅ | Zero-config; auto-deploys from `main` |

### Steps (Vercel — recommended)

1. Go to [vercel.com](https://vercel.com) → **New Project** → import `crazyrob425/KDP-E-Book-Generator`.
2. Vercel auto-detects Vite. Leave build command (`npm run build`) and output dir (`dist`) as-is.
3. Under **Environment Variables**, add:
   - `VITE_GOOGLE_API_KEY` = your new Gemini API key
   - (Optionally) `VITE_TAVILY_API_KEY`
4. Click **Deploy**. Every push to `main` auto-redeploys.

### Steps (GitHub Pages)

1. In **Settings → Pages**, set Source to **GitHub Actions**.
2. Create `.github/workflows/pages.yml`:
   ```yaml
   name: Deploy to GitHub Pages
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: ubuntu-latest
       permissions:
         pages: write
         id-token: write
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: "20", cache: "npm" }
         - run: npm ci
         - run: npm run build
           env:
             VITE_GOOGLE_API_KEY: ${{ secrets.VITE_GOOGLE_API_KEY }}
         - uses: actions/upload-pages-artifact@v3
           with: { path: dist }
         - uses: actions/deploy-pages@v4
           id: deployment
   ```
3. Add `VITE_GOOGLE_API_KEY` as a repository secret (**Settings → Secrets and variables → Actions**).

> ⚠️ **Important:** Electron-specific features (`window.electronAPI`, file dialogs, IPC automation) are unavailable in the web build. They fail silently via the `desktopBridge` stub — this is expected behaviour.

---

## Target 2 — Desktop App (Tauri)

Tauri bundles the Vite frontend into a native app with a small Rust shell. This is the recommended distribution path for power users.

### One-time setup (developer machine)

1. **Install Rust:**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup update stable
   ```
2. **Install Tauri CLI system deps:**
   - macOS: `xcode-select --install`
   - Ubuntu/Debian: `sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
   - Windows: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload.
3. **Install Node deps:** `npm install`
4. **Dev mode:**
   ```bash
   npm run tauri:dev   # starts Vite dev server + Tauri window
   ```

### Build desktop installers locally

```bash
npm run release:package
```

Installers land in `src-tauri/target/release/bundle/`:
- Windows: `*.msi` and `*.exe` (NSIS)
- macOS: `*.dmg`
- Linux: `*.AppImage` and `*.deb`

### Automated multi-platform release via GitHub Actions

The `.github/workflows/release.yml` workflow builds installers for all platforms and publishes them as a GitHub Release automatically.

### Windows installer prep stack (NSIS)

- `npm run release:package` includes:
  - `npm run brand:nsis`, which generates:
  - `src-tauri/installer-assets/nsis-header.bmp`
  - `src-tauri/installer-assets/nsis-sidebar.bmp`
  - `npm run release:scaffold-update`, which generates `release/updates/latest.json.template` for updater metadata handoff.
  - `npm run tauri:build`, which produces native installers.
- `src-tauri/installer/nsis-hooks.nsh` enforces a legal confirmation gate before install.
- `src-tauri/installer/EULA.txt` is bundled as the installer license file.

**To cut a release:**

```bash
# Make sure you're on main and everything is merged
git checkout main
git pull

# Bump the version in package.json AND src-tauri/tauri.conf.json to match, then:
git add package.json src-tauri/tauri.conf.json
git commit -m "chore: bump version to v2.2.0"
git tag v2.2.0
git push origin main --tags
```

The workflow will:
1. Build on Windows, macOS (arm64 + x86_64), and Ubuntu.
2. Create a **draft** GitHub Release with all installers attached.
3. You review the draft and click **Publish** to make it public.

### Windows x64 beta packaging

For Windows-only prereleases, use the dedicated `.github/workflows/windows-beta-release.yml` workflow.

**Recommended beta tag format:**

```bash
git tag v2.2.0-beta.1
git push origin v2.2.0-beta.1
```

That workflow will:

1. Build only the Windows x64 NSIS installer.
2. Publish the GitHub Release as a **prerelease**.
3. Attach the NSIS setup executable to the release for beta testers.

### Required repository secret

- `VITE_GOOGLE_API_KEY` — Your Gemini API key (embedded into the bundled app)

Add it at **Settings → Secrets and variables → Actions → New repository secret**.

### Version sync rule

**`package.json` `version` and `src-tauri/tauri.conf.json` `version` must always match.** The release workflow reads both; a mismatch will cause the Tauri build to fail.

---

## Target 3 — Automation Backend (Docker → Cloud Run)

The `server/` directory is an optional Node.js + WebSocket + Playwright service for automating KDP book uploads.

### Build the Docker image

```bash
# From repo root (the Dockerfile uses multi-stage build: build → runtime)
docker build -f server/Dockerfile -t kdp-automation-backend:latest .
```

Test locally:
```bash
docker run -p 8080:8080 \
  -e KDP_EMAIL="your-email@example.com" \
  -e KDP_PASSWORD="your-password" \
  kdp-automation-backend:latest
```

### Deploy to Google Cloud Run

**Prerequisites:**
- Google Cloud project with billing enabled.
- `gcloud` CLI installed and authenticated.

**Step 1: Build and push to Artifact Registry**

```bash
PROJECT_ID=your-gcloud-project-id
REGION=us-central1

gcloud artifacts repositories create kdp-repo \
  --repository-format=docker \
  --location=$REGION

gcloud builds submit \
  --tag $REGION-docker.pkg.dev/$PROJECT_ID/kdp-repo/kdp-automation-backend:latest \
  -f server/Dockerfile \
  .
```

**Step 2: Deploy the service**

```bash
gcloud run deploy kdp-automation-backend \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/kdp-repo/kdp-automation-backend:latest \
  --platform managed \
  --region $REGION \
  --port 8080 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2
```

> Set `--no-allow-unauthenticated` for a production service and add Cloud IAM authentication.

**Step 3: Inject credentials via Secret Manager (never bake credentials into the image)**

```bash
printf "your-email@example.com" | gcloud secrets create KDP_EMAIL --data-file=-
printf "your-password"           | gcloud secrets create KDP_PASSWORD --data-file=-

gcloud run services update kdp-automation-backend \
  --update-secrets=KDP_EMAIL=KDP_EMAIL:latest,KDP_PASSWORD=KDP_PASSWORD:latest \
  --region $REGION
```

**Step 4: Wire the frontend**

After deployment, Cloud Run provides a URL like `https://kdp-automation-backend-xxxxxx-uc.a.run.app`.

If your frontend is configured to use the WebSocket backend mode, update the WebSocket URL constant in the relevant service/component to use `wss://` and the Cloud Run URL.

---

## Repository Secrets Reference

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Used by | Description |
|---|---|---|
| `VITE_GOOGLE_API_KEY` | `release.yml`, `pages.yml` | Gemini API key embedded in web/desktop builds |
| `VITE_TAVILY_API_KEY` | Optional | Tavily research key |

> KDP credentials are **never stored as repository secrets** — inject them at runtime via Cloud Run Secret Manager only.

---

## Deployment Checklist — Quick Reference

```
PRE-RELEASE
  [ ] Revoke & rotate the old leaked VITE_GOOGLE_API_KEY
  [ ] Run: npm run build   (must pass)
  [ ] Run: npx tsc -p server/tsconfig.json --noEmit   (must pass)
  [ ] Verify .env is git-ignored: git check-ignore .env
  [ ] Sync versions: package.json == src-tauri/tauri.conf.json

WEB DEPLOY (Vercel/Netlify)
  [ ] Connect repo, set VITE_GOOGLE_API_KEY env var, deploy

DESKTOP RELEASE
  [ ] Add VITE_GOOGLE_API_KEY to repo secrets
  [ ] git tag vX.Y.Z && git push origin main --tags
  [ ] Wait for release.yml to finish
  [ ] Review and publish the draft GitHub Release

BACKEND DEPLOY
  [ ] docker build -f server/Dockerfile -t kdp-automation-backend .  (must succeed)
  [ ] gcloud builds submit → gcloud run deploy
  [ ] Inject KDP_EMAIL + KDP_PASSWORD via Secret Manager
  [ ] Smoke-test WebSocket endpoint
```
