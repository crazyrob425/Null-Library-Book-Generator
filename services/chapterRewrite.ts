/**
 * Helpers for prompts whose model output replaces a stored chapter.
 *
 * excerptContext is safe for read-only review. It is not safe here: the
 * callers in the UI, batch generator, and 12-stage pipeline assign the
 * model output straight back onto chapter.content. An excerpted prompt
 * therefore deletes every paragraph the model never saw.
 */

/** Full chapter prose the model must rewrite. Never an excerpt. */
export function chapterTextForRewrite(content: string | null | undefined): string {
  return content ?? '';
}

/**
 * Keep the stored chapter when a rewrite comes back empty or whitespace.
 * An empty completion used to be written over the draft, wiping it.
 */
export function rewriteOrKeep(original: string, rewritten: string | null | undefined): string {
  const next = (rewritten ?? '').trim();
  return next ? next : original;
}
