/**
 * Seat context: what a seat holds — its folders, the workspaces it may list, the sessions it may
 * touch — as pure functions over values the core already has (TRACY-FORK.md §2, group S/Q).
 *
 * Tracy's boundary is `allowed_folders` and only it: several seats work on one site, so upstream's
 * "one folder, one owner" assumption does not hold here (h15-shared-folder.md). The core calls
 * these at its hook points; nothing here imports a core module or performs I/O.
 *
 * Path rules are local on purpose: the policy layer never imports core code, so it does not share
 * upstream's `folderAllowed`. Paths are POSIX (every host is Linux); a relative path is never inside
 * a box.
 */
import path from 'node:path';

/** The sentinel a seat with no granted folder carries: an empty list would mean "everything". */
export const DENY_ALL = '__deny__';

/**
 * A path with dot segments resolved and no trailing slash; null when it is not absolute or holds a
 * backslash (upstream's `normalizePath` reads `\` as a separator, so such a path could resolve
 * elsewhere in core than here).
 */
function canonical(value: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\')) return null;
  const normalized = path.posix.normalize(value);
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

/**
 * S1 — whether a seat lists the workspace at `workspacePath` (every listing door: workspace.list,
 * session.list, the follow baseline and upserts, host events). Only a path EQUAL to a granted
 * folder is listed; a folder inside one is still workable (`insideBox`) but is not a workspace of
 * its own in the sidebar. An empty list is the unrestricted (master) view.
 */
export function workspaceListed(workspacePath: string, allowedFolders: readonly string[]): boolean {
  if (allowedFolders.length === 0) return true;
  if (allowedFolders.includes(DENY_ALL)) return false;
  const wanted = canonical(workspacePath);
  return wanted !== null && allowedFolders.some((entry) => canonical(entry) === wanted);
}

/** The permission row fields these rules read (upstream `UserPermissionsRow`). */
export interface SeatFolders {
  allowed_folders: readonly string[];
}

/**
 * S3 — whether `target` lies in the seat's box: equal to a granted folder or below it. The rule for
 * writes, workspace create/rename/remove, and a session's cwd. Fail-closed: `__deny__`, an empty
 * list and a relative path are never inside.
 */
export function insideBox(target: string, allowedFolders: readonly string[]): boolean {
  if (allowedFolders.includes(DENY_ALL)) return false;
  const wanted = canonical(target);
  if (wanted === null) return false;
  return allowedFolders.some((entry) => {
    const base = canonical(entry);
    if (base === null) return false;
    return base === '/' || wanted === base || wanted.startsWith(`${base}/`);
  });
}

/** Whether the seat has at least one real folder (its box is more than the `__deny__` sentinel). */
function hasRealFolder(perms: SeatFolders): boolean {
  return perms.allowed_folders.some((folder) => folder !== DENY_ALL);
}

/**
 * S3 — whether `workspace.create` skips the box check. Only a seat with no real folder (upstream's
 * `__deny__` bootstrap, which gains its folder by creating it) is exempt; a seat with a real box
 * creates inside it. Upstream exempts every create (proxy.ts `needsFolderCheck`).
 */
export function workspaceCreateExempt(perms: SeatFolders): boolean {
  return !hasRealFolder(perms);
}

/**
 * S2 — whether another seat's ownership row on `ownerPath` is waived for this viewer. Upstream
 * hides or refuses a path some other subuser registered (`workspaceOwnedByAnotherSubuser`,
 * `workspaceSubtreeOverlap`); on Tracy several seats share a site, so the row is waived when both
 * seats hold the SAME granted folder and the owned path lies in it. A viewer granted a parent
 * folder shares no entry with a seat granted a child, so the anti-subuser rule still guards it.
 */
export function sharedGrantExempt(
  viewerFolders: readonly string[],
  ownerFolders: readonly string[],
  ownerPath: string,
): boolean {
  if (viewerFolders.includes(DENY_ALL) || ownerFolders.includes(DENY_ALL)) return false;
  const owners = new Set(ownerFolders.map(canonical).filter((entry) => entry !== null));
  return viewerFolders.some((entry) => {
    const shared = canonical(entry);
    return shared !== null && owners.has(shared) && insideBox(ownerPath, [shared]);
  });
}

const SITE_LABEL = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

/**
 * S10 — the folders a seat of this site is granted: `/site/<label>` (the webroot when the host
 * serves one site and has no label), canonicalised with `realpath` because dsh stores a
 * workspace's realpath and compares strings. A folder not on disk yet keeps its declared path. A
 * label that is not a single path segment names no folder: the result is `__deny__`, never an
 * empty list, which upstream reads as "every folder".
 * @param siteLabel - `MCP_TRACY_SITE_LABEL` as the fleet set it.
 * @param realpath - `fs.realpathSync` in production; may throw when the folder is missing.
 */
export function seatFoldersFor(siteLabel: string, realpath: (declared: string) => string): string[] {
  if (siteLabel !== '' && !SITE_LABEL.test(siteLabel)) return [DENY_ALL];
  const declared = siteLabel === '' ? '/var/www/html' : `/site/${siteLabel}`;
  try {
    return [realpath(declared)];
  } catch {
    return [declared];
  }
}

/**
 * The roles a seat may carry (TCH ADR 0028): the seat book's three, `owner` · `editor` · `viewer`,
 * plus the two anonymous visitor kinds `guest` · `bot` that only the seat door mints.
 */
export const SEAT_ROLES = ['owner', 'editor', 'viewer', 'guest', 'bot'] as const;
export type SeatRole = (typeof SEAT_ROLES)[number];
/** The roles a person holds in the seat book; a roster row with any other role signs nobody in. */
export const BOOK_ROLES = ['owner', 'editor', 'viewer'] as const satisfies readonly SeatRole[];
/**
 * Roles ADR 0028 retired, and what each became. Only something minted before the seat book's
 * migration can still send one (a stale client, an old roster); it lands on its successor.
 */
const RETIRED_ROLES: Readonly<Record<string, SeatRole>> = { admin: 'editor', developer: 'editor' };
/** The seat book's four toolsets (`apps/tracy-web/src/seats/roles.js` holds the same list). */
export const SEAT_TOOLSETS = ['content', 'code', 'site', 'lifecycle'] as const;
export type SeatToolset = (typeof SEAT_TOOLSETS)[number];

/**
 * A current seat role for a raw value off the wire, or null when it is not a role. Retired names
 * map to their successor, so an old caller asking for `admin` gets an `editor` seat, never a 400
 * and never more than an editor.
 */
export function seatRoleOf(raw: unknown): SeatRole | null {
  if (typeof raw !== 'string') return null;
  if ((SEAT_ROLES as readonly string[]).includes(raw)) return raw as SeatRole;
  return RETIRED_ROLES[raw] ?? null;
}

/**
 * Each role's FIXED toolsets (ADR 0028; mirror of `TOOLSETS_BY_ROLE` in the seat book's
 * `seats/roles.js`). A viewer holds none: it reads and chats, the agent stays read-only.
 */
const ROLE_TOOLSETS: Record<SeatRole, readonly SeatToolset[]> = {
  owner: ['content', 'code', 'site', 'lifecycle'],
  editor: ['content', 'code', 'site'],
  viewer: [],
  guest: ['content'],
  bot: ['content'],
};
const VISITOR_HOURLY_TOKENS: Record<'guest' | 'bot', number> = { guest: 20000, bot: 8000 };

/** The toolsets a role holds, as a fresh list (what a door sends when the caller sent none). */
export function toolsetsForRole(role: SeatRole): SeatToolset[] {
  return [...ROLE_TOOLSETS[role]];
}

/**
 * A seat's permission row in the shape upstream 2.7.7 `Database.setPermissions` takes, plus
 * `webSocketPaths`: 2.7.7 has no WebSocket allow-list column, so the terminal rules a code seat may
 * open travel beside the row for H6 to enforce.
 */
export interface SeatPermissions {
  allowedFolders: string[];
  hourlyTokenLimit: number | null;
  dailyMinutesLimit: number | null;
  allowUpload: boolean;
  allowGitDownload: boolean;
  allowWorkspaceCreate: boolean;
  allowSsh: boolean;
  allowedAgentPresets: string[] | null;
  banned: boolean;
  sandboxMode: string | null;
  disabledSessions: string[];
  webSocketPaths: string[];
}

/**
 * S6, S8 — the role matrix: what a seat may do inside dsh. `content` and `code` map onto real
 * axes; `site` grants workspace creation; `lifecycle` is fleet authority with no image in dsh.
 * An empty grant is written as `__deny__`, because upstream reads an empty list as "every folder".
 *
 * S14 — a seat holding NONE of `content`, `code`, `site` (a viewer) is READ-ONLY like a visitor:
 * read-only sandbox, no upload, no git, no terminal, no workspace creation. Unlike a visitor it
 * keeps no hourly cap: it is a known person on its own site, not traffic from a public page.
 * @param input.toolsets - as the seat book resolved them; undefined uses the role's fixed set, an
 *   empty array means none.
 * @param input.terminalRules - WebSocket rules this deployment lets a code seat use.
 */
export function permissionsFor(input: {
  role: SeatRole;
  folders: readonly string[];
  terminalRules: readonly string[];
  toolsets?: readonly SeatToolset[];
}): SeatPermissions {
  const folders = input.folders.filter((folder) => typeof folder === 'string' && folder.trim() !== '');
  const toolsets = input.toolsets ?? ROLE_TOOLSETS[input.role];
  const isVisitor = input.role === 'guest' || input.role === 'bot';
  const runsCode = toolsets.includes('code');
  const runsSite = toolsets.includes('site');
  const readOnly = isVisitor || !(toolsets.includes('content') || runsCode || runsSite);
  return {
    allowedFolders: folders.length > 0 ? folders : [DENY_ALL],
    hourlyTokenLimit: isVisitor ? VISITOR_HOURLY_TOKENS[input.role as 'guest' | 'bot'] : null,
    dailyMinutesLimit: null,
    allowUpload: !readOnly,
    allowGitDownload: runsCode,
    allowWorkspaceCreate: runsSite,
    allowSsh: false,
    // `null` lets every preset the lane ships; `[]` would forbid all, and the panel forces its
    // bundled persona into `session/create`, so a visitor could never start a session.
    allowedAgentPresets: null,
    banned: false,
    sandboxMode: readOnly ? 'read-only' : runsSite ? null : 'workspace-write',
    disabledSessions: [],
    webSocketPaths: runsCode ? [...input.terminalRules] : [],
  };
}

/** S12 — the header that tells dsh plugins which folders the gate vouches for. */
export const ALLOWED_FOLDERS_HEADER = 'x-dsh-allowed-folders';

/**
 * S12 — the value of {@link ALLOWED_FOLDERS_HEADER} for an account: its granted folders as JSON
 * (the `__deny__` sentinel left out), or null for the master, which has no permission row.
 */
export function allowedFoldersHeader(perms: SeatFolders | undefined): string | null {
  if (perms === undefined) return null;
  return JSON.stringify(perms.allowed_folders.filter((folder) => folder !== DENY_ALL));
}

/**
 * S12 — the headers forwarded to dsh: any copy the client sent (in any casing) is removed, and
 * the gate's own value is set for a seat. Returns a new object; `headers` is left as it was.
 */
export function applyAllowedFoldersHeader<V>(
  headers: Readonly<Record<string, V>>,
  perms: SeatFolders | undefined,
): Record<string, V | string> {
  const out: Record<string, V | string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== ALLOWED_FOLDERS_HEADER) out[name] = value;
  }
  const value = allowedFoldersHeader(perms);
  if (value !== null) out[ALLOWED_FOLDERS_HEADER] = value;
  return out;
}

