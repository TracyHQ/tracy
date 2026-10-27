import { collectSessionIds, isOfficialApiPath, isOfficialRootPath, normalizePath, pathWithin } from '../permissions.js';
import type { HttpVerdict, PolicyVerdict, SeatHttpContext } from './policy.js';

/**
 * The seat route table (R1–R11): which requests a seat (subuser) may make, and where each names
 * the one session it must hold. Pure decisions over (method, normalized gate path, query, parsed
 * body); the gateway hooks do the I/O (grant lookup, realpath) and obey the answer. Requests under
 * `/sidebar` that are not in the table are owner-only; every other route a seat may reach is named
 * by `seatMayReach` (R12). Both are fail-closed toward plugins, unlike upstream 2.7.7, which
 * forwards a subuser's unknown routes to dsh untouched.
 */

const SIDEBAR_API_RE = /^\/sidebar\/api\/([A-Za-z0-9_.-]+)$/;

/** The better-sidebar RPC a path names (`/sidebar/api/<route>`), or null. */
export function sidebarApiRouteOf(path: string): string | null {
  return SIDEBAR_API_RE.exec(path)?.[1] ?? null;
}
/** Session keys `checkSeatBody` holds anywhere in a sidebar body, and its bound on nesting. */
const SIDEBAR_BODY_SESSION_KEYS: ReadonlySet<string> = new Set(['sessionId', 'rootSessionId']);
const MAX_DEPTH = 32;

/** Where a seat route names the one session the seat must hold. */
export type SessionSource = 'body' | 'rootSessionId' | 'query' | 'path' | 'none';

/**
 * What the seat route table says about one request, as data for the gateway hooks (phase 2):
 * - `seat-route`: a seat may call it once the session named at `sessionFrom` is one it holds
 *   (`none`: the route names no session); `write` routes also need `allow_upload`.
 * - `owner-only`: refuse every seat.
 * - `seat-file`: dsh's file door; `seatMayReadFile` decides on the `path` query (R10).
 * - `public`: forwarded to dsh without a session, signed in or not (R11).
 * - `unknown`: outside the table; upstream's own classification decides.
 */
export type SeatRoute =
  | { kind: 'seat-route'; sessionFrom: SessionSource; write: boolean }
  | { kind: 'owner-only' }
  | { kind: 'seat-file' }
  | { kind: 'public' }
  | { kind: 'unknown' };

const seatRoute = (sessionFrom: SessionSource, write: boolean): SeatRoute => Object.freeze({ kind: 'seat-route', sessionFrom, write });
const READ = seatRoute('body', false);
const NO_SESSION = seatRoute('none', false);
const WRITE = seatRoute('body', true);

/**
 * better-sidebar RPCs a seat may call (`POST /sidebar/api/<route>`). Writes put bytes into the
 * workspace (R2). Every other `/sidebar/api/*` route (`jobs.*`, `browser.probe`, `sidechat.*`,
 * `git.*`, `shell.get`, `terminal.*`, `settings.update`, …) is owner-only (R5).
 */
const SEAT_SIDEBAR_API: ReadonlyMap<string, SeatRoute> = new Map([
  ['session.cwd', READ],
  ['fs.tree', READ],
  ['fs.trees', READ],
  ['fs.read', READ],
  ['fs.search', READ],
  ['fs.write', WRITE],
  ['fs.rename', WRITE],
  ['fs.remove', WRITE],
  ['fs.mkdir', WRITE],
  ['archive.build', READ],
  ['archive.status', READ],
  ['changes.ops', READ],
  ['subagents.live', seatRoute('rootSessionId', false)],
  // The side card prefs (`seedTabs`, `openByDefault`, tab switches), secrets redacted (R7).
  ['settings.get', NO_SESSION],
]);

const QUERY_READ = seatRoute('query', false);
const PATH_READ = seatRoute('path', false);

/**
 * better-sidebar's lazy chunks (editor, terminal, mermaid, locale): the same static client code
 * every viewer gets through `/plugins/<id>/client.js` (R8). One flat lower-case segment ending in
 * `.js`, mirroring the plugin's own route: no `/`, no `..`, no `.map`.
 */
