// The kept state of write safety (ticket #586): what every finished pass learnt (the ledger, the findings, the passes
// and the steps spent), saved after each pass, so a measurement its time limit stopped carries on from the next pass
// when the gate runs again into the same run folder. A state is resumed only under the same key: the gate version, the
// kit's files, the plugin, the blank site archive, the probe catalogue, the site, and the code of the gate and of the
// build's write step (`gateCodeSha256`; `release-gate.mjs` makes the key). A resumed record is never released
// (`release-binding.mjs`): resuming is for a run stopped by its time limit, not for a release. Reads and writes one
// file; the memory form is for the unit test.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** The source folders whose code decides what a write safety pass measures: the gate and the build's write step. */
const CODE = [
  ['scripts/ai-quickstart/gate', /\.mjs$/],
  ['packages/wo/website-opportunities/domain', /\.mjs$/],
  ['apps/tracy-web/src', /^step-chain-draft-.*\.js$/]
]

/** The sha256 over the code a write safety state depends on, read under `root`. */
export function gateCodeSha256(root) {
  const hash = createHash('sha256')
  for (const [dir, match] of CODE) {
    const full = path.join(root, dir)
    if (!existsSync(full)) continue
    for (const name of readdirSync(full, { recursive: true }).map(String).sort())
      if (match.test(path.basename(name)) && !name.includes('node_modules'))
        hash.update(dir + '/' + name + '\0').update(readFileSync(path.join(full, name)))
  }
  return hash.digest('hex')
}

/** A state kept in memory. */
export function memoryState() {
  let kept = null
  return {
    load: () => (kept ? structuredClone(kept) : null),
    save: (value) => {
      kept = structuredClone(value)
    }
  }
}

/** A state kept in one JSON file. */
export function fileState(file) {
  return {
    load: () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null),
    save: (value) => writeFileSync(file, JSON.stringify(value))
  }
}

/**
 * The earlier passes of the same key, or null.
 * @param {{load: () => object | null} | null} state
 * @param {string | null} key
 */
export function resumed(state, key) {
  if (!state || !key) return null
  const was = state.load()
  return was && was.key === key ? was : null
}
