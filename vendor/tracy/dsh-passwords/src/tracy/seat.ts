// The seat door — Tracy's addition to this package, kept in one file on purpose.
//
// WHAT IT IS FOR. Tracy's seat book (a Supabase table behind seats.tracy.ai) already knows who
// a person is and what they may touch. Before this file, the only way to turn that knowledge
// into a lane session was to drive the human login form with a master account: fetch the login
// page, scrape its CSRF field, post the master password, create a sub-user, read the whole user
// list back to learn its id, grant folders, then log in AGAIN as that sub-user. Six requests,
// one long-lived master credential in a Cloudflare Worker, and a chain that breaks the day the
// login page changes a form field.
//
// This door replaces all six with one signed request. It never issues a password anybody can
// use, so there is nothing to leak and nothing to rotate but the shared secret.
//
// WHY IT IS A SEPARATE FILE. This package is vendored from upstream and will be rebased onto
// later releases. Everything Tracy adds lives here; gateway.ts carries only the route wiring.
// A small diff is what keeps the next upgrade a merge rather than an archaeology exercise.
// The database is reached through `SeatBook` below, not by importing `db.ts`: upstream's
// `Database` answers the user/permission half, `persistence.ts` (hook H10) the seat columns.
//
// WHAT IT DELIBERATELY DOES NOT DO. No OAuth, no token verification, no identity of its own.
// Proving who somebody is happens once, at cowork.tracy.ai, against Supabase — the only place
// that can answer for a person who has no seat yet. This door trusts an HMAC from the caller
// that already did that work, and nothing else.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

// The roles and the role matrix live in ONE place, `seat-context.ts` (S6, S8): the 2.7.7 row
// shape, no SSH for any seat, terminal rules beside the row for H6. This file writes that row.
import { SEAT_ROLES, SEAT_TOOLSETS, permissionsFor, seatRoleOf, toolsetsForRole, type SeatPermissions, type SeatRole, type SeatToolset } from './seat-context.js';

export { SEAT_ROLES, SEAT_TOOLSETS, permissionsFor, seatRoleOf, toolsetsForRole };
export type { SeatPermissions, SeatRole, SeatToolset };

// THE MATRIX THAT MAPS ROLE → TOOLSETS DOES NOT LIVE HERE, and that is the point. The seat book
// holds it (`site_role_policy`), where an Owner may widen or narrow it for one site. A second copy
// in this SQLite file would be a second answer to one question. So the caller resolves the matrix
// and sends the result; the role defaults in seat-context.ts are only the fallback for a caller
// that sends nothing.

/** A grant as the seat book states it: who, in what role, over which workspace folders. */
export interface SeatGrant {
  role: SeatRole;
  /** The proven address of a seat holder. Absent for `guest`/`bot`, who are nobody in particular. */
  email?: string | null;
  /** Absolute workspace paths this seat may open. Empty means: nothing. */
  folders: string[];
  /**
   * The site this grant is FOR, when one dsh serves several (Plan 3's host dsh).
   *
   * Absent on a lane, which has exactly one site and needs no discriminator — and absent is not a
   * synonym for "the empty site": it keeps the account name a lane has always used, so an upgrade
   * does not orphan every existing grant.
   */
  site?: string | null;
  /** Toolsets the seat book resolved for this site; omitted falls back to the role's default. */
  toolsets?: readonly SeatToolset[];
  /** Injected in tests so a birthday-stamped visitor name is reproducible. */
  now?: Date;
}

/** An account row as far as the seat door reads it. */
export interface SeatAccount {
  id: number;
  role: string;
}

/**
 * The rows the seat door reads and writes. Upstream's `Database` provides the first six; the
 * last four are the seat columns Tracy adds (`src/tracy/persistence.ts`, hook H10).
 */
export interface SeatBook {
  getUserByUsername(username: string): SeatAccount | null;
  createUser(username: string, passwordHash: string, role: 'user'): SeatAccount;
  listUsers(): Array<SeatAccount & { username: string }>;
  deleteUser(id: number): void;
  updatePasswordHash(id: number, passwordHash: string): void;
  setPermissions(userId: number, perms: SeatPermissions): void;
  setUserRole(id: number, role: 'user'): void;
  setUserEmail(id: number, email: string | null): void;
  getSeatRole(userId: number): string | null;
  setSeatRole(userId: number, seatRole: string): void;
}

