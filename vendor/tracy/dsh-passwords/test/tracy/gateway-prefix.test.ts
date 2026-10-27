// The gateway behind a reverse proxy that publishes it under a path.
//
// Tracy's Worker serves every lane under `cowork.tracy.ai/<siteKey>/…` and names that prefix in
// `x-forwarded-prefix`. The gateway takes the prefix off before routing (its own `/gateway/*`
// doors keep their root paths), puts it back on everything it hands to the browser — form
// actions, redirects, cookie paths — and forwards the request to dsh with the prefix still on
// the path plus the header, so dsh anchors its `<base href>` at the mount. Without the header
// nothing changes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import jwt from 'jsonwebtoken';

import { createGatewayServer } from '../../src/gateway.js';
import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import { signSeatRequest } from '../../src/tracy/seat.js';
import type { PlatformConfig } from '../../src/config.js';

// x-forwarded-prefix from trusted proxies is hook H0, the seat door hook H7. Upstream answers a
// signed-out manifest probe 204 itself; Tracy sends it to dsh (hook H12).

const SEAT_SECRET = 'lane-secret-for-prefix-test';
/** What dsh's static build serves at `manifest.webmanifest` (shape of `apps/web/public`). */
const MANIFEST = '{"name":"DeepSeek Harness","short_name":"DSH","start_url":"./","scope":"./"}';

interface Lane {
  server: http.Server;
  port: number;
  db: Database;
  dir: string;
}

let upstream: http.Server;
let upstreamPort = 0;
let seen: { url: string; headers: http.IncomingHttpHeaders }[] = [];
let lane: Lane;
let seatLane: Lane;
let cookie = '';

function startUpstream(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      seen.push({ url: req.url ?? '', headers: req.headers });
      if ((req.url ?? '').split('?')[0]!.endsWith('/manifest.webmanifest')) {
        res.writeHead(200, { 'content-type': 'application/manifest+json', 'content-length': String(Buffer.byteLength(MANIFEST)) });
        res.end(req.method === 'HEAD' ? undefined : MANIFEST);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html', 'content-length': '4' });
      res.end('page');
    });
    server.on('upgrade', (req, socket) => {
      seen.push({ url: req.url ?? '', headers: req.headers });
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      socket.end();
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function configFor(dir: string, seatSecret: string, upstreamAt = upstreamPort, tracy?: PlatformConfig['tracy']): PlatformConfig {
  return {
    setupKey: 'test-setup-key',
    dbPath: path.join(dir, 'prefix.db'),
    dbEncKey: 'testkey',
    gateway: {
      host: '127.0.0.1',
      port: 0,
      upstream: `http://127.0.0.1:${upstreamAt}`,
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
    webSocket: { adminAllowlist: ['/sidebar/ws/terminal'], userAllowlist: [] },
    ...(tracy === undefined ? {} : { tracy }),
  };
}

async function startLane(seatSecret: string, upstreamAt = upstreamPort, tracy?: PlatformConfig['tracy']): Promise<Lane> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-prefix-'));
  const db = new Database(path.join(dir, 'prefix.db'), createFieldCrypto('testkey', 'testkey'));
  db.init();
  const config = configFor(dir, seatSecret, upstreamAt, tracy);
  const server = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return { server, port: (server.address() as { port: number }).port, db, dir };
}

function stopLane(l: Lane | undefined): void {
  if (!l) return;
  l.server.close();
  try {
    l.db.close();
  } catch {
    /* already closed */
  }
  rmSync(l.dir, { recursive: true, force: true });
}

function request(
  l: Lane,
  routePath: string,
  headers: Record<string, string> = {},
  method = 'GET',
  body = '',
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders; setCookie: string[] }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: l.port,
        method,
        path: routePath,
        headers: body === '' ? headers : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers,
            setCookie: res.headers['set-cookie'] ?? [],
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

function upgrade(l: Lane, routePath: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: l.port,
      path: routePath,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...headers,
      },
    });
    req.once('upgrade', (res, socket) => {
      socket.destroy();
      resolve(`101 ${String(res.statusCode)}`);
    });
    req.once('response', (res) => {
      res.resume();
      res.once('end', () => resolve(String(res.statusCode)));
    });
    // A /gateway/* upgrade is dropped without an answer (upstream's own refusal): no upgrade either.
    req.once('error', (error: NodeJS.ErrnoException) => (error.code === 'ECONNRESET' ? resolve('reset') : reject(error)));
    req.end();
  });
}

const MOUNT = { 'x-forwarded-prefix': '/site.example' };

