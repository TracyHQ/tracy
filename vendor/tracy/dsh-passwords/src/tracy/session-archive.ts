// A deleted site's conversations leave dsh's live session store — moved, never deleted.
//
// WHY. dsh answers `session/list` by reading the header of EVERY session under
// `$DSH_HOME/sessions` at each page load, whoever asks (measured 28/09/2026, PR #495). Deleting a
// site removed its stack, folders, contract and job records, but not its session folder: on the
// local stand 1,190 of 1,202 sessions sat in the folders of 33 sites that no longer existed.
// `forget-workspace` (seat-home.ts) archives those sessions in dsh's registry, which hides them from
// every list but leaves every file on disk to be read again on the next page load.
//
// WHY A MOVE. The conversations are the customer's history, and the decision (28/09/2026) is to
// archive them, not destroy them. The whole folder goes in ONE rename(2) to
// `$DSH_HOME/sessions-archive/<label>-<UTC stamp>/`: atomic, on the same filesystem, nothing
// copied, nothing removed. Moving it back to `sessions/--site-<label>--` restores it. A rename that
// fails (another filesystem, a permission) fails whole and leaves the folder where it was.
//
// WHY THESE GUARDS. This runs inside the one dsh that serves every site on the host (ADR 0014), so
// a wrong folder is another customer's history. It acts on ONE label named by the caller, never a
// glob, and refuses, with a reason, whenever it cannot prove the folder is that deleted site's:
//   - the site folder still exists under the site mount (the teardown has not finished, or failed);
//   - the site mount itself is missing, so "the site is gone" would be true of every site;
//   - the folder holds a session whose header names another folder: dsh's folder name is lossy
//     (`/site/a-b` and `/site/a/b` both become `--site-a-b--`), the header's `cwd` is not;
//   - a header cannot be read, so whose it is cannot be proven;
//   - a Tracy lease (`@tracy/core` lease, the one the deploy drain waits on) with a fresh heartbeat
//     names one of its sessions: long work is still writing to it;
//   - (the gateway door only, #561) one of its sessions, a session opened at the site's path, or a
//     subagent under either has not ended: a turn waiting on its customer's answer holds no lease,
//     so the lease rule alone would move the folder under it. Settled last, right before the rename,
//     over the sessions actually found on disk: each is archived (dsh then runs no model step for
//     it) and stopped, and dsh is asked again whether any still runs. That last answer is only true
//     until the next request reaches dsh, so it is asked again under the gateway's write fence
//     (write-fence.ts), which holds every new request until the rename is done, waits for every
//     earlier one to end at dsh, and refuses a held one that reaches into the site.
// Nothing here runs at boot or over the whole store; the operator's sweep for folders left before
// this existed is `packages/fleet/tracy-fleet-operation/scripts/tools/archive-orphan-sessions.mjs`,
// which applies the same rules (`scripts/test/session-archive-parity.test.ts` holds them together).
import { createZstdDecompress } from 'node:zlib';
import { lstat, mkdir, open, readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { FenceNotDrained, FenceUnknownOutcome } from './write-fence.js';

/** The session store dsh roots at `dshHomePath('sessions')` (dsh bundle `base`, cordis.patch.yml). */
export const SESSIONS_DIR = 'sessions';
/** Beside the store, never inside it: dsh lists every directory under `sessions/`. */
export const ARCHIVE_DIR = 'sessions-archive';
/** `@tracy/core` lease files: `<DSH_HOME>/leases/<id>.json`, rewritten every 30 s while work runs. */
export const LEASES_DIR = 'leases';
/** Where the host dsh sees every site (`/site/<label>`, ADR 0014), and so what a session's `cwd` says. */
export const SITE_MOUNT = '/site';
/** A lease untouched for two minutes belongs to a process that died — `deploy-host-dsh.sh` LEASE_STALE_SECS. */
export const LEASE_FRESH_MS = 120_000;
/** A fleet label as `tracy-host` accepts one (`SAFE_LABEL`), capped so no path grows unbounded. */
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
/** The generation files dsh writes in a session directory: `session.v3.jsonl.zstd`, `session.v4.jsonl.zstd`. */
const GENERATION = /^session\.v\d+\.jsonl(\.zstd)?$/;
/** The header is one short line at the start of the first zstd frame; 64 KB is far more than it needs. */
const HEADER_READ_BYTES = 64 * 1024;

export type ArchiveRefusal =
  | 'INVALID_LABEL'
  | 'SITE_MOUNT_MISSING'
  | 'SITE_STILL_EXISTS'
  | 'STORE_MISSING'
  | 'NO_SESSION_FOLDER'
  | 'AMBIGUOUS_FOLDER'
  | 'SESSION_ACTIVE'
  /** The lease folder is there but could not be read, so "no lease" could not be established. */
  | 'LEASES_UNREADABLE'
  /** dsh could not say which of its sessions run, so none of the folder's can be called ended (#561). */
  | 'SESSIONS_UNREADABLE'
  /** dsh refused to archive or stop one of the folder's sessions, so it cannot be called ended (#561). */
  | 'SESSIONS_NOT_STOPPED';

export interface SiteSessionsInput {
  /** `$DSH_HOME` as this process sees it. */
  dshHome: string;
  /** The site mount as this process sees it — `/site` inside `tracy-dsh`; a host path for the operator. */
  sitesRoot: string;
  label: string;
  /** Milliseconds since the epoch; the archive name and the lease freshness are read against it. */
  now?: number;
}

export interface ArchiveInput extends SiteSessionsInput {
  /**
   * Stops the site's sessions and answers those not proven ended, given the ids read from disk —
   * `settleSiteSessions` in seat-home.ts, which also archives every one of them (dsh then runs no
   * model step for them until the move is done). A throw whose `reason` is `SESSIONS_NOT_STOPPED`
   * is that refusal; any other throw is `SESSIONS_UNREADABLE`. Absent in the operator's sweep, which
   * runs without a dsh to ask and keeps the lease rule alone.
   */
  settle?: (sessionIds: readonly string[]) => Promise<readonly string[]>;
  /**
   * Runs the last check and the move with no new request reaching dsh — the gateway's `WriteFence`
   * (write-fence.ts says why). A throw from it before the work ran is `SESSION_ACTIVE`: requests
   * already on their way had not ended at dsh in time, or one closed without dsh's answer after dsh
   * had its whole body, so whether it still runs is unknown. Absent in the operator's sweep, like `settle`.
   */
  fence?: <T>(work: () => Promise<T>) => Promise<T>;
}

export type Inspection =
  | { ok: true; folder: string; sessionIds: string[] }
  | { ok: false; reason: ArchiveRefusal; detail: string };

export type ArchiveResult =
  | { ok: true; archivedTo: string; sessions: number }
  | { ok: false; reason: ArchiveRefusal; detail: string };

/** The workspace path dsh knows the site by, and every one of its sessions carries as `cwd`. */
export function siteWorkspacePath(label: string): string {
  return `${SITE_MOUNT}/${label}`;
}

/**
 * dsh's folder name for `/site/<label>`: `projectKey` in `session-persistence-jsonl/src/format.ts`
 * turns each `/` into `-` and wraps the result in `--…--`. Exact for a label `LABEL` accepts —
 * every one of its characters is one `projectKey` keeps literally.
 */
export function siteSessionFolderName(label: string): string {
  return `--site-${label}--`;
}

/** `20260928T101530Z` — sortable, and one path segment. */
export function archiveStamp(now: number): string {
  return new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

type Kind = 'missing' | 'directory' | 'other';

async function kindOf(target: string): Promise<Kind> {
  try {
    const found = await lstat(target);
    return found.isDirectory() ? 'directory' : 'other';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}

/**
 * The first line of a generation file, or undefined when it cannot be read. dsh writes the header
 * as its own zstd frame before any append, so decoding stops as soon as a newline appears.
 */
export async function readHeaderLine(file: string): Promise<string | undefined> {
  const handle = await open(file, 'r');
  let head: Buffer;
  try {
    const buffer = Buffer.alloc(HEADER_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_READ_BYTES, 0);
    head = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  if (!file.endsWith('.zstd')) {
    const text = head.toString('utf8');
    const end = text.indexOf('\n');
    return end === -1 ? undefined : text.slice(0, end);
  }
  return new Promise((resolve) => {
    const decoder = createZstdDecompress();
    let text = '';
    let settled = false;
    const settle = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      decoder.destroy();
      resolve(value);
    };
    decoder.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
      const end = text.indexOf('\n');
      if (end !== -1) settle(text.slice(0, end));
    });
    // The read above stops mid-frame on purpose; the decoder then errors on the cut. Whatever
    // was decoded before that is all the answer needs.
    decoder.on('error', () => settle(undefined));
    decoder.on('end', () => settle(undefined));
    decoder.end(head);
  });
}

/** The `id` and `cwd` a session header carries, or undefined when the line is not a session header. */
function headerFields(line: string | undefined): { id: string; cwd: string } | undefined {
  if (line === undefined) return undefined;
  try {
    const value = JSON.parse(line) as { type?: unknown; id?: unknown; cwd?: unknown };
    if (value.type !== 'session' || typeof value.id !== 'string' || typeof value.cwd !== 'string') return undefined;
    return { id: value.id, cwd: value.cwd };
  } catch {
    return undefined;
  }
}

/**
 * Session ids named by a lease whose file was rewritten within `LEASE_FRESH_MS` of `now` — or null when
 * the lease folder is there and could not be read, which is not the same as holding no lease.
 */
async function freshLeaseSessions(dshHome: string, now: number): Promise<Set<string> | null> {
  const dir = path.join(dshHome, LEASES_DIR);
  const ids = new Set<string>();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    // 🔒 ONLY "THERE IS NO LEASE FOLDER" MEANS "NO LEASE" (28/09/2026). Every other error — a
    // permission, an EIO, a path that is not a directory — says the leases could not be READ, which is
    // not the same as there being none: answering an empty set then let a session a Tracy lease was
    // still writing to be archived. Unreadable is its own answer, and the move is refused.
    if ((error as { code?: unknown } | null)?.code !== 'ENOENT') return null;
    return ids;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    try {
      const found = await lstat(file);
      if (now - found.mtimeMs > LEASE_FRESH_MS) continue;
      const lease = JSON.parse(await readFile(file, 'utf8')) as { sessionId?: unknown };
      if (typeof lease.sessionId === 'string') ids.add(lease.sessionId);
    } catch {
      // Written by temp file + rename, so a half-written lease is never seen; one that vanished
      // between the listing and the read has just been released.
    }
  }
  return ids;
}

