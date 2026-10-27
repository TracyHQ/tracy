// Shared fixture for the stream hooks (H4, H5, H6, H8): a real gateway built WITHOUT naming a
// policy (so the Tracy default is what runs), between a scripted dsh and real `ws` clients. The
// dsh mock records every HTTP request, every upgrade and every mux frame it receives, so a refusal
// can be asserted as "0 bytes reached dsh" and not only as an error code. Data is synthetic.
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Duplex } from 'node:stream';
import { createRequire } from 'node:module';
import jwt from 'jsonwebtoken';

import { createGatewayServer } from '../../src/gateway.js';
import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';
import type { PlatformConfig } from '../../src/config.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';

const require = createRequire(import.meta.url);
export const { WebSocketServer, WebSocket } = require('ws') as {
  WebSocketServer: new (options?: { noServer?: boolean }) => any;
  WebSocket: { new (url: string, options?: { headers?: Record<string, string> }): any; OPEN: number };
};

const JWT_SECRET = 'stream-harness-secret';

export type Frame = {
  type: string;
  streamId: string;
  endpoint?: string;
  payload?: any;
  value?: any;
  error?: { code?: unknown; message?: unknown; details?: unknown };
};

/** The workspaces dsh knows: `/work/alpha` is the seats' folder, `/work/beta` another customer's. */
export const WORKSPACES = [
  { workspaceId: 'w-alpha', path: '/work/alpha', title: 'alpha', sessionIds: ['sess-mine', 'sess-off', 'sess-foreign'] },
  { workspaceId: 'w-beta', path: '/work/beta', title: 'beta', sessionIds: ['sess-beta'] },
];

/** A stream script: what dsh answers to one `open`. `send(value)` sends an item on that stream. */
export type OpenScript = (frame: Frame, send: (value: unknown) => void, raw: (frame: unknown) => void) => void;

/** dsh's default answers; a test overrides one endpoint through `fixture.scripts`. */
const DEFAULT_SCRIPTS: Record<string, OpenScript> = {
  'workspace/follow': (_frame, send) => send({ type: 'baseline', value: { items: WORKSPACES, archivedSessionIds: [] } }),
  '$events': (frame, send) => send({ type: 'ready', clientId: `client-${frame.streamId}`, host: { home: '/root' } }),
  'session/control': (_frame, send) => {
    const table = { 'sess-mine': { n: 1 }, 'sess-foreign': { n: 2 }, 'sess-beta': { n: 3 } };
    send({ type: 'baseline', value: { projections: table, jobs: table, queues: table } });
  },
  'session/follow': (frame, send) => {
    const address = frame.payload?.args?.request?.address ?? {};
    const id = address.kind === 'subagent' ? address.childSessionId : address.sessionId;
    send({ type: 'snapshot', header: address.kind === 'subagent'
      ? { id, origin: 'subagent', parentSession: address.parentSessionId }
      : { id, origin: 'user' }, records: [] });
  },
  'job/list': (_frame, send) => send({ type: 'rows', jobs: [
    { id: 'mine-job', owner: 'sess-mine', label: 'Mine', output: { total: 3, earliest: 0, spillPaths: ['/host/private/mine'] } },
    { id: 'unowned-job', label: 'Unowned', output: { total: 0, earliest: 0 } },
    { id: 'foreign-job', owner: 'sess-foreign', label: 'Foreign', output: { total: 0, earliest: 0 } },
  ] }),
  'job/follow': (frame, send) => {
    const jobId = frame.payload?.args?.request?.jobId ?? 'mine-job';
    const owner = jobId === 'foreign-job' ? 'sess-foreign' : 'sess-mine';
    const job = { id: jobId, owner, label: 'Job', output: { total: 3, earliest: 0, spillPaths: ['/host/private/mine'] } };
    send({ type: 'opened', from: 0, job });
    send({ type: 'output', chunks: [{ at: 0, text: 'abc' }], next: 3 });
    send({ type: 'status', job });
  },
};