const SIDEBAR_CHUNK_RE = /^\/sidebar\/bundle\/[a-z0-9-]+\.js$/;

const SIDEBAR_HTML_PREFIX = '/sidebar/html/';

/**
 * The session of a side card HTML preview, `GET /sidebar/html/<sessionId>/<file…>` (R3). It rides
 * in the path because relative assets would lose a query; the first segment is percent-decoded
 * exactly once, as better-sidebar's `decodeHtmlUrl` reads the same forwarded path. Null for
 * anything that is not a well-formed preview reference (no session, no file segment, bad encoding).
 */
export function sidebarHtmlSessionOf(path: string): string | null {
  if (!path.startsWith(SIDEBAR_HTML_PREFIX)) return null;
  const rest = path.slice(SIDEBAR_HTML_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) return null;
  try {
    const sessionId = decodeURIComponent(rest.slice(0, slash));
    return sessionId === '' ? null : sessionId;
  } catch {
    return null;
  }
}

/**
 * Tracy's own plugin doors that answer about ONE session named in the JSON body (R9):
 * `tracy-site-tools` `/held` (TCH #517). dsh session ids are sequential, so unchecked a seat could
 * ask about every other conversation on the site. Trailing slashes match: the plugin strips them.
 */
const TRACY_SESSION_API_RE = /^\/api\/tracy-site-tools\/held\/*$/;

/**
 * dsh's web app manifest at the mount root (R11, TCH #519). Browsers fetch it without cookies
 * (dsh's `<link rel="manifest">` has no `crossorigin="use-credentials"`), so behind the sign-in
 * door it could only get the login redirect. Static build output, identical for every viewer.
 * Upstream answers 204 to it (`ANONYMOUS_STATIC_PROBES`, not exported); Tracy forwards it.
 */
const PUBLIC_MANIFEST_PATH = '/manifest.webmanifest';
const PUBLIC: SeatRoute = Object.freeze({ kind: 'public' });

/**
 * dsh's own file door, `GET`/`HEAD /api/file?path=<absolute path>` (R10). dsh serves ANY file its
 * process can read ("Paths and MIME types do not restrict access"); measured 02/10, a boxed seat
 * read `/desk-home/dsh-passwords.env` through it. Trailing slashes match too.
 */
const DSH_FILE_DOOR_RE = /^\/api\/file\/*$/;
const SEAT_FILE: SeatRoute = Object.freeze({ kind: 'seat-file' });

/** The one non-empty value of `key`, or null when it is missing, empty or repeated. */
function singleQueryValue(query: URLSearchParams, key: string): string | null {
  const values = query.getAll(key);
  return values.length === 1 && values[0] !== '' ? values[0]! : null;
}

/** The file door's target: the one `path` query value, or null when missing, empty or repeated. */
export function fileDoorTarget(query: URLSearchParams): string | null {
  return singleQueryValue(query, 'path');
}

const isAbsolutePath = (p: string): boolean => p.startsWith('/') || /^[a-z]:\//i.test(p);

/**
 * Whether a seat may read `target` through dsh's file door (R10): an absolute path, `..` folded,
 * inside the working folder of a session the seat holds. A root or relative folder opens nothing.
 * `resolved` is the same path with symlinks followed (the caller's I/O; null when it does not
 * exist yet); when given it must pass too, so a link planted in the workspace cannot point out.
 * @param target - the `path` query value (`fileDoorTarget`); null when missing or repeated.
 * @param sessionFolders - the working folders of the sessions the seat holds.
 * @param resolved - `target` with symlinks followed, or null.
 */
export function seatMayReadFile(target: string | null, sessionFolders: readonly string[], resolved: string | null = null): boolean {
  if (target === null || target.length === 0 || target.includes('\0')) return false;
  const roots = sessionFolders.map(normalizePath).filter((folder) => isAbsolutePath(folder) && folder !== '/');
  const inside = (candidate: string): boolean =>
    isAbsolutePath(normalizePath(candidate)) && roots.some((root) => pathWithin(candidate, root));
  return inside(target) && (resolved === null || inside(resolved));
}

