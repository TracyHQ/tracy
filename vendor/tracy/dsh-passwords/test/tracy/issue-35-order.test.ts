// Issue #35 meets the Tracy layer: upstream's same-origin check (`originHostMatches`) still decides
// a cross-site write before any Tracy hook lets it through, and it reads the same hosts when the
// request arrives under a mount prefix (H0).
//
// Upstream's own Issue #35 cases (`test/issue-35-favicon-csrf.test.ts`) run unchanged under the
// pass-through policy; these run with the Tracy layer on.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import { createGatewayServer } from '../../src/gateway.js';
import { signSeatRequest } from '../../src/tracy/seat.js';
import type { PlatformConfig } from '../../src/config.js';

const SEAT_SECRET = 'issue-35-seat-secret';
const MOUNT = { 'x-forwarded-prefix': '/site.example' };
const EVIL = 'https://evil.example';

let dir = '';
let db: Database;
let upstream: http.Server;
let gateway: http.Server;
let port = 0;
let seen: { method: string; url: string }[] = [];
let seatsCalls: string[] = [];
const realFetch = globalThis.fetch;

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-issue35-'));
  upstream = http.createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '' });
    req.resume();
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  db = new Database(path.join(dir, 'i35.db'), createFieldCrypto('k', 'k'));
  db.init();
  const config: PlatformConfig = {
    setupKey: 'setup', dbPath: path.join(dir, 'i35.db'), dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${String((upstream.address() as { port: number }).port)}`,
      tls: null, redirectPort: null, publicHost: 'cowork.tracy.ai', domain: '', autoTls: false, acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'jwt', internalSecret: 'internal', patch: { dshRoot: '', restartService: '' }, endpointRules: [],
    seatSecret: SEAT_SECRET,
    tracy: { origin: 'https://cowork.tracy.ai', seatsOrigin: '', siteKey: 'tracy.ai', actorSecret: 'actor', siteLabel: '' },
  };
  gateway = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  port = (gateway.address() as { port: number }).port;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seatsCalls.push(new URL(String(input instanceof Request ? input.url : input)).pathname);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
  gateway?.close();
  upstream?.close();
  db?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function send(
  method: string,
  routePath: string,
  headers: Record<string, string>,
  body = '',
): Promise<{ status: number; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: routePath, headers: { 'content-length': String(Buffer.byteLength(body)), ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

async function seatCookie(): Promise<string> {
  const body = JSON.stringify({ role: 'editor', email: 'csrf-seat@tracy.ai', folders: ['/site/alpha'] });
  const sig = signSeatRequest({ secret: SEAT_SECRET, method: 'POST', path: '/gateway/seat/session', body });
  const res = await send('POST', '/gateway/seat/session', {
    'content-type': 'application/json',
    'x-seat-timestamp': sig.timestamp,
    'x-seat-nonce': sig.nonce,
    'x-seat-signature': sig.signature,
  }, body);
  assert.equal(res.status, 200, res.body);
  return `dsh_gateway_token=${(JSON.parse(res.body) as { token: string }).token}`;
}

function masterCookie(): string {
  const admin = db.getUserByUsername('i35-master') ?? db.createUser('i35-master', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  return `dsh_gateway_token=${jwt.sign({ sub: String(admin.id), username: admin.username, cv: 0 }, 'jwt', { expiresIn: '1h' })}`;
}

test('Issue #35/H1+H2: a seat’s cross-site write on a route Tracy checks gets upstream’s CSRF refusal, and dsh gets nothing', async () => {
  const cookie = await seatCookie();
  // A body Tracy's H2 would refuse too (a session the seat does not hold): the answer must still be
  // the same-origin refusal, which comes first and reads no body.
  for (const [route, mounted] of [['/sidebar/api/fs.read', {}], ['/site.example/sidebar/api/fs.read', MOUNT]] as const) {
    seen = [];
    const res = await send('POST', route, { cookie, origin: EVIL, 'content-type': 'application/json', ...mounted }, JSON.stringify({ sessionId: 'not-mine' }));
    assert.equal(res.status, 403, `${route}: ${res.body}`);
    assert.match(res.type, /text\/plain/, `${route}: upstream's CSRF answer, not a Tracy page`);
    assert.equal(res.body, '403 Forbidden');
    assert.deepEqual(seen, [], `${route}: nothing reached dsh`);
  }
});

test('Issue #35/H7: the Tracy sign-in door refuses a cross-site form post before it asks the seat book anything', async () => {
  for (const [route, form] of [
    ['/gateway/tracy/email', 'email=victim%40tracy.ai&next=%2F'],
    ['/gateway/tracy/start', 'provider=google&next=%2F'],
    ['/gateway/tracy/code', 'ticket=x&code=123456'],
    ['/site.example/gateway/tracy/email', 'email=victim%40tracy.ai&next=%2F'],
  ] as const) {
    seatsCalls = [];
    const res = await send('POST', route, { origin: EVIL, 'content-type': 'application/x-www-form-urlencoded', ...MOUNT }, form);
    assert.equal(res.status, 403, `${route}: ${res.body}`);
    assert.deepEqual(seatsCalls, [], `${route}: no seat-book call on a cross-site post`);
  }
  // The same post from the page itself (no Origin, as a non-browser; or the gateway's own origin) goes on.
  seatsCalls = [];
  const own = await send('POST', '/gateway/tracy/email', {
    origin: `http://127.0.0.1:${String(port)}`,
    'content-type': 'application/x-www-form-urlencoded',
  }, 'email=me%40tracy.ai&next=%2F');
  assert.equal(own.status, 200, own.body);
  assert.deepEqual(seatsCalls, ['/auth/otp/start']);
});

test('Issue #35/H0: under a mount, the same-origin check reads the same hosts — the mount is a path, never a host', async () => {
  const cookie = masterCookie();
  // Same origin as the gateway itself, under the mount: forwarded, prefix kept for dsh.
  seen = [];
  const own = await send('POST', '/site.example/api/anything', { cookie, origin: `http://127.0.0.1:${String(port)}`, 'content-type': 'application/json', ...MOUNT }, '{}');
  assert.equal(own.status, 200, own.body);
  assert.deepEqual(seen, [{ method: 'POST', url: '/site.example/api/anything' }]);
  // The configured public host (the Tracy origin a browser shows), under the mount: forwarded.
  seen = [];
  const pub = await send('POST', '/site.example/api/anything', { cookie, origin: 'https://cowork.tracy.ai', 'content-type': 'application/json', ...MOUNT }, '{}');
  assert.equal(pub.status, 200, pub.body);
  assert.equal(seen.length, 1);
  // Another host, with or without the mount, and even when it names the mount as its path: refused, nothing forwarded.
  for (const origin of [EVIL, 'https://evil.example/site.example', 'null']) {
    for (const [route, mounted] of [['/site.example/api/anything', MOUNT], ['/api/anything', {}]] as const) {
      seen = [];
      const res = await send('POST', route, { cookie, origin, 'content-type': 'application/json', ...mounted }, '{}');
      assert.equal(res.status, 403, `${origin} ${route}`);
      assert.deepEqual(seen, [], `${origin} ${route}: nothing reached dsh`);
    }
  }
});