before(async () => {
  upstream = await startUpstream();
  upstreamPort = (upstream.address() as { port: number }).port;
  lane = await startLane('');
  seatLane = await startLane(SEAT_SECRET);
  const user = lane.db.createUser('admin', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  const token = jwt.sign({ sub: String(user.id), username: user.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  cookie = `dsh_gateway_token=${token}`;
});

after(() => {
  stopLane(lane);
  stopLane(seatLane);
  upstream?.close();
});

test('K5: the sign-in page under a mount posts back to the mount, and scopes its cookies to it', async () => {
  const mounted = await request(lane, '/site.example/gateway/login', MOUNT);
  assert.equal(mounted.status, 200);
  assert.match(mounted.body, /action="\/site\.example\/gateway\/login"/);
  assert.match(mounted.body, /href="\/site\.example\/gateway\/login\?/);
  assert.ok(mounted.setCookie.some((c) => /^dsh_csrf=.*; Path=\/site\.example\/gateway;/.test(c)), String(mounted.setCookie));

  const bare = await request(lane, '/gateway/login');
  assert.equal(bare.status, 200);
  assert.match(bare.body, /action="\/gateway\/login"/);
  assert.ok(bare.setCookie.some((c) => /^dsh_csrf=.*; Path=\/gateway;/.test(c)), String(bare.setCookie));
});

test('K5: a signed-out navigation under a mount is sent to the mounted door, with a mount-relative next', async () => {
  const res = await request(lane, '/site.example/html', { ...MOUNT, accept: 'text/html' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/site.example/gateway/login?next=%2Fhtml');
});

test('K5: a proxied request keeps the prefix on the upstream path and carries the header to dsh', async () => {
  seen = [];
  const mounted = await request(lane, '/site.example/html?q=1', { ...MOUNT, cookie });
  assert.equal(mounted.status, 200);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.url, '/site.example/html?q=1');
  assert.equal(seen[0]!.headers['x-forwarded-prefix'], '/site.example');

  // Without the header the same path is an ordinary path: forwarded as-is, no header invented.
  seen = [];
  const bare = await request(lane, '/site.example/html', { cookie });
  assert.equal(bare.status, 200);
  assert.equal(seen[0]!.url, '/site.example/html');
  assert.equal(seen[0]!.headers['x-forwarded-prefix'], undefined);
});

test('K5: a malformed or non-matching prefix is dropped, not forwarded half-applied', async () => {
  for (const bad of ['site.example', '/site.example/', '/a/../b', '/', 'https://x/y', '/elsewhere']) {
    seen = [];
    const res = await request(lane, '/site.example/html', { 'x-forwarded-prefix': bad, cookie });
    assert.equal(res.status, 200, bad);
    assert.equal(seen[0]!.url, '/site.example/html', bad);
    assert.equal(seen[0]!.headers['x-forwarded-prefix'], undefined, `${bad} must not reach dsh`);
  }
});

test('K5: an upgrade under a mount is forwarded with the prefix on the path and the header', async () => {
  seen = [];
  const status = await upgrade(lane, '/site.example/sidebar/ws/terminal', { ...MOUNT, cookie });
  assert.match(status, /^101/);
  assert.equal(seen[0]!.url, '/site.example/sidebar/ws/terminal');
  assert.equal(seen[0]!.headers['x-forwarded-prefix'], '/site.example');
});

test('K5: the seat door answers under a mount, with the signature computed on its root path', async () => {
  const body = JSON.stringify({ role: 'guest', folders: ['/work/alpha'] });
  const { timestamp, nonce, signature } = signSeatRequest({ secret: SEAT_SECRET, method: 'POST', path: '/gateway/seat/session', body });
  const res = await request(
    seatLane,
    '/site.example/gateway/seat/session',
    { ...MOUNT, 'x-seat-timestamp': timestamp, 'x-seat-nonce': nonce, 'x-seat-signature': signature },
    'POST',
    body,
  );
  assert.notEqual(res.status, 404);
  assert.doesNotMatch(res.body, /"reason":"signature"/);
  assert.equal(res.status, 200, res.body);
  assert.ok(res.setCookie.some((c) => /^dsh_gateway_token=.*; Path=\/site\.example;/.test(c)), String(res.setCookie));
});

// TCH #519: the browser fetches `<link rel="manifest">` without cookies, so behind the gate the
// manifest only ever met the sign-in redirect and every workspace page logged "Manifest: Line: 1,
// column: 1, Syntax error.". The static manifest now passes to dsh signed out — that exact path,
// read methods only; everything next to it still meets the door.
for (const l of ['password lane', 'seat lane'] as const) {
  test(`R11: ${l}: a signed-out GET/HEAD of the manifest reaches dsh at the root and under a mount`, async () => {
    const target = l === 'seat lane' ? seatLane : lane;
    for (const [routePath, headers, upstreamPath] of [
      ['/manifest.webmanifest', {}, '/manifest.webmanifest'],
      ['/site.example/manifest.webmanifest', MOUNT, '/site.example/manifest.webmanifest'],
      ['/manifest.webmanifest?v=2', {}, '/manifest.webmanifest?v=2'],
    ] as const) {
      seen = [];
      const got = await request(target, routePath, { ...headers });
      assert.equal(got.status, 200, routePath);
      assert.equal(got.headers['content-type'], 'application/manifest+json', routePath);
      assert.deepEqual(JSON.parse(got.body), JSON.parse(MANIFEST));
      assert.equal(seen.length, 1);
      assert.equal(seen[0]!.url, upstreamPath);
      // Signed out means nothing of the gate's own rides along: no session cookie invented.
      assert.doesNotMatch(String(seen[0]!.headers.cookie ?? ''), /dsh_gateway_token/);

      seen = [];
      const head = await request(target, routePath, { ...headers }, 'HEAD');
      assert.equal(head.status, 200, `HEAD ${routePath}`);
      assert.equal(head.headers['content-type'], 'application/manifest+json');
      assert.equal(seen.length, 1);
    }
  });

  test(`R11: ${l}: paths next to the manifest, write methods and upgrades still meet the door`, async () => {
    const target = l === 'seat lane' ? seatLane : lane;
    for (const routePath of [
      '/manifest.webmanifest/',
      '/manifest.webmanifest/x',
      '/manifest.webmanifestx',
      '/manifest.webmanifest.js',
      '/x/manifest.webmanifest',
      '/api/manifest.webmanifest',
      '/manifest.json',
      '/favicon.svg',
      '/',
    ]) {
      seen = [];
      const got = await request(target, routePath, { accept: 'text/html' });
      assert.notEqual(got.status, 200, routePath);
      assert.equal(seen.length, 0, `${routePath} must not reach dsh signed out`);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      seen = [];
      const got = await request(target, '/manifest.webmanifest', { accept: 'text/html' }, method);
      assert.notEqual(got.status, 200, method);
      assert.equal(seen.length, 0, `${method} must not reach dsh signed out`);
    }
    seen = [];
    assert.doesNotMatch(await upgrade(target, '/manifest.webmanifest', {}), /^101/);
    assert.equal(seen.length, 0);
  });
}

test('K5: a manifest request whose dsh is down gets the proxy error, not a manifest the gate made up', async () => {
  const closed = http.createServer();
  await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', () => resolve()));
  const deadPort = (closed.address() as { port: number }).port;
  await new Promise<void>((resolve) => closed.close(() => resolve()));
  const dead = await startLane('', deadPort);
  try {
    const got = await request(dead, '/manifest.webmanifest');
    assert.ok(got.status >= 500, String(got.status));
    assert.notEqual(got.headers['content-type'], 'application/manifest+json');
  } finally {
    stopLane(dead);
  }
});

test('K5/H0: a seat cannot reach an owner-only socket by putting it under a mount', async () => {
  const body = JSON.stringify({ role: 'editor', email: 'ws-mount@tracy.ai', folders: ['/site/alpha'] });
  const sig = signSeatRequest({ secret: SEAT_SECRET, method: 'POST', path: '/gateway/seat/session', body });
  const minted = await request(
    seatLane,
    '/gateway/seat/session',
    { 'x-seat-timestamp': sig.timestamp, 'x-seat-nonce': sig.nonce, 'x-seat-signature': sig.signature },
    'POST',
    body,
  );
  assert.equal(minted.status, 200, minted.body);
  const seatCookie = `dsh_gateway_token=${(JSON.parse(minted.body) as { token: string }).token}`;
  for (const [route, headers] of [
    ['/sidebar/ws/terminal', {}],
    ['/site.example/sidebar/ws/terminal', MOUNT],
    ['/site.example/sidebar/ws/agent-terminals', MOUNT],
    ['/site.example/gateway/anything', MOUNT],
  ] as const) {
    seen = [];
    const status = await upgrade(seatLane, route, { ...headers, cookie: seatCookie });
    assert.doesNotMatch(status, /^101/, route);
    assert.equal(seen.length, 0, `${route}: nothing reached dsh`);
  }
});

// Logout under a mount (H0 + H12): the session cookie a door set lives at `Path=<mount>`, so the
// clearing cookie must name that path, and the person is sent to the lane's open sign-in door —
// with a seat secret upstream's `/gateway/login` is a 404.
const SITE_DOOR = { origin: 'https://cowork.example', seatsOrigin: '', siteKey: 'site.example', actorSecret: 'actor-secret', siteLabel: 'site-example' };

async function mintSeat(l: Lane, headers: Record<string, string>, routePath: string, email: string): Promise<string> {
  const body = JSON.stringify({ role: 'editor', email, folders: ['/site/alpha'] });
  const sig = signSeatRequest({ secret: SEAT_SECRET, method: 'POST', path: '/gateway/seat/session', body });
  const minted = await request(l, routePath,
    { ...headers, 'x-seat-timestamp': sig.timestamp, 'x-seat-nonce': sig.nonce, 'x-seat-signature': sig.signature }, 'POST', body);
  assert.equal(minted.status, 200, minted.body);
  return `dsh_gateway_token=${(JSON.parse(minted.body) as { token: string }).token}`;
}

test('K5/L5: logout under a mount clears the cookie at the mount and sends the person to the Tracy door there', async () => {
  const doorLane = await startLane(SEAT_SECRET, upstreamPort, SITE_DOOR);
  try {
    const seatCookie = await mintSeat(doorLane, MOUNT, '/site.example/gateway/seat/session', 'logout@tracy.ai');
    const out = await request(doorLane, '/site.example/gateway/logout',
      { ...MOUNT, cookie: seatCookie, origin: `http://127.0.0.1:${doorLane.port}` }, 'POST');
    assert.equal(out.status, 302, out.body);
    assert.equal(out.headers.location, '/site.example/gateway/tracy');
    assert.ok(out.setCookie.some((c) => /^dsh_gateway_token=; Path=\/site\.example;.*Max-Age=0/.test(c)), String(out.setCookie));
    // The token itself is revoked too: the same cookie no longer opens anything.
    seen = [];
    const after = await request(doorLane, '/site.example/html', { ...MOUNT, cookie: seatCookie, accept: 'text/html' });
    assert.notEqual(after.status, 200);
    assert.equal(seen.length, 0);
  } finally { stopLane(doorLane); }
});

test('K5: logout at the root of a password lane keeps upstream\'s answer', async () => {
  // Its own account: a revoked token must not be the one the other cases still use.
  const user = lane.db.createUser('leaving', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  const leaving = `dsh_gateway_token=${jwt.sign({ sub: String(user.id), username: user.username, cv: 0 }, 'test-secret', { expiresIn: '1h' })}`;
  const out = await request(lane, '/gateway/logout', { cookie: leaving, origin: `http://127.0.0.1:${lane.port}` }, 'POST');
  assert.equal(out.status, 302);
  assert.equal(out.headers.location, '/gateway/login');
  assert.ok(out.setCookie.some((c) => /^dsh_gateway_token=; Path=\/;/.test(c)), String(out.setCookie));
});

// Decision (plan §5, 05/10/2026): no seat opens a terminal socket, the `code` toolset included —
// at the root and under a mount. Only the master's terminal reaches dsh.
test('R5/S8: a seat minted with the code toolset still opens no terminal socket; dsh sees no upgrade', async () => {
  const body = JSON.stringify({ role: 'admin', email: 'coder@tracy.ai', folders: ['/site/alpha'], toolsets: ['content', 'code'] });
  const sig = signSeatRequest({ secret: SEAT_SECRET, method: 'POST', path: '/gateway/seat/session', body });
  const minted = await request(seatLane, '/gateway/seat/session',
    { 'x-seat-timestamp': sig.timestamp, 'x-seat-nonce': sig.nonce, 'x-seat-signature': sig.signature }, 'POST', body);
  assert.equal(minted.status, 200, minted.body);
  const coder = `dsh_gateway_token=${(JSON.parse(minted.body) as { token: string }).token}`;
  for (const [route, headers] of [
    ['/sidebar/ws/terminal', {}],
    ['/sidebar/ws/agent-terminals', {}],
    ['/site.example/sidebar/ws/terminal', MOUNT],
  ] as const) {
    seen = [];
    assert.doesNotMatch(await upgrade(seatLane, route, { ...headers, cookie: coder }), /^101/, route);
    assert.equal(seen.length, 0, `${route}: nothing reached dsh`);
  }
});
