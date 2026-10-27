/**
 * The shape `/ops/cms` reads, and the vocabulary it is allowed to say.
 *
 * WHY A SCHEMA MODULE AND NOT JUST OBJECT LITERALS. Three different programs have to agree about
 * this shape — the generator that writes a snapshot, the app that serves it, and the browser that
 * draws it — and two of them run in a container that has never seen this repository. A shared
 * constant is the only thing that keeps "unsupported" from becoming "missing" somewhere along the
 * way, and those two mean opposite things to whoever gets paged.
 *
 * 🔒 STATUS IS NOT A BOOLEAN, AND THE SIX VALUES ARE NOT INTERCHANGEABLE. The whole point of the
 * screen is that "we did not look" and "it is not there" are different answers. Collapsing them is
 * the failure this vocabulary exists to prevent:
 *
 *   ok           read it, parsed it, here it is.
 *   missing      the file/record is absent at this ref, and something expects it to exist.
 *   unsupported  absent AND that is correct here — this ref predates the feature, or this CMS
 *                never had it. Never drawn as a fault.
 *   unavailable  we could not read it right now (host down, timeout, no channel). Try again.
 *   error        we read it and it did not parse, or it failed a check. Someone must look.
 *   unknown      nobody has observed this. The honest answer for every runtime fact we have no
 *                channel for, and the default rather than the exception.
 *
 * `stale` and `mismatch` are NOT statuses — they are qualifiers a section adds on top of `ok`,
 * because a stale reading is still a reading and a version mismatch still has two versions to
 * show. They live in `reason`.
 */

/** Bump when the envelope shape changes in a way an older reader would misread. */
export const SCHEMA_VERSION = 'tracy-ops-cms/v1'

export const STATUS = Object.freeze({
  OK: 'ok',
  MISSING: 'missing',
  UNSUPPORTED: 'unsupported',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
  UNKNOWN: 'unknown'
})

const STATUSES = new Set(Object.values(STATUS))

/**
 * The three layers a configuration fact can live at, kept apart everywhere.
 *
 * `inRepo` is answerable from a tree. `packaged` needs a manifest or an artifact to have been
 * inspected — a URL in a catalogue proves a declaration, never a file. `running` needs somebody to
 * have observed a host, so without an observation channel it is `unknown` and stays that way.
 */
export function layers({
  inRepo = STATUS.UNKNOWN,
  packaged = STATUS.UNKNOWN,
  running = STATUS.UNKNOWN
} = {}) {
  return { inRepo, packaged, running }
}

/** The CMS ids this surface knows. Stable identifiers; labels are the UI's business. */
export const CMS = Object.freeze(['joomla', 'wordpress', 'emdash'])

/**
 * One section of a snapshot.
 *
 * `sources` is not decoration: every section carries the exact paths it was read from and the
 * sha256 of each, so a reader can go and check, and so a tampered snapshot fails validation rather
 * than rendering as fact.
 * @param {string} status - one of STATUS.
 * @param {object} [opts]
 * @returns {{status: string, reason: string|null, data: unknown, sources: Array<object>}}
 */
export function section(status, { reason = null, data = null, sources = [] } = {}) {
  if (!STATUSES.has(status)) throw new Error(`ops-cms: unknown status ${status}`)
  if (status !== STATUS.OK && reason === null)
    throw new Error(`ops-cms: status ${status} needs a reason — a bare refusal teaches nobody anything`)
  return { status, reason, data, sources }
}

/**
 * A file this snapshot read, named so it can be checked.
 * @param {string} path - repo-relative.
 * @param {string} sha256 - of the exact bytes read.
 * @param {number} bytes
 */
export function source(path, sha256, bytes) {
  return { path, sha256, bytes }
}

/**
 * One thing somebody actually observed on a running system.
 *
 * Separate from `sections` on purpose: a section describes a tree, an observation describes a
 * machine at a moment. Merging them is how a screen ends up claiming a branch is "running".
 */
export function observation({ target, status, observedAt, evidence = null, reason = null }) {
  if (!STATUSES.has(status)) throw new Error(`ops-cms: unknown status ${status}`)
  return { target, status, observedAt, evidence, reason }
}

/** The section keys a complete snapshot carries. A generator that skips one must say why. */
export const SECTION_KEYS = Object.freeze([
  'bases',
  'capabilities',
  'stages',
  'designs',
  'contracts',
  'presets',
  'questions',
  'tools'
])

/**
 * Assemble an envelope, and refuse to assemble an incomplete one.
 *
 * Every section key must be present — a snapshot that silently omits `contracts` would draw as an
 * empty screen rather than as a missing reading, and the whole design rests on those being told
 * apart.
 */
export function envelope({ source: src, sections, observations = [], notes = [] }) {
  for (const key of SECTION_KEYS) {
    if (!sections[key]) throw new Error(`ops-cms: snapshot is missing section ${key}`)
  }
  for (const key of Object.keys(sections)) {
    if (!SECTION_KEYS.includes(key)) throw new Error(`ops-cms: snapshot has unknown section ${key}`)
  }
  return { schemaVersion: SCHEMA_VERSION, source: src, sections, observations, notes }
}

/**
 * Is this object a snapshot this reader understands?
 *
 * Used by the SERVER before it serves anything, not only by tests: a snapshot file that was
 * truncated, hand-edited or built by an older generator must become a visible failure, never a
 * half-drawn screen. Returns a list of problems — empty means good.
 * @param {unknown} snap
 * @returns {string[]}
 */
export function validate(snap) {
  const problems = []
  if (!snap || typeof snap !== 'object') return ['snapshot is not an object']
  const s = /** @type {Record<string, any>} */ (snap)
  if (s.schemaVersion !== SCHEMA_VERSION)
    problems.push(`schemaVersion is ${String(s.schemaVersion)}, this reader speaks ${SCHEMA_VERSION}`)
  const src = s.source
  if (!src || typeof src !== 'object') problems.push('source is missing')
  else {
    for (const field of ['env', 'ref', 'sha', 'generatedAt']) {
      if (typeof src[field] !== 'string' || src[field] === '') problems.push(`source.${field} is missing`)
    }
    if (typeof src.sha === 'string' && !/^[0-9a-f]{40}$/.test(src.sha))
      problems.push('source.sha is not a full 40-character commit id')
  }
  if (!s.sections || typeof s.sections !== 'object') problems.push('sections is missing')
  else {
    for (const key of SECTION_KEYS) {
      const sec = s.sections[key]
      if (!sec) {
        problems.push(`section ${key} is missing`)
        continue
      }
      if (!STATUSES.has(sec.status)) problems.push(`section ${key} has unknown status ${String(sec.status)}`)
      if (sec.status !== STATUS.OK && !sec.reason)
        problems.push(`section ${key} is ${sec.status} with no reason`)
      if (!Array.isArray(sec.sources)) problems.push(`section ${key} has no sources array`)
    }
  }
  if (!Array.isArray(s.observations)) problems.push('observations is missing')
  return problems
}