const OWNER_ONLY: SeatRoute = Object.freeze({ kind: 'owner-only' });
const UNKNOWN: SeatRoute = Object.freeze({ kind: 'unknown' });
const isSidebarPath = (path: string): boolean => path === '/sidebar' || path.startsWith('/sidebar/');

/** The seat route table for one HTTP request (method upper-case, gate path normalized). */
export function classifySeatHttp(method: string, path: string): SeatRoute {
  if (!isSidebarPath(path)) {
    if (method === 'POST' && TRACY_SESSION_API_RE.test(path)) return READ;
    if ((method === 'GET' || method === 'HEAD') && DSH_FILE_DOOR_RE.test(path)) return SEAT_FILE;
    if ((method === 'GET' || method === 'HEAD') && path === PUBLIC_MANIFEST_PATH) return PUBLIC;
    return UNKNOWN;
  }
  if (method === 'POST') {
    const route = SIDEBAR_API_RE.exec(path)?.[1];
    const entry = route === undefined ? undefined : SEAT_SIDEBAR_API.get(route);
    if (entry !== undefined) return entry;
    if (path === '/sidebar/upload') return seatRoute('query', true);
  }
  if (method === 'GET' || method === 'HEAD') {
    if (path === '/sidebar/file' || path === '/sidebar/archive') return QUERY_READ;
    if (sidebarHtmlSessionOf(path) !== null) return PATH_READ;
    if (SIDEBAR_CHUNK_RE.test(path)) return NO_SESSION;
  }
  return OWNER_ONLY;
}

/**
 * better-sidebar WebSockets a seat may open (R6), both session-scoped pushes that name the session
 * once in the upgrade query and are piped through unread: `fs-watch` (the Files tab's live
 * refresh, every watch path fenced to the session's cwd) and `agent-opens` (host → browser, one
 * queue per session). Exactly these paths: `terminal` and `agent-terminals` stay owner-only.
 */
const SEAT_SIDEBAR_WS_PATHS: ReadonlySet<string> = new Set(['/sidebar/ws/fs-watch', '/sidebar/ws/agent-opens']);

/** The seat route table for one WebSocket upgrade (gate path normalized, query removed). */
export function classifySeatWs(path: string): SeatRoute {
  if (!isSidebarPath(path)) return UNKNOWN;
  return SEAT_SIDEBAR_WS_PATHS.has(path) ? QUERY_READ : OWNER_ONLY;
}

/** What the gateway already holds about a request when it asks which session a seat route names. */
export interface SeatRouteInput {
  /** Gate path, as given to `classifySeatHttp` / `classifySeatWs`. */
  path: string;
  query: URLSearchParams;
  /** The parsed JSON body, for the `body` and `rootSessionId` sources. */
  body?: unknown;
}

/**
 * The one session a seat route names, read where its table row says (`sessionFrom`), or null
 * when it names none, names it twice, or names it in a shape dsh would not read. Null must be
 * refused: the caller then checks that the seat holds the returned session.
 */
export function seatRouteSessionOf(from: Exclude<SessionSource, 'none'>, input: SeatRouteInput): string | null {
  if (from === 'path') return sidebarHtmlSessionOf(input.path);
  if (from === 'query') return singleQueryValue(input.query, 'sessionId');
  return bodySessionOf(from, input.body);
}

