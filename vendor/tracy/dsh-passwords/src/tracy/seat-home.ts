// A seat's own workspace on a lane that mounts no site — Tracy's onboarding lane.
//
// WHY THE DOOR CREATES ANYTHING AT ALL. Every other grant names folders that exist because a
// site was mounted there; the door only writes the whitelist. The onboarding lane has no site,
// so until 04/09 it granted one shared scratch directory to everyone, and the session list is
// filtered BY FOLDER (gateway.ts, session.list) — so a person signing in for the first time saw
// the conversations of whoever came before. Filtering by owner instead would be a second
// permission model beside the folder whitelist, and two models drift. The folder stays the
// authority; it just has to be a folder that belongs to one person.
//
// WHY dsh HAS TO BE TOLD. A `guest` seat cannot `workspace/create` (permissionsFor), and the
// directory picker only lists folders — a directory nobody registered is a directory the person
// cannot start a session in. So the door registers it, as the master would have.
//
// WHY THE TITLE IS THE EMAIL. dsh names a new workspace after its directory, and the directory is
// named after the account — a hash. Titles are unique across the whole registry (`rename` refuses
// a duplicate), so every personal workspace cannot be called "Getting started"; the person's own
// address is unique by construction and only they can see it.
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * One dsh RPC on the `/api` channel, answered in the connection envelope's `result`.
 *
 * `args` carries one field per parameter of the Remote method, named as the method's parameter
 * (typert reads the names from the JavaScript signature), and dsh refuses any other field set with
 * `gateway/arguments-invalid`. Most take one `request` object: dsh 0.1.2-alpha.3 answers
 * `missing "request"; unexpected "path"` to a bare `{ path }` (measured on the onboarding lane,
 * 04/09). Not all: `session/list` names it `_request` (#591, measured on dev 29/09), and
 * `subagents/interruptByParent` takes three plain fields. The shape of every endpoint below, with
 * the method it comes from: `test/dsh-rpc-fake.ts`.
 */
export type WorkspaceRpc = (
  endpoint:
    | 'workspace/create'
    | 'workspace/rename'
    | 'workspace/archiveSession'
    | 'workspace/delete'
    | 'session/create'
    | 'session/cancel'
    | 'session/list'
    | 'subagents/interruptByParent',
  args: Record<string, unknown>,
) => Promise<{ ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }>;

export interface PersonalWorkspaceInput {
  /** The lane directory personal folders live under. Must already exist: it is the operator's. */
  root: string;
  /** The seat's account name (`seatUsername`) — the one name that is stable across logins. */
  username: string;
  /** What the person sees the workspace called. */
  title: string;
}

/**
 * Where one seat's personal workspace lives: the account name directly under the root.
 * @param root - the lane's personal-workspace root.
 * @param username - the seat's account name.
 * @returns an absolute path inside `root`.
 */
export function personalWorkspacePath(root: string, username: string): string {
  return path.join(root, username);
}

/**
 * Make sure a seat's personal workspace exists on disk and in dsh's registry.
 *
 * Idempotent: a second call finds the directory and dsh answers `created: false`, so the title
 * is set exactly once. A missing root or a refusal from dsh throws — the caller must not mint a
 * seat whose only folder cannot be opened.
 * @param input - root, account name, and title.
 * @param rpc - how to reach dsh.
 * @returns the path, whether dsh created the workspace now, and whether the title took.
 */
export async function ensurePersonalWorkspace(
  input: PersonalWorkspaceInput,
  rpc: WorkspaceRpc,
): Promise<{ path: string; workspaceId: string; created: boolean; titled: boolean }> {
  let rootIsDirectory = false;
  try {
    rootIsDirectory = statSync(input.root).isDirectory();
  } catch {
    rootIsDirectory = false;
  }
  if (!rootIsDirectory) {
    throw new Error(`home root is not a directory on this lane: ${input.root}`);
  }
  const personal = personalWorkspacePath(input.root, input.username);
  mkdirSync(personal, { recursive: true });

  const created = await rpc('workspace/create', { request: { path: personal } });
  if (!created.ok) {
    throw new Error(`dsh refused the personal workspace (${created.error.code}): ${created.error.message}`);
  }
  const value = created.value as { workspace?: { workspaceId?: unknown }; created?: unknown };
  const isNew = value.created === true;
  const workspaceId = value.workspace?.workspaceId;
  if (typeof workspaceId !== 'string' || workspaceId === '') throw new Error('personal workspace has no identity');
  let titled = false;
  if (isNew && typeof workspaceId === 'string') {
    const renamed = await rpc('workspace/rename', { request: { workspaceId, title: input.title } });
    titled = renamed.ok;
    if (!renamed.ok) {
      // The workspace works under its default name; only the label is worse. Say so.
      console.warn(`[dsh-passwords] personal workspace ${personal} keeps its default title: ${renamed.error.code}`);
    }
  }
  return { path: personal, workspaceId, created: isNew, titled };
}

/**
 * dsh refused to register a site folder, with dsh's own code kept apart from its message so the
 * caller can tell "the folder is not there yet" from every other refusal.
 */
export class SiteWorkspaceRefusal extends Error {
  readonly code: string;
  /** dsh's own message, unprefixed. */
  readonly detail: string;
  /** The folder that was asked for, when known: dsh quotes it inside `detail`. */
  readonly folder: string | null;
  constructor(code: string, message: string, folder: string | null = null) {
    super(`dsh refused the site workspace (${code}): ${message}`);
    this.name = 'SiteWorkspaceRefusal';
    this.code = code;
    this.detail = message;
    this.folder = folder;
  }
}

/** The chain stopped on purpose (gateway closing, seat no longer holding the folder). */
class SiteWorkspaceCancelled extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SiteWorkspaceCancelled';
  }
}

