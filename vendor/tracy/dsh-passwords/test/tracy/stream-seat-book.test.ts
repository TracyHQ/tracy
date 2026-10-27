// The seat's own record on its streams, through a real gateway: the address the seat door proved
// (Q10: a seat sees its own `prompter.email`, never another person's) and the grant book's origin
// rule (Q1: an editor seat is held to the conversations it started and the master's explicit
// grants, never to a `legacy` row) on every stream door — the mux (H4/H5), the SSE and
// WebSocket event channels (H8) and the sidebar sockets (H6).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  assertDshRefusal, delay, gatewayRequest, muxWithBaseline, sawFor, startFixture, WebSocket, type Fixture, type MuxClient,
} from './stream-harness.js';

const OWN = 'me@seat.test';
const OTHER = 'someone.else@example.com';

let fx: Fixture;
/** An editor seat whose grant on sess-mine is its own create (`created`), with a proven address. */
let mine: { id: number; cookie: string };
/** An editor seat whose grant on sess-mine is a pre-origin `legacy` row. */
let legacy: { id: number; cookie: string };
/** An owner seat with the same `legacy` row: owners keep their pre-origin history. */
let owner: { id: number; cookie: string };
const baselines: MuxClient[] = [];

before(async () => {
  fx = await startFixture();
  // Order matters: a `created` grant is refused once another account holds the session.
  mine = fx.createSeat('book-created', { seatRole: 'editor', email: OWN, grants: [], created: ['sess-mine'], disabled: [] });
  legacy = fx.createSeat('book-legacy', { seatRole: 'editor', grantOrigin: 'legacy', grants: ['sess-mine'], disabled: [] });
  owner = fx.createSeat('book-owner', { seatRole: 'owner', grantOrigin: 'legacy', grants: ['sess-mine'], disabled: [] });
  // Upstream's event filters need each seat's workspace snapshot; keep a carrier open per seat.
  for (const seat of [mine, legacy, owner]) baselines.push(await muxWithBaseline(fx, seat.cookie));
});
after(async () => {
  for (const mux of baselines) await mux.close();
  await fx.close();
});

const follow = (mux: MuxClient, streamId: string, sessionId: string): void =>
  mux.open(streamId, 'session/follow', { request: { address: { kind: 'session', sessionId } } });

test('Q10: on the mux a seat keeps its own prompter address and loses everyone else\'s', async () => {
  fx.scripts['session/follow'] = (frame, send) => send({
    type: 'snapshot', header: { id: frame.payload.args.request.address.sessionId, origin: 'user' },
    records: [
      { role: 'user', prompter: { user: 'me', email: OWN }, text: 'mine' },
      { role: 'user', prompter: { user: 'other', email: OTHER }, text: 'theirs' },
    ],
  });
  const mux = await muxWithBaseline(fx, mine.cookie);
  try {
    follow(mux, 'sf', 'sess-mine');
    const snapshot = (await mux.waitFor('snapshot', (f) => f.streamId === 'sf' && f.value?.type === 'snapshot')).value;
    assert.deepEqual(snapshot.records.map((r: any) => r.prompter), [{ user: 'me', email: OWN }, { user: 'other', email: null }]);
    assert.equal(mux.raw.join('').includes(OTHER), false);
  } finally { delete fx.scripts['session/follow']; await mux.close(); }
});

function readSse(path: string, cookie: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: fx.port, method: 'GET', path, headers: { cookie, accept: 'text/event-stream' } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}
const sseFrame = (payload: Record<string, unknown>): string => `data: ${JSON.stringify({ payload })}\n\n`;
const sseEvents = (body: string): Array<Record<string, any>> =>
  body.split('\n\n').filter((frame) => frame.startsWith('data:')).map((frame) => JSON.parse(frame.slice(5)).payload);
const promptedEvent = (sessionId: string): Record<string, unknown> => ({
  type: 'session/event', sessionId,
  event: { records: [{ prompter: { user: 'me', email: OWN } }, { prompter: { user: 'other', email: OTHER } }] },
});

test('Q10: on the SSE event channel a seat keeps its own prompter address and loses everyone else\'s', async () => {
  fx.sse.mux = [sseFrame(promptedEvent('sess-mine'))];
  const res = await readSse('/api/events.mux', mine.cookie);
  assert.equal(res.status, 200);
  const [event] = sseEvents(res.body);
  assert.deepEqual(event?.event.records.map((r: any) => r.prompter.email), [OWN, null]);
  assert.equal(res.body.includes(OTHER), false);
});

