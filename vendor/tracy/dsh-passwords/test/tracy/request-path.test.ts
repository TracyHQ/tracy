// Phase 2b, request path: the seat route table finished in the proxy (H1 → proxy pre-check), the
// body and query gate (H2), headers fixed before the upstream request exists (H13). Every refusal
// asserts both halves of rule 4: the fake dsh received no request, and the client got no byte of
// what it asked for.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, workspaceList, type Harness, type Person } from './gateway-harness.js';

const SITE = '/site/alpha';
let h: Harness;
let writer: Person;
let reader: Person;

before(async () => {
  h = await startHarness();
  writer = h.seat('writer', { allowUpload: true, sessions: ['sess-writer'] });
  reader = h.seat('reader', { allowUpload: false, sessions: ['sess-reader'] });
  h.setDsh((seen) => {
    if (/^\/api\/workspace[./]list/.test(seen.url)) {
      return workspaceList([{ workspaceId: 'ws-alpha', path: SITE, sessionIds: ['sess-writer', 'sess-reader', 'sess-owner'] }]);
    }
    return { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, path: seen.url, secret: 'DSH-BYTES' }) };
  });
  for (const who of [writer, reader]) assert.equal((await h.send('POST', '/api/workspace.list', who, '{}')).status, 200);
});

after(async () => { await h.close(); });

const count = (p: string): number => h.reached(p);

test('R2: a Files write route reaches dsh for a seat with allow_upload, on a session it holds', async () => {
  const before = count('/sidebar/api/fs.write');
  const res = await h.send('POST', '/sidebar/api/fs.write', writer, JSON.stringify({ sessionId: 'sess-writer', path: 'a.txt', content: 'x' }));
  assert.equal(res.status, 200, res.body);
  assert.equal(count('/sidebar/api/fs.write'), before + 1);
});

test('R2: without allow_upload, or on a session it does not hold, a write never reaches dsh', async () => {
  const before = count('/sidebar/api/fs.write');
  const denied = await h.send('POST', '/sidebar/api/fs.write', reader, JSON.stringify({ sessionId: 'sess-reader', path: 'a.txt', content: 'x' }));
  assert.equal(denied.status, 403);
  assert.ok(!denied.body.includes('DSH-BYTES'));
  const foreign = await h.send('POST', '/sidebar/api/fs.write', writer, JSON.stringify({ sessionId: 'sess-owner', path: 'a.txt', content: 'x' }));
  assert.equal(foreign.status, 403);
  assert.equal(count('/sidebar/api/fs.write'), before);
});

test('R3: /sidebar/file, /sidebar/archive (query) and /sidebar/html/<sid>/… (path) open on a held session only', async () => {
  for (const url of ['/sidebar/file?sessionId=sess-reader&path=a.txt', '/sidebar/archive?sessionId=sess-reader', '/sidebar/html/sess-reader/index.html']) {
    const res = await h.send('GET', url, reader);
    assert.equal(res.status, 200, `${url}: ${res.body}`);
  }
  const before = h.seen.length;
  for (const url of [
    '/sidebar/file?sessionId=sess-owner&path=a.txt',
    '/sidebar/file?sessionId=sess-reader&sessionId=sess-owner&path=a.txt',
    '/sidebar/file?path=a.txt',
    '/sidebar/archive?sessionId=sess-owner',
    '/sidebar/html/sess-owner/index.html',
    '/sidebar/html/sess-reader',
  ]) {
    const res = await h.send('GET', url, reader);
    assert.equal(res.status, 403, url);
    assert.ok(!res.body.includes('DSH-BYTES'), url);
  }
  assert.equal(h.seen.length, before, 'a refused GET reached dsh');
});

test('R7/R8: settings.get and the lazy chunks need no session; settings.update and odd chunk names stay owner-only', async () => {
  assert.equal((await h.send('POST', '/sidebar/api/settings.get', reader, '{}')).status, 200);
  assert.equal((await h.send('GET', '/sidebar/bundle/editor-3f2a.js', reader)).status, 200);
  const before = h.seen.length;
  for (const [method, url] of [['POST', '/sidebar/api/settings.update'], ['GET', '/sidebar/bundle/editor.js.map'], ['GET', '/sidebar/bundle/../x.js']] as const) {
    assert.equal((await h.send(method, url, reader, method === 'POST' ? '{}' : undefined)).status, 403, url);
  }
  assert.equal(h.seen.length, before);
});

