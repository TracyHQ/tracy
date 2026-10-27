/**
 * V1 — a seat's HTTP request still waiting on dsh is one of the connections its revocation ends.
 * Upstream 2.7.7 keeps one per-account set of live connections (`registerUserWebSocketClient`):
 * the events WebSockets, SSE, raw piped sockets. Every seat request joins it for its lifetime, so
 * taking the seat back, changing its access, banning it or moving its credential version (all of
 * which call `closeUserWebSocketClients`) also ends what it is still waiting for: the client gets
 * no byte of dsh's later answer. Another account's request waiting at the same time is untouched.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { startHarness, rpcAnswer, type Harness, type Person } from './gateway-harness.js';
import { writeFenceFor } from '../../src/tracy/proxy-hooks.js';

let h: Harness;
let seat: Person;
let other: Person;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  h = await startHarness((seen) => {
    if (!/^\/api\/session[./]create/.test(seen.url)) return undefined;
    // dsh makes the session the gateway named (upstream checks the identity), after a while.
    const sessionId = (JSON.parse(seen.body) as { payload: { args: { request: { sessionId: string } } } }).payload.args.request.sessionId;
    return { ...rpcAnswer({ sessionId, title: 'LATE-ANSWER' }), delayMs: 400 };
  });
  seat = h.seat('revoked-seat', { folders: ['/site/alpha'] });
  other = h.seat('other-seat', { folders: ['/site/beta'] });
});

after(async () => { await h.close(); });

/** A request whose every received byte and its end are recorded; never rejects. */
function pending(who: Person, cwd: string) {
  const bytes: Buffer[] = [];
  let status = 0;
  const ended = new Promise<'answered' | 'cut'>((resolve) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'r', method: 'session/create', payload: { args: { request: { cwd } } } });
    const req = http.request({
      host: '127.0.0.1', port: h.port, path: '/api/session/create', method: 'POST',
      headers: { cookie: who.cookie, origin: `http://127.0.0.1:${h.port}`, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
    }, (res) => {
      status = res.statusCode ?? 0;
      res.on('data', (chunk: Buffer) => bytes.push(chunk));
      res.on('end', () => resolve('answered'));
      res.on('error', () => resolve('cut'));
      res.on('aborted', () => resolve('cut'));
    });
    req.on('error', () => resolve('cut'));
    req.end(body);
  });
  return { ended, bytes: () => Buffer.concat(bytes).toString('utf8'), status: () => status };
}

/** Upstream's own door for "this account's credentials changed" (the dsh plugin calls it). */
function invalidate(userId: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ userId });
    const req = http.request({
      host: '127.0.0.1', port: h.port, method: 'POST', path: '/gateway/internal/session-invalidate',
      headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), 'x-internal-secret': 'internal' },
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); });
    req.on('error', reject);
    req.end(body);
  });
}

test('V1: a seat request waiting on dsh is cut when the seat is revoked, with no byte of the late answer; another seat\'s goes on', async () => {
  const reachedBefore = h.reached('/api/session/create');
  const mine = pending(seat, '/site/alpha');
  const theirs = pending(other, '/site/beta');
  // Wait for the two requests to arrive rather than for a fixed time: how long the gateway takes to
  // pass a first request on is the machine's business, and dsh answers 400 ms after each arrives.
  for (let waited = 0; waited < 5000 && h.reached('/api/session/create') < reachedBefore + 2; waited += 10) await sleep(10);
  assert.equal(h.reached('/api/session/create'), reachedBefore + 2, 'both requests are waiting at dsh');
  assert.equal(await invalidate(seat.userId), 200);
  assert.equal(await mine.ended, 'cut');
  assert.equal(mine.bytes(), '', 'the revoked seat got bytes after its revocation');
  assert.equal(await theirs.ended, 'answered');
  assert.equal(theirs.status(), 200, theirs.bytes());
  assert.match(theirs.bytes(), /"sessionId":"session-/, 'the other seat\'s answer did not arrive whole');
});

test('V1: a seat write held at the write fence when the seat is revoked is cut and never reaches dsh', async () => {
  const reachedBefore = h.reached('/api/session/create');
  let held: ReturnType<typeof pending> | undefined;
  await writeFenceFor(h.db).run(2000, { path: '/site/elsewhere', sessionIds: new Set<string>() }, async () => {
    held = pending(seat, '/site/alpha');
    await sleep(100);
    assert.equal(await invalidate(seat.userId), 200);
    // Bounded: an uncut request waits for this very fence, so it would never end on its own.
    const outcome = await Promise.race([held.ended, sleep(500).then(() => 'still held' as const)]);
    assert.equal(outcome, 'cut');
  });
  await sleep(100);
  assert.equal(held!.bytes(), '');
  assert.equal(h.reached('/api/session/create'), reachedBefore, 'the held write reached dsh after its seat was revoked');
});
