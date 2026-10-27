import type {
  DownVerdict, PolicyVerdict, SeatJobKillContext, SeatStreamItemContext, SeatStreamOpenContext, StreamDeny, StreamOpenVerdict,
} from './policy.js';

/**
 * Tracy's rules for a seat's Remote mux streams (`/api/remote.mux`), as decisions.
 *
 * Upstream forwards a subuser's plugin streams raw and admits every official stream it knows;
 * a Tracy seat gets the opposite: six streams, each granted by endpoint + operation + resource,
 * everything else refused for that stream alone. Nothing here performs I/O, reads a clock or keeps
 * a timer: each function takes what the gateway already knows (a `SeatView`, a `CarrierView`, one
 * frame) and answers with data the hooks H4/H5 act on. The only state written is the per-stream
 * `SeatStreamState` and the per-socket `CancelLedger` the caller hands in, which the protocol
 * needs (an `opened` frame unlocks later `output`, a `ready` frame names the client).
 */

/** The only streams a seat may open (fork 2.6.6-tracy `remoteMuxStreamEndpoints`). */
export const SEAT_STREAM_ENDPOINTS: ReadonlySet<string> = new Set([
  'session/control', 'session/follow', 'workspace/follow', '$events', 'job/list', 'job/follow',
]);

/** What the gateway knows about the seat, read fresh for every decision. */
export interface SeatView {
  /** The grant book names this session for the seat, and the admin has not switched it off. */
  holdsSession(sessionId: string): boolean;
  /** The seat may see this workspace id (its path lies inside the seat's folders). */
  seesWorkspace(workspaceId: string): boolean;
  /** `allowed_folders` as stored, `__deny__` included. */
  folders: readonly string[];
  /** The grant book was seeded; an unseeded book cannot refuse yet (legacy migration). */
  grantsSeeded: boolean;
  banned: boolean;
  /**
   * Q1: the book has a row for this session that Tracy's origin rule does not honour (a `legacy`
   * row of a non-owner seat, a `seed` row). Upstream's listings read any row, so a known listing
   * frame drops these ids; an id the book does not name at all is left to upstream (a session the
   * seat is creating right now, Q15). Absent: nothing is dropped.
   */
  bookRefuses?(sessionId: string): boolean;
}

/** What one mux carrier (socket) knows. */
export interface CarrierView {
  /** A `workspace/follow` baseline reached this seat on this carrier. */
  baselineReady: boolean;
  /** Ids the client cancelled whose old stream dsh has not yet ended (`end`/`error`). */
  cancelledIds: ReadonlySet<string>;
}

/** A client `open` frame, already parsed by upstream. */
export interface StreamOpen {
  streamId: string;
  endpoint: string;
  payload: unknown;
}

/** The resource one admitted stream is bound to; every downlink frame is held to it. */
export type StreamResource =
  | { kind: 'host'; endpoint: '$events' | 'workspace/follow' | 'session/control' }
  | { kind: 'session'; sessionId: string; address: 'session' | 'subagent' }
  | { kind: 'job-list'; sessionId: string }
  | { kind: 'job-follow'; sessionId: string; jobId: string };

/**
 * One refused stream. The code and details are dsh's own "no callable method at this endpoint"
 * (`remote-error-codes.ts`), the same for an endpoint that does not exist and a resource the seat
 * does not hold, so a refusal never tells a seat that someone else's session or job exists.
 */
export interface StreamRefusal {
  kind: 'refuse';
  code: 'gateway/method-unavailable';
  message: string;
  details: { endpoint: string };
}

export type OpenDecision =
  | { kind: 'allow'; resource: StreamResource }
  /** Undecidable before the workspace baseline: hold the open, then ask again. */
  | { kind: 'wait-baseline'; resource: StreamResource }
  | StreamRefusal;

/** The `allowed_folders` marker of a seat that may see no folder. */
const DENY_FOLDER = '__deny__';

