import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTranscript, chunkLines, dateRange } from '../src/transcript.js';

const day1 = Date.UTC(2026, 9, 14, 10, 0) / 1000;
const day2 = Date.UTC(2026, 9, 15, 10, 0) / 1000;
const rows = [
  { ts: day1, sender_name: 'Sara', sender_jid: 'a@s.whatsapp.net', from_me: 0, text: 'hello\nthere' },
  { ts: day1 + 60, sender_name: null, sender_jid: null, from_me: 1, text: 'hi' },
  { ts: day2, sender_name: null, sender_jid: '2135551@s.whatsapp.net', from_me: 0, text: 'next day' },
];

test('formats lines with day headers, Me, and phone fallback', () => {
  const lines = formatTranscript(rows);
  assert.equal(lines.filter((l) => l.startsWith('--- ')).length, 2);
  assert.ok(lines.some((l) => l.endsWith('Sara: hello there')));
  assert.ok(lines.some((l) => l.includes('] Me: hi')));
  assert.ok(lines.some((l) => l.includes('] 2135551: next day')));
});

test('long messages are truncated', () => {
  const [, line] = formatTranscript([{ ts: day1, sender_name: 'X', from_me: 0, text: 'a'.repeat(5000) }]);
  assert.ok(line.length < 1300);
});

test('chunking respects the limit and repeats the day header', () => {
  const lines = ['--- Wed 14 Oct 2026 ---', ...Array.from({ length: 20 }, (_, i) => `[10:0${i % 10}] X: ${'m'.repeat(40)}`)];
  const chunks = chunkLines(lines, 300);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.length <= 300 + 60);
    assert.ok(c.startsWith('--- Wed 14 Oct 2026 ---'));
  }
  assert.equal(chunks.join('\n').split('X:').length - 1, 20);
});

test('single chunk when it fits; date range collapses same day', () => {
  assert.equal(chunkLines(['a', 'b'], 100).length, 1);
  assert.ok(!dateRange(rows.slice(0, 2)).includes('→'));
  assert.ok(dateRange(rows).includes('→'));
});
