/**
 * The contract between @tracy/dsh-sandbox-docker and @tracy/dsh-subprocess-docker.
 *
 * dsh's sandbox seam returns an argv, and only an argv: `confine(argv, policy)` has nowhere else to
 * put the mode. bwrap/seatbelt encode it as runner flags in front of the program; this provider
 * encodes it the same way, as six tokens the subprocess provider strips before `docker exec`.
 * `danger-full-access` never reaches confine() (bash-sandbox and terminal-bash skip it), so an
 * unstamped argv means exactly that mode.
 *
 * The stamp carries TWO facts, not one. The mode becomes the exec user. The root is the policy's
 * `workspaceRoot` — the folder the seat door granted this session — and the subprocess provider
 * checks the spawn's cwd against it, because `tool-bash` passes a model-supplied `workdir`
 * verbatim as that cwd. Without the root in here, a seat granted one site could name another
 * site's folder and land in that site's container.
 */
export const MARKER = 'tracy-sandbox'

/** Modes a confine() call may carry — the seam's ConfinedSandboxMode. */
const CONFINED = new Set(['read-only', 'workspace-write'])

/**
 * Put the mode and the granted workspace root in front of the argv.
 * @param {readonly string[]} argv - the program and its arguments.
 * @param {string} mode - a confined sandbox mode.
 * @param {string} root - the policy's absolute workspaceRoot, the session's granted site folder.
 * @returns {string[]} the stamped argv.
 */
export function stamp(argv, mode, root) {
  if (!CONFINED.has(mode))
    throw new Error(`tracy-sandbox-docker: ${JSON.stringify(mode)} is not a confined mode`)
  if (typeof root !== 'string' || root === '')
    throw new Error(
      `tracy-sandbox-docker: ${JSON.stringify(root)} is not a workspace root — the cwd has nothing to be checked against`
    )
  return [MARKER, '--mode', mode, '--root', root, '--', ...argv]
}

/**
 * Read a stamp back. An argv without one is the unconfined case, not an error; an argv with half
 * a stamp is malformed, because a stamp that lost its root would silently disable the cross-site
 * check rather than fail.
 * @param {readonly string[]} argv - possibly stamped argv.
 * @returns {{ mode: string | null, root: string | null, argv: string[] }} the mode and granted root
 *   (both null when unstamped) and the bare argv.
 */
export function unstamp(argv) {
  if (argv[0] !== MARKER) return { mode: null, root: null, argv: [...argv] }
  if (
    argv[1] !== '--mode' ||
    !CONFINED.has(argv[2]) ||
    argv[3] !== '--root' ||
    typeof argv[4] !== 'string' ||
    argv[4] === '' ||
    argv[5] !== '--'
  ) {
    throw new Error(`tracy-sandbox-docker: malformed stamp ${JSON.stringify(argv.slice(0, 6))}`)
  }
  return { mode: argv[2], root: argv[4], argv: argv.slice(6) }
}
