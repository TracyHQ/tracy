// Tracy policy layer, phase 1 slice: the seat-route fence on /sidebar/* (hooks H1/H2) and
// fail-closed Remote mux streams (H4), through a real gateway built WITHOUT naming a policy,
// so these cases also prove the default is the Tracy layer. Every refusal asserts that the
// dsh mock saw nothing and the client got no forbidden bytes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { createRequire } from 'node:module';


const require = createRequire(import.meta.url);
const { WebSocketServer, WebSocket: NodeWebSocket } = require('ws') as {
  WebSocketServer: new (options?: { noServer?: boolean }) => any;
  WebSocket: { new (url: string, options?: { headers?: Record<string, string> }): any; OPEN: number };
};

import { createGatewayServer } from '../../src/gateway.js';
import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import type { PlatformConfig } from '../../src/config.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';

const SECRET = 'slice-secret';
let tempDir = '';
let db: Database;
let gateway: http.Server;
let upstream: http.Server;
let gatewayPort = 0;
let ownerCookie = '';

/** What the dsh mock received: HTTP requests by path, mux open frames by endpoint. */
const seen = { http: [] as string[], muxOpens: [] as string[] };
const httpCount = (p: string): number => seen.http.filter((x) => x === p).length;
const openCount = (e: string): number => seen.muxOpens.filter((x) => x === e).length;