/** The one spelling of an address the seat book and this door agree on. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function stamp(now: Date): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * The account name a grant resolves to.
 *
 * SEAT HOLDERS GET A NAME DERIVED FROM THEIR EMAIL, not the email itself: `assertUsername` in
 * auth.ts admits `[A-Za-z0-9_-]{3,32}` only, so `person@example.com` is not a legal account name here
 * and never will be without loosening a rule that guards every other write. A hash keeps one
 * person on one row across logins, across roles, and across providers — Google and GitHub
 * returning the same address land on the same account, which is the whole point.
 *
 * VISITORS KEEP THE BIRTHDAY PREFIX `v<yyyymmdd>x…`. The nightly GC in the Worker reads a
 * visitor's age out of its name; a prettier scheme would need a second store to hold the same
 * fact. Each call mints a new one — a visitor is a session, not a person.
 *
 * ONE ACCOUNT PER (PERSON, SITE) WHEN A SITE IS NAMED (06/09/2026). One dsh now serves every site
 * on a fleet host, and one account per email made the second site's grant OVERWRITE the first's:
 * `upsertSeatUser` writes the permission row of whichever grant arrived last, so the folders and
 * the role of site A were replaced by site B's, and the token minted for A kept working — against
 * B's permissions. Two seats for one person are two different permissions; they cannot share a row.
 *
 * The site half is APPENDED to the whole email half, never mixed into it, and that shape is load
 * bearing twice over: a lane that sends no site keeps the exact name it has always had, and
 * revocation by address stays a prefix match over `s<email hash>` (`seatAccountPrefix` below).
 *
 * ⚠ SIX CHARACTERS, because `assertUsername` (auth.ts) admits `[A-Za-z0-9_-]{3,32}` and the first
 * 26 are spoken for: `s` + 24 hex of the address + `_`. base64url rather than hex buys 36 bits in
 * those six — one collision expected among ~300 000 sites on one host, against ~4 000 for hex.
 * Shortening the email half to make room is what a first draft did; it renames every account that
 * exists today, which is the same data loss by another route.
 * @param grant - the grant being named.
 * @returns an account name satisfying this package's username rule.
 */
export function seatUsername(grant: Pick<SeatGrant, 'role' | 'email' | 'now' | 'site'>): string {
  const email = grant.email ? normalizeEmail(grant.email) : '';
  if (email === '') {
    return `v${stamp(grant.now ?? new Date())}x${randomBytes(4).toString('hex')}`;
  }
  const person = seatAccountPrefix(email);
  const site = (grant.site ?? '').trim();
  if (site === '') return person;
  return `${person}_${createHash('sha256').update(`tracy-seat-site:${site}`).digest('base64url').slice(0, 6)}`;
}

/**
 * Whether an account name is a per-site seat (`seatUsername` with an email AND a site).
 *
 * The site key itself is only hashed into the name, so this answers "was this seat minted for a
 * site", never "which site". The gateway uses it to heal a site folder's workspace registration on
 * that seat's next visit (TCH #557) without registering the extra folders a site-less seat holds.
 * @param username - an account name from the users table.
 * @returns true for `s<24 hex>_<6 base64url>`.
 */
export function isSiteSeatAccount(username: string): boolean {
  return /^s[0-9a-f]{24}_[A-Za-z0-9_-]{6}$/.test(username);
}

/**
 * The part of an account name that stands for the PERSON — and therefore the prefix every one of
 * their per-site accounts starts with.
 *
 * Revocation is by address, so it has to reach all of them. It is a prefix scan rather than a
 * query because `users.username` is stored encrypted with an HMAC equality index (db.ts): the
 * database can answer "which row is exactly this name", never "which rows begin with it".
 * @param email - the address, in any casing.
 * @returns the shared prefix of that person's seat accounts.
 */
export function seatAccountPrefix(email: string): string {
  return `s${createHash('sha256').update(`tracy-seat:${normalizeEmail(email)}`).digest('hex').slice(0, 24)}`;
}

/** A password nobody holds. Seat accounts are reached through this door or not at all. */
function unusablePasswordHash(): string {
  return bcrypt.hashSync(randomBytes(32).toString('hex'), 10);
}

