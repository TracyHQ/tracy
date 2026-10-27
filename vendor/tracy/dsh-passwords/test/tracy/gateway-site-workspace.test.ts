/**
 * TCH #557: a site's workspace is registered once its folder exists, even when the seat came first.
 *
 * Measured on dev 29/09/2026: the seat door asked dsh to register `/site/qcwp1715` at
 * 00:16:02.741Z, dsh refused (`workspace/invalid-path`, ENOENT on realpath), and the folder was born
 * 509 ms later. The door only warned, nothing asked again, and the owner's page stayed on "Choose a
 * workspace to start" with an empty picker.
 *
 * Real HTTP and WS end to end: a fake dsh that keeps a workspace registry, refuses a folder that is
 * not on disk the way dsh does, and pushes an `upsert` on `workspace/follow` when a workspace is
 * created (dsh-workspace-controller `feed.ts`); the real gateway in the middle.
 *
 * Ported from the 2.6.6 fork (`test/gateway-site-workspace.test.ts`, 13 cases). One change of
 * substance: there a "visit" was an HTTP `workspace.list` or the `workspace/follow` baseline. dsh
 * 0.2.0's workspace controller has no `list` method (api/workspace-controller/src/index.ts: create,
 * rename, delete, …, follow), and the 0.2.0 client reads the registry only from the follow
 * baseline, so a visit here is what the client does: open `workspace/follow` and read the baseline.
 * The HTTP `workspace.list` the fork healed from is still sent once, to prove it registers nothing.
 */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';

import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import { createGatewayServer } from '../../src/gateway.js';
import { mintSessionToken } from '../../src/tracy/auth-token.js';
import { seatBookOf } from '../../src/tracy/seat-book.js';
import { signSeatRequest, upsertSeatUser, type SeatGrant } from '../../src/tracy/seat.js';
import type { PlatformConfig } from '../../src/config.js';
import { DSH_RPC_DESCRIPTORS, dshArgumentsRefusal } from './dsh-rpc-fake.js';

const SEAT_SECRET = 'seat-secret-for-557';

interface Workspace {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: string[];
}