/** The session a JSON body names at the top level: `sessionId`, or `rootSessionId` for R4. */
function bodySessionOf(from: 'body' | 'rootSessionId', body: unknown): string | null {
  const value = isRecord(body) ? body[from === 'body' ? 'sessionId' : 'rootSessionId'] : undefined;
  return typeof value === 'string' && value !== '' ? value : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A seat route whose session the H2 body check reads: one whose session rides in the JSON body. */
const bodyChecked = (route: SeatRoute): route is { kind: 'seat-route'; sessionFrom: 'body' | 'rootSessionId'; write: boolean } =>
  route.kind === 'seat-route' && (route.sessionFrom === 'body' || route.sessionFrom === 'rootSessionId');

/**
 * A plugin route outside `/sidebar` that the seat UI calls, with the reason a seat needs it (R12).
 * `path` is exact, or a pattern over the whole gate path (already decoded and normalized, so no
 * `.`/`..` segment survives to match). Each row is a call the seat UI makes, measured on a seat
 * page or read from the plugin's client code (TRACY-FORK.md R12); the plugin itself still answers
 * who may do what. A route that is not here, not in the seat table,
 * and not one of dsh's own surfaces is refused to every seat before dsh hears of it.
 */
export interface SeatPluginRoute {
  methods: readonly string[];
  path: string | RegExp;
  reason: string;
}

const SEGMENT = '[A-Za-z0-9_.:@~-]+';
const SITE_BUILD = '/api/tracy-site-build-(?:wordpress|joomla|emdash)';
const INSPIRATION = '/api/tracy-design-inspiration';
const BRANDS = '/api/tracy-brand-engine';
const wholePath = (source: string): RegExp => new RegExp(`^${source}$`);

export const SEAT_PLUGIN_ROUTES: readonly SeatPluginRoute[] = Object.freeze([
  // @tracy/dsh-site-tools (`/held` is a seat-table row, R9; `/apply`, `/design` answer loopback only)
  { methods: ['POST'], path: '/api/tracy-site-tools/hello', reason: 'viewer handshake on every page load' },
  { methods: ['POST'], path: '/api/tracy-site-tools/view', reason: 'the page open in the Browser tab, told to the agent' },
  // @tracy/dsh-site-tabs
  { methods: ['POST'], path: '/api/tracy-site-tabs/hello', reason: 'site tabs ping on every page load' },
  { methods: ['POST'], path: '/api/tracy-site-tabs/turn', reason: 'the side card asks how a chat turn ended' },
  // @tracy/dsh-add-site (the plugin itself asks for the session cookie)
  { methods: ['POST'], path: wholePath('/api/tracy-add-site/(?:extension|credentials|detect|start|status)'), reason: 'the Add site card: platform login help, admin credentials, CMS guess, import run and its status' },
  { methods: ['POST'], path: '/api/tracy-add-site/hold', reason: 'tracy-web, not the seat UI: hold, release or forget a site whose unfinished import is being removed; signed with the seat secret, and the plugin refuses an unsigned call' },
  // @tracy/dsh-site-build-* (one host in tracy-site-build-core; every call names its session in the query, Q3)
  { methods: ['POST'], path: wholePath(`${SITE_BUILD}/(?:start|answers|rerun|comment|inspect|provision)`), reason: 'building a site: start, form answers, rerun a stage, comment, inspect, provision' },
  { methods: ['GET', 'HEAD'], path: wholePath(`${SITE_BUILD}/(?:job|ask|workspace|home\\.png)`), reason: 'building a site: job status, pending form, admin view, homepage screenshot' },
  // @tracy/dsh-design-inspiration (its client does not call `template/<id>/<file>`)
  { methods: ['GET', 'HEAD'], path: wholePath(`${INSPIRATION}/(?:catalog|site)`), reason: 'the Design inspirations tab: catalog and the current site\'s design' },
  { methods: ['POST'], path: `${INSPIRATION}/choose`, reason: 'pick a design' },
  { methods: ['GET', 'HEAD'], path: wholePath(`${INSPIRATION}/copy/${SEGMENT}(?:/jobs/${SEGMENT})?`), reason: 'generated copy and its job status' },
  { methods: ['POST'], path: wholePath(`${INSPIRATION}/copy/${SEGMENT}/pages/${SEGMENT}/versions`), reason: 'a new version of a copy chip' },
  { methods: ['DELETE'], path: wholePath(`${INSPIRATION}/copy/${SEGMENT}/pages/${SEGMENT}/versions/${SEGMENT}`), reason: 'delete a version of a copy chip' },
  { methods: ['PUT'], path: wholePath(`${INSPIRATION}/copy/${SEGMENT}/pages/${SEGMENT}/selected`), reason: 'select a version of a copy chip' },
  { methods: ['GET', 'HEAD'], path: wholePath(`${INSPIRATION}/systems/${SEGMENT}(?:/${SEGMENT})+`), reason: 'design system files and artifact slots' },
  // @tracy/dsh-brand-engine (reads `x-dsh-allowed-folders`, S12)
  { methods: ['POST'], path: wholePath(`${BRANDS}/(?:extract|start-from)`), reason: 'start a brand extraction, or start from a brand' },
  { methods: ['GET', 'HEAD'], path: wholePath(`${BRANDS}/(?:jobs|brands|extract/${SEGMENT})`), reason: 'brand jobs, brands, one extraction\'s status' },
  { methods: ['GET', 'HEAD'], path: wholePath(`${BRANDS}/brands/${SEGMENT}/(?:logos|imagery)/${SEGMENT}`), reason: 'brand logos and imagery' },
  { methods: ['DELETE'], path: wholePath(`${BRANDS}/brands/${SEGMENT}`), reason: 'delete a brand' },
  // @goodandready/dsh-subscriptions, asked at the root (tracy-web forwards it to the site's dsh).
  // Only the read the composer polls: every other route manages the HOST's model subscription
  // (sign-in, tokens, import/export, reset) behind a same-origin check only, never a seat's to call.
  { methods: ['GET', 'HEAD'], path: wholePath('/dsh-subscriptions/(?:status|config)'), reason: 'usage pill and composer quota slots' },
]);

/**
 * dsh RPCs the dsh client of every seat calls on each page load, closed to subusers by upstream
 * 2.7.7 on purpose (`SUBUSER_BLOCKED_API_NAMESPACES` / `_ENDPOINTS`), each answered at the gate
 * with the empty value dsh gives a caller that may do nothing. A seat runs no host plugin and opens
 * no host path; a 403 here is printed by the dsh client as an error on every page load.
 */
const SEAT_EMPTY_RPC_ANSWERS: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  // dsh-client-ui-cordis lists host-run plugins: a seat runs none.
  ['dynamicCordisRunner/inventory', Object.freeze([])],
  // dsh-cordis-client-runner mirrors its inspect providers to the host: nothing is kept for a seat.
  ['dynamicCordisRunner/syncInspectManifest', null],
  // Whether this host can open a workspace path in a desktop app: never for a seat.
  ['session/canOpenWorkspacePath', false],
]);
const API_RPC_RE = /^\/api\/([A-Za-z][A-Za-z0-9_-]*)[./]([A-Za-z][A-Za-z0-9_.-]*)$/;

