/**
 * tracy-subprocess-docker — `ctx.subprocess` for a dsh that serves many sites from one process.
 *
 * WHAT IT REPLACES. `@deepseek-ai/dsh-subprocess-local` spawns on the harness host, so every
 * shell the agent runs sees the harness's own filesystem and every site it can reach. Until
 * 05/09 Tracy answered that with one dsh container PER SITE (a "lane"): 270 MB and a plugin tree
 * per site, seeded one by one. This provider is what lets ONE dsh serve them all: the command
 * runs inside the site's own web container, so the kernel — not a JavaScript check — keeps one
 * site's shell out of another's files.
 *
 * HOW A COMMAND FINDS ITS CONTAINER. `src/route.mjs` reads the site label out of the spawn's
 * `cwd` — never out of argv or env. But that cwd is not always the session's own: `tool-bash`
 * passes a model-supplied `workdir` verbatim, and inside `sitesRoot` such a path names a real
 * site folder. THREE defenses keep a seat inside the site it was granted — the first two on the
 * shell's path, the third on a path that has nothing to do with shells:
 *
 * 1. THE STAMPED ROOT. `confine()` stamps the policy's `workspaceRoot` — the seam's own
 *    resolution of the session cwd — next to the mode, and `execArgv` refuses a cwd whose site
 *    label differs from it (and any `..` segment, which would keep the label while climbing out).
 * 2. THE PRE-EXECUTE GUARD. `registerWorkdirGuard()` denies a `bash` or `terminal_open` call
 *    whose absolute working directory names another site, before the tool ever dispatches.
 *
 * (`danger-full-access` never reaches `confine()`, so it carries NO stamp: for that mode defense 2
 * is the only one on the shell's path. A cwd outside `sitesRoot` is refused by both, never run
 * locally.)
 *
 * 3. THE PATH FENCE — and it is not about subprocesses at all. dsh's own filesystem tools
 *    (`read` `write` `edit` `read_image` `glob` `grep` `str_replace_editor`) run INSIDE the dsh
 *    process, which on a host dsh has every site at `/site` and its own `/desk-home`: the seat
 *    book, `dsh-passwords.env`, the model keys. They never reach `ctx.subprocess`, and
 *    `dsh-fs-sandbox` fences only the two mutations — reads pass at EVERY mode, its own header
 *    says so. `registerPathFence()` therefore resolves every path-shaped argument of every tool
 *    (symlinks included) and refuses anything outside the session's own site folder, whatever the
 *    mode. See `FS_TOOL_ARGS` in `src/route.mjs` for the table and why it is shaped that way.
 *
 * THE LOCAL RUNTIME STAYS UNDERNEATH. Only argv/cwd/env are rewritten; process trees, output
 * collection, spill files, SIGTERM→SIGKILL escalation and terminal handles are the local
 * implementation's, verbatim. The docker CLI is the child; the command is its grandchild.
 *
 * ONE EXCEPTION: dsh's own ripgrep. `grep` and `glob` spawn the binary from dsh's node_modules,
 * which no web container has, so that argv runs in the dsh process under the narrow rules of
 * `runsOnHarness()` in `src/route.mjs`.
 *
 * KNOWN LIMITS (measured in the plan's spike, keep them current):
 * - `inspectForeground()` on a terminal reports the docker CLI's process group, not the shell's
 *   inside the container. Ctrl-C still works: with `-t` the ^C byte travels the pty.
 * - The exec user is `www-data` or `nobody`; the web image must have both, and the tools the
 *   agent expects (bash, git, rg, wp, php) — see dev/web.Dockerfile.
 * - Terminating the docker CLI (timeout, abort) does not terminate the process inside the
 *   container: `docker exec` forwards no signals. A timed-out `sleep 300` kept sleeping in the
 *   container (measured in the spike, measurement 5b). The ORPHAN REAPER below answers it: every
 *   exec is tagged `TRACY_EXEC_ID=<uuid>`, and both termination paths send a second, tiny exec in
 *   as the same user to TERM — then KILL — whatever `/proc/<pid>/environ` still carries the tag.
 *   A command (`spawn`) that simply EXITS is swept too (since 09/10/2026): its own process is gone,
 *   but a child it backgrounded (`sh -c 'while :; do …; done' &`) still carries the tag, and such a
 *   loop could keep flipping a symlink between the path fence's check and dsh's own open.
 *   RESIDUAL, and it is not small: the scan reads environments, so a process that re-execs itself
 *   with a scrubbed environment (`env -i`, a daemon that clears its own) is invisible to it and
 *   survives — that stays true after the change above, and it is how a determined background loop
 *   still outlives its command. So does anything the exec user does not own, and anything started
 *   after the reaper has already swept. The reaper narrows the leak; it does not close it.
 * - Environment TOMBSTONES are dropped, not applied. The seam's `env` reads an `undefined` value
 *   as "remove this ambient entry from the child", but `docker exec` can only ADD variables
 *   (`-e KEY=VALUE`) — it cannot unset one the image already defines. So a caller asking for a
 *   variable to be absent gets the image's value instead. Only `cliEnv()` tombstones bite, and
 *   they bite the docker CLI on the harness host, where the seam's contract does hold.
 * - A command the KERNEL kills in the container — the site's memory cap, since 28/09/2026 — comes
 *   back from `docker exec` as a bare exit 137. `explainKill()` below adds one line saying so after
 *   the command's stderr, read from the container's own memory accounting (`src/kill-note.mjs`).
 * - A command sees the web container's environment, which holds the site's secrets
 *   (`render-compose.sh`). Every exec blanks the ones no agent command needs (`BLANKED_SECRET_ENV` in
 *   `src/route.mjs`: Joomla's database and admin passwords, EmDash's encryption key, the mail token),
 *   and a `read-only` seat runs no command in the container at all (`READ_ONLY_SHELL_REFUSAL`; its
 *   grep/glob ripgrep still runs on the harness). An editor's command keeps
 *   `WORDPRESS_DB_PASSWORD` (wp-cli needs it), and Joomla's `configuration.php` holds its password as
 *   text. Neither crosses a site: every site has a MariaDB server of its own (its compose's `db`), which
 *   holds that site's database only, and the web container already reaches it. A database user of the
 *   agent's own was weighed and not built (09/10/2026): it would still need read and write on every
 *   site table, so it would narrow only admin rights inside an already separate server, at the cost of
 *   changing provisioning and migrating every site.
 * - The `-e KEY=VALUE` flags are visible on the harness host: `ps` shows the docker CLI's argv,
 *   and `docker inspect` shows the exec's. That is acceptable only because the host is Tracy's
 *   own and no seat has a shell on it; a secret handed to a command this way is readable by
 *   anyone with host access, so route real secrets through the image or a mount, not through env.
 */