/** A dsh with a registry: `workspace/create` realpaths like the real one, and follow streams see creations. */
class FakeDsh {
  readonly registry = new Map<string, Workspace>();
  readonly calls: Array<{ method: string; request: Record<string, unknown>; at: number }> = [];
  /** While set, `workspace/create` answers only when released. */
  hold: Promise<void> | null = null;
  heldNow = 0;
  /** While set, `workspace/rename` is refused with this code (titles are registry-unique in dsh). */
  refuseRename: string | null = null;
  /** While set, `workspace/rename` answers this HTTP status with no envelope (a proxy in trouble). */
  renameHttpStatus: number | null = null;
  /** Titles `workspace/rename` refuses as taken, whatever `refuseRename` says. */
  readonly takenTitles = new Set<string>();
  /** While set, `workspace/rename` answers only when released. */
  holdRename: Promise<void> | null = null;
  renamesHeldNow = 0;
  /** `workspace/create` requests dsh has decided (the folder looked at), whatever it answered. */
  createsAnswered = 0;
  /** `workspace/create` requests the gateway gave up on before dsh answered. */
  abortedCreates = 0;
  maxConcurrentCreates = 0;
  private inFlightCreates = 0;
  private readonly followers = new Set<{ socket: WebSocket; streamId: string }>();
  /** Every `/api/remote.mux` carrier a gateway opened to this dsh and has not closed yet. */
  private readonly carriers = new Set<WebSocket>();
  server: http.Server;
  port = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => void this.answer(req.url ?? '', Buffer.concat(chunks).toString('utf8'), res));
    });
    const wss = new WebSocketServer({ server: this.server, path: '/api/remote.mux' });
    wss.on('connection', (socket) => {
      this.carriers.add(socket);
      socket.on('close', () => this.carriers.delete(socket));
      socket.on('message', (data) => {
        const frame = JSON.parse(String(data)) as { type: string; streamId: string; endpoint?: string };
        if (frame.type !== 'open' || frame.endpoint !== 'workspace/follow') return;
        const follower = { socket, streamId: frame.streamId };
        this.followers.add(follower);
        socket.on('close', () => this.followers.delete(follower));
        socket.send(JSON.stringify({
          type: 'item', streamId: frame.streamId,
          value: { type: 'baseline', value: { items: [...this.registry.values()], archivedSessionIds: [], pinnedSessionIds: [] } },
        }));
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as { port: number }).port;
  }

  /**
   * Resolves once no gateway holds a carrier to this dsh. The gateway closes its upstream carrier
   * only from its browser socket's close handler, after which a late dsh frame is dropped at
   * `client.readyState !== OPEN` (proxy.ts) instead of being filtered against the database.
   */
  async carriersClosed(timeoutMs = 5000): Promise<void> {
    await until('the gateway closes its dsh carriers', () => this.carriers.size === 0, timeoutMs);
  }

  stop(): void {
    for (const f of this.followers) f.socket.terminate();
    this.server.close();
    this.server.closeAllConnections();
  }

  creates(folder: string): number {
    return this.calls.filter((c) => c.method === 'workspace/create' && c.request.path === folder).length;
  }

  private async answer(url: string, raw: string, res: http.ServerResponse): Promise<void> {
    const body = JSON.parse(raw || '{}') as { rpcId?: string; method?: string; payload?: { args?: { request?: Record<string, unknown> } } };
    const method = body.method ?? url.replace(/^\/api\//, '');
    const request = body.payload?.args?.request ?? {};
    this.calls.push({ method, request, at: Date.now() });
    const reply = (result: unknown): void => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ type: 'server-response', rpcId: body.rpcId ?? 'r', result }));
    };
    // #591: refused the way dsh's gateway refuses a wrong argument shape (dsh-rpc-fake.ts).
    const refusal = Object.hasOwn(DSH_RPC_DESCRIPTORS, method) ? dshArgumentsRefusal(method, body.payload?.args) : null;
    if (refusal !== null) {
      reply({ ok: false, error: refusal });
      return;
    }
    if (url === '/api/workspace/list') {
      reply({ ok: true, value: { items: [...this.registry.values()], archivedSessionIds: [] } });
      return;
    }
    if (method === 'workspace/create') {
      this.inFlightCreates += 1;
      this.maxConcurrentCreates = Math.max(this.maxConcurrentCreates, this.inFlightCreates);
      res.on('close', () => { if (!res.writableEnded) this.abortedCreates += 1; });
      if (this.hold !== null) {
        this.heldNow += 1;
        await this.hold;
        this.heldNow -= 1;
      }
      this.inFlightCreates -= 1;
      const folder = String(request.path);
      let stat;
      this.createsAnswered += 1;
      try {
        stat = statSync(folder);
      } catch {
        reply({ ok: false, error: { code: 'workspace/invalid-path', message: `ENOENT: no such file or directory, realpath '${folder}'` } });
        return;
      }
      if (!stat.isDirectory()) {
        reply({ ok: false, error: { code: 'workspace/invalid-path', message: `ENOTDIR: not a directory, '${folder}'` } });
        return;
      }
      let ws = this.registry.get(folder);
      const created = ws === undefined;
      if (ws === undefined) {
        ws = { workspaceId: `ws-${this.registry.size + 1}`, path: folder, title: path.basename(folder), sessionIds: [] };
        this.registry.set(folder, ws);
        this.publish({ type: 'upsert', workspace: ws });
      }
      reply({ ok: true, value: { workspace: ws, created } });
      return;
    }
    if (method === 'workspace/rename') {
      if (this.holdRename !== null) {
        this.renamesHeldNow += 1;
        await this.holdRename;
        this.renamesHeldNow -= 1;
      }
      if (this.takenTitles.has(String(request.title))) {
        reply({ ok: false, error: { code: 'workspace/name-conflict', message: 'taken' } });
        return;
      }
      if (this.renameHttpStatus !== null) {
        res.statusCode = this.renameHttpStatus;
        res.end('bad gateway');
        return;
      }
      if (this.refuseRename !== null) {
        reply({ ok: false, error: { code: this.refuseRename, message: 'refused' } });
        return;
      }
      const ws = [...this.registry.values()].find((w) => w.workspaceId === request.workspaceId);
      if (ws === undefined) {
        reply({ ok: false, error: { code: 'workspace/not-found', message: 'no such workspace' } });
        return;
      }
      ws.title = String(request.title);
      this.publish({ type: 'upsert', workspace: ws });
      reply({ ok: true, value: { workspace: ws } });
      return;
    }
    if (method === 'workspace/delete') {
      const ws = [...this.registry.values()].find((w) => w.workspaceId === request.workspaceId);
      if (ws === undefined) {
        reply({ ok: false, error: { code: 'workspace/not-found', message: 'no such workspace' } });
        return;
      }
      this.registry.delete(ws.path);
      this.publish({ type: 'remove', workspaceId: ws.workspaceId });
      reply({ ok: true, value: { deleted: true } });
      return;
    }
    reply({ ok: false, error: { code: 'unknown', message: method } });
  }

  private publish(value: unknown): void {
    for (const f of this.followers) f.socket.send(JSON.stringify({ type: 'item', streamId: f.streamId, value }));
  }
}

