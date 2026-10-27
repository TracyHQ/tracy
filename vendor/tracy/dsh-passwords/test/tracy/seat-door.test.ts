// The seat door as it is actually reached: over HTTP, against a running gateway.
//
// seat.test.ts pins the logic; this file pins the wiring — that the door is absent without a
// secret, that it refuses everything unsigned, and that enabling it takes the password form
// away. Those three are the ones that would be a security incident rather than a bug.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { zstdCompressSync } from 'node:zlib';
import type { Server } from 'node:http';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import { AuthService } from '../../src/auth.js';
import { createGatewayServer } from '../../src/gateway.js';
import { signSeatRequest } from '../../src/tracy/seat.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';
import { FenceLedger } from '../../src/tracy/write-fence.js';
import { DSH_RPC_DESCRIPTORS, dshArgumentsRefusal } from './dsh-rpc-fake.js';
import type { PlatformConfig } from '../../src/config.js';

// The seat door is registered in gateway.ts by hook H7. The K1 cases also need the proxy to admit
// every write through the archive door's fence (hook H11, `writeFenceFor(db)` in proxy-hooks.ts).

const SEAT_SECRET = 'seat-secret-for-the-door-test';

interface Lane {
  server: Server;
  port: number;
  db: Database;
  dir: string;
}

function configFor(dir: string, seatSecret: string, upstreamPort: number): PlatformConfig {
  return {
    setupKey: 'test-setup-key',
    dbPath: path.join(dir, 'seat-door.db'),
    dbEncKey: 'testkey',
    gateway: {
      host: '127.0.0.1',
      port: 0,
      upstream: `http://127.0.0.1:${upstreamPort}`,
      tls: null,
      redirectPort: null,
      publicHost: '',
      domain: 'localhost',
      autoTls: false,
      acmeEmail: '',
      acmeStaging: false,
    },
    jwtSecret: 'test-secret',
    internalSecret: 'test-internal',
    seatSecret,
    patch: { dshRoot: '', restartService: '' },
    webSocket: { adminAllowlist: ['/sidebar/ws/terminal'], userAllowlist: ['/sidebar/ws/terminal'] },
  };
}

async function startLane(
  seatSecret: string,
  upstreamPort = 9,
  extra: Partial<PlatformConfig> = {},
  writeFenceLedger?: FenceLedger,
): Promise<Lane> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-seat-door-'));
  const db = new Database(path.join(dir, 'seat-door.db'), createFieldCrypto('testkey', 'testkey'));
  db.init();
  const config = { ...configFor(dir, seatSecret, upstreamPort), ...extra };
  const server = createGatewayServer(config, new AuthService(config, db), db, undefined, { writeFenceLedger });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return { server, port: (server.address() as { port: number }).port, db, dir };
}

function stopLane(lane: Lane | undefined): void {
  if (!lane) return;
  lane.server.close();
  try {
    lane.db.close();
  } catch {
    /* already closed */
  }
  rmSync(lane.dir, { recursive: true, force: true });
}

function call(
  lane: Lane,
  routePath: string,
  body: string,
  headers: Record<string, string> = {},
  method = 'POST',
): Promise<{ status: number; body: string; setCookie: string[] }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: lane.port,
        method,
        path: routePath,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            setCookie: res.headers['set-cookie'] ?? [],
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

/** A correctly signed call, as the Worker will make it. */
function signed(lane: Lane, routePath: string, payload: unknown, secret = SEAT_SECRET, now = Date.now()) {
  const body = JSON.stringify(payload);
  const { timestamp, nonce, signature } = signSeatRequest({ secret, method: 'POST', path: routePath, body, now });
  return call(lane, routePath, body, {
    'x-seat-timestamp': timestamp,
    'x-seat-nonce': nonce,
    'x-seat-signature': signature,
  });
}

let open: Lane | undefined;
let closed: Lane | undefined;

before(async () => {
  open = await startLane(SEAT_SECRET);
  closed = await startLane('');
});

after(() => {
  stopLane(open);
  stopLane(closed);
});

test('L2: without a secret the door does not exist and the password form still does', async () => {
  const lane = closed as Lane;
  const absent = await signed(lane, '/gateway/seat/session', { role: 'guest', folders: ['/work/alpha'] });
  assert.equal(absent.status, 404);

  const login = await call(lane, '/gateway/login', '', {}, 'GET');
  assert.equal(login.status, 200, 'upstream behaviour must be untouched when Tracy adds nothing');
});

test('L2: with a secret the password form is gone', async () => {
  const lane = open as Lane;
  for (const [method, route] of [
    ['GET', '/gateway/login'],
    ['POST', '/gateway/login'],
    ['POST', '/gateway/setup'],
  ] as const) {
    const res = await call(lane, route, '', {}, method);
    assert.equal(res.status, 404, `${method} ${route} must not be reachable beside the seat door`);
  }
});

test('L1: an unsigned or wrongly signed request never mints a session', async () => {
  const lane = open as Lane;
  const payload = JSON.stringify({ role: 'editor', email: 'person@example.com', folders: ['/work/alpha'] });

  const bare = await call(lane, '/gateway/seat/session', payload);
  assert.equal(bare.status, 403);
  assert.match(bare.body, /"reason":"missing"/);

  const wrongKey = await signed(lane, '/gateway/seat/session', { role: 'editor', email: 'person@example.com' }, 'other-lane');
  assert.equal(wrongKey.status, 403);
  assert.match(wrongKey.body, /"reason":"signature"/);

  const stale = await signed(
    lane,
    '/gateway/seat/session',
    { role: 'editor', email: 'person@example.com' },
    SEAT_SECRET,
    Date.now() - 61_000,
  );
  assert.equal(stale.status, 403);
  assert.match(stale.body, /"reason":"stale"/);

  assert.equal(lane.db.countUsers(), 0, 'no refused call may leave an account behind');
});

