/**
 * tracy-sandbox-docker — the process sandbox of a dsh whose sites run as Docker containers.
 *
 * WHY THIS EXISTS. dsh's shipped sandbox (`@deepseek-ai/dsh-sandbox-local`) wraps a command in
 * bwrap or seatbelt on the harness host. Here no command runs on the harness host at all:
 * `@tracy/dsh-subprocess-docker` hands every argv to `docker exec` inside the site's own web
 * container, and that container IS the confinement — the kernel keeps site A's shell out of
 * site B's files. What is left for this provider is the file-effect MODE the seam resolves per
 * session (`read-only` for a guest seat, `workspace-write` for an editor): it is stamped onto the
 * argv (see stamp.mjs) and the subprocess provider turns it into the exec user.
 *
 * The seam forbids "silent unconfined passthrough". This is not that: the argv is not run where
 * it was written, and a read-only stamp becomes a user that cannot write.
 */
import { SandboxProvider } from '@deepseek-ai/dsh-sandbox'

import { stamp } from './stamp.mjs'

export { MARKER, stamp, unstamp } from './stamp.mjs'

/** Stable cordis plugin name — must match the row in cordis.patch.yml (RULE #2). */
export const name = 'tracy-sandbox-docker'

export class DockerSandbox extends SandboxProvider {
  /**
   * @param {readonly string[]} argv - the program and its arguments.
   * @param {{ mode: string, workspaceRoot: string }} policy - the per-call policy.
   * @returns {{ argv: string[], enforcement: 'full', denialSignatures: string[], runnerFailureRules: [] }}
   */
  confine(argv, policy) {
    return {
      // workspaceRoot is the seam's own resolution of the session cwd, never a model argument:
      // it is what the subprocess provider checks a model-chosen `workdir` against.
      argv: stamp(argv, policy.mode, policy.workspaceRoot),
      enforcement: 'full',
      // What a denied write looks like from inside a Linux container run as `nobody`.
      denialSignatures: ['permission denied', 'read-only file system'],
      runnerFailureRules: []
    }
  }
}

export default DockerSandbox
