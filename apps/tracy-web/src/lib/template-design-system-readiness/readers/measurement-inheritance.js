/**
 * Whether the committed files prove that a WordPress patch version may carry the design-system numbers of the
 * version before it (`inheritedFrom`, written by
 * `packages/cms/tracy-wordpress-quickstart/scripts/patch-artifacts.mjs`). Read by /ops (`measurement.js`) and by
 * the `contracts` gate (`scripts/lib/patch-evidence.mjs`), so the two cannot disagree.
 *
 * 🔒 NOTHING IS TAKEN FROM WHAT THE EVIDENCE SAYS OF ITSELF. The decision rests only on files committed for BOTH
 * versions, compared here byte for byte or hashed again here:
 *   - the theme: both `presentation-lock.json` hold the same theme (`fileRoots`, `options.stylesheet`/`template`
 *     and the sha256 of every theme file, captured from each release's own webroot by `capture-inventory.mjs`). This
 *     stands in for the theme zip, whose bytes are not committed;
 *   - the slot contract: it is NOT committed per version (one file per theme, `packages/design/tracy-ds-slot/
 *     templates/wordpress-<theme>.json`); the door picks it by the theme's stylesheet and the Version in its
 *     style.css (`contractFor`). Both are in the lock compared above, so the same lock means the same contract;
 *   - the content: both `content-map.json` are the same bytes;
 *   - the previous version's measurement is its own (`version` = that version), or is itself inherited and proven
 *     the same way, link by link (1.0.0 → 1.0.1 → 1.0.2); the inherited numbers are that measurement's.
 * `patch-evidence.json` must be there, and must be exactly what the committed files make it (`evidenceMismatches`:
 * every key recomputed, so stale or hand-edited evidence refuses the inheritance) with no `maxVersion` move: a
 * patch that moved the slot contract is measured again.
 *
 * 🔒 ONE DECISION. /ops (`measurement.js`) and the `contracts` gate (`scripts/lib/patch-evidence.mjs`) both decide
 * through `inheritanceProofAt` and `evidenceMismatches` here; neither has a check of its own about the same thing.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DS_SLOT_DIR } from '../../ds-slot.js'
import { TEMPLATE_PROFILES } from '../../template-profiles.js'

export const EVIDENCE_FILE = 'patch-evidence.json'
export const EVIDENCE_SCHEMA = 'tracy-quickstart-patch-evidence/wordpress/v1'
export const EVIDENCE_COMMENT =
  'What packages/cms/tracy-wordpress-quickstart/scripts/patch-artifacts.mjs compared to cut this dossier from the release and the previous version. Every value is recomputed by scripts/check-contracts.ts from files committed for the two versions (manifest parts, presentation locks, content maps, brand facts, the profile row); an inherited design-system measurement is decided from those files, never from this one.'
const MANIFEST_FILE = 'manifest.json'
const FACTS_FILE = 'brand-facts.json'
/** The profile table the evidence's `profileRow` is recomputed from (its bytes join the /ops fingerprint). */
const PROFILES_FILE = fileURLToPath(new URL('../../template-profiles.json', import.meta.url))
const MEASUREMENT_FILE = 'design-system-measurement.json'
const LOCK_FILE = 'presentation-lock.json'
const MAP_FILE = 'content-map.json'
const WORDPRESS_TAG = /\/wp\d+$/
/** Links followed at most: a chain longer than this is a loop or a mistake. */
const MAX_LINKS = 50

const sha256 = (/** @type {string | Buffer} */ d) => createHash('sha256').update(d).digest('hex')

/** Canonical JSON (keys sorted at every level). */
export const canonical = (/** @type {any} */ v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]])
        )
      : x
  )

/**
 * One hash of a theme's files (`path → sha256`, a presentation lock's `files`). The same formula as
 * `themeFilesHash` of @tracy/ds-slot `brand-facts.mjs` (a test holds the two equal); kept here because this module
 * runs in the tracy-web image, which cannot import that package synchronously.
 * @param {Record<string, string>} files
 */
export function themeFilesHash(files) {
  const sorted = Object.fromEntries(
    Object.keys(files ?? {})
      .sort()
      .map((k) => [k, files[k]])
  )
  return sha256(JSON.stringify(sorted))
}

/** The theme's files that differ between two presentation locks: added, removed, changed (sorted paths). */
export function themeFilesDiff(/** @type {any} */ before, /** @type {any} */ after) {
  const a = before?.files ?? {}
  const b = after?.files ?? {}
  return {
    added: Object.keys(b)
      .filter((f) => !(f in a))
      .sort(),
    removed: Object.keys(a)
      .filter((f) => !(f in b))
      .sort(),
    changed: Object.keys(b)
      .filter((f) => f in a && a[f] !== b[f])
      .sort()
  }
}

