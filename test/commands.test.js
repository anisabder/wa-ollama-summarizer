import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/commands.js';

const opts = { defaultCount: 50, maxCount: 500 };

test('parses count and chat name', () => {
  assert.deepEqual(parseCommand('!summarize 30 Study group', opts), { type: 'summarize', count: 30, clamped: false, chatQuery: 'Study group' });
});
test('count is optional and defaults', () => {
  assert.equal(parseCommand('!summarize family', opts).count, 50);
  assert.equal(parseCommand('!summarize', opts).chatQuery, '');
});
test('a number inside the chat name is kept as part of the name', () => {
  const c = parseCommand('!summarize 20 L1 G01 2026', opts);
  assert.equal(c.count, 20);
  assert.equal(c.chatQuery, 'L1 G01 2026');
});
test('clamps to max and flags it', () => {
  const c = parseCommand('!s 99999 x', opts);
  assert.equal(c.count, 500);
  assert.equal(c.clamped, true);
  assert.equal(parseCommand('!summarize 0 x', opts).count, 1);
});
test('other commands and non-commands', () => {
  assert.deepEqual(parseCommand('!chats stud', opts), { type: 'chats', filter: 'stud' });
  assert.deepEqual(parseCommand('!help', opts), { type: 'help' });
  assert.deepEqual(parseCommand('!ping', opts), { type: 'ping' });
  assert.equal(parseCommand('hello', opts), null);
  assert.equal(parseCommand('!unknown', opts), null);
  assert.equal(parseCommand('!SUMMARISE 5 a', opts).type, 'summarize');
});
