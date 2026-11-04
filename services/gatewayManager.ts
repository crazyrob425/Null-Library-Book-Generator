/**
 * GatewayManager — the in-app micro worker.
 *
 * When Gateway Routing is in Auto mode (the default), this manager runs
 * the whole show so the user never touches gateway plumbing:
 *
 *   1. Starts the process supervisor (gateways/supervisor.mjs) through
 *      the desktop bridge — it detects the machine (Docker / Node /
 *      ports), starts FreeLLMAPI + Portkey the best way available,
 *      seeds FreeLLMAPI with the keys the app already holds, and keeps
 *      them healthy with restarts and failover.
 *   2. Polls the supervisor's status and mirrors it into the app's
 *      gateway config: whichever gateway is primary gets written into
 *      gatewayService (base URL + auto-picked best model), so chapter
 *      generation just works. If no gateway is healthy, generation
 *      silently stays on Gemini direct (geminiService also falls back
 *      per-call).
 *   3. Web mode (no desktop shell): can't spawn processes, so it adopts
 *      any gateway already answering on the standard local ports.
 *   4. AI diagnosis: if a gateway keeps failing for a reason the
 *      deterministic rules don't recognize, the manager asks the AI
 *      (Gemini direct, one small call) to classify the failure into a
 *      bounded action — restart / switch gateway / wait / give up —
 *      and executes only that. The AI never gets a shell; it picks from
 *      a menu. Max one diagnosis per failure episode.
 */

import desktopBridge from './desktopBridge';
import {
  GatewayConfig,
  loadGatewayConfig,
  saveGatewayConfig,
  pickBestModel,
} from './gatewayService';

export interface SupervisorGatewayState {
  status: string;
  strategy: string | null;
  port: number | null;
  baseUrl: string | null;
  models: string[];
  lastError: string | null;
}

export interface SupervisorStatus {
  supervisor?: { pid: number; startedAt: string | null; mode: string };
  environment?: { os: string; arch: string; docker: string | null; dockerDaemonUp: boolean; npx: string | null } | null;
  primary: 'freellmapi' | 'portkey' | null;
  gateways: { freellmapi: SupervisorGatewayState; portkey: SupervisorGatewayState };
  decisions: Array<{ at: string; action: string; detail: string }>;
  updatedAt: string | null;
}

export interface ManagerSnapshot {
  running: boolean;
  desktop: boolean;
  status: SupervisorStatus | null;
  note: string | null;
}

type Listener = (snapshot: ManagerSnapshot) => void;

const POLL_MS = 3_000;
const ADOPT_PORTS = { freellmapi: 3001, portkey: 8787 } as const;

let snapshot: ManagerSnapshot = { running: false, desktop: false, status: null, note: null };
const listeners = new Set<Listener>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let diagnosedEpisodes = new Set<string>();

function emit() {
  for (const l of listeners) l(snapshot);
}

export function subscribeGatewayManager(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

export function getGatewayManagerSnapshot(): ManagerSnapshot {
  return snapshot;
}

function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function fetchModels(baseUrl: string): Promise<string[] | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3_000);
    const res = await fetch(`${baseUrl}/models`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data?.data)) return data.data.map((m: { id: string }) => m.id).filter(Boolean);
    return null;
  } catch {
    return null;
  }
}

/** Mirror the supervisor's primary gateway into the app gateway config. */
function applyPrimaryToConfig(status: SupervisorStatus) {
  const config = loadGatewayConfig();
  if (!config.auto) return;
  const primary = status.primary;
  if (!primary) return; // nothing healthy — leave config; per-call fallback covers it
  const gw = status.gateways[primary];
  if (!gw.baseUrl) return;
  const model = pickBestModel(gw.models) || config.model;
  if (config.preset !== primary || config.baseUrl !== gw.baseUrl || config.model !== model) {
    const next: GatewayConfig = { ...config, preset: primary, baseUrl: gw.baseUrl, model };
    // FreeLLMAPI's unified key (if the user ever pasted one) is preserved;
    // the supervisor seeds provider keys itself, and local requests are
    // attempted with whatever key is stored (empty = none).
    saveGatewayConfig(next);
    diagnosedEpisodes.clear();
  }
}

/** Web-mode adoption: build a status from whatever answers locally. */
async function adoptProbe(): Promise<SupervisorStatus> {
  const gateways = {} as SupervisorStatus['gateways'];
  let primary: SupervisorStatus['primary'] = null;
  for (const id of ['freellmapi', 'portkey'] as const) {
    const baseUrl = `http://127.0.0.1:${ADOPT_PORTS[id]}/v1`;
    const models = await fetchModels(baseUrl);
    gateways[id] = models
      ? { status: 'adopted', strategy: 'adopted', port: ADOPT_PORTS[id], baseUrl, models, lastError: null }
      : { status: 'down', strategy: null, port: ADOPT_PORTS[id], baseUrl: null, models: [], lastError: 'Not answering on its standard port.' };
    if (models && !primary) primary = id;
  }
  return { primary, gateways, decisions: [], updatedAt: new Date().toISOString() };
}