interface Lane {
  dir: string;
  db: Database;
  auth: AuthService;
  dsh: FakeDsh;
  gateway: http.Server;
  port: number;
  /** Every raw socket the gateway accepted, upgraded ones included (`closeAllConnections` skips those). */
  sockets: Set<import('node:net').Socket>;
}

const lanes: Lane[] = [];

async function startLane(existing?: { dir: string; dsh: FakeDsh }): Promise<Lane> {
  const dir = existing?.dir ?? mkdtempSync(path.join(os.tmpdir(), 'dshpw-557-'));
  const dsh = existing?.dsh ?? new FakeDsh();
  if (existing === undefined) await dsh.start();
  const db = new Database(path.join(dir, 'gate.db'), createFieldCrypto('k', 'k'));
  db.init();
  const config: PlatformConfig = {
    setupKey: 'test-setup-key', dbPath: path.join(dir, 'gate.db'), dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${dsh.port}`,
      tls: null, redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false,
      acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'test-secret', internalSecret: 'test-internal', seatSecret: SEAT_SECRET,
    patch: { dshRoot: '', restartService: '' }, endpointRules: [],
  };
  const auth = new AuthService(config, db);
  const gateway = createGatewayServer(config, auth, db);
  const sockets = new Set<import('node:net').Socket>();
  gateway.on('connection', (socket: import('node:net').Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  const lane = { dir, db, auth, dsh, gateway, port: (gateway.address() as { port: number }).port, sockets };
  lanes.push(lane);
  return lane;
}

async function closeGateway(lane: Lane): Promise<void> {
  await new Promise<void>((resolve) => {
    lane.gateway.close(() => resolve());
    // An upgraded WebSocket is no longer an HTTP connection: `closeAllConnections` leaves it open
    // and `close()` would wait for it forever, holding the test process past its runner's limit.
    for (const socket of lane.sockets) socket.destroy();
    lane.gateway.closeAllConnections?.();
  });
  // A dsh frame the gateway reads before its browser socket's close handler ran is filtered against
  // the database (proxy.ts `effectivePermissions`). Closing the database first threw "database is
  // not open" from that handler after the test had ended, which turned a green run's exit code into
  // 1 on a loaded runner. So the database closes only once the gateway let go of every carrier.
  await lane.dsh.carriersClosed();
  try { lane.db.close(); } catch { /* already closed */ }
}

afterEach(async () => {
  const dirs = new Set<string>();
  const dshs = new Set<FakeDsh>();
  for (const lane of lanes.splice(0)) {
    if (lane.gateway.listening) await closeGateway(lane);
    dshs.add(lane.dsh);
    dirs.add(lane.dir);
  }
  for (const dsh of dshs) dsh.stop();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function post(lane: Lane, routePath: string, body: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; at: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: lane.port, method: 'POST', path: routePath,
      headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), ...headers },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), at: Date.now() }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function signed(lane: Lane, routePath: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const { timestamp, nonce, signature } = signSeatRequest({ secret: SEAT_SECRET, method: 'POST', path: routePath, body, now: Date.now() });
  return post(lane, routePath, body, { 'x-seat-timestamp': timestamp, 'x-seat-nonce': nonce, 'x-seat-signature': signature });
}

async function mint(lane: Lane, email: string, site: string, folder: string): Promise<{ status: number; cookie: string; at: number }> {
  const res = await signed(lane, '/gateway/seat/session', { role: 'owner', email, site, folders: [folder] });
  const token = res.status === 200 ? (JSON.parse(res.body) as { token: string }).token : '';
  return { status: res.status, cookie: `dsh_gateway_token=${token}`, at: res.at };
}

async function until(what: string, check: () => boolean, timeoutMs = 6000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Open `workspace/follow` as the seat and collect the values it is sent. */
function follow(lane: Lane, cookie: string): { values: Array<Record<string, unknown>>; close: () => void; opened: Promise<void> } {
  const values: Array<Record<string, unknown>> = [];
  const ws = new WebSocket(`ws://127.0.0.1:${lane.port}/api/remote.mux`, { headers: { cookie } });
  const opened = new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'open', streamId: 'wf-1', endpoint: 'workspace/follow', payload: { args: {} } }));
      resolve();
    });
    ws.on('error', reject);
  });
  ws.on('message', (data) => {
    const frame = JSON.parse(String(data)) as { type?: string; value?: Record<string, unknown> };
    if (frame.type === 'item' && frame.value !== undefined) values.push(frame.value);
  });
  return { values, opened, close: () => ws.terminate() };
}

/** A seat written straight into the book, as an older build left it (no door call, nothing registered). */
function bookSeat(lane: Lane, grant: SeatGrant): { userId: number; cookie: string } {
  const seat = upsertSeatUser(seatBookOf(lane.db), grant);
  return { userId: seat.userId, cookie: cookieOf(lane, seat.userId) };
}

