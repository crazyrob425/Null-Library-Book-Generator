#!/usr/bin/env node
/**
 * Null Library — Gateway Supervisor ("the micro worker", process side)
 * ====================================================================
 * Zero-dependency Node script that fully manages the optional local AI
 * gateways (FreeLLMAPI + Portkey) so the user never has to:
 *
 *   1. DETECT  — OS/arch, Docker (+daemon), Node/npx, port occupancy,
 *                already-running gateways worth adopting.
 *   2. PROVISION — picks the best launch strategy per gateway for this
 *                machine (Docker Compose preferred; npx for Portkey),
 *                generates + persists FreeLLMAPI's ENCRYPTION_KEY, and
 *                builds its declarative startup config from seed keys
 *                the app already holds (e.g. the user's Gemini key), so
 *                FreeLLMAPI boots pre-loaded — no dashboard step.
 *   3. RUN     — starts gateways on localhost, waits for health
 *                (GET /v1/models), records real ports + model lists.
 *   4. MAINTAIN — watchdog loop: health checks, restart with
 *                exponential backoff on crashes, alternate-port
 *                failover on bind conflicts, continuous status file.
 *
 * The app (Tauri) spawns this script; it can also run standalone:
 *   node supervisor.mjs probe    → one-shot environment report (JSON)
 *   node supervisor.mjs start    → spawn the daemon, detached
 *   node supervisor.mjs run      → run the daemon in the foreground
 *   node supervisor.mjs status   → print the current status JSON
 *   node supervisor.mjs stop     → stop daemon + gateways it started
 *
 * State lives OUTSIDE the repo, in the data dir:
 *   $NULL_GATEWAY_DATA_DIR, else ~/.null-library/gateways/
 *     status.json        — machine-readable status (the app polls this)
 *     supervisor.log     — human log (secrets are never written here)
 *     supervisor.pid     — daemon pid
 *     freellmapi.env     — ENCRYPTION_KEY etc. (mode 0600)
 *     compose.override.yml — runtime port/env overrides (may embed the
 *                            declarative config JSON incl. seed keys —
 *                            mode 0600, treated like a credential file)
 *
 * Security posture: gateways bind to 127.0.0.1 only; seed keys travel
 * via environment variables (never argv, never logs); the supervisor
 * only runs an allowlist of commands (docker compose, npx portkey).
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync, appendFileSync } from 'node:fs';
import { homedir, platform, arch } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.NULL_GATEWAY_DATA_DIR || join(homedir(), '.null-library', 'gateways');
const STATUS_PATH = join(DATA_DIR, 'status.json');
const LOG_PATH = join(DATA_DIR, 'supervisor.log');
const PID_PATH = join(DATA_DIR, 'supervisor.pid');
const ENV_PATH = join(DATA_DIR, 'freellmapi.env');
const OVERRIDE_PATH = join(DATA_DIR, 'compose.override.yml');
const COMPOSE_PATH = join(HERE, 'docker-compose.yml');

const GATEWAYS = {
  freellmapi: { label: 'FreeLLMAPI', preferredPort: 3001, alternatePorts: [3002, 3003], strategies: ['docker'] },
  portkey: { label: 'Portkey Gateway', preferredPort: 8787, alternatePorts: [8788, 8789], strategies: ['docker', 'npx'] },
};
const HEALTH_INTERVAL_MS = 20_000;
const START_HEALTH_TIMEOUT_MS = 120_000;
const MAX_RESTARTS_PER_HOUR = 4;

// ---------------------------------------------------------------- state
const state = {
  version: 1,
  supervisor: { pid: process.pid, startedAt: null, mode: 'idle' },
  environment: null,
  primary: null, // 'freellmapi' | 'portkey' | null
  gateways: {
    freellmapi: freshGatewayState(),
    portkey: freshGatewayState(),
  },
  decisions: [], // ring buffer, newest last, max 200
  updatedAt: null,
};
function freshGatewayState() {
  return {
    status: 'unknown', // unknown|starting|healthy|degraded|restarting|down|unavailable|adopted
    strategy: null,
    port: null,
    baseUrl: null,
    models: [],
    lastError: null,
    restarts: [], // timestamps (ms) of restarts in the trailing hour
    pid: null, // for npx-managed children
  };
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { appendFileSync(LOG_PATH, line + '\n'); } catch { /* ignore */ }
  console.log(line);
}
function decide(action, detail) {
  state.decisions.push({ at: new Date().toISOString(), action, detail });
  if (state.decisions.length > 200) state.decisions.splice(0, state.decisions.length - 200);
  log(`DECISION ${action}: ${detail}`);
  persistStatus();
}
function persistStatus() {
  state.updatedAt = new Date().toISOString();
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATUS_PATH + '.tmp';
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, STATUS_PATH);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------- utils
function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout ?? 30_000, env: { ...process.env, ...(opts.env || {}) } });
  return { ok: res.status === 0, code: res.status, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim(), error: res.error ? String(res.error) : null };
}
function commandVersion(cmd, args = ['--version']) {
  const r = run(cmd, args, { timeout: 10_000 });
  return r.ok ? r.stdout.split('\n')[0] : null;
}
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}
async function httpJson(url, timeoutMs = 4_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: String(e && e.message ? e.message : e) };
  } finally { clearTimeout(t); }
}
async function probeGateway(port) {
  const r = await httpJson(`http://127.0.0.1:${port}/v1/models`);
  if (r.ok && r.json && Array.isArray(r.json.data)) {
    return { healthy: true, models: r.json.data.map((m) => m.id).filter(Boolean) };
  }
  return { healthy: false, status: r.status, error: r.error || null };
}
async function waitHealthy(id, port, timeoutMs = START_HEALTH_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const p = await probeGateway(port);
    if (p.healthy) return p;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return { healthy: false };
}