/**
 * The errno a `workspace/invalid-path` refusal carries, read from where dsh puts it and nowhere else.
 *
 * dsh words the refusal `cannot create a Workspace at "<path>": <cause>` (workspace-controller
 * `commands.ts`), and the cause is Node's own `ENOENT: no such file or directory, realpath '<path>'`.
 * The path appears twice and is chosen by whoever named the site, so searching the whole message
 * would read `/site/ENOENT-demo` refused with EACCES as a missing folder. The prefix is stripped
 * with the exact folder asked for, and only the cause's leading token counts.
 * @param refusal - the refusal.
 * @returns the errno (`ENOENT`, `EACCES`, …), or null when the cause does not start with one.
 */
function refusalErrno(refusal: SiteWorkspaceRefusal): string | null {
  let cause = refusal.detail;
  if (refusal.folder !== null) {
    const prefix = `cannot create a Workspace at "${refusal.folder}": `;
    if (cause.startsWith(prefix)) cause = cause.slice(prefix.length);
  }
  return /^([A-Z][A-Z0-9_]*):\s/.exec(cause)?.[1] ?? null;
}

/**
 * Whether a registration failure means the folder does not exist YET — the one refusal a retry
 * can fix (TCH #557: the seat was granted 0.5 s before the fleet created `/site/<label>`).
 *
 * `workspace/invalid-path` alone is not enough: dsh answers it for a folder it may not read and for
 * a path that is a file too, and retrying those only repeats the same answer. dsh passes the
 * realpath error through as the cause, so its errno ENOENT is the witness (`refusalErrno`).
 * @param error - what `ensureSiteWorkspace` threw.
 * @returns true only for a missing folder.
 */
export function isMissingFolderRefusal(error: unknown): boolean {
  return error instanceof SiteWorkspaceRefusal && error.code === 'workspace/invalid-path' && refusalErrno(error) === 'ENOENT';
}

/**
 * The one rename refusal that is final: titles are registry-unique in dsh, and the title is taken
 * (`WorkspaceCommands.rename` in deepseek-harness packages/api/workspace-controller/src/commands.ts).
 */
const SITE_TITLE_TAKEN = 'workspace/name-conflict';

/** How many renames one registration may send while callers keep bringing a newer title. */
const SITE_WORKSPACE_MAX_RENAMES = 3;

