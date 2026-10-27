/**
 * Pure routing: from a session's cwd to the `docker exec` argv that runs a command inside that
 * site's web container. No I/O here, so every rule below is a unit test.
 *
 * THE RULES THAT ARE SECURITY, NOT CONVENIENCE. The container is derived from the cwd — never
 * from argv or env. But the cwd is NOT always the session's own: `tool-bash` passes a
 * model-supplied `workdir` verbatim as the spawn cwd, and `terminal_open` does the same with
 * `cwd`. So two checks stand between a model and another site's container:
 *
 * 1. `execArgv` refuses a cwd outside `sitesRoot` (nothing ever runs on the harness host), and,
 *    when the argv carried a sandbox stamp, refuses a cwd whose site label differs from the
 *    granted `workspaceRoot` the stamp carries. A `..` segment inside the site folder is refused
 *    too — it would climb out while keeping the label that passes the comparison.
 * 2. `workdirDecision` is the same judgement one layer up, for the calls that never reach a
 *    stamp: `danger-full-access` skips `confine()` entirely, so the provider registers it on
 *    `tools/pre-execute` and denies the call before dispatch.
 *
 * Check 2 is the ONLY defense for `danger-full-access`; check 1 is the only one that covers a
 * tool the guard's table does not know about.
 *
 * The second half of this file is the ORPHAN REAPER's pure part: the marker a spawn is tagged with
 * and the shell script that finds it again inside the container. Termination is the one thing
 * `docker exec` cannot forward, so it is done by a second exec rather than by a signal.
 */
import { createHash } from 'node:crypto'
import { posix } from 'node:path'

/** A fleet label: what create-lane/provision accept, and nothing more. */
export const LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/

/**
 * The ripgrep binary `tool-fs-search` resolves on the HARNESS host; the container has its own.
 *
 * ⚠ THE PLATFORM SUFFIX IS NOT OPTIONAL TO MATCH. `@vscode/ripgrep` delegates to a per-platform
 * optional package, and `rgPath` points INTO it:
 *
 *     /opt/dsh/node_modules/.pnpm/@vscode+ripgrep-linux-arm64@1.18.0/node_modules/
 *       @vscode/ripgrep-linux-arm64/bin/rg
 *
 * A pattern that demanded the bare segment `ripgrep` missed that path, so the harness-side absolute
 * path travelled into `docker exec` verbatim and every `grep`/`glob` call came back as a bare
 * `exit 127` — "executable file not found", with no message naming a file. Measured 06/09 on the
 * dev cluster (the tester read it as a blocked cross-site search; it blocked EVERY search).
 */