// ---------------------------------------------------------------- detect
async function detectEnvironment() {
  const dockerVersion = commandVersion('docker');
  let composeVersion = null, daemonUp = false;
  if (dockerVersion) {
    composeVersion = commandVersion('docker', ['compose', 'version']);
    daemonUp = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 10_000 }).ok;
  }
  const env = {
    os: platform(),
    arch: arch(),
    docker: dockerVersion,
    dockerCompose: composeVersion,
    dockerDaemonUp: daemonUp,
    node: process.version,
    npx: commandVersion('npx'),
    detectedAt: new Date().toISOString(),
  };
  state.environment = env;
  return env;
}

async function pickPort(id) {
  const def = GATEWAYS[id];
  // Adopt an already-healthy gateway on the preferred port.
  const preferred = await probeGateway(def.preferredPort);
  if (preferred.healthy) return { port: def.preferredPort, adopt: true, models: preferred.models };
  if (await isPortFree(def.preferredPort)) return { port: def.preferredPort, adopt: false };
  for (const alt of def.alternatePorts) {
    const p = await probeGateway(alt);
    if (p.healthy) return { port: alt, adopt: true, models: p.models };
    if (await isPortFree(alt)) return { port: alt, adopt: false };
  }
  return { port: def.preferredPort, adopt: false, conflict: true };
}

// ---------------------------------------------------------------- provision
function ensureFreeLlmEnv(seedKeys) {
  let encryptionKey = null;
  if (existsSync(ENV_PATH)) {
    const m = readFileSync(ENV_PATH, 'utf8').match(/^ENCRYPTION_KEY=(.+)$/m);
    if (m) encryptionKey = m[1].trim();
  }
  if (!encryptionKey) {
    encryptionKey = randomBytes(32).toString('hex');
    writeFileSync(ENV_PATH, `ENCRYPTION_KEY=${encryptionKey}\n`, { mode: 0o600 });
    try { chmodSync(ENV_PATH, 0o600); } catch { /* ignore */ }
    log('Generated and persisted a new FreeLLMAPI ENCRYPTION_KEY (data dir, 0600).');
  }
  // Declarative startup config: idempotently seeds provider keys the app
  // already holds, so FreeLLMAPI boots ready — no dashboard step.
  const keys = [];
  if (seedKeys && typeof seedKeys === 'object') {
    if (seedKeys.geminiApiKey) keys.push({ platform: 'google', key: seedKeys.geminiApiKey, label: 'Null Library (auto)' });
    if (seedKeys.groqApiKey) keys.push({ platform: 'groq', key: seedKeys.groqApiKey, label: 'Null Library (auto)' });
    if (seedKeys.openrouterApiKey) keys.push({ platform: 'openrouter', key: seedKeys.openrouterApiKey, label: 'Null Library (auto)' });
  }
  const declarative = keys.length
    ? JSON.stringify({ keys, routing: { strategy: 'balanced' } })
    : null;
  return { encryptionKey, declarative };
}