test('L1: a signed grant mints a session cookie, and a replay of it does not', async () => {
  const lane = open as Lane;
  const body = JSON.stringify({ role: 'editor', email: 'person@example.com', folders: ['/work/alpha'] });
  const sig = signSeatRequest({ secret: SEAT_SECRET, method: 'POST', path: '/gateway/seat/session', body });
  const headers = {
    'x-seat-timestamp': sig.timestamp,
    'x-seat-nonce': sig.nonce,
    'x-seat-signature': sig.signature,
  };

  const first = await call(lane, '/gateway/seat/session', body, headers);
  assert.equal(first.status, 200);
  const parsed = JSON.parse(first.body) as { ok: boolean; username: string; created: boolean; token: string };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.created, true);
  assert.ok(parsed.token.length > 0);
  assert.ok(
    first.setCookie.some((line) => line.startsWith('dsh_gateway_token=') && line.includes('HttpOnly')),
    'the Worker plants this cookie in the browser; without HttpOnly it would be readable by the page',
  );

  const replay = await call(lane, '/gateway/seat/session', body, headers);
  assert.equal(replay.status, 403);
  assert.match(replay.body, /"reason":"replay"/);
});

test('L3: a seat role without a proven email is refused', async () => {
  const lane = open as Lane;
  const res = await signed(lane, '/gateway/seat/session', { role: 'owner', folders: ['/work/alpha'] });
  assert.equal(res.status, 400);
  assert.match(res.body, /proven email/);
});

test('L3: a relative or traversing folder is refused', async () => {
  const lane = open as Lane;
  for (const folders of [['work/alpha'], ['/work/../etc'], ['/'], ['']]) {
    const res = await signed(lane, '/gateway/seat/session', { role: 'editor', email: 'a@tracy.ai', folders });
    assert.equal(res.status, 400, `folders=${JSON.stringify(folders)} must be refused`);
  }
});

test('S7/V3: revoking through the door bumps the credential version the JWT carries', async () => {
  const lane = open as Lane;
  await signed(lane, '/gateway/seat/session', {
    role: 'developer',
    email: 'revoke-me@tracy.ai',
    folders: ['/work/alpha'],
  });
  const before = JSON.parse(
    (await signed(lane, '/gateway/seat/whoami', { email: 'revoke-me@tracy.ai' })).body,
  ) as { seat: { username: string; folders: string[] } | null };
  assert.ok(before.seat, 'the seat must be visible before it is taken back');
  const cv = lane.db.getUserByUsername(before.seat.username)?.credential_version ?? -1;

  const res = await signed(lane, '/gateway/seat/revoke', { email: 'revoke-me@tracy.ai' });
  assert.equal(res.status, 200);

  const after = lane.db.getUserByUsername(before.seat.username);
  assert.ok((after?.credential_version ?? -1) > cv);
  const perms = lane.db.getPermissions(after?.id ?? 0);
  assert.deepEqual(perms?.allowed_folders, ['__deny__']);
});

test('S14: the sweep refuses a zero-day cutoff rather than deleting everyone working', async () => {
  const lane = open as Lane;
  const res = await signed(lane, '/gateway/seat/sweep', { olderThanDays: 0 });
  assert.equal(res.status, 400);
  assert.match(res.body, /at least 1/);
});

test('L11: whoami reports nothing for an address that holds no seat', async () => {
  const lane = open as Lane;
  const res = await signed(lane, '/gateway/seat/whoami', { email: 'stranger@tracy.ai' });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, seat: null });
});

// ── A home of one's own: the onboarding lane ────────────────────────────────────────────────
//
// A grant may name `home` instead of a shared folder. The door then owns the folder: it makes
// `<home>/<account name>`, registers it with dsh as a workspace, and grants exactly that. This
// is what keeps one newcomer's session list from showing the newcomer before them.

interface UpstreamCall {
  method: string;
  args: Record<string, unknown>;
}

let dsh: Server | undefined;
let dshCalls: UpstreamCall[] = [];
let homed: Lane | undefined;

/** What the fake dsh's `session/list` answers; a test that changes it puts it back. */
const idleRows = ['s-old-1', 's-old-2', 's-other', 'session-g1'].map((sessionId) => ({
  sessionId,
  running: false,
  agentAvailable: true,
  updatedAt: 1,
  blank: false,
}));
let listRows: unknown[] = idleRows;
/** Awaited by the fake dsh before it answers a `session/list`; a test that sets it puts it back. */
let onList: (() => Promise<void>) | null = null;
/** When each `session/create`/`session/prompt` reached the fake dsh, and whether the folder was still there. */
let arrivals: { method: string; folderThere: boolean }[] = [];
/** Awaited by the fake dsh before it answers a `session/create`; a test that sets it puts it back. */
let onCreate: (() => Promise<void>) | null = null;
/** What the fake dsh did, in order: `list` for each `session/list` it received, `create answered` when it answered one. */
let dshOrder: string[] = [];
/** When set, the fake dsh drops the connection of a `session/create` it has read whole, before answering. */
let cutCreate = false;
let arrivalFolder = '';
/** The fake dsh's port once it listens: root `before` hooks do not wait for each other. */
let resolveDshPort!: (port: number) => void;
const dshPort = new Promise<number>((resolve) => {
  resolveDshPort = resolve;
});