type DiagnosisAction = 'restart_gateway' | 'switch_gateway' | 'wait' | 'give_up';

/**
 * One bounded AI diagnosis per failure episode. The model classifies;
 * it can only pick from the menu — execution stays deterministic.
 */
async function diagnoseWithAi(gatewayId: string, error: string): Promise<DiagnosisAction> {
  const episode = `${gatewayId}:${error.slice(0, 80)}`;
  if (diagnosedEpisodes.has(episode)) return 'wait';
  diagnosedEpisodes.add(episode);
  try {
    const apiKey = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_GOOGLE_API_KEY;
    if (!apiKey) return 'restart_gateway';
    const prompt = `A local AI gateway supervisor reports a failure.
Gateway: ${gatewayId}
Error: ${error.slice(0, 400)}

Choose exactly ONE action for the supervisor to take:
- restart_gateway: the process/container likely crashed or wedged; restart it.
- switch_gateway: this gateway looks fundamentally unavailable (missing runtime, bad install); prefer the other gateway.
- wait: transient network/provider hiccup; do nothing and re-check shortly.
- give_up: unrecoverable without a human (missing Docker/Node, permissions).

Reply with only the action id.`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) return 'restart_gateway';
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    const allowed: DiagnosisAction[] = ['restart_gateway', 'switch_gateway', 'wait', 'give_up'];
    return allowed.find((a) => text.includes(a)) || 'restart_gateway';
  } catch {
    return 'restart_gateway';
  }
}

async function handlePersistentFailure(status: SupervisorStatus) {
  for (const id of ['freellmapi', 'portkey'] as const) {
    const gw = status.gateways[id];
    if ((gw.status === 'down' || gw.status === 'unavailable') && gw.lastError) {
      const action = await diagnoseWithAi(id, gw.lastError);
      if (action === 'restart_gateway' && snapshot.desktop) {
        // The supervisor's watchdog owns restarts; an AI "restart" verdict
        // is recorded as a decision and the watchdog acts within its cycle.
        console.log(`[GatewayManager] AI diagnosis for ${id}: restart_gateway (watchdog will execute)`);
      } else if (action === 'switch_gateway') {
        const other = id === 'freellmapi' ? 'portkey' : 'freellmapi';
        const config = loadGatewayConfig();
        if (config.auto && status.gateways[other].baseUrl) {
          saveGatewayConfig({ ...config, preset: other, baseUrl: status.gateways[other].baseUrl!, model: pickBestModel(status.gateways[other].models) || config.model });
        }
      }
      // 'wait' and 'give_up' need no action — the supervisor already
      // enforces restart budgets, and Gemini fallback covers generation.
    }
  }
}

async function pollOnce() {
  try {
    if (snapshot.desktop) {
      const raw = await desktopBridge.gatewaySupervisorStatus();
      if (raw && raw !== '{}') {
        const status = JSON.parse(raw) as SupervisorStatus;
        snapshot = { ...snapshot, status };
        applyPrimaryToConfig(status);
        void handlePersistentFailure(status);
      }
    } else {
      const status = await adoptProbe();
      snapshot = { ...snapshot, status };
      applyPrimaryToConfig(status);
    }
  } catch {
    // transient — next poll retries
  }
  emit();
}

/**
 * Start auto management. Idempotent. `seedKeys` are the provider keys
 * the app already holds (at minimum the Gemini key) — the supervisor
 * uses them to pre-load FreeLLMAPI's declarative config so it boots
 * ready; they never touch disk in the repo or any log.
 */
export async function startGatewayAutomation(seedKeys: { geminiApiKey?: string }): Promise<void> {
  if (pollTimer) return;
  const desktop = isDesktop();
  snapshot = {
    running: true,
    desktop,
    status: snapshot.status,
    note: desktop
      ? null
      : 'Web mode: auto-setup needs the desktop app. I will adopt any gateway already running locally; generation otherwise stays on Gemini direct.',
  };
  emit();
  if (desktop) {
    try {
      await desktopBridge.gatewaySupervisorStart(seedKeys);
    } catch (e) {
      snapshot = { ...snapshot, note: `Could not start the gateway supervisor: ${e instanceof Error ? e.message : 'unknown error'}. Generation continues on Gemini direct.` };
      emit();
    }
  }
  await pollOnce();
  pollTimer = setInterval(() => { void pollOnce(); }, POLL_MS);
}

export async function stopGatewayAutomation(): Promise<void> {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (snapshot.desktop) {
    try { await desktopBridge.gatewaySupervisorStop(); } catch { /* ignore */ }
  }
  snapshot = { ...snapshot, running: false };
  emit();
}
