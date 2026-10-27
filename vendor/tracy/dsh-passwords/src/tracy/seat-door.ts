// H7: the seat door, `/gateway/seat/*` — how Tracy's seat book mints, takes back and sweeps lane
// sessions, and has dsh forget or archive a deleted site's conversations (L1, L3, L11, S7, S9, S11,
// S14, K2, K3, V3).
//
// It is called from off this host (cowork-web, through a tunnel) from no address anybody can pin,
// so it authenticates by HMAC over method, path, body, a timestamp and a one-time nonce
// (`seat.ts`), never by peer address. The whole door is absent unless MCP_SEAT_SECRET is set.
import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import type { Database, UserPermissionsRow } from '../db.js';
import { mintSessionToken } from './auth-token.js';
import { currentMount } from './mount.js';
import {
  createSiteWorkspaceRegistrar,
  ensurePersonalWorkspace,
  ensureSiteWorkspace,
  forgetWorkspace,
  settleSiteSessions,
  type SiteWorkspaceOutcome,
  type WorkspaceRpc,
} from './seat-home.js';
import {
  SEAT_TOOLSETS,
  isSiteSeatAccount,
  normalizeEmail,
  revokeSeat,
  seatUsername,
  sweepVisitors,
  upsertSeatUser,
  verifySeatRequest,
  type SeatToolset,
} from './seat.js';
import { nativeSessionRequest, ensureNativeSession, type NativeSessionRequest } from './native-session.js';
import { siteSessionRequest, type SiteSessionRequest } from './site-session.js';
import { tracyStoreOf } from './persistence.js';
import { seatRoleOf } from './seat-context.js';
import { seatBookOf } from './seat-book.js';
import { archiveSiteSessions, SITE_MOUNT, siteWorkspacePath } from './session-archive.js';
import type { FenceScope, WriteFence } from './write-fence.js';

/** How long the archive door waits for requests already on their way to dsh before it keeps the folder (#561). */
const ARCHIVE_FENCE_DRAIN_MS = 3_000;
export const SESSION_COOKIE = 'dsh_gateway_token';
const SESSION_MAX_AGE_S = 43_200;

/** What the seat door needs from the gateway around it. */
export interface SeatDoorDeps {
  db: Database;
  seatSecret: string;
  tls: boolean;
  /** `archive-sessions`: `$DSH_HOME` and the site mount; absent = `$DSH_HOME`, `/site`. */
  sessionArchive?: { dshHome: string; sitesRoot: string };
  rpc: WorkspaceRpc;
  writeFence: WriteFence;
  jwtSecret: string;
  /** The gateway's view of an account's permissions (a missing row reads as `__deny__`). */
  permissionsOf(userId: number): UserPermissionsRow;
  /** A seat was minted: forget its cached sessions; drop its access snapshot only when its role moved. */
  seatMinted(userId: number, roleChanged: boolean): void;
  /** End every connection the account holds (1008) and drop its cached sessions: it was taken back. */
  endSessions(userId: number, reason: string): void;
}

