/**
 * OpenAI-style SSE helpers for gateway chapter streaming.
 *
 * Frames are separated by a blank line. Providers often close the body
 * after the last `data:` line without that trailing separator, so a
 * parser that only splits on `\n\n` drops the final tokens.
 */

export interface SseConsumeResult {
  /** Incomplete frame to hold until more bytes arrive. Empty after a flush. */
  rest: string;
  /** Newly completed text deltas, in order. */
  text: string;
}

function deltasFromFrame(frame: string): string {
  let out = '';
  for (const line of frame.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const json = JSON.parse(payload);
      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) out += delta;
    } catch {
      // Incomplete JSON — the caller only hands us frames it considers complete.
    }
  }
  return out;
}

/**
 * Pull every complete SSE frame out of `buffer`.
 * When `flush` is set, a trailing frame with no blank-line terminator is
 * parsed too (end of stream).
 */
export function consumeSseBuffer(buffer: string, flush = false): SseConsumeResult {
  let working = buffer;
  if (flush && working.trim() && !working.endsWith('\n\n')) {
    working += '\n\n';
  }
  const frames = working.split('\n\n');
  const rest = flush ? '' : (frames.pop() ?? '');
  let text = '';
  for (const frame of frames) {
    text += deltasFromFrame(frame);
  }
  return { rest, text };
}

/**
 * Gateway streaming reports the full markdown so far. Chapter generation
 * appends each callback as a delta (the same contract as the Gemini stream).
 * Passing the accumulator through unchanged repeats every earlier token.
 */
export function deltaFromAccumulated(previous: string, next: string): { previous: string; delta: string } {
  if (next.startsWith(previous)) {
    return { previous: next, delta: next.slice(previous.length) };
  }
  return { previous: next, delta: next };
}
