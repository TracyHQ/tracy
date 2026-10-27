/**
 * The proxy's Tracy adapter for one HTTP request (hooks H1 → proxy, H2, H3, H11, H13): a named I/O
 * adapter (plan §1 rule 2) that turns the policy's pure verdicts into what the proxy does — refuse
 * before the upstream request exists, read the body before any byte is written, hold the answer
 * until it is filtered, and count every state-changing request through the write fence. The core
 * calls it at fixed points (TRACY-FORK.md §3); everything it needs from the core comes in
 * `ProxyHookDeps`, so this file imports no core module.
 */
import http from 'node:http';
import https from 'node:https';
import { realpathSync } from 'node:fs';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import { holdAnswer } from './answer-shim.js';
import type { TracyPolicy } from './policy.js';
import type { JobOwnerBook } from './mux-seat.js';
import type { BodyPlan, SeatRequestContext } from './request-path.js';
import { mediaTypeOf } from './request-path.js';
import { collectSessionRefs, UNREADABLE_SESSION_REF } from './session-refs.js';
import { tracyStoreOf } from './persistence.js';
import { touchesArchivedSite, WriteFence, type Ticket } from './write-fence.js';
import { mountOf } from './mount.js';

/** The seat's permission row as far as the request path reads it (upstream `UserPermissionsRow`). */
export interface HookPerms {
  allow_upload: boolean;
  allowed_folders: string[];
}

/** What the core lends the adapter; every function reads live state when called. */
export interface ProxyHookDeps {
  policy: TracyPolicy;
  /** The gateway's database: the key of its write fence (`writeFenceFor`) and the account names. */
  db: object & {
    getUserById(id: number): { username: string } | null;
    /** Upstream's grant write (no origin), used when the policy keeps upstream's grants. */
    addUserSessionGrant(userId: number, sessionId: string): boolean;
  };
  /** Upstream's grant check for a seat, with the permission row as it is now. */
  holdsSession(userId: number, sessionId: unknown): boolean;
  /** The seat's session snapshot (id → working folder) that upstream's grant check passes now. */
  sessionFolders(userId: number): Array<[string, string]>;
  /** The path the gate knows a workspace id by. */
  workspacePath(workspaceId: string): string | undefined;
  /** The gateway's refusal page for this request. */
  forbiddenPage(req: IncomingMessage): string;
  /** Largest answer the gate parses (upstream's `MAX_BUFFER_BYTES`). */
  maxAnswerBytes: number;
  /** The jobs each seat's own filtered streams showed it (J1); read when a kill arrives. */
  jobs(): JobOwnerBook;
  /** Upstream's `rpcRequestPayload`: `payload.args.request` of a dsh RPC body, else null. */
  rpcRequest(body: unknown): Record<string, unknown> | null;
  /** The seat (subuser) a request is authenticated as; undefined for the master or no session. */
  seatOf(req: IncomingMessage): number | undefined;
  /**
   * Upstream's per-account set of live connections (`registerUserWebSocketClient`), which every
   * revocation, access change, ban, logout and credential move closes. Returns the unregister.
   */
  registerConnection(userId: number, client: { close: () => void }): () => void;
}

/** What the proxy knows about the request when it asks. */
export interface HookRequest {
  path: string;
  query: URLSearchParams;
  userId: number | undefined;
  isMaster: boolean;
  perms: HookPerms | undefined;
}

/** What `checkBody` tells the proxy: refused (the answer is sent), or forward the body as it is now. */
export type BodyOutcome = 'refused' | 'forward' | 'rewritten';

export interface RequestRun {
  /** Whether the proxy must read the whole JSON body before it writes a byte to dsh (H2). */
  readonly readsBody: boolean;
  /** The agent this request goes out on (H11: a fenced write on a connection of its own). */
  agent<A extends http.Agent>(upstreamAgent: A): A;
  /** Count `request` for the write fence until dsh answered it (H11). */
  track(request: ClientRequest): void;
  /**
   * The client closed before the answer ended: records whether its body arrived whole, and says
   * whether the upstream request must keep running (a whole write dsh may already hold).
   */
  onClientClose(): 'keep-upstream' | 'destroy-upstream';
  /** H2 on the parsed body; may rewrite `body` in place. */
  checkBody(body: unknown, res: ServerResponse): BodyOutcome;
  /**
   * H3 (Q5): record that this request's create/fork made `sessionId` for the subuser `userId`, at
   * the point upstream writes its grant. False = not recorded: another account already holds that
   * id, so it is not this account's new conversation: it enters no snapshot, and the answer
   * naming it is replaced by a 502 before any of it is sent.
   */
  recordCreated(userId: number, sessionId: string): boolean;
}

// ── Write fence registry (H11) ───────────────────────────────────────────────────────────────

const fences = new WeakMap<object, WriteFence>();

/**
 * The write fence of the gateway that owns `db`: the proxy admits through it, the archive door
 * raises it. One per gateway; created on first use (no ledger) unless one was installed.
 */
