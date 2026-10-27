// A `flock` for machines that have none (macOS), so scripts that refuse to run unlocked can still
// be tested there. It calls flock(2) on the inherited descriptor, as util-linux `flock [-n|-w N]
// <fd>` does: the lock belongs to the open file description the calling shell holds, so it
// outlives this helper exactly like the real tool's, and contention between two scripts is real
// kernel waiting. On a machine with the real tool (the fleet, Linux CI) nothing is put on PATH.
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const HAS_FLOCK = spawnSync('sh', ['-c', 'command -v flock'], { encoding: 'utf8' }).stdout.trim() !== ''

const SHIM = `#!/usr/bin/env python3
import fcntl, sys, time
args = sys.argv[1:]
wait = None
while args and args[0].startswith('-'):
    flag = args.pop(0)
    if flag == '-n':
        wait = 0.0
    elif flag == '-w':
        wait = float(args.pop(0))
fd = int(args[0])
if wait is None:
    fcntl.flock(fd, fcntl.LOCK_EX)
    sys.exit(0)
deadline = time.time() + wait
while True:
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        sys.exit(0)
    except BlockingIOError:
        if time.time() >= deadline:
            sys.exit(1)
        time.sleep(0.05)
`

let dir = null

/** PATH with a flock stand-in first when the machine lacks the real one; `basePath` otherwise. */
export function pathWithFlock(basePath = process.env.PATH ?? '') {
  if (HAS_FLOCK) return basePath
  if (!dir) {
    dir = mkdtempSync(path.join(tmpdir(), 'flock-shim-'))
    writeFileSync(path.join(dir, 'flock'), SHIM)
    chmodSync(path.join(dir, 'flock'), 0o755)
    process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  }
  return `${dir}${path.delimiter}${basePath}`
}