function cookieOf(lane: Lane, userId: number): string {
  return `dsh_gateway_token=${mintSessionToken(lane.db.getUserById(userId)!, { jwtSecret: 'test-secret' })}`;
}

/**
 * One visit of the seat's page: open `workspace/follow`, read the baseline the gateway lets through,
 * close. Returns the paths of the workspaces the seat was shown.
 */
async function visit(lane: Lane, cookie: string): Promise<string[]> {
  const page = follow(lane, cookie);
  try {
    await page.opened;
    await until('the baseline', () => page.values.some((v) => v.type === 'baseline'));
    const baseline = page.values.find((v) => v.type === 'baseline')!.value as { items: Workspace[] };
    return baseline.items.map((item) => item.path);
  } finally {
    page.close();
  }
}

function siteFolder(lane: Lane, label: string): string {
  return path.join(lane.dir, 'site', label);
}

test('the seat arrives before its folder: the workspace is registered once the folder exists, and the next visit shows it', async (t) => {
  // The chain reports how many attempts it took; a second chain would ask dsh more often than that.
  const logged: string[] = [];
  t.mock.method(console, 'log', (...line: unknown[]) => { logged.push(line.map(String).join(' ')); });
  const lane = await startLane();
  const folder = siteFolder(lane, 'qcwp1715');
  const seat = await mint(lane, 'owner@tracy.test', 'qcwp1715.tracy.test', folder);
  assert.equal(seat.status, 200, 'the seat is minted while the folder is missing');
  assert.equal(lane.dsh.registry.size, 0);

  // The owner's page is already open: its baseline has no workspace, and the heal joins the chain.
  const page = follow(lane, seat.cookie);
  await page.opened;
  await until('an empty baseline', () => page.values.some((v) => v.type === 'baseline'));

  mkdirSync(folder, { recursive: true }); // the fleet finishes creating the site
  // create takes only a path, so the workspace first appears under its basename and the rename
  // right after applies the site key: wait for the settled state, not the first appearance.
  await until(
    'the workspace is registered and titled',
    () => lane.dsh.registry.has(folder) && lane.dsh.registry.get(folder)?.title === 'qcwp1715.tracy.test',
    5000,
  );
  assert.ok(lane.dsh.registry.has(folder), 'registered');
  assert.equal(lane.dsh.registry.get(folder)?.title, 'qcwp1715.tracy.test', 'titled after the site key');
  page.close();
  await pause(1200); // past the next retry delays of any second chain
  // One chain: refused while the folder was missing, registered on a retry. A second chain started by
  // the page's baseline would have asked again. How many retries the refusal took depends on how
  // long the page's baseline took against the 250 ms first delay (three on a loaded runner, measured
  // 12/10/2026), so the count is checked against the chain's own report, not a fixed 2.
  const attempts = logged.map((line) => /site workspace .*qcwp1715 registered after (\d+) attempts/.exec(line)?.[1]).find((n) => n !== undefined);
  assert.ok(attempts !== undefined && Number(attempts) >= 2, `the chain reports a retry: ${JSON.stringify(logged)}`);
  assert.equal(lane.dsh.creates(folder), Number(attempts), 'the door and the heal shared one chain');
  assert.equal(lane.dsh.maxConcurrentCreates, 1);
  assert.deepEqual(await visit(lane, seat.cookie), [folder], 'the next baseline the seat is sent shows it');
});

// Upstream 2.7.7 lets a `workspace/follow` upsert of a workspace not in that connection's baseline
// through only when `user_workspaces` records the seat as its owner (gateway.ts `workspaceAllowed`).
// The door registers a site folder as the master, and recording the seat as owner would make every
// session in the site visible to it without a grant (Q1, TCH #300), so the upsert is dropped and an
// already-open page learns of the workspace only at its next baseline. Passing it is a decision for
// hook H5 (`mux-seat.ts`, the stream phase), not for the door: kept here as a known gap, run as TODO.
test('a page already open when the site workspace is registered is told at once (upsert)', {
  todo: 'H5 (mux-seat.ts): upstream 2.7.7 drops an upsert for a workspace the seat does not own; outside the door phase',
}, async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'told');
  const seat = await mint(lane, 'told@tracy.test', 'told.tracy.test', folder);
  assert.equal(seat.status, 200);
  const page = follow(lane, seat.cookie);
  try {
    await page.opened;
    await until('an empty baseline', () => page.values.some((v) => v.type === 'baseline'));
    mkdirSync(folder, { recursive: true });
    await until('the workspace is registered', () => lane.dsh.registry.get(folder)?.title === 'told.tracy.test');
    await until('the page is told', () => page.values.some((v) => v.type === 'upsert' && (v.workspace as Workspace).path === folder), 2000);
  } finally {
    page.close();
  }
});