import { execFile, spawn as spawnChild } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, posix as posixPath, resolve as resolvePath } from 'node:path'

import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import z from '@deepseek-ai/schemastery'
import { DockerSandbox } from '@tracy/dsh-sandbox-docker'
import { unstamp } from '@tracy/dsh-sandbox-docker/stamp'
import { hasContentContract, directDbWriteReason } from './src/content-contract.mjs'
import {
  KILLED_EXIT,
  KILL_PROBE_TIMEOUT_MS,
  killNote,
  killProbeArgv,
  parseKillProbe,
  withNote
} from './src/kill-note.mjs'
import { boundBashResult } from './src/output-bound.mjs'
import {
  commandApprovalReason,
  newWebrootPhpReason,
  platformCoreReason,
  readTargetArg,
  secretsFileReason,
  writeTargetArg
} from './src/site-guards.mjs'

import {
  REAPER_NOTHING_FOUND,
  READ_ONLY_SHELL_REFUSAL,
  execArgv,
  execTarget,
  attachmentsRootOf,
  readsOwnSpill,
  insideSite,
  outsideSiteReason,
  pathCandidates,
  readsOwnAttachment,
  reaperArgv,
  resolveDockerHost,
  resolveSitesRoot,
  runsOnHarness,
  siteOf,
  siteRootOf,
  workdirDecision
} from './src/route.mjs'
/** The temp directory with its symlinks resolved; the fence compares real paths only. */
function realTmpdir() {
  try {
    return realpathSync(tmpdir())
  } catch {
    return tmpdir()
  }
}

/**
 * Whole seconds the in-container reaper waits between TERM and KILL. Long enough for a shell to
 * run its traps, short enough that a tab close does not leave a process for a minute.
 */
export const REAPER_GRACE_SECONDS = 2

/**
 * Hard bound on the reaper's own docker CLI call. Termination must never wait on a slow daemon,
 * and killing this CLI is harmless: the script it started keeps running inside the container —
 * which is the very limit the reaper exists for, working in our favour for once.
 */
export const REAPER_TIMEOUT_MS = 8000

/**
 * How long after a spawn a "nothing carried the marker" answer is still suspicious, and how long
 * to wait before asking once more. `docker exec` is a create-then-start round trip to the daemon:
 * terminate the spawn inside that window — a near-zero tool timeout, a signal that was already
 * about to fire — and the sweep can run BEFORE the process it is hunting exists in `/proc`.
 */
export const REAPER_RETRY_DELAY_MS = 1000

/** Stable cordis plugin name — must match the row in cordis.patch.yml (RULE #2). */
export const name = 'tracy-subprocess-docker'

/**
 * The two rows are one mechanism, so refuse a mismatched pair at boot. This provider reads the
 * mode out of a stamp only `@tracy/dsh-sandbox-docker` writes; paired with any other sandbox the
 * argv arrives unstamped, every confined command silently runs as `www-data`, and nothing in the
 * logs says so. A boot error is the cheaper failure.
 * @param {unknown} sandbox - whatever registered itself as `ctx.sandbox`.
 * @returns {void}
 */
export function assertSandboxPairing(sandbox) {
  if (sandbox instanceof DockerSandbox) return
  const found =
    sandbox === null || sandbox === undefined
      ? String(sandbox)
      : (sandbox.constructor?.name ?? typeof sandbox)
  throw new Error(
    `subprocess-docker: ctx.sandbox must be @tracy/dsh-sandbox-docker (the mode stamp comes from it); found ${found}`
  )
}

export class DockerSubprocessRuntime extends LocalSubprocessRuntime {
  /**
   * The sandbox row must already be up when this one loads: its stamp is where the mode comes
   * from. Mirrors `SandboxBashExecutor.inject` in `@deepseek-ai/dsh-bash-sandbox`.
   */
  static inject = ['sandbox']

  static Config = z.object({
    /**
     * Directory holding one folder per site label, on the harness side. Absent here, the
     * provider falls back to `TRACY_SITES_ROOT` from the environment, then to the fleet's `/site`.
     */
    sitesRoot: z.string(),
    /** The same directory as the web container sees it. */
    containerRoot: z.string().default('/site'),
    /** Container name template; `{label}` is the site label. */
    containerName: z.string().default('{label}-web-1'),
    /** The docker CLI. */
    docker: z.string().default('docker'),
    /**
     * DOCKER_HOST for the CLI, when the daemon is not the local socket (`ssh://root@…`, or the
     * fleet's socket proxy `tcp://docker-proxy:2375`). Absent here, the provider falls back to
     * `TRACY_DOCKER_HOST` from the environment; absent there too, the CLI keeps its own default
     * and every other `DOCKER_*` variable is still tombstoned.
     */
    dockerHost: z.string()
  })

  /**
   * The sites root is resolved once, here: `config.sitesRoot` when the row carries one, else
   * `TRACY_SITES_ROOT` from the environment the harness was started in, else the fleet's `/site`.
   * A relative or empty value throws now rather than at the first command, where it would make
   * every cwd read as "outside". `dockerHost` resolves the same way through `TRACY_DOCKER_HOST`.
   * @param {import('@deepseek-ai/cordis').Context} ctx
   * @param {{ sitesRoot?: string, containerRoot: string, containerName: string, docker: string, dockerHost?: string }} config
   */
  constructor(ctx, config) {
    super(ctx)
    assertSandboxPairing(ctx.sandbox)
    this.cfg = { ...config, sitesRoot: resolveSitesRoot(config), dockerHost: resolveDockerHost(config) }
    // Read once, here, from the environment dsh itself runs under — the store's own root is
    // `DSH_HOME/attachments/v1` (`attachment-local/src/file-store.ts`). Null when the environment
    // does not say, and null closes the door rather than guessing.
    this.attachmentsRoot = attachmentsRootOf(process.env)
    // The real temp directory dsh's spill store defaults under (`/private/var/…` on macOS, `/tmp` in the
    // image) — compared against realpath'd arguments, so it is realpath'd too.
    this.spillTmp = realTmpdir()
    /** Spill paths the fence granted a session, for the ripgrep spawn that follows (path → expiry ms). */
    this.spillGrants = new Map()
    /** Which CMS each site runs (`platformOf`), read once: it decides a fenced path's "what next". */
    this.platforms = new Map()
    this.registerWorkdirGuard(ctx)
    this.registerPathFence(ctx)
    this.registerApprovalGuard(ctx)
    this.registerApprovalAnswer(ctx)
    this.registerOutputBound(ctx)
  }