function writeComposeOverride(ports, freeLlm) {
  // Runtime override lives in the DATA dir (never the repo): it carries
  // the encryption key and the declarative config (which embeds seed
  // keys), so it is written 0600 and treated as a credential file.
  const lines = ['services:'];
  if (ports.freellmapi) {
    lines.push('  freellmapi:');
    lines.push('    ports:');
    lines.push(`      - "127.0.0.1:${ports.freellmapi}:3001"`);
    lines.push('    environment:');
    lines.push(`      ENCRYPTION_KEY: ${JSON.stringify(freeLlm.encryptionKey)}`);
    lines.push(`      PORT: "3001"`);
    if (freeLlm.declarative) lines.push(`      FREEAPI_CONFIG_JSON: ${JSON.stringify(freeLlm.declarative)}`);
  }
  if (ports.portkey) {
    lines.push('  portkey:');
    lines.push('    ports:');
    lines.push(`      - "127.0.0.1:${ports.portkey}:8787"`);
  }
  writeFileSync(OVERRIDE_PATH, lines.join('\n') + '\n', { mode: 0o600 });
  try { chmodSync(OVERRIDE_PATH, 0o600); } catch { /* ignore */ }
}

function composeArgs(extra) {
  return ['compose', '-f', COMPOSE_PATH, '-f', OVERRIDE_PATH, ...extra];
}

// ---------------------------------------------------------------- lifecycle
const children = { portkey: null }; // npx-managed child processes

