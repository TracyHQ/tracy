/**
 * Lifecycle of the last-resort throwaway PostgreSQL, isolated so it can be driven under test with
 * stubbed process IO instead of a live Docker daemon.
 *
 * 🔒 NOT UNDER `scripts/lib/`. That directory is an input to the fleet image fingerprint, so a
 * CI-only helper living there would rebuild the product image on every change to test plumbing. This
 * file is test/CI infrastructure only and must stay off that fingerprint.
 *
 * 🔒 THE DEFECT THIS FIXES: OWNERSHIP ON A SHARED DAEMON. Every invocation used to share the fixed
 * name `tch-check-tests-postgres`, `rm -f` it at startup, and `rm -f` it again on exit. CI runners
 * share one Docker daemon, so `rm -f <fixed-name>` at the start of one invocation deletes the LIVE
 * database another invocation is mid-run against, and the exit hook does it a second time. The name
 * is the bug: a container removed by name is removed regardless of who created it.
 *
 * The rule here is therefore: a per-invocation name that will not collide, and removal keyed to the
 * full container id THIS invocation captured from a successful create — never a name, never another
 * invocation's container. We never preemptively remove anything.
 */
import { randomBytes } from 'node:crypto'

/** Fixed per-network-namespace port; the url is the same string in both branches of `throwawayArgs`. */
export const THROWAWAY_PORT = 55432

/**
 * `docker create` prints the full container id: exactly 64 lowercase hex digits, with no `sha256:`
 * prefix (that form is an image digest, not a container id). Anything else on a status-0 stdout is
 * malformed output we must not treat as an id — recording it would key `start`/`rm` to garbage.
 */
const CONTAINER_ID = /^[0-9a-f]{64}$/

/**
 * Where `127.0.0.1` is, when the thing asking is itself in a container.
 *
 * 🔒 PUBLISHING A PORT PUTS IT ON THE DOCKER HOST'S LOOPBACK, NOT ON OURS. `docker run -p
 * 127.0.0.1:55432:5432` asks the DAEMON to listen; reached over a mounted socket from inside a
 * container, the listener lands in the host's network namespace while the probe runs in ours, and
 * the two never meet. So in a container we publish nothing and JOIN OUR OWN NETWORK NAMESPACE
 * (`--network container:<us>`), listening on the same `127.0.0.1` the probe uses. `-p` and
 * `--network container:` are mutually exclusive, which is the right shape: two environments, two
 * ways of making ONE url true.
 *
 * @param us - our own container id, or null when this process is on the host.
 * @returns the `docker create` arguments after `--name <name>`.
 */
export function throwawayArgs(us: string | null): string[] {
  const env = ['-e', 'POSTGRES_USER=tracy', '-e', 'POSTGRES_PASSWORD=tracy', '-e', 'POSTGRES_DB=tracy']
  // `postgres:16-alpine` passes a leading `-…` straight to the server, so the port is the server's
  // own rather than a mapping — the url is the same string either way.
  //
  // ⚠ ALPINE CANNOT initdb ON A CentOS 7 KERNEL, and the message does not say so. Measured
  // 21/09/2026 on j-static (kernel 3.10): `FATAL: could not write to file "pg_wal/xlogtemp.34":
  // Operation not permitted` — EPERM on a plain write, i.e. seccomp refusing a syscall musl makes
  // there. `postgres:16` (bookworm) is ready in 20 s on the same machine.
  //
  // This line is NOT changed, because this container is the LAST resort and the runners that live
  // on those machines are given `TEST_DATABASE_URL` by their compose file, so they never reach it
  // (`TracyHQ/tracy-runners`'s `compose.yml` explains why that sidecar exists at all). It is
  // written down so that whoever does hit it on such a host — running this gate by hand, or on a
  // runner without the sidecar — reads the answer here instead of debugging postgres.
  const listenOn = ['postgres:16-alpine', '-p', String(THROWAWAY_PORT)]
  if (us !== null) return [...env, '--network', `container:${us}`, ...listenOn]
  return [...env, '-p', `127.0.0.1:${String(THROWAWAY_PORT)}:${String(THROWAWAY_PORT)}`, ...listenOn]
}