  /**
   * Bound what the model reads of a long `bash` output: lines over 2,000 characters cut, an output
   * over 12,000 kept as its head and tail, the whole saved through dsh's spill store and named in one
   * line. The rules, the measurements and why it is not dsh's `spill-policy` cap: `src/output-bound.mjs`.
   *
   * Not prepended: dsh's `spill-policy` registers ahead of every listener and bounds what this one
   * returns, which is already under its cap. A store that is missing or fails leaves the output whole.
   * @param {import('@deepseek-ai/cordis').Context} ctx
   */
  registerOutputBound(ctx) {
    const logger = /** @type {{ warn?: (message: string) => void } | undefined} */ (ctx?.logger)
    const warn = (/** @type {string} */ message) =>
      typeof logger?.warn === 'function' ? logger.warn(message) : console.warn(message)
    ctx.on(
      'tools/post-execute',
      async (
        /** @type {Parameters<typeof boundBashResult>[0]['exec']} */ exec,
        /** @type {Parameters<typeof boundBashResult>[0]['result']} */ result,
        /** @type {() => Promise<Parameters<typeof boundBashResult>[0]['decision']>} */ next
      ) => {
        const decision = await next()
        const spillStore = typeof ctx.get === 'function' ? ctx.get('spillStore') : undefined
        return boundBashResult({ exec, result, decision, spillStore, warn })
      }
    )
  }

  /**
   * Deny, before dispatch, any tool call whose model-chosen working directory names a site other
   * than the session's own. `execArgv` makes the same judgement from the sandbox stamp, but a
   * `danger-full-access` call never reaches `confine()` and so arrives unstamped — for that mode
   * this listener is the only fence. It is registered on the plugin's own context, so unloading
   * the plugin removes it.
   * @param {import('@deepseek-ai/cordis').Context} ctx
   */
  registerWorkdirGuard(ctx) {
    ctx.on('tools/pre-execute', async (exec, next) => {
      const sessionCwd = exec.agent?.session.header.cwd
      const reason = workdirDecision({
        name: exec.name,
        args: exec.arguments,
        sessionCwd,
        sitesRoot: this.cfg.sitesRoot
      })
      if (reason === null) return next()
      this.logDenial({ guard: 'workdir', tool: exec.name, sessionCwd, reason })
      return { kind: 'deny', reason }
    })
  }

  /**
   * One line per refused tool call, because a denial that only the MODEL sees is invisible to the
   * person running the host. The tester's round-2 report is the case for it: `docker logs
   * tracy-dsh` showed nothing at all for three refused reads, so "the fence denied it" and "the
   * tool failed for some other reason" looked identical from outside.
   *
   * Paths, names and the site label — never file contents, and never the argument's value beyond
   * the path itself. A denial is an event an operator may need to correlate; it is not a place to
   * copy what the model was trying to read.
   * @param {{ guard: string, tool: string, arg?: string, requested?: string, resolved?: string, sessionCwd?: string, reason: string }} event
   * @returns {void}
   */
  logDenial(event) {
    let label = 'unknown'
    try {
      if (event.sessionCwd !== undefined) label = siteOf(event.sessionCwd, this.cfg.sitesRoot).label
    } catch {
      // A session cwd that names no site is itself the reason for many denials; do not lose the
      // line because the label cannot be derived from it.
      label = 'none'
    }
    const fields = [
      'subprocess-docker: DENY',
      `guard=${event.guard}`,
      `tool=${event.tool}`,
      ...(event.arg === undefined ? [] : [`arg=${event.arg}`]),
      `site=${label}`,
      ...(event.requested === undefined ? [] : [`requested=${JSON.stringify(event.requested)}`]),
      ...(event.resolved === undefined || event.resolved === event.requested
        ? []
        : [`resolved=${JSON.stringify(event.resolved)}`]),
      `reason=${JSON.stringify(event.reason)}`
    ]
    const line = fields.join(' ')
    // 🔒 STDERR FIRST, AND UNCONDITIONALLY. `docker logs tracy-dsh | grep 'DENY guard='` is the
    // check this package's README and HOST-DSH.md hand to an operator, and `docker logs` shows the
    // container's own stdout/stderr and nothing else. Routing the line through `ctx.logger` alone
    // did NOT satisfy that: measured 06/09 after two confirmed denials (a cross-site grep and a
    // `write /desk-home/pwned.txt` under Full access), the whole container log was twelve lines and
    // none of them was this one — dsh's logger has its own level and its own destination, and a
    // denial that only the model can see is exactly the hole this line exists to close. A plugin's
    // `console` does reach that log; `[tracy-site-tabs]` prints there the same way.
    console.error(line)
    // Then the harness's own logger when there is one, so a deployment that collects dsh's
    // structured log gets the event in that stream too. Never INSTEAD of the line above.
    const logger = /** @type {{ warn?: (message: string) => void } | undefined} */ (this.ctx?.logger)
    if (typeof logger?.warn === 'function') logger.warn(line)
  }

