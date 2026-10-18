import { userPart } from './db.js';

const MAX_LINE = 1200;

export const speaker = (r) => (r.from_me ? 'Me' : r.sender_name || userPart(r.sender_jid) || 'Unknown');

const dayLabel = (d, locale) =>
  d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function formatTranscript(rows, { locale = 'en-GB' } = {}) {
  const lines = [];
  let lastDay = '';
  for (const r of rows) {
    const d = new Date(r.ts * 1000);
    const day = dayLabel(d, locale);
    if (day !== lastDay) {
      lines.push(`--- ${day} ---`);
      lastDay = day;
    }
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    let text = r.text.replace(/\s*\n\s*/g, ' ').trim();
    if (text.length > MAX_LINE) text = text.slice(0, MAX_LINE) + '…';
    lines.push(`[${time}] ${speaker(r)}: ${text}`);
  }
  return lines;
}

export function chunkLines(lines, maxChars) {
  const chunks = [];
  let cur = [];
  let size = 0;
  let header = null;
  for (const line of lines) {
    const isHeader = line.startsWith('--- ');
    if (isHeader) header = line;
    if (cur.length && size + line.length + 1 > maxChars) {
      chunks.push(cur.join('\n'));
      cur = header && !isHeader ? [header] : [];
      size = cur.reduce((a, l) => a + l.length + 1, 0);
    }
    cur.push(line);
    size += line.length + 1;
  }
  if (cur.length) chunks.push(cur.join('\n'));
  return chunks;
}

export function dateRange(rows, locale = 'en-GB') {
  if (!rows.length) return '';
  const a = dayLabel(new Date(rows[0].ts * 1000), locale);
  const b = dayLabel(new Date(rows[rows.length - 1].ts * 1000), locale);
  return a === b ? a : `${a} → ${b}`;
}