before(async () => {
  dsh = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        rpcId: string;
        method: string;
        payload: { args: Record<string, unknown> };
      };
      dshCalls.push({ method: body.method, args: body.payload.args });
      // #591: a call to an endpoint the gateway sends dsh is refused the way dsh's gateway refuses
      // a wrong argument shape (dsh-rpc-fake.ts); browser calls this fake also serves pass through.
      const refusal = Object.hasOwn(DSH_RPC_DESCRIPTORS, body.method) ? dshArgumentsRefusal(body.method, body.payload.args) : null;
      if (refusal !== null) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result: { ok: false, error: refusal } }));
        return;
      }
      if (body.method === 'session/create' && cutCreate) {
        dshOrder.push('create cut');
        req.socket.destroy();
        return;
      }
      if (body.method === 'session/create' || body.method === 'session/prompt') {
        arrivals.push({ method: body.method, folderThere: arrivalFolder !== '' && existsSync(arrivalFolder) });
      }
      const request = (body.payload.args.request ?? {}) as Record<string, unknown>;
      const value =
        body.method === 'workspace/create'
          ? String(request.path).startsWith('/site/')
            ? { workspace: { workspaceId: 'ws-site', path: request.path, sessionIds: ['s-old-1', 's-old-2'] }, created: false }
            : { workspace: { workspaceId: 'ws-personal', path: request.path, title: 'hash' }, created: true }
          : body.method === 'session/create' && /^(session-widget-|wo-demo-)/.test(String(request.sessionId))
            ? { sessionId: request.sessionId }
          : body.method === 'session/cancel'
            ? { accepted: true }
            : body.method === 'session/list'
              ? { items: listRows }
              : { workspace: { workspaceId: request.workspaceId, title: request.title } };
      const answer = () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value } }));
      };
      if (body.method === 'session/list') dshOrder.push('list');
      if (body.method === 'session/list' && onList !== null) void onList().then(answer);
      else if (body.method === 'session/create' && onCreate !== null) {
        void onCreate().then(() => {
          dshOrder.push('create answered');
          answer();
        });
      } else answer();
    });
  });
  await new Promise<void>((resolve) => dsh!.listen(0, '127.0.0.1', () => resolve()));
  resolveDshPort((dsh!.address() as { port: number }).port);
  homed = await startLane(SEAT_SECRET, (dsh!.address() as { port: number }).port);
});

after(() => {
  stopLane(homed);
  dsh?.close();
});

