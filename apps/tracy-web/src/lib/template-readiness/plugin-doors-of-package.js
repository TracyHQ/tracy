/**
 * What one Claude Cowork for Joomla release package holds of the write step's doors (ticket #434), read from its own
 * bytes: the package `pkg_claudecowork-<version>.zip` carries the component `packages/com_claudecowork.zip`, whose
 * library (`administrator/lib/**.php`) is the engine that answers every door. Each piece of evidence a door declares
 * (`src/write-step/plugin-doors.js`) is looked for there as plain text, never by pattern.
 *
 * Beside the doors, the receiver data that is per contract rather than per door: `administrator/lib/hideable-slots.json`,
 * the review that says which slots of a contract the plugin may empty (TracyHQ/tracy#362), kept as `reviews`, the content map
 * sha256 each contract's entry was read against. A package with no such file has no review: `{}`. Without a review for its
 * contract a site empties nothing the plan hides (JA Diner 1.0.8 on 0.24.95, dev 16/11/2026: eighteen hides refused).
 *
 * A package that cannot be read throws (`CorruptArchive`, or an Error naming what is missing): an unreadable package
 * says nothing about its doors, so it is never read as one without them.
 */
import { CorruptArchive, MAX_ARTIFACT_BYTES, readZipStrict } from '../cowork-contract-evidence.js'

const COMPONENT = 'packages/com_claudecowork.zip'
const LIBRARY = 'administrator/lib/'
const REVIEWS = 'administrator/lib/hideable-slots.json'
/** The most one library file may inflate to (Engine.php was 364 KB at 0.24.85). */
const MAX_SOURCE_BYTES = 16 * 1024 * 1024

/**
 * @param {Buffer} bytes a Joomla package of the plugin
 * @param {readonly string[]} evidences the texts to look for
 * @returns {{ version: string | null, evidence: Record<string, boolean>, reviews: Record<string, string> }} `reviews`: the
 *   content map sha256 of each contract the package's hide review covers
 */
export function evidenceOfPackage(bytes, evidences) {
  const outer = readZipStrict(bytes)
  const xml = outer.get('pkg_claudecowork.xml')
  const m = xml ? /<version>\s*([^<\s]+)\s*<\/version>/.exec(xml.read().toString('utf8')) : null
  const component = outer.get(COMPONENT)
  if (!component) throw new CorruptArchive(`the package holds no ${COMPONENT}`)
  const inner = readZipStrict(component.read(MAX_ARTIFACT_BYTES))
  const sources = [...inner]
    .filter(([name]) => name.startsWith(LIBRARY) && name.endsWith('.php'))
    .map(([, entry]) => entry.read(MAX_SOURCE_BYTES).toString('utf8'))
  if (sources.length === 0) throw new CorruptArchive(`${COMPONENT} holds no PHP under ${LIBRARY}`)
  /** @type {Record<string, boolean>} */
  const evidence = {}
  for (const text of evidences) evidence[text] = sources.some((s) => s.includes(text))
  return { version: m ? m[1] : null, evidence, reviews: reviewsOf(inner.get(REVIEWS)) }
}

/** The contracts a hide review covers, each with the content map sha256 it was read against; none without the file. */
function reviewsOf(entry) {
  if (!entry) return {}
  let doc
  try {
    doc = JSON.parse(entry.read(MAX_SOURCE_BYTES).toString('utf8'))
  } catch {
    throw new CorruptArchive(`${COMPONENT} holds a ${REVIEWS} that does not parse`)
  }
  /** @type {Record<string, string>} */
  const out = {}
  for (const [id, row] of Object.entries(doc?.contracts ?? {}))
    if (typeof row?.contentMapSha256 === 'string' && /^[a-f0-9]{64}$/.test(row.contentMapSha256))
      out[id] = row.contentMapSha256
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)))
}