/**
 * A name for THIS invocation only. The pid narrows it to one process, the random suffix rules out
 * the same pid on a neighbouring host reaching the same daemon — collision-resistant so that two
 * invocations never share a name, and thus never remove one another.
 */
export function throwawayName(): string {
  return `tch-check-tests-postgres-${String(process.pid)}-${randomBytes(6).toString('hex')}`
}

/**
 * Which of the three database sources this run gets, decided before any container is touched.
 *
 * The order is cheapest-first and the first two are BORROWED — an exported variable or the dev
 * cluster in `deploy/.env`. Borrowed means we read it and stop; we do not create or remove anything,
 * so those paths never reach the throwaway lifecycle at all. An exported-but-unreachable url is a
 * wrong address, not a missing machine: it fails loudly rather than falling through to a container
 * (`exported-unreachable`), so a typo cannot silently spin one up.
 */
export type DatabaseSource =
  | { readonly kind: 'exported'; readonly url: string }
  | { readonly kind: 'exported-unreachable'; readonly url: string }
  | { readonly kind: 'deploy'; readonly url: string }
  | { readonly kind: 'throwaway' }

export function pickDatabaseSource(
  exported: string | undefined,
  deployEnv: string | undefined,
  answers: (url: string) => boolean
): DatabaseSource {
  if (exported !== undefined && exported !== '') {
    return answers(exported)
      ? { kind: 'exported', url: exported }
      : { kind: 'exported-unreachable', url: exported }
  }
  if (deployEnv !== undefined && deployEnv !== '' && answers(deployEnv))
    return { kind: 'deploy', url: deployEnv }
  return { kind: 'throwaway' }
}

/** Result of one docker invocation; the subset the lifecycle needs, matching `spawnSync`. */
export interface DockerResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

/** The process IO the lifecycle borrows, so a test can supply a daemon that never existed. */
export interface ThrowawayIO {
  /** Run `docker <args>`, capturing stdout/stderr. */
  run(args: string[]): DockerResult
  /** Does a real connection open and a statement return on this url? */
  probe(url: string): boolean
  /** Block for `ms` between readiness attempts. */
  sleep(ms: number): void
}

export type ThrowawayOutcome = 'ready' | 'create-failed' | 'start-failed' | 'timeout'

export interface Throwaway {
  /** How it ended — distinguishes a broken image (`start-failed`) from an unreachable one (`timeout`). */
  readonly outcome: ThrowawayOutcome
  /** The url, set only when the database actually answered. */
  readonly url?: string
  /** The full container id we own, or null when creation never produced a valid one (nothing to remove). */
  readonly id: string | null
  /** Docker's own words from the failing step, for a diagnosis that quotes rather than guesses. */
  readonly detail: string
  /**
   * Remove ONLY our captured id, with `rm -f -v` so the anonymous postgres data volume goes too.
   * Idempotent on success and retryable on failure: a transient `rm` error leaves the handle unmarked
   * so the exit hook (or a later call) tries again. Never touches a name or another container.
   */
  remove(): void
}

/** Options for {@link startThrowaway}; `onAcquire` is the hook that makes cleanup possible early. */
export interface StartOptions {
  /** Readiness attempts before giving up (one probe + one `sleep` each). */
  readonly attempts?: number
  /**
   * Called the instant a VALID container id is captured from `create`, before `start` is attempted.
   * The caller registers `handle.remove` here so its exit/signal hooks can clean up even if `start`,
   * the probe, or `sleep` throws — ownership must be reachable before anything after create can fail.
   */
  readonly onAcquire?: (handle: Throwaway) => void
}

/**
 * Create, start, then wait for the throwaway — publishing ownership BEFORE anything after create can
 * fail, so nothing we made can leak.
 *
 * 🔒 CREATE THEN START, NOT A BARE `docker run`. `docker run` that errors after the container is
 * created (a port already bound, a bad start) leaves the container behind with no id in our hand to
 * remove it — an owned container that leaks. `docker create` returns the full id first; from that
 * point every exit path can remove exactly what we made and nothing else. On a shared host this is
 * also what makes simultaneous invocations safe: the second one's `start` fails on the bound port,
 * it removes its OWN container, and the first one's live database is never touched.
 *
 * 🔒 ACQUISITION IS PUBLISHED IMMEDIATELY. As soon as `create` yields a validated id we set ownership
 * and call `onAcquire`, so the caller's exit/signal cleanup covers the container across `start`, the
 * probe loop, and `sleep`. An unexpected throw from any of those attempts our own cleanup and then
 * re-propagates loudly; a failure inside that cleanup is swallowed so it cannot mask the real error.
 */