const refusal = (endpoint: string): StreamRefusal => ({
  kind: 'refuse',
  code: 'gateway/method-unavailable',
  message: `Remote stream ${endpoint} is not available through this gateway`,
  details: { endpoint },
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** `{ args: {} }` exactly: the payload of every stream that names no resource. */
const isEmptyArgs = (payload: unknown): boolean =>
  isPlainRecord(payload) && Object.keys(payload).length === 1 &&
  isPlainRecord(payload.args) && Object.keys(payload.args).length === 0;

/**
 * The session a `session/follow` opens, from dsh's `SessionFollowRequest`:
 *   {args:{request:{address:{kind:'session', sessionId}, maxMessages?}}}
 *   {args:{request:{address:{kind:'subagent', parentSessionId, childSessionId, mode}, …}}}
 * A subagent lives in its parent session and the grant is written for the parent, so the parent
 * is the one checked (C7). `request.sessionId` does not exist on the wire and opens nothing.
 */
export function sessionFollowTarget(payload: unknown): { sessionId: string; address: 'session' | 'subagent' } | null {
  if (!isPlainRecord(payload) || Object.keys(payload).length !== 1 || !isPlainRecord(payload.args) ||
    Object.keys(payload.args).length !== 1) return null;
  const request = payload.args.request;
  if (!isPlainRecord(request) || !isPlainRecord(request.address)) return null;
  const address = request.address;
  const subagent = address.kind === 'subagent';
  const id = subagent ? address.parentSessionId : address.sessionId;
  return typeof id === 'string' && id !== '' ? { sessionId: id, address: subagent ? 'subagent' : 'session' } : null;
}

/**
 * Admit a stream bound to one session: the book decides. Only a book that was never seeded
 * (a pre-grant seat, migrated by its first baseline) cannot say "no" yet, and waits for it.
 */
const bySession = (endpoint: string, sessionId: string, resource: StreamResource, seat: SeatView, carrier: CarrierView): OpenDecision => {
  if (seat.holdsSession(sessionId)) return { kind: 'allow', resource };
  if (!seat.grantsSeeded && !carrier.baselineReady) return { kind: 'wait-baseline', resource };
  return refusal(endpoint);
};

/** H4 for a seat: admit, hold until the baseline, or refuse one stream. */
export function decideOpen(open: StreamOpen, seat: SeatView, carrier: CarrierView): OpenDecision {
  const { endpoint, payload } = open;
  if (seat.banned || !SEAT_STREAM_ENDPOINTS.has(endpoint) || carrier.cancelledIds.has(open.streamId)) return refusal(endpoint);
  if (endpoint === '$events' || endpoint === 'workspace/follow' || endpoint === 'session/control') {
    return isEmptyArgs(payload) ? { kind: 'allow', resource: { kind: 'host', endpoint } } : refusal(endpoint);
  }
  if (endpoint === 'session/follow') {
    const target = sessionFollowTarget(payload);
    if (target === null) return refusal(endpoint);
    return bySession(endpoint, target.sessionId, { kind: 'session', ...target }, seat, carrier);
  }
  // job/list, job/follow: scoped to one session; a follow also names its job.
  const request = jobRequest(payload);
  if (request === null) return refusal(endpoint);
  if (endpoint === 'job/list') {
    return bySession(endpoint, request.sessionId, { kind: 'job-list', sessionId: request.sessionId }, seat, carrier);
  }
  if (request.jobId === undefined) return refusal(endpoint);
  return bySession(endpoint, request.sessionId, { kind: 'job-follow', sessionId: request.sessionId, jobId: request.jobId }, seat, carrier);
}

/** A session-scoped job request, `{args:{request:{sessionId, jobId?, …}}}`; an unowned one reads as null. */
function jobRequest(payload: unknown): { sessionId: string; jobId?: string } | null {
  if (!isPlainRecord(payload) || Object.keys(payload).length !== 1 || !isPlainRecord(payload.args) ||
    Object.keys(payload.args).length !== 1 || !isPlainRecord(payload.args.request)) return null;
  const request = payload.args.request;
  if (typeof request.sessionId !== 'string' || request.sessionId === '') return null;
  if (Object.hasOwn(request, 'jobId') && (typeof request.jobId !== 'string' || request.jobId === '')) return null;
  return { sessionId: request.sessionId, ...(typeof request.jobId === 'string' ? { jobId: request.jobId } : {}) };
}

/** Per admitted stream: its resource and what its downlink has proved so far. */
export interface SeatStreamState {
  readonly resource: StreamResource;
  /** `job/follow`: an `opened`/`status` frame for the stream's own job passed (J3). */
  jobOpened?: boolean;
  /** `$events`: the dsh client id of this stream's one `ready` frame (S13). */
  eventsClientId?: string;
  /** `$events`: questions delivered and not yet answered or cancelled, by event id (Q16). */
  questions?: Map<string, { sessionId: string; folders: string }>;
}

/** Most open questions one `$events` stream holds; past it a new question is not delivered. */
export const QUESTIONS_MAX = 128;

/** The seat may answer a question of this session: it holds it and may see some folder. */
const canAnswer = (seat: SeatView, sessionId: string): boolean =>
  !seat.banned && seat.holdsSession(sessionId) && seat.folders.some((folder) => folder !== DENY_FOLDER);

/**
 * Q16, the answer side (`POST /api/$events/result`, args `{clientId, eventId, outcome}`): accepted
 * once, for a question this stream delivered, while the stream is open, the seat still holds the
 * session and its folders are those it had at delivery. An `allow` consumes the question; a
 * malformed answer does not.
 */
export function claimQuestionAnswer(
  state: SeatStreamState,
  args: unknown,
  seat: SeatView,
  streamOpen: boolean,
): { kind: 'allow'; sessionId: string } | { kind: 'refuse' } {
  const refuse = { kind: 'refuse' } as const;
  if (!isPlainRecord(args) || Object.keys(args).length !== 3 || typeof args.eventId !== 'string' ||
    args.clientId !== state.eventsClientId || state.eventsClientId === undefined || !streamOpen ||
    !isPlainRecord(args.outcome) || !['result', 'next', 'rejected'].includes(String(args.outcome.kind))) return refuse;
  const delivered = state.questions?.get(args.eventId);
  if (delivered === undefined || delivered.folders !== JSON.stringify(seat.folders) || !canAnswer(seat, delivered.sessionId)) return refuse;
  state.questions!.delete(args.eventId);
  return { kind: 'allow', sessionId: delivered.sessionId };
}

export function createStreamState(resource: StreamResource): SeatStreamState {
  return { resource };
}

/**
 * H5 for a seat, per downlink item:
 * - `pass`: forward the item as it came;
 * - `drop`: forward nothing for this item, the stream lives on;
 * - `replace`: forward `value` instead;
 * - `cancel-upstream`: the seat lost the right to this stream (banned, or the grant behind a
 *   session-bound stream is gone); send `cancel` to dsh and `end` to the client, and nothing of
 *   this stream after it (J4). The 2.6.6 fork ended job streams only and dropped a revoked
 *   `session/follow` frame by frame; ending every stream is the stricter reading of TCH #300.
 */
export type DownDecision =
  | { kind: 'pass' }
  | { kind: 'drop' }
  | { kind: 'replace'; value: unknown }
  | { kind: 'cancel-upstream'; end: true };

const seesSessionOf = (seat: SeatView) => (id: string): boolean => seat.holdsSession(id);
const seesWorkspaceOf = (seat: SeatView) => (id: string): boolean => seat.seesWorkspace(id);

const DROP: DownDecision = Object.freeze({ kind: 'drop' });
const PASS: DownDecision = Object.freeze({ kind: 'pass' });
const CANCEL: DownDecision = Object.freeze({ kind: 'cancel-upstream', end: true });

/** A job projection without host-local paths: `output.spillPaths` names files on the Host disk. */
export function stripSpillPaths(job: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainRecord(job.output) || !Object.hasOwn(job.output, 'spillPaths')) return job;
  const { spillPaths: _spillPaths, ...output } = job.output;
  return { ...job, output };
}

/**
 * The seat's view of one job projection (J2): owned by the stream's session (and its job, when the
 * stream follows one), well formed, spill paths removed; anything else is null.
 */
export function seatJobView(value: unknown, sessionId: string, jobId?: string): Record<string, unknown> | null {
  if (!isPlainRecord(value) || value.owner !== sessionId || typeof value.id !== 'string' ||
    (jobId !== undefined && value.id !== jobId) || !isPlainRecord(value.output) ||
    typeof value.output.total !== 'number' || typeof value.output.earliest !== 'number') return null;
  return stripSpillPaths(value);
}

/**
 * Whether the seat still has the right to an admitted stream: not banned, and a stream bound to one
 * session lives only while the book still names it for this seat (J4, Q13). A revoke or switch-off
 * mid-stream ends the stream at its next frame, not at the next reconnect.
 */
export function streamStillHeld(state: SeatStreamState, seat: SeatView): boolean {
  const resource = state.resource;
  return !seat.banned && (resource.kind === 'host' || seat.holdsSession(resource.sessionId));
}

/** H5 for a seat: what to forward for one downlink item of an admitted stream. */
export function filterDown(state: SeatStreamState, value: unknown, seat: SeatView): DownDecision {
  const resource = state.resource;
  if (!streamStillHeld(state, seat)) return CANCEL;
  if (!isPlainRecord(value)) return DROP;
  if (resource.kind === 'job-list') {
    if (value.type !== 'rows' || !Array.isArray(value.jobs)) return DROP;
    const jobs = value.jobs.flatMap((row) => {
      const safe = seatJobView(row, resource.sessionId);
      return safe === null ? [] : [safe];
    });
    return { kind: 'replace', value: { ...fenceUnknownFields(value, ['type', 'jobs'], seesSessionOf(seat), seesWorkspaceOf(seat)), type: 'rows', jobs } };
  }
  if (resource.kind === 'job-follow') {
    if (value.type === 'opened' || value.type === 'status') {
      const view = seatJobView(value.job, resource.sessionId, resource.jobId);
      if (view === null) return DROP;
      state.jobOpened = true;
      return { kind: 'replace', value: { ...value, job: view } };
    }
    if (value.type === 'output' && Array.isArray(value.chunks) && typeof value.next === 'number') {
      return state.jobOpened === true ? PASS : DROP;
    }
    return DROP;
  }
  if (resource.kind === 'session') return PASS;
  if (resource.endpoint === '$events') return filterEvents(state, value, seat);
  if (resource.endpoint === 'workspace/follow') return filterWorkspaceFollow(value, seat);
  // session/control (C1): upstream filters `projections`/`jobs`/`queues` per session when present,
  // but admits a baseline without `projections`; the dsh 0.1.7+ client needs it, so Tracy requires it.
  if (value.type === 'baseline' && (!isPlainRecord(value.value) || !isPlainRecord(value.value.projections))) return DROP;
  return PASS;
}

/**
 * `workspace/follow` frame types dsh 0.2.0-rc.2 sends (`WorkspaceFollowFrame` in
 * dsh-api-workspace-controller `src/types.ts`). Upstream filters each of them itself; any other
 * type came from a newer dsh and is passed on fenced by field (`fenceStreamIds`), never unread.
 */
export const WORKSPACE_FOLLOW_KNOWN_FRAMES: ReadonlySet<string> = new Set(['baseline', 'upsert', 'remove', 'order', 'archived', 'pinned']);

function filterWorkspaceFollow(frame: Record<string, unknown>, seat: SeatView): DownDecision {
  if (typeof frame.type !== 'string') return DROP;
  if (WORKSPACE_FOLLOW_KNOWN_FRAMES.has(frame.type)) return dropRefusedSessions(frame, seat);
  const fenced = fenceStreamIds(frame, seesSessionOf(seat), seesWorkspaceOf(seat));
  return fenced === FENCED_OUT ? DROP : { kind: 'replace', value: fenced };
}

/** The session-id lists a listing frame or event carries, at any level it carries them. */
const SESSION_ID_LISTS = ['sessionIds', 'archivedSessionIds', 'pinnedSessionIds'] as const;

/**
 * Q1: `record` with every session-id list (`SESSION_ID_LISTS`) losing the ids `refuses` names; the
 * same object when nothing was dropped, else a shallow copy.
 */
export function withoutRefusedIds(record: Record<string, unknown>, refuses: (sessionId: string) => boolean): Record<string, unknown> {
  let out = record;
  for (const key of SESSION_ID_LISTS) {
    const ids = record[key];
    if (!Array.isArray(ids)) continue;
    const kept = ids.filter((id) => typeof id !== 'string' || !refuses(id));
    if (kept.length === ids.length) continue;
    if (out === record) out = { ...record };
    out[key] = kept;
  }
  return out;
}

/**
 * Q1 on a known `workspace/follow` frame (upstream already filtered it): every session-id list it
 * carries — `archived`, `pinned`, an upsert's workspace row, the baseline's rows and sets — loses
 * the ids `bookRefuses`. Returns PASS when nothing was dropped.
 */
function dropRefusedSessions(frame: Record<string, unknown>, seat: SeatView): DownDecision {
  const refuses = seat.bookRefuses;
  if (refuses === undefined) return PASS;
  const strip = (record: unknown): unknown => (isPlainRecord(record) ? withoutRefusedIds(record, refuses) : record);
  let out = withoutRefusedIds(frame, refuses);
  if (frame.type === 'baseline' && isPlainRecord(frame.value)) {
    let value = withoutRefusedIds(frame.value, refuses);
    if (Array.isArray(value.items)) {
      const items = value.items.map(strip);
      if (items.some((item, at) => item !== (value.items as unknown[])[at])) value = { ...value, items };
    }
    if (value !== frame.value) out = { ...out, value };
  } else if (frame.type === 'upsert') {
    const workspace = strip(frame.workspace);
    if (workspace !== frame.workspace) out = { ...out, workspace };
  }
  return out === frame ? PASS : { kind: 'replace', value: out };
}

/**
 * Q18: the archive snapshot a seat's `session.list` filters with, read from the raw
 * `workspace/follow` baseline (the 0.2.0 client never calls HTTP `workspace.list`, so a snapshot
 * built only there left every seat's `session.list` failing). Held sessions only; null when the
 * frame is not a well-formed baseline. Upstream 2.7.7 builds the same per-seat set
 * (`userArchivedSessionIds`, gateway.ts:2830) and answers 503 `BASELINE_PENDING` before it.
 */
export function archiveSnapshotFromBaseline(value: unknown, seat: SeatView): { archivedSessionIds: string[] } | null {
  if (!isPlainRecord(value) || value.type !== 'baseline' || !isPlainRecord(value.value)) return null;
  const { items, archivedSessionIds } = value.value;
  if (!Array.isArray(items) || !Array.isArray(archivedSessionIds)) return null;
  return { archivedSessionIds: archivedSessionIds.filter((id): id is string => typeof id === 'string' && seat.holdsSession(id)) };
}

/** How long an upsert naming a just-created session waits for its grant (Q15). */
export const UPSERT_HOLD_MS = 400;

/**
 * Q15: dsh sends a workspace `upsert` the moment a session is created, before the gateway has read
 * the `session/create` answer and written the grant. Filtered at once, the new session drops out of
 * `sessionIds` and the client files it under "Ungrouped" (fork, production 31/08). The answer is
 * not to let an unknown id through (two customers creating in one workspace would see each other)
 * but to ask the book again once, `UPSERT_HOLD_MS` later. Upserts are idempotent per workspace, so
 * the delay changes no client state. Decides timing only; access is still the filter's.
 * @param value - the raw upsert frame, before any filter.
 * @param attempt - 0 on arrival, 1 when asked again after the hold.
 */
export function decideUpsertHold(value: unknown, seat: SeatView, attempt: number): { kind: 'defer'; ms: number } | { kind: 'now' } {
  const now = { kind: 'now' } as const;
  if (attempt > 0 || !isPlainRecord(value) || value.type !== 'upsert' || !isPlainRecord(value.workspace)) return now;
  const sessionIds = value.workspace.sessionIds;
  if (!Array.isArray(sessionIds)) return now;
  const unknown = sessionIds.some((id) => typeof id === 'string' && !seat.holdsSession(id));
  return unknown ? { kind: 'defer', ms: UPSERT_HOLD_MS } : now;
}

/**
 * The wire fields through which dsh names a session (TCH #300): an `Agent` travels as `agentId`
 * (the root Agent id IS the session id), a subagent address as `parentSessionId`/`childSessionId`,
 * a `WorkspaceFileScope` as `workspaceFileScopeId`, `workspace/insertSessionBefore` as
 * `beforeSessionId`. The 2.6.6 fork's `SESSION_REF_KEYS` (permissions.ts); `routes.ts` reads a
 * narrower set today. One list should serve both once `session-refs.ts` (Q2) lands.
 */
export const SESSION_REF_KEYS: readonly string[] = [
  'sessionId', 'agentId', 'parentSessionId', 'childSessionId', 'workspaceFileScopeId', 'beforeSessionId',
];

/** `fenceStreamIds` answers this for a value that names a session or workspace the seat may not see. */
export const FENCED_OUT: unique symbol = Symbol('fenced-out');

/** Plural session-id fields on the wire: `sessionIds`, `archivedSessionIds`, `pinnedSessionIds`, … */
const SESSION_IDS_KEY_RE = /sessionIds$/i;
/** Plural workspace-id fields on the wire: `workspaceIds`, and whatever a newer dsh names the same way. */
const WORKSPACE_IDS_KEY_RE = /workspaceIds$/i;
/** Deeper than any dsh frame goes; past it the value is fenced out, never passed open. */
const FENCE_MAX_DEPTH = 64;

/**
 * Fence a stream value this gate does not know to the seat's grant, by field (Q14).
 *
 * A `SESSION_REF_KEYS` field or a `workspaceId` must name something the seat sees, else the object
 * carrying it is fenced out (an array element disappears; at the root the whole value does); a
 * `…sessionIds` / `…workspaceIds` array keeps the seen ids only; everything else is kept as it
 * came. `null` reads as absent. A field named in neither pattern that still carries an id is this
 * walk's known blind spot: a frame type that does so needs its own filter.
 * @returns a fenced copy, or `FENCED_OUT` when the value itself names something unseen.
 */
export function fenceStreamIds(
  value: unknown,
  seesSession: (id: string) => boolean,
  seesWorkspace: (id: string) => boolean,
): unknown | typeof FENCED_OUT {
  const walk = (node: unknown, depth: number): unknown | typeof FENCED_OUT => {
    if (node === null || typeof node !== 'object') return node;
    if (depth > FENCE_MAX_DEPTH) return FENCED_OUT;
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      for (const item of node) {
        const kept = walk(item, depth + 1);
        if (kept !== FENCED_OUT) out.push(kept);
      }
      return out;
    }
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(node as Record<string, unknown>)) {
      if (raw === null) { out[key] = raw; continue; }
      if (SESSION_REF_KEYS.includes(key) || key === 'workspaceId') {
        const sees = key === 'workspaceId' ? seesWorkspace : seesSession;
        if (typeof raw !== 'string' || !sees(raw)) return FENCED_OUT;
        out[key] = raw;
        continue;
      }
      if (Array.isArray(raw) && (SESSION_IDS_KEY_RE.test(key) || WORKSPACE_IDS_KEY_RE.test(key))) {
        const sees = SESSION_IDS_KEY_RE.test(key) ? seesSession : seesWorkspace;
        out[key] = raw.filter((id): id is string => typeof id === 'string' && sees(id));
        continue;
      }
      const kept = walk(raw, depth + 1);
      if (kept === FENCED_OUT) return FENCED_OUT;
      out[key] = kept;
    }
    return out;
  };
  return walk(value, 0);
}

