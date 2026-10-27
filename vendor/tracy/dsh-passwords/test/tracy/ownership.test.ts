/**
 * H20 — the per-frame "workspace owned by another subuser" check, made cheap without changing its
 * answer (turn latency, TCH 25/10/2026). Upstream asks it for every streamed frame, two or three
 * times, and each ask read every `user_workspaces` row back with a decrypting `getUserById` and up to
 * four `realpath` walks per row: on the dev host (117 rows, 87 of them folders that no longer exist)
 * that was ~93 % of the gateway's busy time during a turn. The rewrite must answer exactly what
 * upstream answers, and is held to it here against upstream's own predicate, rebuilt from the same
 * exported helpers.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs, { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeForMatch as upstreamNormalizeForMatch, samePathForMatch } from '../../src/db.js';
import { normalizePath } from '../../src/permissions.js';
import { createOwnershipCheck, normalizeForMatch, type OwnerRow } from '../../src/tracy/ownership.js';

const root = mkdtempSync(path.join(os.tmpdir(), 'dshpw-ownership-'));
after(() => rmSync(root, { recursive: true, force: true }));

const site = path.join(root, 'site');
mkdirSync(path.join(site, 'alpha', 'sub'), { recursive: true });
mkdirSync(path.join(site, 'beta'), { recursive: true });
symlinkSync(path.join(site, 'beta'), path.join(site, 'beta-alias'));
symlinkSync(path.join(site, 'gone'), path.join(site, 'dangling'));

/** Upstream's predicate (`gateway.ts` `workspaceOwnedByAnotherSubuser`), word for word over rows. */
const upstreamAnswer = (
  rows: readonly OwnerRow[],
  sharesFolder: (viewer: number, owner: number, ownerPath: string) => boolean,
  userId: number,
  workspacePath: string,
): boolean => {
  const owners = rows.map((row) => ({ userId: row.userId, path: normalizePath(row.path) }));
  if (owners.length === 0) return false;
  const roleOf = (id: number) => rows.find((row) => row.userId === id)?.role ?? undefined;
  return owners.some((owner) =>
    owner.userId !== userId &&
    roleOf(owner.userId) === 'user' &&
    samePathForMatch(owner.path, workspacePath) &&
    !sharesFolder(userId, owner.userId, owner.path),
  );
};

const p = (...parts: string[]) => path.join(site, ...parts);
const ROWS: OwnerRow[] = [
  { userId: 2, path: p('alpha'), role: 'user' },
  { userId: 3, path: p('beta') + '/', role: 'user' },
  { userId: 4, path: p('admin-owned'), role: 'admin' },
  { userId: 5, path: p('orphan'), role: null },
  { userId: 6, path: p('gone-onboarding'), role: 'user' },
  { userId: 7, path: p('dangling'), role: 'user' },
  { userId: 8, path: p('shared'), role: 'user' },
];
const shares = (viewer: number, owner: number) => viewer === 9 && owner === 8;

test('H20: the same answer as upstream for every user and path — aliases, symlinks, missing and dangling folders, roles, shared grants', () => {
  const check = createOwnershipCheck({ rows: () => ROWS, sharesFolder: shares });
  const candidates = [
    p('alpha'), p('alpha') + '/', p('alpha', 'sub'), p('alpha', '..', 'alpha'), p('beta'), p('beta-alias'),
    p('beta-alias', 'x'), p('admin-owned'), p('orphan'), p('gone-onboarding'), p('gone-onboarding', 'deeper'),
    p('dangling'), p('gone'), p('shared'), p('nobody'), site, '/', '',
  ];
  let denied = 0;
  for (const userId of [1, 2, 3, 6, 9])
    for (const candidate of candidates) {
      const want = upstreamAnswer(ROWS, shares, userId, candidate);
      assert.equal(check(userId, candidate), want, `user ${userId} on ${candidate}`);
      if (want) denied += 1;
    }
  assert.ok(denied >= 10, `the matrix exercises refusals too (${denied})`);
});

