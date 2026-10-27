/**
 * Record the current install as the baseline the audit compares against.
 *
 * Two files are written, both committed:
 *
 * - `baseline/mounted.json` — which packages own the namespaces this pack
 *   covers, their versions, and which packages are deliberately excluded.
 * - `baseline/fingerprints.json` — a salt-free digest per English key. This is
 *   what makes a *reworded* string detectable: the key still exists and the
 *   Vietnamese still renders, so only a changed digest reveals that the original
 *   text moved underneath it.
 *
 * Fingerprints, not the strings themselves, so the repository does not
 * redistribute upstream's copy.
 *
 * Usage:
 *   node tools/accept-baseline.mjs --init   # first capture, or after adopting a new bundle
 *   node tools/accept-baseline.mjs          # re-capture after finishing a round of translation
 *
 * Without --init the audit must be clean: accepting a baseline while findings
 * are open would bury exactly the work the baseline is meant to surface.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discover, installIdentity, profileName } from './lib/discover.mjs'
import { extractEnglish } from './lib/extract-en.mjs'
import { fingerprint } from './lib/fingerprint.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const init = process.argv.includes('--init')
const selfName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

const baselineDir = join(root, 'baseline')
mkdirSync(baselineDir, { recursive: true })
const mountedPath = join(baselineDir, 'mounted.json')
const fingerprintPath = join(baselineDir, 'fingerprints.json')

const previous = existsSync(mountedPath) ? JSON.parse(readFileSync(mountedPath, 'utf8')) : {}
const excluded = previous.excluded ?? {}

const found = discover({ exclude: selfName })
if (found.size === 0) {
  console.error('no client bundles registering locales were found — is DSH installed on this machine?')
  console.error('pass --install <app.asar.unpacked dir> if it lives somewhere unusual')
  process.exit(2)
}

/**
 * Namespaces the pack already translates, which decide what "covered" means: on
 * a re-capture the covered set is the packages owning those namespaces, so an
 * untranslated new bundle does not silently enter the baseline.
 */
const translatedNamespaces = new Set(
  readdirSync(join(root, 'locales'))
    .filter((file) => file.endsWith('.json'))
    .map((file) => basename(file, '.json')),
)

const candidates = [...found.values()].filter((entry) => !(entry.package in excluded))
const { owners, warnings } = extractEnglish(candidates.map((entry) => entry.bundle), 'en')

/** Map a bundle label back to its package entry, to name the owner precisely. */
const byLabel = new Map(candidates.map((entry) => [basename(dirname(dirname(entry.bundle))), entry]))

const coveredPackages = new Map()
const uncovered = []
for (const [ns, label] of Object.entries(owners)) {
  const entry = byLabel.get(label)
  if (entry === undefined) continue
  if (translatedNamespaces.has(ns) || init) coveredPackages.set(entry.package, entry.version)
  else uncovered.push(`${ns} (${entry.package})`)
}

if (!init && uncovered.length > 0) {
  console.error(`refusing to accept: ${uncovered.length} namespace(s) are installed but untranslated:`)
  for (const line of uncovered) console.error(`  ${line}`)
  console.error('\nTranslate them, or record the package under "excluded" in baseline/mounted.json,')
  console.error('or pass --init to adopt the install as-is.')
  process.exit(1)
}

const identity = installIdentity()
const mounted = {
  capturedAt: new Date().toISOString().slice(0, 10),
  capturedFrom: { package: identity.package, version: identity.version },
  profile: profileName(),
  covered: Object.fromEntries([...coveredPackages].sort(([a], [b]) => (a < b ? -1 : 1))),
  excluded,
}
writeFileSync(mountedPath, `${JSON.stringify(mounted, null, 2)}\n`, 'utf8')

const coveredBundles = candidates
  .filter((entry) => coveredPackages.has(entry.package))
  .map((entry) => entry.bundle)
const { dicts: coveredDicts } = extractEnglish(coveredBundles, 'en')

const fingerprints = {
  capturedAt: mounted.capturedAt,
  capturedFrom: mounted.capturedFrom,
  namespaces: fingerprint(coveredDicts),
}
writeFileSync(fingerprintPath, `${JSON.stringify(fingerprints, null, 2)}\n`, 'utf8')

writeFileSync(
  join(root, 'tools', 'bundles.json'),
  `${JSON.stringify(coveredBundles, null, 2)}\n`,
  'utf8',
)

const keyCount = Object.values(coveredDicts).reduce((sum, dict) => sum + Object.keys(dict).length, 0)
console.log(`baseline captured from ${identity.package ?? '?'} ${identity.version ?? '?'} (profile ${mounted.profile})`)
console.log(`  packages: ${coveredPackages.size}`)
console.log(`  namespaces: ${Object.keys(coveredDicts).length}`)
console.log(`  fingerprinted keys: ${keyCount}`)
if (Object.keys(excluded).length > 0) console.log(`  excluded: ${Object.keys(excluded).join(', ')}`)
if (warnings.length > 0) {
  console.log(`\nextraction warnings (${warnings.length}):`)
  for (const line of warnings) console.log(`  ${line}`)
}
console.log('\nwrote baseline/mounted.json, baseline/fingerprints.json, tools/bundles.json')
console.log('commit these: they are how the next app update becomes a reviewable diff')
