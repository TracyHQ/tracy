/**
 * The seat request path (hooks H1 → proxy pre-check, H2, H3, H13): what a request may carry to dsh
 * and what its answer may carry back. Pure decisions over values the proxy already holds; the
 * proxy supplies the grant check, the seat's session folders and `realpath` as functions, and
 * obeys the verdict (`proxy-hooks.ts` is the adapter that does the I/O).
 *
 * Order (plan §1 rule 5): `decideSeatRequest` runs before the upstream request exists;
 * `checkSeatRequestBody` runs on the parsed body before any byte is written to dsh;
 * `filterSeatAnswer` runs on the parsed answer before any byte is sent to the client.
 */
import { isDirectoryListRequest, isWorkspaceDirectoryCreate } from '../permissions.js';
import type { PolicyDeny, PolicyPass, PolicyVerdict } from './policy.js';
import { isPromptRequest, requestArguments } from './prompter.js';
import {
  checkSeatBody,
  classifySeatHttp,
  fileDoorTarget,
  seatMayReadFile,
  sidebarApiRouteOf,
  seatRouteSessionOf,
} from './routes.js';
import { DENY_ALL, directoryPickerPathFor, insideBox } from './seat-context.js';
import {
  collectQuerySessionRefs,
  collectSessionRefs,
  filterSessionAnswer,
  scrubForeignPrompterEmails,
} from './session-refs.js';

/** What the proxy knows about one request before it creates the upstream request. */
export interface SeatRequestContext {
  method: string;
  /** The proxy path: decoded and normalized exactly as it is forwarded. */
  path: string;
  query: URLSearchParams;
  contentType: string | undefined;
  /**
   * The request carries no body by HTTP framing (no `transfer-encoding`, `content-length` absent or
   * 0). Unset reads as "may carry one".
   */
  bodyless?: boolean;
  /** The authenticated account: its name and proven address (null for the master and visitors). */
  account: { username: string; email: string | null };
  /** The seat's permission row; undefined for the master, which has none. */
  perms: { allow_upload: boolean; allowed_folders: readonly string[] } | undefined;
  /** Whether the seat holds a session now (grant, folder, not switched off), read when called. */
  holdsSession(sessionId: unknown): boolean;
  /** The working folders of the sessions the seat holds now. */
  sessionFolders(): readonly string[];
  /** `target` with symlinks followed; null when it does not exist or cannot be read. */
  realpath(target: string): string | null;
}

/** What the body gate must do once the JSON body is parsed (H2). */
export interface BodyPlan {
  /** A sidebar RPC whose own key names the session (`checkSeatBody`); null otherwise. */
  sidebarRoute: string | null;
  /** Q2: every session the body names must be one the seat holds. */
  refs: boolean;
  /** R9: the body must name at least one session. */
  requireSession: boolean;
  /** Q11: write who typed into the prompt's arguments. */
  stamp: boolean;
  /** S4: the directory picker, held to the seat's box. */
  picker: 'list' | 'create' | null;
  /** J1 / Q16: a door whose JSON body the gate's per-seat book must admit (`decideJobKill`, `decideQuestionAnswer`). */
  judge: JudgedDoor | null;
}

/** Doors judged against what the seat's own streams showed it, not against the grant book alone. */
export type JudgedDoor = 'job-kill' | 'question-answer';

const JUDGED_DOORS: ReadonlyArray<readonly [JudgedDoor, RegExp]> = [
  ['job-kill', /^\/api\/job[./]kill(?:[./]|$)/],
  ['question-answer', /^\/api\/\$events[./]result(?:[./]|$)/],
];

/** The judged door a path names (both separators dsh's API router accepts), or null. */
export function judgedDoorOf(path: string): JudgedDoor | null {
  return JUDGED_DOORS.find(([, re]) => re.test(path))?.[0] ?? null;
}

/** Which answer the seat may read only after the gate rebuilt it (H3). */
export type AnswerDoor = 'search' | 'candidates' | 'history';

export type RequestPlan = PolicyDeny | { kind: 'forward'; body: BodyPlan | null; answer: AnswerDoor | null };
export type BodyVerdict = PolicyVerdict | { kind: 'replace'; body: unknown };
export type AnswerVerdict = PolicyDeny | { kind: 'answer'; value: unknown };

/** What the answer filter knows: the request's context, and the sessions its body named. */
export interface SeatAnswerContext extends SeatRequestContext {
  requestRefs: readonly string[];
}

