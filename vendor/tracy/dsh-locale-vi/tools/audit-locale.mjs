/**
 * Audit the Vietnamese pack against the DSH install on this machine, and report
 * what an app update changed.
 *
 * Three questions, answered in one pass:
 *
 * 1. Coverage — does every key the UI asks for have a Vietnamese string, and
 *    does the pack carry keys the UI no longer asks for?
 * 2. Drift — did upstream reword a string we already translated? The old
 *    translation still renders, so nothing looks broken; only the fingerprint
 *    baseline reveals it.
 * 3. Integrity — do placeholders, newline counts and untranslated leftovers
 *    still hold?
 *
 * Exit codes: 0 clean, 1 action needed, 2 the workflow itself is not set up.
 *
 * Usage: node tools/audit-locale.mjs [--json] [--profile <name>] [--install <dir>]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractEnglish } from './lib/extract-en.mjs'
import { fingerprint, digest } from './lib/fingerprint.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const asJson = process.argv.includes('--json')

/** Extract the `{name}` placeholders a template expects, sorted for comparison. */
function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

/** Count the newlines a string carries, which layout depends on. */
function newlines(text) {
  return (text.match(/\n/g) ?? []).length
}

const bundlesPath = join(root, 'tools', 'bundles.json')
if (!existsSync(bundlesPath)) {
  console.error('missing tools/bundles.json — run: node tools/scan-install.mjs')
  process.exit(2)
}
const bundles = JSON.parse(readFileSync(bundlesPath, 'utf8'))
const missingBundles = bundles.filter((path) => !existsSync(path))
if (missingBundles.length > 0) {
  console.error(`${missingBundles.length} bundle path(s) from tools/bundles.json no longer exist — re-run: node tools/scan-install.mjs`)
  for (const path of missingBundles) console.error(`  ${path}`)
  process.exit(2)
}

const baselinePath = join(root, 'baseline', 'fingerprints.json')
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : undefined
if (baseline === undefined) {
  console.error(`missing ${baselinePath} — run: node tools/accept-baseline.mjs --init`)
  process.exit(2)
}

const { dicts: english, owners, warnings } = extractEnglish(bundles, 'en')
const current = fingerprint(english)

const localesDir = join(root, 'locales')
const translated = {}
for (const file of readdirSync(localesDir)) {
  if (!file.endsWith('.json')) continue
  translated[basename(file, '.json')] = JSON.parse(readFileSync(join(localesDir, file), 'utf8'))
}

const allowIdenticalPath = join(root, 'tools', 'identical-allowed.json')
const allowIdentical = new Set(existsSync(allowIdenticalPath)
  ? JSON.parse(readFileSync(allowIdenticalPath, 'utf8'))
  : [])

/** Findings, each one an actionable row: what to do, where, and why. */
const findings = { newKeys: [], removedKeys: [], reworded: [], newNamespaces: [], goneNamespaces: [], drift: [], newlineDrift: [], untranslated: [] }

const baselineFingerprints = baseline.namespaces ?? {}

for (const ns of Object.keys(current).sort()) {
  const enDict = english[ns]
  const viDict = translated[ns]
  const wasKnown = ns in baselineFingerprints

  if (!wasKnown) {
    findings.newNamespaces.push({ namespace: ns, owner: owners[ns] ?? '?', keys: Object.keys(enDict).length })
    continue
  }
  if (viDict === undefined) {
    findings.newNamespaces.push({ namespace: ns, owner: owners[ns] ?? '?', keys: Object.keys(enDict).length, note: 'known upstream but not translated' })
    continue
  }

  const previous = baselineFingerprints[ns]
  for (const key of Object.keys(enDict)) {
    if (!(key in viDict)) {
      findings.newKeys.push({ namespace: ns, key, english: enDict[key], owner: owners[ns] ?? '?' })
      continue
    }
    // Reworded: upstream changed the English behind a key we already translated.
    // The stale Vietnamese keeps rendering, so only the baseline catches it.
    if (key in previous && previous[key] !== current[ns][key]) {
      findings.reworded.push({ namespace: ns, key, english: enDict[key], vietnamese: viDict[key] })
    }
  }
  for (const key of Object.keys(viDict)) {
    if (!(key in enDict)) findings.removedKeys.push({ namespace: ns, key, vietnamese: viDict[key] })
  }

  for (const [key, value] of Object.entries(viDict)) {
    if (!(key in enDict)) continue
    const expected = placeholders(enDict[key]).join(',')
    const actual = placeholders(value).join(',')
    if (expected !== actual) findings.drift.push({ namespace: ns, key, expected, actual })
    if (newlines(enDict[key]) !== newlines(value)) {
      findings.newlineDrift.push({ namespace: ns, key, expected: newlines(enDict[key]), actual: newlines(value) })
    }
    if (value === enDict[key] && !allowIdentical.has(`${ns}/${key}`)) {
      findings.untranslated.push({ namespace: ns, key, english: enDict[key] })
    }
  }
}

