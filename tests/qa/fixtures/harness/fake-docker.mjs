#!/usr/bin/env node
// A stand-in for the `docker` CLI: the transport seam of the harness QA layer. It runs nothing in a
// container — it records the argv `docker exec` was given (which container, which user, which
// workdir) and answers as scripted by `<log>.mode`, so a test can see WHERE the provider sent a
// command without a daemon. Real container effects stay an obligation of the stand.
//
//   fake-docker.mjs <log> <docker argv...>
import { appendFileSync, readFileSync } from 'node:fs'

const [log, ...argv] = process.argv.slice(2)
let mode = {}
try {
  mode = JSON.parse(readFileSync(`${log}.mode`, 'utf8'))
} catch {
  // No script: answer success.
}
appendFileSync(log, `${JSON.stringify({ argv, pid: process.pid, at: Date.now() })}\n`)

const exec = argv[0] === 'exec'
// The container is the first token after the flags (`-i`, `-t`, `-u X`, `-w X`, `-e X`).
let index = 1
while (index < argv.length) {
  const token = argv[index]
  if (['-u', '-w', '-e'].includes(token)) index += 2
  else if (token.startsWith('-')) index += 1
  else break
}
const container = exec ? argv[index] : null
const program = exec ? argv.slice(index + 1) : []
const isReaper = program.some((part) => typeof part === 'string' && part.includes('TRACY_EXEC_ID'))

if (mode.hang === true && !isReaper) {
  // Hold the call open until the provider kills it, as a long command would.
  setInterval(() => {}, 1000)
} else if (typeof mode.delayMs === 'number' && !isReaper) {
  setTimeout(() => finish(), mode.delayMs)
} else {
  finish()
}

function finish() {
  if (typeof mode.stderr === 'string') process.stderr.write(mode.stderr)
  process.stdout.write(mode.stdout ?? `FAKE-DOCKER-OK container=${container ?? 'none'}\n`)
  process.exit(typeof mode.exit === 'number' && !isReaper ? mode.exit : 0)
}