/**
 * The fields of a known frame or baseline that its filter does not handle itself: kept (dropping
 * them is how `queues` and `pinnedSessionIds` once vanished), each fenced with its own name, so a
 * field naming something unseen is left out of the copy.
 */
export function fenceUnknownFields(
  source: Record<string, unknown>,
  known: readonly string[],
  seesSession: (id: string) => boolean,
  seesWorkspace: (id: string) => boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (known.includes(key)) continue;
    const kept = fenceStreamIds({ [key]: raw }, seesSession, seesWorkspace);
    if (kept !== FENCED_OUT) out[key] = (kept as Record<string, unknown>)[key];
  }
  return out;
}

/**
 * `$events` is the connection bootstrap and a Host-wide broadcast. A seat gets its one `ready`
 * (S13), the run status of the sessions it holds (Q17) and the questions it may answer (Q16);
 * approval requests and every other emit stay closed.
 */
function filterEvents(state: SeatStreamState, frame: Record<string, unknown>, seat: SeatView): DownDecision {
  if (frame.type === 'ready') {
    const clientId = frame.clientId;
    if (state.eventsClientId !== undefined || typeof clientId !== 'string' || clientId === '' || clientId.length > 200) return DROP;
    state.eventsClientId = clientId;
    // dsh sends the Host's home folder; a seat's home is the first folder it was given, and no
    // other Host field reaches it. Unknown top-level fields are fenced like any other frame's.
    const fenced = fenceStreamIds(frame, seesSessionOf(seat), seesWorkspaceOf(seat));
    if (fenced === FENCED_OUT) return DROP;
    const home = seat.folders.find((folder) => folder !== DENY_FOLDER) ?? '';
    return { kind: 'replace', value: { ...(fenced as Record<string, unknown>), type: 'ready', clientId, host: { home } } };
  }
  // `api-session/status(sessionId, running)` is the client's only live feed of `Session.running`:
  // without it a seat's composer stays "running" after its turn ends (fork, 27/09/2026).
  if (frame.type === 'emit') {
    const args = frame.args;
    if (frame.event !== 'api-session/status' || Object.keys(frame).length !== 3 || !Array.isArray(args) ||
      args.length !== 2 || typeof args[0] !== 'string' || typeof args[1] !== 'boolean' || !seat.holdsSession(args[0])) return DROP;
    return { kind: 'replace', value: { type: 'emit', event: 'api-session/status', args: [args[0], args[1]] } };
  }
  if (state.eventsClientId === undefined) return DROP;
  const questions = (state.questions ??= new Map());
  if (frame.type === 'cancel' && Object.keys(frame).length === 2 && typeof frame.eventId === 'string') {
    return questions.delete(frame.eventId) ? PASS : DROP;
  }
  // The root Agent id IS the session id in dsh's protocol; the right to answer is read from it.
  if (frame.type === 'waterfall' && Object.keys(frame).length === 5 && frame.event === 'user-questions/request' &&
    typeof frame.eventId === 'string' && frame.eventId !== '' && frame.eventId.length <= 200 &&
    typeof frame.agentId === 'string' && isPlainRecord(frame.request) && Array.isArray(frame.request.questions) &&
    frame.request.questions.length > 0 && canAnswer(seat, frame.agentId)) {
    if (questions.size >= QUESTIONS_MAX || questions.has(frame.eventId)) return DROP;
    questions.set(frame.eventId, { sessionId: frame.agentId, folders: JSON.stringify(seat.folders) });
    return PASS;
  }
  return DROP;
}

