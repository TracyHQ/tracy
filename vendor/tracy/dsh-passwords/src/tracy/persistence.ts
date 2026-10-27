/**
 * Persistence (H10) — a named I/O adapter: the Tracy part of the gateway database, kept OUT of
 * upstream's `db.ts`. It runs on a SQLite handle the gateway gives it (node:sqlite `DatabaseSync`
 * satisfies {@link SqlHandle}) after upstream's `Database.init()`, and only ADDS to upstream's
 * schema:
 *
 * - `users.seat_role` — the role the signed seat grant named (an owner and a site Admin write
 *   identical permission rows; only this tells them apart);
 * - `users.email` — a seat's proven address, encrypted like `username`, read for the prompter stamp;
 * - `user_session_grants.origin` / `seed_tick` and table `session_grant_clock` — how each grant
 *   came to be, so a seat reads only the conversations it started (TCH #300).
 *
 * Column names and meanings match the 2.6.6 fork, so a database that fork migrated needs nothing.
 */

/** The subset of node:sqlite's `StatementSync` this adapter uses. */
export interface SqlStatement {
  run(...params: Array<string | number | null>): unknown;
  get(...params: Array<string | number | null>): unknown;
  all(...params: Array<string | number | null>): unknown[];
}

/** The subset of node:sqlite's `DatabaseSync` this adapter uses. */
export interface SqlHandle {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
}

/** Upstream's `FieldCrypto` subset: `users.username` and `users.email` are stored encrypted. */
export interface FieldCodec {
  encrypt(plain: string | null): string | null;
  decrypt(cipher: string | null): string | null;
}

export interface TracyStore {
  /** Add the Tracy columns and table when missing; idempotent; run right after `Database.init()`. */
  migrate(): void;
  /** Whether the grant book honours `sessionId` for this account ({@link GRANT_HONOURED}). */
  isGrantHonoured(userId: number, sessionId: string): boolean;
  /** Every session id the book honours for this account, sorted. */
  honouredGrants(userId: number): string[];
  /**
   * Issue #19's one-time seed from the workspaces an account sees, marked done in the same
   * transaction. A seat account of any role is marked and given nothing: a listing says where a
   * conversation lives, not whose it is. Other accounts get additive `seed` rows. As upstream, a
   * second call and an account with no permission row change nothing (the mark lives on that row).
   */
  seedUserSessionGrants(userId: number, sessionIds: readonly string[]): boolean;
  /** The role the signed seat grant named; null for an account the seat door never minted. */
  seatRole(userId: number): string | null;
  /** Record the seat grant's role. Only the seat door calls this. */
  setSeatRole(userId: number, seatRole: string): void;
  /**
   * Record that THIS account's own create/fork returned `sessionId` (Q5). Refused (false, nothing
   * written) when another account already holds a grant on it, except a `seed` row written after
   * `since` (the {@link sessionGrantWatermark} taken when the call was sent).
   */
  recordCreatedSession(userId: number, sessionId: string, since?: number): boolean;
  /**
   * The master's explicit grant list becomes the account's grants (Q1): rows not named are
   * dropped, named ones are written as `master`, and a row the account created stays `created`.
   * Upstream's writers (`setPermissions` with `allowedSessionIds`, `replaceUserSessionGrants`,
   * `addUserSessionGrant`) write no origin, which a private seat never reads: the admin save must
   * come here (Pha 2, H10).
   */
  writeMasterGrants(userId: number, sessionIds: readonly string[]): void;
  /** The seed clock's current tick, taken when a create/fork is sent. */
  sessionGrantWatermark(): number;
  /** Move the account's credential version (V3): every token signed with the old one stops working. Returns the new version. */
  bumpCredentialVersion(userId: number): number;
  /** Keep a seat's proven address (encrypted, lower-cased). Only the seat door calls this. */
  setEmail(userId: number, email: string): void;
  /** The account's proven address, lower-cased; null for the master, visitors and password accounts. */
  emailOf(userId: number): string | null;
  /** Set an account's gateway role. The seat door demotes a seat upstream promoted (S5). */
  setUserRole(userId: number, role: 'admin' | 'user'): void;
  /**
   * Every `user_workspaces` row with its owner's role (null when the account is gone), in one read:
   * the per-frame ownership check (H20, `ownership.ts`) reads the role as upstream's `getUserById`
   * does, without decrypting each owner's name.
   */
  workspaceOwnerRows(): Array<{ userId: number; path: string; role: string | null }>;
}

