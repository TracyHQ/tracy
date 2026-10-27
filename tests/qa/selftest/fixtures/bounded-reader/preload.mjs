// Test seam: once armed on a file, the first read of that file (sync, async or whole-file) is followed by
// the file changing (QA_GROW_MODE=grow appends a byte, shrink truncates it to one byte). The change
// lands at a fixed point of the read, so the selftest needs no sleeps to hit the race window.
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'

const mode = process.env.QA_GROW_MODE
let target = null
let ino = null
let fired = false

globalThis.__qaArm = (file) => {
  target = file
  ino = fs.statSync(file).ino
}

const change = () => {
  fired = true
  if (mode === 'grow') fs.appendFileSync(target, 'x')
  else if (mode === 'shrink') fs.truncateSync(target, 1)
}
const isTarget = (fd) => {
  if (!mode || fired || target === null) return false
  try {
    return typeof fd === 'number' && fs.fstatSync(fd).ino === ino
  } catch {
    return false
  }
}

const readSync = fs.readSync
fs.readSync = function patched(fd, ...rest) {
  const hit = isTarget(fd)
  const result = readSync.call(this, fd, ...rest)
  if (hit && result > 0) change()
  return result
}
const readFileSync = fs.readFileSync
fs.readFileSync = function patched(arg, ...rest) {
  const hit = typeof arg === 'number' ? isTarget(arg) : arg === target && !fired && !!mode
  const result = readFileSync.call(this, arg, ...rest)
  if (hit && result.length > 0) change()
  return result
}
syncBuiltinESMExports()

const probe = await fs.promises.open(import.meta.filename)
const proto = Object.getPrototypeOf(probe)
await probe.close()
for (const method of ['read', 'readFile']) {
  const original = proto[method]
  proto[method] = async function patched(...args) {
    const hit = isTarget(this.fd)
    const result = await original.apply(this, args)
    if (hit && (result.bytesRead ?? result.length) > 0) change()
    return result
  }
}
