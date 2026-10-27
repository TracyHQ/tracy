// The seat door: Tracy's seat book mints lane sessions here, so this file pins the three
// things the door promises. Everything below runs against a real SQLite file, because the
// promises are about rows — a mocked database would prove only that the mock was written to
// match the implementation. The seat columns (`seat_role`, `email`, `setUserRole`) are Tracy's
// (`src/tracy/persistence.ts`, hook H10), reached through `seat-columns.ts`; every other row is
// upstream's real SQLite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import {
  SEAT_ROLES,
  permissionsFor,
  revokeSeat,
  seatAccountPrefix,
  seatUsername,
  signSeatRequest,
  sweepVisitors,
  upsertSeatUser,
  verifySeatRequest,
  type SeatRole,
} from '../../src/tracy/seat.js';
import { withSeatColumns } from './seat-columns.js';
// The four picker/workspace cases test fork functions of `permissions.ts` that moved to
// `src/tracy/seat-context.ts` (S1 is `workspaceListed` there, the rule H15 hooks into upstream).
import { directoryPickerPathFor, permissionsFor as contextPermissionsFor, workspaceListed as workspaceVisible } from '../../src/tracy/seat-context.js';

/** The username rule this package already enforces (src/auth.ts). Seat names must satisfy it. */
const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/;

