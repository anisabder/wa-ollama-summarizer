try {
  process.loadEnvFile('.env');
} catch {
  // no .env file, defaults below are used
}

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  ollamaUrl: (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, ''),
  model: process.env.OLLAMA_MODEL ?? 'gemma3:4b',
  numCtx: num(process.env.OLLAMA_NUM_CTX, 8192),
  timeoutMs: num(process.env.OLLAMA_TIMEOUT_MS, 600000),
  chunkChars: num(process.env.CHUNK_CHARS, 7000),
  defaultCount: num(process.env.DEFAULT_COUNT, 50),
  maxCount: num(process.env.MAX_COUNT, 500),
  summaryLanguage: process.env.SUMMARY_LANGUAGE ?? '',
  pairingPhone: (process.env.PAIRING_PHONE ?? '').replace(/\D/g, ''),
  debug: process.env.DEBUG === 'true',
  chromePath: process.env.CHROME_PATH ?? '',
  backfillChats: num(process.env.BACKFILL_CHATS, 30),
  backfillMessages: num(process.env.BACKFILL_MESSAGES, 100),
  waWebVersion: process.env.WA_WEB_VERSION ?? '',
  dbPath: process.env.DB_PATH ?? './data/messages.db',
  authDir: process.env.AUTH_DIR ?? './auth',
};
