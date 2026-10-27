// A short, host-wide pause on every request that could change dsh's state, while a deleted site's
// session folder is checked one last time and moved (#561).
//
// WHY. The move proves the site's sessions ended from one `session/list` taken right before the
// `rename`. Between the two, a `session/create` at the site's path or a `session/prompt` into one of
// its sessions could still reach dsh — from an account the delete could not revoke (a guest or bot
// seat holds no address, so the seat book has none to name), or from the master — and the folder
// would move under that new work while the door reported success. dsh has no verb that refuses new
// sessions or prompts for one path (its `ArchivedSessionGate` stops model steps only), so the fence
// stands where every such request must pass: this gateway's proxy.
//
// WHAT IT HOLDS. Every proxied request whose method is not GET/HEAD/OPTIONS, from every account and
// for every site. dsh's remote streams carry no request (open and cancel of four read streams,
// `parseRemoteMuxClientFrame`), and GET reads change nothing.
//
// WHAT HAPPENS TO A HELD REQUEST. Once the fence comes down it carries the scope of every fence it
// waited behind, and the proxy reads its body against them (`touchesArchivedSite`): one that names
// a session of the archived site, a path at or under the site, or a workspace the gate cannot place
// elsewhere is REFUSED and never reaches dsh — a `session/create` sent in the window must not recreate
// what the delete removed, nor a prompt land in a session that just moved. Every other held request
// goes on exactly as it would have, so another site's customer sees a pause of one `session/list`,
// never an error.
//
// WHAT IT WAITS FOR. Raising the fence does not recall a request already on its way; the work under
// the fence starts only once every request admitted before it has ENDED AT dsh. A client that leaves
// does not end its request there: dsh runs a command it has received to its end whoever waits for it
// (`@deepseek-ai/dsh-api-gateway` `invokePrepared` awaits the method; the RPC host builds its answer
// only after that), so the gateway lets the request finish and counts it until dsh's answer arrives —
// `Ticket.upstream` says how. If they have not all ended within the wait, the fence comes down without
// running the work, and the move is refused as `SESSION_ACTIVE` — the folder stays, which is always safe.
//
// WHAT IT CANNOT PROVE, AND KEEPS. A request has ended at dsh when dsh answered it, or when it
// provably never gave dsh a whole body, the one thing dsh's HTTP bridge needs before it dispatches:
// its connection never opened; or not one byte of it (headers included — Node sends them with the
// first body byte) was handed to the socket; or the gateway cut it off because its own client never
// delivered the whole body, so no more of it could have gone on. Every other close without an answer
// — a reset before or after the body went out, dsh dying, a socket dsh dropped — says nothing: the
// gateway's `finish` only says the bytes left this process, and its absence does not say dsh lacks
// them. Such a request is an UNKNOWN OUTCOME, and no later wait can show it ended.
//
// Nor can a gateway process see the requests of the one before it. A gateway that crashed, was
// killed, or restarted with a request unanswered at a dsh that keeps running would leave a new
// process counting nothing. So the doubt lives on disk (`FenceLedger`): each gateway process keeps a
// marker naming the dsh process it serves, and removes it only when it exits with every request it
// sent answered. A marker of another process is an outcome still in doubt, and every fence refuses
// its work (`FenceUnknownOutcome`, answered as `SESSION_ACTIVE`: the folder stays and the delete says
// so) until that marker is shown to belong to a dsh process that is gone — the one thing that ends
// every command it was running. A dsh restart therefore clears it; a gateway restart does not.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { ClientRequest } from 'node:http';
import type { Socket } from 'node:net';
import path from 'node:path';

/** A request admitted before the fence could not be waited out, so the work under it did not run. */
export class FenceNotDrained extends Error {
  constructor(readonly inFlight: number) {
    super(`${String(inFlight)} request(s) to dsh were still being answered`);
    this.name = 'FenceNotDrained';
  }
}

/**
 * A request that may have reached dsh closed without dsh's answer — in this process (`unknown`), or
 * in an earlier gateway process whose dsh may still be running (`earlier`, markers of `FenceLedger`) —
 * so whether dsh ran it, or runs it still, cannot be known; the work did not run.
 */
export class FenceUnknownOutcome extends Error {
  constructor(
    readonly unknown: number,
    readonly earlier = 0,
  ) {
    super(
      `${String(unknown)} request(s) to dsh closed without an answer, and ${String(earlier)} earlier gateway process(es) ` +
        'left requests unanswered at a dsh that may still run them; whether dsh ran them is unknown',
    );
    this.name = 'FenceUnknownOutcome';
  }
}