test('an already-affected seat (folder there, never registered) is healed on its next visit, after a gateway restart', async () => {
  const first = await startLane();
  const folder = siteFolder(first, 'affected');
  mkdirSync(folder, { recursive: true });
  // An older build minted the seat and lost the race; nothing registered the folder since.
  const { cookie } = bookSeat(first, { role: 'owner', email: 'old@tracy.test', site: 'affected.tracy.test', folders: [folder] });
  await closeGateway(first);
  const lane = await startLane({ dir: first.dir, dsh: first.dsh });

  // The HTTP list the 2.6.6 fork healed from (dsh 0.2.0 has no such method): it registers nothing.
  const listed = await post(lane, '/api/workspace/list', JSON.stringify({ type: 'client-request', rpcId: 'l1', method: 'workspace/list', payload: { args: { request: { path: '/elsewhere' } } } }), { cookie });
  assert.equal(listed.status, 200);
  await pause(100);
  assert.equal(lane.dsh.creates(folder), 0, 'the HTTP list is not a visit');

  await visit(lane, cookie);
  await until('the workspace is registered', () => lane.dsh.registry.has(folder));
  assert.equal(lane.dsh.calls.filter((c) => c.method === 'workspace/rename').length, 0, 'no site key is known after a restart, so no title is invented');
  assert.equal(lane.dsh.creates('/elsewhere'), 0, 'nothing named by a request is registered');

  // The next visit serves it, filtered to what the seat holds.
  assert.deepEqual(await visit(lane, cookie), [folder]);
  const creates = lane.dsh.creates(folder);
  await pause(100);
  assert.equal(lane.dsh.creates(folder), creates, 'a registered folder is not asked for again');
});

test('the heal also runs from the workspace/follow baseline, and never for a seat not minted for a site', async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'follow-heal');
  const other = siteFolder(lane, 'master-made');
  mkdirSync(folder, { recursive: true });
  mkdirSync(other, { recursive: true });
  const seat = bookSeat(lane, { role: 'editor', email: 'ed@tracy.test', site: 'follow-heal.tracy.test', folders: [folder] });
  // The baseline lacks the folder: the heal registers it (the page is told at its next baseline, see the TODO case above).
  await visit(lane, seat.cookie);
  await until('the baseline heal registers it', () => lane.dsh.registry.has(folder));
  assert.equal(lane.dsh.registry.get(folder)?.title, 'follow-heal', 'no site key known (no door call), so no title is invented');

  // A master-made account holding a folder is the master's business, not the seat door's.
  const plain = lane.db.createUser('plain-user', '$2a$10$dummyhashdummyhashdummyhashdu');
  lane.db.setPermissions(plain.id, {
    allowedFolders: [other], hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: false,
    allowGitDownload: false, allowWorkspaceCreate: false, allowedAgentPresets: [], disabledSessions: [],
    banned: false, sandboxMode: null,
  });
  await visit(lane, cookieOf(lane, plain.id));
  await pause(200);
  assert.equal(lane.dsh.creates(other), 0);
});

test('a refusal that is not a missing folder is logged once, not retried', async () => {
  const lane = await startLane();
  const file = siteFolder(lane, 'a-file');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, 'not a folder');
  const seat = await mint(lane, 'file@tracy.test', 'a-file.tracy.test', file);
  assert.equal(seat.status, 200);
  await until('the first attempt', () => lane.dsh.creates(file) === 1);
  await pause(1200); // past three retry delays
  assert.equal(lane.dsh.creates(file), 1);
  assert.equal(existsSync(file) && statSync(file).isFile(), true, 'nothing is created in its place');
});

test('sign-in does not wait for dsh: a held registration does not hold the seat answer', async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'held');
  mkdirSync(folder, { recursive: true });
  let release!: () => void;
  lane.dsh.hold = new Promise<void>((resolve) => { release = resolve; });
  const seat = await mint(lane, 'held@tracy.test', 'held.tracy.test', folder);
  assert.equal(seat.status, 200);
  // Ordering, not a time threshold: the answer came back while dsh still held the registration,
  // and the gateway had not given up on that request (a door that waits for dsh answers only after
  // its own RPC timeout, with the registration abandoned).
  await until('dsh has the request', () => lane.dsh.heldNow === 1);
  assert.equal(lane.dsh.abortedCreates, 0, 'the registration was still in flight when the seat got its answer');
  assert.equal(lane.dsh.registry.has(folder), false, 'the answer arrived before dsh registered anything');
  release();
  lane.dsh.hold = null;
  await until('the workspace is registered', () => lane.dsh.registry.has(folder));
  assert.equal(lane.dsh.abortedCreates, 0);
});