/**
 * The grant origins a SEAT is held to: sessions it started and the master's explicit grants. An
 * owner seat also keeps `legacy` rows (pre-origin history, where its own old conversations live);
 * no seat ever reads a `seed` row. An account the seat door never minted keeps every row, as upstream.
 */
const GRANT_HONOURED = `(g.origin IN ('created', 'master')
  OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = g.user_id AND u.seat_role IS NOT NULL)
  OR (g.origin = 'legacy' AND EXISTS (SELECT 1 FROM users u WHERE u.id = g.user_id AND u.seat_role = 'owner')))`;

/** Upstream's grant id rule: what `user_session_grants.session_id` may hold. */
const plausibleSessionId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200;

/** Account names only the seat door mints: a person, or a person on one site. */
const SEAT_ACCOUNT_NAME = /^s[0-9a-f]{24}(?:_[A-Za-z0-9_-]{6})?$/;
/** Visitor account names the seat door mints for `guest`/`bot`. */
const VISITOR_ACCOUNT_NAME = /^v\d{8}x[0-9a-f]{8}$/;

export function createTracyStore(sql: SqlHandle, codec: FieldCodec): TracyStore {
  /** The H20 read, prepared once (`workspaceOwnerRows`). */
  let ownerRows: SqlStatement | undefined;
  const columnsOf = (table: string): Set<string> =>
    new Set((sql.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));

  const inTransaction = <T>(work: () => T): T => {
    sql.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      sql.exec('COMMIT');
      return result;
    } catch (error) {
      sql.exec('ROLLBACK');
      throw error;
    }
  };

  /**
   * `seat_role` arrives on a database that already holds seats (upstream-only history): every
   * seat-door account gets `unknown` (read as a private seat) and its credential version moves, so
   * its live token ends and the next mint records the real role.
   */
  const addSeatRole = (): void => {
    inTransaction(() => {
      sql.exec('ALTER TABLE users ADD COLUMN seat_role TEXT');
      // `admin` too: upstream's init() may already have promoted the earliest account, a seat.
      const rows = sql.prepare("SELECT id, username, email FROM users WHERE role IN ('user', 'admin')").all() as Array<{
        id: number; username: string; email: string | null;
      }>;
      const mark = sql.prepare("UPDATE users SET seat_role = 'unknown', credential_version = credential_version + 1 WHERE id = ?");
      for (const row of rows) {
        const name = codec.decrypt(row.username) ?? '';
        if (row.email !== null || SEAT_ACCOUNT_NAME.test(name) || VISITOR_ACCOUNT_NAME.test(name)) mark.run(row.id);
      }
    });
  };

  const seatRole = (userId: number): string | null =>
    (sql.prepare('SELECT seat_role FROM users WHERE id = ?').get(userId) as { seat_role: string | null } | undefined)?.seat_role ?? null;

  const sessionGrantWatermark = (): number =>
    Number((sql.prepare('SELECT tick FROM session_grant_clock WHERE id = 1').get() as { tick: number } | undefined)?.tick ?? 0);

  return {
    isGrantHonoured(userId, sessionId) {
      if (!plausibleSessionId(sessionId)) return false;
      return sql.prepare(`SELECT 1 FROM user_session_grants g WHERE g.user_id = ? AND g.session_id = ? AND ${GRANT_HONOURED}`)
        .get(userId, sessionId) !== undefined;
    },
    honouredGrants(userId) {
      return (sql.prepare(`SELECT g.session_id FROM user_session_grants g WHERE g.user_id = ? AND ${GRANT_HONOURED} ORDER BY g.session_id`)
        .all(userId) as { session_id: string }[]).map((row) => row.session_id);
    },
    seedUserSessionGrants(userId, sessionIds) {
      const ids = [...new Set(sessionIds.filter(plausibleSessionId))].slice(0, 2000);
      return inTransaction(() => {
        const row = sql.prepare('SELECT session_grants_seeded FROM user_permissions WHERE user_id = ?').get(userId) as
          | { session_grants_seeded: number }
          | undefined;
        if (row === undefined || row.session_grants_seeded === 1) return false;
        if (seatRole(userId) === null && ids.length > 0) {
          sql.prepare('INSERT OR IGNORE INTO session_grant_clock (id, tick) VALUES (1, 0)').run();
          sql.prepare('UPDATE session_grant_clock SET tick = tick + 1 WHERE id = 1').run();
          const tick = sessionGrantWatermark();
          const insert = sql.prepare("INSERT OR IGNORE INTO user_session_grants (user_id, session_id, origin, seed_tick) VALUES (?, ?, 'seed', ?)");
          for (const id of ids) insert.run(userId, id, tick);
        }
        sql.prepare("UPDATE user_permissions SET session_grants_seeded = 1, updated_at = datetime('now') WHERE user_id = ?").run(userId);
        return true;
      });
    },
    seatRole,
    setSeatRole(userId, role) {
      sql.prepare('UPDATE users SET seat_role = ? WHERE id = ?').run(role, userId);
    },
    recordCreatedSession(userId, sessionId, since) {
      if (!plausibleSessionId(sessionId)) return false;
      const mark = typeof since === 'number' && Number.isSafeInteger(since) && since >= 0 ? since : null;
      return inTransaction(() => {
        const other = mark === null
          ? sql.prepare('SELECT 1 FROM user_session_grants WHERE session_id = ? AND user_id != ? LIMIT 1').get(sessionId, userId)
          : sql.prepare(
            "SELECT 1 FROM user_session_grants WHERE session_id = ? AND user_id != ? AND NOT (origin = 'seed' AND seed_tick IS NOT NULL AND seed_tick > ?) LIMIT 1",
          ).get(sessionId, userId, mark);
        if (other !== undefined) return false;
        sql.prepare(
          `INSERT INTO user_session_grants (user_id, session_id, origin) VALUES (?, ?, 'created')
           ON CONFLICT(user_id, session_id) DO UPDATE SET origin = 'created'`,
        ).run(userId, sessionId);
        return true;
      });
    },
    writeMasterGrants(userId, sessionIds) {
      const keep = new Set(sessionIds.filter(plausibleSessionId));
      inTransaction(() => {
        const existing = sql.prepare('SELECT session_id FROM user_session_grants WHERE user_id = ?').all(userId) as { session_id: string }[];
        const drop = sql.prepare('DELETE FROM user_session_grants WHERE user_id = ? AND session_id = ?');
        for (const { session_id: id } of existing) if (!keep.has(id)) drop.run(userId, id);
        const upsert = sql.prepare(
          `INSERT INTO user_session_grants (user_id, session_id, origin) VALUES (?, ?, 'master')
           ON CONFLICT(user_id, session_id) DO UPDATE SET origin = CASE WHEN origin = 'created' THEN 'created' ELSE 'master' END`,
        );
        for (const id of keep) upsert.run(userId, id);
      });
    },
    sessionGrantWatermark,
    bumpCredentialVersion(userId) {
      sql.prepare('UPDATE users SET credential_version = credential_version + 1 WHERE id = ?').run(userId);
      return Number((sql.prepare('SELECT credential_version FROM users WHERE id = ?').get(userId) as { credential_version: number } | undefined)
        ?.credential_version ?? 0);
    },
    setEmail(userId, email) {
      sql.prepare('UPDATE users SET email = ? WHERE id = ?').run(codec.encrypt(email.trim().toLowerCase()), userId);
    },
    emailOf(userId) {
      const row = sql.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string | null } | undefined;
      const email = codec.decrypt(row?.email ?? null);
      return email === null || email === '' ? null : email.trim().toLowerCase();
    },
    migrate() {
      if (!columnsOf('users').has('email')) sql.exec('ALTER TABLE users ADD COLUMN email TEXT');
      const grants = columnsOf('user_session_grants');
      if (!grants.has('origin')) sql.exec("ALTER TABLE user_session_grants ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy'");
      if (!grants.has('seed_tick')) sql.exec('ALTER TABLE user_session_grants ADD COLUMN seed_tick INTEGER');
      sql.exec('CREATE TABLE IF NOT EXISTS session_grant_clock (id INTEGER PRIMARY KEY CHECK (id = 1), tick INTEGER NOT NULL)');
      if (!columnsOf('users').has('seat_role')) addSeatRole();
      // S5: a seat is never the master. Upstream's init() promotes the earliest account when no
      // admin exists — on a fleet host, with no setup admin, that is the first seat ever minted —
      // and the role is read from the row on every request. Demoted here, before the listener opens.
      sql.exec("UPDATE users SET role = 'user' WHERE role = 'admin' AND (seat_role IS NOT NULL OR email IS NOT NULL)");
      // Upstream's promotion, made again without the seats: with no master left, the earliest
      // account that is not a seat is the one a lone promotion may pick (a real setup admin from
      // before the seat door). A fleet host with seats only keeps no master at all.
      sql.exec(`UPDATE users SET role = 'admin'
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
          AND id = (SELECT MIN(id) FROM users WHERE seat_role IS NULL AND email IS NULL)`);
    },
    setUserRole(userId, role) {
      sql.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    },
    workspaceOwnerRows() {
      ownerRows ??= sql.prepare(
        'SELECT w.user_id AS userId, w.path AS path, u.role AS role FROM user_workspaces w LEFT JOIN users u ON u.id = w.user_id',
      );
      return ownerRows.all() as Array<{ userId: number; path: string; role: string | null }>;
    },
  };
}