/**
 * Create or update the account behind a grant, and write its permissions.
 *
 * Idempotent by construction: the account name is a function of the email (and of the site, when
 * the caller names one), so a second arrival updates the row the first one made. That is what
 * keeps one person from accumulating an account per login — while still giving them one row per
 * site, because one row cannot hold two sets of folders.
 * @param db - the platform database.
 * @param grant - the grant to apply.
 * @param terminalRules - see `permissionsFor`.
 * @returns the account id, its name, whether this call created it, and whether its seat role moved.
 */
export function upsertSeatUser(
  db: SeatBook,
  grant: SeatGrant,
  terminalRules: string[] = [],
): { userId: number; username: string; created: boolean; seatRoleChanged: boolean } {
  const username = seatUsername(grant);
  const existing = db.getUserByUsername(username);
  const user = existing ?? db.createUser(username, unusablePasswordHash(), 'user');
  // 🔒 A SEAT IS NEVER THE MASTER. The gateway consults no permission row for an `admin` — every
  // workspace visible, any folder open — and upstream's `migrateRoles` promotes the earliest
  // account to admin on boot when none exists, which on a seat-door-only lane is the first seat
  // ever minted (db.ts says where it was measured). The migration no longer picks a seat; this
  // is the second lock, on the row this grant is about to write, so a database promoted by an
  // older build is corrected the moment its seat is minted again.
  if (user.role === 'admin') {
    db.setUserRole(user.id, 'user');
    user.role = 'user';
    console.warn(`[dsh-passwords] seat ${username} was the gateway master; demoted to a seat`);
  }
  // The one moment the address is in hand. The gate reads it back when it stamps `prompter` on a
  // prompt, so the person who typed can be named to the seat book — not the person who logged in
  // last. Guests and bots have no address and keep null.
  if (grant.email) db.setUserEmail(user.id, normalizeEmail(grant.email));
  // The role the SIGNED grant named, kept for the one question no permission row answers: is this
  // the site owner? Every other seat reads only the conversations it started (TCH #300); an owner
  // and a site Admin write identical permission rows, so the role itself is the only witness.
  const seatRoleChanged = db.getSeatRole(user.id) !== grant.role;
  db.setSeatRole(user.id, grant.role);
  db.setPermissions(
    user.id,
    permissionsFor({ role: grant.role, folders: grant.folders, toolsets: grant.toolsets, terminalRules }),
  );
  return { userId: user.id, username, created: existing === null, seatRoleChanged };
}

/**
 * Take a seat back — EVERY seat of that person on this lane, not one.
 *
 * Two things happen per account, and both are needed. The permission row is emptied so nothing is
 * readable even if a session survives somewhere, and `credential_version` is bumped by rewriting
 * the password hash — that version is signed into every JWT this account was ever given, so
 * moving it is what actually ends the sessions. The gateway drops its 30-second session cache in
 * the same request; without that, a revoked seat keeps working for up to half a minute.
 *
 * 🔒 BY ADDRESS ALONE MEANS ALL OF THEM. Since a host dsh gives one person an account per site,
 * taking back "person@example.com" with nothing else said has to reach every one — a revocation that
 * empties the row for site A and leaves B's untouched is a revocation the caller was told
 * succeeded. That is the whole-person case: the workspace door, and anything that ends someone's
 * access outright.
 *
 * 🔒 AND A SITE NAMED MEANS THAT ONE ONLY. A seat is a fact about one site; the book revokes per
 * site, and so must this. Ban every account of an address when only one seat was taken and the
 * other six sites' sessions die with it — self-healing on the next navigation, which is precisely
 * what stops anyone from noticing. `site` and `username` say the same thing at two levels of
 * detail; either narrows the answer, an address alone widens it.
 * @param db - the platform database.
 * @param who - the seat holder, by proven email or by account name.
 * @returns the account ids that were revoked, empty when no such seat exists.
 */
