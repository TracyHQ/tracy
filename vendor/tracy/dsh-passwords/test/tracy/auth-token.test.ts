// L9: a session minted for a seat (no password involved) must be the same token `login()` hands
// out — same signing key, same lifetime, same `cv` claim — so the gateway's session check and
// revocation (`credential_version`) treat both alike. The lifetime is upstream's private
// `TOKEN_TTL`; this file pins the copy in `src/tracy/auth-token.ts` against a real `login()`, so
// an upstream bump that changes it fails here instead of shipping two lifetimes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import type { PlatformConfig } from '../../src/config.js';
import { mintSessionToken } from '../../src/tracy/auth-token.js';

const JWT_SECRET = 'l9-jwt-secret';
const PASSWORD = 'Correct-Horse-9-Battery';

async function withAuth(run: (auth: AuthService, db: Database) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-l9-'));
  const dbPath = path.join(dir, 'l9.db');
  const db = new Database(dbPath, createFieldCrypto('k', 'k'));
  db.init();
  const config = { setupKey: 'setup-key', dbPath, dbEncKey: 'k', jwtSecret: JWT_SECRET } as PlatformConfig;
  try {
    await run(new AuthService(config, db), db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function claims(token: string): jwt.JwtPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
}

test('L9: a minted session carries the same key, lifetime and claims as a password login', async () => {
  await withAuth(async (auth, db) => {
    await auth.setup({ setupKey: 'setup-key', username: 'owner', password: PASSWORD });
    const { token: loggedIn } = await auth.login({ username: 'owner', password: PASSWORD });
    const user = db.getUserByUsername('owner');
    assert.ok(user);
    const minted = mintSessionToken(user, { jwtSecret: JWT_SECRET });

    const a = claims(loggedIn);
    const b = claims(minted);
    assert.equal((b.exp ?? 0) - (b.iat ?? 0), (a.exp ?? 0) - (a.iat ?? 0), 'lifetime differs from login()');
    assert.equal((b.exp ?? 0) - (b.iat ?? 0), 12 * 3600, 'a session lives twelve hours');
    assert.deepEqual({ sub: b.sub, username: b.username, cv: b.cv }, { sub: a.sub, username: a.username, cv: a.cv });
    assert.deepEqual(auth.verifyToken(minted), { userId: user.id, username: 'owner', cv: user.credential_version, exp: b.exp });
  });
});

test('L9: the minted token names the credential version it was minted at, so a bump revokes it', async () => {
  await withAuth(async (auth, db) => {
    await auth.setup({ setupKey: 'setup-key', username: 'owner', password: PASSWORD });
    const before = db.getUserByUsername('owner');
    assert.ok(before);
    const minted = mintSessionToken(before, { jwtSecret: JWT_SECRET });
    db.updatePasswordHash(before.id, 'x');
    const after = db.getUserByUsername('owner');
    assert.ok(after);
    assert.notEqual(after.credential_version, before.credential_version, 'a new hash moves the version');
    assert.equal(auth.verifyToken(minted).cv, before.credential_version);
  });
});

test('L9: a token signed with another key is not accepted by the gate', async () => {
  await withAuth(async (auth, db) => {
    await auth.setup({ setupKey: 'setup-key', username: 'owner', password: PASSWORD });
    const user = db.getUserByUsername('owner');
    assert.ok(user);
    assert.throws(() => auth.verifyToken(mintSessionToken(user, { jwtSecret: 'another-key' })), { code: 'INVALID_TOKEN' });
  });
});
