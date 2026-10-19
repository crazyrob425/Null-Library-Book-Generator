/**
 * tokenEstimator.ts
 *
 * Lightweight token-counting utilities.
 * Uses the common "chars / 4" heuristic which is accurate to ~±10% for
 * English text and avoids pulling in a full tokeniser library.
 *
 * All public functions are pure / synchronous so they can be used both in
 * the UI thread and inside Web Workers without any async overhead.
 */

/** Estimate the number of tokens in a text string. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for a JSON-serialisable value (schema objects, responses). */
export function estimateObjectTokens(obj: unknown): number {
  try {
    return estimateTokens(JSON.stringify(obj));
  } catch {
    return 0;
  }
}

/**
 * Given a list of prompt parts, return the total estimated token count.
 * Handy for budgeting before making a call.
 */
export function estimatePromptTokens(parts: string[]): number {
  return parts.reduce((sum, p) => sum + estimateTokens(p), 0);
}

/** Summarise token consumption for a single LLM call. */
export interface CallTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHit: boolean;
}

export function buildCallUsage(
  inputText: string,
  outputText: string,
  cacheHit = false
): CallTokenUsage {
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheHit,
  };
}

/** Running aggregate for a full project session. */
export interface SessionTokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  cacheHits: number;
  cacheMisses: number;
  savedByCache: number; // input tokens avoided due to cache hits
}

export function createEmptyStats(): SessionTokenStats {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    cacheHits: 0,
    cacheMisses: 0,
    savedByCache: 0,
  };
}

export function addCallToStats(
  stats: SessionTokenStats,
  usage: CallTokenUsage
): SessionTokenStats {
  return {
    totalInputTokens: stats.totalInputTokens + usage.inputTokens,
    totalOutputTokens: stats.totalOutputTokens + usage.outputTokens,
    totalTokens: stats.totalTokens + usage.totalTokens,
    cacheHits: stats.cacheHits + (usage.cacheHit ? 1 : 0),
    cacheMisses: stats.cacheMisses + (usage.cacheHit ? 0 : 1),
    savedByCache:
      stats.savedByCache + (usage.cacheHit ? usage.inputTokens : 0),
  };
}

/** Human-readable helper for UI display. */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
