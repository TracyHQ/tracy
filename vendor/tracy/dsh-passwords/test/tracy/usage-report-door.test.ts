// K4 through the gateway: `POST /gateway/api/usage/report` lets a seat's few composers report at
// once (a bucket of four, one back every 5 s) where upstream answered every second report inside
// 5 s with 429. Upstream's own same-origin and session checks still run FIRST: a refused request
// spends nothing (Issue #35's order — CSRF before any Tracy hook).
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
import { USAGE_REPORT_BURST } from '../../src/tracy/usage-report-limit.js';
import type { PlatformConfig } from '../../src/config.js';

let dir = '';
let db: Database;
let gateway: http.Server;
let port = 0;

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-usage-door-'));
  db = new Database(path.join(dir, 'usage.db'), createFieldCrypto('k', 'k'));
  db.init();
  const config: PlatformConfig = {
    setupKey: 'setup', dbPath: path.join(dir, 'usage.db'), dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: 'http://127.0.0.1:9', tls: null, redirectPort: null,
      publicHost: '', domain: 'localhost', autoTls: false, acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'jwt', internalSecret: 'internal', patch: { dshRoot: '', restartService: '' }, endpointRules: [],
  };
  gateway = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  port = (gateway.address() as { port: number }).port;
});

after(() => {
  gateway?.close();
  db?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function cookieFor(username: string): string {
  const user = db.createUser(username, '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  return `dsh_gateway_token=${jwt.sign({ sub: String(user.id), username: user.username, cv: 0 }, 'jwt', { expiresIn: '1h' })}`;
}

function report(cookie: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  const body = JSON.stringify({ tokens: 10 });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1', port, method: 'POST', path: '/gateway/api/usage/report',
        headers: { cookie, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('K4: a seat reports up to the burst at once; the next one inside 5 s is 429', async () => {
  const cookie = cookieFor('burst-user');
  for (let i = 0; i < USAGE_REPORT_BURST; i += 1) {
    const res = await report(cookie);
    assert.equal(res.status, 200, `report ${String(i + 1)}: ${res.body}`);
  }
  const over = await report(cookie);
  assert.equal(over.status, 429, over.body);
});

test('K4/Issue #35: a cross-site report is refused by upstream’s check first and spends nothing', async () => {
  const cookie = cookieFor('csrf-user');
  for (let i = 0; i < USAGE_REPORT_BURST + 2; i += 1) {
    const forged = await report(cookie, { origin: 'https://evil.example' });
    assert.equal(forged.status, 403, forged.body);
    assert.match(forged.body, /FORBIDDEN_CSRF/);
  }
  const own = await report(cookie);
  assert.equal(own.status, 200, 'refused requests left the bucket full');
});

test('K4: no session is upstream’s 401, not a rate limit', async () => {
  const res = await report('dsh_gateway_token=nope');
  assert.equal(res.status, 401, res.body);
});