/**
 * Decide whether `label`'s session folder may leave the store, touching nothing.
 * @param input - the dsh home, the site mount, the label.
 * @returns the folder and its session ids, or the refusal and why.
 */
export async function inspectSiteSessions(input: SiteSessionsInput): Promise<Inspection> {
  const { dshHome, sitesRoot, label } = input;
  const now = input.now ?? Date.now();
  if (!LABEL.test(label)) return { ok: false, reason: 'INVALID_LABEL', detail: `not a site label: ${JSON.stringify(label)}` };
  if (!path.isAbsolute(dshHome) || !path.isAbsolute(sitesRoot)) {
    return { ok: false, reason: 'STORE_MISSING', detail: 'the dsh home and the site mount must be absolute paths' };
  }
  if ((await kindOf(sitesRoot)) !== 'directory') {
    return { ok: false, reason: 'SITE_MOUNT_MISSING', detail: `${sitesRoot} is not a directory here` };
  }
  if ((await kindOf(path.join(sitesRoot, label))) !== 'missing') {
    return { ok: false, reason: 'SITE_STILL_EXISTS', detail: `${path.join(sitesRoot, label)} still exists` };
  }
  const store = path.join(dshHome, SESSIONS_DIR);
  if ((await kindOf(store)) !== 'directory') {
    return { ok: false, reason: 'STORE_MISSING', detail: `${store} is not a directory here` };
  }
  const folder = path.join(store, siteSessionFolderName(label));
  const folderKind = await kindOf(folder);
  if (folderKind === 'missing') return { ok: false, reason: 'NO_SESSION_FOLDER', detail: `${folder} does not exist` };
  if (folderKind !== 'directory') {
    return { ok: false, reason: 'AMBIGUOUS_FOLDER', detail: `${folder} is not a plain directory` };
  }

  const expected = siteWorkspacePath(label);
  const sessionIds: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    // Only directories are sessions; a stray file names no one and travels with the folder.
    if (!entry.isDirectory()) continue;
    const dir = path.join(folder, entry.name);
    const generations = (await readdir(dir)).filter((name) => GENERATION.test(name)).sort();
    // 🔒 A SESSION THAT NAMES NOBODY IS NOT A SESSION THIS MOVE MAY TAKE (28/09/2026). The loop below
    // is the only thing that checks whose session a folder is, so a directory with NO generation file
    // — a session dsh is creating right now, its header not yet written — passed the whole inspection
    // unseen and travelled with the `rename`. It matters because the folder name loses information:
    // dsh writes `/site/a/b` and `/site/a-b` both as `--site-a-b--`, so the folder being archived can
    // hold sessions of a site that is still alive, and a live conversation went with it — dsh then
    // answering ENOENT for a session it had just opened.
    if (generations.length === 0) {
      return {
        ok: false,
        reason: 'AMBIGUOUS_FOLDER',
        detail: `${entry.name} holds no session generation yet: a session may be being created in it`,
      };
    }
    for (const name of generations) {
      let header: { id: string; cwd: string } | undefined;
      try {
        header = headerFields(await readHeaderLine(path.join(dir, name)));
      } catch {
        header = undefined;
      }
      if (header === undefined) {
        return { ok: false, reason: 'AMBIGUOUS_FOLDER', detail: `cannot read the header of ${path.join(entry.name, name)}` };
      }
      if (header.cwd !== expected) {
        return {
          ok: false,
          reason: 'AMBIGUOUS_FOLDER',
          detail: `${entry.name} belongs to ${JSON.stringify(header.cwd)}, not ${expected}`,
        };
      }
      if (!sessionIds.includes(header.id)) sessionIds.push(header.id);
    }
  }

  const leased = await freshLeaseSessions(dshHome, now);
  if (leased === null) {
    return {
      ok: false,
      reason: 'LEASES_UNREADABLE',
      detail: `${path.join(dshHome, LEASES_DIR)} could not be read, so no session can be called idle`,
    };
  }
  const busy = sessionIds.filter((id) => leased.has(id));
  if (busy.length > 0) {
    return { ok: false, reason: 'SESSION_ACTIVE', detail: `a fresh lease still holds ${busy.join(', ')}` };
  }
  return { ok: true, folder, sessionIds };
}