test('🔒 H20: a workspace another subuser owns is still refused — by its own path, by a symlink to it, and after the owner registers it mid-stream', () => {
  const rows: OwnerRow[] = [{ userId: 3, path: p('beta'), role: 'user' }];
  const check = createOwnershipCheck({ rows: () => rows, sharesFolder: () => false });
  assert.equal(check(1, p('beta')), true, 'its own path');
  assert.equal(check(1, p('beta-alias')), true, 'a symlink to it');
  assert.equal(check(3, p('beta')), false, 'the owner itself');
  assert.equal(check(1, p('alpha')), false, 'a folder nobody else owns');
  // nothing is remembered between checks: a row written now counts on the very next frame
  rows.push({ userId: 2, path: p('alpha'), role: 'user' });
  assert.equal(check(1, p('alpha')), true, 'a registration takes effect on the next check');
  rows[1] = { ...rows[1], role: 'admin' };
  assert.equal(check(1, p('alpha')), false, 'and so does a role change');
});

/** Every filesystem and database call one check makes, upstream's way and the rewrite's. */
const counted = () => {
  const calls = { stat: 0, realpath: 0, rows: 0 };
  const io = {
    statSync: ((target: string, options: { throwIfNoEntry: false }) => {
      calls.stat += 1;
      return fs.statSync(target, options);
    }) as typeof fs.statSync,
    realpathSync: ((target: string) => {
      calls.realpath += 1;
      return fs.realpathSync(target);
    }) as typeof fs.realpathSync,
  };
  return { calls, io };
};

test('H20: per check, one read of the rows and one filesystem lookup per row at most — upstream decrypted a user per row and walked up to four realpaths per row', () => {
  // the dev host's shape on 25/10/2026: 117 rows, 87 onboarding folders that no longer exist
  const rows: OwnerRow[] = [];
  for (let i = 0; i < 117; i += 1)
    rows.push({ userId: 100 + i, path: i < 87 ? p(`onboard-${i}`) : p(i % 2 === 0 ? 'alpha' : 'beta', `s${i}`), role: 'user' });
  for (let i = 87; i < 117; i += 1) mkdirSync(rows[i].path, { recursive: true });
  const { calls, io } = counted();
  const check = createOwnershipCheck({
    rows: () => {
      calls.rows += 1;
      return rows;
    },
    sharesFolder: () => false,
    io,
  });
  const candidate = p('saigon-iron-boxing');
  assert.equal(check(1, candidate), upstreamAnswer(rows, () => false, 1, candidate));
  assert.equal(calls.rows, 1, 'one read of the rows (upstream: one, then a decrypting getUserById per row)');
  assert.ok(calls.realpath <= 30 + 4, `realpath once per existing folder and once per shared parent: ${calls.realpath}`);
  assert.ok(calls.stat <= 117 + 4, `one existence probe per row: ${calls.stat}`);

  // and the time, against upstream's predicate over the same rows (no database: the floor of
  // upstream's cost, since it also decrypted a user per row)
  const time = (fn: () => void, n = 60): number => {
    fn();
    const start = process.hrtime.bigint();
    for (let i = 0; i < n; i += 1) fn();
    return Number(process.hrtime.bigint() - start) / 1e6 / n;
  };
  const fast = createOwnershipCheck({ rows: () => rows, sharesFolder: () => false });
  const before = time(() => upstreamAnswer(rows, () => false, 1, candidate));
  const now = time(() => fast(1, candidate));
  console.log(`ownership check, 117 rows: upstream predicate ${before.toFixed(3)} ms, H20 ${now.toFixed(3)} ms (${(before / now).toFixed(1)}x)`);
  assert.ok(now < before, `H20 ${now} ms is not faster than upstream's ${before} ms`);
});

test('H20: its copy of normalizeForMatch is upstream\'s, for every shape of path', () => {
  const inputs = ['', '/', '//', '/a', '/a/', '/a//', 'a/b/', '/a/./b/../c/', 'C:\\', 'c:/', 'C:/x/', 'c:\\x\\', '.', './', '../x/', '/site/beta-alias/'];
  for (const input of inputs) assert.equal(normalizeForMatch(input), upstreamNormalizeForMatch(input), JSON.stringify(input));
});

test('🔒 H20: the policy entry every test process preloads does not load node:sqlite (CI 25/10/2026: its ExperimentalWarning broke the client tests)', () => {
  const probe = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', "await import('./src/tracy/index.ts'); process.stdout.write(JSON.stringify(process.moduleLoadList.filter((m) => /sqlite/i.test(m))))"],
    { cwd: path.join(import.meta.dirname, '..', '..'), encoding: 'utf8' },
  );
  assert.equal(probe.status, 0, probe.stderr);
  assert.deepEqual(JSON.parse(probe.stdout), [], 'src/tracy/index.ts must not reach db.ts');
});