/** A plausible session id: what upstream's grant table accepts. */
function plausibleSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

/** What Q4 reads: the grant book (persistence), the per-seat cache, and the seat's row. */
export interface SessionHoldContext {
  /** Whether the grant book honours this session for the seat (`TracyStore.isGrantHonoured`). */
  book: { has(sessionId: string): boolean };
  /** The gate's session → cwd cache for this seat. Supplies a folder; never decides on its own. */
  cache: ReadonlyMap<string, string>;
  perms: SeatFolders & { disabled_sessions: readonly string[] };
}

/**
 * Q4 — THE check every session door shares: the session is in the seat's grant book, not switched
 * off by the master, and its folder is inside the seat's box. The cache only supplies the folder,
 * so a cache wider than the book (a role change, a late answer) cannot widen access.
 * @param cwd - a folder the caller already knows for this session (the request's verified cwd, or
 *   the create answer's); used when given, else the cache's.
 */
export function seatHoldsSession(ctx: SessionHoldContext, sessionId: string, cwd?: string): boolean {
  if (!plausibleSessionId(sessionId) || ctx.perms.disabled_sessions.includes(sessionId)) return false;
  const folder = cwd ?? ctx.cache.get(sessionId);
  return folder !== undefined && insideBox(folder, ctx.perms.allowed_folders) && ctx.book.has(sessionId);
}

