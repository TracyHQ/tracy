/**
 * H11 — the write fence over the proxy's request lifecycle (K1, #561). While a deleted site's
 * session folder is checked one last time and moved, every request that can change dsh's state
 * waits; one that reaches into that site is refused with 409 and never reaches dsh — the master's
 * included; every other one goes on. A request admitted before the fence is waited for until dsh
 * answered it, even when its client left; one whose body never arrived whole ends at once.
 * The archive door that raises the fence is H7 (another phase): here the test raises it directly
 * on the gateway's own fence (`writeFenceFor`).
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { startHarness, rpcAnswer, type Harness, type Person } from './gateway-harness.js';
import { writeFenceFor } from '../../src/tracy/proxy-hooks.js';
import type { WriteFence } from '../../src/tracy/write-fence.js';

let h: Harness;
let seat: Person;
let master: Person;
let fence: WriteFence;
let createDelayMs = 0;

const scope = () => ({ path: '/site/gone', sessionIds: new Set(['sess-gone']) });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Requests that reached the fence while it was up, since the harness started. */
let held = 0;

/**
 * Keep the fence up until `count` more requests are waiting behind it (or `deadlineMs` passed).
 * A fixed hold raced the runner: on a loaded CI machine a request sent while the fence was up could
 * reach the gateway only after it came down, and was then (rightly) let through (25/10/2026).
 */
async function untilHeld(from: number, count: number, deadlineMs = 5000): Promise<void> {
  const end = Date.now() + deadlineMs;
  while (held - from < count && Date.now() < end) await sleep(5);
  assert.ok(held - from >= count, `only ${String(held - from)} of ${String(count)} requests reached the fence while it was up`);
}

before(async () => {
  h = await startHarness((seen) => {
    if (/^\/api\/session[./]create/.test(seen.url)) return { ...rpcAnswer({ sessionId: 'made' }), delayMs: createDelayMs };
    return rpcAnswer({ accepted: true });
  });
  seat = h.seat('fenced', { folders: ['/site/gone', '/site/kept'], allowWorkspaceCreate: true });
  master = h.master('root');
  fence = writeFenceFor(h.db);
  // Count every request that reached the fence while it was up: the gateway looks the fence up per
  // request (`writeFenceFor`), so wrapping this instance sees each admit.
  const admit = fence.admit.bind(fence);
  fence.admit = () => {
    if (fence.raised) held += 1;
    return admit();
  };
});

after(async () => { await h.close(); });

/** Raise the fence, run `during` while it is up, and lower it once `count` requests wait behind it. */
async function withFence(count: number, during: () => Promise<unknown>): Promise<unknown> {
  let result: Promise<unknown> = Promise.resolve();
  await fence.run(10_000, scope(), async () => {
    const from = held;
    result = during();
    await untilHeld(from, count);
  });
  return result;
}

const createAt = (cwd: string, who: Person) => h.send('POST', '/api/session.create', who, JSON.stringify({ cwd }));

test('K1: a create held behind the fence that names the archived site is refused with 409 and never reaches dsh — the master too', async () => {
  const before = h.reached('/api/session.create');
  const replies = await withFence(2, () => Promise.all([createAt('/site/gone', seat), createAt('/site/gone/sub', master)])) as http.IncomingMessage[] & { status: number; body: string }[];
  for (const reply of replies) {
    assert.equal(reply.status, 409, reply.body);
    assert.equal(JSON.parse(reply.body).reason, 'SITE_ARCHIVED');
  }
  assert.equal(h.reached('/api/session.create'), before, 'a held request into the archived site reached dsh');
});

test('K1: a held request that names another site goes on once the fence comes down', async () => {
  const before = h.reached('/api/session.create');
  let answeredAt = 0;
  let pending: Promise<{ status: number; body: string }> | undefined;
  await fence.run(10_000, scope(), async () => {
    const from = held;
    pending = createAt('/site/kept', master).then((res) => { answeredAt = Date.now(); return res; });
    await untilHeld(from, 1);
  });
  const loweredAt = Date.now();
  const done = await pending!;
  assert.equal(done.status, 200, done.body);
  assert.ok(answeredAt >= loweredAt, 'the request was answered while the fence was up');
  assert.equal(h.reached('/api/session.create'), before + 1);
});

test('K1: a held request the gate cannot read (not JSON) is refused, and a read is never held', async () => {
  const replies = await withFence(1, async () => {
    const text = await h.send('POST', '/api/session.create', master, 'cwd=/site/kept', { 'content-type': 'text/plain' });
    const read = await h.send('GET', '/api/whatever', master);
    return [text, read];
  }) as { status: number }[];
  assert.equal(replies[0]!.status, 409);
  assert.equal(replies[1]!.status, 200, 'a GET waited behind the fence');
});

test('K1: the work waits for a write admitted before the fence until dsh answered it, even after its client left', async () => {
  createDelayMs = 300;
  try {
    const order: string[] = [];
    const client = http.request({
      host: '127.0.0.1', port: h.port, path: '/api/session.create', method: 'POST',
      headers: { cookie: master.cookie, origin: `http://127.0.0.1:${h.port}`, 'content-type': 'application/json' },
    });
    client.on('error', () => undefined);
    client.end(JSON.stringify({ cwd: '/site/kept' }));
    await sleep(80);
    client.destroy();
    assert.equal(fence.inFlight, 1, 'the write is still counted after its client left');
    await fence.run(2000, scope(), async () => { order.push(`work at ${String(fence.inFlight)} in flight`); });
    assert.deepEqual(order, ['work at 0 in flight']);
    assert.equal(fence.unknown, 0);
  } finally {
    createDelayMs = 0;
  }
});

test('K1: a request whose client left before its body arrived whole is released at once, with no doubt', async () => {
  const client = http.request({
    host: '127.0.0.1', port: h.port, path: '/api/session.create', method: 'POST',
    headers: { cookie: master.cookie, origin: `http://127.0.0.1:${h.port}`, 'content-type': 'application/json', 'content-length': '200' },
  });
  client.on('error', () => undefined);
  client.write('{"cwd":');
  await sleep(80);
  assert.equal(fence.inFlight, 1, 'the request was not admitted through the fence');
  client.destroy();
  await sleep(80);
  assert.equal(fence.inFlight, 0, 'an aborted request is still counted');
  assert.equal(fence.unknown, 0, 'an aborted request left doubt');
  await fence.run(500, scope(), async () => undefined);
});

test('K1 order: the fence admits a write before H1/H2 judge it, so even a refusal waits for the fence', async () => {
  let answeredAt = 0;
  let pending: Promise<{ status: number }> | undefined;
  await fence.run(10_000, scope(), async () => {
    const from = held;
    pending = h.send('POST', '/api/session.cancel', seat, JSON.stringify({ sessionId: 'sess-elsewhere' })).then((res) => { answeredAt = Date.now(); return res; });
    await untilHeld(from, 1);
  });
  const loweredAt = Date.now();
  const before = h.reached('/api/session.cancel');
  assert.equal((await pending!).status, 403, 'H2 still refuses the session it does not hold');
  assert.ok(answeredAt >= loweredAt, 'the refusal was answered while the fence was up');
  assert.equal(h.reached('/api/session.cancel'), before);
});
