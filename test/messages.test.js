import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toStored, skipReason, messageId } from '../src/messages.js';

const SELF = '213564263084@c.us';
// Shapes seen on current WhatsApp Web builds: ids have no _serialized, own chat is addressed by LID.
const selfCommand = {
  type: 'chat', fromMe: true, from: SELF, to: '280702654402608@lid', body: '!ping',
  id: { fromMe: true, remote: '280702654402608@lid', id: '3EB0AAA111' }, timestamp: 1792000000,
};

test('works when id has no _serialized and the chat is a LID', () => {
  const r = toStored(selfCommand, { selfId: SELF });
  assert.equal(r.id, '3EB0AAA111');
  assert.equal(r.chatJid, '280702654402608@lid');
  assert.equal(r.senderJid, SELF);
  assert.equal(r.fromMe, true);
  assert.equal(r.text, '!ping');
});

test('group message uses author as sender and notifyName as name', () => {
  const r = toStored({
    type: 'chat', fromMe: false, from: '1203@g.us', to: SELF, author: '777@lid', body: 'salut',
    id: { id: 'X1', remote: '1203@g.us' }, timestamp: 100, _data: { notifyName: 'Sara' },
  }, { selfId: SELF });
  assert.equal(r.chatJid, '1203@g.us');
  assert.equal(r.senderJid, '777@lid');
  assert.equal(r.senderName, 'Sara');
});

test('system notifications and status updates are skipped with a reason', () => {
  const n = { type: 'e2e_notification', fromMe: false, from: '1@c.us', body: '', id: { id: 'a' }, timestamp: 1 };
  assert.equal(toStored(n, { selfId: SELF }), null);
  assert.match(skipReason(n), /e2e_notification/);
  assert.equal(toStored({ ...selfCommand, isStatus: true }, { selfId: SELF }), null);
});

test('media gets a label plus caption; empty media-less messages are dropped', () => {
  const img = { type: 'image', fromMe: false, from: '5@c.us', body: 'look', id: { id: 'i1' }, timestamp: 5 };
  assert.equal(toStored(img, { selfId: SELF }).text, '[image] look');
  assert.equal(toStored({ ...img, type: 'ptt', body: '' }, { selfId: SELF }).text, '[voice note]');
  assert.equal(toStored({ ...img, type: 'chat', body: '  ' }, { selfId: SELF }), null);
});

test('missing id falls back to a stable hash; missing timestamp only allowed for live events', () => {
  const noId = { type: 'chat', fromMe: false, from: '5@c.us', body: 'hi', timestamp: 9 };
  const a = toStored(noId, { selfId: SELF });
  const b = toStored({ ...noId }, { selfId: SELF });
  assert.equal(a.id, b.id);
  assert.equal(a.id.length, 24);
  const noTs = { ...noId, timestamp: undefined };
  assert.equal(toStored(noTs, { selfId: SELF }), null);
  assert.ok(toStored(noTs, { selfId: SELF, live: true }).ts > 1e9);
  assert.equal(messageId({ id: 'raw' }), 'raw');
});
