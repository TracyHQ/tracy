/**
 * Refuse to boot a dsh whose build belongs to another submodule commit. `run.sh` calls it after
 * finding the dsh shim and before reading ports; this script exits 3 with one line saying what to
 * run, and run.sh turns that into its own preflight exit 2.
 *
 * It only READS: the key comes from `buildKey` (the one implementation `build-dsh.mjs` also uses)
 * and the verdict from `staleBuild`, both in `scripts/lib/dsh-build-state.mjs`, where the case
 * that made this exist is written down (07/10: blank page, `waiting for service: chatLocal`).
 * Calling `build-dsh.mjs --print-key` instead would run that script's clean-up on every boot.
 */
import { join, resolve } from 'node:path'

import { buildKey, readStamp, staleBuild } from './lib/dsh-build-state.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const HARNESS = join(ROOT, 'vendor', 'tracy', 'deepseek-harness')

const refuse = (reason) => {
  process.stderr.write(
    `check-dsh-build: the dsh build in this checkout is stale — ${reason}.\n` +
      '  Booting it serves the old dsh, and a Tracy plugin that needs the new one leaves a blank page.\n' +
      '  Run `pnpm dsh:build && pnpm install` (in that order), then start again.\n'
  )
  process.exit(3)
}

let key
try {
  key = buildKey(HARNESS, join(ROOT, 'scripts', 'build-dsh.mjs'))
} catch (error) {
  refuse(`its commit cannot be read (${error instanceof Error ? error.message : String(error)})`)
}
if (key === null) {
  process.stderr.write(
    'check-dsh-build: not checked — the dsh submodule has tracked edits, so no build can be matched to it.\n'
  )
  process.exit(0)
}
const reason = staleBuild({ key, stamp: readStamp(HARNESS) })
if (reason !== null) refuse(reason)
