const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

export function parseCommand(text, { defaultCount = 50, maxCount = 500 } = {}) {
  const t = (text ?? '').trim();
  if (!t.startsWith('!')) return null;
  const [head, ...args] = t.slice(1).split(/\s+/);
  const name = head.toLowerCase();

  if (['summarize', 'summarise', 's'].includes(name)) {
    let rest = args;
    let count = null;
    if (rest[0] && /^\d+$/.test(rest[0])) {
      count = Number(rest[0]);
      rest = rest.slice(1);
    }
    const wanted = count ?? defaultCount;
    const final = clamp(wanted, 1, maxCount);
    return {
      type: 'summarize',
      count: final,
      clamped: final !== wanted,
      chatQuery: rest.join(' ').trim(),
    };
  }
  if (name === 'chats') return { type: 'chats', filter: args.join(' ').trim() };
  if (name === 'help') return { type: 'help' };
  if (name === 'ping') return { type: 'ping' };
  return null;
}
