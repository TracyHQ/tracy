/**
 * The per-socket half of hooks H4/H5 (V4, J1–J4, Q10, Q13–Q17, S13): one `SeatMux` per seat's
 * `/api/remote.mux` carrier. It keeps what the stream protocol needs across frames — each admitted
 * stream's `SeatStreamState`, the carrier's cancel ledger — and turns the policy's per-frame
 * decisions (`decideStreamOpen`, `filterDown`) into what the core does with the frame.
 *
 * Not pure (it keeps per-socket state, as `revocation.ts` keeps per-gateway state), but it performs
 * no I/O of its own: the seat is read through `SeatMuxSource`, a structural slice of what the proxy
 * already holds (`ProxyDeps`), and every effect is a return value the core acts on.
 */
import type { StreamOpenVerdict, TracyPolicy } from './policy.js';
import { scrubForeignPrompterEmails } from './session-refs.js';
import {
  claimQuestionAnswer, createCancelLedger, fenceStreamIds, FENCED_OUT, noteClientCancel, streamStillHeld, upstreamFrameAfterCancel,
  WORKSPACE_FOLLOW_KNOWN_FRAMES, type SeatStreamState, type SeatView,
} from './streams.js';
import { frameVerdict, POLICY_VIOLATION } from './revocation.js';
import { grantHonoured, grantRefused, ownEmailOf } from './persistence.js';

/** The permission row fields a seat's streams are held to (upstream `UserPermissionsRow`). */
export interface SeatPerms {
  banned: boolean;
  allowed_folders: string[];
  disabled_sessions: string[];
}

/** What the proxy already holds about one seat; read fresh on every decision. */
export interface SeatMuxSource {
  userId: number;
  db: {
    hasUserSessionGrant(userId: number, sessionId: string): boolean;
    isSessionGrantsSeeded(userId: number): boolean;
    getUserById(userId: number): { credential_version: number } | null;
  };
  effectivePermissions(userId: number): SeatPerms;
  /** Upstream's full grant check (snapshot cwd, grant, not disabled, folders, ownership); null = not held. */
  authorizedSubuserSessionRoot(userId: number, sessionId: unknown, perms: never): string | null;
  /** Upstream's per-seat session snapshot, set by the first workspace baseline. */
  userSessionAccess: ReadonlyMap<number, ReadonlyMap<string, string>>;
  userWorkspaceIds: ReadonlyMap<number, ReadonlySet<string>>;
  /** The jobs this gateway has shown each seat (job/kill). */
  jobs: JobOwnerBook;
}

/** A client frame as upstream parsed it. */
export type ClientFrame =
  | { type: 'open'; streamId: string; endpoint: string; payload: unknown }
  | { type: 'cancel' | 'item' | 'end'; streamId: string };

/** An upstream frame as upstream parsed it. */
export type UpstreamFrame =
  | { type: 'item'; streamId: string; value?: unknown }
  | { type: 'end'; streamId: string }
  | { type: 'error'; streamId: string; error: Record<string, unknown> };

export type RefuseStream = { kind: 'deny'; code: string; reason: string; details: Record<string, unknown> };

/** What the core does with one client frame. */
export type ClientFrameAction = { kind: 'pass' } | { kind: 'wait-baseline' } | RefuseStream;

/** What the core does with one upstream item: send `value`, send nothing, or end the stream. */
export type ItemAction = { kind: 'send'; value: unknown } | { kind: 'drop' } | { kind: 'cancel-upstream' };