/**
 * V4: stream ids the client cancelled, held until dsh confirms the old stream is over.
 *
 * A late frame carries only its `streamId`. Once the same id is open again nothing tells the old
 * stream's frames from the new one's, and they would be filtered by the NEW stream's rules:
 * `cancel X` on the host-wide `session/control`, then `open X session/follow` in one write, handed a
 * seat every customer's session titles and excerpts (fork, 28/09/2026). Upstream 2.7.7 drops late
 * frames for an unknown id but lets the id be reopened at once; this ledger closes that.
 */
export interface CancelLedger {
  /** Oldest first; capped at `CANCELLED_IDS_MAX`. */
  readonly ids: Set<string>;
}

/** Past this many, the oldest cancelled id is forgotten (a frame for it is then an unknown id). */
export const CANCELLED_IDS_MAX = 256;

export function createCancelLedger(): CancelLedger {
  return { ids: new Set<string>() };
}

/** The client cancelled `streamId`: hold the id until dsh ends that stream. */
export function noteClientCancel(ledger: CancelLedger, streamId: string): void {
  ledger.ids.delete(streamId);
  ledger.ids.add(streamId);
  if (ledger.ids.size > CANCELLED_IDS_MAX) ledger.ids.delete(ledger.ids.values().next().value as string);
}