/**
 * Make sure a site's folder is a dsh workspace named after the site (15/09/2026: one workspace, one
 * site). `workspace/create` is idempotent; the rename runs only while the title differs, and a title
 * dsh refuses (titles are registry-unique) leaves the workspace under its folder name.
 *
 * dsh's `workspace/create` takes a path and nothing else, and registers the workspace under the
 * folder's name; the title can only follow in a second call. So there is always a moment in which
 * dsh lists the workspace under its folder name, and a page following the registry sees both
 * versions in turn. The rename is therefore sent the moment create answers, with no other work in
 * between, on every attempt alike.
 * @param folder - the site folder as dsh sees it (`/site/<label>`).
 * @param title - what the sidebar shows: the site key; null registers without renaming (a caller
 *   that does not know the site key must not invent a title). A function is read AFTER create
 *   answers, and again after each rename, so a site key that arrives while an RPC is in flight is
 *   still the one the workspace ends up with.
 * @param rpc - how to reach dsh.
 * @param proceed - asked after create and after each rename; false stops before the next step.
 * @returns the workspace id, the title the answer is about (the one last asked for, null when none
 *   was known), whether the workspace now carries it, and `titleRefused` when dsh refused THAT title
 *   for good (another workspace holds it). A failed rename whose title was replaced while it was in
 *   flight says nothing about the new one, so the new one is asked for instead of reported.
 * @throws SiteWorkspaceRefusal when dsh refuses the folder, Error when its answer is unusable — the
 *   caller decides whether that blocks the seat.
 */
export async function ensureSiteWorkspace(
  folder: string,
  title: string | null | (() => string | null),
  rpc: WorkspaceRpc,
  proceed: () => boolean = () => true,
): Promise<{ workspaceId: string; title: string | null; titled: boolean; titleRefused?: true }> {
  const titleNow = typeof title === 'function' ? title : () => title;
  // dsh's workspace/create takes only a path (WorkspaceCreateRequest in deepseek-harness
  // packages/api/workspace-controller/src/types.ts), so the workspace is published under its
  // folder's basename; the rename right after create applies the site key.
  const found = await rpc('workspace/create', { request: { path: folder } });
  if (!found.ok) {
    throw new SiteWorkspaceRefusal(found.error.code, found.error.message, folder);
  }
  const view = (found.value as { workspace?: { workspaceId?: unknown; title?: unknown } } | null)?.workspace;
  const workspaceId = view?.workspaceId;
  if (typeof workspaceId !== 'string' || workspaceId === '') {
    throw new Error(`dsh answered workspace/create for ${folder} without a workspace id`);
  }
  let current = typeof view?.title === 'string' ? view.title : null;
  for (let renames = 0; ; renames += 1) {
    if (!proceed()) throw new SiteWorkspaceCancelled(`site workspace ${folder} registered, then stopped before its title`);
    const wanted = titleNow();
    if (wanted === null) return { workspaceId, title: null, titled: false };
    if (current === wanted) return { workspaceId, title: wanted, titled: true };
    if (renames >= SITE_WORKSPACE_MAX_RENAMES) return { workspaceId, title: wanted, titled: false };
    const renamed = await rpc('workspace/rename', { request: { workspaceId, title: wanted } });
    if (!renamed.ok) {
      console.warn(`[dsh-passwords] site workspace ${folder} keeps its default title: ${renamed.error.code}`);
      // A newer site key arrived while this rename was in flight: the failure is about the old
      // title only, so the new one is asked for (within the rename bound) rather than reported.
      if (titleNow() !== wanted) continue;
      // Only a title another workspace already holds is dsh's final word on it; transport errors,
      // HTTP failures and a spent budget may pass, so the caller may ask again later.
      if (renamed.error.code === SITE_TITLE_TAKEN) return { workspaceId, title: wanted, titled: false, titleRefused: true };
      return { workspaceId, title: wanted, titled: false };
    }
    const row = (renamed.value as { workspace?: { workspaceId?: unknown; title?: unknown } } | null)?.workspace;
    if (row?.workspaceId !== workspaceId || typeof row.title !== 'string') {
      console.warn(`[dsh-passwords] site workspace ${folder}: dsh answered workspace/rename without the workspace it renamed`);
      if (titleNow() !== wanted) continue;
      return { workspaceId, title: wanted, titled: false };
    }
    current = row.title;
  }
}