export function revokeSeat(
  db: SeatBook,
  who: { email?: string | null; username?: string; site?: string | null },
): number[] {
  const names: string[] = [];
  if (who.username !== undefined && who.username !== '') {
    names.push(who.username);
  } else if (who.email && (who.site ?? '').trim() !== '') {
    // ONE SITE NAMED, ONE ACCOUNT TAKEN BACK. The seat book revokes per site, and on a host dsh
    // one person holds one account per site — so a site-scoped revocation that banned every
    // account of that address would end their session on the seven sites nobody asked about.
    // Measured shape: removing Lee from `example-site` dropped his live `joomlatest` WebSocket on
    // the same host, mid-turn. It healed on the next navigation, which is exactly why nobody
    // would have gone looking for it.
    names.push(seatUsername({ role: 'editor', email: who.email, site: who.site ?? undefined }));
  } else if (who.email) {
    // A scan, not a query: usernames are encrypted at rest and only equality is indexed, so the
    // prefix has to be matched after decryption. `listUsers()` is the one decrypting reader there
    // is, and a lane's account list is small enough that this costs nothing measurable.
    const prefix = seatAccountPrefix(who.email);
    for (const row of db.listUsers()) {
      if (row.username === prefix || row.username.startsWith(`${prefix}_`)) names.push(row.username);
    }
  }
  const revoked: number[] = [];
  for (const username of names) {
    const user = db.getUserByUsername(username);
    if (!user) continue;
    db.setPermissions(user.id, {
      ...permissionsFor({ role: 'editor', folders: [], terminalRules: [] }),
      banned: true,
    });
    db.updatePasswordHash(user.id, unusablePasswordHash());
    revoked.push(user.id);
  }
  return revoked;
}

/**
 * What a session-less request gets: the sign-in redirect, or a plain 401.
 *
 * ⚠ A REDIRECT TO ANOTHER ORIGIN IS NOT AN ANSWER A PROXY CAN USE, and that is a measured loop,
 * not a theory. A host dsh has no site key, so its sign-in target is Tracy's own origin, absolute
 * (`signInPath` in gateway.ts). `cowork-web` proxies a navigation, reads the answer to decide
 * whether to mint a seat session, and its rule for "you have no session here" was `401`, or a
 * redirect into `/gateway/{login,tracy}`. An absolute `https://cowork.tracy.ai` matched neither,
 * so the Worker handed the redirect to the browser, the browser came back to the same site on its
 * `tracy_site` cookie, and the pair went round for ever — with nothing logged as an error on
 * either side, because neither side thought anything had gone wrong.
 *
 * The Worker now reads its own origin as a rejection too, and that is half the fix. This is the
 * other half, and it is the half that stops the round trip from being made at all: when the caller
 * is the Worker (it carries the Cloudflare Access service-token header on every proxied request)
 * or is plainly not a browser (no `text/html` in `Accept`), say `401` and let it mint. A person
 * typing the dsh hostname into a browser still gets the redirect.
 *
 * Both halves are needed. Only the Worker's, and every non-browser client of a host dsh still gets
 * a cross-origin redirect it cannot follow; only this one, and an older Worker still loops. They
 * are pinned against each other in `scripts/test/seat-door-interop.test.ts`, because this is
 * exactly the kind of contract that passes on both sides while failing between them.
 *
 * @param input - the sign-in target this lane would send a browser to, and who is asking.
 * @returns `401`, or the redirect to make.
 */
export function noSessionAnswer(input: {
  signInTarget: string;
  accept?: string | null;
  serviceToken?: boolean;
}): { status: 401 } | { status: 302; location: string } {
  // Absolute means "another origin" here: `signInPath` answers either a path on this lane or
  // Tracy's own origin, never anything else.
  const crossOrigin = /^https?:\/\//i.test(input.signInTarget);
  const wantsPage = (input.accept ?? '').includes('text/html');
  if (crossOrigin && (input.serviceToken === true || !wantsPage)) return { status: 401 };
  return { status: 302, location: input.signInTarget };
}

/** A visitor account name: `v<yyyymmdd>x<8 hex>`. The date is the only record of its age. */
const VISITOR_NAME = /^v(\d{8})x[0-9a-f]{8}$/;

/**
 * Delete visitor accounts older than a cutoff.
 *
 * WHY THIS EXISTS AT ALL. The nightly clean-up used to run on the master credential: log in, read
 * the whole user list, delete the old ones. Leaving that one job behind would mean keeping the
 * master account alive for it — and the point of the seat door is that no such account is needed.
 *
 * A visitor's age is read out of its own name because that is where the previous design put it,
 * and it is a good place: no second store has to agree about when a session started.
 *
 * ROLE IS CHECKED, NOT JUST THE NAME. An admin named like a visitor is still the platform's only
 * management surface, and deleting it would be unrecoverable.
 * @param db - the platform database.
 * @param input - how old is too old, and what "now" means.
 * @returns how many accounts were removed.
 */