/**
 * An upstream frame for a stream id: `drop` when it belongs to a cancelled stream (a terminal
 * `end`/`error` also releases the id), `not-cancelled` otherwise.
 */
export function upstreamFrameAfterCancel(ledger: CancelLedger, frame: { type: string; streamId: string }): 'drop' | 'not-cancelled' {
  if (!ledger.ids.has(frame.streamId)) return 'not-cancelled';
  if (frame.type === 'end' || frame.type === 'error') ledger.ids.delete(frame.streamId);
  return 'drop';
}

/**
 * Remote mux streams a seat may open although upstream would forward them unfiltered
 * (`state = null`: a plugin stream outside the official set). Empty: no plugin stream is
 * cleared for seats yet; each one joins with its own filter.
 */
export const SEAT_UNFILTERED_STREAMS: ReadonlySet<string> = new Set<string>();

/**
 * H4 for a seat. With the seat and carrier in the context (the carrier hook, `mux-seat.ts`) this is
 * `decideOpen` in full: a `pass` carries the stream's state, a refusal dsh's own error shape, an
 * unseeded book `wait-baseline`. Without them (no carrier) only the endpoint half can be decided: a
 * seat opens the six seat streams and never a stream upstream would pass through raw.
 */
export function decideSeatStreamOpen(ctx: SeatStreamOpenContext): StreamOpenVerdict {
  if (!ctx.filteredByGateway && !SEAT_UNFILTERED_STREAMS.has(ctx.endpoint)) return streamDeny(refusal(ctx.endpoint));
  if (ctx.seat === undefined || ctx.carrier === undefined || ctx.streamId === undefined) {
    return SEAT_STREAM_ENDPOINTS.has(ctx.endpoint) ? { kind: 'pass' } : streamDeny(refusal(ctx.endpoint));
  }
  const decision = decideOpen({ streamId: ctx.streamId, endpoint: ctx.endpoint, payload: ctx.payload }, ctx.seat, ctx.carrier);
  if (decision.kind === 'refuse') return streamDeny(decision);
  if (decision.kind === 'wait-baseline') return { kind: 'wait-baseline' };
  return { kind: 'pass', state: createStreamState(decision.resource) };
}