/**
 * Move `label`'s session folder into the archive, after `inspectSiteSessions` clears it and, when
 * `settle` is given, it stopped every session of the site and none is left running.
 * Idempotent: once moved, the folder is gone and a second call answers `NO_SESSION_FOLDER`
 * without touching anything.
 * @param input - the dsh home, the site mount, the label, and how to stop what still runs.
 * @returns the archive entry's name and the number of sessions in it, or the refusal.
 */
export async function archiveSiteSessions(input: ArchiveInput): Promise<ArchiveResult> {
  const now = input.now ?? Date.now();
  const inspected = await inspectSiteSessions({ ...input, now });
  if (!inspected.ok) return inspected;
  // Stops what still runs, outside the fence: a turn takes time to end, and the fence holds every
  // site's requests while it is up.
  const first = await settled(input, inspected.sessionIds);
  if (first !== null) return first;
  if (input.fence === undefined) return move(input, inspected, now);
  // 🔒 THE LAST CHECK AND THE RENAME RUN WITH NO NEW REQUEST REACHING dsh (#561). The settle above
  // proves the site's sessions ended as of its last `session/list`; a `session/create` at the
  // site's path or a `session/prompt` into one of its sessions arriving after that list would
  // otherwise run while the folder moved. Under the fence, and only once every request already on
  // its way has ended at dsh, the disk and dsh are read again and the folder moves before any held
  // request goes on; a held one that names the site is then refused, never run late.
  try {
    return await input.fence(async () => {
      const again = await inspectSiteSessions({ ...input, now });
      if (!again.ok) return again;
      const last = await settled(input, again.sessionIds);
      if (last !== null) return last;
      return move(input, again, now);
    });
  } catch (error) {
    // Either way a request may still be running at dsh: the folder stays where it is.
    if (error instanceof FenceNotDrained || error instanceof FenceUnknownOutcome) {
      return { ok: false, reason: 'SESSION_ACTIVE', detail: error.message };
    }
    throw error;
  }
}

