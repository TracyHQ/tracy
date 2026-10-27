// Runs one reader on one file in its own process, so a reader that hangs on a FIFO costs the parent a
// timeout, not the whole selftest. Prints one JSON line: { ok: true, value } (what the caller returned:
// Buffers as UTF-8 text, the rest as JSON) or { ok: false, message }.
// Env QA_GROW_MODE=grow|shrink makes the file change right after the first read of it (see preload.mjs).
import path from 'node:path'
import { CALLERS } from './callers.mjs'

const [name, file] = process.argv.slice(2)
const caller = CALLERS[name]
if (!caller) throw new Error(`unknown caller ${name}`)
// Load the module before the file is touched, so the loader's own reads are not mistaken for ours.
await caller.call(path.join(path.dirname(file), 'absent-dir', 'warm.json')).catch(() => {})
globalThis.__qaArm?.(file)
let out
try {
  const value = await caller.call(file)
  out = { ok: true, value: Buffer.isBuffer(value) ? value.toString('utf8') : (value ?? null) }
} catch (error) {
  out = { ok: false, message: String(error?.message ?? error) }
}
process.stdout.write(`${JSON.stringify(out)}\n`)
process.exit(0)