/** How one background registration of a site folder ended. */
export type SiteWorkspaceOutcome =
  | { status: 'registered'; workspaceId: string; title: string | null; titled: boolean; titleRefused?: true; attempts: number }
  | { status: 'failed'; reason: string; attempts: number }
  | { status: 'cancelled'; attempts: number };

export interface SiteWorkspaceRegistrar {
  /**
   * Register `folder` in the background. Never rejects. A second call for a folder already in
   * flight joins it instead of starting another chain.
   * @param folder - the site folder, as dsh sees it.
   * @param title - the site key when the caller knows it; null registers without renaming. A null
   *   from a joining caller never erases a site key the chain already has.
   * @param stillGranted - asked before every attempt's next step (after create, before the title,
   *   before a retry): false (seat revoked, banned, folder taken away) ends the chain, so a late
   *   answer never works on behalf of someone who lost the site.
   */
  register(folder: string, title: string | null, stillGranted: () => boolean): Promise<SiteWorkspaceOutcome>;
  /** Folders with a chain in flight. */
  inFlight(): number;
  /** Stop every chain: pending timers are cleared, RPCs in flight are no longer waited for, and their callers get `cancelled`. */
  close(): void;
}

/** 250 ms, 500 ms, 1 s, 2 s: five attempts in under 4 s — the measured gap was 509 ms. */
export const SITE_WORKSPACE_RETRY_DELAYS_MS: readonly number[] = [250, 500, 1000, 2000];
/** No chain outlives this, however slow dsh answers: an RPC still pending at the budget is abandoned. */
export const SITE_WORKSPACE_RETRY_BUDGET_MS = 10_000;

/**
 * Registration of site folders that may not exist yet (TCH #557).
 *
 * WHY BOTH A SHORT RETRY AND A LATER VISIT. The seat door is called while the fleet is still
 * creating the site, so the first `workspace/create` can land before `/site/<label>` exists (measured
 * on dev 29/09: refused at 00:16:02.741, folder born 00:16:03.250). A few retries over a few seconds
 * cover that race without anyone noticing. They stop on a budget, never spin, and retry ONLY a
 * missing folder; every other refusal is logged once, as before. A folder that appears later still,
 * or a site whose seat was granted by an older build, is healed by the gateway on that seat's next
 * visit (it calls `register` again when the workspace list lacks a granted folder) — so nothing has
 * to wait in the background for a folder that may never come.
 *
 * A workspace dsh registered before the chain stopped stays registered: registration grants nothing
 * (the seat's folder whitelist does), so stopping only skips the title and the success report.
 * @param options - how to reach dsh; delays, budget and clock are injectable for tests.
 * @returns the registrar.
 */
