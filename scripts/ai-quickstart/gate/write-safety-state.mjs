// The kept state of write safety (ticket #586): what every finished pass learnt (the ledger, the findings, the passes
// and the steps spent), saved after each pass, so a measurement its time limit stopped carries on from the next pass
// when the gate runs again into the same run folder. A state is resumed only under the same key: the gate version, the
// kit's files, the plugin, the blank site archive and the probe catalogue (`release-gate.mjs` makes it). Reads and
// writes one file; the memory form is for the unit test.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

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