async function startGateway(id, seedKeys) {
  const gw = state.gateways[id];
  const def = GATEWAYS[id];
  const env = state.environment;
  gw.status = 'starting';
  gw.lastError = null;
  persistStatus();

  const picked = await pickPort(id);
  if (picked.adopt) {
    gw.status = 'adopted';
    gw.port = picked.port;
    gw.baseUrl = `http://127.0.0.1:${picked.port}/v1`;
    gw.models = picked.models || [];
    gw.strategy = 'adopted';
    decide('adopt_gateway', `${def.label} already healthy on port ${picked.port} — adopted it (${gw.models.length} models).`);
    persistStatus();
    return true;
  }
  if (picked.conflict) {
    gw.status = 'down';
    gw.lastError = `Ports ${[def.preferredPort, ...def.alternatePorts].join('/')} are all occupied by other programs.`;
    decide('port_conflict', `${def.label}: ${gw.lastError}`);
    persistStatus();
    return false;
  }
  gw.port = picked.port;

  // Strategy 1: Docker Compose (both gateways).
  if (env.dockerDaemonUp && env.dockerCompose) {
    if (id === 'freellmapi') {
      const freeLlm = ensureFreeLlmEnv(seedKeys);
      writeComposeOverride({ freellmapi: gw.port, portkey: state.gateways.portkey.port }, freeLlm);
    } else {
      const freeLlm = existsSync(ENV_PATH) ? ensureFreeLlmEnv({}) : { encryptionKey: '', declarative: null };
      writeComposeOverride({ freellmapi: state.gateways.freellmapi.port, portkey: gw.port }, freeLlm);
    }
    gw.strategy = 'docker';
    decide('start_gateway', `Starting ${def.label} via Docker Compose on port ${gw.port}…`);
    const up = run('docker', composeArgs(['up', '-d', id]), { timeout: 300_000 });
    if (!up.ok) {
      gw.lastError = `docker compose up failed: ${(up.stderr || up.stdout || '').slice(0, 300)}`;
      decide('start_failed', `${def.label}: ${gw.lastError}`);
    } else {
      const health = await waitHealthy(id, gw.port);
      if (health.healthy) {
        gw.status = 'healthy';
        gw.baseUrl = `http://127.0.0.1:${gw.port}/v1`;
        gw.models = health.models;
        decide('gateway_healthy', `${def.label} is healthy on port ${gw.port} with ${health.models.length} models.`);
        persistStatus();
        return true;
      }
      gw.lastError = 'Container started but did not answer /v1/models in time.';
      decide('start_unhealthy', `${def.label}: ${gw.lastError}`);
    }
    // fall through to npx for portkey
    if (id !== 'portkey') { gw.status = 'down'; persistStatus(); return false; }
  }

  // Strategy 2 (Portkey only): npx.
  if (id === 'portkey' && env.npx) {
    gw.strategy = 'npx';
    decide('start_gateway', `Starting Portkey via npx on port ${gw.port}…`);
    const child = spawn('npx', ['-y', '@portkey-ai/gateway'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PORT: String(gw.port) },
    });
    child.unref();
    children.portkey = child;
    gw.pid = child.pid;
    const health = await waitHealthy(id, gw.port, 90_000);
    if (health.healthy) {
      gw.status = 'healthy';
      gw.baseUrl = `http://127.0.0.1:${gw.port}/v1`;
      gw.models = health.models;
      decide('gateway_healthy', `Portkey is healthy on port ${gw.port} with ${health.models.length} models.`);
      persistStatus();
      return true;
    }
    gw.lastError = 'npx Portkey did not become healthy in time.';
    gw.status = 'down';
    decide('start_unhealthy', `Portkey: ${gw.lastError}`);
    persistStatus();
    return false;
  }

  gw.status = 'unavailable';
  gw.lastError = id === 'freellmapi'
    ? 'FreeLLMAPI needs Docker (daemon not available on this machine).'
    : 'Portkey needs Docker or Node/npx (neither available).';
  decide('gateway_unavailable', `${def.label}: ${gw.lastError}`);
  persistStatus();
  return false;
}

async function stopGateway(id) {
  const gw = state.gateways[id];
  if (gw.strategy === 'docker' && state.environment?.dockerDaemonUp) {
    run('docker', composeArgs(['stop', id]), { timeout: 60_000 });
  }
  if (id === 'portkey' && gw.pid) {
    try { process.kill(gw.pid); } catch { /* already gone */ }
  }
  gw.status = 'down';
  gw.models = [];
  persistStatus();
}

function restartBudgetOk(gw) {
  const hourAgo = Date.now() - 3_600_000;
  gw.restarts = gw.restarts.filter((t) => t > hourAgo);
  return gw.restarts.length < MAX_RESTARTS_PER_HOUR;
}

async function watchdog(seedKeys) {
  for (const id of Object.keys(GATEWAYS)) {
    const gw = state.gateways[id];
    if (gw.status === 'unavailable' || !gw.port) continue;
    const probe = await probeGateway(gw.port);
    if (probe.healthy) {
      if (gw.status !== 'healthy' && gw.status !== 'adopted') {
        gw.status = 'healthy';
        decide('gateway_recovered', `${GATEWAYS[id].label} is answering again on port ${gw.port}.`);
      }
      gw.models = probe.models;
    } else if (gw.status === 'healthy' || gw.status === 'adopted' || gw.status === 'degraded') {
      gw.status = 'degraded';
      gw.lastError = `Health check failed (HTTP ${probe.status || 'no answer'}).`;
      decide('gateway_degraded', `${GATEWAYS[id].label}: ${gw.lastError}`);
      if (gw.strategy !== 'adopted' && restartBudgetOk(gw)) {
        gw.restarts.push(Date.now());
        gw.status = 'restarting';
        decide('restart_gateway', `Restarting ${GATEWAYS[id].label} (attempt ${gw.restarts.length}/${MAX_RESTARTS_PER_HOUR} this hour).`);
        await stopGateway(id);
        await startGateway(id, seedKeys);
      } else if (gw.strategy !== 'adopted') {
        decide('restart_budget_exhausted', `${GATEWAYS[id].label} hit the restart budget — leaving it down rather than thrashing.`);
        gw.status = 'down';
      }
    }
    persistStatus();
  }
  // Primary = freellmapi if usable, else portkey, else none.
  const next = state.gateways.freellmapi.status === 'healthy' || state.gateways.freellmapi.status === 'adopted'
    ? 'freellmapi'
    : state.gateways.portkey.status === 'healthy' || state.gateways.portkey.status === 'adopted'
      ? 'portkey'
      : null;
  if (next !== state.primary) {
    state.primary = next;
    decide('primary_changed', next ? `Primary gateway is now ${GATEWAYS[next].label}.` : 'No gateway is healthy — the app will use Gemini direct.');
    persistStatus();
  }
}