test('S11: a grant naming `home` gets its own folder under it, registered with dsh, and nothing shared', async () => {
  const lane = homed as Lane;
  dshCalls = [];
  const root = mkdtempSync(path.join(os.tmpdir(), 'dshpw-seat-home-root-'));
  try {
    const res = await signed(lane, '/gateway/seat/session', {
      role: 'guest',
      email: 'Newcomer@Tracy.ai',
      home: root,
      folders: [],
    });
    assert.equal(res.status, 200, res.body);
    const parsed = JSON.parse(res.body) as { username: string };
    const personal = path.join(root, parsed.username);
    const user = lane.db.getUserByUsername(parsed.username);
    assert.deepEqual(
      lane.db.getPermissions(user?.id ?? 0)?.allowed_folders,
      [personal],
      'the whitelist is the person’s own folder — never the shared root, which is everyone’s',
    );
    assert.ok(existsSync(personal), 'the folder exists before the browser asks the picker to open it');
    assert.deepEqual(dshCalls, [
      { method: 'workspace/create', args: { request: { path: personal } } },
      { method: 'workspace/rename', args: { request: { workspaceId: 'ws-personal', title: 'newcomer@tracy.ai' } } },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('S11: `home` needs a proven email — a visitor gets a new name per session and would litter the lane', async () => {
  const lane = homed as Lane;
  const users = lane.db.countUsers();
  const res = await signed(lane, '/gateway/seat/session', { role: 'guest', home: os.tmpdir(), folders: [] });
  assert.equal(res.status, 400);
  assert.match(res.body, /home requires a proven email/);
  assert.equal(lane.db.countUsers(), users);
});

test('S11: a `home` root the lane does not have refuses the mint and leaves no account behind', async () => {
  const lane = homed as Lane;
  const users = lane.db.countUsers();
  const res = await signed(lane, '/gateway/seat/session', {
    role: 'guest',
    email: 'nowhere@tracy.ai',
    home: path.join(os.tmpdir(), 'dshpw-no-such-root-' + String(process.pid)),
    folders: [],
  });
  assert.equal(res.status, 502);
  assert.match(res.body, /personal workspace/);
  assert.equal(lane.db.countUsers(), users, 'a seat with a folder that cannot open is worse than no seat');
});

test('K2: forgetting a deleted site\'s folder archives its sessions and removes the workspace in dsh', async () => {
  // A site added again at the same label lands in the same folder, and dsh indexes sessions by
  // folder: without this the new site opened onto the old site's conversations (measured 14/09).
  const lane = homed as Lane;
  dshCalls = [];
  const res = await signed(lane, '/gateway/seat/forget-workspace', { path: '/site/example-site' });
  assert.equal(res.status, 200, res.body);
  assert.deepEqual(JSON.parse(res.body), { ok: true, archived: ['s-old-1', 's-old-2'], deleted: true });
  assert.deepEqual(dshCalls, [
    { method: 'workspace/create', args: { request: { path: '/site/example-site' } } },
    { method: 'workspace/archiveSession', args: { request: { sessionId: 's-old-1', stopActivity: true } } },
    { method: 'workspace/archiveSession', args: { request: { sessionId: 's-old-2', stopActivity: true } } },
    // #561: the Stop button's own door. Whether the turns ended is proven where the folder moves.
    { method: 'session/cancel', args: { request: { sessionId: 's-old-1' } } },
    { method: 'session/cancel', args: { request: { sessionId: 's-old-2' } } },
    { method: 'workspace/delete', args: { request: { workspaceId: 'ws-site' } } },
  ]);
});

test('K2: forgetting a workspace refuses unsigned calls and paths that are not one absolute folder', async () => {
  const lane = homed as Lane;
  dshCalls = [];
  const bare = await call(lane, '/gateway/seat/forget-workspace', JSON.stringify({ path: '/site/example-site' }));
  assert.equal(bare.status, 403);
  for (const path of [undefined, 'site/example-site', '/', '/site/../etc', 7]) {
    const res = await signed(lane, '/gateway/seat/forget-workspace', { path });
    assert.equal(res.status, 400, `path=${JSON.stringify(path)} must be refused`);
  }
  assert.deepEqual(dshCalls, [], 'a refused call never reaches dsh');
});

// ── A deleted site's session folder leaves the live store ─────────────────────────────────────
//
// session-archive.test.ts pins the rules; these pin the door: signed, one `/site/<label>` path,
// a refusal is a 409 that names its reason, and a move answers where the folder went.

let archiving: Lane | undefined;
let archiveTree = '';

before(async () => {
  archiveTree = mkdtempSync(path.join(os.tmpdir(), 'dshpw-archive-door-'));
  const home = path.join(archiveTree, 'desk-home');
  const sites = path.join(archiveTree, 'site');
  for (const [label, id] of [
    ['gone', 'session-g1'],
    ['live', 'session-l1'],
    ['waiting', 'session-w1'],
    ['fenced', 'session-f1'],
  ] as const) {
    const dir = path.join(home, 'sessions', `--site-${label}--`, id);
    mkdirSync(dir, { recursive: true });
    const header = `${JSON.stringify({ type: 'session', version: 4, id, createdAt: 1, cwd: `/site/${label}` })}\n`;
    writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(header)));
  }
  mkdirSync(path.join(sites, 'live'), { recursive: true });
  // The fake dsh above answers `session/list`: the door asks it what still runs before it moves (#561).
  archiving = await startLane(SEAT_SECRET, await dshPort, {
    sessionArchive: { dshHome: home, sitesRoot: sites },
  });
});

after(() => {
  stopLane(archiving);
  if (archiveTree !== '') rmSync(archiveTree, { recursive: true, force: true });
});

test('K3: archiving a deleted site moves its session folder and says where', async () => {
  const lane = archiving as Lane;
  const res = await signed(lane, '/gateway/seat/archive-sessions', { path: '/site/gone' });
  assert.equal(res.status, 200, res.body);
  const body = JSON.parse(res.body) as { ok: boolean; archivedTo: string; sessions: number };
  assert.equal(body.ok, true);
  assert.equal(body.sessions, 1);
  assert.match(body.archivedTo, /^gone-\d{8}T\d{6}Z$/);
  const home = path.join(archiveTree, 'desk-home');
  assert.deepEqual(readdirSync(path.join(home, 'sessions')).sort(), ['--site-fenced--', '--site-live--', '--site-waiting--']);
  assert.deepEqual(readdirSync(path.join(home, 'sessions-archive', body.archivedTo)), ['session-g1']);

  const again = await signed(lane, '/gateway/seat/archive-sessions', { path: '/site/gone' });
  assert.equal(again.status, 409);
  assert.equal((JSON.parse(again.body) as { reason: string }).reason, 'NO_SESSION_FOLDER');
});

// #561: a deleted site's turn waiting on its customer's answer holds no lease. The door archives and
// stops it through dsh's own doors, and keeps the folder while dsh still reports it running.
test('K3: a deleted site whose turn dsh still reports running is stopped, and keeps its session folder until it ends', async () => {
  const lane = archiving as Lane;
  dshCalls = [];
  const waiting = { ...idleRows[0], sessionId: 'session-w1', cwd: '/site/waiting' };
  try {
    listRows = [...idleRows, { ...waiting, running: true }];
    const res = await signed(lane, '/gateway/seat/archive-sessions', { path: '/site/waiting' });
    assert.equal(res.status, 409, res.body);
    assert.equal((JSON.parse(res.body) as { reason: string }).reason, 'SESSION_ACTIVE');
    assert.deepEqual(dshCalls, [
      { method: 'session/list', args: { _request: {} } },
      { method: 'workspace/archiveSession', args: { request: { sessionId: 'session-w1', stopActivity: true } } },
      { method: 'session/cancel', args: { request: { sessionId: 'session-w1' } } },
      { method: 'session/list', args: { _request: {} } },
    ]);
    assert.ok(existsSync(path.join(archiveTree, 'desk-home', 'sessions', '--site-waiting--', 'session-w1')));
    // Once dsh says the turn ended, the same call moves it.
    listRows = [...idleRows, waiting];
    const moved = await signed(lane, '/gateway/seat/archive-sessions', { path: '/site/waiting' });
    assert.equal(moved.status, 200, moved.body);
  } finally {
    listRows = idleRows;
  }
});

// #561, review: after the last `session/list`, a `session/create` at the site's path or a
// `session/prompt` into one of its sessions could still reach dsh before the rename. Revoking the
// site's seats first does not stop every account: a guest seat holds no address, so the seat book
// cannot name it to revoke, and the master is no seat. The door therefore runs its last check and
// the rename under the gateway's write fence: requests sent in that window are held, and once the
// folder has moved those that reach into the site are REFUSED — never forwarded late, where a create
// would recreate the deleted site's folder and a prompt land in a moved session. Another site's
// request is held, then goes on. A revoked seat's is refused at sign-in.
const fencedMaster = (lane: Lane): string => {
  const existing = lane.db.getUserByUsername('fence-master');
  const master = existing ?? lane.db.createUser('fence-master', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  return `dsh_gateway_token=${jwt.sign({ sub: String(master.id), username: master.username, cv: 0 }, 'test-secret', {
    expiresIn: '12h',
  })}`;
};
const rpcBody = (method: string, request: Record<string, unknown>, rpcId = `rpc-${method}`) =>
  JSON.stringify({ type: 'client-request', rpcId, method, payload: { args: { request } } });

test('K1: a create and a prompt sent between the last list and the rename are refused and never reach dsh', async () => {
  const lane = archiving as Lane;
  const folder = path.join(archiveTree, 'desk-home', 'sessions', '--site-fenced--');
  const mint = async (grant: Record<string, unknown>) => {
    const res = await signed(lane, '/gateway/seat/session', grant);
    assert.equal(res.status, 200, res.body);
    return `dsh_gateway_token=${(JSON.parse(res.body) as { token: string }).token}`;
  };
  const guest = await mint({ role: 'guest', folders: ['/site/fenced'] });
  const revoked = await mint({ role: 'editor', email: 'fenced-editor@tracy.ai', folders: ['/site/fenced'] });
  assert.equal((await signed(lane, '/gateway/seat/revoke', { email: 'fenced-editor@tracy.ai' })).status, 200);
  const masterCookie = fencedMaster(lane);
  const rpc = (cookie: string, method: string, request: Record<string, unknown>) =>
    call(lane, `/api/${method}`, rpcBody(method, request, `rpc-${method}-${cookie.length}`), {
      cookie,
      accept: 'application/json',
    });

  let lists = 0;
  let sent: Promise<{ status: number; body: string }>[] = [];
  listRows = [...idleRows, { ...idleRows[0], sessionId: 'session-f1', cwd: '/site/fenced' }];
  arrivals = [];
  arrivalFolder = folder;
  onList = async () => {
    lists += 1;
    if (lists !== 4) return;
    // The last list, under the fence: settled once to stop, then checked again (two lists each).
    sent = [
      rpc(guest, 'session/create', { cwd: '/site/fenced' }),
      rpc(masterCookie, 'session/create', { cwd: '/site/fenced' }),
      rpc(masterCookie, 'session/prompt', { sessionId: 'session-f1', content: [{ type: 'text', text: 'hi' }] }),
      rpc(revoked, 'session/create', { cwd: '/site/fenced' }),
      // Another site's customer, sending at the same moment.
      rpc(masterCookie, 'session/prompt', { sessionId: 's-other', content: [{ type: 'text', text: 'hi' }] }),
    ];
    // Long enough for an unfenced gateway to have forwarded all of them.
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(arrivals, [], 'nothing reaches dsh while the fence is up');
  };
  try {
    const res = await signed(lane, '/gateway/seat/archive-sessions', { path: '/site/fenced' });
    assert.equal(res.status, 200, res.body);
    assert.equal(lists, 4);
    const [guestCreate, masterCreate, masterPrompt, revokedCreate, otherPrompt] = await Promise.all(sent);
    assert.equal(existsSync(folder), false);
    for (const [who, answer] of [
      ['the guest\'s create', guestCreate],
      ['the master\'s create', masterCreate],
      ['the master\'s prompt', masterPrompt],
    ] as const) {
      assert.equal(answer.status, 409, `${who}: ${answer.body}`);
      assert.equal((JSON.parse(answer.body) as { reason: string }).reason, 'SITE_ARCHIVED', who);
    }
    // Refused at sign-in (the token's credential version moved): a redirect or a 401, never an answer from dsh.
    assert.ok([302, 401, 403].includes(revokedCreate.status), `revoked seat answered ${String(revokedCreate.status)}`);
    assert.equal(otherPrompt.status, 200, otherPrompt.body);
    assert.deepEqual(
      arrivals,
      [{ method: 'session/prompt', folderThere: false }],
      'only the other site\'s prompt reached dsh, after the rename',
    );
  } finally {
    onList = null;
    listRows = idleRows;
    arrivals = [];
    arrivalFolder = '';
  }
});

// #561, review: the fence used to count a request as ended once its CLIENT left, and the proxy then
// cut the request to dsh off. dsh does not stop a command when its caller goes: a `session/create`
// it had received kept running, and the last check and the rename could run while it still wrote.
// Now a request dsh holds whole is let finish, and counts until dsh answers it.
test('K1: a create whose client left while dsh was still making it holds the last check until dsh answers', async () => {
  const lane = archiving as Lane;
  const home = path.join(archiveTree, 'desk-home');
  const dir = path.join(home, 'sessions', '--site-left--', 'session-left');
  mkdirSync(dir, { recursive: true });
  const header = `${JSON.stringify({ type: 'session', version: 4, id: 'session-left', createdAt: 1, cwd: '/site/left' })}\n`;
  writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(header)));
  let reachedDsh!: () => void;
  const reached = new Promise<void>((resolve) => {
    reachedDsh = resolve;
  });
  let finishCreate!: () => void;
  const createFinished = new Promise<void>((resolve) => {
    finishCreate = resolve;
  });
  dshOrder = [];
  listRows = [...idleRows, { ...idleRows[0], sessionId: 'session-left', cwd: '/site/left' }];
  onCreate = async () => {
    reachedDsh();
    await createFinished;
  };
  try {
    // The master opens a session elsewhere, and closes the tab while dsh is still making it.
    const body = rpcBody('session/create', { cwd: '/site/elsewhere' }, 'rpc-left');
    const left = http.request({
      host: '127.0.0.1',
      port: lane.port,
      method: 'POST',
      path: '/api/session/create',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        cookie: fencedMaster(lane),
        accept: 'application/json',
      },
    });
    left.on('error', () => {});
    left.end(body);
    await reached;
    left.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const archived = signed(lane, '/gateway/seat/archive-sessions', { path: '/site/left' });
    // The first settle runs outside the fence; the last check under it must wait for dsh.
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(dshOrder, ['list', 'list'], 'the check under the fence has not begun while dsh is still creating');
    finishCreate();
    const res = await archived;
    assert.equal(res.status, 200, res.body);
    assert.deepEqual(dshOrder, ['list', 'list', 'create answered', 'list', 'list']);
    assert.equal(existsSync(path.join(home, 'sessions', '--site-left--')), false);
  } finally {
    finishCreate();
    onCreate = null;
    dshOrder = [];
    listRows = idleRows;
  }
});

// #561, review: the fence also took a connection to dsh that closed with no answer as the request's
// end. When dsh had the whole body, that close proves nothing — dsh may still be making the session
// (a reset, a dropped socket) — so the last check and the rename could run under it. Such a request
// is an unknown outcome: the door keeps the folder and says so, and holds no other site's write for it.
test('K1: a create dsh read whole whose connection dropped before the answer keeps the folder in place', async () => {
  const home = path.join(archiveTree, 'desk-home');
  const folder = path.join(home, 'sessions', '--site-cut--');
  mkdirSync(path.join(folder, 'session-cut'), { recursive: true });
  const header = `${JSON.stringify({ type: 'session', version: 4, id: 'session-cut', createdAt: 1, cwd: '/site/cut' })}\n`;
  writeFileSync(path.join(folder, 'session-cut', 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(header)));
  // A lane of its own: the doubt it learns stays with it (and, in a real gateway, in its marker).
  const lane = await startLane(SEAT_SECRET, await dshPort, {
    sessionArchive: { dshHome: home, sitesRoot: path.join(archiveTree, 'site') },
  });
  const cookie = fencedMaster(lane);
  const rpc = (method: string, request: Record<string, unknown>, rpcId: string) =>
    call(lane, `/api/${method}`, rpcBody(method, request, rpcId), { cookie, accept: 'application/json' });
  dshOrder = [];
  listRows = [...idleRows, { ...idleRows[0], sessionId: 'session-cut', cwd: '/site/cut' }];
  cutCreate = true;
  try {
    const create = await rpc('session/create', { cwd: '/site/elsewhere' }, 'rpc-cut');
    assert.equal(create.status, 502, create.body);
    cutCreate = false;
    for (const attempt of ['first', 'again']) {
      const res = await signed(lane, '/gateway/seat/archive-sessions', { path: '/site/cut' });
      assert.equal(res.status, 409, `${attempt}: ${res.body}`);
      const answer = JSON.parse(res.body) as { reason: string; detail?: string; error?: string };
      assert.equal(answer.reason, 'SESSION_ACTIVE', attempt);
      assert.match(res.body, /unknown/, attempt);
      assert.ok(existsSync(path.join(folder, 'session-cut')), `${attempt}: the folder stays`);
    }
    // Only the settle outside the fence asked dsh anything; nothing ran under a fence.
    assert.deepEqual(dshOrder, ['create cut', 'list', 'list', 'list', 'list']);
    // No write is held for a move that cannot happen.
    const other = await rpc('session/prompt', { sessionId: 's-other', content: [{ type: 'text', text: 'hi' }] }, 'rpc-other');
    assert.equal(other.status, 200, other.body);
  } finally {
    cutCreate = false;
    dshOrder = [];
    listRows = idleRows;
    stopLane(lane);
  }
});

// #561, review: the fence's doubt lived in memory, so a gateway restarted while dsh still ran a
// create it had sent started at zero and could move the folder under it. The marker each gateway
// keeps (write-fence.ts `FenceLedger`) makes the next one keep the folder until that dsh is gone.
test('K1: a gateway restarted while dsh still makes a create keeps the folder in place until that dsh is gone', async () => {
  const home = path.join(archiveTree, 'desk-home');
  const folder = path.join(home, 'sessions', '--site-restart--');
  mkdirSync(path.join(folder, 'session-restart'), { recursive: true });
  const header = `${JSON.stringify({ type: 'session', version: 4, id: 'session-restart', createdAt: 1, cwd: '/site/restart' })}\n`;
  writeFileSync(path.join(folder, 'session-restart', 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(header)));
  const markers = mkdtempSync(path.join(os.tmpdir(), 'dshpw-fence-markers-'));
  const alive = new Set([4242]);
  const isAlive = (pid: number): boolean => alive.has(pid);
  const extra = { sessionArchive: { dshHome: home, sitesRoot: path.join(archiveTree, 'site') } };
  let reachedDsh!: () => void;
  const reached = new Promise<void>((resolve) => {
    reachedDsh = resolve;
  });
  let finishCreate!: () => void;
  const createFinished = new Promise<void>((resolve) => {
    finishCreate = resolve;
  });
  listRows = [...idleRows, { ...idleRows[0], sessionId: 'session-restart', cwd: '/site/restart' }];
  onCreate = async () => {
    reachedDsh();
    await createFinished;
  };
  const lanes: Lane[] = [];
  try {
    const first = await startLane(SEAT_SECRET, await dshPort, extra, new FenceLedger(markers, { boot: 'boot-1', pid: 4242 }, isAlive));
    lanes.push(first);
    const body = rpcBody('session/create', { cwd: '/site/elsewhere' }, 'rpc-restart');
    const sent = http.request({
      host: '127.0.0.1',
      port: first.port,
      method: 'POST',
      path: '/api/session/create',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), cookie: fencedMaster(first), accept: 'application/json' },
    });
    sent.on('error', () => {});
    sent.end(body);
    await reached;
    // The first gateway dies with the create still at dsh: it releases nothing.
    sent.destroy();
    stopLane(first);

    const restarted = await startLane(SEAT_SECRET, await dshPort, extra, new FenceLedger(markers, { boot: 'boot-1', pid: 4242 }, isAlive));
    lanes.push(restarted);
    const kept = await signed(restarted, '/gateway/seat/archive-sessions', { path: '/site/restart' });
    assert.equal(kept.status, 409, kept.body);
    assert.equal((JSON.parse(kept.body) as { reason: string }).reason, 'SESSION_ACTIVE');
    assert.match(kept.body, /earlier gateway/);
    assert.ok(existsSync(path.join(folder, 'session-restart')), 'the folder stays while that dsh may still write');

    // That dsh exits, ending the create with it; a gateway of the next dsh moves the folder.
    finishCreate();
    alive.delete(4242);
    const nextBoot = await startLane(SEAT_SECRET, await dshPort, extra, new FenceLedger(markers, { boot: 'boot-2', pid: 5151 }, isAlive));
    lanes.push(nextBoot);
    // The restarted gateway of the old dsh is gone with it; its marker is swept by the next boot too.
    const moved = await signed(nextBoot, '/gateway/seat/archive-sessions', { path: '/site/restart' });
    assert.equal(moved.status, 200, moved.body);
    assert.equal(existsSync(folder), false);
  } finally {
    finishCreate();
    onCreate = null;
    listRows = idleRows;
    for (const lane of lanes) stopLane(lane);
    rmSync(markers, { recursive: true, force: true });
  }
});