function startMock(): Promise<http.Server> {
  const mux = new WebSocketServer({ noServer: true });
  mux.on('connection', (client: any) => {
    client.on('message', (data: Buffer) => {
      const frame = JSON.parse(data.toString()) as { type?: string; streamId?: string; endpoint?: string; payload?: any };
      if (frame.type !== 'open' || typeof frame.endpoint !== 'string') return;
      seen.muxOpens.push(frame.endpoint);
      const send = (value: unknown): void => client.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value }));
      if (frame.endpoint === 'workspace/follow') {
        send({ type: 'baseline', value: { items: [
          { workspaceId: 'ws-visible', path: '/workspaces/visible', title: 'v', sessionIds: ['session-visible'] },
          { workspaceId: 'ws-hidden', path: '/workspaces/hidden', title: 'h', sessionIds: ['session-hidden'] },
        ], archivedSessionIds: [] } });
        return;
      }
      if (frame.endpoint === 'job/follow') {
        const jobId = frame.payload?.args?.request?.jobId as string;
        // Output BEFORE the opened frame that proves ownership. Frames in dsh rc.2's shape
        // (dsh-api-job-controller `JobFollowFrame`, dsh-jobs `JobView`): H5 holds them to it.
        send({ type: 'output', chunks: [{ at: 0, text: 'EARLY-LEAK' }], next: 10 });
        send({ type: 'opened', from: 10, job: { id: jobId, owner: 'session-visible', output: { total: 10, earliest: 0 } } });
        send({ type: 'output', chunks: [{ at: 10, text: 'after-open' }], next: 20 });
        client.send(JSON.stringify({ type: 'end', streamId: frame.streamId }));
        return;
      }
      send({ type: 'plugin/opaque', secret: 'PLUGIN-BYTES' });
    });
  });
  const server = http.createServer((req, res) => {
    seen.http.push((req.url ?? '').split('?')[0]!);
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
  });
  server.on('upgrade', (req, socket, head) => {
    if ((req.url ?? '').startsWith('/api/remote.mux')) mux.handleUpgrade(req, socket, head, (c: any) => mux.emit('connection', c, req));
    else socket.destroy();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function gatewayReq(method: string, url: string, cookie: string, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: gatewayPort, method, path: url,
      headers: { cookie, origin: `http://127.0.0.1:${gatewayPort}`, 'content-type': 'application/json' },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

type Mux = { client: any; frames: Array<Record<string, any>>; raw: string[]; next: (label: string) => Promise<Record<string, any>> };
function openMux(cookie: string): Promise<Mux> {
  return new Promise((resolve, reject) => {
    const client = new NodeWebSocket(`ws://127.0.0.1:${gatewayPort}/api/remote.mux`, {
      headers: { cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' },
    });
    const frames: Array<Record<string, any>> = [];
    const raw: string[] = [];
    const waiters: Array<(f: Record<string, any>) => void> = [];
    client.on('message', (data: Buffer) => {
      raw.push(data.toString());
      const f = JSON.parse(data.toString());
      const w = waiters.shift();
      if (w) w(f); else frames.push(f);
    });
    client.once('error', reject);
    client.once('open', () => resolve({
      client, frames, raw,
      next: (label) => new Promise((res, rej) => {
        const f = frames.shift();
        if (f) { res(f); return; }
        const timer = setTimeout(() => rej(new Error(`${label}: frame timeout`)), 3000);
        waiters.push((frame) => { clearTimeout(timer); res(frame); });
      }),
    }));
  });
}

/** A seat with one granted session, its session snapshot seeded by a real baseline. */
async function seatWithBaseline(name: string): Promise<{ cookie: string; mux: Mux }> {
  const seat = db.createUser(name, '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(seat.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  } as any);
  tracyStoreOf(db)!.setSeatRole(seat.id, 'editor');
  tracyStoreOf(db)!.writeMasterGrants(seat.id, ['session-visible']);
  const cookie = `dsh_gateway_token=${jwt.sign({ sub: String(seat.id), username: name, cv: 0 }, SECRET, { expiresIn: '1h' })}`;
  const mux = await openMux(cookie);
  mux.client.send(JSON.stringify({ type: 'open', streamId: 'baseline', endpoint: 'workspace/follow', payload: { args: {} } }));
  const baseline = await mux.next('baseline');
  assert.equal(baseline.value?.type, 'baseline');
  return { cookie, mux };
}

before(async () => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'tracy-slice-'));
  db = new Database(path.join(tempDir, 't.db'), createFieldCrypto('k', 'k'));
  db.init();
  const owner = db.createUser('owner', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  upstream = await startMock();
  const config: PlatformConfig = {
    setupKey: 'x', dbPath: path.join(tempDir, 't.db'), dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${(upstream.address() as any).port}`,
      tls: null, redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false, acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: SECRET, internalSecret: 'internal', patch: { dshRoot: '', restartService: '' }, endpointRules: [],
  };
  gateway = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((r) => gateway.listen(0, '127.0.0.1', () => r()));
  gatewayPort = (gateway.address() as any).port;
  ownerCookie = `dsh_gateway_token=${jwt.sign({ sub: String(owner.id), username: 'owner', cv: 0 }, SECRET, { expiresIn: '1h' })}`;
});

after(() => {
  gateway?.close();
  upstream?.close();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test('R1: a seat reads a file through a session it is granted', async () => {
  const { cookie, mux } = await seatWithBaseline('seat-1');
  try {
    const before = httpCount('/sidebar/api/fs.read');
    const res = await gatewayReq('POST', '/sidebar/api/fs.read', cookie, JSON.stringify({ sessionId: 'session-visible', path: 'README.md' }));
    assert.equal(res.status, 200, res.body.slice(0, 600));
    assert.equal(httpCount('/sidebar/api/fs.read') - before, 1, 'the plugin got exactly one request');
  } finally { mux.client.close(); }
});

test('R1/Q2: a seat cannot read through a session it does not hold, and nothing reaches dsh', async () => {
  const { cookie, mux } = await seatWithBaseline('seat-2');
  try {
    const before = seen.http.length;
    for (const body of [{ sessionId: 'session-hidden' }, {}, { sessionId: 'nope' }, { sessionId: 'session-visible', nested: { sessionId: 'session-hidden' } }, { sessionId: 'session-visible', rootSessionId: 'session-hidden' }]) {
      const res = await gatewayReq('POST', '/sidebar/api/fs.read', cookie, JSON.stringify({ ...body, path: 'secret.txt' }));
      assert.equal(res.status, 403, JSON.stringify(body));
      assert.ok(!res.body.includes('"ok":true'), 'no plugin bytes reach the client');
    }
    const garbled = await gatewayReq('POST', '/sidebar/api/fs.read', cookie, 'not json');
    assert.equal(garbled.status, 403, 'unparseable body is refused, not piped');
    assert.equal(seen.http.length - before, 0, 'the plugin received zero requests');
  } finally { mux.client.close(); }
});

test('V5: a seat opening an unknown mux stream is refused for that stream only', async () => {
  const { mux } = await seatWithBaseline('seat-3');
  try {
    const opensBefore = openCount('foo/bar');
    mux.client.send(JSON.stringify({ type: 'open', streamId: 's-foo', endpoint: 'foo/bar', payload: { args: {} } }));
    const reply = await mux.next('foo/bar reply');
    assert.equal(reply.streamId, 's-foo');
    assert.equal(reply.type, 'error');
    assert.equal(openCount('foo/bar') - opensBefore, 0, 'the open frame never reached dsh');
    assert.ok(!mux.raw.join('').includes('PLUGIN-BYTES'));
    assert.equal(mux.client.readyState, NodeWebSocket.OPEN, 'the carrier stays open');
  } finally { mux.client.close(); }
});

test('J3: job/follow output before the owning opened frame never reaches the seat', async () => {
  const { mux } = await seatWithBaseline('seat-4');
  try {
    mux.client.send(JSON.stringify({
      type: 'open', streamId: 'jf', endpoint: 'job/follow',
      payload: { args: { request: { sessionId: 'session-visible', jobId: 'job-1' } } },
    }));
    const first = await mux.next('opened');
    assert.equal(first.value?.type, 'opened');
    const second = await mux.next('output after opened');
    assert.deepEqual(second.value?.chunks, [{ at: 10, text: 'after-open' }]);
    const end = await mux.next('end');
    assert.equal(end.type, 'end');
    assert.equal(mux.raw.join('').indexOf('EARLY-LEAK'), -1, 'zero bytes of the early output');
  } finally { mux.client.close(); }
});

test('R1/R5: a seat cannot reach a sidebar route outside the seat table; the owner can', async () => {
  const { cookie, mux } = await seatWithBaseline('seat-5');
  try {
    const before = seen.http.length;
    for (const route of ['/sidebar/api/git.status', '/sidebar/api/shell.get', '/sidebar/api/fs.write', '/sidebar/anything', '/sidebar']) {
      const res = await gatewayReq('POST', route, cookie, JSON.stringify({ sessionId: 'session-visible' }));
      assert.equal(res.status, 403, route);
    }
    assert.equal(seen.http.length - before, 0, 'the plugin received zero requests');
    const owner = await gatewayReq('POST', '/sidebar/api/git.status', ownerCookie, JSON.stringify({ sessionId: 'session-visible' }));
    assert.equal(owner.status, 200, 'owner path is unchanged');
    assert.equal(httpCount('/sidebar/api/git.status'), 1);
  } finally { mux.client.close(); }
});

test('R4: subagents.live names its session in rootSessionId', async () => {
  const { cookie, mux } = await seatWithBaseline('seat-6');
  try {
    const before = httpCount('/sidebar/api/subagents.live');
    const ok = await gatewayReq('POST', '/sidebar/api/subagents.live', cookie, JSON.stringify({ rootSessionId: 'session-visible' }));
    assert.equal(ok.status, 200, ok.body.slice(0, 600));
    const foreign = await gatewayReq('POST', '/sidebar/api/subagents.live', cookie, JSON.stringify({ rootSessionId: 'session-hidden' }));
    assert.equal(foreign.status, 403);
    const none = await gatewayReq('POST', '/sidebar/api/subagents.live', cookie, JSON.stringify({}));
    assert.equal(none.status, 403);
    assert.equal(httpCount('/sidebar/api/subagents.live') - before, 1, 'only the granted call reached the plugin');
  } finally { mux.client.close(); }
});