const MAX_ANSWER_DEPTH = 8;

/** Every `{ workspaceId | id, path }` pair in a JSON value, at most {@link MAX_ANSWER_DEPTH} deep. */
function idPathPairs(value: unknown, out: Array<[string, string]>, depth: number): void {
  if (depth > MAX_ANSWER_DEPTH || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) idPathPairs(item, out, depth + 1);
    return;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.path === 'string') {
    const id = typeof row.workspaceId === 'string' ? row.workspaceId : typeof row.id === 'string' ? row.id : null;
    if (id !== null) out.push([id, row.path]);
  }
  for (const item of Object.values(row)) idPathPairs(item, out, depth + 1);
}

/**
 * Q7 — the `workspaceId → path` pairs to learn from a successful `workspace.create` answer, so a
 * `session.create` by `workspaceId` right after it resolves without a list in between. Only pairs
 * for the folder the seat asked to create (and was allowed to) are learned.
 * @param answer - the parsed create answer.
 * @param requestedFolder - the folder the request named, already checked against the box.
 */
export function learnWorkspacePath(answer: unknown, requestedFolder: string): Map<string, string> {
  const wanted = canonical(requestedFolder);
  const learned = new Map<string, string>();
  if (wanted === null) return learned;
  const pairs: Array<[string, string]> = [];
  idPathPairs(answer, pairs, 0);
  for (const [id, workspacePath] of pairs) {
    if (canonical(workspacePath) === wanted) learned.set(id, workspacePath);
  }
  return learned;
}