export function startThrowaway(
  io: ThrowawayIO,
  us: string | null,
  name: string,
  url: string,
  options: StartOptions = {}
): Throwaway {
  const attempts = options.attempts ?? 60
  let owned: string | null = null
  let removed = false
  let outcome: ThrowawayOutcome = 'create-failed'
  let detail = ''
  let readyUrl: string | undefined

  const handle: Throwaway = {
    get outcome(): ThrowawayOutcome {
      return outcome
    },
    get url(): string | undefined {
      return readyUrl
    },
    get id(): string | null {
      return owned
    },
    get detail(): string {
      return detail
    },
    remove(): void {
      const id = owned
      if (removed || id === null) return
      // Mark removed only on a successful rm: a transient failure must remain retryable, not be
      // recorded as done. `-v` also drops the anonymous postgres data volume this container created.
      const r = io.run(['rm', '-f', '-v', id])
      if (r.status === 0) removed = true
    }
  }

  const created = io.run(['create', '--name', name, ...throwawayArgs(us)])
  if (created.status !== 0) {
    detail = created.stderr
    return handle
  }
  const id = created.stdout.trim()
  if (!CONTAINER_ID.test(id)) {
    // Status 0 but the stdout is not a container id: fail safely. We own nothing, so nothing is
    // removed — recording garbage as our id is how a later `rm` would target the wrong thing.
    detail = created.stdout || created.stderr
    return handle
  }
  owned = id
  options.onAcquire?.(handle)

  try {
    const started = io.run(['start', owned])
    if (started.status !== 0) {
      outcome = 'start-failed'
      detail = started.stderr
      return handle
    }

    for (let i = 0; i < attempts; i++) {
      if (io.probe(url)) {
        outcome = 'ready'
        readyUrl = url
        return handle
      }
      io.sleep(1000)
    }
    outcome = 'timeout'
    return handle
  } catch (e) {
    // We own a container and start/probe/sleep threw: remove OUR id, then re-throw so the failure is
    // loud. A throw from cleanup itself is swallowed — it must not replace the original error.
    try {
      handle.remove()
    } catch {
      /* keep the original error */
    }
    throw e
  }
}

/**
 * Which databases an invocation may use.
 *
 * `auto` is the order {@link pickDatabaseSource} describes: exported variable, `deploy/.env`, then a
 * throwaway. `owned` is for a caller that must not depend on what the machine happens to hold — the
 * `pre-push` hook, where the inherited `TEST_DATABASE_URL` belongs to whichever session exported it.
 * It uses the throwaway lifecycle only: nothing inherited is read, probed or written to.
 */
export type DatabaseMode = 'auto' | 'owned'

/** Every flag `check-tests.ts` takes. Each is followed by exactly one value. */
const VALUE_FLAGS: readonly string[] = ['--part', '--database']

/**
 * Parse `--database` out of an argv, and refuse the argv if any of it is not understood.
 *
 * 🔒 A MISSPELT MODE IS RED, NOT `auto`. `owned` exists to keep a run away from a borrowed database, so
 * a typo that quietly fell back to the borrowed order would do exactly what the caller asked not to.
 *
 * 🔒 THE WHOLE ARGV IS WALKED, NOT SEARCHED. Until 05/10/2026 this looked for tokens beginning with
 * `--database` and ignored everything else, so `--databas owned` — or `-database`, `--db`, a stray
 * `owned` — was no flag at all: the mode stayed `auto` and the run borrowed the inherited url. Now
 * every token must be a known flag or the one value that follows it. Anything left over is an error,
 * as is a flag given twice, a flag with no value, a flag glued to its value (`--database=owned`) and
 * any mode but `owned`. What `--part`'s value means is still `parseParts`'s to judge.
 *
 * The caller must refuse before any database IO.
 *
 * @param argv - arguments after the script name.
 * @returns the mode, or the reason the argv is unusable.
 */