// H9 (K1): the ledger `serve-gateway` passes (cli.ts → `writeFenceLedger`) must belong to the fence
// the proxy counts writes through. A ledger on a fence of its own saw no request, so a gateway
// leaving with a create still at dsh removed its marker and the next one forgot that doubt.
test('K1: a gateway that leaves with a create still at dsh keeps its fence marker', async () => {
  const markers = mkdtempSync(path.join(os.tmpdir(), 'dshpw-fence-markers-'));
  const ledger = new FenceLedger(markers, { boot: 'boot-leave', pid: 4343 }, () => true);
  let reachedDsh!: () => void;
  const reached = new Promise<void>((resolve) => {
    reachedDsh = resolve;
  });
  let finishCreate!: () => void;
  const createFinished = new Promise<void>((resolve) => {
    finishCreate = resolve;
  });
  onCreate = async () => {
    reachedDsh();
    await createFinished;
  };
  const lane = await startLane(SEAT_SECRET, await dshPort, {}, ledger);
  try {
    const body = rpcBody('session/create', { cwd: '/site/elsewhere' }, 'rpc-leave');
    const sent = http.request({
      host: '127.0.0.1',
      port: lane.port,
      method: 'POST',
      path: '/api/session/create',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), cookie: fencedMaster(lane), accept: 'application/json' },
    });
    sent.on('error', () => {});
    sent.end(body);
    await reached;
    // The process exits now (fence-ledger.ts releases the ledger on `exit`).
    ledger.release();
    assert.equal(readdirSync(markers).filter((name) => name.endsWith('.json')).length, 1, 'the marker stays while dsh may still write');
    sent.destroy();
  } finally {
    finishCreate();
    onCreate = null;
    stopLane(lane);
    rmSync(markers, { recursive: true, force: true });
  }
});

