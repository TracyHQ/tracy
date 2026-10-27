// Q1 (hook H10, admin save): the conversations the master hands a seat in /admin are grants the
// seat can read. Upstream writes those rows with no origin; a private seat reads only `created`
// and `master` rows (`src/tracy/persistence.ts`), so without the hook a master's save handed an
// editor seat nothing — and left it reading less than before.
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
import { tracyStoreOf } from '../../src/tracy/persistence.js';
import type { PlatformConfig } from '../../src/config.js';

let dir = '';
let db: Database;
let gateway: http.Server;
let upstream: http.Server;
let port = 0;
let master = '';

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-master-grants-'));
  // dsh's own answer to "what may be assigned" (upstream reads it before any grant is saved).
  upstream = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if ((req.url ?? '').startsWith('/api/dsh-passwords/internal/assignable-resources')) {
      res.end(JSON.stringify({ ok: true, folders: ['/site/alpha'], sessions: ['mine', 'kept', 'handed-1', 'handed-2'] }));
      return;
    }
    res.end('{}');
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  db = new Database(path.join(dir, 'grants.db'), createFieldCrypto('k', 'k'));
  db.init();
  const config: PlatformConfig = {
    setupKey: 'setup', dbPath: path.join(dir, 'grants.db'), dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${String((upstream.address() as { port: number }).port)}`,
      tls: null, redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false, acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'jwt', internalSecret: 'internal', patch: { dshRoot: '', restartService: '' }, endpointRules: [],
  };
  gateway = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  port = (gateway.address() as { port: number }).port;
  const admin = db.createUser('master', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  master = `dsh_gateway_token=${jwt.sign({ sub: String(admin.id), username: admin.username, cv: 0 }, 'jwt', { expiresIn: '1h' })}`;
});

after(() => {
  gateway?.close();
  upstream?.close();
  db?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function save(userId: number, allowedSessionIds: string[], disabledSessions: string[] = []): Promise<{ status: number; body: string }> {
  const body = JSON.stringify({
    userId, allowedFolders: ['/site/alpha'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowedAgentPresets: null,
    banned: false, sandboxMode: null, disabledSessions, allowedSessionIds,
  });
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: 'POST', path: '/gateway/api/permissions',
        headers: { cookie: master, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } },
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

test('Q1/H10: the master’s saved session list is what a private seat reads — and only that', async () => {
  const store = tracyStoreOf(db)!;
  const seat = db.createUser('s0123456789abcdef01234567', 'x', 'user').id;
  store.setSeatRole(seat, 'editor');
  // The seat's own conversation, and one a seed handed it (which a private seat never reads).
  assert.equal(store.recordCreatedSession(seat, 'mine'), true);

  // The admin page sends the whole list it shows: the seat's own row and the two it hands over.
  const saved = await save(seat, ['mine', 'handed-1', 'handed-2']);
  assert.equal(saved.status, 200, saved.body);
  assert.deepEqual(store.honouredGrants(seat), ['handed-1', 'handed-2', 'mine'], 'what the master named is read by the seat');

  // Taking one back (the page disables what it unticks — upstream refuses a silent drop).
  const again = await save(seat, ['mine', 'handed-2'], ['handed-1']);
  assert.equal(again.status, 200, again.body);
  assert.deepEqual(store.honouredGrants(seat), ['handed-2', 'mine'], 'a row the master took off is gone');
});

test('Q1/H10: a save that does not touch the session list leaves the seat’s grants as they were', async () => {
  const store = tracyStoreOf(db)!;
  const seat = db.createUser('s0123456789abcdef01234568', 'x', 'user').id;
  store.setSeatRole(seat, 'editor');
  assert.equal(store.recordCreatedSession(seat, 'kept'), true);
  const body = JSON.stringify({
    userId: seat, allowedFolders: ['/site/alpha'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowedAgentPresets: null,
    banned: false, sandboxMode: null, disabledSessions: [],
  });
  const res = await new Promise<number>((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: 'POST', path: '/gateway/api/permissions',
        headers: { cookie: master, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } },
      (r) => { r.resume(); r.on('end', () => resolve(r.statusCode ?? 0)); },
    );
    req.on('error', reject);
    req.end(body);
  });
  assert.equal(res, 200);
  assert.deepEqual(store.honouredGrants(seat), ['kept']);
});

test('Q1/H10: upstream’s own one-time seed (`Database.seedUserSessionGrants`) gives a seat nothing — of any role — and marks it seeded', async () => {
  const store = tracyStoreOf(db)!;
  for (const role of ['editor', 'owner']) {
    const seat = db.createUser(`s0123456789abcdef0123457${role === 'owner' ? '0' : '1'}`, 'x', 'user').id;
    store.setSeatRole(seat, role);
    db.setPermissions(seat, {
      allowedFolders: ['/site/alpha'], hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: false,
      allowGitDownload: false, allowWorkspaceCreate: false, allowedAgentPresets: null, banned: false,
      sandboxMode: null, disabledSessions: [],
    });
    assert.equal(db.seedUserSessionGrants(seat, ['listed-1', 'listed-2']), true, `${role}: the seed ran once`);
    assert.deepEqual(db.listUserSessionGrants(seat), [], `${role}: a listing says where a conversation lives, not whose it is`);
    assert.equal(db.isSessionGrantsSeeded(seat), true);
    assert.equal(db.seedUserSessionGrants(seat, ['listed-3']), false, `${role}: never twice`);
  }
  // A password account (not a seat) keeps upstream's seed.
  const password = db.createUser('password-user', 'x', 'user').id;
  db.setPermissions(password, {
    allowedFolders: ['/site/alpha'], hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: false,
    allowGitDownload: false, allowWorkspaceCreate: false, allowedAgentPresets: null, banned: false,
    sandboxMode: null, disabledSessions: [],
  });
  assert.equal(db.seedUserSessionGrants(password, ['listed-1']), true);
  assert.deepEqual(db.listUserSessionGrants(password), ['listed-1']);
  assert.deepEqual(store.honouredGrants(password), ['listed-1']);
});