/** `settle`'s refusal, or null when every session is proven ended (or there is no dsh to ask). */
async function settled(input: ArchiveInput, sessionIds: readonly string[]): Promise<ArchiveResult | null> {
  if (input.settle === undefined) return null;
  let pending: readonly string[];
  try {
    pending = await input.settle(sessionIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason =
      (error as { reason?: unknown } | null)?.reason === 'SESSIONS_NOT_STOPPED'
        ? 'SESSIONS_NOT_STOPPED'
        : 'SESSIONS_UNREADABLE';
    return { ok: false, reason, detail: message };
  }
  if (pending.length > 0) {
    return { ok: false, reason: 'SESSION_ACTIVE', detail: `dsh has not ended ${pending.join(', ')} yet` };
  }
  return null;
}

async function move(
  input: ArchiveInput,
  inspected: { folder: string; sessionIds: string[] },
  now: number,
): Promise<ArchiveResult> {
  const archive = path.join(input.dshHome, ARCHIVE_DIR);
  await mkdir(archive, { recursive: true, mode: 0o700 });
  const base = `${input.label}-${archiveStamp(now)}`;
  let name = base;
  for (let n = 1; (await kindOf(path.join(archive, name))) !== 'missing'; n++) name = `${base}-${String(n)}`;
  await rename(inspected.folder, path.join(archive, name));
  return { ok: true, archivedTo: name, sessions: inspected.sessionIds.length };
}