test('K3: a site that still exists keeps its session folder, and the refusal says why', async () => {
  const lane = archiving as Lane;
  const res = await signed(lane, '/gateway/seat/archive-sessions', { path: '/site/live' });
  assert.equal(res.status, 409);
  assert.equal((JSON.parse(res.body) as { reason: string }).reason, 'SITE_STILL_EXISTS');
  assert.ok(existsSync(path.join(archiveTree, 'desk-home', 'sessions', '--site-live--')));
});

test('K3: archiving refuses unsigned calls and anything that is not one /site/<label>', async () => {
  const lane = archiving as Lane;
  const bare = await call(lane, '/gateway/seat/archive-sessions', JSON.stringify({ path: '/site/live' }));
  assert.equal(bare.status, 403);
  for (const target of [undefined, 7, '/site', '/site/', '/etc', '/desk-home/onboarding', '/site/a/b', '/site/../desk-home', 'site/live']) {
    const res = await signed(lane, '/gateway/seat/archive-sessions', { path: target });
    assert.equal(res.status, 400, `path=${JSON.stringify(target)} must be refused`);
  }
  assert.ok(existsSync(path.join(archiveTree, 'desk-home', 'sessions', '--site-live--')));
});

// ── One dsh, many sites: a seat per (person, site) ────────────────────────────────────────────
//
// The wiring half of seat.test.ts's rows. What is pinned here is that `site` travels through the
// door at all — it is inside the signed body, so a caller cannot add it after the fact — and that
// the two mints come back as two accounts rather than one account minted twice.