export function createSiteWorkspaceRegistrar(options: {
  rpc: WorkspaceRpc;
  delaysMs?: readonly number[];
  budgetMs?: number;
  now?: () => number;
  log?: (line: string) => void;
  warn?: (line: string) => void;
}): SiteWorkspaceRegistrar {
  const delays = options.delaysMs ?? SITE_WORKSPACE_RETRY_DELAYS_MS;
  const budget = options.budgetMs ?? SITE_WORKSPACE_RETRY_BUDGET_MS;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.log(line));
  const warn = options.warn ?? ((line: string) => console.warn(line));
  interface Chain {
    title: string | null;
    checks: Array<() => boolean>;
    timer: NodeJS.Timeout | null;
    wake: (() => void) | null;
    promise: Promise<SiteWorkspaceOutcome>;
  }
  const chains = new Map<string, Chain>();
  let closed = false;
  // One entry per RPC in flight, removed when that RPC ends. Not one shared "closing" promise: a
  // reaction on it per call outlives the call, and through Promise.race it keeps every finished
  // answer reachable until the gateway closes (TCH #647).
  const cancels = new Set<() => void>();

  /**
   * One RPC that gives up at the chain's budget or when the registrar closes. The abandoned
   * request keeps its own handlers (Promise.race subscribes to it), so a late answer or rejection
   * lands nowhere and is never reported as this chain's result. A finished call leaves nothing
   * behind: its timer is cleared and its cancel entry removed.
   */
  const boundedRpc = (deadline: number): WorkspaceRpc => async (endpoint, args) => {
    const remaining = deadline - now();
    if (remaining <= 0) return { ok: false, error: { code: 'budget', message: `no time left in the retry budget for ${endpoint}` } };
    let timer: NodeJS.Timeout | null = null;
    const expired = new Promise<{ ok: false; error: { code: string; message: string } }>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: { code: 'budget', message: `dsh did not answer ${endpoint} within the retry budget` } }), remaining);
      timer.unref();
    });
    let cancel: () => void = () => {};
    const stopped = new Promise<{ ok: false; error: { code: string; message: string } }>((resolve) => {
      cancel = () => resolve({ ok: false, error: { code: 'cancelled', message: 'the gateway is closing' } });
    });
    cancels.add(cancel);
    if (closed) cancel();
    try {
      return await Promise.race([options.rpc(endpoint, args), expired, stopped]);
    } finally {
      if (timer !== null) clearTimeout(timer);
      cancels.delete(cancel);
    }
  };

  const run = async (folder: string, chain: Chain): Promise<SiteWorkspaceOutcome> => {
    const started = now();
    const rpc = boundedRpc(started + budget);
    const granted = (): boolean => !closed && chain.checks.some((check) => check());
    let attempts = 0;
    for (;;) {
      if (closed) return { status: 'cancelled', attempts };
      attempts += 1;
      let error: unknown;
      try {
        const done = await ensureSiteWorkspace(folder, () => chain.title, rpc, granted);
        if (!granted()) throw new SiteWorkspaceCancelled(`site workspace ${folder} registered after the seat stopped holding it`);
        if (attempts > 1) log(`[dsh-passwords] site workspace ${folder} registered after ${attempts} attempts`);
        const refused = done.titleRefused === true ? { titleRefused: true as const } : {};
        return { status: 'registered', workspaceId: done.workspaceId, title: done.title, titled: done.titled, ...refused, attempts };
      } catch (caught) {
        error = caught;
      }
      if (closed) return { status: 'cancelled', attempts };
      if (error instanceof SiteWorkspaceCancelled) {
        warn(`[dsh-passwords] site workspace ${folder} not reported: the seat no longer holds it`);
        return { status: 'cancelled', attempts };
      }
      const reason = error instanceof Error ? error.message : String(error);
      const delay = delays[attempts - 1];
      if (!isMissingFolderRefusal(error) || delay === undefined || now() + delay - started > budget) {
        const tail = isMissingFolderRefusal(error) ? ` (still missing after ${attempts} attempts; the next visit retries)` : '';
        warn(`[dsh-passwords] site workspace ${folder} not registered: ${reason}${tail}`);
        return { status: 'failed', reason, attempts };
      }
      await new Promise<void>((resolve) => {
        chain.wake = resolve;
        chain.timer = setTimeout(resolve, delay);
        chain.timer.unref();
      });
      chain.timer = null;
      chain.wake = null;
      if (closed) return { status: 'cancelled', attempts };
      if (!granted()) {
        warn(`[dsh-passwords] site workspace ${folder} not registered: the seat no longer holds it`);
        return { status: 'cancelled', attempts };
      }
    }
  };

  return {
    register(folder, title, stillGranted) {
      if (closed) return Promise.resolve({ status: 'cancelled', attempts: 0 });
      const running = chains.get(folder);
      if (running !== undefined) {
        if (title !== null) running.title = title;
        running.checks.push(stillGranted);
        return running.promise;
      }
      const chain: Chain = { title, checks: [stillGranted], timer: null, wake: null, promise: Promise.resolve({ status: 'cancelled', attempts: 0 }) };
      chains.set(folder, chain);
      chain.promise = run(folder, chain)
        .catch((error: unknown): SiteWorkspaceOutcome => {
          const reason = error instanceof Error ? error.message : String(error);
          warn(`[dsh-passwords] site workspace ${folder} not registered: ${reason}`);
          return { status: 'failed', reason, attempts: 0 };
        })
        .finally(() => {
          if (chains.get(folder) === chain) chains.delete(folder);
        });
      return chain.promise;
    },
    inFlight: () => chains.size,
    close() {
      closed = true;
      for (const cancel of [...cancels]) cancel();
      for (const chain of chains.values()) {
        if (chain.timer !== null) clearTimeout(chain.timer);
        chain.wake?.();
      }
    },
  };
}

