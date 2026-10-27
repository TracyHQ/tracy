// H3's adapter in isolation: whatever the proxy writes for a held answer (head, chunks, pipe,
// Express send) reaches the client only after the filter decided, and an answer too large or not
// JSON reaches it as a 502 with none of its bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';

import { holdAnswer, type AnswerFilterResult } from '../../src/tracy/answer-shim.js';

async function serve(write: (res: http.ServerResponse) => void, filter: (value: unknown) => AnswerFilterResult, maxBytes = 1024): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  const server = http.createServer((_req, res) => {
    holdAnswer(res, maxBytes, filter);
    write(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    return await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
      }).on('error', reject);
    });
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

const keepMine = (value: unknown): AnswerFilterResult => ({ kind: 'answer', value: { kept: (value as { items: string[] }).items.filter((x) => x === 'mine') } });

test('H3: an answer written in pieces is filtered whole before the first byte leaves', async () => {
  const out = await serve((res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '999' });
    res.write('{"items":["mine",');
    res.end('"FOREIGN"]}');
  }, keepMine);
  assert.equal(out.status, 200);
  assert.deepEqual(JSON.parse(out.body), { kept: ['mine'] });
  assert.equal(out.headers['content-length'], String(Buffer.byteLength(out.body)));
});

test('H3: a gzip answer is decoded, filtered and sent plain', async () => {
  const out = await serve((res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
    res.end(zlib.gzipSync('{"items":["FOREIGN","mine"]}'));
  }, keepMine);
  assert.deepEqual(JSON.parse(out.body), { kept: ['mine'] });
  assert.equal(out.headers['content-encoding'], undefined);
});

test('H3: an answer past the parse limit is a 502 with none of its bytes', async () => {
  const out = await serve((res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write(`{"items":["${'FOREIGN'.repeat(100)}",`);
    res.write(`"${'FOREIGN'.repeat(100)}",`);
    res.end('"mine"]}');
  }, keepMine, 1000);
  assert.equal(out.status, 502);
  assert.ok(!out.body.includes('FOREIGN'), out.body);
});

test('H3: a 2xx answer that is not JSON, or that the filter refuses, carries none of its bytes', async () => {
  const notJson = await serve((res) => { res.writeHead(200); res.end('FOREIGN plain text'); }, keepMine);
  assert.equal(notJson.status, 502);
  assert.ok(!notJson.body.includes('FOREIGN'));
  const refused = await serve((res) => { res.writeHead(200); res.end('{"items":["FOREIGN"]}'); }, () => ({ kind: 'deny', status: 403, reason: 'Taken back' }));
  assert.equal(refused.status, 403);
  assert.ok(!refused.body.includes('FOREIGN'));
});

test('H3: a refusal the gateway wrote itself (Express-style send) passes as it is', async () => {
  const out = await serve((res) => {
    res.statusCode = 403;
    res.setHeader('content-type', 'text/html');
    res.end('<p>403</p>');
  }, () => { throw new Error('the filter must not run on a refusal'); });
  assert.equal(out.status, 403);
  assert.equal(out.body, '<p>403</p>');
});