async function withDb(run: (db: ReturnType<typeof withSeatColumns>) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-seat-'));
  const db = new Database(path.join(dir, 'seat.db'), createFieldCrypto('test-key', 'test-key'));
  try {
    db.init();
    await run(withSeatColumns(db));
  } finally {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Names ──────────────────────────────────────────────────────────────────────

test('S7: a seat name is stable per email and always satisfies the username rule', () => {
  const first = seatUsername({ role: 'editor', email: 'Person@Example.com' });
  const again = seatUsername({ role: 'editor', email: 'person@example.com ' });
  assert.equal(first, again, 'case and surrounding space must not mint a second account');
  assert.match(first, USERNAME_RE);

  const other = seatUsername({ role: 'editor', email: 'someone-else@tracy.ai' });
  assert.notEqual(first, other);
});

test('S7: a seat name does not change with the role — one person is one account', () => {
  assert.equal(
    seatUsername({ role: 'editor', email: 'person@example.com' }),
    seatUsername({ role: 'owner', email: 'person@example.com' }),
  );
});

test('S7: visitor names keep the birthday prefix the nightly GC counts age by', () => {
  const name = seatUsername({ role: 'guest', now: new Date('2026-08-30T10:00:00Z') });
  assert.match(name, /^v20260830x[0-9a-f]{8}$/);
  assert.match(name, USERNAME_RE);
  assert.notEqual(name, seatUsername({ role: 'guest', now: new Date('2026-08-30T10:00:00Z') }));
});

// ── The role matrix ────────────────────────────────────────────────────────────

const TERMINAL_RULES = ['/sidebar/ws/terminal', '/sidebar/ws/agent-terminals'];

test('S6: no seat is ever granted every folder — an empty grant denies', () => {
  for (const role of SEAT_ROLES) {
    const perms = permissionsFor({ role, folders: [], terminalRules: TERMINAL_RULES });
    assert.deepEqual(
      perms.allowedFolders,
      ['__deny__'],
      `${role} with no grant must deny, because an empty array means unrestricted here`,
    );
  }
});

test('S8/S14: ADR 0028 fixed roles — editors and owners work the whole site, viewers read only', () => {
  const grant = ['/work/alpha'];
  const of = (role: SeatRole) => permissionsFor({ role, folders: grant, terminalRules: TERMINAL_RULES });

  for (const role of ['editor', 'owner'] as const) {
    const perms = of(role);
    assert.deepEqual(perms.allowedFolders, grant, role);
    assert.deepEqual(perms.webSocketPaths, TERMINAL_RULES, role);
    assert.equal(perms.allowGitDownload, true, role);
    assert.equal(perms.allowWorkspaceCreate, true, role);
    assert.equal(perms.allowUpload, true, `${role} writes in the Files tab`);
    assert.equal(perms.sandboxMode, null, `${role} keeps the harness default`);
  }
  for (const role of ['guest', 'bot'] as const) assert.equal(of(role).allowUpload, false, `${role} never writes`);

  const viewer = of('viewer');
  assert.deepEqual(viewer.allowedFolders, grant, 'a viewer still sees its own site');
  assert.equal(viewer.sandboxMode, 'read-only');
  assert.equal(viewer.allowUpload, false);
  assert.equal(viewer.allowGitDownload, false);
  assert.equal(viewer.allowWorkspaceCreate, false);
  assert.deepEqual(viewer.webSocketPaths, [], 'no terminal');
  assert.equal(viewer.hourlyTokenLimit, null, 'a viewer is a known person, not a capped visitor');
});

test('S8: a resolved toolset overrides the default matrix, in both directions', () => {
  // The seat book owns the matrix — an Owner may widen or narrow it per site through
  // `site_role_policy`. This door applies what it is told and keeps no second copy.
  const widened = permissionsFor({
    role: 'editor',
    folders: ['/work/alpha'],
    terminalRules: TERMINAL_RULES,
    toolsets: ['content', 'code'],
  });
  assert.deepEqual(widened.webSocketPaths, TERMINAL_RULES, 'an editor granted code gets a terminal');
  assert.equal(widened.allowGitDownload, true);

  const narrowed = permissionsFor({
    role: 'owner',
    folders: ['/work/alpha'],
    terminalRules: TERMINAL_RULES,
    toolsets: ['content'],
  });
  assert.deepEqual(narrowed.webSocketPaths, [], 'an owner whose code toolset was taken loses it');
  assert.equal(narrowed.allowGitDownload, false);
});

test('S8: a toolset the harness cannot enforce changes nothing here', () => {
  // `site` and `lifecycle` are fleet authority, exercised through the Worker. Granting them must
  // not quietly widen anything inside dsh — least of all workspace creation.
  const base = permissionsFor({ role: 'editor', folders: ['/work/alpha'], terminalRules: TERMINAL_RULES, toolsets: ['content'] });
  const withLifecycle = permissionsFor({
    role: 'editor',
    folders: ['/work/alpha'],
    terminalRules: TERMINAL_RULES,
    toolsets: ['content', 'lifecycle'],
  });
  assert.deepEqual(withLifecycle, base);
});

test('S8: an empty toolset list means empty, not unset', () => {
  const perms = permissionsFor({
    role: 'owner',
    folders: ['/work/alpha'],
    terminalRules: TERMINAL_RULES,
    toolsets: [],
  });
  assert.equal(perms.allowGitDownload, false, 'an owner stripped of every toolset does no code work');
  assert.equal(perms.allowWorkspaceCreate, false);
  assert.deepEqual(perms.webSocketPaths, []);
});

test('S8: visitors stay read-only and keep the quota the guest lane runs on today', () => {
  const guest = permissionsFor({ role: 'guest', folders: ['/work/alpha'], terminalRules: TERMINAL_RULES });
  assert.equal(guest.sandboxMode, 'read-only');
  assert.equal(guest.hourlyTokenLimit, 20000);
  assert.deepEqual(guest.webSocketPaths, []);

  const bot = permissionsFor({ role: 'bot', folders: ['/work/alpha'], terminalRules: TERMINAL_RULES });
  assert.equal(bot.sandboxMode, 'read-only');
  assert.equal(bot.hourlyTokenLimit, 8000);
});

test('S8: a seat holder is never banned and never carries a stale disabled-session list', () => {
  const perms = permissionsFor({ role: 'editor', folders: ['/work/alpha'], terminalRules: TERMINAL_RULES });
  assert.equal(perms.banned, false);
  assert.deepEqual(perms.disabledSessions, []);
});

test('S8: agent presets: every seat runs the presets its lane ships — the grant does not veto the catalogue', () => {
  // `[]` and `null` are different values in db.ts — [] allows no preset, null allows every one.
  // Visitors used to get `[]`, and the measured price (production 31/08) was that the panel
  // forces its bundled Guest persona into session/create, the gateway 403s it, and the client
  // rolls the workspace selection back — a guest could never start a session at all.
  for (const role of SEAT_ROLES) {
    assert.equal(
      permissionsFor({ role, folders: ['/work/alpha'], terminalRules: TERMINAL_RULES }).allowedAgentPresets,
      null,
    );
  }
});

// ── Rows ───────────────────────────────────────────────────────────────────────

test('S7: the same email arriving twice updates one account instead of minting a second', async () => {
  await withDb((db) => {
    const first = upsertSeatUser(db, { role: 'editor', email: 'person@example.com', folders: ['/work/alpha'] });
    assert.equal(first.created, true);
    assert.equal(db.countUsers(), 1);

    const second = upsertSeatUser(db, { role: 'viewer', email: 'person@example.com', folders: ['/work/beta'] });
    assert.equal(second.created, false);
    assert.equal(second.userId, first.userId);
    assert.equal(db.countUsers(), 1, 'one person, one row');

    const perms = db.getPermissions(second.userId);
    assert.deepEqual(perms?.allowed_folders, ['/work/beta'], 'the newer grant replaces the older one');
    assert.equal(perms?.sandbox_mode, 'read-only', 'and the newer role replaces the older one');
  });
});

test('L4: a seat account cannot be logged into with a password', async () => {
  await withDb(async (db) => {
    const { userId } = upsertSeatUser(db, { role: 'editor', email: 'person@example.com', folders: ['/work/alpha'] });
    const row = db.getUserById(userId);
    assert.ok(row);
    assert.equal(row.role, 'user', 'seats are never admins');
    assert.notEqual(row.password_hash, '', 'an empty hash would make bcrypt.compare throw, not refuse');
    for (const guess of ['', 'password', 'person@example.com']) {
      assert.equal(await bcrypt.compare(guess, row.password_hash), false);
    }
  });
});

// ── Revoking ───────────────────────────────────────────────────────────────────

test('S7/V3: revoking a seat invalidates every session it ever minted', async () => {
  await withDb((db) => {
    const { userId } = upsertSeatUser(db, { role: 'editor', email: 'person@example.com', folders: ['/work/alpha'] });
    const before = db.getUserById(userId)?.credential_version ?? -1;

    assert.deepEqual(revokeSeat(db, { email: 'person@example.com' }), [userId]);

    const after = db.getUserById(userId)?.credential_version ?? -1;
    assert.ok(after > before, 'the JWT carries cv; a session dies only when cv moves');
    assert.deepEqual(db.getPermissions(userId)?.allowed_folders, ['__deny__'], 'a revoked seat sees nothing');
    assert.equal(db.getPermissions(userId)?.banned, true, 'and cannot come back through any other door');
  });
});

test('S7: revoking an email that holds no seat is a no-op, not an error', async () => {
  await withDb((db) => {
    assert.deepEqual(revokeSeat(db, { email: 'nobody@tracy.ai' }), []);
  });
});

// ── Sweeping visitors ──────────────────────────────────────────────────────────

test('S14: the sweep removes visitors older than the cutoff and nobody else', async () => {
  await withDb((db) => {
    const born = (day: string) => new Date(`${day}T09:00:00Z`);
    upsertSeatUser(db, { role: 'guest', folders: ['/work/alpha'], now: born('2026-08-01') });
    upsertSeatUser(db, { role: 'bot', folders: ['/work/alpha'], now: born('2026-08-02') });
    const recent = upsertSeatUser(db, { role: 'guest', folders: ['/work/alpha'], now: born('2026-08-29') });
    const seat = upsertSeatUser(db, { role: 'editor', email: 'person@example.com', folders: ['/work/alpha'] });
    assert.equal(db.countUsers(), 4);

    const swept = sweepVisitors(db, { olderThanDays: 2, now: new Date('2026-08-30T09:00:00Z') });

    assert.equal(swept, 2, 'only the two aged visitors go');
    assert.equal(db.countUsers(), 2);
    assert.ok(db.getUserById(recent.userId), 'a visitor inside the window stays');
    assert.ok(db.getUserById(seat.userId), 'a seat holder is never swept — their name is not dated');
  });
});

test('S14: the sweep never touches an admin, whatever its name looks like', async () => {
  await withDb((db) => {
    // A master account named like a visitor is not a visitor. The sweep reads role, not just the
    // name, because deleting the admin would take the platform's only management surface with it.
    db.createUser('v20260101xdeadbeef', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
    const swept = sweepVisitors(db, { olderThanDays: 1, now: new Date('2026-08-30T09:00:00Z') });
    assert.equal(swept, 0);
    assert.equal(db.countUsers(), 1);
  });
});

// ── The signature on the door ──────────────────────────────────────────────────

const SECRET = 'seat-secret-for-tests';

function req(body: string, at = Date.now()) {
  const signed = signSeatRequest({ secret: SECRET, method: 'POST', path: '/gateway/seat/session', body, now: at });
  return { ...signed, body };
}

test('L1: a correctly signed request passes once and only once', () => {
  const seen = new Map<string, number>();
  const call = req('{"role":"editor"}');
  assert.equal(verifySeatRequest({ ...call, secret: SECRET, method: 'POST', path: '/gateway/seat/session', seen }).ok, true);

  const replay = verifySeatRequest({ ...call, secret: SECRET, method: 'POST', path: '/gateway/seat/session', seen });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, 'replay', 'a captured request must not be usable a second time');
});

test('L1: the signature covers the body, the path and the method', () => {
  const seen = new Map<string, number>();
  const call = req('{"role":"editor"}');
  const tamper = (over: Record<string, unknown>) =>
    verifySeatRequest({
      ...call,
      secret: SECRET,
      method: 'POST',
      path: '/gateway/seat/session',
      seen: new Map(),
      ...over,
    });

  assert.equal(tamper({ body: '{"role":"owner"}' }).ok, false, 'body');
  assert.equal(tamper({ path: '/gateway/seat/revoke' }).ok, false, 'path');
  assert.equal(tamper({ method: 'DELETE' }).ok, false, 'method');
  assert.equal(tamper({ secret: 'another-lane-secret' }).ok, false, 'secret');
  assert.equal(verifySeatRequest({ ...call, secret: SECRET, method: 'POST', path: '/gateway/seat/session', seen }).ok, true);
});

test('L1: a signature outside the freshness window is refused in both directions', () => {
  const seen = new Map<string, number>();
  const old = req('{}', Date.now() - 61_000);
  assert.equal(verifySeatRequest({ ...old, secret: SECRET, method: 'POST', path: '/gateway/seat/session', seen }).reason, 'stale');

  const ahead = req('{}', Date.now() + 61_000);
  assert.equal(verifySeatRequest({ ...ahead, secret: SECRET, method: 'POST', path: '/gateway/seat/session', seen }).reason, 'stale');
});

test('L1: a missing signature is refused without consulting the secret', () => {
  const seen = new Map<string, number>();
  const result = verifySeatRequest({
    secret: SECRET,
    method: 'POST',
    path: '/gateway/seat/session',
    body: '{}',
    timestamp: '',
    nonce: '',
    signature: '',
    seen,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

// ── Directory picker: opens in the right place, never looks outside ────────────────

test('S4: the picker opens in the seat\'s box, not in the container\'s home', () => {
  const box = ['/work/.seats/v1/site-alpha'];
  // No path given: dsh opens `home` by default (/root in the container). For a guest that is both
  // useless (they have nothing there) and a view of the host's directory tree.
  assert.equal(directoryPickerPathFor(undefined, box), '/work/.seats/v1/site-alpha');
  assert.equal(directoryPickerPathFor(null, box), '/work/.seats/v1/site-alpha');
});

test('S4: the picker cannot list a directory outside the box', () => {
  const box = ['/work/.seats/v1/site-alpha'];
  assert.equal(directoryPickerPathFor('/work/.seats/v1/site-alpha', box), '/work/.seats/v1/site-alpha');
  assert.equal(directoryPickerPathFor('/work/.seats/v1/site-alpha/con', box), '/work/.seats/v1/site-alpha/con');
  // The hole measured on 30/08: a guest seat could list `/work` (the customer list) and
  // `/desk-home` (where the user book lives). ADR 0003 §4: "not being able to open is not enough; it must NOT BE SEEN".
  assert.equal(directoryPickerPathFor('/work', box), null);
  assert.equal(directoryPickerPathFor('/desk-home', box), null);
  assert.equal(directoryPickerPathFor('/', box), null);
});

test('S4: the host owner is unrestricted, and a seat granted nothing sees nothing', () => {
  // Empty whitelist = no limit (this package's semantics): upstream behaviour unchanged.
  assert.equal(directoryPickerPathFor('/bat/ky/dau', []), '/bat/ky/dau');
  assert.equal(directoryPickerPathFor(undefined, []), undefined);
  // `__deny__`: no folder granted yet, so nothing to open.
  assert.equal(directoryPickerPathFor('/work', ['__deny__']), null);
  assert.equal(directoryPickerPathFor(undefined, ['__deny__']), null);
});

// ── Many seats, one site ────────────────────────────────────────────────────────

test('S1/S2: two seats granted the same site both see that site', () => {
  // dsh-passwords assumes ONE folder belongs to ONE subuser: the workspace filter requires the
  // viewer to be the registered owner, and blocks when someone else registered the same path. Right
  // for a host with one owner and a few sub-accounts, wrong for Tracy, where dozens of people read
  // one site's `/work/<label>`.
  //
  // A symlink detour (one name per seat pointing at the same content) was tried and does NOT work:
  // dsh resolves symlinks when it records a workspace, so the book holds the real path while the
  // whitelist holds the box path.
  //
  // So Tracy's real boundary is `allowed_folders`, and only that. Two seats on one site see the same.
  assert.equal(workspaceVisible('/work/site-a', ['/work/site-a']), true);
  // One workspace, one site (15/09/2026): a folder INSIDE the grant is not listed as a workspace.
  assert.equal(workspaceVisible('/work/site-a/sub', ['/work/site-a']), false);
  assert.equal(workspaceVisible('/work/site-a/', ['/work/site-a']), true);
  assert.equal(workspaceVisible('/anything', []), true, 'an unrestricted (admin) view lists everything');
  // And seats of different sites still see nothing of each other; that is what ADR 0003 §4 requires.
  assert.equal(workspaceVisible('/work/site-b', ['/work/site-a']), false);
  assert.equal(workspaceVisible('/work/site-a', ['__deny__']), false);
});

// ── One person, one account PER SITE (a dsh that serves a whole host) ──────────────────────────
//
// A lane is one site, so one account per address was the same thing as one account per seat. A
// host dsh is not: without a discriminator the second site's grant lands on the first site's row,
// which is not a duplicate account but a REPLACED permission — and the token already handed out
// for site A keeps working, now answering with site B's folders.

test('S7: naming a site gives the same person a different account, still under their own prefix', () => {
  const legacy = seatUsername({ role: 'editor', email: 'person@example.com' });
  const alpha = seatUsername({ role: 'editor', email: 'person@example.com', site: 'alpha.example' });
  const beta = seatUsername({ role: 'editor', email: 'person@example.com', site: 'beta.example' });

  assert.equal(legacy, seatAccountPrefix('Person@Example.com '), 'no site: the name a lane has always used');
  assert.notEqual(alpha, legacy);
  assert.notEqual(alpha, beta, 'two sites are two seats');
  for (const name of [legacy, alpha, beta]) {
    // The prefix is what revocation by address matches on, and 32 is what auth.ts admits: a name
    // one character longer is refused at account creation, which surfaces as a lane that cannot
    // mint seats at all.
    assert.ok(name.startsWith(seatAccountPrefix('person@example.com')), `${name} must carry the person's prefix`);
    assert.match(name, /^[A-Za-z0-9_-]{3,32}$/, `${name} must satisfy auth.ts's username rule`);
  }
  assert.equal(alpha, seatUsername({ role: 'owner', email: 'person@example.com', site: ' alpha.example ' }), 'stable');
  assert.equal(seatUsername({ role: 'editor', email: 'person@example.com', site: '  ' }), legacy, 'blank is no site');
});

test('S7: two sites, one address: two rows, two sets of folders, neither overwriting the other', async () => {
  await withDb((db) => {
    const alpha = upsertSeatUser(db, {
      role: 'editor', email: 'person@example.com', folders: ['/site/alpha'], site: 'alpha.example',
    });
    const beta = upsertSeatUser(db, {
      role: 'owner', email: 'person@example.com', folders: ['/site/beta'], site: 'beta.example',
    });

    assert.notEqual(alpha.userId, beta.userId);
    assert.equal(db.countUsers(), 2, 'one person, one row PER SITE');
    assert.deepEqual(db.getPermissions(alpha.userId)?.allowed_folders, ['/site/alpha']);
    assert.deepEqual(db.getPermissions(beta.userId)?.allowed_folders, ['/site/beta'], 'beta did not eat alpha');

    // Idempotence survives the split: the same (person, site) still updates one row.
    const again = upsertSeatUser(db, {
      role: 'viewer', email: 'person@example.com', folders: ['/site/alpha'], site: 'alpha.example',
    });
    assert.equal(again.userId, alpha.userId);
    assert.equal(again.created, false);
    assert.equal(db.countUsers(), 2);
  });
});

test('S7: revoking by address takes back EVERY site of that person, and nobody else', async () => {
  await withDb((db) => {
    const alpha = upsertSeatUser(db, {
      role: 'editor', email: 'person@example.com', folders: ['/site/alpha'], site: 'alpha.example',
    });
    const beta = upsertSeatUser(db, {
      role: 'owner', email: 'person@example.com', folders: ['/site/beta'], site: 'beta.example',
    });
    const legacy = upsertSeatUser(db, { role: 'editor', email: 'person@example.com', folders: ['/work/old'] });
    const other = upsertSeatUser(db, {
      role: 'editor', email: 'someone@tracy.ai', folders: ['/site/alpha'], site: 'alpha.example',
    });
    const versionBefore = db.getUserById(beta.userId)?.credential_version ?? -1;

    const revoked = revokeSeat(db, { email: 'Person@Example.com' });

    assert.deepEqual([...revoked].sort((a, b) => a - b), [alpha.userId, beta.userId, legacy.userId].sort((a, b) => a - b));
    for (const id of [alpha.userId, beta.userId, legacy.userId]) {
      assert.deepEqual(db.getPermissions(id)?.allowed_folders, ['__deny__'], 'a revoked seat sees nothing');
      assert.equal(db.getPermissions(id)?.banned, true);
    }
    assert.ok((db.getUserById(beta.userId)?.credential_version ?? -1) > versionBefore, 'sessions must die too');
    // The other person shares a site, not a prefix. A revocation that reached them would be an
    // outage for somebody who was never named.
    assert.deepEqual(db.getPermissions(other.userId)?.allowed_folders, ['/site/alpha']);
    assert.equal(db.getPermissions(other.userId)?.banned, false);
  });
});

test('S7: revoking ONE named account leaves that person their other sites', async () => {
  await withDb((db) => {
    const alpha = upsertSeatUser(db, {
      role: 'editor', email: 'person@example.com', folders: ['/site/alpha'], site: 'alpha.example',
    });
    const beta = upsertSeatUser(db, {
      role: 'owner', email: 'person@example.com', folders: ['/site/beta'], site: 'beta.example',
    });

    assert.deepEqual(revokeSeat(db, { username: alpha.username }), [alpha.userId]);

    assert.equal(db.getPermissions(alpha.userId)?.banned, true);
    assert.equal(db.getPermissions(beta.userId)?.banned, false, 'the seat book revokes per site too');
  });
});

// ── A seat is never the master ────────────────────────────────────────────────

test('S5: a seat promoted to admin by an older boot is demoted the moment it is minted again', async () => {
  await withDb((db) => {
    const { userId } = upsertSeatUser(db, { role: 'owner', email: 'first@tracy.ai', folders: ['/site/one'] });
    // What upstream's `migrateRoles` used to do on the next boot of a seat-door-only lane: the
    // earliest account becomes the gateway master, and the gateway then consults no permission
    // row for it at all.
    db.setUserRole(userId, 'admin');
    assert.equal(db.getUserById(userId)?.role, 'admin');
    const again = upsertSeatUser(db, { role: 'owner', email: 'first@tracy.ai', folders: ['/site/one'] });
    assert.equal(again.userId, userId);
    assert.equal(db.getUserById(userId)?.role, 'user', 'a seat is never the master');
  });
});

test('S5: init() never promotes an account that carries an address — the first seat minted is not the master on the next boot', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'seat-admin-'));
  try {
    const file = path.join(dir, 'seat.db');
    const first = new Database(file, createFieldCrypto('test-key', 'test-key'));
    first.init();
    const { userId } = upsertSeatUser(withSeatColumns(first), { role: 'owner', email: 'first@tracy.ai', folders: ['/site/one'] });
    assert.equal(first.getUserById(userId)?.role, 'user');
    first.close();
    // The next boot runs the migrations again over a database whose only account is a seat.
    const second = new Database(file, createFieldCrypto('test-key', 'test-key'));
    second.init();
    assert.equal(second.getUserById(userId)?.role, 'user', 'the seat stayed a seat across the boot');
    // An address-less account (a real setup admin from before the seat door) is still promoted.
    const master = second.createUser('master', 'x', 'user');
    const third = new Database(file, createFieldCrypto('test-key', 'test-key'));
    second.close();
    third.init();
    assert.equal(third.getUserById(master.id)?.role, 'admin', 'an account without an address is the one a lone promotion may pick');
    assert.equal(third.getUserById(userId)?.role, 'user');
    third.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('S5: a seat promoted by an older build loses admin AT BOOT, before any token of it is used again', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'seat-boot-demote-'));
  try {
    const file = path.join(dir, 'seat.db');
    const first = new Database(file, createFieldCrypto('test-key', 'test-key'));
    first.init();
    const { userId } = upsertSeatUser(withSeatColumns(first), { role: 'owner', email: 'first@tracy.ai', folders: ['/site/one'] });
    // What the old build's migration did on its own next boot.
    withSeatColumns(first).setUserRole(userId, 'admin');
    const master = first.createUser('master', 'x', 'user');
    first.close();
    // This build boots over that database: the seat is a seat again before any request is served,
    // and the address-less account is the only one a lone promotion may still pick.
    const second = new Database(file, createFieldCrypto('test-key', 'test-key'));
    second.init();
    assert.equal(second.getUserById(userId)?.role, 'user', 'demoted at boot');
    assert.equal(second.getUserById(master.id)?.role, 'admin');
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('S6/S8: the seat door writes ONE role matrix — the 2.7.7 row of seat-context.ts, no SSH, terminal rules beside it', () => {
  const written: unknown[] = [];
  const book = {
    getUserByUsername: () => null,
    createUser: (_name: string) => ({ id: written.length + 1, role: 'user' }),
    listUsers: () => [],
    deleteUser: () => {},
    updatePasswordHash: () => {},
    setPermissions: (_id: number, perms: unknown) => { written.push(perms); },
    setUserRole: () => {},
    setUserEmail: () => {},
    getSeatRole: () => null,
    setSeatRole: () => {},
  };
  for (const role of SEAT_ROLES) {
    written.length = 0;
    upsertSeatUser(book, { role, email: role === 'guest' || role === 'bot' ? null : `${role}@tracy.test`, folders: ['/site/alpha'] }, TERMINAL_RULES);
    assert.deepEqual(written[0], contextPermissionsFor({ role, folders: ['/site/alpha'], terminalRules: TERMINAL_RULES }), role);
    assert.equal((written[0] as { allowSsh: boolean }).allowSsh, false, `${role}: 2.7.7 grants no seat SSH`);
    assert.equal((written[0] as { allowUpload: boolean }).allowUpload, role === 'owner' || role === 'editor', `${role}: editors write files, viewers and visitors read`);
  }
  // The row itself, written out by hand: an editor, a viewer and a guest as 2.7.7's setPermissions takes them.
  written.length = 0;
  upsertSeatUser(book, { role: 'editor', email: 'ed@tracy.test', folders: ['/site/alpha'] }, TERMINAL_RULES);
  upsertSeatUser(book, { role: 'viewer', email: 'vi@tracy.test', folders: ['/site/alpha'] }, TERMINAL_RULES);
  upsertSeatUser(book, { role: 'guest', folders: ['/site/alpha'] }, TERMINAL_RULES);
  const common = { allowedFolders: ['/site/alpha'], dailyMinutesLimit: null, allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: false, allowedAgentPresets: null, banned: false, disabledSessions: [], webSocketPaths: [] };
  assert.deepEqual(written, [
    { ...common, hourlyTokenLimit: null, allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: true, sandboxMode: null, webSocketPaths: TERMINAL_RULES },
    { ...common, hourlyTokenLimit: null, allowUpload: false, sandboxMode: 'read-only' },
    { ...common, hourlyTokenLimit: 20000, allowUpload: false, sandboxMode: 'read-only' },
  ]);
});