export interface Fixture {
  db: Database;
  port: number;
  ownerCookie: string;
  /** Per-endpoint dsh answers; delete a key to fall back to the default. */
  scripts: Record<string, OpenScript>;
  /** Every mux frame dsh received, in order. */
  muxSaw: Frame[];
  /** Every HTTP request path (query kept) dsh received. */
  httpSaw: string[];
  /** Every non-mux upgrade URL dsh received. */
  upgradesSaw: string[];
  /** The headers of each upgrade in `upgradesSaw`, same order. */
  upgradeHeadersSaw: http.IncomingHttpHeaders[];
  /** SSE body dsh streams on `/api/events.host` and `/api/events.mux` (chunks, written in order). */
  sse: { host: Array<string | Buffer>; mux: Array<string | Buffer> };
  /** Messages dsh sends on a new `/api/events.host` / `/api/events.mux` WebSocket, in order. */
  wsEvents: { host: string[]; mux: string[] };
  /** Live dsh-side mux sockets, so a test can push frames later. */
  muxSockets: Set<any>;
  /** dsh's HTTP answers by exact path; unset paths answer `{"ok":true}`. */
  http: Record<string, (body: string, res: http.ServerResponse) => void>;
  createSeat(name: string, options?: SeatOptions): { id: number; cookie: string };
  close(): Promise<void>;
}

export interface SeatOptions {
  folders?: string[];
  grants?: string[];
  disabled?: string[];
  banned?: boolean;
  /** false: a pre-grant account whose book was never seeded (Issue #19 migration). */
  seeded?: boolean;
  /** The seat door's role (`users.seat_role`); unset = an account the seat door never minted. */
  seatRole?: string;
  /** `legacy` writes the grants as an old pre-origin row instead of the master's save. */
  grantOrigin?: 'master' | 'legacy';
  /** The seat's proven address (`users.email`). */
  email?: string;
  /** Sessions this seat's own create returned (grant origin `created`), on top of `grants`. */
  created?: string[];
  allowWorkspaceCreate?: boolean;
}