  /**
   * Deny, before dispatch, any tool call naming a file outside the session's own site folder.
   *
   * WHY THIS LIVES IN THE SUBPROCESS PROVIDER, and not in a plugin of its own. It is not a
   * subprocess concern — `read`/`write`/`glob` never reach `ctx.subprocess`. It is here because
   * this row already answers the one question the fence needs ("which site does this session
   * belong to", `sitesRoot` + `siteOf`) and is already loaded wherever the fs tools are: every
   * profile that composes `tool-fs` composes this provider too. A sibling plugin would need its own
   * row in `@tracy/dsh-native-bundle`, in the image, and in twelve presets before it fenced
   * anything — and a fence that is not loaded is worse than no fence, because the map says it is
   * there.
   *
   * It is INDEPENDENT OF SANDBOX MODE, `danger-full-access` included: `dsh-fs-sandbox` guards the
   * two mutations by mode and lets every read through at every mode, which is exactly the hole.
   * @param {import('@deepseek-ai/cordis').Context} ctx
   */
  registerPathFence(ctx) {
    ctx.on('tools/pre-execute', async (exec, next) => {
      const reason = await this.pathFenceDecision(exec)
      return reason === null ? next() : { kind: 'deny', reason }
    })
  }

  /**
   * The fence's judgement for one tool call. Null to allow.
   * @param {{ name: string, arguments: unknown, agent?: { session: { header: { cwd?: string } } } }} exec
   * @returns {Promise<string | null>}
   */
  async pathFenceDecision(exec) {
    const { known, candidates, unparseable } = pathCandidates(exec.name, exec.arguments)
    if (candidates.length === 0 && unparseable.length === 0) return null
    const sessionCwd = exec.agent?.session.header.cwd
    let siteRoot
    try {
      if (sessionCwd === undefined) throw new Error('no session workspace')
      siteRoot = await this.realSiteRoot(sessionCwd)
    } catch (error) {
      // A tool the table knows takes files, and no site to check them against, is refused. A tool
      // it does not know keeps working: this fence must never be the reason a todo list fails.
      if (!known) return null
      const detail = error instanceof Error ? error.message : String(error)
      const reason = `subprocess-docker: ${exec.name} cannot be checked against a session workspace (${detail}) — refused`
      this.logDenial({ guard: 'path', tool: exec.name, sessionCwd, reason })
      return reason
    }
    // A declared path argument that is not a usable string cannot be judged, and this tool's whole
    // purpose is to open it. Refuse rather than let the backend resolve it.
    if (unparseable.length > 0) {
      const reason = `subprocess-docker: ${exec.name} ${unparseable.join(', ')} is not a usable path — refused`
      this.logDenial({ guard: 'path', tool: exec.name, arg: unparseable.join(','), sessionCwd, reason })
      return reason
    }
    for (const { arg, value, declared } of candidates) {
      const { resolved, existed, target } = await this.resolveForFence(value, sessionCwd)
      // This session's own spilled output is readable everywhere, the harness
      // just told the agent to read it (see `readsOwnSpill`).
      if (readsOwnSpill(exec.name, resolved, exec.agent?.session?.id, this.spillTmp)) {
        // The grep that follows runs ripgrep in this process; its spawn may open exactly this path.
        this.grantSpill(value, sessionCwd)
        this.grantSpill(resolved, sessionCwd)
        continue
      }
      // Both rules refuse WRITES only; reading wp-includes is how a model learns the platform.
      if (declared && arg === writeTargetArg(exec.name, exec.arguments)) {
        // A new PHP file is judged FIRST: a scratch script in Joomla's `cli/` is platform core and a
        // public page at once, and only this refusal names the folder it should have gone to.
        const php = newWebrootPhpReason(target, siteRoot, existed)
        const reason = php ?? platformCoreReason(resolved, siteRoot)
        if (reason !== null) {
          this.logDenial({
            guard: php === null ? 'core' : 'webroot-php',
            tool: exec.name,
            arg,
            requested: value,
            resolved: php === null ? resolved : target,
            sessionCwd,
            reason
          })
          return reason
        }
      }
      // A generous candidate — any string with a slash in it, from a tool whose schema this table
      // has never seen — only counts when it names something that is really there.
      if (!declared && !existed) continue
      if (insideSite(resolved, siteRoot)) continue
      // The one door: an image or file the viewer attached to this chat. `read_image` on the
      // attachment store, `read` on its `v1/files/` subtree, and closed entirely when the
      // environment names no DSH_HOME.
      //
      // ⚠ WHAT IT ACTUALLY FIXES, corrected after re-reading the session rather than the error.
      // A pasted picture ALREADY reaches the model: dsh inlines it into the prompt as base64
      // (`ui-conversation`'s `serializeAttachments`), and on demojoomla 16/09 the model read real
      // identifiers out of it. What failed was the SECOND look — `read_image` on the stored file,
      // for the full resolution the inline preview crops — and the refusal made the agent tell the
      // customer "the attachment isn't reachable from this workspace" while it was in fact looking
      // at it. So this door buys the full-size read and, more than that, stops the agent claiming
      // a blindness it does not have.
      if (readsOwnAttachment(exec.name, resolved, this.attachmentsRoot)) continue
      const reason = outsideSiteReason(
        exec.name,
        arg,
        value,
        resolved,
        siteRoot,
        await this.platformOf(siteRoot)
      )
      this.logDenial({
        guard: 'path',
        tool: exec.name,
        arg,
        requested: value,
        resolved,
        sessionCwd,
        reason
      })
      return reason
    }
    return null
  }

  /**
   * The session's site folder with every symlink already resolved, so the comparison the fence
   * makes is between two real paths.
   * @param {string} sessionCwd
   * @returns {Promise<string>}
   */
  async realSiteRoot(sessionCwd) {
    return await realpath(siteRootOf(sessionCwd, this.cfg.sitesRoot))
  }

