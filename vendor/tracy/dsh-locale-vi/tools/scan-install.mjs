/**
 * Report which DSH client bundles this language pack covers, compared with what
 * is actually installed on this machine, and write the resolved bundle paths for
 * the other tools to read.
 *
 * `baseline/mounted.json` records the packages the translations cover and the
 * ones deliberately left out, so an app update surfaces as a diff rather than a
 * silent gap: a newly installed bundle that is neither covered nor excluded is a
 * decision waiting to be made.
 *
 * Usage: node tools/scan-install.mjs [--profile <name>] [--install <dir>]
 *
 * Writes tools/bundles.json. Exits non-zero when the covered set no longer
 * matches the install.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discover, profileName } from './lib/discover.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const selfName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

const baselinePath = join(root, 'baseline', 'mounted.json')
if (!existsSync(baselinePath)) {
  console.error(`missing ${baselinePath} — run: node tools/accept-baseline.mjs --init`)
  process.exit(2)
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const covered = baseline.covered ?? {}
const excluded = baseline.excluded ?? {}

const found = discover({ exclude: selfName })

const disappeared = []
const upgraded = []
const resolved = []
const appeared = []

for (const name of Object.keys(covered).sort()) {
  const entry = found.get(name)
  if (entry === undefined) { disappeared.push(name); continue }
  resolved.push(entry)
  if (entry.version !== covered[name]) upgraded.push(`${name}: ${covered[name]} → ${entry.version}`)
}
for (const [name, entry] of [...found].sort(([a], [b]) => (a < b ? -1 : 1))) {
  if (name in covered || name in excluded) continue
  appeared.push(`${name}@${entry.version} (${entry.source})`)
}

writeFileSync(
  join(root, 'tools', 'bundles.json'),
  `${JSON.stringify(resolved.map((entry) => entry.bundle), null, 2)}\n`,
  'utf8',
)

console.log(`profile ${profileName()} — ${resolved.length}/${Object.keys(covered).length} covered bundles resolved`)
console.log(`baseline install: ${baseline.capturedFrom?.package ?? '?'} ${baseline.capturedFrom?.version ?? '?'}`)

if (upgraded.length > 0) {
  console.log(`\nversion changed (${upgraded.length}) — their copy may have moved; run npm run audit:`)
  for (const line of upgraded) console.log(`  ${line}`)
}
if (appeared.length > 0) {
  console.log(`\nNEW BUNDLE owning namespaces (${appeared.length}) — cover it, or record why not in baseline/mounted.json:`)
  for (const line of appeared) console.log(`  ${line}`)
}
if (disappeared.length > 0) {
  console.log(`\nCOVERED BUNDLE no longer installed (${disappeared.length}):`)
  for (const line of disappeared) console.log(`  ${line}`)
}
if (Object.keys(excluded).length > 0) {
  console.log(`\ndeliberately excluded (${Object.keys(excluded).length}):`)
  for (const [name, why] of Object.entries(excluded)) console.log(`  ${name}: ${why}`)
}

console.log(`\nwrote tools/bundles.json (${resolved.length} paths)`)
process.exitCode = appeared.length > 0 || disappeared.length > 0 ? 1 : 0