export interface SeatMux {
  /**
   * V2: before a client frame is read, the account must still be the one admitted (not banned, not
   * deleted, same credential version). Null = carry on; otherwise close the carrier with this.
   */
  admit(): { code: number; reason: string } | null;
  /**
   * H4: a client frame after upstream's own open checks and before it is forwarded. An open is
   * decided (and its state kept); a cancel of a forwarded stream enters the cancel ledger (V4).
   * @param filteredByGateway - upstream keeps per-stream state for it (false: a raw plugin stream).
   * @param forwarded - dsh already has this stream id (its open was sent).
   */
  clientFrame(frame: ClientFrame, filteredByGateway: boolean, forwarded: boolean): ClientFrameAction;
  /** H4, asked again when the workspace baseline releases a held open; null = forward it. */
  recheck(streamId: string): RefuseStream | null;
  /** V4: every upstream frame before the core looks its stream up; `drop` = a cancelled stream's. */
  upstreamFrame(frame: UpstreamFrame): 'drop' | 'pass';
  /**
   * H5: one upstream item, before it is sent.
   * @param raw - the item as dsh sent it.
   * @param filtered - upstream's filtered value, null when upstream dropped it.
   */
  item(streamId: string, raw: unknown, filtered: unknown): ItemAction;
  /** H5 for `end`/`error` (and an item with no upstream filter): what the seat gets, null for nothing. */
  terminal(frame: UpstreamFrame): Record<string, unknown> | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The seat as `streams.ts` reads it, built from the source on each call. */
export function seatViewOf(source: SeatMuxSource): SeatView {
  const { userId } = source;
  const perms = source.effectivePermissions(userId);
  const snapshot = source.userSessionAccess.get(userId);
  return {
    // The book names it by Tracy's origin rule (Q1) and the admin has not switched it off; once the
    // baseline gave upstream a cwd, upstream's whole check (folders, another seat's workspace) must agree too.
    holdsSession: (sessionId) => grantHonoured(source.db, userId, sessionId) &&
      !perms.disabled_sessions.includes(sessionId) &&
      (snapshot === undefined || source.authorizedSubuserSessionRoot(userId, sessionId, perms as never) !== null),
    seesWorkspace: (workspaceId) => source.userWorkspaceIds.get(userId)?.has(workspaceId) === true,
    folders: perms.allowed_folders,
    grantsSeeded: source.db.isSessionGrantsSeeded(userId),
    banned: perms.banned,
    bookRefuses: (sessionId) => grantRefused(source.db, userId, sessionId),
  };
}

const ERROR_CODE_RE = /^[A-Za-z0-9_.\/-]{1,100}$/;

/** Create the Tracy carrier machinery for one seat socket. */
export function createSeatMux(policy: TracyPolicy, source: SeatMuxSource): SeatMux {
  const admittedVersion = source.db.getUserById(source.userId)?.credential_version ?? -1;
  const ledger = createCancelLedger();
  /** Streams H4 admitted, with what their downlink proved so far. */
  const states = new Map<string, SeatStreamState>();
  /** Opens held for the baseline, kept to be asked again. */
  const held = new Map<string, { endpoint: string; payload: unknown; filteredByGateway: boolean }>();

  const toRefusal = (verdict: StreamOpenVerdict & { kind: 'deny' }, endpoint: string): RefuseStream => ({
    kind: 'deny',
    code: verdict.code ?? 'gateway/forbidden',
    reason: verdict.reason,
    details: verdict.details ?? { endpoint },
  });

  const decide = (streamId: string, endpoint: string, payload: unknown, filteredByGateway: boolean): StreamOpenVerdict => {
    const seat = seatViewOf(source);
    return policy.decideStreamOpen({
      streamId, endpoint, payload, filteredByGateway, seat,
      carrier: { baselineReady: source.userSessionAccess.has(source.userId), cancelledIds: ledger.ids },
    });
  };

  /** J4: the stream ends; its id is held in the ledger until dsh confirms the end. */
  const cancel = (streamId: string): ItemAction => {
    states.delete(streamId);
    noteClientCancel(ledger, streamId);
    return { kind: 'cancel-upstream' };
  };

  const learnJobs = (state: SeatStreamState, value: unknown): void => {
    if (!isRecord(value)) return;
    const resource = state.resource;
    if (resource.kind === 'job-list' && Array.isArray(value.jobs)) {
      for (const job of value.jobs) if (isRecord(job) && typeof job.id === 'string') source.jobs.learn(source.userId, job.id, resource.sessionId);
    } else if (resource.kind === 'job-follow' && isRecord(value.job) && typeof value.job.id === 'string') {
      source.jobs.learn(source.userId, value.job.id, resource.sessionId);
    }
  };

  return {
    admit() {
      const user = source.db.getUserById(source.userId);
      const verdict = frameVerdict(
        user === null ? null : { banned: source.effectivePermissions(source.userId).banned, credentialVersion: user.credential_version },
        admittedVersion,
      );
      return verdict === null ? null : { code: POLICY_VIOLATION, reason: verdict.reason };
    },

    clientFrame(frame, filteredByGateway, forwarded) {
      if (frame.type === 'cancel') {
        states.delete(frame.streamId);
        held.delete(frame.streamId);
        if (forwarded) noteClientCancel(ledger, frame.streamId);
        return { kind: 'pass' };
      }
      if (frame.type !== 'open') return { kind: 'pass' };
      const verdict = decide(frame.streamId, frame.endpoint, frame.payload, filteredByGateway);
      if (verdict.kind === 'deny') return toRefusal(verdict, frame.endpoint);
      if (verdict.kind === 'wait-baseline') {
        held.set(frame.streamId, { endpoint: frame.endpoint, payload: frame.payload, filteredByGateway });
        return { kind: 'wait-baseline' };
      }
      // Upstream may hold this open for its own baseline; ask again then, whoever held it.
      held.set(frame.streamId, { endpoint: frame.endpoint, payload: frame.payload, filteredByGateway });
      if (verdict.state !== undefined) states.set(frame.streamId, verdict.state);
      return { kind: 'pass' };
    },

    recheck(streamId) {
      const open = held.get(streamId);
      held.delete(streamId);
      if (open === undefined) return null;
      const verdict = decide(streamId, open.endpoint, open.payload, open.filteredByGateway);
      if (verdict.kind === 'pass') {
        if (verdict.state !== undefined) states.set(streamId, verdict.state);
        return null;
      }
      states.delete(streamId);
      // Still undecidable once the baseline is in: the book cannot say yes, so it is a no.
      return verdict.kind === 'deny'
        ? toRefusal(verdict, open.endpoint)
        : { kind: 'deny', code: 'gateway/method-unavailable', reason: `Remote stream ${open.endpoint} is not available through this gateway`, details: { endpoint: open.endpoint } };
    },

    upstreamFrame(frame) {
      if (upstreamFrameAfterCancel(ledger, frame) === 'drop') return 'drop';
      if (frame.type === 'end' || frame.type === 'error') {
        states.delete(frame.streamId);
        held.delete(frame.streamId);
      }
      return 'pass';
    },

    item(streamId, raw, filtered) {
      const state = states.get(streamId);
      // A stream H4 did not admit with state has nothing to be filtered against: nothing reaches the seat.
      if (state === undefined) return { kind: 'drop' };
      const seat = seatViewOf(source);
      // Upstream drops what it cannot place (a revoked session's frames, say); the stream must still
      // end then (J4), so the right to it is read before upstream's verdict counts.
      if (!streamStillHeld(state, seat)) return cancel(streamId);
      let value = filtered;
      // Q14: upstream drops a workspace/follow frame type it does not know; Tracy passes it fenced.
      if (value === null && state.resource.kind === 'host' && state.resource.endpoint === 'workspace/follow' &&
        isRecord(raw) && typeof raw.type === 'string' && !WORKSPACE_FOLLOW_KNOWN_FRAMES.has(raw.type)) value = raw;
      if (value === null) return { kind: 'drop' };
      const verdict = policy.filterDown({ endpoint: endpointOf(state), state, seat, raw }, value);
      if (verdict.kind === 'cancel-upstream') return cancel(streamId);
      if (verdict.kind === 'drop') return { kind: 'drop' };
      const out = verdict.kind === 'replace' ? verdict.value : value;
      learnJobs(state, out);
      // Q16: a `$events` stream that proved its dsh client id can now be answered over HTTP.
      if (state.eventsClientId !== undefined) source.jobs.events.register(source, state, () => states.get(streamId) === state);
      // Q10: no other person's address reaches a seat, on any stream.
      scrubForeignPrompterEmails(out, ownEmailOf(source.db, source.userId));
      return { kind: 'send', value: out };
    },

    terminal(frame) {
      if (frame.type === 'end') return { type: 'end', streamId: frame.streamId };
      if (frame.type === 'item') return null;
      // An error is rebuilt from checked fields: its details are fenced to what the seat may see,
      // so a dsh error naming another session's resource carries no id of it.
      const error = frame.error;
      const seat = seatViewOf(source);
      const fenced = fenceStreamIds(isRecord(error.details) ? error.details : {}, seat.holdsSession, seat.seesWorkspace);
      return {
        type: 'error',
        streamId: frame.streamId,
        error: {
          code: typeof error.code === 'string' && ERROR_CODE_RE.test(error.code) ? error.code : 'gateway/upstream-error',
          // dsh's own wording can name another session's job or path; the seat gets the code only.
          message: 'Remote stream failed',
          details: fenced === FENCED_OUT ? {} : fenced,
        },
      };
    },
  };
}

const endpointOf = (state: SeatStreamState): string => {
  const resource = state.resource;
  if (resource.kind === 'host') return resource.endpoint;
  if (resource.kind === 'session') return 'session/follow';
  return resource.kind === 'job-list' ? 'job/list' : 'job/follow';
};

/**
 * Which session each job a seat was shown belongs to, learned from the seat's own FILTERED job
 * streams (`rows`, `opened`, `status`). `POST /api/job/kill` names a job and a session; dsh fences
 * the lookup by session but also lets any session kill an unowned job, so the gate admits a kill
 * only for a job it has shown this seat under that session.
 */
export interface JobOwnerBook {
  learn(userId: number, jobId: string, sessionId: string): void;
  /** The session a job was shown under, or undefined when this seat was never shown it. */
  ownerOf(userId: number, jobId: string): string | undefined;
  /** The seats' `$events` streams, by dsh client id, for answers sent over HTTP (Q16). */
  readonly events: EventStreamBook;
}

/**
 * Q16: each seat's `$events` streams by the dsh client id their `ready` named, so that
 * `POST /api/$events/result` (a separate HTTP request) is judged against the questions THAT
 * stream delivered (`claimQuestionAnswer`). A stream that ended is forgotten when its seat
 * registers another or answers through it; at most {@link EVENT_STREAMS_PER_SEAT_MAX} per seat
 * are kept, the oldest forgotten first.
 */
export interface EventStreamBook {
  register(source: SeatMuxSource, state: SeatStreamState, isOpen: () => boolean): void;
  /** Claim the answer `args` for the seat; refused unless its own open stream delivered that question. */
  claim(userId: number, args: unknown): { kind: 'allow'; sessionId: string } | { kind: 'refuse' };
}

export const EVENT_STREAMS_PER_SEAT_MAX = 16;

function createEventStreamBook(): EventStreamBook {
  type Entry = { source: SeatMuxSource; state: SeatStreamState; isOpen: () => boolean };
  const bySeat = new Map<number, Map<string, Entry>>();
  return {
    register(source, state, isOpen) {
      const clientId = state.eventsClientId;
      if (clientId === undefined) return;
      let streams = bySeat.get(source.userId);
      if (streams === undefined) { streams = new Map(); bySeat.set(source.userId, streams); }
      if (streams.get(clientId)?.state === state) return;
      // Streams of this seat that ended hold nothing answerable: forget them on the way.
      for (const [id, entry] of streams) if (!entry.isOpen()) streams.delete(id);
      streams.delete(clientId);
      streams.set(clientId, { source, state, isOpen });
      if (streams.size > EVENT_STREAMS_PER_SEAT_MAX) streams.delete(streams.keys().next().value as string);
    },
    claim(userId, args) {
      const clientId = isRecord(args) ? args.clientId : undefined;
      const entry = typeof clientId === 'string' ? bySeat.get(userId)?.get(clientId) : undefined;
      if (entry === undefined) return { kind: 'refuse' };
      if (!entry.isOpen()) {
        const streams = bySeat.get(userId)!;
        streams.delete(clientId as string);
        if (streams.size === 0) bySeat.delete(userId);
        return { kind: 'refuse' };
      }
      return claimQuestionAnswer(entry.state, args, seatViewOf(entry.source), true);
    },
  };
}

/**
 * Q16, `POST /api/$events/result` of a seat: exactly dsh's client RPC envelope
 * (`{ type: 'client-request', rpcId, method: '$events/result', payload: { args } }`), answering a
 * question the seat's own open `$events` stream delivered — once.
 */
export function decideSeatQuestionAnswer(ctx: { jobs: JobOwnerBook; userId: number; body: unknown }): { kind: 'pass' } | { kind: 'deny'; status: number; reason: string } {
  const deny = { kind: 'deny', status: 403, reason: 'This question cannot be answered by this seat' } as const;
  const body = ctx.body;
  if (!isRecord(body) || Object.keys(body).length !== 4 || body.type !== 'client-request' || typeof body.rpcId !== 'string' ||
    body.rpcId === '' || body.method !== '$events/result' || !isRecord(body.payload) || Object.keys(body.payload).length !== 1 ||
    !isRecord(body.payload.args)) return deny;
  return ctx.jobs.events.claim(ctx.userId, body.payload.args).kind === 'allow' ? { kind: 'pass' } : deny;
}

/** Most jobs remembered per seat; past it the oldest is forgotten (and a kill of it refused). */
export const JOBS_PER_SEAT_MAX = 1024;

export function createJobOwnerBook(): JobOwnerBook {
  const bySeat = new Map<number, Map<string, string>>();
  return {
    events: createEventStreamBook(),
    learn(userId, jobId, sessionId) {
      let jobs = bySeat.get(userId);
      if (jobs === undefined) { jobs = new Map(); bySeat.set(userId, jobs); }
      jobs.delete(jobId);
      jobs.set(jobId, sessionId);
      if (jobs.size > JOBS_PER_SEAT_MAX) jobs.delete(jobs.keys().next().value as string);
    },
    ownerOf: (userId, jobId) => bySeat.get(userId)?.get(jobId),
  };
}