  /**
   * Which CMS this site runs, read from its webroot once per site and remembered: the answer a fenced
   * path's "what next" is chosen by (`appNext`). A site's CMS does not change under it, and a wrong
   * answer costs the model the steps that text exists to save.
   *
   * The folder's own record first: `.tracy/site.json` `platform`, which provision writes into every
   * site folder (`siteFolder.mjs`) and the site context reads the same way (`sitePlatform`). Then
   * WordPress and Joomla by their configuration file, as `tracy-host` names them
   * (`content-identity.js` `platformOfWebroot`), and EmDash by an `emdash.config.ts` or `.emdash`
   * in the folder. Null when none of it can be read: the caller then claims no CMS.
   *
   * 🔒 THE RECORD CAME FIRST BECAUSE THE FILE PROBES NEVER NAMED A FLEET EMDASH SITE (29/09/2026).
   * A fleet EmDash folder holds `.tracy/site.json`, `.webroot/{data,uploads}` and `template/` — no
   * config file and no `.emdash` — so this answered null there, and all 56 `/app` refusals of the v6
   * bench carried the any-CMS text instead of `EMDASH_APP_NEXT` (bash, then `site.rebuild`): the road
   * fix D wrote never reached an EmDash agent. The record is www-data's to write, which is safe here
   * because this answer only picks the WORDS of a refusal; what is allowed or denied never reads it.
   * @param {string} siteRoot - the symlink-resolved site folder.
   * @returns {Promise<'wordpress' | 'joomla' | 'emdash' | null>}
   */
  async platformOf(siteRoot) {
    // Lazily, not only in the constructor: the fence is called directly on a bare runtime in tests and
    // by callers that build one without it, and a missing cache must not turn a deny into a throw.
    this.platforms ??= new Map()
    const known = this.platforms.get(siteRoot)
    if (known !== undefined) return known
    const there = async (/** @type {string} */ file) =>
      await stat(join(siteRoot, file)).then(
        () => true,
        () => false
      )
    /** @type {unknown} */
    const declared = await readFile(join(siteRoot, '.tracy', 'site.json'), 'utf8').then(
      (raw) => {
        try {
          return JSON.parse(raw)?.platform
        } catch {
          return null
        }
      },
      () => null
    )
    /** @type {'wordpress' | 'joomla' | 'emdash' | null} */
    let platform = null
    if (declared === 'wordpress' || declared === 'joomla' || declared === 'emdash') platform = declared
    else if (await there('.webroot/configuration.php')) platform = 'joomla'
    else if (await there('.webroot/wp-config.php')) platform = 'wordpress'
    else if (await there('emdash.config.ts')) platform = 'emdash'
    else if (await there('.emdash')) platform = 'emdash'
    this.platforms.set(siteRoot, platform)
    return platform
  }

  /**
   * Resolve one argument the way the filesystem will: relative against the session workspace, then
   * `realpath` — and when the path does not exist yet, `realpath` of the nearest ancestor that
   * does. That last part is what fences a WRITE: `/desk-home/cordis.patch.yml` does not exist, and
   * creating it is the attack.
   *
   * `target` is that ancestor with the missing segments put back, so a rule that reads the file NAME
   * still has one: `.webroot/cli/zz.php` resolves to `.webroot/cli`, and "is it a new PHP file" can
   * only be asked of the whole path. Every existing ancestor is resolved in it, so a symlink still
   * decides where the path really leads. It equals `resolved` whenever the file is already there.
   * @param {string} value - the argument as the model wrote it.
   * @param {string} sessionCwd - the base for a relative path.
   * @returns {Promise<{ resolved: string, existed: boolean, target: string }>}
   */
  async resolveForFence(value, sessionCwd) {
    const intended = isAbsolute(value) ? value : resolvePath(sessionCwd, value)
    let current = intended
    /** The segments climbed past, nearest last. */
    const missing = []
    let existed = true
    for (;;) {
      try {
        const resolved = await realpath(current)
        return { resolved, existed, target: resolvePath(resolved, ...missing) }
      } catch {
        existed = false
        const parent = dirname(current)
        // `dirname('/')` is `/`: the root is where climbing stops, and a root that cannot be
        // resolved is not inside any site folder, which is the answer the caller needs.
        if (parent === current) return { resolved: current, existed: false, target: intended }
        missing.unshift(basename(current))
        current = parent
      }
    }
  }

  /**
   * Refuse a call that reads a site's database password, by path or by naming the file in a shell
   * command. The rules are `src/site-guards.mjs`; the reason tells the agent what to use instead.
   *
   * 🔒 DENY, NOT ASK. dsh-passwords forwards only `user-questions/request` to a seat's browser
   * (gateway.ts `$events` filter), so a tool approval would wait for an answer no customer can give
   * and hang the turn until it is cancelled.
   *
   * It delegates first, so a deny from the rest of the chain keeps its own reason.
   * @param {import('@deepseek-ai/cordis').Context} ctx
   */
  registerApprovalGuard(ctx) {
    /** @typedef {{ kind: 'allow' } | { kind: 'deny', reason: string } | { kind: 'ask', reason?: string }} PreToolDecision */
    ctx.on(
      'tools/pre-execute',
      async (
        /** @type {Parameters<DockerSubprocessRuntime['approvalReason']>[0]} */ exec,
        /** @type {() => Promise<PreToolDecision>} */ next
      ) => {
        const decision = await next()
        if (decision.kind === 'deny') return decision
        const reason = await this.approvalReason(exec)
        return reason === null ? decision : { kind: 'deny', reason }
      }
    )
  }

  /**
   * Answer every approval question on this host `rejected`, at once, ahead of every other answerer.
   *
   * WHY AN ANSWER AND NOT A WAIT. dsh's approval seam (`ctx.approval`) asks for a human decision
   * over the `approval/request` waterfall; its last answerer forwards the question to the browsers
   * on the host's `$events` stream and waits for one of them, with no timeout. On this host that
   * wait has no end: dsh-passwords forwards no approval frame to a seat (gateway.ts `$events`
   * filter), so no seat can see the question. Measured 29/09/2026 on the bench (EmDash
   * V6-des-L5-02): one `bash` retry asking `sandbox_permissions: danger-full-access` held the turn
   * 643 s, until the runner stopped it.
   *
   * WHY `rejected`. The only questions dsh asks here are a wider sandbox mode for one `bash`/`pwsh`
   * command or one file write, and a `tools/pre-execute` "ask". A wider mode grants nothing on this
   * host — the command runs as `www-data` in the site's container either way (`EXEC_USER` in
   * `src/route.mjs`) — and every Tracy guard refuses rather than asks (`registerApprovalGuard`). It
   * is the outcome dsh's own `never` policy gives: `@tracy/dsh-native-bundle` pins that policy on
   * every new session, where the service decides before any answerer runs and tells the model not
   * to ask. This listener is what answers the sessions pinned `ask` before that row existed, which
   * keep their policy in their own log.
   *
   * `prepend`, because a waterfall is answered by its FIRST listener that does not call `next()`, and
   * the forwarder to the browsers registers whenever dsh's gateway starts, which this plugin does
   * not control. The model reads the rejection from dsh (`sandbox/src/escalation.ts`, or
   * `core/tools` for a pre-execute ask) and is told to stop and explain instead of working around it.
   * @param {import('@deepseek-ai/cordis').Context} ctx
   */
  registerApprovalAnswer(ctx) {
    ctx.on('approval/request', () => Promise.resolve(/** @type {const} */ ('rejected')), { prepend: true })
  }