export function sweepVisitors(db: Pick<SeatBook, 'listUsers' | 'deleteUser'>, input: { olderThanDays: number; now?: Date }): number {
  const now = input.now ?? new Date();
  const cutoff = stamp(new Date(now.getTime() - input.olderThanDays * 86_400_000));
  let removed = 0;
  for (const user of db.listUsers()) {
    if (user.role === 'admin') continue;
    const dated = VISITOR_NAME.exec(user.username);
    if (!dated || dated[1] >= cutoff) continue;
    db.deleteUser(user.id);
    removed += 1;
  }
  return removed;
}

// ── The signature on the door ──────────────────────────────────────────────────────────────
//
// The internal endpoints this package already has are loopback-only (gateway.ts), which is
// right for a plugin talking to its own gateway and useless for a Cloudflare Worker. So this
// door authenticates by HMAC instead: the caller signs method, path, body, a timestamp and a
// one-time nonce, and the gateway checks all five. Loopback would not have helped anyway — the
// Worker reaches the lane through a Cloudflare tunnel, from an address nobody can pin.

/** How far a signed request may be from the gateway's clock. Covers ordinary drift, not a capture. */
const FRESHNESS_MS = 60_000;
/** How long a spent nonce is remembered. Longer than the freshness window, or replays slip in. */
const NONCE_MEMORY_MS = 120_000;

function canonical(input: { timestamp: string; nonce: string; method: string; path: string; body: string }): string {
  const bodyHash = createHash('sha256').update(input.body ?? '').digest('hex');
  return `${input.timestamp}\n${input.nonce}\n${input.method.toUpperCase()}\n${input.path}\n${bodyHash}`;
}

/** Sign a request the way the gateway will verify it. Exported so callers cannot drift from it. */
export function signSeatRequest(input: {
  secret: string;
  method: string;
  path: string;
  body: string;
  now?: number;
  nonce?: string;
}): { timestamp: string; nonce: string; signature: string } {
  const timestamp = String(input.now ?? Date.now());
  const nonce = input.nonce ?? randomBytes(16).toString('hex');
  const signature = createHmac('sha256', input.secret)
    .update(canonical({ timestamp, nonce, method: input.method, path: input.path, body: input.body }))
    .digest('hex');
  return { timestamp, nonce, signature };
}

export type SeatVerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'stale' | 'signature' | 'replay' };

/**
 * Verify a signed seat request.
 *
 * Order matters: the signature is checked BEFORE the nonce is remembered, so an unauthenticated
 * caller cannot fill the nonce table by shouting at the door.
 * @param input - the request, the shared secret, and the nonce memory to consult.
 * @returns ok, or the reason it was refused.
 */
export function verifySeatRequest(input: {
  secret: string;
  method: string;
  path: string;
  body: string;
  timestamp: string;
  nonce: string;
  signature: string;
  /** Spent nonces → the moment they may be forgotten. Owned by the caller so it survives requests. */
  seen: Map<string, number>;
  now?: number;
}): SeatVerifyResult {
  const now = input.now ?? Date.now();
  if (input.secret === '' || input.timestamp === '' || input.nonce === '' || input.signature === '') {
    return { ok: false, reason: 'missing' };
  }
  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: 'missing' };
  if (Math.abs(now - sent) > FRESHNESS_MS) return { ok: false, reason: 'stale' };

  const expected = createHmac('sha256', input.secret)
    .update(
      canonical({
        timestamp: input.timestamp,
        nonce: input.nonce,
        method: input.method,
        path: input.path,
        body: input.body,
      }),
    )
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'signature' };

  for (const [spent, expiresAt] of input.seen) {
    if (expiresAt <= now) input.seen.delete(spent);
  }
  if (input.seen.has(input.nonce)) return { ok: false, reason: 'replay' };
  input.seen.set(input.nonce, now + NONCE_MEMORY_MS);
  return { ok: true };
}