/**
 * What one fence closes: the site's path as dsh sees it, and its sessions. The work under the fence
 * adds every session it finds; the set is final by the time the fence comes down, which is the only
 * moment a held request reads it.
 */
export interface FenceScope {
  readonly path: string;
  readonly sessionIds: Set<string>;
}

/** One admitted request: counted until it has ended here AND at dsh. */
export interface Ticket {
  /** The scopes of every fence this request waited behind; empty when it was never held. */
  readonly heldBy: readonly FenceScope[];
  /**
   * Count `request` (a request this one sent to dsh) until dsh has answered it — the answer is built
   * only once the command returned — or it closed never having given dsh a whole body: its socket
   * never opened, its headers were never handed over (`headersSent` false), or `cutShort` says the
   * gateway cut it off because its client never delivered the whole body. Any other close with no
   * answer ends the count as an UNKNOWN OUTCOME, which no fence can run past (`FenceUnknownOutcome`):
   * `finish` or its absence says only what left this process, not what dsh holds.
   * @param cutShort - read at the close: true only when the gateway itself destroyed the request
   *   because fewer bytes than the whole body ever reached the gateway.
   */
  upstream(request: ClientRequest, cutShort?: () => boolean): void;
  /** This request has ended on the gateway's side (answered, refused, or its client gone). */
  done(): void;
}

export class WriteFence {
  readonly #ledger: FenceLedger | undefined;
  #inFlight = 0;
  /** Requests sent whole to dsh that closed without its answer: none of them can be shown to have ended. */
  #unknown = 0;
  /** The fence that is up now, with the scope it closes; null while it is down. */
  #raised: { lowered: Promise<void>; scope: FenceScope } | null = null;
  /** Wakes `run` when the in-flight count reaches zero. */
  #drained: (() => void) | null = null;
  /** One `run` at a time: a second archive waits for the first to lower the fence. */
  #queue: Promise<unknown> = Promise.resolve();

