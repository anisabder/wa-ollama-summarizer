import { config } from './config.js';

const system = (language) => `You summarize WhatsApp conversations for the owner of the account. "Me" is the owner.
Rules:
- Use only what is in the transcript. Never invent names, dates, numbers or facts.
- Be concise and easy to skim: one or two sentences of overview, then short bullet points for key topics, decisions, plans or dates, and anything addressed to "Me" or still waiting for an answer.
- Keep names as they appear. Skip greetings and small talk unless they matter.
- ${language ? `Write the summary in ${language}.` : 'Write the summary in the main language used in the conversation.'}
- Use plain text with simple "-" bullets. No headings and no tables.`;

export async function ollamaChat(messages, { signal } = {}) {
  let res;
  try {
    res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        keep_alive: '10m',
        options: { num_ctx: config.numCtx, temperature: 0.2 },
      }),
      signal: signal ?? AbortSignal.timeout(config.timeoutMs),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error('Ollama took too long to answer. Try fewer messages or a smaller model.');
    throw new Error(`Cannot reach Ollama at ${config.ollamaUrl}. Is it running? (ollama serve)`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).error ?? '';
    } catch {
      // ignore body parse errors
    }
    if (res.status === 404) throw new Error(`Model "${config.model}" not found. Run: ollama pull ${config.model}`);
    throw new Error(`Ollama error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  const data = await res.json();
  const out = data?.message?.content?.trim();
  if (!out) throw new Error('Ollama returned an empty answer.');
  return out;
}

export function toWhatsApp(md) {
  return md
    .replace(/^#{1,6}\s*(.+)$/gm, '*$1*')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^\s*-\s+/gm, '• ')
    .trim();
}

export async function summarize(chunks, meta, { chat = ollamaChat, language = config.summaryLanguage } = {}) {
  const sys = { role: 'system', content: system(language) };
  const head = `Chat: ${meta.name}\nMessages: ${meta.count}`;

  if (chunks.length === 1) {
    const out = await chat([sys, { role: 'user', content: `${head}\n\nTranscript:\n${chunks[0]}\n\nSummarize this conversation.` }]);
    return toWhatsApp(out);
  }

  const partials = [];
  for (let i = 0; i < chunks.length; i++) {
    const out = await chat([
      sys,
      { role: 'user', content: `${head}\nThis is part ${i + 1} of ${chunks.length}.\n\nTranscript:\n${chunks[i]}\n\nSummarize this part.` },
    ]);
    partials.push(`Part ${i + 1}:\n${out}`);
    meta.onProgress?.(i + 1, chunks.length);
  }
  const merged = await chat([
    sys,
    {
      role: 'user',
      content: `${head}\n\nThese are summaries of consecutive parts of one conversation:\n\n${partials.join('\n\n')}\n\nMerge them into one summary of the whole conversation, in chronological order, without repeating yourself.`,
    },
  ]);
  return toWhatsApp(merged);
}