test('R9: /api/tracy-site-tools/held answers about a held session only, and needs one', async () => {
  assert.equal((await h.send('POST', '/api/tracy-site-tools/held', reader, JSON.stringify({ sessionId: 'sess-reader' }))).status, 200);
  const before = h.reached('/api/tracy-site-tools/held');
  for (const body of [{ sessionId: 'sess-owner' }, {}, { sessionId: 'sess-reader', also: { agentId: 'sess-owner' } }]) {
    const res = await h.send('POST', '/api/tracy-site-tools/held', reader, JSON.stringify(body));
    assert.equal(res.status, 403, JSON.stringify(body));
  }
  assert.equal(h.reached('/api/tracy-site-tools/held'), before);
});

test('R10: dsh /api/file reads only inside the folder of a session the seat holds', async () => {
  const before = h.reached('/api/file');
  for (const target of ['/etc/passwd', '/site', '/site/alphabet/x', '/site/alpha/../beta/x', 'relative/x']) {
    const res = await h.send('GET', `/api/file?path=${encodeURIComponent(target)}`, reader);
    assert.equal(res.status, 403, target);
    assert.ok(!res.body.includes('DSH-BYTES'));
  }
  assert.equal((await h.send('GET', `/api/file?path=${encodeURIComponent(`${SITE}/a.txt`)}&path=/etc/passwd`, reader)).status, 403);
  assert.equal(h.reached('/api/file'), before, 'a refused file read reached dsh');
  assert.equal((await h.send('GET', `/api/file?path=${encodeURIComponent(`${SITE}/a.txt`)}`, reader)).status, 200);
});

test('Q2: a JSON body the gate cannot parse, or a write in another media type, never reaches dsh', async () => {
  const before = h.seen.length;
  assert.equal((await h.send('POST', '/api/session/cancel', reader, '{"request":')).status, 403);
  // A plugin's door upstream knows nothing about: upstream forwards it whatever its media type.
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
    const res = await h.send('POST', '/api/plugin-x/write', reader, 'sessionId=sess-owner', { 'content-type': type });
    assert.equal(res.status, 403, type);
  }
  assert.equal((await h.send('POST', '/api/plugin-x/write', reader, JSON.stringify({ note: { sessionId: 'sess-owner' } }))).status, 403);
  assert.equal(h.seen.length, before, 'a body the gate could not read reached dsh');
  // A JSON media type with parameters is still JSON.
  const own = await h.send('POST', '/api/session/cancel', reader, JSON.stringify({ request: { sessionId: 'sess-reader' } }), { 'content-type': 'Application/JSON; charset=utf-8' });
  assert.equal(own.status, 200, own.body);
});

test('Q3: any session a seat names in the query of any API door must be held, and named once', async () => {
  const before = h.seen.length;
  // A plugin door a seat may reach at all (R12, `SEAT_PLUGIN_ROUTES`): an unlisted one is refused before this check.
  const door = '/api/tracy-design-inspiration/catalog';
  for (const url of [`${door}?agentId=sess-owner`, `${door}?workspaceFileScopeId=sess-owner`, `${door}?sessionId=sess-reader&sessionId=sess-reader`]) {
    assert.equal((await h.send('GET', url, reader)).status, 403, url);
  }
  assert.equal(h.seen.length, before);
  assert.equal((await h.send('GET', `${door}?sessionId=sess-reader`, reader)).status, 200);
});

test('H1: a seat writing to a route outside /api and /sidebar is refused before dsh (upstream forwards it)', async () => {
  const before = h.seen.length;
  for (const [method, url] of [['POST', '/some-plugin/route'], ['PUT', '/x'], ['DELETE', '/plugins/p/state'], ['PATCH', '/']] as const) {
    const res = await h.send(method, url, reader, '{}');
    assert.equal(res.status, 403, `${method} ${url}`);
    assert.ok(!res.body.includes('DSH-BYTES'));
  }
  assert.equal(h.seen.length, before, 'an unknown route reached dsh');
  // Reads of the app shell and plugin code stay open, as upstream serves them.
  assert.equal((await h.send('GET', '/plugins/p/client.js', reader)).status, 200);
});
