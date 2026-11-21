import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterTextForRewrite, rewriteOrKeep } from './chapterRewrite.ts';
import { consumeSseBuffer, deltaFromAccumulated } from './sseStream.ts';

const MIDDLE = 'UNIQUE_MIDDLE_SENTENCE_the_plot_turns_here';

function longChapter(): string {
  return `${'The road ran west. '.repeat(800)}${MIDDLE}${' Then the rain began. '.repeat(800)}`;
}

test('rewrite source keeps the middle of a long chapter', () => {
  const chapter = longChapter();
  const source = chapterTextForRewrite(chapter);
  assert.equal(source, chapter);
  assert.equal(source.includes(MIDDLE), true);
  assert.equal(source.includes('[…middle excerpt…]'), false);
});

test('a blank rewrite does not wipe the stored chapter', () => {
  const original = longChapter();
  assert.equal(rewriteOrKeep(original, ''), original);
  assert.equal(rewriteOrKeep(original, '   \n'), original);
  assert.equal(rewriteOrKeep(original, null), original);
  assert.equal(rewriteOrKeep(original, undefined), original);
  assert.equal(rewriteOrKeep(original, 'A full rewritten chapter.'), 'A full rewritten chapter.');
});

test('chapter-replacing prompts do not excerpt the manuscript', () => {
  const src = readFileSync(new URL('./geminiService.ts', import.meta.url), 'utf8');
  const names = ['regenerateChapterWithGuidance', 'humanizeChapterContent', 'applyLiteraryCritique'];
  for (const name of names) {
    const start = src.indexOf(`export const ${name}`);
    assert.ok(start >= 0, `${name} exists`);
    const next = src.indexOf('\nexport const ', start + 10);
    const body = src.slice(start, next === -1 ? undefined : next);
    assert.equal(body.includes('excerptContext'), false, `${name} must not excerpt text it writes back`);
    assert.equal(body.includes('chapterTextForRewrite'), true, `${name} must send the full chapter`);
    assert.equal(body.includes('rewriteOrKeep'), true, `${name} must keep the original when the rewrite is empty`);
  }
});

function dataFrame(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

test('SSE parser keeps the last frame when the stream ends without a blank line', () => {
  let buffer = '';
  let text = '';
  const absorb = (chunk: string, flush = false) => {
    buffer += chunk;
    const consumed = consumeSseBuffer(buffer, flush);
    buffer = consumed.rest;
    text += consumed.text;
  };

  absorb(dataFrame('Hello '));
  assert.equal(text, 'Hello ');

  // Final token arrives as a complete JSON frame with no trailing \n\n, then EOF.
  const tail = `data: ${JSON.stringify({ choices: [{ delta: { content: 'world.' } }] })}`;
  absorb(tail, false);
  assert.equal(text, 'Hello ');
  absorb('', true);
  assert.equal(text, 'Hello world.');
});

test('SSE parser holds a frame split across chunks', () => {
  const frame = dataFrame('split');
  const mid = Math.floor(frame.length / 2);
  let buffer = frame.slice(0, mid);
  let first = consumeSseBuffer(buffer, false);
  assert.equal(first.text, '');
  buffer = first.rest + frame.slice(mid);
  const second = consumeSseBuffer(buffer, false);
  assert.equal(second.text, 'split');
  assert.equal(second.rest, '');
});

test('gateway accumulated callbacks become deltas the editor can append', () => {
  const snapshots = ['The ', 'The road ', 'The road ran west.'];
  let previous = '';
  let appended = '';
  let naive = '';
  for (const snapshot of snapshots) {
    naive += snapshot;
    const step = deltaFromAccumulated(previous, snapshot);
    previous = step.previous;
    appended += step.delta;
  }
  assert.equal(appended, 'The road ran west.');
  assert.notEqual(naive, appended);
});
