// The demo baseline of a quickstart version as it is committed beside the contract (`demo-baseline.json`, #419): what the
// untouched quickstart site showed, measured at step 0 through the host's demo-qa door by tracy-web
// (`apps/tracy-web/scripts/site-check-baseline.mjs`, which only tracy-web can run: it reaches the site's host), and written
// here by `cli.mjs baseline`. tracy-web reads it back (`apps/tracy-web/src/lib/template-kit/demo-baseline-file.js`).
//
// The file is the template's demo, never the machine that measured it: the measuring time is dropped, and a value that
// names a host, an address or a moment (an absolute URL, an IP address, an ISO timestamp) refuses the whole file, so a
// bench site's name can never be committed to the public tree. Text keys, picture paths and hashes, selectors and the
// demo's own words stay.

export const BASELINE_FILE = 'demo-baseline.json'
const SCHEMA = 'demo-baseline/1'

/** The parts the site check reads, in the order the file keeps them; anything else is not the template's demo. */
const KEPT = [
  'schema',
  'quickstart',
  'source',
  'texts',
  'labels',
  'pictures',
  'unread',
  'over',
  'blocks',
  'textBlocks',
  'maps'
]

const MACHINE = [
  { what: 'an absolute URL', re: /[a-z][a-z0-9+.-]*:\/\//i },
  { what: 'an IP address', re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/ },
  { what: 'a timestamp', re: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/ }
]

/** The first string anywhere in `value` that names a machine, with where it sits, or null. */
function machineValue(value, at = '') {
  if (typeof value === 'string') {
    const hit = MACHINE.find((m) => m.re.test(value))
    return hit ? { at, what: hit.what } : null
  }
  if (value && typeof value === 'object')
    for (const [key, inner] of Object.entries(value)) {
      const found = machineValue(inner, at ? `${at}.${key}` : key)
      if (found) return found
    }
  return null
}

/**
 * The file to commit beside the contract `contractId`, from a baseline measured on its untouched quickstart site.
 * @param {any} measured the stored measurement (`ensureBaseline`, one file per version in the bench's baseline folder)
 * @param {{ contractId: string }} contract the `id` of the contract's manifest.json
 * @returns {{ error: string, doc: null } | { error: null, doc: object }}
 */
export function contractBaselineOf(measured, { contractId }) {
  const refuse = (error) => ({ error, doc: null })
  if (!measured || typeof measured !== 'object') return refuse('the measurement is not a JSON object')
  if (measured.schema !== SCHEMA) return refuse(`the measurement is not ${SCHEMA}`)
  if (measured.source !== 'host')
    return refuse(`the measurement was not made on the untouched site (source ${String(measured.source)})`)
  if (measured.quickstart !== contractId)
    return refuse(`the measurement is of ${String(measured.quickstart)}, not of the contract ${contractId}`)
  if (!Array.isArray(measured.texts) || !Array.isArray(measured.pictures?.files))
    return refuse('the measurement lists no texts or pictures')
  const doc = Object.fromEntries(KEPT.filter((k) => measured[k] !== undefined).map((k) => [k, measured[k]]))
  const machine = machineValue(doc)
  if (machine) return refuse(`${machine.at} holds ${machine.what}; a committed baseline names no machine`)
  return { error: null, doc }
}
