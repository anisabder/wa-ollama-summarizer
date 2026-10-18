import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let server, calls = [], mode = 'ok', summarizer;

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const j = JSON.parse(body);
      calls.push(j);
      if (mode === 'missing') {
        res.writeHead(404, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'model not found' }));
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: { role: 'assistant', content: `**Reply ${calls.length}**\n* point` } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.OLLAMA_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.OLLAMA_MODEL = 'test-model';
  summarizer = await import('../src/summarizer.js');
});
after(() => server.close());

test('single chunk: one call with model, context size, transcript; output converted to WhatsApp style', async () => {
  calls = [];
  const out = await summarizer.summarize(['[10:00] A: hi'], { name: 'Group', count: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'test-model');
  assert.equal(calls[0].stream, false);
  assert.equal(calls[0].options.num_ctx, 8192);
  assert.ok(calls[0].messages[1].content.includes('[10:00] A: hi'));
  assert.equal(out, '*Reply 1*\n• point');
});

test('multiple chunks: one call per chunk plus a merge call, progress reported', async () => {
  calls = [];
  const seen = [];
  await summarizer.summarize(['c1', 'c2', 'c3'], { name: 'G', count: 3, onProgress: (i, n) => seen.push([i, n]) });
  assert.equal(calls.length, 4);
  assert.ok(calls[3].messages[1].content.includes('Part 1:') && calls[3].messages[1].content.includes('Part 3:'));
  assert.deepEqual(seen, [[1, 3], [2, 3], [3, 3]]);
});

test('language setting is passed to the system prompt', async () => {
  calls = [];
  await summarizer.summarize(['x'], { name: 'G', count: 1 }, { language: 'French' });
  assert.ok(calls[0].messages[0].content.includes('Write the summary in French'));
});

test('helpful errors for missing model and unreachable Ollama', async () => {
  mode = 'missing';
  await assert.rejects(() => summarizer.ollamaChat([{ role: 'user', content: 'x' }]), /ollama pull test-model/);
  mode = 'ok';
  const port = server.address().port;
  server.close();
  await assert.rejects(() => summarizer.ollamaChat([{ role: 'user', content: 'x' }]), /Cannot reach Ollama/);
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
});

test('markdown cleanup', () => {
  assert.equal(summarizer.toWhatsApp('# Title\n**bold** text\n* a\n- b'), '*Title*\n*bold* text\n• a\n• b');
});
