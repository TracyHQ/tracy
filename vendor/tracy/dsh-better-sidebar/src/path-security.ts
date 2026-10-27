/** Filesystem path guards shared by sidebar APIs that access a session workspace. */
import { realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isWithin, requireAbsolute } from './fs-tree.ts'
import { resolveSessionPath } from './session-path.ts'
import { SidebarError } from './wire.ts'

/**
 * Which directory a sidebar request is allowed to work in.
 *
 * 🔒 THE DIRECTORY IS A TENANT SELECTOR, NOT A CONVENIENCE. Every scoped
 * sidebar call carries an optional client `cwd` — the session's directory as
 * the client's own list summary remembers it, sent so a request that arrives
 * before the session attaches still lands somewhere sensible. On a harness
 * that serves one workspace that only chose a folder. On a harness that serves
 * many customer sites, ONE process has every site mounted: an unchecked client
 * directory is a read of another tenant's files, and on the terminal route the
 * subprocess provider reads the SITE out of this very path and runs the shell
 * in that site's container (with no sandbox stamp for it to cross-check).
 *
 * The rule, one for every route: the session's own workspace is authoritative;
 * a client value is honoured only when it names a directory INSIDE it, and
 * refused loudly otherwise — a request aimed at another tenant is answered
 * with an error, not quietly redirected. A `..` segment is refused outright
 * rather than normalized away: this module does no I/O, so it cannot tell a
 * symlink from a directory, and a path that climbs out and back in must not
 * get the benefit of the doubt.
 * @param sessionCwd - the session's authoritative workspace directory.
 * @param clientCwd - the directory the client asked for, if any.
 * @returns the directory to work in.
 * @throws {SidebarError} when the client's directory is not absolute, or not inside the workspace.
 */
export function workspaceCwd(sessionCwd: string, clientCwd?: string): string {
  const workspace = requireAbsolute(sessionCwd)
  if (clientCwd === undefined || clientCwd === '') return workspace
  if (clientCwd.split(/[\\/]/).includes('..')) {
    throw new SidebarError('forbidden', `working directory "${clientCwd}" leaves the session workspace`, 403)
  }
  let requested: string
  try {
    // requireAbsolute() resolves separators and `.` segments; the `..` refusal
    // above has already run, so nothing can be normalized back into the workspace.
    requested = requireAbsolute(clientCwd)
  } catch {
    throw new SidebarError('bad-request', `invalid working directory "${clientCwd}"`)
  }
  if (!isWithin(workspace, requested)) {
    throw new SidebarError('forbidden', `working directory "${clientCwd}" is outside the session workspace`, 403)
  }
  return requested
}

/** Resolve a path and convert filesystem resolution failures to an API error. */
async function resolveRealPath(path: string, label: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error) {
    throw new SidebarError('fs-error', `cannot resolve ${label} "${path}": ${error instanceof Error ? error.message : String(error)}`, 400)
  }
}

/**
 * The one refusal for every target outside the workspace. It names the path
 * the client sent, never what it resolved to, and is raised before any
 * filesystem error about that target can surface: a fence that answered
 * ENOENT for a missing file in another site and 403 for an existing one would
 * tell a seat which files that site has (Tracy SEC-2).
 */
function refuseOutside(requested: string): never {
  throw new SidebarError('forbidden', `path "${requested}" is outside workspace`, 403)
}

/**
 * Lexical half of the fence, run before any I/O on the target: a path that is
 * not spelled inside the workspace (as given, or as its canonical form) is
 * refused without ever being stat'ed.
 */
function assertSpelledInside(cwd: string, realCwd: string, requested: string): void {
  if (!isWithin(requireAbsolute(cwd), requested) && !isWithin(realCwd, requested)) refuseOutside(requested)
}

/**
 * Canonical path of the nearest ancestor of `path` (itself included) that
 * resolves. The filesystem root always does, so this always returns.
 */