test('a seat revoked while its folder is still missing stops the retries', async (t) => {
  // Ordered by events, not by the clock. Timed, a slow runner flaked it both ways (1 in 3 under
  // load): a revoke landing after the first 250 ms retry saw a second create, and a first create
  // reaching dsh after the folder existed registered it.
  const warnings: string[] = [];
  t.mock.method(console, 'warn', (line: unknown) => { warnings.push(String(line)); });
  const lane = await startLane();
  const folder = siteFolder(lane, 'revoked');
  let release!: () => void;
  lane.dsh.hold = new Promise<void>((resolve) => { release = resolve; });
  const seat = await mint(lane, 'gone@tracy.test', 'revoked.tracy.test', folder);
  assert.equal(seat.status, 200);
  // The first attempt is at dsh, held there, while the seat is revoked.
  await until('the first attempt', () => lane.dsh.heldNow === 1);
  const revoked = await signed(lane, '/gateway/seat/revoke', { email: 'gone@tracy.test', site: 'revoked.tracy.test' });
  assert.equal(revoked.status, 200);
  release();
  lane.dsh.hold = null;
  // dsh answers it once released: the folder is still missing, refused.
  await until('the first attempt was refused', () => lane.dsh.createsAnswered === 1);
  mkdirSync(folder, { recursive: true });
  // The chain has ended once it says so, whichever way it ended.
  const ended = (line: string): boolean =>
    line.includes(`site workspace ${folder} not registered`) || line.includes(`site workspace ${folder} not reported`);
  await until('the retry chain ends', () => warnings.some(ended));
  assert.equal(lane.dsh.registry.has(folder), false, 'no retry works on behalf of a revoked seat');
  assert.equal(lane.dsh.creates(folder), 1);
  assert.ok(warnings.some((line) => ended(line) && line.includes('the seat no longer holds it')), warnings.join('\n'));
});

test('closing the gateway ends a pending retry chain', async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'closing');
  const seat = await mint(lane, 'close@tracy.test', 'closing.tracy.test', folder);
  assert.equal(seat.status, 200);
  await until('the first attempt', () => lane.dsh.creates(folder) === 1);
  await closeGateway(lane);
  mkdirSync(folder, { recursive: true });
  await pause(1200);
  assert.equal(lane.dsh.creates(folder), 1);
});

test('a create that landed after the chain gave up, under the folder name, is titled on the next visit', async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'late-land');
  // The chain ends at once on a refusal that is final (a file where the folder will be) …
  mkdirSync(path.dirname(folder), { recursive: true });
  writeFileSync(folder, 'not yet');
  const seat = await mint(lane, 'late@tracy.test', 'late-land.tracy.test', folder);
  assert.equal(seat.status, 200);
  await until('the first attempt', () => lane.dsh.creates(folder) === 1);
  await pause(300);
  // … then the folder is there and dsh holds it under its folder name, as an abandoned create
  // that dsh still carried out would leave it: registered, nothing left to rename it.
  rmSync(folder);
  mkdirSync(folder);
  lane.dsh.registry.set(folder, { workspaceId: 'ws-late', path: folder, title: 'late-land', sessionIds: [] });

  await visit(lane, seat.cookie);
  await until('the site key is the title', () => lane.dsh.registry.get(folder)?.title === 'late-land.tracy.test');
  assert.equal(lane.dsh.registry.size, 1, 'the same workspace is titled, not a second one made');

  // Titled now: a further visit asks dsh for nothing.
  const creates = lane.dsh.creates(folder);
  await visit(lane, seat.cookie);
  await pause(150);
  assert.equal(lane.dsh.creates(folder), creates);
});

test('a title dsh refuses is not asked for again on every visit; a new grant asks once more', async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'taken-title');
  mkdirSync(folder, { recursive: true });
  lane.dsh.refuseRename = 'workspace/name-conflict';
  const seat = await mint(lane, 'taken@tracy.test', 'taken-title.tracy.test', folder);
  assert.equal(seat.status, 200);
  const renames = () => lane.dsh.calls.filter((c) => c.method === 'workspace/rename').length;
  await until('the refused rename', () => renames() === 1);
  await pause(100);
  assert.equal(lane.dsh.registry.get(folder)?.title, 'taken-title', 'the workspace stays usable under its folder name');

  for (let n = 0; n < 3; n += 1) await visit(lane, seat.cookie);
  await pause(150);
  assert.equal(lane.dsh.creates(folder), 1, 'a visit does not ask again for a title dsh refused');
  assert.equal(renames(), 1);

  lane.dsh.refuseRename = null;
  const again = await mint(lane, 'taken@tracy.test', 'taken-title.tracy.test', folder);
  assert.equal(again.status, 200);
  await until('the new grant titles it', () => lane.dsh.registry.get(folder)?.title === 'taken-title.tracy.test');
});