/** The empty local answer for a closed dsh RPC (`POST /api/<ns>/<method>`), or null. */
export function seatEmptyRpcAnswer(method: string, path: string): { method: string; value: unknown } | null {
  if (method !== 'POST') return null;
  const match = API_RPC_RE.exec(path);
  if (match === null) return null;
  const rpc = `${match[1]!}/${match[2]!}`;
  return SEAT_EMPTY_RPC_ANSWERS.has(rpc) ? { method: rpc, value: SEAT_EMPTY_RPC_ANSWERS.get(rpc) } : null;
}

/** dsh's SPA deep link to one conversation, `/s/<sessionId>` (dsh serves `/` and `/s/<id>`). */
const SPA_SESSION_PATH_RE = /^\/s\/[A-Za-z0-9_-]+\/?$/;
/** dsh's own routes take these methods only: RPC is POST, file/event/export doors are GET. */
const DSH_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'POST']);
const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

const pluginRouteMatches = (route: SeatPluginRoute, method: string, path: string): boolean =>
  route.methods.includes(method) && (typeof route.path === 'string' ? route.path === path : route.path.test(path));

/**
 * R12: whether a seat's request outside `/sidebar` may go on to dsh at all (method upper-case, gate
 * path normalized). Yes for: a row of the seat table (the proxy finishes it); the gateway's own
 * `/api/dsh-passwords/*`; dsh's own RPC namespaces (`isOfficialApiPath`, GET/HEAD/POST — upstream
 * checks each object); dsh's shell and static files (`isOfficialRootPath`, `/s/<id>`, GET/HEAD); a
 * `SEAT_PLUGIN_ROUTES` row. Nothing else, whatever upstream's runtime manifest says: that manifest
 * marks every route a loaded plugin registers "official", including routes no seat UI calls.
 */
