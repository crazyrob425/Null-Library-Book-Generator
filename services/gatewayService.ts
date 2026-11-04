/**
 * GatewayService — optional OpenAI-compatible gateway routing.
 *
 * Null Library talks to Gemini directly by default. If the user runs a
 * self-hosted gateway (FreeLLMAPI, Portkey Gateway, or any
 * OpenAI-compatible endpoint), the plain-text generation stages —
 * chapter writing, streaming chapter writing, and humanizing — can be
 * routed through it instead. Structured stages (outlines, market
 * research, marketing metadata) rely on Gemini's native JSON-schema
 * responses and always use the Gemini SDK path.
 *
 * Why a gateway at all?
 *  - FreeLLMAPI (https://github.com/tashfeenahmed/freellmapi) stacks the
 *    published free tiers of dozens of providers behind one /v1 endpoint,
 *    tracking per-key quotas and failing over on rate limits.
 *  - Portkey Gateway (https://github.com/Portkey-AI/gateway) is a general
 *    routing gateway with fallbacks, caching, and guardrails.
 *
 * If the gateway is unreachable or errors, callers in geminiService fall
 * back to the Gemini path automatically — selecting a gateway never
 * makes generation *less* reliable than the default.
 *
 * Config persists in localStorage (same pattern as user settings).
 * API keys never leave the machine except to the gateway URL configured.
 */

export type GatewayPresetId = 'gemini-direct' | 'freellmapi' | 'portkey' | 'custom';

export interface GatewayConfig {
  preset: GatewayPresetId;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** When true, the built-in supervisor manages gateways end-to-end:
   *  detection, startup, health, failover, and model choice. The
   *  remaining fields then act as a record of what it decided. */
  auto: boolean;
}

export interface GatewayPreset {
  id: GatewayPresetId;
  label: string;
  shortLabel: string;
  defaultBaseUrl: string;
  keyLabel: string;
  dashboardUrl?: string;
  hint: string;
}

export const GATEWAY_PRESETS: GatewayPreset[] = [
  {
    id: 'gemini-direct',
    label: 'Gemini Direct (built-in default)',
    shortLabel: 'Gemini Direct',
    defaultBaseUrl: '',
    keyLabel: '',
    hint: 'All stages use your Gemini API key directly. No extra software.',
  },
  {
    id: 'freellmapi',
    label: 'FreeLLMAPI — local free-tier stack',
    shortLabel: 'FreeLLMAPI',
    defaultBaseUrl: 'http://localhost:3001/v1',
    keyLabel: 'Unified key (from the FreeLLMAPI dashboard → Keys page)',
    dashboardUrl: 'http://localhost:3001',
    hint: 'Run the gateway first (see gateways/ in this repo, or its one-line Docker installer). Add your own provider free-tier keys in its dashboard, then paste the unified key here.',
  },
  {
    id: 'portkey',
    label: 'Portkey Gateway — local routing gateway',
    shortLabel: 'Portkey',
    defaultBaseUrl: 'http://localhost:8787/v1',
    keyLabel: 'Portkey virtual key (or provider key, per your gateway config)',
    dashboardUrl: 'http://localhost:8787/public/',
    hint: 'Run the gateway first (npx @portkey-ai/gateway, or gateways/ in this repo) and configure a provider + model in the Portkey console. Set the model field to the model id your Portkey config exposes.',
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible endpoint',
    shortLabel: 'Custom',
    defaultBaseUrl: '',
    keyLabel: 'API key (optional — many local endpoints need none)',
    hint: 'Anything that speaks OpenAI chat completions: LiteLLM, Ollama (http://localhost:11434/v1), LocalAI, a cloud endpoint, etc.',
  },
];

const STORAGE_KEY = 'null-library-gateway-config';

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  preset: 'gemini-direct',
  baseUrl: '',
  apiKey: '',
  model: '',
  auto: true,
};

export function loadGatewayConfig(): GatewayConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GATEWAY_CONFIG };
    const parsed = JSON.parse(raw) as Partial<GatewayConfig>;
    return {
      preset: (parsed.preset as GatewayPresetId) || 'gemini-direct',
      baseUrl: parsed.baseUrl || '',
      apiKey: parsed.apiKey || '',
      model: parsed.model || '',
      auto: parsed.auto !== false,
    };
  } catch {
    return { ...DEFAULT_GATEWAY_CONFIG };
  }
}

export function saveGatewayConfig(config: GatewayConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // storage full/blocked — config simply won't persist
  }
}