/**
 * Make dsh forget a folder that is about to stop existing: every session accounted to it is
 * archived, then the workspace registration is removed.
 *
 * WHY ARCHIVE AND NOT DELETE. dsh has no verb that deletes a session — `workspace/delete` keeps
 * every session log on purpose, and its session index is keyed by the folder path. A site's
 * folder is named after its fleet label, and the label is derived from the domain, so a site
 * deleted and added again gets the SAME folder: the new workspace picked the old sessions straight
 * back up (measured 14/09 on `example-site-68d54982`). The archive set is registry-wide and
 * durable, so archived sessions stay out of every workspace list, including the one re-created
 * for the next site at that path.
 *
 * MUST RUN WHILE THE FOLDER STILL EXISTS. dsh resolves a workspace only through `workspace/create`,
 * which realpaths the path; once teardown has removed the directory dsh answers
 * `workspace/invalid-path` and there is nothing left to name the sessions by.
 *
 * A RUNNING TURN IS STOPPED, NOT A REASON TO KEEP THE SESSION (#561). Every archive asks dsh's own
 * `stopActivity`: the archive is written first, then the session's turn, subagents, background jobs
 * and schedules are cancelled the way archiving from the session list does (`workspace/archiveSession`,
 * `@deepseek-ai/dsh-agent` `archive-admission.ts`: `agent.cancel({ kind: 'user' })`, queued input
 * discarded; `@deepseek-ai/dsh-subagent` `archive-admission.ts`: every running subagent descendant
 * cancelled as its parent would). Without it dsh refused a live session as `workspace/session-active`:
 * measured 29/09 on dev, a deleted site's turn stayed waiting on its question, kept its session
 * folder in the live store and held the next deploy for 1200 s.
 *
 * dsh skips that stop for a session it had already archived and only logs a stop provider that
 * failed (`WorkspaceRegistry.stopSessionActivity`), so every session is also cancelled through the
 * Stop button's own door (`session/cancel`). Two refusals there mean there is nothing this door may
 * stop: `session/not-found` (no live agent owns the session) and `session/agent-busy` (a subagent's
 * session: subagent routing owns it, `session-controller` `commands.ts` `cancel`; it is stopped under
 * its parent by `settleSiteSessions`). Any other refusal fails the whole forget.
 *
 * 🔒 A STOP ASKED IS NOT A TURN ENDED. Nothing here waits for, or claims, the end of a turn: that is
 * proven where the session folder moves, over the sessions actually in it (`settleSiteSessions`,
 * asked by the `archive-sessions` door right before its rename), which also stops what this door
 * could not see or reach: a session opened after it, and a running subagent. A turn waiting on its
 * customer holds no lease (`deploy-hold.mjs`), so the lease rule alone would let the folder move
 * under it.
 *
 * Idempotent: a folder dsh did not know is registered by the lookup and removed again, and a
 * session already archived is not an error.
 * @param folder - the absolute folder path, as dsh sees it.
 * @param rpc - how to reach dsh.
 * @returns the sessions archived and whether the registration was removed.
 */
export async function forgetWorkspace(
  folder: string,
  rpc: WorkspaceRpc,
): Promise<{ archived: string[]; deleted: boolean }> {
  const found = await rpc('workspace/create', { request: { path: folder } });
  if (!found.ok) {
    throw new Error(`dsh could not resolve the workspace (${found.error.code}): ${found.error.message}`);
  }
  const view = (found.value as { workspace?: { workspaceId?: unknown; sessionIds?: unknown } } | null)?.workspace;
  const workspaceId = view?.workspaceId;
  if (typeof workspaceId !== 'string' || workspaceId === '') {
    throw new Error(`dsh answered workspace/create for ${folder} without a workspace id`);
  }
  // Required by dsh's `WorkspaceView`; a list that is missing or holds a non-id is not "no sessions".
  const listed = view?.sessionIds;
  if (!Array.isArray(listed) || !listed.every((id): id is string => typeof id === 'string' && id !== '')) {
    throw new Error(`dsh answered workspace/create for ${folder} without a usable session list`);
  }
  const sessionIds: string[] = listed;
  const archived: string[] = [];
  for (const sessionId of sessionIds) {
    const result = await rpc('workspace/archiveSession', { request: { sessionId, stopActivity: true } });
    // `session/not-found`: an accounted slot with no log behind it — nothing to hide.
    if (!result.ok && result.error.code !== 'session/not-found') {
      throw new Error(`dsh refused to archive ${sessionId} (${result.error.code}): ${result.error.message}`);
    }
    if (result.ok) archived.push(sessionId);
  }
  for (const sessionId of sessionIds) {
    const result = await rpc('session/cancel', { request: { sessionId } });
    if (!result.ok && !NOTHING_TO_CANCEL.has(result.error.code)) {
      throw new Error(`dsh refused to stop ${sessionId} (${result.error.code}): ${result.error.message}`);
    }
  }
  const removed = await rpc('workspace/delete', { request: { workspaceId } });
  if (!removed.ok && removed.error.code !== 'workspace/not-found') {
    throw new Error(`dsh refused to remove the workspace (${removed.error.code}): ${removed.error.message}`);
  }
  return { archived, deleted: removed.ok };
}