export function parseDatabaseMode(
  argv: readonly string[]
): { readonly mode: DatabaseMode } | { readonly error: string } {
  let mode: DatabaseMode = 'auto'
  const seen = new Set<string>()
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    if (!VALUE_FLAGS.includes(flag)) {
      const hint = flag.startsWith('--database') ? ' — write: --database owned' : ''
      return {
        error: `unknown argument ${JSON.stringify(flag)} (have: --part <name>, --database owned)${hint}`
      }
    }
    if (seen.has(flag)) return { error: `${flag} given more than once` }
    seen.add(flag)
    const raw = argv[i + 1]
    if (flag !== '--database') {
      if (raw === undefined || raw.startsWith('--')) return { error: `${flag} needs a value` }
      continue
    }
    if (raw === undefined || raw.startsWith('--')) return { error: '--database needs a value (have: owned)' }
    if (raw !== 'owned') return { error: `no such database mode: ${raw} (have: owned)` }
    mode = 'owned'
  }
  return { mode }
}

/**
 * Where a database may come from. Every source is a FUNCTION so that `owned` can be shown never to
 * call the borrowed ones: a test hands in readers that throw.
 */
export interface DatabaseIO {
  /** The `TEST_DATABASE_URL` this process inherited. */
  exported(): string | undefined
  /** The `TEST_DATABASE_URL` line of `deploy/.env`. */
  deployEnv(): string | undefined
  /** Does a real connection open and a statement return on this url? */
  answers(url: string): boolean
  /** Create and start this invocation's own database; its url once it answered, otherwise undefined. */
  throwaway(): string | undefined
}

export type DatabaseOutcome =
  | { readonly ok: true; readonly source: 'exported' | 'deploy' | 'throwaway'; readonly url: string }
  | { readonly ok: false; readonly reason: 'exported-unreachable'; readonly url: string }
  | { readonly ok: false; readonly reason: 'no-database' }

/**
 * Settle the database for one invocation and write it into `env`, or say why there is none.
 *
 * 🔒 `owned` FORGETS THE INHERITED URL BEFORE ANYTHING ELSE. The suites read `TEST_DATABASE_URL` from
 * the environment they are spawned with, so leaving the inherited value in place while our own
 * database fails to start would hand them somebody else's. It is deleted first and only ever replaced
 * by the url of the container this invocation created and saw answer.
 *
 * `auto` keeps the order and the verdicts it always had: a reachable exported url is left as it is, an
 * exported url that does not answer is a failure rather than a reason to try the next source, and the
 * throwaway is the last resort.
 *
 * @param mode - which sources are allowed.
 * @param io - the sources.
 * @param env - the environment the suites will inherit; mutated.
 * @returns the source in use, or the failure. `env.TEST_DATABASE_URL` is set only on success.
 */
export function prepareDatabase(
  mode: DatabaseMode,
  io: DatabaseIO,
  env: Record<string, string | undefined>
): DatabaseOutcome {
  if (mode === 'owned') {
    delete env.TEST_DATABASE_URL
    const url = io.throwaway()
    if (url === undefined || url === '') return { ok: false, reason: 'no-database' }
    env.TEST_DATABASE_URL = url
    return { ok: true, source: 'throwaway', url }
  }

  const source = pickDatabaseSource(io.exported(), io.deployEnv(), io.answers)
  if (source.kind === 'exported') return { ok: true, source: 'exported', url: source.url }
  if (source.kind === 'exported-unreachable')
    return { ok: false, reason: 'exported-unreachable', url: source.url }
  if (source.kind === 'deploy') {
    env.TEST_DATABASE_URL = source.url
    return { ok: true, source: 'deploy', url: source.url }
  }
  const url = io.throwaway()
  if (url === undefined || url === '') return { ok: false, reason: 'no-database' }
  env.TEST_DATABASE_URL = url
  return { ok: true, source: 'throwaway', url }
}