/** The cwd an answer reports for `sessionId` (`{ sessionId, cwd }` anywhere in it), or null. */
function answerCwdOf(value: unknown, sessionId: string, depth: number): string | null {
  if (depth > MAX_ANSWER_DEPTH || value === null || typeof value !== 'object') return null;
  if (!Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (row.sessionId === sessionId && typeof row.cwd === 'string' && row.cwd !== '') return row.cwd;
  }
  for (const item of Object.values(value)) {
    const found = answerCwdOf(item, sessionId, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

/** What H3 knows when a seat's `session/create` or `session/fork` answer arrives. */
export interface CreateAnswer {
  status: number;
  /** The id the answer reports as made (`createdSessionIdOf`); null for a refusal. */
  sessionId: string | null;
  answer: unknown;
  /** The folder verified at request time: the request's cwd, its workspace's path, or a fork source's cwd. */
  requestCwd?: string;
}

/**
 * Q5, Q6 — the grant a create/fork answer earns its caller: the session id and folder to record
 * (`TracyStore.recordCreatedSession`, which also refuses an id another account holds), or null.
 * Only a 2xx answer naming a created session counts. The folder is the one verified at request
 * time, else the one the answer reports for THAT session (the third path, for a create by
 * `workspaceId` while the id → path cache is cold); either way it must lie in the caller's box.
 */
export function grantFromCreateAnswer(
  created: CreateAnswer,
  callerBox: SessionHoldContext['perms'],
): { sessionId: string; cwd: string } | null {
  const { status, sessionId } = created;
  if (status < 200 || status >= 300 || !plausibleSessionId(sessionId)) return null;
  if (callerBox.disabled_sessions.includes(sessionId)) return null;
  const cwd = created.requestCwd ?? answerCwdOf(created.answer, sessionId, 0);
  if (cwd === null || !insideBox(cwd, callerBox.allowed_folders)) return null;
  return { sessionId, cwd };
}

/**
 * S4 — where the directory picker (`host.listDirectory`) may open. Asked for no path, a seat opens
 * at its first granted folder (dsh's default is the container home); asked for a path outside its
 * box, it opens nowhere.
 * @returns the path to list, `undefined` to keep dsh's default (master), or null to refuse.
 */
export function directoryPickerPathFor(
  requested: string | null | undefined,
  allowedFolders: readonly string[],
): string | null | undefined {
  if (allowedFolders.includes(DENY_ALL)) return null;
  if (allowedFolders.length === 0) return requested ?? undefined;
  if (requested === null || requested === undefined || requested === '') return allowedFolders[0];
  return insideBox(requested, allowedFolders) ? requested : null;
}
