/**
 * Session references in what a seat sends and receives (Q2, Q3, Q5, Q8, Q10). Pure: no I/O, no
 * core state; the gateway hooks (phase 2) supply the parsed values and the grant check.
 */

/**
 * The wire fields through which a dsh request names a session (TCH #300). dsh renames lookup
 * parameters on the wire: an `Agent` travels as `agentId` (the root Agent id IS the session id),
 * a `WorkspaceFileScope` as `workspaceFileScopeId`; a subagent address names
 * `parentSessionId`/`childSessionId`, and `workspace/insertSessionBefore` a `beforeSessionId`.
 * Held to the grant BY FIELD, not by path, so a door this list never heard of (a plugin's, a newer
 * dsh's) is gated the day it ships.
 */
export const SESSION_REF_KEYS: readonly string[] = [
  'sessionId', 'agentId', 'parentSessionId', 'childSessionId', 'workspaceFileScopeId', 'beforeSessionId',
];

/** Sentinel for a session field that is present but not a string: no grant holds it. */
export const UNREADABLE_SESSION_REF = '';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every session a request body names, through any `SESSION_REF_KEYS` field at any depth, and every
 * session MENTIONED in any string (`sessionMentionsIn`) (Q2).
 *
 * A subagent is addressed through its parent: where an object carries `parentSessionId`, the
 * parent is checked and the `childSessionId` beside it is not (dsh refuses a child whose header
 * does not name that parent). A child named WITHOUT its parent is checked in its own right.
 * `null` reads as absent; any other non-string value yields `UNREADABLE_SESSION_REF`. The walk is
 * iterative and unbounded: a depth limit would be a place a second target hides.
 * @param value - the parsed body.
 * @returns the named session ids (may include `UNREADABLE_SESSION_REF`).
 */
export function collectSessionRefs(value: unknown): Set<string> {
  const out = new Set<string>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node === 'string') {
      for (const id of sessionMentionsIn(node)) out.add(id);
      continue;
    }
    if (node === null || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    const obj = node as Record<string, unknown>;
    const viaParent = Object.hasOwn(obj, 'parentSessionId') && obj.parentSessionId !== null;
    for (const key of SESSION_REF_KEYS) {
      if (!Object.hasOwn(obj, key) || (key === 'childSessionId' && viaParent)) continue;
      const raw = obj[key];
      if (raw !== null && raw !== undefined) out.add(typeof raw === 'string' ? raw : UNREADABLE_SESSION_REF);
    }
    for (const child of Object.values(obj)) stack.push(child);
  }
  return out;
}

/** dsh's session-reference URI: `dsh-session:` + base64url(JSON.stringify(sessionId)). */
const SESSION_MENTION_RE = /dsh-session:([A-Za-z0-9_-]*)/g;

/**
 * The sessions a piece of text MENTIONS (Q2). dsh reads `@[label](dsh-session:…)` and bare
 * `dsh-session:…` in a prompt and copies the named session's content into the turn's context: a
 * read of that conversation by another road. A mention that does not decode to a string id
 * yields `UNREADABLE_SESSION_REF` (dsh refuses it too).
 */
export function sessionMentionsIn(text: string): string[] {
  if (!text.includes('dsh-session:')) return [];
  const ids: string[] = [];
  for (const match of text.matchAll(SESSION_MENTION_RE)) {
    try {
      const decoded: unknown = JSON.parse(Buffer.from(match[1] ?? '', 'base64url').toString('utf8'));
      ids.push(typeof decoded === 'string' ? decoded : UNREADABLE_SESSION_REF);
    } catch {
      ids.push(UNREADABLE_SESSION_REF);
    }
  }
  return ids;
}

/** A refusal for the gateway to answer with `status`; `reason` is a short English sentence for logs. */
export type SessionRefReject = { kind: 'reject'; status: number; reason: string };

/**
 * Every session the QUERY names, through any `SESSION_REF_KEYS` key (Q3): dsh's plain fetch doors
 * (`session.export`, `session/uploadFileBinary`, `changes.*`, `present.*`) read it there. A key
 * given twice is refused outright: dsh reads the first, and a gate reading another is a bypass.
 * The caller then requires the seat to hold every returned id.
 */