test('a rename lost to a passing fault is asked again on the next visit, and the site key lands', async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'blip');
  mkdirSync(folder, { recursive: true });
  lane.dsh.renameHttpStatus = 502;
  const seat = await mint(lane, 'blip@tracy.test', 'blip.tracy.test', folder);
  assert.equal(seat.status, 200);
  const renames = () => lane.dsh.calls.filter((c) => c.method === 'workspace/rename').length;
  await until('the rename that met a 502', () => renames() === 1);
  await pause(100);
  assert.equal(lane.dsh.registry.get(folder)?.title, 'blip', 'the workspace stays usable under its folder name');

  lane.dsh.renameHttpStatus = null;
  await visit(lane, seat.cookie);
  await until('the next visit titles it', () => lane.dsh.registry.get(folder)?.title === 'blip.tracy.test');
  assert.equal(lane.dsh.registry.get(folder)?.title, 'blip.tracy.test');
  assert.equal(lane.dsh.registry.size, 1, 'the same workspace is titled, not a second one made');
});

test('a rename that keeps failing for passing reasons is asked a bounded number of times, then left', async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'flaky');
  mkdirSync(folder, { recursive: true });
  lane.dsh.renameHttpStatus = 502;
  const seat = await mint(lane, 'flaky@tracy.test', 'flaky.tracy.test', folder);
  assert.equal(seat.status, 200);
  const renames = () => lane.dsh.calls.filter((c) => c.method === 'workspace/rename').length;
  await until('the first rename', () => renames() === 1);
  await pause(100);
  // Each visit waits for the rename it started to end, so visits never join one chain.
  for (let n = 2; n <= 6; n += 1) {
    await visit(lane, seat.cookie);
    await pause(150);
  }
  assert.equal(renames(), 3, 'three misses in all, then the heal stops asking');
  assert.equal(lane.dsh.registry.get(folder)?.title, 'flaky', 'still usable under its folder name');

  // A new grant is a new start: it asks once more.
  lane.dsh.renameHttpStatus = null;
  const again = await mint(lane, 'flaky@tracy.test', 'flaky.tracy.test', folder);
  assert.equal(again.status, 200);
  await until('the new grant titles it', () => lane.dsh.registry.get(folder)?.title === 'flaky.tracy.test');
});

test('visits that join one chain whose rename fails count as one miss, not one each', async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'joined');
  mkdirSync(folder, { recursive: true });
  lane.dsh.renameHttpStatus = 502;
  let release: () => void = () => {};
  lane.dsh.holdRename = new Promise<void>((resolve) => { release = resolve; });
  const seat = await mint(lane, 'joined@tracy.test', 'joined.tracy.test', folder);
  assert.equal(seat.status, 200);
  await until('the rename is in flight', () => lane.dsh.renamesHeldNow === 1);
  // Three visits while it is held: each finds the workspace under its folder name and joins the chain.
  for (let n = 0; n < 3; n += 1) {
    assert.ok((await visit(lane, seat.cookie)).includes(folder));
  }
  await pause(100);
  const renames = () => lane.dsh.calls.filter((c) => c.method === 'workspace/rename').length;
  assert.equal(renames(), 1, 'the visits joined the chain in flight');
  lane.dsh.holdRename = null;
  release();
  await pause(150);
  assert.equal(lane.dsh.registry.get(folder)?.title, 'joined', 'the 502 left the folder name');

  // One miss, not four: the next visit still asks, and the site key lands.
  lane.dsh.renameHttpStatus = null;
  await visit(lane, seat.cookie);
  await until('the next visit titles it', () => lane.dsh.registry.get(folder)?.title === 'joined.tracy.test');
  assert.equal(renames(), 2);
});

test('a grant that changes the site key while the old rename is in flight is titled with the new key', async () => {
  const lane = await startLane();
  const folder = siteFolder(lane, 'rekeyed');
  mkdirSync(folder, { recursive: true });
  lane.dsh.takenTitles.add('old.tracy.test'); // the old key is taken; the new one is free
  let release: () => void = () => {};
  lane.dsh.holdRename = new Promise<void>((resolve) => { release = resolve; });
  const first = await mint(lane, 'rekey@tracy.test', 'old.tracy.test', folder);
  assert.equal(first.status, 200);
  await until('the old rename is in flight', () => lane.dsh.renamesHeldNow === 1);
  const second = await mint(lane, 'rekey@tracy.test', 'new.tracy.test', folder);
  assert.equal(second.status, 200);
  lane.dsh.holdRename = null;
  release();
  await until('the new key is the title', () => lane.dsh.registry.get(folder)?.title === 'new.tracy.test');
  const titles = lane.dsh.calls.filter((c) => c.method === 'workspace/rename').map((c) => c.request.title);
  assert.deepEqual(titles, ['old.tracy.test', 'new.tracy.test'], 'the refusal of the old key was not read as a refusal of the new one');

  // Titled: a visit asks dsh for nothing more.
  await visit(lane, second.cookie);
  await pause(150);
  assert.equal(lane.dsh.calls.filter((c) => c.method === 'workspace/rename').length, 2);
  assert.equal(lane.dsh.creates(folder), 1);
});

