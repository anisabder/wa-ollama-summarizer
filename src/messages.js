import { createHash } from 'node:crypto';

export const SKIP_TYPES = new Set([
  'e2e_notification', 'notification_template', 'notification', 'gp2', 'protocol', 'revoked',
  'call_log', 'ciphertext', 'debug', 'reaction', 'broadcast_notification', 'group_notification',
]);

const LABELS = {
  image: 'image', video: 'video', audio: 'voice note', ptt: 'voice note', document: 'document',
  sticker: 'sticker', location: 'location', vcard: 'contact', multi_vcard: 'contact', album: 'album',
};

export const storable = (jid) =>
  !!jid && (jid.endsWith('@g.us') || jid.endsWith('@c.us') || jid.endsWith('@lid'));

// Newer WhatsApp Web builds drop id._serialized, so prefer the raw id that is always there.
export function messageId(msg) {
  const k = msg.id;
  if (typeof k === 'string') return k;
  return k?.id || k?._serialized || msg._data?.id?.id || null;
}

export function skipReason(msg) {
  if (msg.isStatus) return 'status update';
  if (SKIP_TYPES.has(msg.type)) return `message type "${msg.type}"`;
  const chatJid = msg.fromMe ? msg.to : msg.from;
  if (!storable(chatJid)) return `chat id not supported: ${chatJid}`;
  if (!messageId(msg)) return `no message id (id=${JSON.stringify(msg.id)})`;
  return `no text (type "${msg.type}")`;
}

export function toStored(msg, { live = false, selfId = '' } = {}) {
  if (msg.isStatus || SKIP_TYPES.has(msg.type)) return null;
  const chatJid = msg.fromMe ? msg.to : msg.from;
  if (!storable(chatJid)) return null;
  let text;
  if (msg.type === 'chat') text = msg.body;
  else if (msg.type === 'poll_creation') text = `[poll] ${msg.pollName ?? ''}`.trim();
  else if (LABELS[msg.type]) text = `[${LABELS[msg.type]}]${msg.body ? ' ' + msg.body : ''}`;
  else text = msg.body;
  if (!text || !text.trim()) return null;
  const ts = msg.timestamp ?? msg._data?.t ?? (live ? Math.floor(Date.now() / 1000) : null);
  if (!ts) return null;
  const senderJid = msg.fromMe ? selfId : msg.author || chatJid;
  const id =
    messageId(msg) ?? createHash('sha1').update(`${chatJid}|${ts}|${senderJid}|${text}`).digest('hex').slice(0, 24);
  return {
    chatJid,
    id,
    senderJid,
    senderName: msg.fromMe ? null : msg._data?.notifyName,
    fromMe: !!msg.fromMe,
    ts,
    text,
  };
}
