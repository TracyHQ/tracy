/**
 * The seam between upstream dsh-passwords and Tracy's policy layer.
 *
 * Upstream forwards a subuser's unknown HTTP routes and unknown Remote mux streams untouched
 * (fail-open toward plugins). Tracy seats need the opposite, so the core asks a `TracyPolicy`
 * at a closed list of hook points (TRACY-FORK.md §3) and obeys its verdict. Every hook runs for
 * subusers (seats) only; the owner path never consults the policy.
 *
 * The policy receives what the core already knows (method, normalized path, parsed body, a grant
 * check) and returns a verdict; it never imports core modules and never performs I/O.
 */

import type { AnswerDoor, AnswerVerdict, BodyPlan, BodyVerdict, RequestPlan, SeatAnswerContext, SeatRequestContext } from './request-path.js';
import type { CarrierView, SeatStreamState, SeatView } from './streams.js';
import type { JobOwnerBook, SeatMux, SeatMuxSource } from './mux-seat.js';

/** Refuse the request or stream. `reason` is a short English sentence for logs and stream errors. */
export type PolicyDeny = { kind: 'deny'; status: number; reason: string };
export type PolicyPass = { kind: 'pass' };
export type PolicyVerdict = PolicyPass | PolicyDeny;

/**
 * H1's third answer: a dsh RPC that stays closed to the seat, answered at the gate with `value`
 * (the empty result dsh gives a caller that may do nothing) instead of a 403 the dsh client prints
 * as an error. The core hands it to `answerRpcLocally` (rpc-stub.ts); nothing reaches dsh.
 */
export type RpcAnswerVerdict = { kind: 'answer-rpc'; method: string; value: unknown };

/** H1 at the gate: refuse, answer locally, or let the proxy finish the decision (`decideRequest`). */
export type HttpVerdict = PolicyVerdict | RpcAnswerVerdict;

/**
 * H5: forward the item as filtered upstream, drop it, forward a replacement, or end the stream:
 * `cancel-upstream` sends `cancel` to dsh and `end` to the client, and nothing of the stream after it.
 */
export type DownVerdict = PolicyPass | { kind: 'drop' } | { kind: 'replace'; value: unknown } | { kind: 'cancel-upstream' };

/** H4: refuse one stream in the dsh error shape (`code`, `details`), the carrier lives on. */
export type StreamDeny = PolicyDeny & { code?: string; details?: Record<string, unknown> };
/** H4: undecidable before the workspace baseline; hold the open and ask again when it arrives. */
export type StreamWait = { kind: 'wait-baseline' };
/** H4's answer. A `pass` may carry the per-stream state H5 is later handed (`SeatStreamItemContext.state`). */
export type StreamOpenVerdict = (PolicyPass & { state?: SeatStreamState }) | StreamDeny | StreamWait;

/** H1: a seat's HTTP request, after authentication and path normalization, before upstream classification. */
export interface SeatHttpContext {
  method: string;
  /** Gate path: mount removed, percent-decoding normalized exactly as the proxy forwards it. */
  path: string;
  userId: number;
}

/**
 * H4: a seat opening a Remote mux logical stream that upstream's own open checks accepted, before
 * the open frame is sent to dsh. Streams upstream refuses keep upstream's error codes.
 */
export interface SeatStreamOpenContext {
  endpoint: string;
  payload: unknown;
  /**
   * True when upstream keeps per-stream state and filters this stream's downlink for subusers;
   * false when upstream would forward it raw (`state = null`, a plugin stream).
   */
  filteredByGateway: boolean;
  /** The stream id the open names (absent: endpoint-only decision). */
  streamId?: string;
  /** The seat, read fresh for this decision (absent: endpoint-only decision). */
  seat?: SeatView;
  /** What the seat's mux carrier knows: baseline, cancelled ids. */
  carrier?: CarrierView;
}

/** H5: one downlink item of an official stream, already filtered by upstream, before it is sent. */
export interface SeatStreamItemContext {
  endpoint: string;
  /** The state H4 returned for this stream (absent: no Tracy state, upstream's filter stands alone). */
  state?: SeatStreamState;
  seat?: SeatView;
  /** The item as dsh sent it, before upstream's filter (Q14 reads frames upstream drops). */
  raw?: unknown;
}