/** The row of a profile table without the words: what the evidence hashes. */
export const rowFacts = (/** @type {any} */ row) => {
  if (!row) return null
  const { note: _n, ...rest } = row
  return rest
}

/** -1, 0 or 1 for two `x.y.z` versions. */
export const compareVersions = (/** @type {string} */ a, /** @type {string} */ b) => {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++)
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1
  return 0
}

/** The repo-relative slot contract file of a WordPress theme, as the evidence names it. */
export const slotContractFileOf = (/** @type {string} */ theme) =>
  `packages/design/tracy-ds-slot/templates/wordpress-${theme}.json`

/**
 * The evidence the files committed for a version and the one it names as previous make: every key but
 * `slotContract` (which the evidence fills with the slot contract file and the patch's `maxVersion` move).
 * @param {string} dir the version's contract folder (`…/contracts/<slug>/wp<n>/<version>`)
 * @param {string} previous the previous version (`x.y.z`), a folder beside `dir`
 * @param {{ profiles?: { releases?: Record<string, Record<string, any>> } }} [opts]
 * @returns {{ expected: Record<string, any>, files: string[], manifest: any }}
 */
export function expectedEvidence(dir, previous, { profiles = TEMPLATE_PROFILES } = {}) {
  /** @type {string[]} */
  const files = []
  const read = (/** @type {string} */ f) => {
    files.push(f)
    return existsSync(f) ? readFileSync(f) : null
  }
  const json = (/** @type {Buffer | null} */ b) => {
    try {
      return b ? JSON.parse(b.toString('utf8')) : null
    } catch {
      return null
    }
  }
  const manifest = json(read(path.join(dir, MANIFEST_FILE)))
  const q = manifest?.quickstart ?? {}
  // the id the manifest seals (the gate holds it to the folder's path): `<slug>/wp<n>/<version>`
  const line = String(q.release ?? '').replace(/^quickstart\//, '')
  const previousDir = path.join(path.dirname(dir), previous)
  const previousManifest = json(read(path.join(previousDir, MANIFEST_FILE)))
  const lock = json(read(path.join(dir, LOCK_FILE)))
  const previousLock = json(read(path.join(previousDir, LOCK_FILE)))
  const fileSha = (/** @type {string} */ d, /** @type {string} */ f) => {
    const b = read(path.join(d, f))
    return b ? sha256(b) : null
  }
  const map = fileSha(dir, MAP_FILE)
  const previousMap = fileSha(previousDir, MAP_FILE)
  const facts = json(read(path.join(dir, FACTS_FILE)))
  const previousFacts = json(read(path.join(previousDir, FACTS_FILE)))
  const measurement = json(read(path.join(dir, MEASUREMENT_FILE)))
  files.push(PROFILES_FILE)
  const row = profiles.releases?.[q.release]?.[q.version]
  const parts = (/** @type {any} */ p) => (p ? { file: p.file, bytes: p.bytes, sha256: p.sha256 } : null)
  const expected = {
    schemaVersion: EVIDENCE_SCHEMA,
    $comment: EVIDENCE_COMMENT,
    contract: `${line}/${q.version}`,
    tag: q.release,
    version: q.version,
    previous: `${line}/${previous}`,
    archives: { webroot: parts(q.parts?.webroot), database: parts(q.parts?.database) },
    themeFiles: {
      sha256: lock?.files ? themeFilesHash(lock.files) : null,
      previousSha256: previousLock?.files ? themeFilesHash(previousLock.files) : null
    },
    presentationLock: { sha256: fileSha(dir, LOCK_FILE), previousSha256: fileSha(previousDir, LOCK_FILE) },
    contentMap: { sha256: map, previousSha256: previousMap, changeAccepted: map !== previousMap },
    webrootDiff: {
      theme: themeFilesDiff(previousLock, lock),
      database:
        q.parts?.database?.sha256 === previousManifest?.quickstart?.parts?.database?.sha256
          ? 'same'
          : 'changed'
    },
    brandFacts: {
      sha256: facts ? sha256(canonical(facts.facts)) : null,
      previousSha256: previousFacts ? sha256(canonical(previousFacts.facts)) : null
    },
    profileRow: row ? sha256(canonical(rowFacts(row))) : null,
    measurement: measurement?.inheritedFrom !== undefined ? 'inherited' : 'own'
  }
  if (!previousManifest || compareVersions(previous, String(q.version)) >= 0)
    expected.previousIsEarlier = false
  return { expected, files, manifest }
}

/**
 * Every way a version's `patch-evidence.json` is not what the files committed for it and for the version it names
 * as previous make (`expectedEvidence`); empty when it is exactly that (or when there is no evidence). Every key is
 * recomputed; a key it cannot recompute fails. The slot contract is one file for every version, so the evidence
 * may only name it and the `maxVersion` move the patch made, held to that file.
 * @param {string} dir the version's contract folder (`…/contracts/<slug>/wp<n>/<version>`)
 * @param {{ profiles?: { releases?: Record<string, Record<string, any>> }, slotTemplates?: string }} [opts]
 * @returns {{ problems: string[], files: string[] }} `files`: every file read, for the /ops fingerprint
 */
export function evidenceMismatches(
  dir,
  { profiles = TEMPLATE_PROFILES, slotTemplates = path.join(DS_SLOT_DIR, 'templates') } = {}
) {
  const evidenceFile = path.join(dir, EVIDENCE_FILE)
  /** @type {string[]} */
  const files = [evidenceFile]
  let evidence = null
  try {
    evidence = existsSync(evidenceFile) ? JSON.parse(readFileSync(evidenceFile, 'utf8')) : null
  } catch {
    return { problems: [`${EVIDENCE_FILE} is not JSON`], files }
  }
  if (!evidence) return { problems: [], files }
  /** @type {string[]} */
  const problems = []
  const previous =
    String(evidence.previous ?? '')
      .split('/')
      .pop() ?? ''
  const made = expectedEvidence(dir, previous, { profiles })
  files.push(...made.files)
  const { expected, manifest } = made
  if (expected.previousIsEarlier === false) {
    problems.push(
      `${EVIDENCE_FILE}: previous ${evidence.previous} is not an earlier version committed beside it`
    )
    delete expected.previousIsEarlier
  }
  for (const key of Object.keys(evidence))
    if (!(key in expected) && key !== 'slotContract')
      problems.push(`${EVIDENCE_FILE}: holds ${key}, which no committed file lets the gate recompute`)
  for (const [key, value] of Object.entries(expected))
    if (canonical(evidence[key]) !== canonical(value))
      problems.push(
        `${EVIDENCE_FILE}: ${key} is not what the committed files make it — run patch-artifacts.mjs again`
      )
  const slot = evidence.slotContract
  const theme = manifest?.theme
  const slotFile = slotContractFileOf(theme)
  const slotPath = path.join(slotTemplates, path.basename(slotFile))
  files.push(slotPath)
  const slotBytes = existsSync(slotPath) ? readFileSync(slotPath, 'utf8') : null
  if (!slot || Object.keys(slot).some((k) => k !== 'file' && k !== 'maxVersion'))
    problems.push(
      `${EVIDENCE_FILE}: slotContract holds more than its file and maxVersion move, which the gate cannot recompute`
    )
  else if (slot.file !== slotFile || !slotBytes)
    problems.push(`${EVIDENCE_FILE}: slotContract names ${slot.file}, not ${slotFile}`)
  else if (slot.maxVersion !== null) {
    let now = null
    try {
      now = JSON.parse(slotBytes)?.maxVersion?.[theme] ?? null
    } catch {
      now = null
    }
    const m = slot.maxVersion
    if (!m?.to || !now || compareVersions(m.to, now) > 0 || (m.from && compareVersions(m.from, m.to) >= 0))
      problems.push(
        `${EVIDENCE_FILE}: slotContract.maxVersion ${JSON.stringify(m)} is not a move the committed ${slotFile} (maxVersion ${now}) holds`
      )
  }
  return { problems, files }
}

/**
 * What a presentation lock says of the theme, as one comparable string: its roots, the stylesheet and template it
 * names, and the sha256 of every theme file. Equal strings: the same theme bytes, held to the same slot contract.
 * @param {any} lock
 */
export function themeOf(lock) {
  return canonical({
    roots: lock?.fileRoots ?? null,
    stylesheet: lock?.options?.stylesheet ?? null,
    template: lock?.options?.template ?? null,
    files: lock?.files ?? null
  })
}

/**
 * The proof that `dir` (a version's contract folder) may carry the numbers of `from`.
 * `problem` is null when every link holds; `files` lists every file read, for the /ops fingerprint.
 * @param {string} dir
 * @param {{ tag?: string | null, version: string }} published
 * @param {string} from
 * @param {{ selfProblem: (from: unknown, published: any, evidence: any) => string | null, profiles?: any, slotTemplates?: string }} deps
 *   `selfProblem`: @tracy/ds-slot's `inheritanceProblem` (the evidence names this link); `profiles`/`slotTemplates`:
 *   for tests, as `evidenceMismatches` takes them
 * @returns {{ problem: string | null, files: string[] }}
 */
export function inheritanceProofAt(dir, published, from, deps, links = 0) {
  /** @type {string[]} */
  const files = []
  const read = (/** @type {string} */ f) => {
    files.push(f)
    return existsSync(f) ? readFileSync(f) : null
  }
  const json = (/** @type {Buffer | null} */ b) => {
    try {
      return b ? JSON.parse(b.toString('utf8')) : null
    } catch {
      return null
    }
  }
  const fail = (/** @type {string} */ problem) => ({ problem, files })
  if (links > MAX_LINKS) return fail(`a chain of more than ${MAX_LINKS} inherited measurements`)
  if (!WORDPRESS_TAG.test(String(published.tag ?? '')))
    return fail('only a WordPress patch may inherit a measurement')
  const evidence = json(read(path.join(dir, EVIDENCE_FILE)))
  const self = deps.selfProblem(from, published, evidence)
  if (self) return fail(self)
  // the evidence is exactly what the committed files make it (stale or edited evidence refuses), and the patch did
  // not move the slot contract
  const mismatches = evidenceMismatches(dir, { profiles: deps.profiles, slotTemplates: deps.slotTemplates })
  files.push(...mismatches.files)
  if (mismatches.problems.length) return fail(mismatches.problems[0])
  if (evidence.slotContract?.maxVersion !== null)
    return fail(
      `the patch moved the slot contract's maxVersion (${JSON.stringify(evidence.slotContract?.maxVersion)}): its numbers must be measured again`
    )
  const previousDir = path.join(path.dirname(dir), from)
  const lock = json(read(path.join(dir, LOCK_FILE)))
  const previousLock = json(read(path.join(previousDir, LOCK_FILE)))
  if (!lock || !previousLock) return fail(`a presentation lock of ${published.version} or ${from} is missing`)
  if (!lock.files || !Object.keys(lock.files).length || themeOf(lock) !== themeOf(previousLock))
    return fail(`the theme files of ${published.version} and ${from} differ (presentation locks)`)
  const map = read(path.join(dir, MAP_FILE))
  const previousMap = read(path.join(previousDir, MAP_FILE))
  if (!map || !previousMap || !map.equals(previousMap))
    return fail(`the content maps of ${published.version} and ${from} are not the same bytes`)
  const previous = json(read(path.join(previousDir, MEASUREMENT_FILE)))
  if (!previous) return fail(`${from} has no ${MEASUREMENT_FILE}`)
  if (previous.version !== from) return fail(`${from}'s ${MEASUREMENT_FILE} is for ${previous.version}`)
  // the numbers are the previous version's, unchanged: only the preview rows may be measured again on this version
  // (`preview-check.mjs --write`)
  const numbers = (/** @type {any} */ d) =>
    canonical(
      Object.fromEntries(
        Object.entries(d ?? {}).filter(
          ([k]) => !['version', 'inheritedFrom'].includes(k) && !k.startsWith('preview')
        )
      )
    )
  const own = json(read(path.join(dir, MEASUREMENT_FILE)))
  if (own && numbers(own) !== numbers(previous))
    return fail(`its numbers are not ${from}'s (only the preview rows may be measured again)`)
  if (previous.inheritedFrom !== undefined) {
    const up = inheritanceProofAt(
      previousDir,
      { tag: published.tag, version: from },
      previous.inheritedFrom,
      deps,
      links + 1
    )
    files.push(...up.files)
    if (up.problem) return fail(`${from} inherits from ${previous.inheritedFrom}: ${up.problem}`)
  }
  return { problem: null, files }
}

/**
 * Every file the proof of a measurement file would read, whether or not it holds: the evidence beside it and,
 * along `inheritedFrom`, each link's evidence, locks and measurement. /ops re-checks a release when any of their
 * bytes change, so a removed or edited evidence file never leaves a stored result standing.
 * @param {string} measurementFile
 * @returns {string[]}
 */
export function inheritanceFiles(measurementFile) {
  const out = []
  let dir = path.dirname(measurementFile)
  let file = measurementFile
  for (let links = 0; links <= MAX_LINKS; links++) {
    out.push(path.join(dir, EVIDENCE_FILE))
    // what recomputing this link's evidence reads (manifests, locks, content maps, brand facts, the profile table,
    // the slot contract): an edit to any of them can turn the decision
    if (existsSync(path.join(dir, EVIDENCE_FILE))) out.push(...evidenceMismatches(dir).files)
    let from
    try {
      from = JSON.parse(readFileSync(file, 'utf8')).inheritedFrom
    } catch {
      from = undefined
    }
    if (typeof from !== 'string' || !/^\d+\.\d+\.\d+$/.test(from)) break
    const previousDir = path.join(path.dirname(dir), from)
    out.push(
      path.join(dir, LOCK_FILE),
      path.join(previousDir, LOCK_FILE),
      path.join(dir, MAP_FILE),
      path.join(previousDir, MAP_FILE),
      path.join(previousDir, MEASUREMENT_FILE)
    )
    dir = previousDir
    file = path.join(previousDir, MEASUREMENT_FILE)
  }
  return [...new Set(out)]
}
