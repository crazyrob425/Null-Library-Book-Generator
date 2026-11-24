import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../App.tsx');

/** Drop comments and string literals so a mention of a hook in prose is not a call. */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function isKeywordAt(src: string, index: number, word: string): boolean {
  if (!src.startsWith(word, index)) return false;
  const before = index === 0 ? '' : src[index - 1];
  const after = src[index + word.length] ?? '';
  return !/[\w$]/.test(before) && !/[\w$]/.test(after);
}

/** Index of the statement controlled by an `if` that begins at `ifAt`. */
function indexAfterIfCondition(src: string, ifAt: number): number {
  const open = src.indexOf('(', ifAt);
  let paren = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') {
      paren--;
      if (paren === 0) return i + 1;
    }
  }
  return src.length;
}

function skipSpace(src: string, index: number): number {
  while (index < src.length && /\s/.test(src[index])) index++;
  return index;
}

/**
 * `if` statements written directly in App (not inside a nested function) whose
 * body returns. An early return inside a hook callback is not one of these.
 */
function componentConditionalReturnOffsets(fnSource: string): number[] {
  const open = fnSource.indexOf('{');
  let depth = 0;
  const hits: number[] = [];
  for (let i = open; i < fnSource.length; i++) {
    const c = fnSource[i];
    if (c === '{') {
      depth++;
      continue;
    }
    if (c === '}') {
      depth--;
      continue;
    }
    if (depth !== 1 || !isKeywordAt(fnSource, i, 'if')) continue;
    let body = skipSpace(fnSource, indexAfterIfCondition(fnSource, i));
    if (fnSource[body] === '{') body = skipSpace(fnSource, body + 1);
    if (isKeywordAt(fnSource, body, 'return')) hits.push(i);
  }
  return hits;
}

test('App calls every hook before the batch, automation, and loading returns', () => {
  const raw = readFileSync(appPath, 'utf8');
  const start = raw.indexOf('function App()');
  const end = raw.indexOf('\nexport default App');
  assert.ok(start >= 0 && end > start, 'App function not found');

  const body = stripCommentsAndStrings(raw.slice(start, end));
  const returns = componentConditionalReturnOffsets(body);
  assert.ok(returns.length >= 3, `expected the three screen returns, found ${returns.length}`);
  const earliestReturn = Math.min(...returns);

  const hookCall = /\buse(?:State|Effect|Callback|Memo|Ref|AutoSave)\s*\(/g;
  const late: string[] = [];
  for (const match of body.matchAll(hookCall)) {
    if (match.index !== undefined && match.index > earliestReturn) {
      late.push(body.slice(match.index, match.index + 24).replace(/\s+/g, ' '));
    }
  }
  assert.deepEqual(
    late,
    [],
    'a hook after a conditional return crashes the next render that takes that return',
  );
});
