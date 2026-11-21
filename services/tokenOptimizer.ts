/**
 * tokenOptimizer.ts
 *
 * Token-efficiency utilities for AI generation pipelines.
 * Provides: prompt compaction, smart truncation, response caching,
 * token estimation, and context summarization helpers.
 *
 * All functions are pure/deterministic (except summarize which calls AI),
 * so they can be unit-tested without network access.
 */

// ---------------------------------------------------------------------------
// 1. Token estimation (rough heuristic – 1 token ≈ 0.75 English words)
// ---------------------------------------------------------------------------

/** Rough estimate of the number of tokens in a text string. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // ~0.75 tokens per English word (or equivalently, ~1.33 words per token)
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words * 0.75);
}

// ---------------------------------------------------------------------------
// 2. Prompt compaction – strip waste without changing semantics
// ---------------------------------------------------------------------------

/**
 * Compact a prompt string by:
 *  - Collapsing repeated blank lines to a single blank line
 *  - Removing trailing whitespace on each line
 *  - Trimming the overall string
 */
export function compactText(text: string): string {
  return text
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// 3. Smart context truncation
// ---------------------------------------------------------------------------

/**
 * Truncate a text to at most `maxTokens` (estimated).
 * Truncates at a word boundary and appends an ellipsis marker.
 *
 * @param text       - The input text.
 * @param maxTokens  - Maximum token budget (estimated).
 * @param ellipsis   - Suffix appended when truncation occurs (default: "…").
 */
export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
  ellipsis = '…'
): string {
  if (!text) return '';
  if (estimateTokens(text) <= maxTokens) return text;

  // Convert token budget back to rough char limit.
  // estimateTokens uses words * 0.75, so maxTokens tokens ≈ maxTokens/0.75 words ≈ maxTokens * 1.33 words.
  // At ~5 chars/word: charLimit ≈ maxTokens * 1.33 * 5 ≈ maxTokens * 6.67
  const charLimit = Math.floor(maxTokens * 6.67);
  const truncated = text.substring(0, charLimit);
  // Walk back to the last word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + ellipsis;
}

/**
 * Extract a representative excerpt from a long text.
 * Takes the first `headTokens` tokens, a middle sample, and the last `tailTokens` tokens.
 * Useful for read-only critique prompts that need a global sample.
 *
 * Do not feed this to a prompt whose output replaces stored chapter text.
 * The omitted middle is then deleted from the manuscript. Use
 * chapterTextForRewrite for humanize, guided regenerate, and critique-apply.
 */
export function excerptContext(
  text: string,
  headTokens = 300,
  tailTokens = 150,
  midTokens = 150
): string {
  const total = estimateTokens(text);
  const budget = headTokens + tailTokens + midTokens;
  if (total <= budget) return text;

  const avgCharsPerToken = text.length / total;
  const headChars = Math.floor(headTokens * avgCharsPerToken);
  const tailChars = Math.floor(tailTokens * avgCharsPerToken);
  const midChars = Math.floor(midTokens * avgCharsPerToken);
  const midStart = Math.floor((text.length - midChars) / 2);

  const head = text.substring(0, headChars);
  const mid = text.substring(midStart, midStart + midChars);
  const tail = text.substring(text.length - tailChars);

  return `${head}\n\n[…middle excerpt…]\n\n${mid}\n\n[…]\n\n${tail}`;
}

// ---------------------------------------------------------------------------
// 4. Response cache (in-memory, TTL-based)
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Simple in-memory response cache with per-entry TTL. */
export class ResponseCache<T = string> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private defaultTtlMs = 5 * 60 * 1000) {}

  /** Stable hash of an arbitrary string (djb2). */
  private hash(key: string): string {
    let h = 5381;
    for (let i = 0; i < key.length; i++) {
      h = ((h << 5) + h + key.charCodeAt(i)) >>> 0; // keep unsigned 32-bit
    }
    return h.toString(36);
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.store.set(this.hash(key), {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  get(key: string): T | undefined {
    const entry = this.store.get(this.hash(key));
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(this.hash(key));
      return undefined;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /** Remove all expired entries. Call periodically to avoid memory growth. */
  purgeExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now > v.expiresAt) this.store.delete(k);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// ---------------------------------------------------------------------------
// 5. Shared global caches (one per logical call type)
// ---------------------------------------------------------------------------

/** Cache for `getHotGenres` – refreshes once per hour. */
export const genreCache = new ResponseCache<string>(60 * 60 * 1000);

/** Cache for `getTopicSuggestions(genre)` – refreshes every 30 minutes. */
export const topicCache = new ResponseCache<string>(30 * 60 * 1000);

/** Cache for `generateMarketReport(topic, genre)` – refreshes every 15 minutes. */
export const marketReportCache = new ResponseCache<string>(15 * 60 * 1000);

/** Generic short-lived cache for other repeated calls (5 minutes). */
export const shortCache = new ResponseCache<string>(5 * 60 * 1000);

// ---------------------------------------------------------------------------
// 6. Token telemetry (lightweight in-memory counters)
// ---------------------------------------------------------------------------

export interface TokenUsageEntry {
  fn: string;
  estimatedInputTokens: number;
  timestamp: number;
}

const _usageLog: TokenUsageEntry[] = [];

/** Record estimated token usage for a prompt. */
export function recordTokenUsage(fn: string, promptText: string): void {
  _usageLog.push({
    fn,
    estimatedInputTokens: estimateTokens(promptText),
    timestamp: Date.now(),
  });
  // Keep only the last 500 entries to avoid unbounded growth
  if (_usageLog.length > 500) _usageLog.splice(0, _usageLog.length - 500);
}

/** Returns a copy of the usage log for inspection / display. */
export function getTokenUsageLog(): Readonly<TokenUsageEntry[]> {
  return [..._usageLog];
}

/** Returns total estimated tokens across all logged calls. */
export function getTotalEstimatedTokens(): number {
  return _usageLog.reduce((sum, e) => sum + e.estimatedInputTokens, 0);
}

// ---------------------------------------------------------------------------
// 7. Convenience wrapper: cached AI call
// ---------------------------------------------------------------------------

/**
 * Wraps an async AI call with caching.  If the cache already contains a
 * response for `cacheKey` the stored value is returned immediately without
 * calling `fn`.
 *
 * @param cache     - The `ResponseCache` instance to use.
 * @param cacheKey  - A stable string key (typically the full prompt).
 * @param fn        - The async function that performs the actual AI call.
 * @param ttlMs     - Optional TTL override for this entry.
 */
export async function cachedCall<T>(
  cache: ResponseCache<T>,
  cacheKey: string,
  fn: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;
  const result = await fn();
  cache.set(cacheKey, result, ttlMs);
  return result;
}

// ---------------------------------------------------------------------------
// 8. MarketReport context compactor
// ---------------------------------------------------------------------------

/**
 * Produce a compact summary string of a MarketReport suitable for injecting
 * into follow-on prompts (outline, chapter, KDP copy) without repeating the
 * full multi-paragraph report each time.
 *
 * Saves ~200-400 tokens per downstream prompt that previously embedded the
 * full market report text.
 */
export function compactMarketContext(report: {
  trendAnalysis: string;
  targetAudience: { demographics: string; interests: string; painPoints: string };
  keywords: string[];
}): string {
  const kws = report.keywords.slice(0, 7).join(', ');
  const trend = truncateToTokenBudget(report.trendAnalysis, 120);
  const demo = truncateToTokenBudget(report.targetAudience.demographics, 60);
  return compactText(`Trend: ${trend} | Audience: ${demo} | Keywords: ${kws}`);
}