/** `session/cancel` refusals that leave this door nothing to stop (`forgetWorkspace` says why). */
const NOTHING_TO_CANCEL = new Set(['session/not-found', 'session/agent-busy']);

/**
 * Why `settleSiteSessions` could not settle a deleted site's sessions: `SESSIONS_UNREADABLE` when
 * dsh's session list could not be read, `SESSIONS_NOT_STOPPED` when dsh refused to archive or stop
 * one of them. Either way none of them can be called ended.
 */
export class SiteSessionsUnsettled extends Error {
  constructor(
    readonly reason: 'SESSIONS_UNREADABLE' | 'SESSIONS_NOT_STOPPED',
    message: string,
  ) {
    super(message);
    this.name = 'SiteSessionsUnsettled';
  }
}

interface ListedSession {
  sessionId: string;
  running: boolean;
  parent: string | null;
  subagent: boolean;
  cwd: string | null;
}

/** Every session dsh knows, read from `session/list`; throws on an answer it cannot read. */
async function listSessions(rpc: WorkspaceRpc): Promise<ListedSession[]> {
  const answer = await rpc('session/list', { _request: {} });
  if (!answer.ok) {
    throw new SiteSessionsUnsettled(
      'SESSIONS_UNREADABLE',
      `dsh could not list its sessions (${answer.error.code}): ${answer.error.message}`,
    );
  }
  const items = (answer.value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new SiteSessionsUnsettled('SESSIONS_UNREADABLE', 'dsh answered session/list without its items');
  const rows: ListedSession[] = [];
  for (const item of items as unknown[]) {
    const row = item as
      | { sessionId?: unknown; running?: unknown; parentSessionId?: unknown; origin?: unknown; cwd?: unknown }
      | null;
    if (
      typeof row?.sessionId !== 'string' ||
      row.sessionId === '' ||
      typeof row.running !== 'boolean' ||
      (row.parentSessionId !== undefined && (typeof row.parentSessionId !== 'string' || row.parentSessionId === '')) ||
      (row.origin !== undefined && row.origin !== 'subagent') ||
      (row.cwd !== undefined && typeof row.cwd !== 'string')
    ) {
      throw new SiteSessionsUnsettled('SESSIONS_UNREADABLE', 'dsh answered session/list with a row that is not a session');
    }
    rows.push({
      sessionId: row.sessionId,
      running: row.running,
      parent: row.parentSessionId ?? null,
      subagent: row.origin === 'subagent',
      cwd: row.cwd ?? null,
    });
  }
  return rows;
}

/**
 * The site's sessions among `rows`: the ids found on disk, any session whose `cwd` is the site's
 * path (one opened after the folder was read), and every session descending from either through
 * `parentSessionId` (a subagent working elsewhere), to a fixed point.
 */
function ownedSessions(rows: readonly ListedSession[], cwd: string, sessionIds: readonly string[]): Set<string> {
  const owned = new Set(sessionIds);
  for (const row of rows) if (row.cwd === cwd) owned.add(row.sessionId);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (row.parent !== null && owned.has(row.parent) && !owned.has(row.sessionId)) {
        owned.add(row.sessionId);
        grew = true;
      }
    }
  }
  return owned;
}