export interface TracyPolicy {
  /** Stable name, shown when the fleet guard refuses to start. */
  readonly name: string;
  decideHttp(ctx: SeatHttpContext): HttpVerdict;
  decideStreamOpen(ctx: SeatStreamOpenContext): StreamOpenVerdict;
  filterDown(ctx: SeatStreamItemContext, value: unknown): DownVerdict;
  // --- signed-out requests ---
  /** H12: a request with no session, before upstream's anonymous probe answer (204) and its sign-in redirect. */
  decideAnonymous(ctx: AnonymousContext): AnonymousVerdict;
  // --- request path ---
  /**
   * H1, finished in the proxy before the upstream request exists, and the H2/H3 plan for it: the
   * seat route table with the query, `allow_upload` and the session folders (R2, R3, R7–R10), the
   * query's sessions (Q3), which bodies are read (Q2, Q11, S4) and which answers rebuilt (Q8–Q10).
   * Runs for every authenticated account; `ctx.perms` is undefined for the master.
   */
  decideRequest(ctx: SeatRequestContext): RequestPlan;
  /** H2: the parsed JSON body, before any byte is written to dsh. */
  checkRequestBody(ctx: SeatRequestContext, check: BodyPlan, body: unknown): BodyVerdict;
  /** H3: the parsed answer of a door `decideRequest` named, before any byte is sent to the seat. */
  filterAnswer(ctx: SeatAnswerContext, door: AnswerDoor, answer: unknown): AnswerVerdict;
  /**
   * H13: the headers forwarded to dsh, fixed before the upstream request is created. Tracy drops
   * any `x-dsh-allowed-folders` the client sent and sets the seat's own (none for the master).
   */
  forwardHeaders<V>(headers: Record<string, V>, perms: { allowed_folders: readonly string[] } | undefined): Record<string, V | string>;
  // --- the seat's page (H16/S16, seat-settings.ts) ---
  /**
   * H16 (S16): what the gateway adds to the `<head>` of every dsh page it serves a seat (never the owner).
   * Tracy: the flags that give the seat's page dsh's `memory` settings persistence (S16) and turn
   * better-sidebar's git status off (S17). Upstream: nothing.
   */
  readonly seatPageHead: string;
  /**
   * S16: the expression patch.ts writes where dsh's settings bundle decides its persistence
   * (`….isLoopback ? "host" : "memory"`). Upstream: `"host"` for every browser behind the gate.
   */
  readonly settingsPersistence: string;
  /** H11: whether every request that can change dsh's state passes the write fence (K1). */
  readonly holdWrites: boolean;
  /**
   * H3 (Q5): whether a subuser's successful create/fork is recorded through the Tracy store as
   * `created` (refused when another account holds the id) instead of upstream's origin-less grant.
   */
  readonly recordsCreatedGrants: boolean;
  /**
   * V1: whether a subuser's HTTP request joins its live connections, so that a revocation, access
   * change, ban or credential move ends it with no byte of a later answer. Upstream: never.
   */
  readonly endsPendingRequests: boolean;
  /**
   * H15 (S2): whether another subuser's ownership row on `ownerPath` is waived for this viewer,
   * inside upstream's "one folder, one owner" predicates. Upstream: never.
   */
  sharedGrantExempt(viewerFolders: readonly string[], ownerFolders: readonly string[], ownerPath: string): boolean;
  /** H15 (S1): whether a listing door may show this workspace, ANDed with upstream's own rule. */
  workspaceListed(workspacePath: string, allowedFolders: readonly string[]): boolean;
  /** H15 (S3): whether `workspace.create` skips the seat's folder check. Upstream: always. */
  workspaceCreateExempt(perms: { allowed_folders: readonly string[] }): boolean;
  /**
   * H20: upstream's "workspace owned by another subuser" check with the same answer, cheaper per
   * frame (`ownership.ts`), built once per gateway over its database and H15's waiver; null leaves
   * upstream's own predicate. Upstream: null.
   */
  ownershipCheck(
    db: object,
    sharesFolder: (viewerId: number, ownerId: number, ownerPath: string) => boolean,
  ): ((userId: number, workspacePath: string) => boolean) | null;
  // --- streams ---
  /**
   * H4/H5: the per-carrier stream machinery for one seat's `/api/remote.mux` socket, or null to
   * leave the carrier to upstream alone. Created once per socket; it asks `decideStreamOpen` and
   * `filterDown` with the full context.
   */
  seatMux(source: SeatMuxSource): SeatMux | null;
  /** H6: a seat's WebSocket upgrade outside the mux, after authentication. */
  decideWs(ctx: SeatWsContext): WsVerdict;
  /** H8: one seat event (SSE or events WebSocket) after upstream's filter; null drops it. */
  filterEvent(ctx: SeatEventContext, event: Record<string, unknown>): Record<string, unknown> | null;
  /** `POST /api/job/kill` of a seat: the job must be one its own streams have shown it. */
  decideJobKill(ctx: SeatJobKillContext): PolicyVerdict;
  /** Q16: `POST /api/$events/result` of a seat answers a question its own open `$events` stream delivered, once. */
  decideQuestionAnswer(ctx: SeatQuestionAnswerContext): PolicyVerdict;
}

export interface SeatQuestionAnswerContext {
  /** The gateway's per-seat book (its `$events` streams are in `jobs.events`). */
  jobs: JobOwnerBook;
  userId: number;
  /** The parsed request body, the whole RPC envelope. */
  body: unknown;
}

/** H6: `forward` = a Tracy seat socket upstream does not know; pipe it to dsh as a plugin socket. */
export type WsVerdict = PolicyVerdict | { kind: 'forward' };

export interface SeatWsContext {
  /** Gate path, normalized, without the query. */
  path: string;
  query: URLSearchParams;
  /** What the proxy holds about the seat; the session in the query is checked against it. */
  source: SeatMuxSource;
}

export interface SeatEventContext {
  /** The session is one this seat may see now. */
  holdsSession: (sessionId: string) => boolean;
  /** The seat's own proven address (lower case); every other `prompter.email` is blanked. */
  ownEmail: string | null;
  /** Q1: the book has a row for this session that Tracy's origin rule does not honour; such ids leave every id list. */
  bookRefuses?: (sessionId: string) => boolean;
}

export interface SeatJobKillContext {
  /** The jobs this gateway saw on the seat's own filtered streams. */
  jobs: JobOwnerBook;
  userId: number;
  /** `args.request` of the kill (`{ sessionId, jobId }`), null when it has none. */
  request: Record<string, unknown> | null;
  holdsSession: (sessionId: string) => boolean;
}

// --- signed-out requests ---
/** H12: a request the gate found no session for (method upper-case, gate path normalized). */
export interface AnonymousContext {
  method: string;
  path: string;
}

/** H12: let upstream answer (probe 204, sign-in redirect), or forward the request to dsh signed out. */
export type AnonymousVerdict = PolicyPass | { kind: 'forward' };

/**
 * Every Tracy field the hooks attach to a request lives here, so each `Req` type gains one field.
 * Empty since the proxy finishes H1 itself (`decideRequest`): the gate marks nothing for it.
 */
export type TracyRequestState = Record<string, never>;