/** The store of each upstream `Database`, attached by its `init()` (hook H10). */
const stores = new WeakMap<object, TracyStore>();

/**
 * H10: build the store over a database's own handle, migrate it, and remember it for that
 * database. Called by `Database.init()`, so the migration runs on every boot before any listener
 * opens, and in every test that builds a database the way the product does.
 * @param owner - the upstream `Database` instance.
 * @returns the store, already migrated.
 */
export function attachTracyStore(owner: object, sql: SqlHandle, codec: FieldCodec): TracyStore {
  const store = createTracyStore(sql, codec);
  store.migrate();
  stores.set(owner, store);
  return store;
}

/** The store `init()` attached to this database; undefined before `init()`. */
export function tracyStoreOf(owner: object): TracyStore | undefined {
  return stores.get(owner);
}

/**
 * Q1 on the stream doors: whether the grant book holds `sessionId` for this account by Tracy's
 * origin rule ({@link GRANT_HONOURED}), not upstream's "any row". A database with no store attached
 * (a structural fake in a unit test) answers through its own `hasUserSessionGrant`.
 */
export function grantHonoured(
  db: { hasUserSessionGrant(userId: number, sessionId: string): boolean },
  userId: number,
  sessionId: string,
): boolean {
  const store = tracyStoreOf(db);
  return store === undefined ? db.hasUserSessionGrant(userId, sessionId) : store.isGrantHonoured(userId, sessionId);
}

/**
 * Q1: the book has a row for `sessionId` that Tracy's origin rule does not honour (a `legacy` row of a
 * non-owner seat, a `seed` row). Upstream's own listings read any row; these ids leave them.
 */
export function grantRefused(
  db: { hasUserSessionGrant(userId: number, sessionId: string): boolean },
  userId: number,
  sessionId: string,
): boolean {
  return db.hasUserSessionGrant(userId, sessionId) && !grantHonoured(db, userId, sessionId);
}

/** Q10: the account's own proven address, lower-cased; null when it has none or no store is attached. */
export function ownEmailOf(db: object, userId: number): string | null {
  return tracyStoreOf(db)?.emailOf(userId) ?? null;
}
