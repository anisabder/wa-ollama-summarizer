import wwebjs from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

import { config } from './config.js';
import { openDb, userPart, norm } from './db.js';
import { parseCommand } from './commands.js';
import { formatTranscript, chunkLines, dateRange } from './transcript.js';
import { summarize } from './summarizer.js';
import { toStored as convert, skipReason, storable } from './messages.js';
import { findBrowser } from './browser.js';

const { Client, LocalAuth, Chat } = wwebjs;

const db = openDb(config.dbPath);
const log = (...a) => console.log(new Date().toLocaleTimeString('en-GB'), ...a);

const chromePath = findBrowser({ configured: config.chromePath });

const describeError = (e) => `${e?.name ?? 'Error'}: ${e?.message || e}`;

let selfId = '';
let selfLid = '';
let waVersion = 'unknown';
const isSelf = (jid) => {
  const u = userPart(jid);
  return !!u && (u === userPart(selfId) || (!!selfLid && u === userPart(selfLid)));
};

const toStored = (msg, opts) => convert(msg, { ...opts, selfId });

const HELP = `*Commands* (send them from your own "Message yourself" chat)
!summarize 50 family  - last 50 messages of the chat matching "family"
!chats  - list chats the bot has stored
!chats name  - search stored chats
!help  - this message

You can also type !summarize 50 inside any chat. The summary still arrives here, but the command text is visible in that chat.`;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: config.authDir }),
  puppeteer: {
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
  ...(config.pairingPhone ? { pairWithPhoneNumber: { phoneNumber: config.pairingPhone, showNotification: true } } : {}),
  ...(config.waWebVersion
    ? {
        webVersionCache: {
          type: 'remote',
          remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${config.waWebVersion}.html`,
        },
      }
    : {}),
});

let queue = Promise.resolve();
const enqueue = (fn) => {
  queue = queue.then(fn).catch((e) => log('job failed:', e.message));
};

// client.getChats() fails completely if any single chat misbehaves, so read the chat list ourselves.
async function listChats() {
  return client.pupPage.evaluate(() => {
    const out = [];
    const chats = window.require('WAWebCollections').Chat.getModelsArray();
    for (const c of chats) {
      try {
        out.push({ id: c.id._serialized, name: c.formattedTitle || c.name || null, t: c.t || 0 });
      } catch {
        // skip chats that cannot be read
      }
    }
    return out;
  });
}

// A minimal Chat object: skips the per-group metadata lookups that getChatById does.
const liteChat = (jid) => new Chat(client, { id: { _serialized: jid } });

async function backfill(chats) {
  const recent = chats
    .filter((c) => storable(c.id) && !isSelf(c.id))
    .sort((a, b) => b.t - a.t)
    .slice(0, config.backfillChats);
  let raw = 0;
  let total = 0;
  let failed = 0;
  let samples = 0;
  for (const c of recent) {
    try {
      const msgs = await liteChat(c.id).fetchMessages({ limit: config.backfillMessages });
      raw += msgs.length;
      const rows = msgs.map((m) => toStored(m)).filter(Boolean);
      if (msgs.length && !rows.length && samples++ < 2) {
        log(`Backfill: ${msgs.length} messages fetched from "${c.name ?? c.id}" but none storable (first: ${skipReason(msgs[0])})`);
      }
      total += db.saveMessages(rows);
    } catch (e) {
      failed++;
      if (failed <= 3) log(`Backfill failed for "${c.name ?? c.id}": ${describeError(e)}`);
    }
  }
  log(`Backfill done: fetched ${raw} messages, saved +${total}, from ${recent.length - failed}/${recent.length} chats`);
  if (recent.length && raw === 0) log('WhatsApp Web returned no messages for any chat. Summaries will try to load them on demand.');
}

async function fetchLive(jid, n) {
  const msgs = await liteChat(jid).fetchMessages({ limit: Math.ceil(n * 1.3) + 10 });
  const added = db.saveMessages(msgs.map((m) => toStored(m)).filter(Boolean));
  log(`Live fetch: ${msgs.length} messages from WhatsApp Web, ${added} new`);
  return added;
}

async function resolveChats(query) {
  const q = norm(query);
  let chats = [];
  try {
    chats = (await listChats())
      .filter((c) => storable(c.id) && !isSelf(c.id))
      .map((c) => ({ jid: c.id, label: c.name || userPart(c.id) }));
  } catch (e) {
    log('Could not read the live chat list, using stored chats:', describeError(e));
  }
  if (!chats.length) chats = db.chatsWithCounts().map((c) => ({ jid: c.jid, label: c.label }));
  const exact = chats.filter((c) => norm(c.label) === q);
  if (exact.length) return exact;
  return chats.filter((c) => norm(c.label).includes(q) || userPart(c.jid).includes(q));
}

function handleCommand(cmd, fromJid) {
  const replyJid = isSelf(fromJid) ? fromJid : selfLid || selfId;
  const reply = (t) =>
    client.sendMessage(replyJid, t, { sendSeen: false }).catch((e) => log('Sending a reply failed:', describeError(e)));

  if (cmd.type === 'ping') return reply(`Pong. WhatsApp Web ${waVersion}. ${db.totalMessages()} messages stored.`);
  if (cmd.type === 'help') return reply(HELP);

  if (cmd.type === 'chats') {
    const list = cmd.filter ? db.findChats(cmd.filter) : db.chatsWithCounts();
    if (!list.length) return reply('No stored chats match yet. The bot only knows chats it has seen messages from.');
    return reply(`*Stored chats* (message counts)\n${list.slice(0, 20).map((c) => `• ${c.label} (${c.n})`).join('\n')}`);
  }

  enqueue(async () => {
    let target;
    if (!cmd.chatQuery) {
      if (isSelf(fromJid)) return reply('Which chat? Example: !summarize 50 family\nSee the list with !chats');
      target = { jid: fromJid, label: db.chatsWithCounts().find((c) => c.jid === fromJid)?.label ?? userPart(fromJid) };
    } else {
      const found = await resolveChats(cmd.chatQuery);
      if (!found.length) return reply(`No chat matches "${cmd.chatQuery}". Try !chats`);
      if (found.length > 1) {
        return reply(`Several chats match "${cmd.chatQuery}", be more specific:\n${found.slice(0, 6).map((c) => `• ${c.label}`).join('\n')}`);
      }
      target = found[0];
    }

    try {
      await fetchLive(target.jid, cmd.count);
    } catch (e) {
      log(`Live fetch failed for ${target.label}, using stored messages:`, describeError(e));
    }
    const rows = db.lastMessages(target.jid, cmd.count);
    if (!rows.length) return reply(`No messages found for ${target.label}.`);

    const note = cmd.clamped ? ` (limited to ${config.maxCount})` : '';
    await reply(`Summarizing the last ${rows.length} messages of ${target.label}${note} with ${config.model}...`);
    try {
      const chunks = chunkLines(formatTranscript(rows), config.chunkChars);
      const out = await summarize(chunks, { name: target.label, count: rows.length });
      await reply(`*${target.label}* - last ${rows.length} messages\n_${dateRange(rows)}_\n\n${out}`);
    } catch (e) {
      await reply(`Could not summarize: ${e.message}`);
    }
  });
}

client.on('qr', (qr) => {
  log('Scan this QR: WhatsApp > Linked devices > Link a device');
  qrcode.generate(qr, { small: true });
});
client.on('code', (code) => log(`Pairing code: ${code}  (WhatsApp > Linked devices > Link a device > Link with phone number instead)`));
client.on('loading_screen', (percent, message) => log(`Loading WhatsApp Web: ${percent}% ${message ?? ''}`));
client.once('authenticated', () => log('Authenticated.'));
client.on('auth_failure', (m) => log('Authentication failed:', m));

client.on('ready', async () => {
  clearTimeout(watchdog);
  selfId = client.info.wid._serialized;
  try {
    const ids = await client.pupPage.evaluate(() => {
      const me = window.require('WAWebUserPrefsMeUser');
      return { lid: me.getMaybeMeLidUser?.()?._serialized ?? null };
    });
    selfLid = ids.lid ?? '';
  } catch (e) {
    log('Could not read your WhatsApp LID id:', describeError(e));
  }
  log(`Own ids: ${selfId}${selfLid ? ' / ' + selfLid : ''}`);
  try {
    waVersion = await client.getWWebVersion();
  } catch {
    // not important
  }
  log(`Ready. WhatsApp Web ${waVersion}. ${db.totalMessages()} messages in the local store.`);
  enqueue(async () => {
    try {
      const chats = await listChats();
      for (const c of chats) if (storable(c.id)) db.saveChat(c.id, c.name);
      log(`Found ${chats.length} chats.`);
      await backfill(chats);
    } catch (e) {
      log('Startup sync failed:', describeError(e));
    }
  });
});

client.on('disconnected', (reason) => {
  log('Disconnected from WhatsApp:', reason);
  process.exit(1);
});

const seenCommands = new Set();

function onMessage(msg) {
  if (config.debug) {
    log(`event: type=${msg.type} fromMe=${msg.fromMe} from=${msg.from} to=${msg.to} body=${JSON.stringify((msg.body ?? '').slice(0, 30))}`);
  }
  const row = toStored(msg, { live: true });
  if (!row) {
    if (config.debug) log(`  skipped: ${skipReason(msg)}`);
    return;
  }
  const cmd = row.fromMe ? parseCommand(row.text, config) : null;
  if (cmd) {
    if (seenCommands.has(row.id)) return;
    seenCommands.add(row.id);
    if (seenCommands.size > 500) seenCommands.delete(seenCommands.values().next().value);
    const age = Date.now() / 1000 - row.ts;
    log(`Command "${cmd.type}" received in ${row.chatJid} (${Math.round(age)}s old)`);
    if (Math.abs(age) < 300) handleCommand(cmd, row.chatJid);
    else log('  ignored: the message time differs from this PC clock by more than 5 minutes');
    return;
  }
  if (isSelf(row.chatJid)) return;
  db.saveMessage(row);
}

client.on('message_create', onMessage);
client.on('message', onMessage);

const watchdog = setTimeout(() => {
  log('Still starting after 90 seconds. If no QR code or "Ready" appears, the browser may not be launching.');
  log(`Browser in use: ${chromePath ?? 'puppeteer default (none found)'}  - set CHROME_PATH in .env if that is wrong.`);
}, 90000);
for (const ev of ['qr', 'code', 'authenticated']) client.once(ev, () => clearTimeout(watchdog));

async function shutdown() {
  try {
    await client.destroy();
  } catch {
    // already closed
  }
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log(`Starting. Browser: ${chromePath ?? 'puppeteer default (none found)'}`);
client.initialize().catch((e) => {
  log('Could not start the browser:', e.message);
  log('Check that Chromium is installed (sudo pacman -S chromium) or set CHROME_PATH in .env.');
  process.exit(1);
});