// ── TCH plan `tasks/todo-site-row-delete-site.md` step 3: a seat cannot take its site off dsh ────
//
// A site seat's granted folder IS the site: dsh's "Delete workspace" on it only dropped the row
// until the next visit registered it again, and "Rename" retitled the site's workspace for every
// seat. The site row's menu no longer offers either (TCH `@tracy/dsh-my-sites` `site-row-menu.tsx`),
// and the gate refuses them from a seat whatever client sends them. No new rule was needed: upstream
// 2.7.7 lets a subuser rename or remove only a workspace registered under its own account
// (`proxy.ts`, `workspaceOwnedByUser`), and the seat door registers the site folder as the master.
// These cases pin that, so a later change that hands the seat its folder's ownership row is caught.
// (A workspace below the folder never reaches a seat at all: H5 lists only the granted folder.)

/** The workspace id dsh gave `folder`. */
function idOf(lane: Lane, folder: string): string {
  const ws = lane.dsh.registry.get(folder);
  assert.ok(ws, `${folder} is registered`);
  return ws.workspaceId;
}

/** A workspace RPC as dsh's client sends it (`client-request` envelope). */
function workspaceRpc(lane: Lane, cookie: string, method: string, request: Record<string, unknown>) {
  return post(lane, `/api/${method}`, JSON.stringify({ type: 'client-request', rpcId: `r-${method}`, method, payload: { args: { request } } }), { cookie });
}

/** A seat minted for a site whose folder exists and is registered and titled. */
async function siteSeat(lane: Lane, label: string): Promise<{ folder: string; cookie: string; userId: number }> {
  const folder = siteFolder(lane, label);
  mkdirSync(folder, { recursive: true });
  const seat = await mint(lane, `${label}@tracy.test`, `${label}.tracy.test`, folder);
  assert.equal(seat.status, 200);
  await until('the site workspace is titled', () => lane.dsh.registry.get(folder)?.title === `${label}.tracy.test`);
  const token = seat.cookie.slice('dsh_gateway_token='.length);
  const userId = Number((JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { sub: string }).sub);
  // The visit hands the gateway this seat's workspace ids (its filtered baseline).
  assert.deepEqual(await visit(lane, seat.cookie), [folder]);
  return { folder, cookie: seat.cookie, userId };
}

const sent = (lane: Lane, method: string) => lane.dsh.calls.filter((c) => c.method === method).length;

/** The ownership refusal (`gw.workspaceDenied`), not the fail-closed folder one an unmapped id gets. */
function workspaceRefusal(reply: { status: number; body: string }): void {
  assert.equal(reply.status, 403);
  assert.match(reply.body, /workspace|工作区/i);
  assert.doesNotMatch(reply.body, /folder|文件夹/i);
}

test('a seat cannot delete or rename its own site folder workspace: 403, and dsh is not asked', async () => {
  const lane = await startLane();
  const { folder, cookie } = await siteSeat(lane, 'rootdel');
  const renamesBefore = sent(lane, 'workspace/rename');

  const deleted = await workspaceRpc(lane, cookie, 'workspace/delete', { workspaceId: idOf(lane, folder) });
  workspaceRefusal(deleted);
  assert.equal(sent(lane, 'workspace/delete'), 0, 'dsh never saw the delete');
  assert.ok(lane.dsh.registry.has(folder), 'the site workspace is still registered');

  const renamed = await workspaceRpc(lane, cookie, 'workspace/rename', { workspaceId: idOf(lane, folder), title: 'mine now' });
  workspaceRefusal(renamed);
  assert.equal(sent(lane, 'workspace/rename'), renamesBefore, 'dsh never saw the rename');
  assert.equal(lane.dsh.registry.get(folder)?.title, 'rootdel.tracy.test');
});

test('the master is not a seat: it may still delete a site folder workspace', async () => {
  const lane = await startLane();
  const { folder } = await siteSeat(lane, 'admindel');
  const admin = lane.db.createUser('root', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  const deleted = await workspaceRpc(lane, cookieOf(lane, admin.id), 'workspace/delete', { workspaceId: idOf(lane, folder) });
  assert.equal(deleted.status, 200);
  assert.equal(sent(lane, 'workspace/delete'), 1);
  assert.ok(!lane.dsh.registry.has(folder));
});