export const RG_PACKAGED = /[\\/]@vscode[\\/]ripgrep(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?[\\/].*[\\/]rg(?:\.exe)?$/

/**
 * The other shape `resolveRgPath()` can return: a single-file runtime's sidecar NEXT TO THE
 * EXECUTABLE — `${process.execPath}-rg` on POSIX, `<dir>/<name>-rg.exe` on Windows. It is a harness
 * binary too, and it exists in the container as little as the packaged one does.
 *
 * ⚠ ONE EXACT PATH, never a `-rg` suffix rule. A pattern like `/[^\/]+-rg$/` also swallows
 * `/usr/local/bin/foo-rg` — somebody's own tool, silently replaced by ripgrep inside the container,
 * with nothing anywhere saying why it behaved oddly. The mapping exists to fix ONE binary the
 * harness resolved for itself; anything wider is a rewrite of the agent's command.
 * @param {string} [execPath] - the harness executable; defaults to this process's.
 * @returns {string} the sidecar path `resolveRgPath()` would use on this runtime.
 */
export function rgSidecar(execPath = process.execPath) {
  // Windows is decided by the executable's OWN shape, not by `process.platform`: this module is
  // pure and its tests must be able to ask about the other platform without faking a global.
  const windows = /\.exe$/i.test(execPath)
  if (!windows) return `${execPath}-rg`
  const cut = Math.max(execPath.lastIndexOf('\\'), execPath.lastIndexOf('/')) + 1
  return `${execPath.slice(0, cut)}${execPath.slice(cut).replace(/\.exe$/i, '')}-rg.exe`
}

/** Which user runs the command for which file-effect mode (decision #4 of the plan). */
export const EXEC_USER = Object.freeze({
  'danger-full-access': 'www-data',
  'workspace-write': 'www-data',
  'read-only': 'nobody'
})

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Strip trailing slashes so `/site/` and `/site` name the same root.
 * @param {string} root
 * @returns {string}
 */
function trimRoot(root) {
  const trimmed = root.replace(/\/+$/, '')
  if (trimmed === '') throw new Error('subprocess-docker: sitesRoot must not be the filesystem root')
  return trimmed
}

/**
 * The sites root a provider instance runs against: the configured value, else `TRACY_SITES_ROOT`
 * from the environment the harness was started in (how a dev machine points at its own tree), else
 * the fleet's `/site`. It lives here rather than in a cordis file because a `!!js` expression makes
 * every `cordis*.yml` unparseable to the plain js-yaml that `check-self-contained` reads them with.
 * @param {{ sitesRoot?: string } | undefined} config - the plugin config, if any.
 * @param {Record<string, string | undefined>} [env] - the process environment.
 * @returns {string} an absolute root.
 */
export function resolveSitesRoot(config, env = process.env) {
  const root = config?.sitesRoot ?? env.TRACY_SITES_ROOT ?? '/site'
  // Fail at boot, not at the first command: an empty root would make every cwd "outside".
  if (typeof root !== 'string' || root.trim() === '' || !root.startsWith('/')) {
    throw new Error(`subprocess-docker: sitesRoot must be an absolute path, got ${JSON.stringify(root)}`)
  }
  return root
}

/**
 * The daemon the docker CLI talks to: the configured `dockerHost`, else `TRACY_DOCKER_HOST` from
 * the environment, else undefined — which `cliEnv()` reads as "tombstone `DOCKER_HOST`", the
 * default that keeps a stray variable on the harness host from redirecting a seat's command.
 *
 * The environment fallback exists for the same reason `sitesRoot` has one: on the fleet this value
 * is a fact about the MACHINE (a socket proxy at `tcp://docker-proxy:2375`), not about the plugin,
 * and the image ships one profile for every host. Configuring it in `cordis.patch.yml` would mean
 * a different image, or a mutated profile, per host.
 * @param {{ dockerHost?: string } | undefined} config - the plugin config, if any.
 * @param {Record<string, string | undefined>} [env] - the process environment.
 * @returns {string | undefined} the DOCKER_HOST value, or undefined to leave the CLI on its default.
 */
export function resolveDockerHost(config, env = process.env) {
  const host = config?.dockerHost ?? env.TRACY_DOCKER_HOST
  if (host === undefined) return undefined
  // Empty means "unset", not "connect to the empty string": an unset variable in compose arrives
  // as '' and would otherwise make every docker call fail with an unreadable host error.
  if (typeof host !== 'string' || host.trim() === '') return undefined
  return host.trim()
}

/**
 * The site a cwd belongs to.
 * @param {string} cwd - absolute working directory in the harness's execution world.
 * @param {string} sitesRoot - the directory holding one folder per site label.
 * @returns {{ label: string, relative: string }}
 */
export function siteOf(cwd, sitesRoot) {
  const root = trimRoot(sitesRoot)
  if (!cwd.startsWith(`${root}/`)) {
    throw new Error(
      `subprocess-docker: cwd ${JSON.stringify(cwd)} is outside ${root} — nothing runs on the harness host`
    )
  }
  const rest = cwd.slice(root.length + 1)
  const segments = rest.split('/')
  const label = segments[0]
  if (!LABEL.test(label)) throw new Error(`subprocess-docker: ${JSON.stringify(label)} is not a site label`)
  // A `..` after the label keeps the label — and so passes the cross-site comparison — while the
  // kernel resolves the path into a different site. Refuse the segment rather than normalize it:
  // this module does no I/O, so it cannot tell a symlink from a directory.
  if (segments.includes('..')) {
    throw new Error(
      `subprocess-docker: cwd ${JSON.stringify(cwd)} is not a site path — a ".." segment leaves the site folder`
    )
  }
  return { label, relative: rest.slice(label.length).replace(/^\/+/, '') }
}

/**
 * The same directory as the container sees it.
 * @param {string} cwd
 * @param {string} sitesRoot - root on the harness side.
 * @param {string} containerRoot - root inside the web container (`/site` on the fleet).
 * @returns {string}
 */
export function containerPath(cwd, sitesRoot, containerRoot) {
  const { label, relative } = siteOf(cwd, sitesRoot)
  const base = `${trimRoot(containerRoot)}/${label}`
  return relative === '' ? base : `${base}/${relative}`
}

/**
 * Explicit environment entries as `docker exec -e` flags. The harness's own environment is never
 * forwarded: the container has its own, and the seam's scrub already applies to the docker CLI.
 * @param {Record<string, string | undefined> | undefined} env
 * @returns {string[]}
 */
export function envFlags(env) {
  const flags = []
  for (const [key, value] of Object.entries(env ?? {})) {
    if (value === undefined) continue
    if (!ENV_NAME.test(key))
      throw new Error(`subprocess-docker: ${JSON.stringify(key)} is not an environment name`)
    flags.push('-e', `${key}=${value}`)
  }
  return flags
}

/**
 * Programs that exist on the harness host but must be the container's own.
 * @param {string} program - argv[0].
 * @param {string} [sitesRoot] - when given, a program inside a SITE's own tree is never rewritten:
 *   that file belongs to the customer, and silently running something else would be worse than a
 *   missing binary.
 * @param {string} [execPath] - the harness executable, for the sidecar comparison; defaults to
 *   this process's.
 * @returns {string}
 */
export function mapProgram(program, sitesRoot, execPath) {
  // The site's own tree first, and it wins over every rule below: that file is the customer's.
  if (sitesRoot !== undefined && program.startsWith(`${trimRoot(sitesRoot)}/`)) return program
  if (RG_PACKAGED.test(program)) return 'rg'
  return program === rgSidecar(execPath) ? 'rg' : program
}

/**
 * The only arguments dsh's own ripgrep may carry when it runs in the dsh process: what `grep` and
 * `glob` build (`buildGrepCommand`, `buildGlobCommand`, plus the `--no-config` `runRipgrep` puts
 * first). Nothing that runs a program (`--pre`, `--search-zip`), follows a symlink (`--follow`) or
 * reads a file named by a value (`--file`, `--ignore-file`), and no short flag.
 * `test/fs-tool-schemas.test.mjs` fails when dsh starts building an argument this list does not hold.
 */
export const RG_HARNESS_FLAGS = Object.freeze([
  '--no-config',
  '--json',
  '--files',
  '--hidden',
  '--no-ignore',
  '--sort=modified'
])

/** The `--flag=value` members of that list, matched by prefix: the value is the model's regex or glob. */
export const RG_HARNESS_VALUE_FLAGS = Object.freeze(['--regexp=', '--glob='])

/**
 * Is this spawn dsh's OWN ripgrep, to be run in the dsh process instead of the site's container?
 *
 * `grep` and `glob` (`@deepseek-ai/dsh-tool-fs-search`) spawn the ripgrep binary inside dsh's
 * node_modules by its absolute harness path. `mapProgram` turns that into the container's `rg`, and
 * a web container without one answered every search with `exit 127`. The site folder is the same
 * path inside tracy-dsh (`/site` is a bind mount), so the search can run in place, as dsh's child.
 *
 * That trades the kernel boundary for this check, so the check is narrow:
 * - the program is the harness's binary: a normalized absolute path matching {@link RG_PACKAGED}
 *   (or exactly {@link rgSidecar}) and outside the sites tree, where a binary is a customer's;
 * - every argument before `--` is on {@link RG_HARNESS_FLAGS} or {@link RG_HARNESS_VALUE_FLAGS};
 * - the cwd is a site path (`siteOf`: inside `sitesRoot`, no `..`), and the single search root after
 *   `--` stays inside that site folder.
 * Symlinks are not resolved here. The path fence has already `realpath`ed grep's and glob's path
 * arguments in `tools/pre-execute`, and without `--follow` ripgrep does not enter a symlink it meets
 * while walking. Files are read as the dsh user, which is also who dsh's `read` tool reads them as.
 * @param {object} input
 * @param {readonly string[]} input.argv - bare (unstamped) program and arguments.
 * @param {string} input.cwd - the spawn's working directory on the harness side.
 * @param {string} input.sitesRoot - the provider's resolved sites root.
 * @param {string} [input.execPath] - the harness executable, for the sidecar comparison.
 * @param {(abs: string) => boolean} [input.allowRoot] - a root outside the site the path fence granted this call (a session's own spill).
 * @returns {boolean} true to run the argv in the dsh process; false for any other program.
 * @throws {Error} when the program is dsh's ripgrep but the cwd, an argument or the root breaks a rule.
 */
export function runsOnHarness({ argv, cwd, sitesRoot, execPath, allowRoot }) {
  const [program, ...args] = argv
  if (program === undefined || !program.startsWith('/') || posix.normalize(program) !== program) return false
  if (program.startsWith(`${trimRoot(sitesRoot)}/`)) return false
  if (!RG_PACKAGED.test(program) && program !== rgSidecar(execPath)) return false
  const siteRoot = siteRootOf(cwd, sitesRoot)
  const end = args.indexOf('--')
  for (const flag of end === -1 ? args : args.slice(0, end)) {
    if (RG_HARNESS_FLAGS.includes(flag)) continue
    if (RG_HARNESS_VALUE_FLAGS.some((prefix) => flag.startsWith(prefix))) continue
    throw new Error(
      `subprocess-docker: ripgrep argument ${JSON.stringify(flag)} is not one Tracy's grep or glob builds — refused in the Tracy process`
    )
  }
  const roots = end === -1 ? [] : args.slice(end + 1)
  if (roots.length > 1)
    throw new Error(
      `subprocess-docker: ripgrep in the Tracy process takes one search root, got ${roots.length}`
    )
  for (const root of roots) {
    const abs = posix.resolve(cwd, root)
    if (insideSite(abs, siteRoot)) continue
    // 🔒 27/09/2026: dsh's grep on the session's OWN spilled output. The path fence had already let it
    // through (`readsOwnSpill`, which knows the session), and then this refused the spawn — "ripgrep
    // launch failed", on every site. The spawn spec carries no session, so it trusts no pattern:
    // only a path the fence granted this session moments ago (`allowRoot`, provider-held, 60 s).
    if (typeof allowRoot === 'function' && allowRoot(abs)) continue
    throw new Error(
      `subprocess-docker: ripgrep root ${JSON.stringify(root)} is outside the session's site ${JSON.stringify(siteRoot)}`
    )
  }
  return true
}

/**
 * Which container, as which user, one spawn runs in. Split out of `execArgv` because the reaper
 * needs the same two answers on the way OUT: it must exec into the container the command is in,
 * as the user that owns the command's processes.
 * @param {object} input
 * @param {string} input.cwd - the session's working directory on the harness side.
 * @param {string | null | undefined} input.mode - stamped sandbox mode, or null when unconfined.
 * @param {string | null | undefined} input.root - the granted workspace root the stamp carried.
 * @param {{ sitesRoot: string, containerName: string }} input.cfg
 * @returns {{ label: string, user: string, container: string }}
 */
export function execTarget({ cwd, mode, root, cfg }) {
  const { label } = siteOf(cwd, cfg.sitesRoot)
  if (root !== null && root !== undefined && siteOf(root, cfg.sitesRoot).label !== label) {
    throw new Error(
      `subprocess-docker: cwd ${JSON.stringify(cwd)} belongs to another site than the session's workspace ${JSON.stringify(root)}`
    )
  }
  const key = mode ?? 'danger-full-access'
  // Own keys only: a mode named like an Object.prototype member is unknown, not a function.
  const user = Object.hasOwn(EXEC_USER, key)
    ? EXEC_USER[/** @type {keyof typeof EXEC_USER} */ (key)]
    : undefined
  if (user === undefined) throw new Error(`subprocess-docker: unknown sandbox mode ${JSON.stringify(mode)}`)
  return { label, user, container: cfg.containerName.replace('{label}', label) }
}

/**
 * Site secrets a web container carries in its environment (`render-compose.sh`) that no agent command
 * needs, blanked on every exec (`-e KEY=`): `docker exec` hands a command the container's whole
 * environment, so `env` printed them (survey 08/10/2026, H2). Joomla's CLI reads its database from
 * `configuration.php`, never from `JOOMLA_DB_PASSWORD` (the image's installer does); the admin password
 * is provisioning's; EmDash's server, not a shell, uses its encryption key, and a rebuild is a host job;
 * the mail token is the site's own sendmail's.
 */
export const BLANKED_SECRET_ENV = Object.freeze([
  'JOOMLA_ADMIN_PASSWORD',
  'JOOMLA_DB_PASSWORD',
  'EMDASH_ENCRYPTION_KEY',
  'TRACY_MAIL_TOKEN'
])

/**
 * Secrets blanked as well in `read-only` mode. WordPress's `wp-config.php` reads its database password
 * from the environment, so wp-cli needs it to change anything; a seat that may not write keeps no road
 * to the database (as `nobody` it could not write a file, but with the password it wrote rows).
 */
export const READ_ONLY_BLANKED_ENV = Object.freeze(['WORDPRESS_DB_PASSWORD'])

/**
 * Why a command does not run in `read-only` mode, and what to do instead. That mode is a seat that may
 * only read the site (a viewer, a visitor; Tracy's people pick no permission mode). Its commands ran as
 * `nobody`, which stops file writes, not a PHP or CLI process reading Joomla's `configuration.php` and
 * writing the database with it (survey 08/10/2026, H2). With the database password blanked as well, a
 * shell there serves nothing a read tool does not.
 */
export const READ_ONLY_SHELL_REFUSAL =
  'subprocess-docker: this seat can only read the site, so shell commands do not run for it. Read files with read, grep or glob, and pages with tracy_site page.text; a change needs an owner or editor.'

/**
 * The `-e KEY=` flags that blank the secrets for one mode.
 * @param {string | null} mode
 * @returns {string[]}
 */
export function blankedSecretFlags(mode) {
  const names = mode === 'read-only' ? [...BLANKED_SECRET_ENV, ...READ_ONLY_BLANKED_ENV] : BLANKED_SECRET_ENV
  return names.flatMap((name) => ['-e', `${name}=`])
}

/**
 * Build the docker exec argv for one spawn.
 * @param {object} input
 * @param {readonly string[]} input.argv - bare (unstamped) program and arguments.
 * @param {string} input.cwd - the session's working directory on the harness side.
 * @param {Record<string, string | undefined> | undefined} input.env - explicit environment for the command.
 * @param {string | null} input.mode - stamped sandbox mode, or null when unconfined.
 * @param {string | null} input.root - the granted workspace root the stamp carried, null when
 *   unconfined. When present, the cwd must name the same site: `tool-bash` hands the seam a
 *   model-chosen `workdir` as this cwd, and inside `sitesRoot` such a path is a valid site folder.
 * @param {boolean} input.tty - allocate a terminal (terminal sessions) or pipe stdin (everything else).
 * @param {string} [input.execId] - the reaper marker for this spawn; omitted leaves the command
 *   untagged and unreapable.
 * @param {{ docker: string, sitesRoot: string, containerRoot: string, containerName: string }} input.cfg
 * @returns {string[]}
 */
export function execArgv({ argv, cwd, env, mode, root, tty, execId, cfg }) {
  const { label, user } = execTarget({ cwd, mode, root, cfg })
  const [program, ...rest] = argv
  if (program === undefined || program === '')
    throw new Error('subprocess-docker: argv must contain a program')
  return [
    cfg.docker,
    'exec',
    tty ? '-it' : '-i',
    '-u',
    user,
    '-w',
    containerPath(cwd, cfg.sitesRoot, cfg.containerRoot),
    ...envFlags(env),
    // After the caller's own entries, for the same reason as the marker below: docker keeps the last
    // `-e` for a repeated key, so no command can ask a blanked secret back.
    ...blankedSecretFlags(mode),
    // LAST, so a caller's own environment entry of the same name cannot displace the marker the
    // reaper will look for: docker keeps the last `-e` for a repeated key.
    ...(execId === undefined ? [] : ['-e', `${EXEC_ID_VAR}=${assertExecId(execId)}`]),
    cfg.containerName.replace('{label}', label),
    mapProgram(program, cfg.sitesRoot),
    ...rest
  ]
}

/**
 * The environment variable that tags one exec's process tree inside the container.
 *
 * `docker exec` forwards NO signals: terminating the docker CLI on the harness side leaves the
 * command running inside the container (measured — a timed-out `sleep 300` kept sleeping). The
 * harness has no pid inside the container to signal, and the container's pid namespace is the only
 * place the tree is visible. So the spawn tags itself, and termination sends a second, tiny exec in
 * to find that tag in `/proc/<pid>/environ` and signal what carries it.
 */
export const EXEC_ID_VAR = 'TRACY_EXEC_ID'

/** What may appear in a marker. It is interpolated into a shell script, so it is not a free string. */
export const EXEC_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/

/**
 * @param {string} execId - candidate marker value.
 * @returns {string} the same value, once it cannot end a shell word.
 */
export function assertExecId(execId) {
  if (typeof execId !== 'string' || !EXEC_ID.test(execId))
    throw new Error(`subprocess-docker: ${JSON.stringify(execId)} is not an exec id`)
  return execId
}

/**
 * The sweep's exit code for "no process carried the marker". Distinct from 0 (reaped something)
 * and from the codes the docker CLI itself uses for a failure to run at all (125/126/127), so the
 * caller can act on it: a spawn terminated within milliseconds may have been swept BEFORE the
 * daemon started its exec, and that case — and only that case — is worth one retry.
 */
export const REAPER_NOTHING_FOUND = 9

/**
 * The reaper, as a POSIX shell script for the container's own `sh`.
 *
 * It scans `/proc` for processes whose environment carries the marker, sends them TERM, waits, and
 * KILLs whatever is left. The exec user owns every process this can find — its own — so no root is
 * needed, and `nobody` reaps its own read-only commands the same way.
 *
 * Three properties matter more than brevity:
 * - It never reads its own environment as a match: the marker lives in a shell VARIABLE (not
 *   exported, so not in `environ`) and the script's own pid is skipped besides.
 * - It is self-bounding. The harness kills the docker CLI after a short timeout, and — by the very
 *   limit this whole mechanism exists for — that does not stop this script inside the container.
 *   The `sleep` and the second `kill` therefore complete on their own.
 * - It SAYS whether it found anything, with {@link REAPER_NOTHING_FOUND}. `docker exec` passes the
 *   command's exit code back, and "nothing carried the marker" is the answer the caller needs to
 *   tell an already-finished command apart from one whose exec had not started yet.
 * @param {string} execId - the marker value to hunt for.
 * @param {number} graceSeconds - whole seconds between TERM and KILL.
 * @returns {string}
 */
export function reaperScript(execId, graceSeconds) {
  const marker = `${EXEC_ID_VAR}=${assertExecId(execId)}`
  if (!Number.isInteger(graceSeconds) || graceSeconds < 0 || graceSeconds > 60)
    throw new Error(
      `subprocess-docker: grace must be 0-60 whole seconds, got ${JSON.stringify(graceSeconds)}`
    )
  return [
    `marker='${marker}'`,
    'self=$$',
    'pids=',
    'for dir in /proc/[0-9]*; do',
    'pid=${dir#/proc/}',
    // `2>/dev/null` comes BEFORE the input redirect on purpose: a `/proc/<pid>/environ` this user
    // may not read (any process that dropped privileges is non-dumpable, apache's workers
    // included) makes the SHELL print "cannot open", and only a stderr already redirected swallows
    // it. Measured 06/09 — the other order left seven lines of noise on every reap.
    'if [ "$pid" != "$self" ] && tr "\\0" "\\n" 2>/dev/null < "$dir/environ" | grep -qxF "$marker"; then',
    'pids="$pids $pid"',
    'fi',
    'done',
    `[ -n "$pids" ] || exit ${REAPER_NOTHING_FOUND}`,
    'kill -TERM $pids 2>/dev/null',
    `sleep ${graceSeconds}`,
    'kill -KILL $pids 2>/dev/null',
    'exit 0'
  ].join('\n')
}

/**
 * The docker exec argv that runs the reaper. Same container, same user, no tty and no stdin: this
 * one is not the seat's command, it is the harness cleaning up after it.
 * @param {object} input
 * @param {string} input.execId - the marker the spawn was tagged with.
 * @param {string} input.user - the user the spawn ran as (it owns the processes to signal).
 * @param {string} input.container - the container the spawn ran in.
 * @param {number} input.graceSeconds - whole seconds between TERM and KILL.
 * @param {{ docker: string }} input.cfg
 * @returns {string[]}
 */
export function reaperArgv({ execId, user, container, graceSeconds, cfg }) {
  return [cfg.docker, 'exec', '-u', user, container, 'sh', '-c', reaperScript(execId, graceSeconds)]
}

/**
 * THE PATH FENCE — the half of confinement that has nothing to do with subprocesses.
 *
 * Everything above fences the SHELL: argv reaching `ctx.subprocess`, which lands in the site's own
 * container. dsh's own filesystem tools (`read` `write` `edit` `read_image` from
 * `@deepseek-ai/dsh-tool-fs`, `glob` `grep` from `dsh-tool-fs-search`, `str_replace_editor`) never
 * take that path: they run IN THE DSH PROCESS, where a host dsh has every site mounted at `/site`
 * and its own `/desk-home` — the seat book, `dsh-passwords.env`, the model keys. `dsh-fs-sandbox`
 * fences the two MUTATIONS only; its own header says "reads pass through untouched: every mode
 * permits reading". So without this table a `read_only` guest on one site could read another
 * customer's `wp-config.php`, or the host's `MCP_SEAT_SECRET`.
 *
 * Two strengths, on purpose:
 * - A DECLARED path argument is fenced even when it does not exist yet — resolution climbs to the
 *   nearest existing ancestor — because `write /desk-home/cordis.patch.yml` creates a file that the
 *   next boot of dsh reads as a plugin layer.
 * - Any OTHER string argument, of any tool, is fenced only when it resolves to a path that EXISTS.
 *   That is what keeps the fence from denying a todo item or a commit message that happens to
 *   contain a slash.
 *
 * `content` names the arguments that are FILE CONTENT, never paths: they are skipped entirely, so a
 * file whose text mentions `/desk-home` is still writable inside one's own site.
 */
export const FS_TOOL_ARGS = Object.freeze({
  read: { paths: ['file_path'], content: [] },
  read_image: { paths: ['file_path'], content: [] },
  // `sandbox_permissions` and `justification` are the escalation fields `FsSandboxController`
  // spreads into both mutations — a mode name and a sentence for the user, never a path.
  write: { paths: ['file_path'], content: ['content', 'sandbox_permissions', 'justification'] },
  edit: {
    paths: ['file_path'],
    content: ['old_string', 'new_string', 'sandbox_permissions', 'justification']
  },
  str_replace_editor: {
    paths: ['path'],
    // `insert_line` and `view_range` are numbers whose DESCRIPTIONS talk about paths; naming them
    // here is what keeps `test/fs-tool-schemas.test.mjs` from reading them as unfenced paths.
    content: ['file_text', 'new_str', 'old_str', 'insert_line', 'view_range']
  },
  // `pattern` IS a path pattern for glob (`src/**/*.ts`), and a REGEX for grep (`/etc/` is a
  // legitimate expression, not a directory) — so it is a path in one and content in the other.
  glob: { paths: ['path', 'pattern'], content: [] },
  grep: { paths: ['path'], content: ['pattern', 'include'] },
  // Also covered by `workdirDecision`, deliberately. That one compares site LABELS with no I/O;
  // this one resolves symlinks. A `/site/wpdemo/link-to-elsewhere` passes the first and fails here.
  bash: { paths: ['workdir'], content: ['command', 'description'] },
  // `pwsh` was in NEITHER table until the schema test found it (06/09). It is a composed row in the
  // fleet profile, it takes the same model-chosen `workdir` as `bash`, and whether its shell exists
  // in the container is not a boundary — the fence must not depend on a binary being missing.
  pwsh: { paths: ['workdir'], content: ['command', 'description'] },
  terminal_open: { paths: ['cwd'], content: [] }
})

/**
 * Arguments of NON-file tools that name a page of the SITE (a URL path like `/` or `/about`), never
 * a file. The generous branch of `pathCandidates` treats any string with a slash as a possible file
 * and fences it when it exists — and `/` always exists, so `tracy_design_check {"path":"/"}` was
 * refused as a file outside the site (final acceptance on `dsgnm`, 30/09/2026).
 *
 * 🔒 Per tool AND per argument, and never a tool of `FS_TOOL_ARGS` (`pathCandidates` reads this
 * table only for tools that one does not know; `test/provider.test.mjs` also asserts the two are
 * disjoint). Every other argument of a listed tool is still judged by the generous branch.
 */
export const URL_PATH_ARGS = Object.freeze({
  tracy_design_check: Object.freeze(['path'])
})

/**
 * The site folder a session may touch, and nothing above it.
 * @param {string} sessionCwd - the session's own workspace, from the session header.
 * @param {string} sitesRoot - the provider's resolved sites root.
 * @returns {string} `<sitesRoot>/<label>`.
 */
export function siteRootOf(sessionCwd, sitesRoot) {
  const { label } = siteOf(sessionCwd, sitesRoot)
  return `${trimRoot(sitesRoot)}/${label}`
}

/**
 * Is a RESOLVED path inside the session's site folder? String comparison only — the caller has
 * already resolved symlinks, which is the whole reason this is not a `startsWith` at the call site.
 * @param {string} resolved - an absolute, symlink-resolved path.
 * @param {string} siteRoot - an absolute, symlink-resolved site folder.
 * @returns {boolean}
 */
export function insideSite(resolved, siteRoot) {
  return resolved === siteRoot || resolved.startsWith(`${siteRoot}/`)
}

/**
 * THE ONE DOOR THROUGH THE FENCE: an image or file the viewer themselves put in this chat.
 *
 * WHY IT HAS TO EXIST. Measured 16/09 on `demojoomla`: a customer pasted a screenshot, dsh stored it
 * and handed the agent the path, the model accepted images — and the fence refused the last hop,
 * `read_image file_path "/desk-home/attachments/v1/objects/5d/5db1085f…" is outside the session's
 * site "/site/demojoomla"`. It was right to: `/desk-home` is where `dsh-passwords.env`, the seat
 * book and the model keys live, and this fence is the only thing between a seat and all of it. But
 * the attachment store is not those things — it is what the person typing just handed the agent,
 * and refusing it makes pasting an image into chat do nothing at all.
 *
 * A FILE ATTACHED TO THE CHAT (HTML, CSS, anything that is not an image) is never inlined: dsh stores
 * it at `<DSH_HOME>/attachments/v1/files/<2>/<sha256>/<name>` (a hard link, so the resolved path
 * stays there) and tells the model to `read` that path. Production 01/10/2026: a customer attached a
 * design `.html` on "Add a new site" and the agent could not open it, because this door let only
 * `read_image` through.
 *
 * 🔒 THE OPENING IS AS NARROW AS IT CAN BE, and each narrowing is load-bearing:
 * - TWO READ-ONLY TOOLS. `read_image` for the store, `read` for its `v1/files/` subtree only.
 *   `glob`, `grep`, `write`, `edit` and `bash` stay fenced out of `/desk-home` exactly as before —
 *   so nothing here can list the store or open a secret. `read` refuses a directory
 *   (`FS_NOT_REGULAR_FILE`), so it cannot list either.
 * - ONE SUBTREE. `<DSH_HOME>/attachments/`, never `/desk-home` at large.
 * - FAIL CLOSED. No `DSH_HOME` in the environment means no opening: the fence keeps its old answer
 *   rather than guessing at a root.
 *
 * ⚠ THE RESIDUAL RISK, WRITTEN DOWN RATHER THAN GLOSSED. One host dsh serves every site on the
 * machine and they share this store, so an object under it may belong to another customer's
 * session. What stands between them is that the store is content-addressed: opening one means
 * already holding its sha256, and the only thing that hands an agent a digest is its OWN session's
 * messages. `glob` and `grep` cannot enumerate the directory (still fenced), and `bash` runs by
 * `docker exec` inside the site's own web container, which does not mount `/desk-home` at all. If a
 * future change gives some tool a way to list that directory, this opening stops being safe and
 * must be closed with it.
 *
 * @param {string} tool - the tool name as registered.
 * @param {string} resolved - the symlink-resolved path it wants to open.
 * @param {string | null} attachmentsRoot - `<DSH_HOME>/attachments`, or null when unknown.
 * @returns {boolean}
 */
export function readsOwnAttachment(tool, resolved, attachmentsRoot) {
  if (typeof attachmentsRoot !== 'string' || attachmentsRoot === '') return false
  const root = trimRoot(attachmentsRoot)
  if (tool === 'read_image') return resolved.startsWith(`${root}/`)
  if (tool === 'read') return resolved.startsWith(`${root}/v1/files/`)
  return false
}

/**
 * Whether one tool call only READS this session's own spilled output.
 *
 * 🔒 WHY THIS DOOR. When a tool result is too long for the context, dsh's local spill store writes
 * it to `<tmp>/dsh-spill-<random>/session-<first 12 hex of sha256(session id)>/…` and tells the model to
 * read or grep that path. That is outside every site, so the fence refused the one file the
 * harness had just pointed at — on a sealed Business quickstart the agent then tried Grep, then
 * Bash, then spent five minutes guessing module ids (j-ee6vsk, 23/09/2026).
 *
 * 🔒 WHY IT IS SAFE, AND WHAT WOULD MAKE IT UNSAFE. One dsh serves every site, and every session's
 * spill directory sits under the same root, so the door is the session's OWN directory and nothing
 * above it: `read`, `grep`, `glob` only (never a write), the directory named by this session's id
 * hash, never the root or a sibling. `bash` runs by `docker exec` in the site's own container, which
 * does not see this `/tmp` at all. A tool that could list the spill root would reopen the question.
 *
 * @param {string} tool - the tool name as registered.
 * @param {string} resolved - the symlink-resolved path it wants to open.
 * @param {string | null | undefined} sessionId - the calling session's id.
 * @param {string} tmp - the real temp directory dsh's spill root defaults under.
 * @returns {boolean}
 */
export function readsOwnSpill(tool, resolved, sessionId, tmp) {
  if (!['read', 'grep', 'glob'].includes(tool) || typeof sessionId !== 'string' || sessionId === '')
    return false
  const hash = createHash('sha256').update(sessionId).digest('hex').slice(0, 12)
  const root = trimRoot(tmp).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${root}/dsh-spill-[A-Za-z0-9_-]+/session-${hash}(?:/.*)?$`).test(resolved)
}

/**
 * Where dsh keeps what a viewer attached: `<DSH_HOME>/attachments`, or null when the environment
 * does not say. Null is a refusal, not a default — see `readsOwnAttachment`.
 * @param {Record<string, string | undefined>} env - the process environment.
 * @returns {string | null}
 */
export function attachmentsRootOf(env) {
  const home = typeof env?.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return home === '' || !home.startsWith('/') ? null : `${trimRoot(home)}/attachments`
}

/**
 * Which arguments of one tool call have to be checked as paths.
 * @param {string} name - the tool name as registered.
 * @param {unknown} args - the parsed tool arguments.
 * @returns {{ known: boolean, candidates: { arg: string, value: string, declared: boolean }[], unparseable: string[] }}
 *   `declared` marks an argument the schema says is a path (fenced even when it does not exist);
 *   `unparseable` names a declared path argument that is present but not a usable string.
 */
export function pathCandidates(name, args) {
  // 🔒 Own keys only (Object.hasOwn): a tool named like an Object.prototype member (`toString`,
  // `constructor`, `__proto__`) used to find that member as its row and throw on `table.content`.
  // It is now an unknown tool, so the generous branch below still fences every slash-bearing string.
  const table = Object.hasOwn(FS_TOOL_ARGS, name)
    ? FS_TOOL_ARGS[/** @type {keyof typeof FS_TOOL_ARGS} */ (name)]
    : undefined
  const known = table !== undefined
  // A file tool never reads this table, so no URL-path exemption can reach one.
  /** @type {readonly string[]} */
  const urlPaths =
    known || !Object.hasOwn(URL_PATH_ARGS, name)
      ? []
      : URL_PATH_ARGS[/** @type {keyof typeof URL_PATH_ARGS} */ (name)]
  /** @type {{ arg: string, value: string, declared: boolean }[]} */
  const candidates = []
  /** @type {string[]} */
  const unparseable = []
  if (typeof args !== 'object' || args === null) return { known, candidates, unparseable }
  for (const [arg, value] of Object.entries(/** @type {Record<string, unknown>} */ (args))) {
    if (known && table.content.includes(arg)) continue
    if (known && table.paths.includes(arg)) {
      if (value === undefined || value === null) continue
      if (typeof value !== 'string' || value.trim() === '') {
        unparseable.push(arg)
        continue
      }
      candidates.push({ arg, value, declared: true })
      continue
    }
    if (urlPaths.includes(arg)) continue
    // Generous, for the tool whose schema this table has never seen: a string that could be a path.
    // Existence is what decides it later, so a sentence with a slash in it costs nothing.
    if (typeof value !== 'string' || !value.includes('/')) continue
    candidates.push({ arg, value, declared: false })
  }
  return { known, candidates, unparseable }
}

/**
 * The deny a path outside the session's site earns. One shape for every tool, matching
 * `workdirDecision`'s, because the model reads these and two dialects would be two rules.
 * @param {string} tool - the tool name.
 * @param {string} arg - the argument that named the path.
 * @param {string} value - what the model asked for.
 * @param {string} resolved - where it actually leads (after symlinks).
 * @param {string} siteRoot - the only folder this session may touch.
 * @returns {string}
 */
export function outsideSiteReason(tool, arg, value, resolved, siteRoot, platform = null) {
  const via = resolved === value ? '' : ` (resolves to ${JSON.stringify(resolved)})`
  const next = appNext(value, platform)
  return `subprocess-docker: ${tool} ${arg} ${JSON.stringify(value)}${via} is outside the session's site ${JSON.stringify(siteRoot)}. ${next}`
}

/**
 * Which "what next" a fenced path earns.
 *
 * 🔒 THE CMS DECIDES IT, NOT THE PATH (28/09/2026). `/app` is where the EmDash template's code is
 * mounted, and the answer for it names `tracy_emdash` — a tool a WordPress or Joomla site does not
 * have. It was chosen by the path alone, so a model on a WordPress site that reached for `/app` (its
 * own guess, or a container that really has one) was told to read its content with `tracy_emdash`: a
 * road that cannot work, in place of the one that can. The EmDash answer is given only where the site
 * IS EmDash; where the CMS could not be read, the answer names the road every CMS has
 * (`tracy_site content.replace`) and claims no tool.
 * @param {string} value - the path the model named.
 * @param {string | null} platform - `'emdash'`, `'wordpress'`, `'joomla'`, or null when unread.
 * @returns {string}
 */
function appNext(value, platform) {
  if (!inEmdashApp(value)) return OUTSIDE_SITE_NEXT
  if (platform === 'emdash') return EMDASH_APP_NEXT
  if (platform === 'wordpress' || platform === 'joomla') return OUTSIDE_SITE_NEXT
  return APP_NEXT_ANY_CMS
}

/**
 * The `/app` answer for a site whose CMS could not be read: the one road all three have. It names no
 * CMS tool, because naming the wrong one costs the model the steps this text exists to save. It says
 * what is true whatever the CMS — the file tools do not reach `/app` — and no longer that the code is
 * "not editable from chat": on EmDash it is, from a shell (`EMDASH_APP_NEXT`).
 */
export const APP_NEXT_ANY_CMS =
  "/app is the site container's application code, which the file tools do not reach. Words on a page are content: tracy_site content.replace {find, replace, dryRun:true} names the field that holds them, writing nothing."

/**
 * What the model does next after a file tool is fenced. 🔒 27/09/2026 A1 bench: 16 file-tool calls into
 * EmDash's `/app` were refused across 66 cases, each answered with the rule alone, and the agent found
 * the way in by trial (`ls /`, `ls -la /app`, then `grep` through bash) — two to four steps per case.
 * `bash` runs by `docker exec` in the site's own container, so a file there is one `grep -rn` away;
 * the fence stays exactly where it was. `/app` itself has its own answer, `EMDASH_APP_NEXT`.
 *
 * 🔒 A ROAD FOR EVERY MODE, NOT ONLY THE ONES WITH A SHELL (28/09/2026). Writer and SEO/GEO carry no
 * `bash`, and this answer was the whole of their way on: "read with bash there" sent them to a tool
 * they do not have. So it names where the site's own files are (`.webroot/`, inside the folder the
 * file tools reach), bash for a mode that has it, and the site's own reads for one that does not.
 */
export const OUTSIDE_SITE_NEXT =
  "File tools reach only that folder (the site's files: .webroot/). Elsewhere in the container, bash reads (grep -rn, cat) if this mode has it; tracy_site content.read and page.text read the site."

/**
 * What the model does next after a file tool is fenced under `/app`, the EmDash template's own code
 * (`render-compose.sh`: `app:/app`). 🔒 28/09/2026 bench: 9 refused `grep`/`read` calls into it in 24
 * EmDash cases, each one hunting for where a text is printed — the words live in content, and the site
 * context says so ("never in `/app`"). So this answer names first the read that finds a text's field:
 * `content.replace`'s dryRun answers where the words are stored and writes nothing (`dryRunAnswer`).
 *
 * 🔒 AND THE CODE IS EDITABLE, FROM A SHELL (ADR 0022). This said "not editable from chat", while the
 * persona and the site's AGENTS.md said the owner edits `/app` and rebuilds: www-data owns `/app`, `bash`
 * runs in the site's container, and `site.rebuild` serves the result to the site's own chat. What is
 * true is narrower: the FILE TOOLS do not reach it, and a mode without bash cannot change it. The
 * persona (`config/mode-matrix.json`), the AGENTS.md brief and the site context's EmDash row say the
 * same. The fence stays exactly where it was.
 */
export const EMDASH_APP_NEXT =
  "/app is this site's code; file tools cannot reach it. Words are content: tracy_site content.replace {find, replace, dryRun:true} names their field. Code: bash in the container (if this mode has it), then tracy_site_build_emdash request site.rebuild."

/**
 * Whether a path the model named is the EmDash app root or under it.
 * @param {string} value
 */
function inEmdashApp(value) {
  const p = posix.normalize(value)
  return p === '/app' || p.startsWith('/app/')
}

/**
 * Which tools carry a MODEL-CHOSEN working directory, and under which argument name. `bash` from
 * `@deepseek-ai/dsh-tool-bash` and `pwsh` from `@deepseek-ai/dsh-tool-pwsh` take `workdir`;
 * `terminal_open` from `@deepseek-ai/dsh-tool-terminal` takes `cwd`. `@deepseek-ai/dsh-tool-bash-persistent` also registers a tool called `bash`, but its
 * schema has only `command` — it takes its cwd from the session header — so the absent argument
 * reads as "allow" and no special case is needed.
 */
export const WORKDIR_ARG = Object.freeze({ bash: 'workdir', pwsh: 'workdir', terminal_open: 'cwd' })

/**
 * Should this tool call be allowed to name this working directory? The pure half of the
 * `tools/pre-execute` guard, and the ONLY defense for `danger-full-access`: that mode never
 * reaches `confine()`, so its argv carries no stamp for `execArgv` to check a root against.
 *
 * A relative or absent directory is the tool's own business — dsh resolves it against the session
 * workspace. An absolute one is a claim, and it is checked against the session's own workspace.
 * @param {object} input
 * @param {string} input.name - the tool name as registered.
 * @param {unknown} input.args - the parsed tool arguments, deep-frozen by the registry.
 * @param {string | undefined} input.sessionCwd - `exec.agent?.session.header.cwd`.
 * @param {string} input.sitesRoot - the provider's resolved sites root.
 * @returns {string | null} null to allow, else the deny reason the model is shown.
 */
export function workdirDecision({ name, args, sessionCwd, sitesRoot }) {
  // Own keys only: a tool named like an Object.prototype member has no working-directory argument.
  if (!Object.hasOwn(WORKDIR_ARG, name)) return null
  const argName = WORKDIR_ARG[/** @type {keyof typeof WORKDIR_ARG} */ (name)]
  if (typeof args !== 'object' || args === null) return null
  const value = /** @type {Record<string, unknown>} */ (args)[argName]
  // A relative path is resolved against the session workspace by the tool itself; only an
  // absolute one can name a folder the seat was never granted.
  if (typeof value !== 'string' || !value.startsWith('/')) return null
  if (sessionCwd === undefined) {
    return `subprocess-docker: no session workspace to check the working directory against — ${JSON.stringify(value)} is refused`
  }
  try {
    if (siteOf(value, sitesRoot).label !== siteOf(sessionCwd, sitesRoot).label) {
      return `subprocess-docker: ${argName} ${JSON.stringify(value)} belongs to another site than the session's workspace ${JSON.stringify(sessionCwd)}`
    }
  } catch (error) {
    // Outside the root, not a label, a `..` climb: siteOf already says which, and the guard must
    // turn every one of them into a deny rather than a crash inside the tool pipeline.
    return error instanceof Error ? error.message : String(error)
  }
  return null
}
