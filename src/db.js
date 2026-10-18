import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const userPart = (jid) => (jid ? jid.split('@')[0].split(':')[0] : '');
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const clean = (s) => {
  const t = typeof s === 'string' ? s.trim() : '';
  return t || null;
};

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      is_group INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      chat_jid TEXT NOT NULL,
      id TEXT NOT NULL,
      sender_jid TEXT,
      sender_name TEXT,
      from_me INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (chat_jid, id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages (chat_jid, ts);
  `);

  const st = {
    chatStrong: db.prepare(
      `INSERT INTO chats (jid, name, is_group) VALUES (?, ?, ?)
       ON CONFLICT(jid) DO UPDATE SET name = COALESCE(excluded.name, chats.name), is_group = excluded.is_group`,
    ),
    chatWeak: db.prepare(
      `INSERT INTO chats (jid, name, is_group) VALUES (?, ?, ?)
       ON CONFLICT(jid) DO UPDATE SET name = COALESCE(chats.name, excluded.name)`,
    ),
    msg: db.prepare(
      `INSERT OR IGNORE INTO messages (chat_jid, id, sender_jid, sender_name, from_me, ts, text)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    last: db.prepare(
      `SELECT ts, sender_jid, sender_name, from_me, text FROM (
         SELECT rowid AS rid, ts, sender_jid, sender_name, from_me, text
         FROM messages WHERE chat_jid = ? ORDER BY ts DESC, rowid DESC LIMIT ?
       ) ORDER BY ts ASC, rid ASC`,
    ),
    chats: db.prepare(
      `SELECT c.jid, c.name, c.is_group, COUNT(m.id) AS n, MAX(m.ts) AS last_ts
       FROM chats c JOIN messages m ON m.chat_jid = c.jid
       GROUP BY c.jid ORDER BY last_ts DESC`,
    ),
    total: db.prepare(`SELECT COUNT(*) AS n FROM messages`),
  };

  const isGroup = (jid) => (jid.endsWith('@g.us') ? 1 : 0);

  function saveChat(jid, name, { weak = false } = {}) {
    if (!jid) return;
    (weak ? st.chatWeak : st.chatStrong).run(jid, clean(name), isGroup(jid));
  }

  function saveMessage(m) {
    st.chatWeak.run(m.chatJid, null, isGroup(m.chatJid));
    const r = st.msg.run(
      m.chatJid,
      m.id,
      m.senderJid ?? null,
      clean(m.senderName),
      m.fromMe ? 1 : 0,
      Math.floor(m.ts),
      m.text,
    );
    return Number(r.changes) > 0;
  }

  function saveMessages(list) {
    let added = 0;
    db.exec('BEGIN');
    try {
      for (const m of list) if (saveMessage(m)) added++;
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return added;
  }

  const chatsWithCounts = () =>
    st.chats.all().map((r) => ({ ...r, n: Number(r.n), label: r.name ?? userPart(r.jid) }));

  function findChats(query) {
    const q = norm(query);
    const all = chatsWithCounts();
    const exact = all.filter((r) => norm(r.label) === q);
    if (exact.length) return exact;
    return all.filter((r) => norm(r.label).includes(q) || userPart(r.jid).includes(q));
  }

  return {
    saveChat,
    saveMessage,
    saveMessages,
    lastMessages: (jid, n) => st.last.all(jid, n),
    chatsWithCounts,
    findChats,
    totalMessages: () => Number(st.total.get().n),
    close: () => db.close(),
  };
}