  /**
   * @param ledger - where this process's doubt outlives it, and earlier processes' doubt is read
   *   (`FenceLedger`); without one, only this process's requests are known — tests, and a gateway
   *   that is never restarted apart from its dsh.
   */
  constructor(ledger?: FenceLedger) {
    this.#ledger = ledger;
    ledger?.settledWhen(() => this.#inFlight === 0 && this.#unknown === 0);
  }

  /** Requests admitted and not yet ended. */
  get inFlight(): number {
    return this.#inFlight;
  }

  /** Requests whose outcome at dsh is unknown (see `Ticket.upstream`). */
  get unknown(): number {
    return this.#unknown;
  }

  /** Whether the fence is up now. */
  get raised(): boolean {
    return this.#raised !== null;
  }

  /** Wait while the fence is up, then count the request in flight. */
  async admit(): Promise<Ticket> {
    const heldBy: FenceScope[] = [];
    for (let up = this.#raised; up !== null; up = this.#raised) {
      if (!heldBy.includes(up.scope)) heldBy.push(up.scope);
      await up.lowered;
    }
    this.#inFlight += 1;
    let ended = false;
    let here = false;
    let atDsh = 0;
    const settle = (): void => {
      if (ended || !here || atDsh > 0) return;
      ended = true;
      this.#inFlight -= 1;
      if (this.#inFlight === 0) this.#drained?.();
    };
    return {
      heldBy,
      upstream: (request, cutShort) => {
        atDsh += 1;
        let ended = false;
        // Whether a byte of this request can have left: from the moment its socket is open. A socket
        // handed over already open (one kept alive) is open from the start.
        let opened = false;
        const end = (outcomeUnknown: boolean): void => {
          if (ended) return;
          ended = true;
          if (outcomeUnknown) this.#unknown += 1;
          atDsh -= 1;
          settle();
        };
        request.once('socket', (socket: Socket) => {
          if (socket.connecting !== true) {
            opened = true;
            return;
          }
          socket.once('connect', () => {
            opened = true;
          });
        });
        request.once('response', () => end(false));
        request.once('close', () => end(opened && request.headersSent !== false && cutShort?.() !== true));
      },
      done: () => {
        here = true;
        settle();
      },
    };
  }

  /**
   * Raise the fence over `scope`, wait up to `drainMs` for every admitted request to end, run `work`,
   * and lower the fence whatever `work` does.
   * @throws FenceNotDrained when requests were still in flight at the end of the wait; `work` did not run.
   * @throws FenceUnknownOutcome when a request that may have reached dsh closed without its answer,
   *   before or during the wait, in this process or an earlier one (`FenceLedger`); `work` did not run.
   */
  run<T>(drainMs: number, scope: FenceScope, work: () => Promise<T>): Promise<T> {
    const turn = this.#queue.then(() => this.#runNow(drainMs, scope, work));
    this.#queue = turn.catch(() => undefined);
    return turn;
  }

  async #runNow<T>(drainMs: number, scope: FenceScope, work: () => Promise<T>): Promise<T> {
    let lower!: () => void;
    const lowered = new Promise<void>((resolve) => {
      lower = resolve;
    });
    // Nothing is held for a move that cannot happen.
    this.#throwIfInDoubt();
    this.#raised = { lowered, scope };
    try {
      if (this.#inFlight > 0) {
        let timer: NodeJS.Timeout | undefined;
        await new Promise<void>((resolve) => {
          this.#drained = resolve;
          timer = setTimeout(resolve, drainMs);
        });
        clearTimeout(timer);
        this.#drained = null;
        if (this.#inFlight > 0) throw new FenceNotDrained(this.#inFlight);
      }
      // A request that ended during the wait may have ended unknown; the fence holds every new one,
      // so this is the last moment one can appear before the work.
      this.#throwIfInDoubt();
      return await work();
    } finally {
      this.#raised = null;
      lower();
    }
  }

  #throwIfInDoubt(): void {
    const earlier = this.#ledger?.earlierInDoubt() ?? 0;
    if (this.#unknown > 0 || earlier > 0) throw new FenceUnknownOutcome(this.#unknown, earlier);
  }
}

/** Which dsh process a gateway serves: the parent that spawned it, and that parent's boot. */
export interface DshProcess {
  /** A value the dsh process draws once when it starts (the plugin passes it down); null when unknown. */
  readonly boot: string | null;
  /** Its PID; null when the gateway runs apart from dsh. */
  readonly pid: number | null;
}

interface Marker {
  readonly boot: string | null;
  readonly parentPid: number | null;
}

const MARKER_SUFFIX = '.json';
const STAGING_PREFIX = '.staging-';

/**
 * The write fence's memory across gateway processes (#561): one marker file per gateway process in
 * `dir`, written before the gateway takes any request and removed only when it exits settled (every
 * request it sent to dsh answered, none unknown). A marker left behind — a crash, a kill, an exit with
 * a request unanswered — is doubt about requests the next process never saw; it is forgotten only
 * once the dsh process it names is shown gone: another boot, and that PID either dead or now held by
 * the dsh this gateway serves. What cannot be read is doubt too (a folder that cannot be listed, a
 * marker that cannot be parsed), and a gateway that could not write its own marker is in doubt for
 * as long as it runs, since nothing would outlive it.
 */
export class FenceLedger {
  readonly #dir: string;
  readonly #dsh: DshProcess;
  readonly #own: string | null;
  readonly #isAlive: (pid: number) => boolean;
  #settled: () => boolean = () => false;
  #released = false;

  constructor(dir: string, dsh: DshProcess, isAlive: (pid: number) => boolean = processAlive) {
    this.#dir = dir;
    this.#dsh = dsh;
    this.#isAlive = isAlive;
    const name = `${String(process.pid)}-${randomUUID()}`;
    let own: string | null = null;
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      // Written aside and renamed in, so no reader ever meets half a marker.
      const staging = path.join(dir, `${STAGING_PREFIX}${name}`);
      const marker: Marker = { boot: dsh.boot, parentPid: dsh.pid };
      writeFileSync(staging, JSON.stringify(marker), { flag: 'wx', mode: 0o600 });
      renameSync(staging, path.join(dir, `${name}${MARKER_SUFFIX}`));
      own = `${name}${MARKER_SUFFIX}`;
    } catch (error) {
      console.error(`[dsh-passwords] write fence cannot keep its marker in ${dir}; no site folder moves while this gateway runs:`, error);
    }
    this.#own = own;
  }

  /** Tell the ledger how to know this process is settled; the fence that owns it calls this once. */
  settledWhen(check: () => boolean): void {
    this.#settled = check;
  }

  /**
   * How many earlier gateway processes left requests whose outcome at a still-running dsh is unknown;
   * the markers of a dsh shown gone are removed on the way. Counts 1 when this process has no marker
   * of its own, or when the folder cannot be read.
   */
  earlierInDoubt(): number {
    let doubt = this.#own === null ? 1 : 0;
    let names: string[];
    try {
      names = readdirSync(this.#dir);
    } catch {
      return doubt + 1;
    }
    for (const name of names) {
      if (name === this.#own) continue;
      // A staging file is a process that died before it wrote its marker, so before it took a request.
      if (name.startsWith(STAGING_PREFIX)) continue;
      if (!name.endsWith(MARKER_SUFFIX)) {
        doubt += 1;
        continue;
      }
      const file = path.join(this.#dir, name);
      let marker: Marker | null = null;
      try {
        marker = parseMarker(JSON.parse(readFileSync(file, 'utf8')));
      } catch {
        marker = null;
      }
      if (marker !== null && this.#dshGone(marker)) {
        rmSync(file, { force: true });
        continue;
      }
      doubt += 1;
    }
    return doubt;
  }

  /** At exit: remove this process's marker when every request it sent was answered, else leave it. */
  release(): void {
    if (this.#released || this.#own === null) return;
    this.#released = true;
    if (!this.#settled()) return;
    try {
      rmSync(path.join(this.#dir, this.#own), { force: true });
    } catch {
      // Left in place: the next process reads it as doubt, which is the safe side.
    }
  }

  /** Whether the dsh a marker names has exited: another boot, and its PID dead or now this dsh's. */
  #dshGone(marker: Marker): boolean {
    const here = this.#dsh;
    if (marker.boot === null || here.boot === null || marker.boot === here.boot) return false;
    if (marker.parentPid === null) return false;
    return marker.parentPid === here.pid || !this.#isAlive(marker.parentPid);
  }
}

function parseMarker(value: unknown): Marker | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('boot') || !keys.includes('parentPid')) return null;
  const { boot, parentPid } = record;
  if (boot !== null && (typeof boot !== 'string' || boot === '')) return null;
  if (parentPid !== null && (typeof parentPid !== 'number' || !Number.isInteger(parentPid) || parentPid <= 0)) return null;
  return { boot, parentPid };
}

/** Whether a PID names a live process; a process we may not signal is alive. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** How a request names sessions: every reference it carries, and the marker for one it cannot read. */
export interface SessionRefReader {
  collect(body: unknown): Iterable<string>;
  unreadable: string;
}

/** Keys whose string value dsh reads as a folder: `session/create`'s `cwd`, `workspace/create`'s `path`. */
const PATH_KEYS = new Set(['cwd', 'path']);

/**
 * Whether a held request's parsed JSON body reaches into a site one of `scopes` archived: it names
 * one of the site's sessions (every field `collectSessionRefs` reads, mentions included, and a
 * `childSessionId` beside its parent) or a session reference it cannot read; a `cwd`/`path` at or
 * under the site's path; or a `workspaceId`
 * that `workspacePath` places there, or cannot place at all — dsh resolves an unknown id to a path
 * the gate cannot see, so an id it cannot place is not one it can let through.
 * @param body - the request body, parsed.
 * @param scopes - what the fences this request waited behind closed.
 * @param workspacePath - the path the gate knows a workspace id by, or undefined.
 * @param sessionRefs - the gate's session-reference reader (`collectSessionRefs` and
 *   `UNREADABLE_SESSION_REF` of `session-refs.ts`), passed in so this file reads requests exactly
 *   as the seat checks do without depending on that module.
 */
export function touchesArchivedSite(
  body: unknown,
  scopes: readonly FenceScope[],
  workspacePath: (workspaceId: string) => string | undefined,
  sessionRefs: SessionRefReader,
): boolean {
  if (scopes.length === 0) return false;
  const under = (value: string): boolean => {
    if (!value.startsWith('/')) return false;
    const normal = path.posix.normalize(value).replace(/\/+$/, '');
    return scopes.some((scope) => normal === scope.path || normal.startsWith(`${scope.path}/`));
  };
  for (const ref of sessionRefs.collect(body)) {
    if (ref === sessionRefs.unreadable) return true;
    if (scopes.some((scope) => scope.sessionIds.has(ref))) return true;
  }
  const stack: unknown[] = [body];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      stack.push(...(node as unknown[]));
      continue;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (PATH_KEYS.has(key) && typeof value === 'string' && under(value)) return true;
      // `collectSessionRefs` reads a child through its parent (a seat's grant is its parent's);
      // here the child itself may be the site's.
      if (key === 'childSessionId' && typeof value === 'string' && scopes.some((scope) => scope.sessionIds.has(value))) {
        return true;
      }
      if (key === 'workspaceId' && value !== undefined && value !== null) {
        if (typeof value !== 'string') return true;
        const known = workspacePath(value);
        if (known === undefined || under(known)) return true;
      }
      if (value !== null && typeof value === 'object') stack.push(value);
    }
  }
  return false;
}