  /**
   * The approval question one tool call raises, or null. A secrets file is judged on the RESOLVED
   * path, the way the fence judges paths, so a symlink to `wp-config.php` asks too.
   * @param {{ name: string, arguments: unknown, agent?: { session: { header: { cwd?: string } } } }} exec
   * @returns {Promise<string | null>}
   */
  async approvalReason(exec) {
    const args = /** @type {Record<string, unknown>} */ (
      typeof exec.arguments === 'object' && exec.arguments !== null ? exec.arguments : {}
    )
    if (exec.name === 'bash') {
      if (typeof args.command !== 'string') return null
      // A quickstart site refuses one thing: writing its database directly (Lee, 26/09/2026).
      const dbWrite = hasContentContract(exec.agent?.session.header.cwd, this.cfg.sitesRoot)
        ? directDbWriteReason(args.command)
        : null
      return dbWrite ?? commandApprovalReason(args.command)
    }
    const arg = readTargetArg(exec.name)
    const value = arg === null ? undefined : args[arg]
    const sessionCwd = exec.agent?.session.header.cwd
    if (typeof value !== 'string' || value.trim() === '' || sessionCwd === undefined) return null
    let siteRoot
    try {
      siteRoot = await this.realSiteRoot(sessionCwd)
    } catch {
      // No site folder to judge the path against. `read` and `grep` are fence tools, and the fence
      // runs earlier in this waterfall and refuses them in that case, so no call reaches here.
      return null
    }
    const { resolved } = await this.resolveForFence(value, sessionCwd)
    return secretsFileReason(resolved, siteRoot)
  }

  /**
   * Environment for the docker CLI itself — never the command's. Every `DOCKER_*` variable that
   * can redirect the CLI to a different daemon is named here with an `undefined` value: the seam
   * reads that as a tombstone removing the ambient entry, so a `DOCKER_HOST` or `DOCKER_CONTEXT`
   * in the harness's own environment cannot decide which machine a seat's command lands on. Only
   * the configured `dockerHost` sets one.
   * @returns {Record<string, string | undefined>}
   */
  cliEnv() {
    return {
      DOCKER_HOST: this.cfg.dockerHost ?? undefined,
      DOCKER_CONTEXT: undefined,
      DOCKER_TLS_VERIFY: undefined,
      DOCKER_CERT_PATH: undefined
    }
  }

  /**
   * The same tombstones, stated as EMPTY STRINGS, for the terminal path.
   *
   * Two facts make this a different function rather than the same one. `child_process` skips an
   * env key whose value is `undefined`, so the pipe path above gets the tombstone's intent for
   * free; node-pty does not — it builds `KEY=value` strings, and an `undefined` arrives in the
   * child as the literal four letters (measured 06/09 through the gateway: the sidebar terminal
   * opened and the docker CLI died with `unable to resolve docker endpoint: open
   * undefined/ca.pem`). And simply DROPPING the key is not a tombstone either: the seam merges
   * this over `scrubbedParentEnv()`, whose scrub is `/KEY|PASSWORD|SECRET|TOKEN/i` and therefore
   * matches no `DOCKER_*` name — an absent key means the harness's ambient value is INHERITED,
   * the opposite of what a tombstone promises.
   *
   * An empty string is what actually erases them, measured against the CLI this provider drives
   * (docker 29.4.1, inside the harness image):
   * - `DOCKER_HOST=""` falls back to the default unix socket AND overrides an ambient `tcp://…`
   *   — the same outcome as the pipe path's delete;
   * - `DOCKER_CONTEXT=""` overrides an ambient context name, which is otherwise resolved (and
   *   fails) before anything else is even attempted;
   * - `DOCKER_TLS_VERIFY=""` with `DOCKER_CERT_PATH=""` lets a plain `DOCKER_HOST` connect where
   *   the ambient pair had forced TLS against a certificate directory.
   * @returns {Record<string, string>} env entries, every value a string.
   */
  terminalCliEnv() {
    return {
      DOCKER_HOST: this.cfg.dockerHost ?? '',
      DOCKER_CONTEXT: '',
      DOCKER_TLS_VERIFY: '',
      DOCKER_CERT_PATH: ''
    }
  }

  /**
   * The environment for a reaper's docker CLI: the harness's own, with `cliEnv()`'s tombstones
   * applied, so the reaper cannot be pointed at a different daemon than the spawn it is cleaning
   * up after. `child_process` takes no `undefined`, so a tombstone is a delete here.
   * @returns {Record<string, string>}
   */
  reaperEnv() {
    const env = /** @type {Record<string, string>} */ ({ ...process.env })
    for (const [key, value] of Object.entries(this.cliEnv())) {
      if (value === undefined) delete env[key]
      else env[key] = value
    }
    return env
  }