export function writeFenceFor(db: object): WriteFence {
  let fence = fences.get(db);
  if (fence === undefined) {
    fence = new WriteFence();
    fences.set(db, fence);
  }
  return fence;
}

/** Give the gateway that owns `db` a fence with a ledger (the CLI does, before it serves). */
export function installWriteFence(db: object, fence: WriteFence): WriteFence {
  fences.set(db, fence);
  return fence;
}

const tickets = new WeakMap<IncomingMessage, Ticket>();
const watched = new WeakSet<IncomingMessage>();
const writeAgents = new WeakMap<http.Agent, http.Agent>();

/**
 * #561: a request under the write fence goes out on a connection of its own. A close without
 * dsh's answer is an unknown outcome unless the connection never opened (write-fence.ts); a
 * kept-alive socket dsh already dropped is open from the start, so reusing one would turn an
 * idle-socket race into doubt that holds every site folder where it is until dsh restarts.
 */
function writeAgentFor<A extends http.Agent>(agent: A): A {
  let fresh = writeAgents.get(agent);
  if (fresh === undefined) {
    const options = { ...(agent as unknown as { options: http.AgentOptions }).options, keepAlive: false };
    fresh = agent instanceof https.Agent ? new https.Agent(options) : new http.Agent(options);
    writeAgents.set(agent, fresh);
  }
  return fresh as A;
}

const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
const CREATE_OR_FORK_RE = /^\/api\/session[./](?:create|fork)$/;