export async function startFixture(): Promise<Fixture> {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'tracy-streams-'));
  const db = new Database(path.join(tempDir, 't.db'), createFieldCrypto('k', 'k'));
  db.init();
  const owner = db.createUser('owner', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  const scripts: Record<string, OpenScript> = {};
  const muxSaw: Frame[] = [];
  const httpSaw: string[] = [];
  const upgradesSaw: string[] = [];
  const upgradeHeadersSaw: http.IncomingHttpHeaders[] = [];
  const sse = { host: [] as Array<string | Buffer>, mux: [] as Array<string | Buffer> };
  const wsEvents = { host: [] as string[], mux: [] as string[] };
  const events = new WebSocketServer({ noServer: true });
  const muxSockets = new Set<any>();
  const httpHandlers: Record<string, (body: string, res: http.ServerResponse) => void> = {};
  const heldSockets = new Set<Duplex>();

  const mux = new WebSocketServer({ noServer: true });
  mux.on('connection', (socket: any) => {
    muxSockets.add(socket);
    socket.on('close', () => muxSockets.delete(socket));
    socket.on('message', (data: Buffer) => {
      const frame = JSON.parse(data.toString()) as Frame;
      muxSaw.push(frame);
      if (frame.type !== 'open' || typeof frame.endpoint !== 'string') return;
      const raw = (out: unknown): void => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(out)); };
      const send = (value: unknown): void => raw({ type: 'item', streamId: frame.streamId, value });
      const script = scripts[frame.endpoint] ?? DEFAULT_SCRIPTS[frame.endpoint];
      if (script !== undefined) script(frame, send, raw);
      else send({ type: 'plugin/opaque', secret: 'PLUGIN-BYTES' });
    });
  });
  const dsh = http.createServer((req, res) => {
    httpSaw.push(req.url ?? '');
    // dsh's web server serves a mounted path by taking the named prefix off (dsh-host-webserver).
    const prefix = typeof req.headers['x-forwarded-prefix'] === 'string' ? req.headers['x-forwarded-prefix'] : '';
    const url = prefix !== '' && (req.url ?? '').startsWith(`${prefix}/`) ? (req.url ?? '').slice(prefix.length) : req.url ?? '';
    const pathname = url.split('?')[0];
    if (pathname === '/api/events.host' || pathname === '/api/events.mux') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const chunk of pathname === '/api/events.host' ? sse.host : sse.mux) res.write(chunk);
      setTimeout(() => res.end(), 30);
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const handler = httpHandlers[pathname ?? ''];
      if (handler !== undefined) { handler(Buffer.concat(chunks).toString('utf8'), res); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  dsh.on('upgrade', (req, socket: Duplex, head) => {
    // dsh takes the mount the gateway names off the path, as its web server does.
    const prefix = req.headers['x-forwarded-prefix'];
    const routed = typeof prefix === 'string' && (req.url ?? '').startsWith(`${prefix}/`) ? (req.url ?? '').slice(prefix.length) : req.url ?? '';
    if (routed.startsWith('/api/remote.mux')) {
      mux.handleUpgrade(req, socket, head, (c: any) => mux.emit('connection', c, req));
      return;
    }
    const eventsChannel = routed.startsWith('/api/events.host') ? 'host' : routed.startsWith('/api/events.mux') ? 'mux' : null;
    if (eventsChannel !== null) {
      events.handleUpgrade(req, socket, head, (c: any) => {
        muxSockets.add(c);
        c.on('close', () => muxSockets.delete(c));
        for (const message of wsEvents[eventsChannel]) c.send(message);
      });
      return;
    }
    // Any other upgrade: answer 101 and hold the socket open like a live watch.
    upgradesSaw.push(req.url ?? '');
    upgradeHeadersSaw.push(req.headers);
    heldSockets.add(socket);
    socket.on('close', () => heldSockets.delete(socket));
    socket.on('error', () => { /* the gate closed it */ });
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
  });
  await new Promise<void>((resolve) => dsh.listen(0, '127.0.0.1', resolve));

  const config: PlatformConfig = {
    setupKey: 'x', dbPath: path.join(tempDir, 't.db'), dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${(dsh.address() as any).port}`,
      tls: null, redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false, acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: JWT_SECRET, internalSecret: 'internal', patch: { dshRoot: '', restartService: '' }, endpointRules: [],
  } as PlatformConfig;
  const gateway = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  const cookieOf = (id: number, name: string): string =>
    `dsh_gateway_token=${jwt.sign({ sub: String(id), username: name, cv: 0 }, JWT_SECRET, { expiresIn: '1h' })}`;

  return {
    db,
    port: (gateway.address() as any).port,
    ownerCookie: cookieOf(owner.id, 'owner'),
    scripts, muxSaw, httpSaw, upgradesSaw, upgradeHeadersSaw, sse, wsEvents, muxSockets, http: httpHandlers,
    createSeat(name, options = {}) {
      const user = db.createUser(name, '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
      db.setPermissions(user.id, {
        allowedFolders: options.folders ?? ['/work/alpha'], hourlyTokenLimit: null, dailyMinutesLimit: null,
        allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: options.allowWorkspaceCreate ?? false,
        allowedAgentPresets: null, banned: options.banned ?? false, sandboxMode: null,
        disabledSessions: options.disabled ?? ['sess-off'],
      } as any);
      const store = tracyStoreOf(db)!;
      // Granted sessions as the master's admin save writes them (origin `master`, Q1), or as an
      // old pre-origin row (`legacy`) when a case measures how the seat book treats one.
      if (options.grantOrigin === 'legacy') db.replaceUserSessionGrants(user.id, options.grants ?? ['sess-mine', 'sess-off']);
      else store.writeMasterGrants(user.id, options.grants ?? ['sess-mine', 'sess-off']);
      // A seat as the seat door leaves it: its role, never seeded (the store seeds a seat nothing).
      // `seeded: false` keeps a pre-grant account that is not a seat (Issue #19 migration).
      const seatRole = options.seatRole ?? (options.seeded !== false ? 'editor' : undefined);
      if (seatRole !== undefined) store.setSeatRole(user.id, seatRole);
      if (options.email !== undefined) store.setEmail(user.id, options.email);
      for (const id of options.created ?? []) assert.ok(store.recordCreatedSession(user.id, id), `created grant ${id}`);
      return { id: user.id, cookie: cookieOf(user.id, name) };
    },
    async close() {
      for (const socket of heldSockets) socket.destroy();
      for (const socket of muxSockets) socket.terminate();
      gateway.closeAllConnections?.();
      dsh.closeAllConnections?.();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
      await new Promise<void>((resolve) => dsh.close(() => resolve()));
      db.close();
      try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}

/** One live mux client: every frame it got, waiters by predicate, and how it closed. */
export interface MuxClient {
  ws: any;
  frames: Frame[];
  raw: string[];
  closed: Promise<{ code: number; reason: string }>;
  send(frame: unknown): void;
  open(streamId: string, endpoint: string, args?: Record<string, unknown>): void;
  /** Resolves with the first frame (already received or later) matching `match`. */
  waitFor(label: string, match: (frame: Frame) => boolean, timeoutMs?: number): Promise<Frame>;
  close(): Promise<void>;
}

export function connectMux(fixture: Fixture, cookie: string): Promise<MuxClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${fixture.port}/api/remote.mux`, { headers: { cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' } });
    const frames: Frame[] = [];
    const raw: string[] = [];
    const waiters = new Set<() => void>();
    let resolveClosed: (value: { code: number; reason: string }) => void = () => {};
    const closed = new Promise<{ code: number; reason: string }>((r) => { resolveClosed = r; });
    ws.on('message', (data: Buffer) => {
      raw.push(data.toString());
      frames.push(JSON.parse(data.toString()) as Frame);
      for (const wake of [...waiters]) wake();
    });
    ws.on('close', (code: number, reason: Buffer) => resolveClosed({ code, reason: reason.toString() }));
    ws.once('error', reject);
    ws.once('open', () => {
      const client: MuxClient = {
        ws, frames, raw, closed,
        send: (frame) => { if (ws.readyState === WebSocket.OPEN) ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame)); },
        open: (streamId, endpoint, args = {}) => client.send({ type: 'open', streamId, endpoint, payload: { args } }),
        waitFor: (label, match, timeoutMs = 3000) => new Promise((res, rej) => {
          const check = (): boolean => {
            const found = frames.find(match);
            if (found === undefined) return false;
            waiters.delete(wake);
            clearTimeout(timer);
            res(found);
            return true;
          };
          const wake = (): void => { check(); };
          const timer = setTimeout(() => { waiters.delete(wake); rej(new Error(`${label}: no matching frame; saw ${JSON.stringify(frames).slice(0, 800)}`)); }, timeoutMs);
          waiters.add(wake);
          check();
        }),
        close: async () => {
          if (ws.readyState === WebSocket.OPEN) ws.close(1000);
          await closed;
        },
      };
      resolve(client);
    });
  });
}