  /**
   * Send the reaper in after one exec's leftovers. Best effort by contract: it is called from
   * `terminate()`, which returns nothing and must not wait, so every failure is logged and none is
   * thrown.
   *
   * NOTHING HERE MAY HOLD THE HARNESS OPEN. `detached` + `unref()` is not enough on its own:
   * `child_process`'s own `timeout` option keeps an internal REF'D timer, so a reaper against an
   * unresponsive daemon pinned the process for the full 8 s — measured by review, and the exact
   * opposite of what this method promises. Every timer here is therefore ours and `unref()`ed, and
   * the stdio is `'ignore'` so no pipe holds the loop either. A harness that exits mid-reap simply
   * leaves the sweep unfinished; that is the honest trade for never delaying a shutdown.
   * @param {{ execId: string, user: string, container: string }} target
   * @param {{ retry?: boolean }} [options] - `retry` allows ONE more sweep when this one finds
   *   nothing: see {@link attachReaper} for the race it covers.
   * @returns {void}
   */
  reap(target, options = {}) {
    try {
      const [docker, ...args] = reaperArgv({
        ...target,
        graceSeconds: REAPER_GRACE_SECONDS,
        cfg: this.cfg
      })
      const child = spawnChild(/** @type {string} */ (docker), args, {
        stdio: 'ignore',
        detached: true,
        env: this.reaperEnv()
      })
      const bound = setTimeout(() => child.kill('SIGKILL'), REAPER_TIMEOUT_MS)
      bound.unref()
      child.on('error', (error) => {
        clearTimeout(bound)
        this.logReaperFailure(target, error)
      })
      child.on('exit', (code) => {
        clearTimeout(bound)
        // A single retry, and only for "nothing carried the marker": the exec may not have
        // existed yet when the sweep ran. The retry never retries — `reap()` below takes the
        // default `retry: false` — so this cannot become a loop.
        if (code === REAPER_NOTHING_FOUND) {
          if (options.retry !== true) return
          const again = setTimeout(() => this.reap(target), REAPER_RETRY_DELAY_MS)
          again.unref()
          return
        }
        // The script itself exits 0 or REAPER_NOTHING_FOUND and nothing else, so any other code is
        // the docker CLI failing to run the sweep at all — a daemon that is down answers 1, a
        // missing container 125/126/127. That is an orphan left alive, and until 06/09 it was
        // SILENT: only a CLI that could not be spawned was logged. Measured the hard way, on a
        // Docker Desktop that stopped mid-session.
        if (code !== 0) this.logReaperFailure(target, new Error(`the sweep exited ${code}`))
      })
      child.unref()
    } catch (error) {
      this.logReaperFailure(target, error)
    }
  }

  /**
   * A reaper that could not run leaves an orphan, not a broken session — so it is a warning, and
   * the marker is in it: it is the only way to find the survivor by hand.
   * @param {{ execId: string, container: string }} target
   * @param {unknown} error
   * @returns {void}
   */
  logReaperFailure(target, error) {
    const message = `subprocess-docker: reaping ${target.execId} in ${target.container} failed: ${error instanceof Error ? error.message : String(error)}`
    const logger = /** @type {{ warn?: (message: string) => void } | undefined} */ (this.ctx?.logger)
    if (typeof logger?.warn === 'function') logger.warn(message)
    else console.warn(message)
  }

  /**
   * Make one handle's termination reach INSIDE the container. Two paths lead there and both must,
   * because they are different code in the local runtime: `handle.terminate()` (teardown, an
   * explicit stop) and the spec's abort signal (a tool timeout — the case that was measured
   * leaving a `sleep 300` behind). The reaper runs at most once per spawn.
   *
   * The handle is patched in place rather than wrapped: the local runtime keeps its OWN reference
   * in `live`/`terminals` and calls `terminate()` on it at disposal, so a wrapper object returned
   * to the caller would be skipped by exactly the path that cleans up at shutdown.
   *
   * 🔒 A COMMAND IS SWEPT WHEN IT EXITS, CLEANLY OR NOT (`sweepOnExit`, set for every `spawn`). Until
   * 09/10/2026 a command that closed with an exit code was skipped, on the reasoning that it had
   * nothing left to reap — but a clean exit is exactly what `cmd &` produces, and a backgrounded
   * loop that keeps swapping a symlink (`while :; do ln -sfn …; done &`) outlived the tool call and
   * could move a link between the path fence's `realpath` and dsh's own open. The local runtime does
   * NOT call `terminate()` on a settled ordinary handle (only on terminals), so this is a listener
   * on `done`, not a change to the terminate path. It costs one small exec per command; it never
   * delays the result: `done` itself is not replaced, and `reap()` spawns detached and returns.
   *
   * Terminals take no `done` listener and sweep on every terminate/abort, as before: a tab's shell
   * exiting reaches `terminate()` through the local runtime's own release, and a person's
   * backgrounded `npm run dev &` there is the likeliest orphan of all.
   *
   * THE RETRY: a termination within {@link REAPER_RETRY_DELAY_MS} of the spawn may beat the daemon's
   * own exec start, so the sweep would find nothing that exists a moment later. That case — and
   * only that case — buys one retry. An exit never does: a command that reported an exit has
   * certainly started. RESIDUAL: a process that appears after the SECOND sweep escapes both.
   * @template {{ terminate: Function, done?: Promise<{ exitCode: number | null, signal: unknown }> }} H
   * @param {H} handle - the handle the local runtime just built.
   * @param {{ execId: string, user: string, container: string }} target
   * @param {AbortSignal | undefined} signal - the spec's signal, when it carried one.
   * @param {{ sweepOnExit?: boolean }} [gates] - `sweepOnExit` sweeps as soon as `done` settles.
   * @returns {H} the same handle.
   */
  attachReaper(handle, target, signal, gates = {}) {
    const startedAt = Date.now()
    let reaped = false
    const once = (/** @type {{ exited?: boolean }} */ how = {}) => {
      if (reaped) return
      reaped = true
      // One microtask of slack, so the sweep goes in after the synchronous work of whatever
      // triggered it (on the terminate path, the CLI-side terminate below).
      queueMicrotask(() => {
        this.reap(target, { retry: how.exited !== true && Date.now() - startedAt < REAPER_RETRY_DELAY_MS })
      })
    }
    if (gates.sweepOnExit === true) {
      const exited = () => once({ exited: true })
      handle.done?.then(exited, exited)
    }
    signal?.addEventListener('abort', () => once(), { once: true })
    const original = handle.terminate.bind(handle)
    // The CLI-side termination and the sweep are NOT ordered against each other, on either path:
    // the microtask above puts the sweep last, and on the abort path the base runtime's own
    // listener (registered inside `super.spawn()`) had already killed the CLI first anyway. That
    // is fine, and it is this mechanism's whole premise: killing the harness-side docker CLI does
    // not touch the process inside the container — which is why the marker is still there to find.
    handle.terminate = (/** @type {unknown[]} */ ...args) => {
      once()
      return original(...args)
    }
    return handle
  }

