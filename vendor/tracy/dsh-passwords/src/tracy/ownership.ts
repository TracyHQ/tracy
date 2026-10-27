/**
 * H20 — upstream's "workspace owned by another subuser" check (`gateway.ts`
 * `workspaceOwnedByAnotherSubuser`), the same answer at a fraction of the cost.
 *
 * WHY (TCH, dev host, 25/10/2026). Upstream asks it for every streamed frame of every seat, two or
 * three times per frame, and each ask read every `user_workspaces` row, then per row a decrypting
 * `getUserById` and `samePathForMatch`, which `realpath`s both paths up to four times, walking up
 * through every missing folder with a thrown error each step. 117 rows (87 onboarding folders gone
 * from disk): 49 % of the gateway's CPU samples, one core at 100 % for a whole turn, chat frames up to
 * 14.8 s behind the server and the live connection dropped 2–4 times per turn for every user on the
 * host.
 *
 * WHAT STAYS (Q13: re-checked on every frame). Nothing is remembered between two checks: each one
 * reads the rows and the filesystem again, so a registration, a role change or a new symlink counts on
 * the very next frame. Within one check:
 * - the rows and their owners' roles come in ONE query (`TracyStore.workspaceOwnerRows`), the role
 *   read as `getUserById(...).role` reads it, without decrypting a name nobody looks at;
 * - each path is made canonical once (`canonicalForMatch`'s walk, the existence of a folder probed
 *   without throwing, each real ancestor resolved once), and only when the plain strings do not
 *   already decide;
 * - the predicate is upstream's, in upstream's order: another account, role `user`, same path both
 *   ways (string or canonical, as `pathWithinDeletedTree`), then the shared-grant waiver (H15 S2).
 * `test/tracy/ownership.test.ts` holds it to upstream's own predicate.
 */
import fs from 'node:fs';
import path from 'node:path';

import { normalizePath } from '../permissions.js';
import { tracyStoreOf } from './persistence.js';

/** One `user_workspaces` row with its owner's role (null: no such account any more). */
export interface OwnerRow {
  readonly userId: number;
  readonly path: string;
  readonly role: string | null;
}

/** The filesystem calls a check makes (tests count them). */
export interface OwnershipIo {
  readonly statSync: typeof fs.statSync;
  readonly realpathSync: typeof fs.realpathSync;
}

export interface OwnershipDeps {
  /** Every ownership row, read again on each check. */
  rows(): readonly OwnerRow[];
  /** H15 (S2): whether `viewerId` shares `ownerPath` with its owner by grant. */
  sharesFolder(viewerId: number, ownerId: number, ownerPath: string): boolean;
  io?: OwnershipIo;
}

/**
 * Upstream's `normalizeForMatch` (`db.ts`), copied rather than imported: `db.ts` loads `node:sqlite`,
 * and this module is reached from the policy entry every test process preloads (Node 22/24 then print
 * an ExperimentalWarning that the client tests count as a console error, CI 25/10/2026).
 * `test/tracy/ownership.test.ts` holds the copy equal to upstream's.
 */
export function normalizeForMatch(candidate: string): string {
  const normalized = normalizePath(candidate);
  if (/^[a-z]:\/+$/.test(normalized)) return normalized[0] + ':/';
  const trimmed = normalized.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Upstream's `foldPathCase` (`db.ts`, not exported). */
const foldPathCase = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value);

/** Upstream's `isWithinKey` (`db.ts`, not exported). */
function isWithinKey(candidateKey: string, rootKey: string): boolean {
  if (rootKey === '' || rootKey === '.') return false;
  if (rootKey === '/' || /^[a-z]:\/$/.test(rootKey)) return candidateKey === rootKey || candidateKey.startsWith(rootKey);
  return candidateKey === rootKey || candidateKey.startsWith(rootKey + '/');
}

/**
 * Upstream's `canonicalForMatch` with this check's memory: realpath of the path, else of its nearest
 * existing ancestor with the missing segments put back. An existence probe that does not throw comes
 * first, and each probed folder's answer is kept for the rest of this one check.
 */
function canonicalizer(io: OwnershipIo): (candidate: string) => string {
  const real = new Map<string, string | null>();
  const realOf = (current: string): string | null => {
    let known = real.get(current);
    if (known !== undefined) return known;
    known = null;
    try {
      if (io.statSync(current, { throwIfNoEntry: false }) !== undefined) known = io.realpathSync(current);
    } catch {
      known = null;
    }
    real.set(current, known);
    return known;
  };
  return (candidate) => {
    const missingSegments: string[] = [];
    let current = normalizePath(candidate);
    while (true) {
      const resolved = realOf(current);
      if (resolved !== null) return normalizePath(path.join(resolved, ...missingSegments.reverse()));
      const parent = normalizePath(path.dirname(current));
      if (parent === current || parent === '.' || parent === '') return normalizePath(candidate);
      missingSegments.push(path.basename(current));
      current = parent;
    }
  };
}

/** The check, over rows read per call: `(userId, workspacePath) => owned by another subuser`. */
export function createOwnershipCheck(deps: OwnershipDeps): (userId: number, workspacePath: string) => boolean {
  const io = deps.io ?? fs;
  return (userId, workspacePath) => {
    const rows = deps.rows();
    if (rows.length === 0) return false;
    const canonical = canonicalizer(io);
    const keys = new Map<string, { plain: string; canon: () => string }>();
    const keyOf = (value: string) => {
      let key = keys.get(value);
      if (key === undefined) {
        let canon: string | undefined;
        key = {
          plain: foldPathCase(normalizeForMatch(value)),
          canon: () => (canon ??= foldPathCase(normalizeForMatch(canonical(value)))),
        };
        keys.set(value, key);
      }
      return key;
    };
    // upstream's `pathWithinDeletedTree(a, b)`: as strings, else canonical
    const within = (a: string, b: string): boolean => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      return isWithinKey(ka.plain, kb.plain) || isWithinKey(ka.canon(), kb.canon());
    };
    return rows.some((row) => {
      if (row.userId === userId || row.role !== 'user') return false;
      const ownerPath = normalizePath(row.path);
      return (
        within(ownerPath, workspacePath) &&
        within(workspacePath, ownerPath) &&
        !deps.sharesFolder(userId, row.userId, ownerPath)
      );
    });
  };
}

/**
 * The gateway's H20: the check over this database's rows, or null to leave upstream's own (no Tracy
 * store attached — a database `init()` did not build).
 */
export function tracyOwnershipCheck(
  db: object,
  sharesFolder: OwnershipDeps['sharesFolder'],
): ((userId: number, workspacePath: string) => boolean) | null {
  const store = tracyStoreOf(db);
  if (store === undefined) return null;
  return createOwnershipCheck({ rows: () => store.workspaceOwnerRows(), sharesFolder });
}