export function collectQuerySessionRefs(query: URLSearchParams): { kind: 'refs'; ids: string[] } | SessionRefReject {
  const ids: string[] = [];
  for (const key of SESSION_REF_KEYS) {
    const values = query.getAll(key);
    if (values.length > 1) return { kind: 'reject', status: 403, reason: `The query names ${key} more than once` };
    if (values.length === 1) ids.push(values[0]!);
  }
  return { kind: 'refs', ids };
}

/** Longest session id the gate records or passes; dsh ids are far shorter. */
const MAX_SESSION_ID_LENGTH = 200;
const isSessionId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_SESSION_ID_LENGTH;
const isRefusal = (row: Record<string, unknown>): boolean => row.ok === false || Object.hasOwn(row, 'error');

/**
 * The session a `session/create` / `session/fork` answer reports as made, or null when the answer
 * is a refusal (Q5). dsh answers every RPC with HTTP 200 and
 * `{ type: 'server-response', rpcId, result: { ok, value | error } }`; an error's `details` may
 * name another person's session (`session/conflict`), and recording THAT as the caller's
 * creation would grant it. Older shapes without `ok` (`{ result: { value } }`, `{ value }`) are
 * read from their value only.
 */
export function createdSessionIdOf(answer: unknown): string | null {
  if (!isRecord(answer) || isRefusal(answer)) return null;
  let value: unknown = answer.value;
  if (answer.result !== undefined) {
    if (!isRecord(answer.result) || isRefusal(answer.result)) return null;
    value = answer.result.value;
  }
  if (!isRecord(value)) return null;
  return isSessionId(value.sessionId) ? value.sessionId : null;
}

/** The two doors whose answers list sessions from all over the Host (Q8). */
export type SessionAnswerDoor = 'search' | 'candidates';

type FieldType = 'string' | 'boolean' | 'number';

/** Wire fields of one item, by door, as dsh declares them: `[type, required]`. Nothing else crosses. */
const ITEM_FIELDS: Record<SessionAnswerDoor, Record<string, readonly [FieldType, boolean]>> = {
  // `SessionSearchItem` (dsh `api/session-controller/src/types.ts`).
  search: { snippet: ['string', true] },
  // `SessionReferenceMentionCandidate` (dsh `context/session-reference/src/types.ts`).
  candidates: {
    label: ['string', true],
    displayTitle: ['string', false],
    cwd: ['string', false],
    sameWorkspace: ['boolean', true],
    createdAt: ['number', true],
    mention: ['string', true],
  },
};

/** An RPC error code as dsh writes them (`gateway/internal`, `session/not-found`): a name, no content. */
const RPC_ERROR_CODE = /^[a-z][A-Za-z]*\/[a-z][a-z-]*$/;
/** The only refusal message a seat reads here: dsh's message and `details` may quote another session. */
const REFUSAL_MESSAGE = 'The request was refused.';

class UnknownShape extends Error {}

/**
 * Rebuild a `session/search` or `sessionReferenceResolver/candidates` answer for a seat, keeping
 * only the items whose session `holds` accepts (Q8, TCH #300).
 *
 * Both answers carry content or titles of sessions all over the Host, so this is an allowlist,
 * not a walk: the known envelope (`{ type, rpcId, result: { ok, value } }`, or the older
 * `{ result: { value } }` / `{ value }`), the known value (search: `{ items, hasMore }`;
 * candidates: an array), each item rebuilt from its known fields. An item without a valid
 * `sessionId`, a required field missing or mistyped, or any other shape is a `reject` with 502:
 * an item the gate cannot attribute to a session is never passed as harmless.
 *
 * Nothing Host-wide survives: a refusal keeps a plain RPC `code` and says a fixed message, and
 * search's `hasMore` (which counts matches in every session) is always `false`.
 * Known limitation (#566): dsh caps the list before this filter (search 20, candidates 50), so a
 * seat can miss its own match past the cap; foreign sessions never leak.
 */
export function filterSessionAnswer(
  answer: unknown,
  door: SessionAnswerDoor,
  holds: (sessionId: string) => boolean,
): { kind: 'answer'; value: unknown } | SessionRefReject {
  try {
    return { kind: 'answer', value: rebuildSessionAnswer(answer, door, holds) };
  } catch (error) {
    if (!(error instanceof UnknownShape)) throw error;
    return { kind: 'reject', status: 502, reason: `Unexpected ${door} answer: ${error.message}` };
  }
}

