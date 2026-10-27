// H7: every route the Tracy layer adds to the gateway, registered in ONE call placed before
// upstream's `/gateway/login` (gateway.ts). Routes registered there are served before upstream's
// gate middleware and before its own login/setup handlers, so no whitelist of upstream's is widened.
//
//   - with a seat secret the password door is gone: `/gateway/login` and `/gateway/setup` are 404 (L2);
//   - the seat door, `/gateway/seat/*` (seat-door.ts);
//   - the Tracy sign-in door, `/gateway/tracy/*`, and the no-session answer (tracy-door.ts, H12).
//
// The `usage/report` limit (K4) sits in front of upstream's admin route instead (`usageReportGate`),
// because it must run after upstream's own same-origin and session checks.
import type { Express, NextFunction, Request, Response } from 'express';
import type { Database, UserPermissionsRow } from '../db.js';
import type { TracyDoorConfig } from './config.js';
import type { PageShell } from './door-pages.js';
import { createDshRpc, type DshUpstream } from './dsh-rpc.js';
import { registerSeatDoor } from './seat-door.js';
import { registerTracyDoor } from './tracy-door.js';
import { createUsageReportLimiter } from './usage-report-limit.js';
import { WriteFence, type FenceLedger } from './write-fence.js';
import { installWriteFence, writeFenceFor } from './proxy-hooks.js';

export interface TracyDoorsDeps {
  config: {
    seatSecret?: string;
    tracy?: TracyDoorConfig;
    sessionArchive?: { dshHome: string; sitesRoot: string };
    jwtSecret: string;
    gateway: { tls: unknown };
  };
  db: Database;
  upstream: DshUpstream;
  shell: PageShell;
  safeNext: (next: string | undefined) => string;
  writeFenceLedger?: FenceLedger;
  permissionsOf(userId: number): UserPermissionsRow;
  /** Upstream's 30-second cache of verified session tokens (token → account). */
  sessionCache: Map<string, { user: { userId: number } }>;
  /** Upstream's `invalidateUserSessionAccess`: drop the account's access snapshot. */
  invalidateAccess(userId: number): void;
  /** Upstream's `closeUserWebSocketClients` + `closeUserRemoteMuxClients` for one account. */
  closeConnections(userId: number, code: number, reason: string): void;
  /** Upstream's same-origin check for a browser write (Issue #35). */
  sameOrigin(req: Request): boolean;
}

export function registerTracyDoors(app: Express, deps: TracyDoorsDeps) {
  const { config } = deps;
  const forgetSessions = (userId: number): void => {
    for (const [token, entry] of deps.sessionCache) if (entry.user.userId === userId) deps.sessionCache.delete(token);
  };
  /**
   * A seat was minted (again): its cached sessions go in any case. Its access snapshot goes only
   * when the role moved, since the role decides which grants count (TCH #300); dropping it on every
   * mint answered the seat's tabs already open 403 until a reload rebuilt it (L1, 2.6.6 behaviour).
   */
  const seatMinted = (userId: number, roleChanged: boolean): void => {
    forgetSessions(userId);
    if (roleChanged) deps.invalidateAccess(userId);
  };
  /** Taken back: its cached sessions go and every connection it holds is closed (1008, V1). */
  const endSessions = (userId: number, reason: string): void => {
    forgetSessions(userId);
    deps.closeConnections(userId, 1008, reason);
  };
  // A config built before these fields existed reads as "no door", never the reverse.
  const seatSecret = typeof config.seatSecret === 'string' ? config.seatSecret.trim() : '';
  const tls = config.gateway.tls !== null && config.gateway.tls !== undefined;
  if (seatSecret !== '') {
    app.use(['/gateway/login', '/gateway/setup'], (_req, res) => {
      res.status(404).json({ ok: false, error: 'password login is disabled on this lane' });
    });
  }
  /**
   * Holds new requests to dsh while a deleted site's session folder is checked and moved (#561).
   * The proxy admits writes through the same fence (H11, `writeFenceFor(db)`); the ledger
   * `serve-gateway` passes makes its doubt outlive this process.
   */
  const writeFence = deps.writeFenceLedger === undefined
    ? writeFenceFor(deps.db)
    : installWriteFence(deps.db, new WriteFence(deps.writeFenceLedger));
  const seatDoor = registerSeatDoor(app, {
    db: deps.db,
    seatSecret,
    tls,
    sessionArchive: config.sessionArchive,
    rpc: createDshRpc(deps.upstream),
    writeFence,
    jwtSecret: config.jwtSecret,
    permissionsOf: deps.permissionsOf,
    seatMinted,
    endSessions,
  });
  const tracyDoor = registerTracyDoor(app, {
    db: deps.db,
    door: config.tracy,
    shell: deps.shell,
    safeNext: deps.safeNext,
    jwtSecret: config.jwtSecret,
    tls,
    seatMinted,
    sameOrigin: deps.sameOrigin,
  });
  return {
    /** H12: how a request with no session is answered (redirect to the open door, or 401). */
    answerNoSession: tracyDoor.answerNoSession,
    /** The fence the proxy admits writes through (H11) and the archive door raises. */
    writeFence,
    /**
     * S9: a seat was just sent dsh's whole workspace registry (the unfiltered `workspace/follow`
     * baseline); a site folder its grant names that is missing or untitled is registered in the
     * background. Never waits; never throws (a failed heal is logged).
     */
    seatSawWorkspaces: seatDoor.sawWorkspaces,
    close: seatDoor.close,
  };
}

/**
 * K4: a token bucket per account in front of upstream's `usage/report` route, which allows one
 * report per 5 s and answered a seat's second composer 429 on every tick. Runs upstream's own
 * same-origin and session check first (`authenticate`, which answers on refusal), spends one report
 * from the bucket, and clears upstream's 5 s mark so upstream's handler records the report.
 * @param authenticate - upstream's `apiAuth` for this request (answers and returns null on refusal).
 * @param upstreamThrottle - upstream's per-account mark (`AdminRoutesHandle.usageReportThrottle`).
 */
export function usageReportGate(
  authenticate: (req: Request, res: Response) => { userId: number } | null,
  upstreamThrottle: () => Map<number, number>,
) {
  const limiter = createUsageReportLimiter();
  let calls = 0;
  return (req: Request, res: Response, next: NextFunction): void => {
    const me = authenticate(req, res);
    if (me === null) return;
    const now = Date.now();
    if ((calls = (calls + 1) % 1024) === 0) limiter.sweep(now);
    if (!limiter.take(me.userId, now)) {
      res.status(429).json({ ok: false, code: 'RATE_LIMITED', error: 'Usage reported too often' });
      return;
    }
    upstreamThrottle().delete(me.userId);
    next();
  };
}