for (const ns of Object.keys(baselineFingerprints).sort()) {
  if (ns in current) continue
  findings.goneNamespaces.push({ namespace: ns, translatedKeys: Object.keys(translated[ns] ?? {}).length })
}

const actionable =
  findings.newKeys.length + findings.removedKeys.length + findings.reworded.length +
  findings.newNamespaces.length + findings.goneNamespaces.length +
  findings.drift.length + findings.newlineDrift.length + findings.untranslated.length

const summary = {
  install: baseline.capturedFrom ?? null,
  bundles: bundles.length,
  namespaces: Object.keys(current).length,
  englishKeys: Object.values(english).reduce((sum, dict) => sum + Object.keys(dict).length, 0),
  translatedKeys: Object.values(translated).reduce((sum, dict) => sum + Object.keys(dict).length, 0),
  actionable,
}

if (asJson) {
  console.log(JSON.stringify({ summary, findings, warnings }, null, 2))
  process.exitCode = actionable > 0 ? 1 : 0
} else {
  console.log(`bundles ${summary.bundles} · namespaces ${summary.namespaces} · English keys ${summary.englishKeys} · translated ${summary.translatedKeys}`)
  console.log(`baseline: ${baseline.capturedFrom?.package ?? '?'} ${baseline.capturedFrom?.version ?? '?'} (captured ${baseline.capturedAt ?? '?'})`)

  /** Print one finding group with a heading and a per-row formatter. */
  const section = (rows, heading, format) => {
    if (rows.length === 0) return
    console.log(`\n${heading} (${rows.length})`)
    for (const row of rows.slice(0, 40)) console.log(`  ${format(row)}`)
    if (rows.length > 40) console.log(`  … and ${rows.length - 40} more — use --json for the full list`)
  }

  section(findings.newNamespaces, 'NEW NAMESPACE — no Vietnamese dictionary exists yet',
    (r) => `${r.namespace} — ${r.keys} keys, from ${r.owner}${r.note === undefined ? '' : ` (${r.note})`}`)
  section(findings.goneNamespaces, 'NAMESPACE GONE — the owning bundle no longer registers it',
    (r) => `${r.namespace} — ${r.translatedKeys} translated keys now unused`)
  section(findings.newKeys, 'NEW KEY — translate it',
    (r) => `${r.namespace}/${r.key} — "${r.english}"`)
  section(findings.reworded, 'REWORDED UPSTREAM — re-read the call site, the old translation may now be wrong',
    (r) => `${r.namespace}/${r.key}\n      en now: "${r.english}"\n      vi has: "${r.vietnamese}"`)
  section(findings.removedKeys, 'REMOVED UPSTREAM — delete the Vietnamese entry',
    (r) => `${r.namespace}/${r.key} — "${r.vietnamese}"`)
  section(findings.drift, 'PLACEHOLDER MISMATCH — the string will render a literal brace',
    (r) => `${r.namespace}/${r.key} — expected {${r.expected}} got {${r.actual}}`)
  section(findings.newlineDrift, 'NEWLINE COUNT MISMATCH — layout will differ from the original',
    (r) => `${r.namespace}/${r.key} — expected ${r.expected} got ${r.actual}`)
  section(findings.untranslated, 'STILL ENGLISH — translate, or whitelist in tools/identical-allowed.json',
    (r) => `${r.namespace}/${r.key} — "${r.english}"`)

  if (warnings.length > 0) {
    console.log(`\nextraction warnings (${warnings.length}) — a namespace may be under-reported:`)
    for (const line of warnings) console.log(`  ${line}`)
  }

  console.log(actionable === 0
    ? '\nup to date with this install — nothing to do'
    : `\n${actionable} item(s) need attention. After translating, run: npm run build && node tools/accept-baseline.mjs`)
  process.exitCode = actionable > 0 ? 1 : 0
}

mkdirSync(join(root, 'baseline'), { recursive: true })
writeFileSync(join(root, 'baseline', 'last-audit.json'), `${JSON.stringify({ summary, findings, warnings }, null, 2)}\n`, 'utf8')
