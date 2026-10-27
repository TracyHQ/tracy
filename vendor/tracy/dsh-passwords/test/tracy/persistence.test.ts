// The Tracy grant book on upstream 2.7.7's database: the adapter only ADDS what Tracy needs
// (H10), and answers the questions the gate asks of it (Q1, Q5, S5, V3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import { createTracyStore } from '../../src/tracy/persistence.js';

const crypto = createFieldCrypto('test-db-key', 'test-setup-key');

/**
 * Upstream's own database, initialised by upstream's own code, plus a second connection for the
 * adapter under test. `Database.init()` now attaches and migrates the Tracy store itself (hook
 * H10), so the fixture takes the Tracy additions back off — every one is appended, so dropping them
 * leaves exactly the schema upstream's `init()` writes — and the cases below migrate it again.
 */
function upstreamDb(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-store-'));
  const file = path.join(dir, 'platform.db');
  const db = new Database(file, crypto);
  db.init();
  const sql = new DatabaseSync(file);
  sql.exec('PRAGMA busy_timeout = 5000');
  dropTracyAdditions(sql);
  t.after(() => {
    sql.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { db, sql, store: createTracyStore(sql, crypto) };
}

/** Take back what `attachTracyStore` added: the schema upstream's own `init()` writes. */
function dropTracyAdditions(sql: DatabaseSync): void {
  sql.exec('DROP TABLE session_grant_clock');
  for (const [table, column] of [['users', 'seat_role'], ['users', 'email'], ['user_session_grants', 'seed_tick'], ['user_session_grants', 'origin']]) {
    sql.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
}

/** Every table and its columns, as SQLite reports them. */
function schemaOf(sql: DatabaseSync): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const tables = sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
  for (const { name } of tables) {
    out[name] = (sql.prepare(`PRAGMA table_info(${name})`).all() as { name: string; type: string; dflt_value: unknown }[])
      .map((c) => `${c.name} ${c.type} ${String(c.dflt_value)}`);
  }
  return out;
}

test('H10: migrate only ADDS the Tracy columns and table, and leaves every upstream column as it was', (t) => {
  const { sql, store } = upstreamDb(t);
  const before = schemaOf(sql);
  store.migrate();
  const after = schemaOf(sql);

  const added: string[] = [];
  for (const [table, columns] of Object.entries(after)) {
    const old = before[table];
    if (old === undefined) { added.push(`table ${table}`); continue; }
    assert.deepEqual(columns.slice(0, old.length), old, `${table}: upstream columns unchanged and in order`);
    for (const column of columns.slice(old.length)) added.push(`${table}.${column.split(' ')[0]}`);
  }
  for (const table of Object.keys(before)) assert.ok(after[table], `${table} still exists`);
  assert.deepEqual(added.sort(), [
    'table session_grant_clock',
    'user_session_grants.origin',
    'user_session_grants.seed_tick',
    'users.email',
    'users.seat_role',
  ]);
});

test('H10: migrate is idempotent — a second run changes nothing', (t) => {
  const { sql, store } = upstreamDb(t);
  store.migrate();
  const once = schemaOf(sql);
  store.migrate();
  assert.deepEqual(schemaOf(sql), once);
});

test('H10: a database the 2.6.6 fork already migrated keeps its schema, its roles and every token', (t) => {
  const { db, sql } = upstreamDb(t);
  // The fork's columns, as its migrateUserEmail / migrateSessionPrivacy wrote them.
  sql.exec('ALTER TABLE users ADD COLUMN email TEXT');
  sql.exec("ALTER TABLE user_session_grants ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy'");
  sql.exec('ALTER TABLE user_session_grants ADD COLUMN seed_tick INTEGER');
  sql.exec('CREATE TABLE IF NOT EXISTS session_grant_clock (id INTEGER PRIMARY KEY CHECK (id = 1), tick INTEGER NOT NULL)');
  sql.exec('ALTER TABLE users ADD COLUMN seat_role TEXT');
  const seat = db.createUser('s0123456789abcdef01234567', 'x', 'user').id;
  sql.prepare("UPDATE users SET seat_role = 'owner' WHERE id = ?").run(seat);
  const before = schemaOf(sql);
  const cv = db.getUserById(seat)!.credential_version;
  const store = createTracyStore(sql, crypto);
  store.migrate();
  assert.deepEqual(schemaOf(sql), before);
  assert.equal(store.seatRole(seat), 'owner');
  assert.equal(db.getUserById(seat)!.credential_version, cv);
});

test('S5: on an upstream-only database whose first account (a seat) upstream already made master, migrate demotes it', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'platform.db');
  const first = new Database(file, crypto);
  first.init();
  const seat = first.createUser('s0123456789abcdef01234567_site01', 'x', 'user').id;
  first.close();
  const upstreamOnly = new DatabaseSync(file);
  dropTracyAdditions(upstreamOnly);
  upstreamOnly.close();
  const reboot = new Database(file, crypto);
  reboot.init();
  // Since H10, init() runs the migration itself: the boot that promotes the seat demotes it again.
  assert.equal(reboot.getUserById(seat)!.role, 'user', 'init() leaves no seat as the master');
  const sql = new DatabaseSync(file);
  // The trap itself, as upstream's own migrateRoles leaves it: the earliest account made master.
  sql.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(seat);
  assert.equal(reboot.getUserById(seat)!.role, 'admin', 'upstream promoted the seat');
  createTracyStore(sql, crypto).migrate();
  assert.equal(reboot.getUserById(seat)!.role, 'user');
  sql.close();
  reboot.close();
});