/** The session cookie a door hands the browser, scoped to the mount it arrived under. */
export function sessionCookie(token: string, tls: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=${currentMount() || '/'}; HttpOnly; SameSite=Lax; Max-Age=${String(SESSION_MAX_AGE_S)}${tls ? '; Secure' : ''}`;
}

/**
 * Workspace paths a grant may carry: absolute, one real folder, no `.`/`..` segment, not the root.
 * Returns null on refusal.
 */
export function seatFolders(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const trimmed = item.trim().replace(/\\/g, '/');
    if (
      trimmed === '' ||
      trimmed === '.' ||
      trimmed === '/' ||
      !(trimmed.startsWith('/') || /^[A-Za-z]:\//.test(trimmed)) ||
      /(^|\/)\.\.?($|\/)/.test(trimmed) ||
      path.posix.normalize(trimmed.replace(/^[A-Za-z]:/, '')) === '/'
    ) {
      return null;
    }
    out.push(item);
  }
  return out;
}

const barePath = (p: string): string => path.posix.normalize(p.replace(/\\/g, '/')).replace(/(.)\/+$/, '$1');

/** Register the seat door's routes on `app`. A no-op when no seat secret is set. */
export function registerSeatDoor(app: Express, deps: SeatDoorDeps) {
  const { db, rpc } = deps;
  const book = seatBookOf(db);
  const seatNonces = new Map<string, number>();
  // Raw text, not express.json: the signature covers the exact bytes sent.
  const seatBody = express.text({ type: '*/*', limit: '8kb' });

  // ── Site workspaces that must exist before their folder does (TCH #557) ─────────────────────
  const siteWorkspaces = createSiteWorkspaceRegistrar({ rpc });
  /** Site key per folder, learnt at the door, so a later heal can title what it registers. */
  const siteTitleByFolder = new Map<string, string>();
  /**
   * Site key per folder that a registration left untitled, and how many times. A title dsh refused
   * for good (another workspace holds it) counts as spent at once; any other miss (rename lost to
   * the network, an HTTP error, an unusable answer, the retry budget) lets a later visit ask again,
   * up to `SITE_TITLE_MAX_MISSES` times. A new grant or a success clears it.
   */
  const SITE_TITLE_MAX_MISSES = 3;
  const siteTitleMisses = new Map<string, { title: string; misses: number }>();
  const countedSiteChains = new WeakSet<Promise<SiteWorkspaceOutcome>>();

  /** Whether this account still holds `folder`: not deleted, not banned, the grant names it. */
  const seatHoldsFolder = (userId: number, folder: string): boolean => {
    if (db.getUserById(userId) === null) return false;
    const perms = db.getPermissions(userId);
    if (perms === null || perms.banned) return false;
    const wanted = barePath(folder);
    return perms.allowed_folders.some((entry) => barePath(entry) === wanted);
  };

  /** Whether the door's site key for this folder has used up its misses (`siteTitleMisses`). */
  const siteTitleSpent = (key: string, title: string): boolean => {
    const entry = siteTitleMisses.get(key);
    return entry !== undefined && entry.title === title && entry.misses >= SITE_TITLE_MAX_MISSES;
  };

  /** Register `folder` for this seat in the background; the answer to the seat never waits. */
  const registerSiteWorkspace = (userId: number, folder: string, title: string | null): void => {
    const pending = siteWorkspaces.register(folder, title, () => seatHoldsFolder(userId, folder));
    // One chain is one registration: counted once, however many visits joined it.
    if (countedSiteChains.has(pending)) return;
    countedSiteChains.add(pending);
    void pending.then((outcome) => {
      const key = barePath(folder);
      const wanted = siteTitleByFolder.get(key);
      // An outcome about another title than the door's current one says nothing about the current one.
      if (outcome.status !== 'registered' || wanted === undefined || outcome.title !== wanted) return;
      if (outcome.titled) {
        siteTitleMisses.delete(key);
        return;
      }
      const before = siteTitleMisses.get(key);
      const misses = outcome.titleRefused === true ? SITE_TITLE_MAX_MISSES : (before?.title === wanted ? before.misses : 0) + 1;
      siteTitleMisses.delete(key);
      siteTitleMisses.set(key, { title: wanted, misses });
      if (siteTitleMisses.size > 4096) siteTitleMisses.delete(siteTitleMisses.keys().next().value!);
    });
  };

  /**
   * S9 heal on a visit (TCH #557): every folder this site seat's STORED grant names that is missing
   * from the registry dsh just sent is registered now, and one registered under another title than
   * the site key the door gave is titled now. Folders come from the permission row, never from the
   * request; titles only from the door, never guessed (after a restart none is known, and nothing is
   * renamed). A seat not minted for a site (onboarding homes, master-made accounts) is left alone.
   * @param userId - the authenticated account.
   * @param workspaces - dsh's unfiltered workspace rows (`path`, `title`): the baseline's `items`.
   */
  const healSiteWorkspaces = (userId: number, workspaces: readonly unknown[]): void => {
    const user = db.getUserById(userId);
    if (user === null || user.role === 'admin' || !isSiteSeatAccount(user.username) || book.getSeatRole(userId) === null) return;
    const perms = db.getPermissions(userId);
    if (perms === null || perms.banned) return;
    const registered = workspaceTitles(workspaces);
    for (const folder of perms.allowed_folders) {
      const concrete = seatFolders([folder]);
      if (concrete === null || concrete.length !== 1 || /[*?]/.test(folder)) continue;
      const key = barePath(folder);
      const title = siteTitleByFolder.get(key) ?? null;
      if (registered.has(key)) {
        if (title === null || registered.get(key) === title || siteTitleSpent(key, title)) continue;
      }
      registerSiteWorkspace(userId, folder, title);
    }
  };

  const open = deps.seatSecret !== '';
  const audit = (req: Request, event: string, username: string | null, detail: string): void => {
    void db.audit(event, { username, ip: req.ip, userAgent: req.headers['user-agent'] ?? null, detail });
  };
  const firstHeader = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

  /**
   * The signed body of a seat call, parsed; or null after answering 404 (no door), 403 (bad
   * signature) or 400 (not JSON). The signature is over the door's ROOT path, mount or not.
   */
  const signedPayload = (req: Request, res: Response, routePath: string): Record<string, unknown> | null => {
    if (!open) {
      res.status(404).json({ ok: false, error: 'seat door not enabled' });
      return null;
    }
    const raw = typeof req.body === 'string' ? req.body : '';
    const verdict = verifySeatRequest({
      secret: deps.seatSecret,
      method: req.method,
      path: routePath,
      body: raw,
      timestamp: firstHeader(req.headers['x-seat-timestamp']),
      nonce: firstHeader(req.headers['x-seat-nonce']),
      signature: firstHeader(req.headers['x-seat-signature']),
      seen: seatNonces,
    });
    if (!verdict.ok) {
      res.status(403).json({ ok: false, error: 'forbidden', reason: verdict.reason });
      return null;
    }
    try {
      const parsed: unknown = raw === '' ? {} : JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      return parsed as Record<string, unknown>;
    } catch {
      res.status(400).json({ ok: false, error: 'invalid json' });
      return null;
    }
  };

  app.post('/gateway/seat/session', seatBody, async (req, res) => {
    const payload = signedPayload(req, res, '/gateway/seat/session');
    if (payload === null) return;
    let nativeRequest: NativeSessionRequest | null;
    let siteRequest: SiteSessionRequest | null;
    try {
      siteRequest = siteSessionRequest(payload);
      nativeRequest = nativeSessionRequest(payload);
    }
    catch {
      res.status(400).json({ ok: false, error: 'invalid session allocation request' });
      return;
    }
    // Retired roles (`admin`, `developer`) from an older caller land on `editor` (ADR 0028).
    const role = seatRoleOf(payload.role);
    if (role === null) {
      res.status(400).json({ ok: false, error: 'unknown role' });
      return;
    }
    const email = typeof payload.email === 'string' && payload.email.trim() !== '' ? payload.email.trim() : null;
    // A seat belongs to a person: minting a role without a proven address hands it to whoever asked.
    if (email === null && role !== 'guest' && role !== 'bot') {
      res.status(400).json({ ok: false, error: 'seat roles require a proven email' });
      return;
    }
    let folders = seatFolders(payload.folders);
    if (folders === null) {
      res.status(400).json({ ok: false, error: 'folders must be absolute paths' });
      return;
    }
    // The site this grant is FOR: on a host dsh one account per (person, site), so site B's grant
    // never overwrites site A's permissions under A's live token.
    const site = typeof payload.site === 'string' && payload.site.trim() !== '' ? payload.site.trim() : null;
    if (payload.site !== undefined && site === null) {
      res.status(400).json({ ok: false, error: 'site must be a non-empty string' });
      return;
    }
    // `home`: a root under which THIS seat gets a folder of its own (seat-home.ts). Email-only:
    // a visitor's name is minted per session, and a folder per visit is litter.
    let home: string | null = null;
    if (payload.home !== undefined) {
      const wanted = seatFolders([payload.home]);
      if (wanted === null || wanted.length !== 1) {
        res.status(400).json({ ok: false, error: 'home must be an absolute path' });
        return;
      }
      if (email === null) {
        res.status(400).json({ ok: false, error: 'home requires a proven email' });
        return;
      }
      home = wanted[0]!;
    }
    // Toolsets are the seat book's answer for this site. Absent: the role decides; present (even empty): an instruction.
    let toolsets: SeatToolset[] | undefined;
    if (payload.toolsets !== undefined) {
      if (
        !Array.isArray(payload.toolsets) ||
        payload.toolsets.some((item) => typeof item !== 'string' || !SEAT_TOOLSETS.includes(item as SeatToolset))
      ) {
        res.status(400).json({ ok: false, error: 'unknown toolset' });
        return;
      }
      toolsets = payload.toolsets as SeatToolset[];
    }

    let personal: { path: string; workspaceId: string; created: boolean } | null = null;
    if (home !== null && email !== null) {
      // Before the account row: a seat whose only folder cannot open is worse than no seat.
      try {
        personal = await ensurePersonalWorkspace(
          { root: home, username: seatUsername({ role, email, site }), title: normalizeEmail(email) },
          rpc,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[dsh-passwords] personal workspace under ${home} could not be provided: ${message}`);
        audit(req, 'seat_home_failed', null, message);
        res.status(502).json({ ok: false, error: 'personal workspace could not be provided on this lane' });
        return;
      }
      const own = personal.path;
      folders = [own, ...folders.filter((folder) => folder !== own)];
    }

    // 2.7.7 keeps WebSocket rules in the endpoint register, not on the permission row: none here.
    const seat = upsertSeatUser(book, { role, email, folders, toolsets, site }, []);

    // ONE WORKSPACE, ONE SITE: the site folder is a workspace titled with the site key, registered
    // in the BACKGROUND (the fleet may still be creating the folder; TCH #557).
    if (site !== null && home === null) {
      for (const folder of folders) {
        const key = barePath(folder);
        siteTitleByFolder.delete(key);
        siteTitleByFolder.set(key, site);
        siteTitleMisses.delete(key);
        if (siteTitleByFolder.size > 4096) siteTitleByFolder.delete(siteTitleByFolder.keys().next().value!);
        registerSiteWorkspace(seat.userId, folder, site);
      }
    }
    const user = db.getUserById(seat.userId);
    if (!user) {
      res.status(500).json({ ok: false, error: 'seat account vanished' });
      return;
    }
    let nativeSession: { sessionId: string; workspaceId: string } | null = null;
    let siteSession: { sessionId: string; workspaceId: string } | null = null;
    if (siteRequest !== null) {
      const version = user.credential_version;
      const folder = siteRequest.folder;
      const stillGranted = (): boolean => {
        const current = db.getUserById(seat.userId);
        const perms = db.getPermissions(seat.userId);
        return current !== undefined && current !== null && current.credential_version === version &&
          tracyStoreOf(db)?.seatRole(seat.userId) === 'owner' && perms !== null && perms !== undefined &&
          !perms.banned && perms.allowed_folders.length === 1 && perms.allowed_folders[0] === folder &&
          !perms.disabled_sessions.includes(siteRequest!.session.sessionId);
      };
      try {
        const workspace = await ensureSiteWorkspace(folder, site!, rpc, stillGranted);
        if (!stillGranted()) throw new Error('SITE_SESSION_REVOKED');
        siteSession = await ensureNativeSession(siteRequest.session, workspace.workspaceId, rpc,
          (sessionId) => stillGranted() && tracyStoreOf(db)?.recordCreatedSession(seat.userId, sessionId) === true);
        if (!stillGranted()) throw new Error('SITE_SESSION_REVOKED');
      } catch {
        res.status(502).json({ ok: false, error: 'site session could not be provided' });
        return;
      }
    }
    if (nativeRequest !== null) {
      try {
        if (!personal) throw new Error('NATIVE_WORKSPACE_UNAVAILABLE');
        nativeSession = await ensureNativeSession(nativeRequest, personal.workspaceId, rpc,
          (sessionId) => tracyStoreOf(db)?.recordCreatedSession(seat.userId, sessionId) === true);
      } catch {
        // No token or claimed native identity leaves a failed allocation. A retry uses the same ID.
        res.status(502).json({ ok: false, error: 'native onboarding session could not be provided' });
        return;
      }
    }
    // The cached sessions go in any case; a role that moved also changes which grants count (TCH #300).
    deps.seatMinted(seat.userId, seat.seatRoleChanged);
    audit(
      req,
      'seat_session_minted',
      seat.username,
      `role=${role} folders=${String(folders.length)} created=${String(seat.created)}${
        personal === null ? '' : ` home=${personal.created ? 'new' : 'existing'}`
      }`,
    );
    const token = mintSessionToken(user, { jwtSecret: deps.jwtSecret });
    res.setHeader('Set-Cookie', sessionCookie(token, deps.tls));
    res.json({ ok: true, username: seat.username, created: seat.created, token, expiresInSeconds: SESSION_MAX_AGE_S, ...(nativeSession ? { nativeSession } : {}), ...(siteSession ? { siteSession } : {}) });
  });

  app.post('/gateway/seat/revoke', seatBody, (req, res) => {
    const payload = signedPayload(req, res, '/gateway/seat/revoke');
    if (payload === null) return;
    const email = typeof payload.email === 'string' ? payload.email : null;
    const username = typeof payload.username === 'string' ? payload.username : undefined;
    // `site` NARROWS: taking back a seat on one site must not end the person's session on the next.
    const site = typeof payload.site === 'string' ? payload.site : null;
    if (email === null && username === undefined) {
      res.status(400).json({ ok: false, error: 'email or username required' });
      return;
    }
    const revokedIds = revokeSeat(book, { email, username, site });
    // The session cache and the sockets go here too, or "revoked" is only true of the next request.
    for (const id of revokedIds) deps.endSessions(id, 'Seat revoked');
    audit(
      req,
      'seat_revoked',
      username ?? (site === null ? email : `${String(email)} @ ${site}`),
      revokedIds.length === 0 ? 'no such seat' : `userId=${revokedIds.join(',')}`,
    );
    res.json({ ok: true, revoked: revokedIds[0] ?? null, revokedIds });
  });

  // The nightly clean-up of visitors, on the door rather than on a master credential.
  app.post('/gateway/seat/sweep', seatBody, (req, res) => {
    const payload = signedPayload(req, res, '/gateway/seat/sweep');
    if (payload === null) return;
    const requested = Number(payload.olderThanDays ?? 2);
    // A floor of one day: a stray 0 would delete every visitor at work.
    if (!Number.isFinite(requested) || requested < 1) {
      res.status(400).json({ ok: false, error: 'olderThanDays must be at least 1' });
      return;
    }
    const removed = sweepVisitors(book, { olderThanDays: Math.floor(requested) });
    audit(req, 'seat_visitors_swept', null, `removed=${String(removed)} olderThanDays=${String(Math.floor(requested))}`);
    res.json({ ok: true, removed });
  });

  // A site being deleted: dsh forgets its folder's conversations BEFORE the host tears the folder
  // down, or the next site added at that label opens onto them (seat-home.ts `forgetWorkspace`).
  app.post('/gateway/seat/forget-workspace', seatBody, async (req, res) => {
    const payload = signedPayload(req, res, '/gateway/seat/forget-workspace');
    if (payload === null) return;
    const folders = seatFolders([payload.path]);
    if (folders === null || folders.length !== 1) {
      res.status(400).json({ ok: false, error: 'path must be an absolute folder' });
      return;
    }
    const folder = folders[0]!;
    try {
      const { archived, deleted } = await forgetWorkspace(folder, rpc);
      audit(req, 'seat_workspace_forgotten', null, `path=${folder} archived=${String(archived.length)} deleted=${String(deleted)}`);
      res.json({ ok: true, archived, deleted });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[dsh-passwords] workspace ${folder} could not be forgotten: ${message}`);
      res.status(502).json({ ok: false, error: 'workspace could not be forgotten on this lane' });
    }
  });

  // A deleted site's session folder leaves the live store (session-archive.ts), AFTER the host's
  // teardown: refused while `/site/<label>` still exists. One label, never a pattern.
  app.post('/gateway/seat/archive-sessions', seatBody, async (req, res) => {
    const payload = signedPayload(req, res, '/gateway/seat/archive-sessions');
    if (payload === null) return;
    const prefix = `${SITE_MOUNT}/`;
    const label = typeof payload.path === 'string' && payload.path.startsWith(prefix) ? payload.path.slice(prefix.length) : null;
    if (label === null || label.includes('/')) {
      res.status(400).json({ ok: false, reason: 'INVALID_LABEL', error: `path must be ${SITE_MOUNT}/<label>` });
      return;
    }
    const where = deps.sessionArchive ?? { dshHome: process.env.DSH_HOME?.trim() ?? '', sitesRoot: SITE_MOUNT };
    try {
      // Every session of the site the settle finds, so a request held behind the fence that names
      // one is refused when the fence comes down (write-fence.ts `touchesArchivedSite`).
      const scope: FenceScope = { path: siteWorkspacePath(label), sessionIds: new Set() };
      const result = await archiveSiteSessions({
        dshHome: where.dshHome,
        sitesRoot: where.sitesRoot,
        label,
        settle: (sessionIds) =>
          settleSiteSessions(scope.path, sessionIds, rpc, (owned) => {
            for (const id of owned) scope.sessionIds.add(id);
          }),
        // 🔒 #561: once the fence is up, no write into the site reaches dsh until the folder moved.
        fence: (work) => deps.writeFence.run(ARCHIVE_FENCE_DRAIN_MS, scope, work),
      });
      audit(
        req,
        'seat_sessions_archived',
        null,
        result.ok
          ? `path=${String(payload.path)} archivedTo=${result.archivedTo} sessions=${String(result.sessions)}`
          : `path=${String(payload.path)} refused=${result.reason} ${result.detail}`,
      );
      if (result.ok) {
        res.json({ ok: true, archivedTo: result.archivedTo, sessions: result.sessions });
        return;
      }
      res.status(result.reason === 'INVALID_LABEL' ? 400 : 409).json({ ok: false, reason: result.reason, error: result.detail });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[dsh-passwords] the sessions of ${String(payload.path)} could not be archived: ${message}`);
      res.status(500).json({ ok: false, reason: 'ARCHIVE_FAILED', error: 'the session folder could not be moved' });
    }
  });

  // POST although it only reads: the signature covers the path, not the query string.
  app.post('/gateway/seat/whoami', seatBody, (req, res) => {
    const payload = signedPayload(req, res, '/gateway/seat/whoami');
    if (payload === null) return;
    const email = typeof payload.email === 'string' ? payload.email : null;
    const username = typeof payload.username === 'string' ? payload.username : undefined;
    if (email === null && username === undefined) {
      res.status(400).json({ ok: false, error: 'email or username required' });
      return;
    }
    const site = typeof payload.site === 'string' && payload.site.trim() !== '' ? payload.site.trim() : null;
    const name = username ?? seatUsername({ role: 'editor', email, site });
    const user = db.getUserByUsername(name);
    if (!user) {
      res.json({ ok: true, seat: null });
      return;
    }
    const perms = deps.permissionsOf(user.id);
    res.json({
      ok: true,
      seat: {
        username: user.username,
        folders: perms.allowed_folders,
        banned: perms.banned,
        sandboxMode: perms.sandbox_mode,
        lastLoginAt: user.last_login_at,
      },
    });
  });

  return {
    /**
     * S9: a seat was just sent dsh's whole workspace registry (the `workspace/follow` baseline).
     * Called from the core's frame filter, so it never throws: a failed heal is logged and the
     * next visit asks again.
     */
    sawWorkspaces: (userId: number, workspaces: readonly unknown[]): void => {
      try {
        healSiteWorkspaces(userId, workspaces);
      } catch (error) {
        console.warn(`[dsh-passwords] site workspaces of account ${String(userId)} not healed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    /** Stop the background registrations (the gateway closed). */
    close: (): void => siteWorkspaces.close(),
  };
}

/**
 * The workspace rows (`path`, `title`) of the `workspace/follow` baseline's `items`, one level:
 * `WorkspaceValue` rows carry no nested workspace, and a deeper walk could take a session row's
 * `path` for a registered workspace and skip a heal.
 * @param items - the baseline's `items`.
 * @returns normalized path → title (null when dsh sent none).
 */
export function workspaceTitles(items: readonly unknown[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const item of items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.path === 'string' && typeof row.workspaceId === 'string') {
      out.set(barePath(row.path), typeof row.title === 'string' ? row.title : null);
    }
  }
  return out;
}