export function seatMayReach(method: string, path: string): boolean {
  if (classifySeatHttp(method, path).kind !== 'unknown') return true;
  if (path === '/api/dsh-passwords' || path.startsWith('/api/dsh-passwords/')) return true;
  if (path.startsWith('/api/')) {
    if (isOfficialApiPath(path) && DSH_METHODS.has(method)) return true;
  } else if (READ_METHODS.has(method) && (isOfficialRootPath(path) || SPA_SESSION_PATH_RE.test(path))) {
    return true;
  }
  return SEAT_PLUGIN_ROUTES.some((route) => pluginRouteMatches(route, method, path));
}

/**
 * H1 for a seat, at the gateway's authorization gate: every `/sidebar` request outside the route
 * table is refused there (R5), and so is every other request `seatMayReach` does not name (R12);
 * a closed dsh RPC the seat's client always calls is answered empty there (`seatEmptyRpcAnswer`).
 * A table route goes on to the proxy, which finishes the decision with what only it holds — the
 * query, `allow_upload`, the session folders, the body (`request-path.ts`) — before the upstream
 * request exists.
 */
export function decideSeatHttp(ctx: SeatHttpContext): HttpVerdict {
  if (!isSidebarPath(ctx.path)) {
    const empty = seatEmptyRpcAnswer(ctx.method, ctx.path);
    if (empty !== null) return { kind: 'answer-rpc', ...empty };
    return seatMayReach(ctx.method, ctx.path)
      ? { kind: 'pass' }
      : { kind: 'deny', status: 403, reason: 'This route is not available to this seat' };
  }
  if (classifySeatHttp(ctx.method, ctx.path).kind !== 'seat-route') {
    return { kind: 'deny', status: 403, reason: 'This sidebar route is only available to the owner' };
  }
  return { kind: 'pass' };
}

/** Every session reference anywhere in a JSON value; a too-deep value yields an unholdable null. */
function sessionRefsIn(value: unknown, out: unknown[], depth: number): void {
  if (depth > MAX_DEPTH) { out.push(null); return; }
  if (Array.isArray(value)) { for (const item of value) sessionRefsIn(item, out, depth + 1); return; }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (SIDEBAR_BODY_SESSION_KEYS.has(key)) out.push(item);
    else sessionRefsIn(item, out, depth + 1);
  }
}

/** H2: the parsed JSON body of a seat sidebar route, before any byte is forwarded. */
export interface SeatBodyContext {
  route: string;
  body: unknown;
  /** Upstream's grant check: the session is in the seat's snapshot, granted, enabled and inside its folders. */
  holdsSession: (sessionId: unknown) => boolean;
}

/**
 * H2 for a seat route: the route's own key names a session at the top level, and every session
 * the body names is held by the seat, so a foreign id cannot ride along: `sessionId` /
 * `rootSessionId` at any depth, plus upstream's `collectSessionIds` (`agentId`, parent/child
 * subagent ids, the ClientConnection envelope), which the 2.6.6 fork applied to these bodies too.
 */
export function checkSeatBody(ctx: SeatBodyContext): PolicyVerdict {
  const route = SEAT_SIDEBAR_API.get(ctx.route);
  const denied: PolicyVerdict = { kind: 'deny', status: 403, reason: 'The request names a session this seat does not hold' };
  if (route === undefined || !bodyChecked(route) || bodySessionOf(route.sessionFrom, ctx.body) === null) return denied;
  const refs: unknown[] = [...collectSessionIds(ctx.body)];
  sessionRefsIn(ctx.body, refs, 0);
  return refs.every((ref) => ctx.holdsSession(ref)) ? { kind: 'pass' } : denied;
}