test('Q1: the seed runs once — a second call, or an account with no permission row, adds nothing', (t) => {
  const { db, store, password } = withAccounts(t);
  store.seedUserSessionGrants(password, ['a']);
  store.seedUserSessionGrants(password, ['b']);
  assert.deepEqual(store.honouredGrants(password), ['a']);
  assert.equal(db.isSessionGrantsSeeded(password), true);
  const rowless = db.createUser('carol', 'x', 'user').id;
  store.seedUserSessionGrants(rowless, ['c']);
  assert.deepEqual(store.honouredGrants(rowless), []);
});

test("Q1: the master's explicit grants count for a private seat, and keep the seat's own `created` rows", (t) => {
  const { store, editor } = withAccounts(t);
  store.recordCreatedSession(editor, 'mine');
  store.writeMasterGrants(editor, ['mine', 'given']);
  assert.deepEqual(store.honouredGrants(editor), ['given', 'mine']);
  store.writeMasterGrants(editor, ['mine']);
  assert.deepEqual(store.honouredGrants(editor), ['mine'], 'a grant the master no longer names is dropped');
  assert.equal(store.recordCreatedSession(editor, 'mine'), true, 'still its own creation');
});

/** A migrated store with accounts: a seat of each kind and a password account upstream made. */
function withAccounts(t: { after(fn: () => void): void }) {
  const env = upstreamDb(t);
  env.store.migrate();
  const account = (name: string, seatRole: string | null) => {
    const id = env.db.createUser(name, 'x', 'user').id;
    env.db.setPermissions(id, { allowedFolders: ['/site/a'], hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, banned: false });
    if (seatRole !== null) env.store.setSeatRole(id, seatRole);
    return id;
  };
  return {
    ...env,
    owner: account('s0123456789abcdef01234567_site01', 'owner'),
    secondOwner: account('s1123456789abcdef01234567_site01', 'owner'),
    editor: account('s2123456789abcdef01234567_site01', 'editor'),
    password: account('alice', null),
  };
}

test('Q1: a seat reads only the conversations it started, plus what the master granted it', (t) => {
  const { store, editor, owner } = withAccounts(t);
  assert.equal(store.recordCreatedSession(editor, 'mine'), true);
  assert.equal(store.recordCreatedSession(owner, 'owners'), true);
  assert.equal(store.isGrantHonoured(editor, 'mine'), true);
  assert.equal(store.isGrantHonoured(editor, 'owners'), false, "another seat's conversation stays its own");
  assert.deepEqual(store.honouredGrants(editor), ['mine']);
});

test('Q1: the one-time seed gives a seat of ANY role nothing — not even a second owner', (t) => {
  const { store, secondOwner, editor } = withAccounts(t);
  store.seedUserSessionGrants(secondOwner, ['a', 'b']);
  store.seedUserSessionGrants(editor, ['a']);
  assert.deepEqual(store.honouredGrants(secondOwner), []);
  assert.deepEqual(store.honouredGrants(editor), []);
});

test('Q1: a password account (not a seat) keeps upstream behaviour — its seeded and legacy rows count', (t) => {
  const { db, store, password } = withAccounts(t);
  store.seedUserSessionGrants(password, ['seeded']);
  db.addUserSessionGrant(password, 'legacy-row');
  assert.deepEqual(store.honouredGrants(password), ['legacy-row', 'seeded']);
});

test("Q1: an owner keeps its pre-upgrade `legacy` rows; any other seat's legacy rows are not read", (t) => {
  const { db, store, owner, editor } = withAccounts(t);
  db.addUserSessionGrant(owner, 'old-own');
  db.addUserSessionGrant(editor, 'old-editor');
  assert.equal(store.isGrantHonoured(owner, 'old-own'), true);
  assert.equal(store.isGrantHonoured(editor, 'old-editor'), false);
});

test('S5: the seat role is recorded and read back; an account the seat door never minted has none', (t) => {
  const { store, editor, password } = withAccounts(t);
  assert.equal(store.seatRole(editor), 'editor');
  assert.equal(store.seatRole(password), null);
  store.setSeatRole(editor, 'admin');
  assert.equal(store.seatRole(editor), 'admin');
});