/** The user id a lane session token is bound to. Folder checks are made against THIS, not a name. */
function subjectOf(token: string): string {
  const [, payload] = token.split('.');
  return String((JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string }).sub);
}

test('S7: two sites for one address mint two seats, each with its own folders', async () => {
  const lane = open as Lane;
  const email = 'twosites@tracy.ai';

  const alpha = await signed(lane, '/gateway/seat/session', {
    role: 'editor', email, site: 'alpha.example', folders: ['/site/alpha'],
  });
  const beta = await signed(lane, '/gateway/seat/session', {
    role: 'owner', email, site: 'beta.example', folders: ['/site/beta'],
  });

  assert.equal(alpha.status, 200);
  assert.equal(beta.status, 200);
  const a = JSON.parse(alpha.body) as { username: string; token: string; created: boolean };
  const b = JSON.parse(beta.body) as { username: string; token: string; created: boolean };
  assert.notEqual(a.username, b.username, 'one account for two sites is one grant overwriting the other');
  assert.equal(b.created, true, 'the second site is a NEW seat, not an update of the first');
  // The token is bound to the account id, so a token minted for alpha can never be answered with
  // beta's folders — the folder check reads the id, never the address.
  assert.notEqual(subjectOf(a.token), subjectOf(b.token));

  const ask = async (site: string) =>
    JSON.parse((await signed(lane, '/gateway/seat/whoami', { email, site })).body) as {
      seat: { folders: string[]; banned: boolean } | null;
    };
  assert.deepEqual((await ask('alpha.example')).seat?.folders, ['/site/alpha']);
  assert.deepEqual((await ask('beta.example')).seat?.folders, ['/site/beta']);

  // Revocation is by ADDRESS and reaches both, which is the whole reason the site half is appended
  // to the person half instead of mixed into it.
  const revoked = JSON.parse((await signed(lane, '/gateway/seat/revoke', { email })).body) as {
    revoked: number | null; revokedIds: number[];
  };
  assert.equal(revoked.revokedIds.length, 2, `both seats, got ${JSON.stringify(revoked.revokedIds)}`);
  assert.equal(revoked.revoked, revoked.revokedIds[0], 'the old single-id field still answers truthfully');
  assert.equal((await ask('alpha.example')).seat?.banned, true);
  assert.equal((await ask('beta.example')).seat?.banned, true);
});

test('S7: revoking ONE site takes back one account and leaves the other sitting', async () => {
  // 🔒 A SEAT IS A FACT ABOUT ONE SITE. The seat book revokes per site; before `site` reached this
  // door, removing someone from `example-site` banned every account of that address on the host, so
  // their live `joomlatest` session died mid-turn. It healed on the next navigation — which is
  // exactly what stops anyone from ever noticing.
  const lane = open as Lane;
  const email = 'two-sites-one-revoke@tracy.ai';
  await signed(lane, '/gateway/seat/session', {
    role: 'owner', email, site: 'alpha.example', folders: ['/site/alpha'],
  });
  await signed(lane, '/gateway/seat/session', {
    role: 'owner', email, site: 'beta.example', folders: ['/site/beta'],
  });
  const ask = async (site: string) =>
    JSON.parse((await signed(lane, '/gateway/seat/whoami', { email, site })).body) as {
      seat: { folders: string[]; banned: boolean } | null;
    };

  const revoked = JSON.parse(
    (await signed(lane, '/gateway/seat/revoke', { email, site: 'alpha.example' })).body,
  ) as { revoked: number | null; revokedIds: number[] };

  assert.equal(revoked.revokedIds.length, 1, `one site, one account: ${JSON.stringify(revoked.revokedIds)}`);
  assert.equal((await ask('alpha.example')).seat?.banned, true, 'the seat that was taken back');
  assert.equal((await ask('beta.example')).seat?.banned, false, 'the one nobody asked about');
  assert.deepEqual((await ask('beta.example')).seat?.folders, ['/site/beta'], 'and it keeps its folders');
});