export function getPreset(id: GatewayPresetId): GatewayPreset {
  return GATEWAY_PRESETS.find((p) => p.id === id) || GATEWAY_PRESETS[0];
}

/**
 * Ranked model preferences for auto mode. When the supervisor reports a
 * gateway's live model list, the manager picks the first model whose id
 * contains one of these substrings (best book-prose quality first among
 * models commonly present on free tiers), falling back to the first
 * chat-capable-looking model in the list.
 */
export const MODEL_PREFERENCE: string[] = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'llama-3.3-70b',
  'gpt-oss-120b',
  'qwen3',
  'qwen-2.5',
  'deepseek-chat',
  'deepseek-v3',
  'mistral-large',
  'gemini-2.5',
  'gemini',
  'llama',
  'qwen',
  'deepseek',
];

const NON_CHAT_HINTS = ['embed', 'whisper', 'tts', 'image', 'moderation', 'rerank', 'audio'];

export function pickBestModel(models: string[]): string | null {
  const chatty = models.filter((m) => !NON_CHAT_HINTS.some((h) => m.toLowerCase().includes(h)));
  if (!chatty.length) return null;
  for (const pref of MODEL_PREFERENCE) {
    const hit = chatty.find((m) => m.toLowerCase().includes(pref));
    if (hit) return hit;
  }
  return chatty[0];
}

/** True when chapter-text stages should route through a gateway. */
export function isGatewayActive(): boolean {
  const config = loadGatewayConfig();
  return config.preset !== 'gemini-direct' && config.baseUrl.trim().length > 0;
}

function normalizedBaseUrl(config: GatewayConfig): string {
  return config.baseUrl.trim().replace(/\/+$/, '');
}

function authHeaders(config: GatewayConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey.trim()) headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  return headers;
}

function requireModel(config: GatewayConfig): string {
  const model = config.model.trim();
  if (!model) {
    throw new Error(
      'No gateway model set. Open Gateway Settings (footer) and enter a model id — ' +
        'for FreeLLMAPI, pick one from its dashboard model list; for Portkey, use the model your config exposes.'
    );
  }
  return model;
}

/** Non-streaming chat completion through the configured gateway. */
export async function generateTextViaGateway(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const config = loadGatewayConfig();
  const baseUrl = normalizedBaseUrl(config);
  if (!baseUrl) throw new Error('Gateway selected but no base URL configured.');
  const model = requireModel(config);

  const messages: Array<{ role: string; content: string }> = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gateway HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Gateway returned an empty completion.');
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/** Streaming chat completion through the configured gateway (SSE). */
export async function generateTextStreamViaGateway(
  prompt: string,
  onChunk: (accumulatedMarkdown: string) => void,
  systemInstruction?: string
): Promise<string> {
  const config = loadGatewayConfig();
  const baseUrl = normalizedBaseUrl(config);
  if (!baseUrl) throw new Error('Gateway selected but no base URL configured.');
  const model = requireModel(config);

  const messages: Array<{ role: string; content: string }> = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(config),
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      const body = response.body ? await response.text().catch(() => '') : '';
      throw new Error(`Gateway HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta: string = json?.choices?.[0]?.delta?.content || '';
            if (delta) {
              accumulated += delta;
              onChunk(accumulated);
            }
          } catch {
            // partial frame — ignore
          }
        }
      }
    }
    if (!accumulated.trim()) throw new Error('Gateway stream produced no text.');
    return accumulated;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Probe the configured gateway: GET /models is supported by FreeLLMAPI,
 * Portkey, LiteLLM, Ollama, and LocalAI alike.
 */
export async function testGatewayConnection(
  config: GatewayConfig
): Promise<{ ok: boolean; message: string }> {
  if (config.preset === 'gemini-direct') {
    return { ok: true, message: 'Gemini Direct is the built-in path — nothing to test here.' };
  }
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) return { ok: false, message: 'Enter a base URL first.' };
  const headers: Record<string, string> = {};
  if (config.apiKey.trim()) headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}/models`, { headers, signal: controller.signal });
    if (!response.ok) {
      return {
        ok: false,
        message: `Gateway answered HTTP ${response.status} on /models. Is it running, and is the key right?`,
      };
    }
    const data = await response.json().catch(() => null);
    const count = Array.isArray(data?.data) ? data.data.length : null;
    return {
      ok: true,
      message:
        count !== null
          ? `Connected — the gateway lists ${count} model${count === 1 ? '' : 's'}. Set the model field to one of those ids.`
          : 'Connected — the gateway answered /models.',
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not reach ${baseUrl} — is the gateway running? (${error instanceof Error ? error.message : 'network error'})`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
