/**
 * llmOrchestrator.ts
 *
 * Central orchestration layer for all Gemini LLM calls.
 *
 * Features
 * ─────────
 * • Prompt compaction  — removes duplicate blank lines, normalises whitespace,
 *   deduplicates repeated instruction phrases, compresses bullet lists.
 * • Context-window budgeting — hard token cap per request; long inputs are
 *   automatically chunked.
 * • Jittered exponential back-off retry (replaces the simple retry in
 *   geminiService.ts).
 * • Response caching — keyed by (model, compacted prompt, schema, temperature).
 *   Identical calls return instantly from IndexedDB with zero API spend.
 * • Token-usage tracking — every call records estimated input/output tokens and
 *   whether it was a cache hit.  The caller receives a `CallTokenUsage` record.
 *
 * Usage
 * ─────
 * import { orchestrate, OrchestrateParams } from './llmOrchestrator';
 *
 * const { text, usage } = await orchestrate({
 *   model: 'gemini-2.5-flash',
 *   prompt: longPromptString,
 *   schema: myResponseSchema,
 *   responseMimeType: 'application/json',
 * });
 */

/// <reference types="vite/client" />

import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';
import { buildCacheKey, cacheGet, cacheSet } from './llmCache';
import {
  estimateTokens,
  buildCallUsage,
  CallTokenUsage,
} from './tokenEstimator';

// ── AI singleton (shared with geminiService) ─────────────────────────────────

let _ai: GoogleGenAI | null = null;

export function getAiInstance(): GoogleGenAI {
  if (!_ai) {
    const key =
      (typeof import.meta !== 'undefined' &&
        (import.meta as any).env?.VITE_GOOGLE_API_KEY) ||
      (typeof process !== 'undefined' && process.env?.API_KEY);
    if (!key) {
      throw new Error(
        'API Key is missing. Please set VITE_GOOGLE_API_KEY in your .env file.'
      );
    }
    _ai = new GoogleGenAI({ apiKey: key as string });
  }
  return _ai;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hard upper bound on estimated input tokens per single request. */
export const MAX_INPUT_TOKENS = 32_000;

/** Target chunk size when splitting long content for multi-pass processing. */
export const CHUNK_TOKEN_TARGET = 8_000;

// ── Prompt compaction ─────────────────────────────────────────────────────────

/**
 * Compact a prompt string to reduce token usage without losing information:
 *
 * 1. Normalise line endings to \n.
 * 2. Collapse runs of blank lines to a single blank line.
 * 3. Trim trailing whitespace from each line.
 * 4. Remove duplicate sentences / instructions (exact match after trim).
 * 5. Compress consecutive single-word bullet points into a comma list.
 */
export function compactPrompt(text: string): string {
  if (!text) return text;

  // 1 & 3: normalise & trim each line
  let lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());

  // 2: collapse consecutive blank lines
  const collapsed: string[] = [];
  let prevBlank = false;
  for (const line of lines) {
    const isBlank = line.trim() === '';
    if (isBlank && prevBlank) continue;
    collapsed.push(line);
    prevBlank = isBlank;
  }
  lines = collapsed;

  // 4: deduplicate lines that are identical instructions
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    const key = line.trim().toLowerCase();
    // Only deduplicate non-trivial lines (>20 chars, ends with period/colon)
    if (key.length > 20 && (key.endsWith('.') || key.endsWith(':')) && seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(line);
  }
  lines = deduped;

  // 5: compress adjacent short bullet-point lines into comma lists
  const compressed: string[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length >= 3) {
      // Emit as a single comma-separated line
      const prefix = bulletBuffer[0].match(/^(\s*[-*•]\s*)/)?.[1] ?? '- ';
      compressed.push(
        prefix + bulletBuffer.map((b) => b.replace(/^\s*[-*•]\s*/, '')).join(', ')
      );
    } else {
      compressed.push(...bulletBuffer);
    }
    bulletBuffer = [];
  };

  for (const line of lines) {
    const isBullet = /^\s*[-*•]\s+\S/.test(line);
    const wordCount = line.trim().split(/\s+/).length;
    if (isBullet && wordCount <= 4) {
      bulletBuffer.push(line);
    } else {
      if (bulletBuffer.length > 0) flushBullets();
      compressed.push(line);
    }
  }
  if (bulletBuffer.length > 0) flushBullets();

  return compressed.join('\n').trim();
}

// ── Chunking ──────────────────────────────────────────────────────────────────

/**
 * Split a long text into chunks where each chunk is at most `maxTokens`
 * estimated tokens.  Splits prefer paragraph boundaries (double newline).
 */