test('Q5: an id another account already holds is not a new conversation and is not recorded', (t) => {
  const { store, owner, editor } = withAccounts(t);
  assert.equal(store.recordCreatedSession(owner, 's1'), true);
  assert.equal(store.recordCreatedSession(editor, 's1'), false);
  assert.equal(store.isGrantHonoured(editor, 's1'), false);
  assert.equal(store.recordCreatedSession(owner, 's1'), true, 'the same account again is idempotent');
  assert.equal(store.recordCreatedSession(owner, ''), false);
});

test("Q5: a seed another account gained WHILE the create was in flight does not block it; an older one does", (t) => {
  const { db, store, password, editor } = withAccounts(t);
  store.seedUserSessionGrants(password, ['old']);
  const mark = store.sessionGrantWatermark();
  // Another password account's first listing lands mid-create and already names the new session.
  const bob = db.createUser('bob', 'x', 'user').id;
  db.setPermissions(bob, { allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, banned: false });
  store.seedUserSessionGrants(bob, ['fresh']);
  assert.equal(store.recordCreatedSession(editor, 'old', mark), false, 'seeded before the call');
  assert.equal(store.recordCreatedSession(editor, 'fresh', mark), true);
  assert.equal(store.isGrantHonoured(editor, 'fresh'), true);
  assert.equal(store.recordCreatedSession(editor, 'fresh'), false, 'without a mark no seed row is exempt');
});

test('Q5: recording upgrades a legacy row of the same account to `created`, so a private seat reads it', (t) => {
  const { db, store, editor } = withAccounts(t);
  db.addUserSessionGrant(editor, 's1');
  assert.equal(store.isGrantHonoured(editor, 's1'), false);
  assert.equal(store.recordCreatedSession(editor, 's1'), true);
  assert.equal(store.isGrantHonoured(editor, 's1'), true);
});

test("V3: taking a seat back moves its credential version, so every token it was given dies", (t) => {
  const { db, store, editor } = withAccounts(t);
  const before = db.getUserById(editor)!.credential_version;
  assert.equal(store.bumpCredentialVersion(editor), before + 1);
  assert.equal(db.getUserById(editor)!.credential_version, before + 1, "upstream's own read sees the new version");
});

test('Q11: a seat\'s proven address is kept encrypted and read back lower-cased; other accounts have none', (t) => {
  const { sql, store, editor, password } = withAccounts(t);
  store.setEmail(editor, ' Bee@Team.test ');
  assert.equal(store.emailOf(editor), 'bee@team.test');
  assert.equal(store.emailOf(password), null);
  const stored = (sql.prepare('SELECT email FROM users WHERE id = ?').get(editor) as { email: string }).email;
  assert.notEqual(stored, 'bee@team.test', 'not stored in clear');
});

test('S5: a seat is never the master — one upstream promoted at boot is demoted by migrate, before any request', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'platform.db');
  // A fleet host has no setup admin: the first account is a seat, and upstream's init() makes the
  // earliest account the master on every boot when none exists.
  const first = new Database(file, crypto);
  first.init();
  let sql = new DatabaseSync(file);
  let store = createTracyStore(sql, crypto);
  store.migrate();
  const seat = first.createUser('s0123456789abcdef01234567_site01', 'x', 'user').id;
  store.setSeatRole(seat, 'editor');
  first.close();
  sql.close();

  const reboot = new Database(file, crypto);
  reboot.init();
  assert.equal(reboot.getUserById(seat)!.role, 'user', 'init() runs the migration (H10): demoted at boot');
  sql = new DatabaseSync(file);
  // Upstream's migrateRoles alone (what the trap is): the earliest account, a seat, made master.
  sql.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(seat);
  assert.equal(reboot.getUserById(seat)!.role, 'admin', 'upstream promotes it (the trap this guards)');
  store = createTracyStore(sql, crypto);
  store.migrate();
  assert.equal(reboot.getUserById(seat)!.role, 'user');
  sql.close();
  reboot.close();
});

test('H10: on a database that already holds seats, adding seat_role marks them `unknown` and ends their tokens', (t) => {
  const { db, sql } = upstreamDb(t);
  const seat = db.createUser('s0123456789abcdef01234567', 'x', 'user').id;
  const visitor = db.createUser('v20261005xdeadbeef', 'x', 'user').id;
  const password = db.createUser('alice', 'x', 'user').id;
  const cv = (id: number) => db.getUserById(id)!.credential_version;
  const before = [cv(seat), cv(visitor), cv(password)];
  const store = createTracyStore(sql, crypto);
  store.migrate();
  assert.equal(store.seatRole(seat), 'unknown');
  assert.equal(store.seatRole(visitor), 'unknown');
  assert.equal(store.seatRole(password), null);
  assert.deepEqual([cv(seat), cv(visitor), cv(password)], [before[0] + 1, before[1] + 1, before[2]]);
});