const PASS: PolicyPass = Object.freeze({ kind: 'pass' });
const deny = (status: number, reason: string): PolicyDeny => ({ kind: 'deny', status, reason });
const NOT_HELD = 'The request names a session this seat does not hold';
const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SEARCH_RE = /^\/api\/session[./]search$/;
const CANDIDATES_RE = /^\/api\/sessionReferenceResolver[./]candidates$/;
const HISTORY_RE = /^\/api\/session[./](?:page|history)$/;
const DIRECTORY_PICKER_RE = /^\/api\/directoryPicker[./]/;

/** The media type as dsh's RPC host reads it: before any parameter, trimmed, lower case. */
export function mediaTypeOf(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0]!.trim().toLowerCase();
}

const isApiPath = (path: string): boolean => path.startsWith('/api/');
const isSidebarPath = (path: string): boolean => path === '/sidebar' || path.startsWith('/sidebar/');

function plan(body: BodyPlan | null, answer: AnswerDoor | null): RequestPlan {
  return { kind: 'forward', body, answer };
}

function bodyPlan(fields: Partial<BodyPlan>): BodyPlan {
  return { sidebarRoute: null, refs: false, requireSession: false, stamp: false, picker: null, judge: null, ...fields };
}

/**
 * H1 (finished in the proxy) and the H2/H3 plan for one request. The master is only stamped (Q11).
 * A seat is held to the route table (R1–R11, owner-only rows refused), to the sessions its query
 * names (Q3), and every JSON write under `/api/` is read for the sessions it names (Q2); a write
 * under `/api/` that is not JSON is refused unless its query names a held session (the binary
 * upload doors), because the gate cannot read what it would forward. A write with no body at all
 * hides nothing and goes on (the plugins' bodyless `/hello` pings).
 */