/**
 * Stop what still works in a deleted site's folder, and say what has not ended yet — asked by the
 * `archive-sessions` door right before its rename (#561), over the sessions found on disk.
 *
 * 1. `session/list`, then EVERY session of the site (`ownedSessions`) is archived with dsh's
 *    `stopActivity`, whether or not the forget saw it: a session opened after the forget read the
 *    folder is stopped here too. dsh's `ArchivedSessionGate` (`@deepseek-ai/dsh-session-controller`
 *    `archived-session-gate.ts`) then rejects every model step of an archived session and of its
 *    subagent descendants until it is restored — model steps only: a `session/create` or a
 *    `session/prompt` still reaches dsh, which is why the archive door asks this a second time, and
 *    renames, under the gateway's write fence (write-fence.ts), which refuses such a request sent
 *    meanwhile. An already archived session is a
 *    no-op there; `session/not-found` is a session dsh neither holds nor persisted.
 * 2. Every one of them the list shows running is stopped through the Stop button's own door: a
 *    subagent (`origin: 'subagent'`) through `subagents/interruptByParent` under its direct parent,
 *    as the chat's Stop does for a subagent address (`session-controller` client `session.ts`
 *    `cancel`), since `session/cancel` refuses it as `session/agent-busy` and an archived or idle
 *    parent's stop does not reach it; any other through `session/cancel` (`session/not-found`: no
 *    live Agent, so no turn to stop).
 * 3. `session/list` again. Not ended: a session of the site still running, one of the site that
 *    was not there at step 1 (never archived, so not fenced), and a session found on disk that dsh
 *    does not list (unproven is not ended).
 *
 * 🔒 THROWS `SiteSessionsUnsettled` on a list it cannot read, and on any archive or stop dsh refuses
 * for another reason: an unreadable list is not an idle one, and a refused stop is not a stop.
 * @param cwd - the site's path as dsh sees it, `/site/<label>`.
 * @param sessionIds - the sessions found in the site's session folder.
 * @param rpc - how to reach dsh.
 * @param seen - told every session of the site found at step 1 and step 3 (the write fence refuses
 *   a held request naming one, write-fence.ts).
 * @returns the site's sessions not proven ended; empty when every one is archived and idle.
 */
export async function settleSiteSessions(
  cwd: string,
  sessionIds: readonly string[],
  rpc: WorkspaceRpc,
  seen?: (owned: ReadonlySet<string>) => void,
): Promise<string[]> {
  const before = await listSessions(rpc);
  const owned = ownedSessions(before, cwd, sessionIds);
  seen?.(owned);
  for (const sessionId of owned) {
    const result = await rpc('workspace/archiveSession', { request: { sessionId, stopActivity: true } });
    if (!result.ok && result.error.code !== 'session/not-found') {
      throw new SiteSessionsUnsettled(
        'SESSIONS_NOT_STOPPED',
        `dsh refused to archive ${sessionId} (${result.error.code}): ${result.error.message}`,
      );
    }
  }
  for (const row of before) {
    if (!row.running || !owned.has(row.sessionId)) continue;
    const result =
      row.subagent && row.parent !== null
        ? await rpc('subagents/interruptByParent', {
            childSessionId: row.sessionId,
            parentSessionId: row.parent,
            mode: 'continuable',
          })
        : await rpc('session/cancel', { request: { sessionId: row.sessionId } });
    if (!result.ok && result.error.code !== 'session/not-found') {
      throw new SiteSessionsUnsettled(
        'SESSIONS_NOT_STOPPED',
        `dsh refused to stop ${row.sessionId} (${result.error.code}): ${result.error.message}`,
      );
    }
  }
  const after = await listSessions(rpc);
  const ownedNow = ownedSessions(after, cwd, sessionIds);
  seen?.(ownedNow);
  const listed = new Set(after.map((row) => row.sessionId));
  const pending = new Set<string>();
  for (const row of after) {
    if (ownedNow.has(row.sessionId) && (row.running || !owned.has(row.sessionId))) pending.add(row.sessionId);
  }
  for (const sessionId of sessionIds) if (!listed.has(sessionId)) pending.add(sessionId);
  return [...pending];
}