function realpathOrNull(target: string): string | null {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

/** The Tracy side of the proxy's HTTP handler. */
export function createProxyHooks(deps: ProxyHookDeps) {
  const { policy } = deps;

  /**
   * Q1 over HTTP: upstream's grant check (snapshot, any grant row, enabled, folders) AND the grant
   * book's origin rule — a seat holds only sessions it created or the master named (an owner seat
   * also its `legacy` rows), as on the stream doors. With the pass-through policy (no created
   * grants recorded) upstream's check stands alone; under Tracy a database without its store
   * holds nothing.
   */
  function seatHolds(userId: number, sessionId: unknown): boolean {
    if (!deps.holdsSession(userId, sessionId)) return false;
    if (!policy.recordsCreatedGrants) return true;
    const book = tracyStoreOf(deps.db);
    return book !== undefined && typeof sessionId === 'string' && book.isGrantHonoured(userId, sessionId);
  }

  /**
   * V1: a seat's request is one of its live connections from the moment the proxy takes it — held
   * at the write fence or waiting on dsh — until its answer ends here. Revoking the seat destroys
   * the client side: no byte of a later answer reaches it, and the proxy's close handler decides
   * about the upstream request as for any client that left (H11).
   */
  function watchSeat(req: IncomingMessage, res: ServerResponse): void {
    if (!policy.endsPendingRequests) return;
    const seat = deps.seatOf(req);
    if (seat === undefined || watched.has(req)) return;
    watched.add(req);
    const off = deps.registerConnection(seat, { close: () => res.destroy() });
    res.on('close', off);
  }

  /**
   * H11, ahead of the proxy handler: every request that can change dsh's state waits while a
   * site's folder is being archived, then is counted until it ended here and at dsh.
   */
  function admitWrites(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    if (!policy.holdWrites || READ_METHODS.has(req.method ?? 'GET')) {
      next();
      return;
    }
    watchSeat(req, res);
    writeFenceFor(deps.db).admit().then((ticket) => {
      if (req.destroyed || res.destroyed || res.writableEnded) {
        ticket.done();
        return;
      }
      tickets.set(req, ticket);
      res.on('close', () => ticket.done());
      next();
    }, () => {
      // Fail-closed: a request the fence could not admit is not forwarded.
      if (!res.headersSent) {
        res.statusCode = 503;
        res.end();
      }
    });
  }

  /**
   * H1 (finished here), and the run of one request: refuses before the upstream request exists
   * (the answer is sent, null returned), or returns what the proxy consults at each later point.
   */
  function begin(req: IncomingMessage, res: ServerResponse, request: HookRequest): RequestRun | null {
    const ticket = tickets.get(req);
    const heldBy = ticket?.heldBy ?? [];
    const refuse = (status: number): null => {
      res.statusCode = status;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(deps.forbiddenPage(req));
      return null;
    };
    if (heldBy.length > 0 && mediaTypeOf(req.headers['content-type']) !== 'application/json') {
      refuseArchived(res);
      return null;
    }
    const userId = request.userId;
    const ctx: SeatRequestContext | null = userId === undefined ? null : {
      method: req.method ?? 'GET',
      path: request.path,
      query: request.query,
      contentType: req.headers['content-type'],
      bodyless: req.headers['transfer-encoding'] === undefined &&
        (req.headers['content-length'] === undefined || req.headers['content-length'] === '0'),
      account: {
        username: deps.db.getUserById(userId)?.username ?? '',
        email: emailOf(deps.db, userId),
      },
      perms: request.isMaster ? undefined : request.perms,
      holdsSession: (sessionId) => seatHolds(userId, sessionId),
      sessionFolders: () => deps.sessionFolders(userId).filter(([id]) => seatHolds(userId, id)).map(([, cwd]) => cwd),
      realpath: realpathOrNull,
    };
    const plan = ctx === null ? null : policy.decideRequest(ctx);
    if (plan !== null && plan.kind === 'deny') return refuse(plan.status);
    watchSeat(req, res);
    const bodyPlan: BodyPlan | null = plan === null ? null : plan.body;
    let requestRefs: string[] = [];
    if (ctx !== null && plan !== null && plan.answer !== null) {
      const door = plan.answer;
      holdAnswer(res, deps.maxAnswerBytes, (value) => policy.filterAnswer({ ...ctx, requestRefs }, door, value));
    }
    // Q5: the grant book's clock when a create/fork leaves, so a seed written while dsh was making
    // the session is not read as another account holding it.
    const store = tracyStoreOf(deps.db);
    const grantMark = req.method === 'POST' && CREATE_OR_FORK_RE.test(request.path) ? store?.sessionGrantWatermark() : undefined;
    let answered = false;
    let cutShort = false;
    return {
      readsBody: bodyPlan !== null || heldBy.length > 0,
      agent: (upstreamAgent) => (ticket === undefined ? upstreamAgent : writeAgentFor(upstreamAgent)),
      track(upstreamRequest) {
        upstreamRequest.once('response', (upstreamRes: IncomingMessage) => {
          answered = true;
          // A write kept running for the fence after its client left: nobody reads the answer.
          if (res.destroyed) upstreamRes.resume();
        });
        ticket?.upstream(upstreamRequest, () => cutShort);
      },
      onClientClose() {
        // dsh runs a command it received whole to its end whoever waits (write-fence.ts): cutting
        // it off would stop nothing and hide from the fence when it ended. A body that never
        // arrived whole cannot run, and is cut off as before.
        if (ticket !== undefined && req.complete && !answered) return 'keep-upstream';
        if (!req.complete) cutShort = true;
        return 'destroy-upstream';
      },
      checkBody(body, out) {
        if (heldBy.length > 0 && touchesArchivedSite(body, heldBy, deps.workspacePath, { collect: collectSessionRefs, unreadable: UNREADABLE_SESSION_REF })) {
          refuseArchived(out);
          return 'refused';
        }
        if (ctx === null || bodyPlan === null) return 'forward';
        requestRefs = [...collectSessionRefs(body)];
        const verdict = policy.checkRequestBody(ctx, bodyPlan, body);
        if (verdict.kind === 'deny') {
          refuse(verdict.status);
          return 'refused';
        }
        // J1 / Q16: judged against what this seat's own streams showed it (request-path.ts `judge`).
        if (bodyPlan.judge !== null && userId !== undefined) {
          const judged = bodyPlan.judge === 'job-kill'
            ? policy.decideJobKill({
              jobs: deps.jobs(), userId, request: deps.rpcRequest(body),
              holdsSession: (sessionId) => seatHolds(userId, sessionId),
            })
            : policy.decideQuestionAnswer({ jobs: deps.jobs(), userId, body });
          if (judged.kind === 'deny') {
            refuse(judged.status);
            return 'refused';
          }
        }
        return verdict.kind === 'replace' ? 'rewritten' : 'forward';
      },
      recordCreated(subuserId, sessionId) {
        // Fail-closed: under the Tracy policy a database without its store records nothing.
        if (policy.recordsCreatedGrants) {
          if (store !== undefined && store.recordCreatedSession(subuserId, sessionId, grantMark)) return true;
          // The answer names a session that is not this account's: none of it reaches the caller
          // (the proxy writes its answer only while nothing has been sent).
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('content-type', 'text/plain; charset=utf-8');
          }
          if (!res.writableEnded) res.end('502 Upstream response unprocessable');
          return false;
        }
        deps.db.addUserSessionGrant(subuserId, sessionId);
        return true;
      },
    };
  }

  /** H0: the mount the request arrived under, put back in front of the path sent to dsh. */
  return { admitWrites, begin, mountOf };
}

/** A request held behind the write fence that reaches into the archived site (K1). */
function refuseArchived(res: ServerResponse): void {
  const body = JSON.stringify({
    ok: false,
    reason: 'SITE_ARCHIVED',
    error: 'This request reached the gateway while a deleted site was being archived, and it names that site.',
  });
  res.statusCode = 409;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(body);
}

/**
 * The account's proven address, from the Tracy store `Database.init()` attaches (H10). A database
 * without that store knows no address: null.
 */
function emailOf(db: object, userId: number): string | null {
  const email = tracyStoreOf(db)?.emailOf(userId) ?? null;
  return typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : null;
}
