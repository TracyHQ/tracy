/**
 * Which directory this tool is allowed to read, for ONE call.
 *
 * Its own module, and not because index.js was long: `index.js` imports `@deepseek-ai/dsh-tools`,
 * a peer dependency that is not installed in this package's own tree — so a test that reaches
 * through index.js cannot run at all on a developer machine (measured 06/09: the existing
 * `resolve-webroot.test.mjs` fails at import, and has for as long as it has existed here). The
 * fence is the part that must be testable everywhere, so it lives where only node builtins do.
 * @module @tracy/dsh-webroot-read/webroot
 */
import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

/** The directory a lane mounts the running site into, inside the site folder. */
export const WEBROOT_DIR = '.webroot'

/**
 * Where the running site actually is, given the SESSION's workspace.
 *
 * THIS USED TO BE ONE LINE, AND THE LINE WENT WRONG ON 02/09. The old code took the process
 * directory and said so in a comment: *"on the fleet that is CORRECT, because `fleet/dsh/Dockerfile`
 * sets `WORKDIR /var/www/html` — the webroot is where dsh stands."* That stopped being true the day
 * a lane started dropping its agent into a site folder with the webroot mounted at `.webroot/`
 * inside it.
 *
 * What the tool then reported, on a WordPress site serving visitors:
 *
 *     {"webroot": "/site/tchwp2", "platform": "unknown",
 *      "note": "No WordPress or Joomla install found here."}
 *
 * No error, no warning — a confident answer, and the wrong one. The agent in that session happened
 * to ignore it and go looking itself; a less stubborn one would have repeated it to the customer.
 * That is the exact failure this tool's own description warns about: *"guessing the platform from a
 * directory name is the usual way to be wrong."*
 *
 * AND IT WENT WRONG A SECOND WAY, found 06/09 in the one-dsh review. `start` used to be the dsh
 * PROCESS directory — `path.resolve('.')`, which the fleet image pins to `WORKDIR /site`. Under one
 * dsh per lane that was one site. Under ONE DSH PER HOST, `/site` is the parent of EVERY customer's
 * folder: `tracy_site_profile` answered about the parent directory for every seat on the machine,
 * and `tracy_find_definition` walked `walkPhp('/site')` straight across tenants — reading other
 * customers' PHP. The start is now the SESSION's workspace (`exec.agent.session.header.cwd`), the
 * same value the subprocess provider derives a container from, and a call with no session is
 * refused rather than answered from the process directory.
 *
 * Resolved per CALL rather than once at startup, because a bind mount can appear after dsh boots
 * and a wrong answer cached for the life of the process is worse than a stat.
 *
 * @param configured explicit `config.webroot`, which always wins — someone who states it means it.
 * @param start the session's own workspace directory.
 * @returns the directory to read the CMS from.
 */
export async function resolveWebroot(configured, start) {
  if (configured) return configured
  const nested = path.join(start, WEBROOT_DIR)
  // A DIRECTORY, not merely something with that name. Reading a file as a webroot throws further
  // in, at a point whose message says nothing about the cause.
  try {
    return (await stat(nested)).isDirectory() ? nested : start
  } catch {
    return start
  }
}

/**
 * The webroot for ONE call, fenced to the session that asked.
 *
 * Two rules, and the second is why this is not one line:
 * 1. The start is the SESSION's workspace, never the dsh process directory. On a host dsh the
 *    process stands in `/site` — the parent of every customer's folder.
 * 2. Whatever comes out is checked back against that workspace with `realpath` on both sides. A
 *    configured `config.webroot`, or a `.webroot` that is a SYMLINK into another site — neither may
 *    take this tool outside the folder the seat was granted. This is the same judgement
 *    `@tracy/dsh-subprocess-docker`'s path fence makes for `read`/`write`/`glob`; it is spelled
 *    again here rather than imported because a runtime edge from one plugin to another is a
 *    dependency the fleet image would have to carry for three lines of `startsWith`.
 * @param {string | undefined} configured - explicit `config.webroot`, still fenced.
 * @param {{ agent?: { session: { header: { cwd?: string } } } }} [exec] - the tool-execution context.
 * @returns {Promise<string>} the directory to read the CMS from.
 */
export async function sessionWebroot(configured, exec) {
  const sessionCwd = exec?.agent?.session.header.cwd
  if (typeof sessionCwd !== 'string' || sessionCwd === '') {
    throw new Error(
      'tracy-webroot-read: no session workspace to read a webroot from — refused. This tool reports on the SITE of the calling session; without one there is no site to report on.'
    )
  }
  const root = await realpath(sessionCwd)
  const resolved = await resolveWebroot(configured, root)
  const real = await realpath(resolved)
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
    throw new Error(
      `tracy-webroot-read: webroot ${JSON.stringify(real)} is outside the session's workspace ${JSON.stringify(root)} — refused`
    )
  }
  return real
}

/**
 * `file`'s real path when it stays inside `root` (a real path, as {@link sessionWebroot} returns
 * it), else null. {@link sessionWebroot} fences the webroot itself; this fences each folder and file
 * read under it, so a planted symlink (`components` → `/site/<another site>/…`, reproduced in the
 * survey of 08/10/2026) cannot carry a read into another customer's site. The read then opens the
 * real path returned here, never the name given.
 * @param {string} root - the real webroot.
 * @param {string} file - a path under it.
 * @returns {Promise<string | null>}
 */
export async function insideWebroot(root, file) {
  try {
    const real = await realpath(file)
    return real === root || real.startsWith(`${root}${path.sep}`) ? real : null
  } catch {
    return null
  }
}

/**
 * Open `file` for reading only if the file actually opened lies inside `root` — the check made on
 * the OPEN descriptor, so a link swapped between {@link insideWebroot}'s `realpath` and the open
 * (a background loop flipping it, survey 08/10/2026) cannot redirect the read. The last component is
 * opened with `O_NOFOLLOW`; the descriptor's own path is read back through `/proc/self/fd` where the
 * kernel offers it (Linux: every host and image). Without `/proc` (a developer's Mac) the `realpath`
 * check alone stands, race and all.
 * @param {string} root - the real webroot.
 * @param {string} file - a path under it.
 * @returns {Promise<import('node:fs/promises').FileHandle | null>} the open handle, or null.
 */
export async function openInsideWebroot(root, file) {
  const real = await insideWebroot(root, file)
  if (real === null) return null
  let handle
  try {
    handle = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch {
    return null
  }
  let opened = null
  try {
    opened = await realpath(`/proc/self/fd/${handle.fd}`)
  } catch {
    // No /proc here: nothing better than the check above.
    return handle
  }
  if (opened === root || opened.startsWith(`${root}${path.sep}`)) return handle
  await handle.close().catch(() => {})
  return null
}
