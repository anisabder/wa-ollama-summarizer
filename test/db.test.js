import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';

const msg = (o) => ({ chatJid: '1203@g.us', id: 'A1', senderJid: '2135@s.whatsapp.net', senderName: 'Sara', fromMe: false, ts: 1000, text: 'hi', ...o });

test('stores messages, ignores duplicates, returns last N oldest-first', () => {
  const db = openDb(':memory:');
  assert.equal(db.saveMessage(msg({})), true);
  assert.equal(db.saveMessage(msg({})), false);
  db.saveMessages([msg({ id: 'A2', ts: 1010, text: 'two' }), msg({ id: 'A3', ts: 1020, text: 'three' })]);
  const rows = db.lastMessages('1203@g.us', 2);
  assert.deepEqual(rows.map((r) => r.text), ['two', 'three']);
  assert.equal(db.totalMessages(), 3);
});

test('same-timestamp messages keep insertion order', () => {
  const db = openDb(':memory:');
  db.saveMessages([msg({ id: 'a', ts: 5, text: 'first' }), msg({ id: 'b', ts: 5, text: 'second' }), msg({ id: 'c', ts: 5, text: 'third' })]);
  assert.deepEqual(db.lastMessages('1203@g.us', 3).map((r) => r.text), ['first', 'second', 'third']);
});

test('chat names: strong overwrites, weak never overwrites, null never wipes', () => {
  const db = openDb(':memory:');
  db.saveMessage(msg({}));
  db.saveChat('1203@g.us', 'Family');
  db.saveChat('1203@g.us', 'Ignored', { weak: true });
  db.saveChat('1203@g.us', null);
  assert.equal(db.chatsWithCounts()[0].name, 'Family');
  db.saveChat('1203@g.us', 'Family 2026');
  assert.equal(db.chatsWithCounts()[0].name, 'Family 2026');
});

test('findChats is case and accent insensitive, prefers exact matches', () => {
  const db = openDb(':memory:');
  db.saveMessages([msg({ chatJid: 'x1@g.us', id: '1' }), msg({ chatJid: 'x2@g.us', id: '2' }), msg({ chatJid: 'x3@g.us', id: '3' })]);
  db.saveChat('x1@g.us', 'Étude L1');
  db.saveChat('x2@g.us', 'Etude L1 groupe B');
  db.saveChat('x3@g.us', 'Famille');
  assert.equal(db.findChats('etude l1').length, 1);
  assert.equal(db.findChats('etude').length, 2);
  assert.equal(db.findChats('étude l1')[0].jid, 'x1@g.us');
  assert.equal(db.findChats('ETUDE L1 groupe b').length, 1);
  assert.equal(db.findChats('famille').length, 1);
  assert.equal(db.findChats('nothing').length, 0);
});