const streamDeny = (refused: StreamRefusal): StreamDeny =>
  ({ kind: 'deny', status: 403, reason: refused.message, code: refused.code, details: refused.details });

/**
 * H5 for a seat: `filterDown` on the stream's state. Without a state (the gateway-wide wrapper, which
 * knows only the endpoint) it passes, and the carrier hook decides.
 */
export function filterSeatDown(ctx: SeatStreamItemContext, value: unknown): DownVerdict {
  if (ctx.state === undefined || ctx.seat === undefined) return { kind: 'pass' };
  return filterDown(ctx.state, value, ctx.seat);
}

/**
 * `POST /api/job/kill` of a seat (J1): the kill names `{ sessionId, jobId }`; the seat must hold the
 * session AND this gateway must have shown it that job under that session on one of its own filtered
 * job streams. A job it was never shown, one shown under another session and an unknown id read the
 * same: refused before dsh is asked, so the answer never tells whether the job exists.
 */
export function decideSeatJobKill(ctx: SeatJobKillContext): PolicyVerdict {
  const deny: PolicyVerdict = { kind: 'deny', status: 403, reason: 'This job is not available to this seat' };
  const request = ctx.request;
  if (request === null || typeof request.sessionId !== 'string' || typeof request.jobId !== 'string' ||
    request.sessionId === '' || request.jobId === '') return deny;
  if (!ctx.holdsSession(request.sessionId)) return deny;
  return ctx.jobs.ownerOf(ctx.userId, request.jobId) === request.sessionId ? { kind: 'pass' } : deny;
}
