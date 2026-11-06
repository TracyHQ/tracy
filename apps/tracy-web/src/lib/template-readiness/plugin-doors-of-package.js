/**
 * What one Claude Cowork for Joomla release package holds of the write step's doors (ticket #434), read from its own
 * bytes: the package `pkg_claudecowork-<version>.zip` carries the component `packages/com_claudecowork.zip`, whose
 * library (`administrator/lib/**.php`) is the engine that answers every door. Each piece of evidence a door declares
 * (`src/write-step/plugin-doors.js`) is looked for there as plain text, never by pattern.
 *
 * A package that cannot be read throws (`CorruptArchive`, or an Error naming what is missing): an unreadable package
 * says nothing about its doors, so it is never read as one without them.
 */
import { CorruptArchive, readZipStrict } from '../cowork-contract-evidence.js'

const COMPONENT = 'packages/com_claudecowork.zip'
const LIBRARY = 'administrator/lib/'
/** The most the component zip may inflate to (the full packages up to 0.24.53 carried every contract inside it). */
const MAX_COMPONENT_BYTES = 128 * 1024 * 1024
/** The most one library file may inflate to (Engine.php was 364 KB at 0.24.85). */
const MAX_SOURCE_BYTES = 16 * 1024 * 1024

/**
 * @param {Buffer} bytes a Joomla package of the plugin
 * @param {readonly string[]} evidences the texts to look for
 * @returns {{ version: string | null, evidence: Record<string, boolean> }}
 */
export function evidenceOfPackage(bytes, evidences) {
  const outer = readZipStrict(bytes)
  const xml = outer.get('pkg_claudecowork.xml')
  const m = xml ? /<version>\s*([^<\s]+)\s*<\/version>/.exec(xml.read().toString('utf8')) : null
  const component = outer.get(COMPONENT)
  if (!component) throw new CorruptArchive(`the package holds no ${COMPONENT}`)
  const inner = readZipStrict(component.read(MAX_COMPONENT_BYTES))
  const sources = [...inner]
    .filter(([name]) => name.startsWith(LIBRARY) && name.endsWith('.php'))
    .map(([, entry]) => entry.read(MAX_SOURCE_BYTES).toString('utf8'))
  if (sources.length === 0) throw new CorruptArchive(`${COMPONENT} holds no PHP under ${LIBRARY}`)
  /** @type {Record<string, boolean>} */
  const evidence = {}
  for (const text of evidences) evidence[text] = sources.some((s) => s.includes(text))
  return { version: m ? m[1] : null, evidence }
}
