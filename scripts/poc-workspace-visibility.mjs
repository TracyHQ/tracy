/**
 * The mandatory PoC gate of ADR 0003 §4: **a subuser must not SEE a workspace they were not granted.**
 *
 * WHY A SCRIPT, NOT A ONE-OFF MANUAL TRY. The ADR records this gate as a prerequisite before rollout, and
 * as of 30/08 it still had *"no trace of having run"*. A gate that never ran is a gate whose colour nobody
 * knows. The ADR's wording is precise and worth keeping: **"cannot open" is NOT ENOUGH — it must NOT SEE**,
 * because the label list is the customer list.
 *
 * WHY WEBSOCKET. `workspace/list` DOES NOT EXIST in dsh 0.1.2-alpha.1. The list travels over the
 * `workspace/follow` stream; a plain call gets *"stream Remote method"* straight back from dsh. The only
 * way in is the `/api/remote.mux` mux. It uses `ws` rather than Node's built-in WebSocket because the
 * latter cannot send a `Cookie` header during the handshake — and this whole test is about cookies.
 *
 * TWO COOKIES, TWO LAYERS, DO NOT MIX THEM UP:
 *   `dsh_gateway_token`      the dsh-passwords session — it decides who the subuser is
 *   `dsh-auth-<authority>`   dsh's own session          — it decides whether the request is accepted
 * Without the first the gateway bounces to the sign-in page; without the second dsh returns 401. Both are needed.
 *
 * Usage:
 *   node scripts/poc-workspace-visibility.mjs --port 51711 --cookie "<both cookies>"
 */

import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')

/** How long to wait for frames. A silent stream is an answer too — it means zero seen. */
const LISTEN_MS = 8000

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    cookie: { type: 'string' },
    label: { type: 'string' }
  }
})

if (values.port === undefined || values.cookie === undefined) {
  process.stderr.write('usage: --port <port> --cookie "<dsh_gateway_token=…; dsh-auth-…=…>" [--label name]\n')
  process.exit(2)
}

const port = values.port
const label = values.label ?? `port ${port}`
const origin = `http://127.0.0.1:${port}`

const socket = new WebSocket(`ws://127.0.0.1:${port}/api/remote.mux`, {
  headers: {
    // Origin must match the authority: dsh refuses cross-site before it even looks at identity.
    Origin: origin,
    Cookie: values.cookie
  }
})

/** Every workspace path seen in the stream, deduplicated. */
const seen = new Set()
/** Raw frames, kept so there is something to read when the result is unexpected. */
const frames = []

/**
 * Collects every `path` field at any depth.
 *
 * A recursive scan rather than reading a fixed shape: the frame shape was inferred from generated code,
 * not from docs — and a security check that misses because it guessed the data shape wrong is worse
 * than no check.
 * @param node - any node of a parsed frame.
 */
function harvestPaths(node) {
  if (Array.isArray(node)) {
    for (const item of node) harvestPaths(item)
    return
  }
  if (node === null || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if (key === 'path' && typeof value === 'string') seen.add(value)
    else harvestPaths(value)
  }
}

socket.on('open', () => {
  socket.send(
    JSON.stringify({
      type: 'open',
      streamId: 'poc-1',
      endpoint: 'workspace/follow',
      payload: { args: {} }
    })
  )
})

socket.on('message', (data) => {
  const text = String(data)
  frames.push(text.slice(0, 400))
  try {
    harvestPaths(JSON.parse(text))
  } catch {
    // A non-JSON frame is unusual but not worth failing the measurement — it is kept above.
  }
})

socket.on('error', (error) => {
  process.stderr.write(`  ${label}: socket error — ${error.message}\n`)
})

setTimeout(() => {
  try {
    socket.close()
  } catch {
    /* already closing */
  }
  const paths = [...seen].sort()
  process.stdout.write(`\n  ${label}\n`)
  process.stdout.write(`    frames received : ${frames.length}\n`)
  process.stdout.write(`    workspaces SEEN : ${paths.length}\n`)
  for (const path of paths) process.stdout.write(`      - ${path}\n`)
  if (frames.length > 0 && paths.length === 0) {
    process.stdout.write(`    (frames but no paths — sample: ${frames[0].slice(0, 120)})\n`)
  }
  process.exit(0)
}, LISTEN_MS)