async function nearestRealAncestor(path: string): Promise<string> {
  let current = path
  for (;;) {
    try {
      return await realpath(current)
    } catch {
      const parent = dirname(current)
      if (parent === current) return current
      current = parent
    }
  }
}

/**
 * A target that failed to resolve must not say why when its nearest
 * resolvable ancestor already lies outside the workspace (a symlink planted
 * inside it that points into another site): refuse it like an existing one.
 */
async function assertFailureInside(realCwd: string, failedPath: string, requested: string): Promise<void> {
  const ancestor = await nearestRealAncestor(dirname(failedPath))
  if (!isWithin(realCwd, ancestor)) refuseOutside(requested)
}

/**
 * Resolve an existing workspace path through symlinks and (unless disarmed)
 * enforce containment.
 *
 * Order matters (Tracy SEC-2): the lexical check runs before the target is
 * touched, and a target that does not resolve is checked through its nearest
 * resolvable ancestor before its error is reported, so every target outside
 * the workspace gets the same 403 whether it exists or not. The real-path
 * check after resolution still refuses a symlink that escapes.
 *
 * @param cwd - Session workspace directory.
 * @param target - Client-supplied absolute path in the session's namespace.
 * @param fence - Whether containment is enforced (the settings-page
 * `workspaceFence` switch). Even when false the paths are still resolved
 * through symlinks so callers always receive the canonical target.
 * @returns The canonical absolute path used for the filesystem operation.
 */
export async function ensureWorkspacePath(cwd: string, target: string, fence = true): Promise<string> {
  const absolute = requireAbsolute(resolveSessionPath(cwd, target))
  const realCwd = await resolveRealPath(cwd, 'workspace')
  if (fence) assertSpelledInside(cwd, realCwd, absolute)
  let realTarget: string
  try {
    realTarget = await realpath(absolute)
  } catch (error) {
    if (fence) await assertFailureInside(realCwd, absolute, absolute)
    throw new SidebarError('fs-error', `cannot resolve target "${absolute}": ${error instanceof Error ? error.message : String(error)}`, 400)
  }
  if (fence && !isWithin(realCwd, realTarget)) refuseOutside(absolute)
  return realTarget
}

/**
 * Validate a write destination, including destinations that do not exist yet.
 * Existing targets are resolved to catch symlinks; missing targets are checked
 * against the nearest existing ancestor before the caller creates or renames.
 * The returned path is rebuilt from that canonical ancestor, so an existing
 * symlink is never left in the path passed to the write operation. Targets
 * outside the workspace are refused before any filesystem error about them
 * can surface, as in `ensureWorkspacePath`.
 *
 * @param cwd - Session workspace directory.
 * @param target - Client-supplied absolute destination path in the session's namespace.
 * @param fence - Whether containment is enforced (the settings-page
 * `workspaceFence` switch). Resolution/canonicalization is identical either way.
 * @returns A canonical path for an existing target or its nearest existing ancestor.
 */
export async function ensureWorkspaceWritePath(cwd: string, target: string, fence = true): Promise<string> {
  const absolute = requireAbsolute(resolveSessionPath(cwd, target))
  const realCwd = await resolveRealPath(cwd, 'workspace')
  if (fence) assertSpelledInside(cwd, realCwd, absolute)
  let existingPath = absolute
  const missingSegments: string[] = []

  for (;;) {
    let realTarget: string
    try {
      realTarget = await realpath(existingPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (fence) await assertFailureInside(realCwd, existingPath, absolute)
        throw new SidebarError('fs-error', `cannot resolve target "${existingPath}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
      const parent = dirname(existingPath)
      if (parent === existingPath) {
        throw new SidebarError('fs-error', `cannot resolve target "${absolute}"`, 400)
      }
      missingSegments.unshift(basename(existingPath))
      existingPath = parent
      continue
    }
    if (fence && !isWithin(realCwd, realTarget)) refuseOutside(absolute)
    return missingSegments.reduce((path, segment) => join(path, segment), realTarget)
  }
}