  /**
   * Remember a spill path the fence granted, as the spawn will see it (absolute), for 60 s.
   * @param {string} value @param {string} cwd
   */
  grantSpill(value, cwd) {
    if (typeof value !== 'string' || value === '') return
    const now = Date.now()
    this.spillGrants ??= new Map()
    for (const [p, until] of this.spillGrants) if (until < now) this.spillGrants.delete(p)
    this.spillGrants.set(posixPath.resolve(cwd || '/', value), now + 60_000)
  }

  /** @param {string} abs */
  spillGranted(abs) {
    const until = this.spillGrants?.get(abs)
    return until !== undefined && until >= Date.now()
  }

  /** @override */
  spawn(spec) {
    const { mode, root, argv } = unstamp(spec.argv)
    if (
      runsOnHarness({
        argv,
        cwd: spec.cwd,
        sitesRoot: this.cfg.sitesRoot,
        allowRoot: (abs) => this.spillGranted(abs)
      })
    ) {
      // dsh's own grep/glob ripgrep, run in place by the local runtime: no container, so nothing to
      // reap. `execTarget` still refuses a cwd in another site than a stamp's root, and the
      // tombstone keeps a harness RIPGREP_CONFIG_PATH from adding flags behind the argument list.
      execTarget({ cwd: spec.cwd, mode, root, cfg: this.cfg })
      return super.spawn({ ...spec, argv, env: { ...spec.env, RIPGREP_CONFIG_PATH: undefined } })
    }
    if (mode === 'read-only') throw new Error(READ_ONLY_SHELL_REFUSAL)
    const execId = randomUUID()
    const rewritten = execArgv({
      argv,
      cwd: spec.cwd,
      env: spec.env,
      mode,
      root,
      tty: false,
      execId,
      cfg: this.cfg
    })
    const target = { execId, ...execTarget({ cwd: spec.cwd, mode, root, cfg: this.cfg }) }
    const handle = super.spawn({ ...spec, argv: rewritten, cwd: tmpdir(), env: this.cliEnv() })
    return this.explainKill(
      this.attachReaper(handle, target, spec.signal, { sweepOnExit: true }),
      target,
      spec.signal
    )
  }

  /**
   * Make a kernel kill inside the container readable (`src/kill-note.mjs`): when the command comes
   * back as exit 137 and nothing on this side stopped it, ask the container what its memory
   * accounting says and put that line after the command's stderr, before `done` resolves — so the
   * shell tool's result, its settlement hook and a background job's reads all carry it.
   *
   * Patched in place, like `attachReaper`, and only on a handle whose stderr is collected (the bash
   * tool's shape): a piped stream belongs to its caller, and there is nowhere to put a line.
   * RESIDUAL: `killed` is not proven to be the memory cap — the count is the container's since it
   * started — which is why the line says "most likely", and says nothing when the probe fails.
   * @template {{ done?: Promise<{ exitCode: number | null, signal: unknown } | undefined>, collected?: { stderr?: { readFrom: Function } } }} H
   * @param {H} handle - the handle the local runtime just built.
   * @param {{ user: string, container: string }} target
   * @param {AbortSignal | undefined} signal - the spec's signal: aborted means a timeout or a cancel.
   * @returns {H} the same handle.
   */
  explainKill(handle, target, signal) {
    const stderr = handle.collected?.stderr
    if (stderr === undefined || typeof handle.done?.then !== 'function') return handle
    let note = ''
    handle.collected = { ...handle.collected, stderr: withNote(stderr, () => note) }
    handle.done = handle.done.then(async (outcome) => {
      if (outcome?.exitCode !== KILLED_EXIT || (outcome.signal ?? null) !== null || signal?.aborted)
        return outcome
      note = await this.probeKill(target)
      return outcome
    })
    return handle
  }

  /**
   * The note for one killed command, or '' — never a throw, and never longer than
   * {@link KILL_PROBE_TIMEOUT_MS}: the command has already finished, and its result waits on this.
   * @param {{ user: string, container: string }} target
   * @returns {Promise<string>}
   */
  probeKill(target) {
    return new Promise((resolve) => {
      try {
        const [docker, ...args] = killProbeArgv({ ...target, cfg: this.cfg })
        execFile(
          /** @type {string} */ (docker),
          args,
          {
            env: this.reaperEnv(),
            timeout: KILL_PROBE_TIMEOUT_MS,
            killSignal: 'SIGKILL',
            maxBuffer: 64 * 1024
          },
          (error, stdout) => resolve(error ? '' : killNote(parseKillProbe(String(stdout))))
        )
      } catch {
        resolve('')
      }
    })
  }

  /** @override */
  async spawnTerminal(spec) {
    const { mode, root, argv } = unstamp(spec.argv)
    if (mode === 'read-only') throw new Error(READ_ONLY_SHELL_REFUSAL)
    const execId = randomUUID()
    const rewritten = execArgv({
      argv,
      cwd: spec.cwd,
      env: spec.env,
      mode,
      root,
      tty: true,
      execId,
      cfg: this.cfg
    })
    const target = { execId, ...execTarget({ cwd: spec.cwd, mode, root, cfg: this.cfg }) }
    const handle = await super.spawnTerminal({
      ...spec,
      argv: rewritten,
      cwd: tmpdir(),
      // terminalCliEnv, not cliEnv: node-pty turns an `undefined` value into the literal string.
      env: this.terminalCliEnv()
    })
    // No `done` listener here — see attachReaper: a terminal is swept through terminate()/abort.
    return this.attachReaper(handle, target, spec.signal)
  }

  /**
   * Executable lookup happens inside the container at spawn time; a miss surfaces as the
   * command's own exit (127), which the shell tool already classifies. The signal is still
   * honoured, as the base class does: a caller that has already given up gets the abort, not a
   * late answer it must then discard.
   * @param {string} command - absolute executable path or bare PATH name.
   * @param {Readonly<Record<string, string>>} [_env] - unused; the container owns the PATH.
   * @param {AbortSignal} [signal] - aborts the lookup.
   * @returns {Promise<string>}
   * @override
   */
  async resolveExecutable(command, _env, signal) {
    if (command.length === 0) throw new Error('subprocess-docker: executable must be non-empty')
    signal?.throwIfAborted()
    return command
  }
}

export default DockerSubprocessRuntime