test('S7: a site that is not a string is refused, rather than quietly becoming no site at all', async () => {
  const lane = open as Lane;
  const res = await signed(lane, '/gateway/seat/session', {
    role: 'editor', email: 'typed@tracy.ai', site: 7, folders: ['/site/alpha'],
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /site must be a non-empty string/);
});


test('native onboarding allocation stays behind the signed door and records only the exact created grant', async () => {
  const lane = homed as Lane;
  const root = mkdtempSync(path.join(os.tmpdir(), 'dshpw-native-home-'));
  const sessionId = 'session-widget-22222222-2222-4222-8222-222222222222';
  const grant = { role: 'editor', email: 'native@example.test', site: '~onboarding', home: root,
    folders: [], toolsets: ['content'], nativeSession: { sessionId, agentPreset: 'designer-wordpress' } };
  try {
    dshCalls = [];
    assert.equal((await call(lane, '/gateway/seat/session', JSON.stringify(grant))).status, 403);
    assert.equal(dshCalls.length, 0);
    assert.equal((await signed(lane, '/gateway/seat/session', { ...grant, folders: ['/site/other'] })).status, 400);
    assert.equal(dshCalls.length, 0);
    for (let i = 0; i < 2; i++) {
      const response = await signed(lane, '/gateway/seat/session', grant);
      assert.equal(response.status, 200, response.body);
      const body = JSON.parse(response.body) as { username: string; nativeSession: { sessionId: string; workspaceId: string } };
      assert.deepEqual(body.nativeSession, { sessionId, workspaceId: 'ws-personal' });
      const user = lane.db.getUserByUsername(body.username)!;
      assert.deepEqual(tracyStoreOf(lane.db)?.honouredGrants(user.id), [sessionId]);
      assert.deepEqual(lane.db.getPermissions(user.id)?.allowed_folders, [path.join(root, body.username)]);
    }
    assert.equal(dshCalls.filter(c => c.method === 'session/create').length, 2);
    assert.ok(dshCalls.every(c => ['workspace/create', 'workspace/rename', 'session/create'].includes(c.method)));
    for (const c of dshCalls.filter(c => c.method === 'session/create'))
      assert.deepEqual(c.args, { request: { workspaceId: 'ws-personal', sessionId, agentPreset: 'designer-wordpress' } });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('signed site allocation holds one identity across retries; browser-chosen IDs remain refused', async () => {
  const lane = homed as Lane;
  const sessionId = 'wo-demo-33333333-3333-4333-8333-333333333333';
  const grant = { role: 'owner', email: 'site-native@example.test', site: 'demo.example.test', folders: ['/site/demo'],
    siteSession: { sessionId, agentPreset: 'designer-emdash' } };
  dshCalls = [];
  assert.equal((await call(lane, '/gateway/seat/session', JSON.stringify(grant))).status, 403);
  assert.equal((await signed(lane, '/gateway/seat/session', { ...grant, role: 'editor' })).status, 400);
  assert.equal(dshCalls.length, 0);
  let token = '';
  for (let i = 0; i < 2; i++) {
    const response = await signed(lane, '/gateway/seat/session', grant);
    assert.equal(response.status, 200, response.body);
    const body = JSON.parse(response.body);
    token = body.token;
    assert.deepEqual(body.siteSession, { sessionId, workspaceId: 'ws-site' });
    const user = lane.db.getUserByUsername(body.username)!;
    assert.deepEqual(tracyStoreOf(lane.db)?.honouredGrants(user.id), [sessionId]);
  }
  assert.equal(dshCalls.filter(c => c.method === 'session/create').length, 2);
  assert.ok(dshCalls.every(c => ['workspace/create', 'workspace/rename', 'session/create'].includes(c.method)));
  const rpc = (method: string, request: object) => call(lane, `/api/${method}`, JSON.stringify({
    type: 'client-request', rpcId: 'browser-check', method, payload: { args: { request } }
  }), { cookie: `dsh_gateway_token=${token}` });
  assert.equal((await rpc('workspace/create', { path: '/site/demo' })).status, 200);
  dshCalls = [];
  assert.equal((await rpc('session/create', { workspaceId: 'ws-site', sessionId: 'wo-demo-44444444-4444-4444-8444-444444444444', agentPreset: 'designer-emdash' })).status, 403);
  assert.equal(dshCalls.filter(c => c.method === 'session/create').length, 0);
});

test('a site allocation cannot grant another account\'s identity or return a token on conflict', async () => {
  const lane = homed as Lane;
  const sessionId = 'wo-demo-55555555-5555-4555-8555-555555555555';
  const grant = { role: 'owner', email: 'first-native@example.test', site: 'demo.example.test', folders: ['/site/demo'],
    siteSession: { sessionId, agentPreset: 'designer-emdash' } };
  assert.equal((await signed(lane, '/gateway/seat/session', grant)).status, 200);
  const response = await signed(lane, '/gateway/seat/session', { ...grant, email: 'second-native@example.test' });
  assert.equal(response.status, 502);
  assert.equal(JSON.parse(response.body).token, undefined);
  assert.deepEqual(response.setCookie, []);
});

test('revocation while native site allocation is waiting prevents a grant and token', async () => {
  const lane = homed as Lane;
  const sessionId = 'wo-demo-66666666-6666-4666-8666-666666666666';
  const grant = { role: 'owner', email: 'revoke-native@example.test', site: 'demo.example.test', folders: ['/site/demo'],
    siteSession: { sessionId, agentPreset: 'designer-emdash' } };
  onCreate = async () => {
    assert.equal((await signed(lane, '/gateway/seat/revoke', { email: grant.email, site: grant.site })).status, 200);
  };
  try {
    const response = await signed(lane, '/gateway/seat/session', grant);
    assert.equal(response.status, 502);
    assert.equal(JSON.parse(response.body).token, undefined);
    assert.deepEqual(response.setCookie, []);
    assert.ok(!lane.db.listUsers().some(u => tracyStoreOf(lane.db)?.honouredGrants(u.id).includes(sessionId)));
  } finally { onCreate = null; }
});