/** A mux client whose seat already has its workspace baseline (the grant snapshot upstream needs). */
export async function muxWithBaseline(fixture: Fixture, cookie: string): Promise<MuxClient> {
  const client = await connectMux(fixture, cookie);
  client.open('wf', 'workspace/follow');
  await client.waitFor('workspace baseline', (f) => f.streamId === 'wf' && f.value?.type === 'baseline');
  return client;
}

export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Frames dsh received for one stream id since `from` (an index into `muxSaw`). */
export const sawFor = (fixture: Fixture, streamId: string, from = 0): Frame[] =>
  fixture.muxSaw.slice(from).filter((f) => f.streamId === streamId);

/**
 * The dsh client's own acceptance rule for an `error` frame (`parseRemoteStreamServerMessage` in
 * dsh-api-gateway `stream-protocol.ts`): exactly `type`, `streamId`, `error`, and the error exactly
 * `code`, `message`, `details` with an object `details`; anything else drops the whole socket.
 * With `tracyEndpoint`, the refusal is Tracy's own (`gateway/method-unavailable` naming the endpoint);
 * without it, upstream refused first and keeps its own code (plan §2.2 H4).
 */
export function assertDshRefusal(frame: Frame, streamId: string, tracyEndpoint?: string): void {
  assert.deepEqual(Object.keys(frame).sort(), ['error', 'streamId', 'type']);
  assert.equal(frame.type, 'error');
  assert.equal(frame.streamId, streamId);
  assert.deepEqual(Object.keys(frame.error!).sort(), ['code', 'details', 'message']);
  assert.equal(typeof frame.error!.code, 'string');
  assert.equal(typeof frame.error!.message, 'string');
  assert.ok(frame.error!.details !== null && typeof frame.error!.details === 'object' && !Array.isArray(frame.error!.details));
  if (tracyEndpoint === undefined) return;
  assert.equal(frame.error!.code, 'gateway/method-unavailable');
  assert.deepEqual(frame.error!.details, { endpoint: tracyEndpoint });
}

/** A plain HTTP call through the gateway, same-origin. */
export function gatewayRequest(fixture: Fixture, method: string, url: string, cookie: string, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: fixture.port, method, path: url,
      headers: { cookie, origin: `http://127.0.0.1:${fixture.port}`, 'content-type': 'application/json' },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}