/** The messages a seat gets on the downlink-only WebSocket event channel within `ms`. */
function readEventsWs(path: string, cookie: string, ms = 150): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${fx.port}${path}`, { headers: { cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' } });
    const got: string[] = [];
    ws.on('message', (data: Buffer) => got.push(data.toString()));
    ws.once('error', reject);
    ws.once('open', () => setTimeout(() => { ws.close(); resolve(got); }, ms));
  });
}
const wsEvent = (payload: Record<string, unknown>): string =>
  JSON.stringify({ type: 'server-request', rpcId: `r-${String(payload.type)}`, method: payload.type, payload });

test('Q10: on the WebSocket event channel a seat keeps its own prompter address and loses everyone else\'s', async () => {
  fx.wsEvents.mux = [wsEvent(promptedEvent('sess-mine'))];
  const got = await readEventsWs('/api/events.mux', mine.cookie);
  assert.equal(got.length, 1, JSON.stringify(got));
  assert.deepEqual(JSON.parse(got[0]!).payload.event.records.map((r: any) => r.prompter.email), [OWN, null]);
  assert.equal(got.join('').includes(OTHER), false);
});

test('Q1: a `legacy` grant opens no session stream for an editor seat; dsh sees no open', async () => {
  const mux = await muxWithBaseline(fx, legacy.cookie);
  try {
    const from = fx.muxSaw.length;
    follow(mux, 'sf', 'sess-mine');
    mux.open('jobs', 'job/list', { request: { sessionId: 'sess-mine' } });
    assertDshRefusal(await mux.waitFor('follow refusal', (f) => f.streamId === 'sf' && f.type === 'error'), 'sf');
    assertDshRefusal(await mux.waitFor('jobs refusal', (f) => f.streamId === 'jobs' && f.type === 'error'), 'jobs');
    await delay(30);
    assert.deepEqual([...sawFor(fx, 'sf', from), ...sawFor(fx, 'jobs', from)], [], '0 open frames reached dsh');
  } finally { await mux.close(); }
});

test('Q1: the same session stream opens for the seat that created it and for an owner seat\'s `legacy` row', async () => {
  for (const seat of [mine, owner]) {
    const mux = await muxWithBaseline(fx, seat.cookie);
    try {
      follow(mux, 'sf', 'sess-mine');
      await mux.waitFor('snapshot', (f) => f.streamId === 'sf' && f.value?.type === 'snapshot');
    } finally { await mux.close(); }
  }
});

test('Q1: an editor seat\'s workspace baseline does not name the session its `legacy` row points at', async () => {
  const mux = await muxWithBaseline(fx, legacy.cookie);
  try {
    const baseline = (await mux.waitFor('baseline', (f) => f.streamId === 'wf' && f.value?.type === 'baseline')).value;
    assert.deepEqual(baseline.value.items.flatMap((item: any) => item.sessionIds), []);
    assert.equal(mux.raw.join('').includes('sess-mine'), false);
  } finally { await mux.close(); }
});

test('Q1: later archived and pinned frames do not name it either; the creator\'s do', async () => {
  fx.scripts['workspace/follow'] = (_frame, send) => {
    send({ type: 'baseline', value: { items: [{ workspaceId: 'w-alpha', path: '/work/alpha', title: 'alpha', sessionIds: ['sess-mine'] }], archivedSessionIds: [] } });
    send({ type: 'archived', archivedSessionIds: ['sess-mine'] });
    send({ type: 'pinned', pinnedSessionIds: ['sess-mine'] });
  };
  try {
    for (const [seat, expected] of [[legacy, []], [mine, ['sess-mine']]] as const) {
      const mux = await muxWithBaseline(fx, seat.cookie);
      try {
        const pinned = (await mux.waitFor('pinned', (f) => f.streamId === 'wf' && f.value?.type === 'pinned')).value;
        const archived = (await mux.waitFor('archived', (f) => f.streamId === 'wf' && f.value?.type === 'archived')).value;
        assert.deepEqual([archived.archivedSessionIds, pinned.pinnedSessionIds], [expected, expected]);
        if (expected.length === 0) assert.equal(mux.raw.join('').includes('sess-mine'), false);
      } finally { await mux.close(); }
    }
  } finally { delete fx.scripts['workspace/follow']; }
});

test('Q1: a `legacy` grant passes no event of that session to an editor seat, on SSE or WebSocket', async () => {
  fx.sse.mux = [sseFrame(promptedEvent('sess-mine'))];
  fx.wsEvents.mux = [wsEvent(promptedEvent('sess-mine'))];
  assert.deepEqual(sseEvents((await readSse('/api/events.mux', legacy.cookie)).body), []);
  assert.deepEqual(await readEventsWs('/api/events.mux', legacy.cookie), []);
  // The owner seat gets the event; both addresses are someone else's to it.
  const [event] = sseEvents((await readSse('/api/events.mux', owner.cookie)).body);
  assert.deepEqual(event?.event.records.map((r: any) => r.prompter.email), [null, null]);
});

/** Open an upgrade through the gateway; the status, and the socket when accepted (closed here). */
function upgrade(url: string, cookie: string, extra: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: fx.port, path: url,
      headers: {
        connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        cookie, origin: 'http://127.0.0.1', host: '127.0.0.1', ...extra,
      },
    });
    req.once('upgrade', (res, socket) => { socket.on('error', () => {}); socket.destroy(); resolve(res.statusCode ?? 0); });
    req.once('response', (res) => { res.resume(); res.once('end', () => resolve(res.statusCode ?? 0)); });
    req.once('error', reject);
    req.end();
  });
}

test('Q1: a `legacy` grant opens no sidebar socket for an editor seat; its own create does', async () => {
  fx.upgradesSaw.length = 0;
  assert.equal(await upgrade('/sidebar/ws/fs-watch?sessionId=sess-mine', legacy.cookie), 403);
  assert.deepEqual(fx.upgradesSaw, []);
  assert.equal(await upgrade('/sidebar/ws/fs-watch?sessionId=sess-mine', mine.cookie), 101);
  assert.deepEqual(fx.upgradesSaw, ['/sidebar/ws/fs-watch?sessionId=sess-mine']);
});

test('Q1: host events list no session an editor seat holds only by a `legacy` row; the creator\'s lists keep it', async () => {
  fx.sse.host = [
    sseFrame({ type: 'host/workspace-changed', workspace: { workspaceId: 'w-alpha', path: '/work/alpha', sessionIds: ['sess-mine'] } }),
    sseFrame({ type: 'host/archived-sessions-changed', archivedSessionIds: ['sess-mine'] }),
  ];
  const lists = async (cookie: string): Promise<unknown[]> =>
    sseEvents((await readSse('/api/events.host', cookie)).body).map((e) => e.workspace?.sessionIds ?? e.archivedSessionIds);
  assert.deepEqual(await lists(legacy.cookie), [[], []]);
  assert.equal((await readSse('/api/events.host', legacy.cookie)).body.includes('sess-mine'), false);
  assert.deepEqual(await lists(mine.cookie), [['sess-mine'], ['sess-mine']]);
});

// ── H15, the eighth listing door: the upsert the gateway itself sends after a seat's workspace.create ──

test('S1: a workspace the seat resolves inside its folder is not upserted to its carrier as a workspace of its own', async () => {
  const creator = fx.createSeat('h15-creator', { folders: ['/work'], allowWorkspaceCreate: true, grants: [], disabled: [] });
  // The seat registered /work earlier, so a folder below it is one it may register (its own subtree).
  fx.db.addUserWorkspace(creator.id, '/work');
  fx.http['/api/workspace/create'] = (body, res) => {
    const asked = JSON.parse(body).payload.args.request.path as string;
    res.writeHead(200, { 'content-type': 'application/json' });
    // created:false — dsh resolved an existing workspace, so the gate registers nothing for the seat.
    res.end(JSON.stringify({ type: 'server-response', rpcId: 'r', result: { ok: true, value: {
      workspace: { workspaceId: `w-${asked.split('/').pop()}`, path: asked, title: asked, sessionIds: [] }, created: false,
    } } }));
  };
  const mux = await muxWithBaseline(fx, creator.cookie);
  const create = (path: string) => gatewayRequest(fx, 'POST', '/api/workspace/create', creator.cookie,
    JSON.stringify({ type: 'client-request', rpcId: 'r', method: 'workspace/create', payload: { args: { request: { path } } } }));
  const upserts = (): unknown[] => mux.frames.filter((f) => f.streamId === 'wf' && f.value?.type === 'upsert').map((f) => f.value.workspace.path);
  try {
    const first = await create('/work/gamma');
    assert.equal(first.status, 200, first.body);
    await delay(50);
    assert.deepEqual(upserts(), [], 'a folder inside the grant is workable, not listed');
    assert.equal((await create('/work')).status, 200);
    await mux.waitFor('upsert of the granted folder itself', (f) => f.streamId === 'wf' && f.value?.type === 'upsert');
    assert.deepEqual(upserts(), ['/work']);
  } finally { delete fx.http['/api/workspace/create']; await mux.close(); }
});

// ── H13 on the WebSocket side: the raw socket forward carries the gate's folders, never the client's ──

test('S12: a seat\'s sidebar socket reaches dsh with exactly its folders; a header the client sends is replaced', async () => {
  fx.upgradeHeadersSaw.length = 0;
  for (const name of ['x-dsh-allowed-folders', 'X-DSH-Allowed-Folders']) {
    assert.equal(await upgrade('/sidebar/ws/fs-watch?sessionId=sess-mine', mine.cookie, { [name]: JSON.stringify(['/work/beta']) }), 101);
  }
  assert.equal(fx.upgradeHeadersSaw.length, 2);
  for (const headers of fx.upgradeHeadersSaw) assert.deepEqual(JSON.parse(String(headers['x-dsh-allowed-folders'])), ['/work/alpha']);
});

test('S12: the master\'s socket carries no allowed-folders header, and one it sends is dropped', async () => {
  fx.upgradeHeadersSaw.length = 0;
  assert.equal(await upgrade('/sidebar/ws/terminal', fx.ownerCookie, { 'x-dsh-allowed-folders': JSON.stringify(['/anything']) }), 101);
  assert.equal(fx.upgradeHeadersSaw.length, 1);
  assert.equal(fx.upgradeHeadersSaw[0]!['x-dsh-allowed-folders'], undefined);
});

// ── H0 for upgrades: a seat under a mount meets the same socket table as at the root ──

const MOUNT = { 'x-forwarded-prefix': '/site.example' };

test('K5/R6: a seat opens its sidebar socket under a mount; dsh gets the prefixed path and the header', async () => {
  fx.upgradesSaw.length = 0;
  fx.upgradeHeadersSaw.length = 0;
  assert.equal(await upgrade('/site.example/sidebar/ws/fs-watch?sessionId=sess-mine', mine.cookie, MOUNT), 101);
  assert.deepEqual(fx.upgradesSaw, ['/site.example/sidebar/ws/fs-watch?sessionId=sess-mine']);
  assert.equal(fx.upgradeHeadersSaw[0]!['x-forwarded-prefix'], '/site.example');
  // Same table under the mount: a session the seat does not hold, and an owner-only socket, stay refused.
  fx.upgradesSaw.length = 0;
  for (const route of ['/site.example/sidebar/ws/fs-watch?sessionId=sess-foreign', '/site.example/sidebar/ws/terminal?sessionId=sess-mine']) {
    assert.equal(await upgrade(route, mine.cookie, MOUNT), 403, route);
  }
  assert.deepEqual(fx.upgradesSaw, []);
});

test('K5/H4: a seat\'s mux carrier under a mount is the filtered one: the baseline arrives held to the seat', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${fx.port}/site.example/api/remote.mux`, {
    headers: { cookie: mine.cookie, origin: 'http://127.0.0.1', host: '127.0.0.1', ...MOUNT },
  });
  const frames: any[] = [];
  ws.on('message', (data: Buffer) => frames.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); });
  try {
    ws.send(JSON.stringify({ type: 'open', streamId: 'wf', endpoint: 'workspace/follow', payload: { args: {} } }));
    for (let i = 0; i < 100 && !frames.some((f) => f.value?.type === 'baseline'); i += 1) await delay(10);
    const baseline = frames.find((f) => f.value?.type === 'baseline');
    assert.ok(baseline, JSON.stringify(frames));
    assert.deepEqual(baseline.value.value.items.map((item: any) => item.path), ['/work/alpha'], 'not /work/beta: the seat filter ran');
  } finally { ws.close(); }
});