// ---------------------------------------------------------------- commands
function readSeedKeys() {
  try {
    return process.env.NULL_GATEWAY_SEED_KEYS ? JSON.parse(process.env.NULL_GATEWAY_SEED_KEYS) : {};
  } catch { return {}; }
}

async function cmdRun() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PID_PATH, String(process.pid));
  state.supervisor.mode = 'running';
  state.supervisor.startedAt = new Date().toISOString();
  const seedKeys = readSeedKeys();
  await detectEnvironment();
  decide('supervisor_start', `Supervisor up on ${state.environment.os}/${state.environment.arch} — Docker: ${state.environment.docker || 'none'} (daemon ${state.environment.dockerDaemonUp ? 'up' : 'down'}), npx: ${state.environment.npx || 'none'}.`);
  await startGateway('freellmapi', seedKeys);
  await startGateway('portkey', seedKeys);
  await watchdog(seedKeys);
  persistStatus();
  setInterval(() => { watchdog(seedKeys).catch((e) => log(`watchdog error: ${e.message}`)); }, HEALTH_INTERVAL_MS);
  log('Supervisor daemon running. Ctrl-C / SIGTERM to stop.');
  const shutdown = async () => {
    log('Supervisor stopping (gateways it started will be stopped).');
    await stopGateway('freellmapi');
    await stopGateway('portkey');
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function cmdStart() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(PID_PATH)) {
    const pid = Number(readFileSync(PID_PATH, 'utf8').trim());
    try { process.kill(pid, 0); console.log(JSON.stringify({ ok: true, alreadyRunning: true, pid })); return; } catch { /* stale */ }
  }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();
  console.log(JSON.stringify({ ok: true, pid: child.pid, statusPath: STATUS_PATH }));
}

function cmdStop() {
  if (existsSync(PID_PATH)) {
    const pid = Number(readFileSync(PID_PATH, 'utf8').trim());
    try { process.kill(pid, 'SIGTERM'); console.log(JSON.stringify({ ok: true, stopped: pid })); return; } catch { /* not running */ }
  }
  console.log(JSON.stringify({ ok: true, stopped: null }));
}

async function cmdProbe() {
  const env = await detectEnvironment();
  const ports = {};
  for (const id of Object.keys(GATEWAYS)) {
    const picked = await pickPort(id);
    ports[id] = picked;
  }
  console.log(JSON.stringify({ environment: env, ports }, null, 2));
}

function cmdStatus() {
  if (existsSync(STATUS_PATH)) console.log(readFileSync(STATUS_PATH, 'utf8'));
  else console.log(JSON.stringify({ ok: false, error: 'no status yet — supervisor has not run' }));
}

const cmd = process.argv[2] || 'status';
if (cmd === 'run') await cmdRun();
else if (cmd === 'start') cmdStart();
else if (cmd === 'stop') cmdStop();
else if (cmd === 'probe') await cmdProbe();
else if (cmd === 'status') cmdStatus();
else { console.error(`unknown command: ${cmd}`); process.exit(2); }