function rebuildSessionAnswer(answer: unknown, door: SessionAnswerDoor, holds: (sessionId: string) => boolean): unknown {
  const fail = (why: string): never => { throw new UnknownShape(why); };
  const refusal = (row: Record<string, unknown>): Record<string, unknown> => {
    const error = isRecord(row.error) ? row.error : {};
    const code = typeof error.code === 'string' && error.code.length <= 64 && RPC_ERROR_CODE.test(error.code) ? error.code : 'unknown';
    return { ok: false, error: { code, message: REFUSAL_MESSAGE } };
  };
  if (!isRecord(answer)) return fail('answer is not an object');
  const out: Record<string, unknown> = {};
  if (typeof answer.type === 'string') out.type = answer.type;
  if (typeof answer.rpcId === 'string' || typeof answer.rpcId === 'number') out.rpcId = answer.rpcId;
  if (isRefusal(answer)) return { ...out, ...refusal(answer) };

  let value: unknown;
  let wrap: (filtered: unknown) => Record<string, unknown>;
  if (Object.hasOwn(answer, 'result')) {
    const result = answer.result;
    if (!isRecord(result)) return fail('result is not an object');
    if (isRefusal(result)) return { ...out, result: refusal(result) };
    if (result.ok !== undefined && result.ok !== true) return fail('result.ok is not a boolean');
    value = result.value;
    wrap = (filtered) => ({ ...out, result: result.ok === true ? { ok: true, value: filtered } : { value: filtered } });
  } else if (Object.hasOwn(answer, 'value')) {
    value = answer.value;
    wrap = (filtered) => ({ ...out, value: filtered });
  } else {
    return fail('no result or value');
  }

  const items = (list: unknown): Record<string, unknown>[] => {
    if (!Array.isArray(list)) return fail('items is not an array');
    const kept: Record<string, unknown>[] = [];
    for (const item of list) {
      if (!isRecord(item)) return fail('item is not an object');
      if (!isSessionId(item.sessionId)) return fail('item has no valid sessionId');
      const rebuilt: Record<string, unknown> = { sessionId: item.sessionId };
      for (const [field, [type, required]] of Object.entries(ITEM_FIELDS[door])) {
        const fieldValue = item[field];
        if (fieldValue === undefined) {
          if (required) return fail(`item lacks ${field}`);
          continue;
        }
        if (typeof fieldValue !== type) return fail(`item field ${field} is not a ${type}`);
        if (typeof fieldValue === 'number' && !Number.isFinite(fieldValue)) return fail(`item field ${field} is not finite`);
        rebuilt[field] = fieldValue;
      }
      if (holds(item.sessionId)) kept.push(rebuilt);
    }
    return kept;
  };

  if (door === 'candidates') return wrap(items(value));
  if (!isRecord(value)) return fail('value is not an object');
  if (value.hasMore !== undefined && typeof value.hasMore !== 'boolean') return fail('hasMore is not a boolean');
  const filtered: Record<string, unknown> = { items: items(value.items) };
  if (value.hasMore !== undefined) filtered.hasMore = false;
  return wrap(filtered);
}

/**
 * Blank every `prompter.email` in a value bound for a seat, except the seat's own (Q10, TCH #300).
 *
 * The gate stamps `prompter: { user, email }` on each prompt and dsh keeps it on the message for
 * ever, so a history snapshot, a page and every live delta carry the address of whoever typed. A
 * seat may read a conversation it holds; it may not learn another person's address from it.
 * Mutates in place and keeps the key (`email: null` is the owner's own stamp shape). Iterative:
 * a depth bound would be a place a nested address passes unread.
 * @param value - parsed JSON about to be serialised to the seat.
 * @param ownEmail - the seat's own proven address (lower case), or null.
 * @returns whether anything was changed.
 */
export function scrubForeignPrompterEmails(value: unknown, ownEmail: string | null): boolean {
  let changed = false;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    const obj = node as Record<string, unknown>;
    const prompter = Object.hasOwn(obj, 'prompter') ? obj.prompter : undefined;
    if (isRecord(prompter) && Object.hasOwn(prompter, 'email') && prompter.email !== null) {
      const mine = ownEmail !== null && typeof prompter.email === 'string' && prompter.email.trim().toLowerCase() === ownEmail;
      if (!mine) {
        prompter.email = null;
        changed = true;
      }
    }
    for (const child of Object.values(obj)) stack.push(child);
  }
  return changed;
}