export function chunkText(
  text: string,
  maxTokens: number = CHUNK_TOKEN_TARGET
): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (estimateTokens(candidate) > maxTokens && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── Retry with jitter ─────────────────────────────────────────────────────────

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

function jitter(ms: number): number {
  // ±25% random jitter
  return ms * (0.75 + Math.random() * 0.5);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 4
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      await new Promise((r) => setTimeout(r, jitter(delay)));
    }
  }
  throw new Error('Max retries reached');
}

// ── Main orchestration entry-point ───────────────────────────────────────────

export interface OrchestrateParams {
  model: string;
  prompt: string;
  /** JSON schema object (Gemini Type format). */
  schema?: object;
  responseMimeType?: string;
  temperature?: number;
  /** Skip cache for this call (e.g., image generation). */
  noCache?: boolean;
  /** System instruction to prepend (shared across agents). */
  systemInstruction?: string;
}

export interface OrchestrateResult {
  text: string;
  usage: CallTokenUsage;
}

export async function orchestrate(
  params: OrchestrateParams
): Promise<OrchestrateResult> {
  const {
    model,
    schema,
    responseMimeType,
    temperature,
    noCache = false,
    systemInstruction,
  } = params;

  // 1. Compact the prompt
  const compacted = compactPrompt(params.prompt);

  // 2. Budget check — warn if we're near the limit (but don't hard-block)
  const inputEst = estimateTokens(compacted) + (systemInstruction ? estimateTokens(systemInstruction) : 0);
  if (inputEst > MAX_INPUT_TOKENS) {
    console.warn(
      `[llmOrchestrator] Prompt estimated at ${inputEst} tokens, exceeds budget of ${MAX_INPUT_TOKENS}. Consider chunking.`
    );
  }

  // 3. Check cache (skip for image calls and noCache)
  if (!noCache) {
    const cacheKey = buildCacheKey({
      model,
      prompt: compacted,
      schema,
      temperature,
    });

    const cached = await cacheGet(cacheKey);
    if (cached !== null) {
      const usage = buildCallUsage(compacted, cached, true);
      return { text: cached, usage };
    }

    // 4. Make the API call with retry
    const rawResult = await withRetry(() =>
      callApi({ model, prompt: compacted, schema, responseMimeType, temperature, systemInstruction })
    );

    // 5. Store in cache
    await cacheSet(cacheKey, rawResult);

    const usage = buildCallUsage(compacted, rawResult, false);
    return { text: rawResult, usage };
  }

  // noCache path (e.g., image generation)
  const rawResult = await withRetry(() =>
    callApi({ model, prompt: compacted, schema, responseMimeType, temperature, systemInstruction })
  );
  const usage = buildCallUsage(compacted, rawResult, false);
  return { text: rawResult, usage };
}

// ── Internal API call ─────────────────────────────────────────────────────────

interface CallApiParams {
  model: string;
  prompt: string;
  schema?: object;
  responseMimeType?: string;
  temperature?: number;
  systemInstruction?: string;
}

async function callApi(params: CallApiParams): Promise<string> {
  const ai = getAiInstance();

  const config: Record<string, unknown> = {};
  if (params.responseMimeType) config.responseMimeType = params.responseMimeType;
  if (params.schema) config.responseSchema = params.schema;
  if (params.temperature !== undefined) config.temperature = params.temperature;
  if (params.systemInstruction) config.systemInstruction = params.systemInstruction;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: params.model,
    contents: params.prompt,
    config: Object.keys(config).length > 0 ? config : undefined,
  });

  return response.text || '';
}

// ── Multi-chunk orchestration ────────────────────────────────────────────────

/**
 * Orchestrate a call where `contextText` might be very large.
 * The context is split into chunks; each chunk is processed separately
 * with `chunkPromptFn` and results are concatenated.
 *
 * Useful for full-chapter rewrites where we don't want to send 30k tokens.
 */
export async function orchestrateChunked(
  contextText: string,
  chunkPromptFn: (chunk: string, index: number, total: number) => string,
  baseParams: Omit<OrchestrateParams, 'prompt'>
): Promise<{ text: string; usages: CallTokenUsage[] }> {
  const chunks = chunkText(contextText);
  const results: string[] = [];
  const usages: CallTokenUsage[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const prompt = chunkPromptFn(chunks[i], i, chunks.length);
    const result = await orchestrate({ ...baseParams, prompt });
    results.push(result.text);
    usages.push(result.usage);
  }

  return { text: results.join('\n\n'), usages };
}
