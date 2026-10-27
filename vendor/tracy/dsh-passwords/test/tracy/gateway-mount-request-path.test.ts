/**
 * The HTTP request path under a mount (K5 × H1/H2/H8, items 8–9 of the phase 2 fix list). A lane
 * published at `/<prefix>/…` must judge a seat's request exactly as at the root: every path rule
 * reads the mount-relative path, and dsh still receives the prefix on the path plus the header.
 * Before, the proxy classified the prefixed path, so a seat's `/api/events.host` skipped the SSE
 * filter and the gateway's own `/api/dsh-passwords/*` lost its cookie. And a seat's session doors
 * over HTTP read the grant book by the Tracy origin rule (Q1): an editor's `legacy` row opens nothing.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { muxWithBaseline, startFixture, type Fixture } from './stream-harness.js';
import { startHarness, rpcAnswer, workspaceList, type Harness } from './gateway-harness.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';

const MOUNT = '/site.example';
const sseFrame = (payload: Record<string, unknown>): string => `data: ${JSON.stringify({ payload })}\n\n`;

let fx: Fixture;
let h: Harness;

before(async () => {
  fx = await startFixture();
  h = await startHarness((seen) => {
    const url = seen.url.startsWith(`${MOUNT}/`) ? seen.url.slice(MOUNT.length) : seen.url;
    if (/^\/api\/workspace[./]list/.test(url)) return workspaceList([{ workspaceId: 'ws-alpha', path: '/site/alpha', sessionIds: ['sess-legacy', 'sess-made'] }]);
    if (/^\/api\/session[./]page/.test(url)) return rpcAnswer({ records: [{ text: 'PAGE-BYTES' }], hasMore: false });
    return undefined;
  });
});
after(async () => { await fx.close(); await h.close(); });

function readSse(path: string, cookie: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: fx.port, method: 'GET', path,
      headers: { cookie, accept: 'text/event-stream', 'x-forwarded-prefix': MOUNT } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('K5/H8: a seat\'s host events under a mount pass the same filter as at the root; dsh still gets the prefix', async () => {
  const seat = fx.createSeat('mounted-sse', { grants: ['sess-mine'], disabled: [] });
  const baseline = await muxWithBaseline(fx, seat.cookie);
  try {
    fx.sse.host = [
      sseFrame({ type: 'host/session-status', sessionId: 'sess-beta', status: 'FOREIGN-STATUS' }),
      sseFrame({ type: 'host/session-status', sessionId: 'sess-mine', status: 'idle' }),
    ];
    const res = await readSse(`${MOUNT}/api/events.host`, seat.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.includes('FOREIGN-STATUS') || res.body.includes('sess-beta'), false, 'another customer\'s event reached the seat');
    assert.match(res.body, /"sessionId":"sess-mine"/);
    assert.ok(fx.httpSaw.includes(`${MOUNT}/api/events.host`), 'dsh lost the prefix');
  } finally { await baseline.close(); }
});

const mounted = (path: string) => `${MOUNT}${path}`;
const rpcBody = (method: string, request: Record<string, unknown>) =>
  JSON.stringify({ type: 'client-request', rpcId: `rpc-${method}`, method, payload: { args: { request } } });

test('K5: the gateway\'s own /api/dsh-passwords/* under a mount keeps its session cookie; dsh routes lose it', async () => {
  const master = h.master('mounted-master');
  const before = h.seen.length;
  assert.equal((await h.send('GET', mounted('/api/dsh-passwords/whoami'), master, undefined, { 'x-forwarded-prefix': MOUNT })).status, 200);
  assert.equal((await h.send('GET', mounted('/api/whatever'), master, undefined, { 'x-forwarded-prefix': MOUNT })).status, 200);
  const [own, other] = h.seen.slice(before);
  assert.equal(own!.url, mounted('/api/dsh-passwords/whoami'));
  assert.match(String(own!.headers.cookie ?? ''), /dsh_gateway_token=/, 'the gateway plugin route lost its JWT');
  assert.doesNotMatch(String(other!.headers.cookie ?? ''), /dsh_gateway_token=/, 'a dsh route received the gateway JWT');
});

test('Q1 over HTTP, under a mount: an editor\'s legacy grant opens no session door (0 requests to dsh); its created one and an owner\'s legacy one do', async () => {
  const store = tracyStoreOf(h.db)!;
  const editor = h.seat('mounted-editor', { role: 'editor' });
  const owner = h.seat('mounted-owner', { role: 'owner' });
  // Upstream's own writer leaves the row with no origin: `legacy`.
  for (const who of [editor, owner]) h.db.addUserSessionGrant(who.userId, 'sess-legacy');
  assert.ok(store.recordCreatedSession(editor.userId, 'sess-made'));
  const page = (who: typeof editor, sessionId: string) => h.send('POST', mounted('/api/session/page'), who,
    rpcBody('session/page', { address: { kind: 'session', sessionId }, throughSeq: 10 }), { 'x-forwarded-prefix': MOUNT });
  for (const who of [editor, owner]) {
    assert.equal((await h.send('POST', mounted('/api/workspace.list'), who, '{}', { 'x-forwarded-prefix': MOUNT })).status, 200);
  }
  const pages = () => h.seen.filter((row) => /\/api\/session[./]page/.test(row.url)).length;
  const before = pages();
  const refused = await page(editor, 'sess-legacy');
  assert.equal(refused.status, 403, refused.body);
  assert.doesNotMatch(refused.body, /PAGE-BYTES/);
  assert.equal(pages(), before, 'the legacy page request reached dsh');
  assert.equal((await page(editor, 'sess-made')).status, 200, 'the editor\'s own session');
  assert.equal((await page(owner, 'sess-legacy')).status, 200, 'an owner seat keeps its legacy rows');
  assert.equal(pages(), before + 2);
});