export function decideSeatRequest(ctx: SeatRequestContext): RequestPlan {
  const stamp = isPromptRequest(ctx.method, ctx.path);
  if (ctx.perms === undefined) return plan(stamp ? bodyPlan({ stamp }) : null, null);
  const perms = ctx.perms;

  let queryNamesSession = false;
  if (isApiPath(ctx.path) || isSidebarPath(ctx.path)) {
    const query = collectQuerySessionRefs(ctx.query);
    if (query.kind === 'reject') return deny(query.status, query.reason);
    if (!query.ids.every((id) => ctx.holdsSession(id))) return deny(403, NOT_HELD);
    queryNamesSession = query.ids.length > 0;
  }

  const route = classifySeatHttp(ctx.method, ctx.path);
  let sidebarRoute: string | null = null;
  let requireSession = false;
  if (route.kind === 'owner-only') return deny(403, 'This route is only available to the owner');
  if (route.kind === 'seat-file') {
    const target = fileDoorTarget(ctx.query);
    const resolved = target === null ? null : ctx.realpath(target);
    if (!seatMayReadFile(target, ctx.sessionFolders(), resolved)) return deny(403, 'The file is outside the sessions this seat holds');
  }
  if (route.kind === 'seat-route') {
    if (route.write && !perms.allow_upload) return deny(403, 'This seat may not change files');
    if (route.sessionFrom === 'query' || route.sessionFrom === 'path') {
      const sessionId = seatRouteSessionOf(route.sessionFrom, { path: ctx.path, query: ctx.query });
      if (sessionId === null || !ctx.holdsSession(sessionId)) return deny(403, NOT_HELD);
    }
    if (route.sessionFrom === 'body' || route.sessionFrom === 'rootSessionId') {
      if (isSidebarPath(ctx.path)) sidebarRoute = sidebarApiRouteOf(ctx.path);
      else requireSession = true;
    }
  }

  const write = WRITE_METHODS.has(ctx.method);
  // Fail-closed toward plugins (plan §5.1): upstream forwards a subuser's unknown route untouched;
  // a seat writes only through dsh's API (read below) and the seat route table.
  if (write && route.kind === 'unknown' && !isApiPath(ctx.path)) return deny(403, 'A seat may not write to this route');
  const json = mediaTypeOf(ctx.contentType) === 'application/json';
  const refs = isApiPath(ctx.path) && write && json;
  if (isApiPath(ctx.path) && write && !json && !queryNamesSession && ctx.bodyless !== true) {
    return deny(403, 'A seat writes to the API in JSON, or names its session in the query');
  }
  // J1 / Q16: judged only on a JSON POST body; any other shape never reaches dsh unjudged.
  const judge = judgedDoorOf(ctx.path);
  if (judge !== null && (ctx.method !== 'POST' || !json)) return deny(403, 'This request must be a JSON POST');
  const picker = ctx.method === 'POST' && isDirectoryListRequest(ctx.path)
    ? 'list'
    : ctx.method === 'POST' && isWorkspaceDirectoryCreate(ctx.path) ? 'create' : null;
  const needsBody = sidebarRoute !== null || refs || requireSession || stamp || picker !== null || judge !== null;

  let answer: AnswerDoor | null = null;
  if (ctx.method === 'POST') {
    if (SEARCH_RE.test(ctx.path)) answer = 'search';
    else if (CANDIDATES_RE.test(ctx.path)) answer = 'candidates';
    else if (HISTORY_RE.test(ctx.path)) answer = 'history';
  }
  return plan(needsBody ? bodyPlan({ sidebarRoute, refs: refs || requireSession, requireSession, stamp, picker, judge }) : null, answer);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The argument object of a directory picker call: the measured envelope only (`payload.args`). */
function pickerArguments(path: string, body: unknown): Record<string, unknown> | null {
  if (!DIRECTORY_PICKER_RE.test(path)) return requestArguments(body);
  if (!isRecord(body) || body.type !== 'client-request' || !isRecord(body.payload)) return null;
  return isRecord(body.payload.args) ? body.payload.args : null;
}

/**
 * H2 on the parsed JSON body, before any byte reaches dsh: the sidebar route's own session and
 * every session the body names are held (R1, R4, Q2); the picker opens only inside the seat's box
 * (S4); a prompt carries who typed it, whatever the client claimed (Q11). Mutates `body` only to
 * write the picker path or the stamp, and then says `replace`.
 */
export function checkSeatRequestBody(ctx: SeatRequestContext, check: BodyPlan, body: unknown): BodyVerdict {
  if (check.sidebarRoute !== null) {
    const verdict = checkSeatBody({ route: check.sidebarRoute, body, holdsSession: (id) => ctx.holdsSession(id) });
    if (verdict.kind === 'deny') return verdict;
  }
  if (check.refs) {
    const refs = collectSessionRefs(body);
    if (check.requireSession && refs.size === 0) return deny(403, 'The request names no session');
    for (const id of refs) if (!ctx.holdsSession(id)) return deny(403, NOT_HELD);
  }
  let replaced = false;
  if (check.picker !== null && ctx.perms !== undefined) {
    const args = pickerArguments(ctx.path, body);
    if (args === null) return deny(403, 'The directory picker call has an unknown shape');
    const requested = args.path;
    if (requested !== undefined && typeof requested !== 'string') return deny(403, 'The directory picker path is not a string');
    if (check.picker === 'create') {
      if (typeof requested !== 'string' || !insideBox(requested, ctx.perms.allowed_folders)) {
        return deny(403, 'A folder is created only inside the seat box');
      }
    } else {
      const folders = ctx.perms.allowed_folders.length === 0 ? [DENY_ALL] : ctx.perms.allowed_folders;
      const opened = directoryPickerPathFor(requested, folders);
      if (typeof opened !== 'string') return deny(403, 'The directory picker opens only inside the seat box');
      if (opened !== requested) {
        args.path = opened;
        replaced = true;
      }
    }
  }
  if (check.stamp) {
    const args = requestArguments(body);
    if (args !== null) {
      const email = typeof ctx.account.email === 'string' && ctx.account.email.trim() !== ''
        ? ctx.account.email.trim().toLowerCase()
        : null;
      args.prompter = { user: ctx.account.username, email };
      replaced = true;
    }
  }
  return replaced ? { kind: 'replace', body } : PASS;
}

/**
 * H3 on the parsed answer of a door that names sessions from all over the Host, before any byte
 * reaches the seat: search and the `@session` picker keep only items the seat holds NOW, rebuilt
 * from known fields (Q8); a history page is delivered only while the seat still holds the session
 * it asked for (Q9), and carries no other person's address (Q10).
 */
export function filterSeatAnswer(ctx: SeatAnswerContext, door: AnswerDoor, answer: unknown): AnswerVerdict {
  if (door === 'history') {
    if (ctx.requestRefs.length === 0 || !ctx.requestRefs.every((id) => ctx.holdsSession(id))) {
      return deny(403, 'The session was taken back while dsh read it');
    }
    scrubForeignPrompterEmails(answer, ctx.account.email === null ? null : ctx.account.email.trim().toLowerCase());
    return { kind: 'answer', value: answer };
  }
  const filtered = filterSessionAnswer(answer, door, (id) => ctx.holdsSession(id));
  return filtered.kind === 'reject' ? deny(filtered.status, filtered.reason) : filtered;
}
