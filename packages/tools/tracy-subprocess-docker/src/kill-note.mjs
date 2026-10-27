/**
 * WHAT THE AGENT READS WHEN THE KERNEL KILLS ITS COMMAND INSIDE THE SITE'S CONTAINER.
 *
 * Since 28/09/2026 every site container carries a memory cap (render-compose.sh
 * `tracy_site_limits`). A command that goes over it is not refused: the kernel kills the biggest
 * process in the container with SIGKILL, and `docker exec` hands that back as exit status 137.
 * dsh's bash tool renders it as a bare `[exit code: 137]` — measured on a capped container: an
 * `awk` that grows a string without end came back as 137 and nothing else, and a `sh -c` around the
 * same thing added only the shell's own word `Killed`. Neither says "out of memory", so the agent
 * cannot tell a command that will fail the same way every time from one worth a second try, and
 * tries again.
 *
 * So, after an exit of 137 that nothing on this side caused (no timeout, no abort — those arrive as
 * a signal on the docker CLI itself, never as its exit status), one more tiny exec reads the
 * container's own memory accounting — `memory.max` and the `oom_kill` count of `memory.events`
 * (cgroup v2; `memory.limit_in_bytes` and `memory.oom_control` on a v1 host) — and one line saying
 * what it found goes after the command's own stderr. The count is the container's since it
 * started, so the line says "most likely", not "certainly": an older kill in the same container
 * cannot be told apart. A probe that fails says nothing at all — no line is better than a guess.
 */

/** 128 + SIGKILL: what `docker exec` answers when the process it ran was killed with signal 9. */
export const KILLED_EXIT = 137

/** How long the probe may take before the command's own result is handed back without a line. */
export const KILL_PROBE_TIMEOUT_MS = 3000

/**
 * The probe, for the container's own `sh`, as the exec user — both files are world-readable
 * (`-r--r--r--` and `-rw-r--r--`, measured as uid 65534). Prints `max <bytes|max>` then the events.
 */
export const KILL_PROBE_SCRIPT = [
  'if [ -r /sys/fs/cgroup/memory.events ]; then',
  'printf "max %s\\n" "$(cat /sys/fs/cgroup/memory.max)"; cat /sys/fs/cgroup/memory.events',
  'elif [ -r /sys/fs/cgroup/memory/memory.oom_control ]; then',
  'printf "max %s\\n" "$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)"; cat /sys/fs/cgroup/memory/memory.oom_control',
  'fi'
].join('\n')

/**
 * The docker exec argv of the probe: same container, same user as the command, no tty, no stdin.
 * @param {{ user: string, container: string, cfg: { docker: string } }} input
 * @returns {string[]}
 */
export function killProbeArgv({ user, container, cfg }) {
  return [cfg.docker, 'exec', '-u', user, container, 'sh', '-c', KILL_PROBE_SCRIPT]
}

/**
 * What the probe printed, or null when it is not the probe's shape.
 * @param {string} text
 * @returns {{ memoryMax: number | null, oomKills: number } | null} `memoryMax` in bytes, null when
 *   the container has no memory cap (`max` on v2; v1 writes a page-rounded 2^63 instead).
 */
export function parseKillProbe(text) {
  const max = /^max (\S+)$/m.exec(String(text ?? ''))?.[1]
  const kills = /^oom_kill (\d+)$/m.exec(String(text ?? ''))?.[1]
  if (max === undefined || kills === undefined) return null
  const bytes = /^\d+$/.test(max) ? Number(max) : null
  if (bytes === null && max !== 'max') return null
  return { memoryMax: bytes !== null && bytes < 2 ** 60 ? bytes : null, oomKills: Number(kills) }
}

/**
 * The line the agent reads after a 137, or '' when there is nothing true to say.
 * @param {{ memoryMax: number | null, oomKills: number } | null} probe
 * @returns {string}
 */
export function killNote(probe) {
  if (probe === null) return ''
  if (probe.oomKills === 0)
    return (
      "[subprocess-docker: exit 137 is a SIGKILL, and this site's container records no process killed " +
      'for memory — it was not the memory cap. Something sent the command SIGKILL.]'
    )
  const kills = `${probe.oomKills} process${probe.oomKills === 1 ? '' : 'es'}`
  const where =
    probe.memoryMax === null
      ? `the machine ran short of memory and the kernel has killed ${kills} in this site's container`
      : `this site's container is capped at ${Math.round(probe.memoryMax / 1048576)} MiB of memory, and the kernel has killed ${kills} in it for going over`
  return (
    `[subprocess-docker: exit 137 is a SIGKILL: ${where} since it started, so this command most ` +
    'likely ran out of memory. Running it again the same way fails the same way: make it use less ' +
    '(smaller batches, fewer parallel jobs, a lower NODE_OPTIONS=--max-old-space-size), or tell the ' +
    'customer this task needs more memory than the site is given.]'
  )
}

/**
 * A collected-output reader with `note()` after the stream's end, once `note()` says anything. The
 * note sits past the real stream's last byte, so every offset keeps its meaning: a read from 0 (the
 * whole result) carries the stream and then the note, a read from where the stream ended carries the
 * note alone, and a read from past the note carries nothing. A note is only ever set after the
 * process has closed, so the real stream does not grow under it.
 * @template {{ readFrom: (fromByte: number) => { text: string, nextOffset: number, lossy: boolean, spillPath?: string } }} R
 * @param {R} reader - the local runtime's collect-mode reader (`readFrom` is the whole of the seam's
 *   reader contract, so it is all the wrapper carries).
 * @param {() => string} note - the note so far ('' until the probe has answered).
 * @returns {R}
 */
export function withNote(reader, note) {
  return /** @type {R} */ ({
    readFrom(fromByte) {
      const read = reader.readFrom(fromByte)
      const text = note()
      if (text === '') return read
      const end = read.nextOffset
      const whole = reader.readFrom(Math.max(0, end - 1)).text
      const line = Buffer.from(`${end > 0 && !whole.endsWith('\n') ? '\n' : ''}${text}\n`, 'utf8')
      const skip = Math.max(0, fromByte - end)
      return {
        ...read,
        text: read.text + line.subarray(Math.min(skip, line.length)).toString('utf8'),
        nextOffset: end + line.length
      }
    }
  })
}
