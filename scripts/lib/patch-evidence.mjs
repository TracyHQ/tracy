/**
 * Hold a WordPress dossier's `patch-evidence.json` (written by
 * `packages/cms/tracy-wordpress-quickstart/scripts/patch-artifacts.mjs`) against what is committed beside it, offline:
 * no release archive is fetched, the recorded hashes are compared with the committed files.
 *
 *   - the archives it compared are the parts `manifest.json` seals;
 *   - the lock and content map it cut are the committed bytes;
 *   - the profile row it carried is the row in template-profiles.json (words aside), the brand facts it carried
 *     it on are the committed `brand-facts.json` of both versions, equal, and every field the facts do not measure
 *     was carried only on its own proof (`carryProblem`: the theme or the footer slot unchanged);
 *   - a design-system measurement carrying `inheritedFrom` is allowed only when the committed files prove it, link
 *     by link (`inheritanceProofAt`, the very reading /ops makes), and evidence that says `inherited` has one.
 * And every `brand-facts.json`, evidence or not, is the measurement of its own version: its tag, version and the
 * theme files it measured are the dossier's (`brandFactsProblem`), so a copy from another version is refused.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  EVIDENCE_FILE,
  evidenceMismatches,
  inheritanceProofAt,
  themeOf
} from '../../apps/tracy-web/src/lib/template-design-system-readiness/readers/measurement-inheritance.js'
import {
  brandFactDifferences,
  brandFactsProblem
} from '../../packages/design/tracy-ds-slot/src/brand-facts.mjs'
import { inheritanceProblem } from '../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { carryProblem } from '../../packages/cms/tracy-wordpress-quickstart/scripts/patch-artifacts.mjs'

const readJson = (/** @type {string} */ f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null)

/**
 * Every way the evidence (or an inherited measurement) of one dossier disagrees with the tree; empty is clean.
 * @param {string} dir the dossier directory (`…/contracts/<slug>/wp7/<version>`)
 * @param {string} at its id (`<slug>/wp7/<version>`)
 * @param {{ releases?: Record<string, Record<string, any>> }} profiles template-profiles.json, parsed
 * @returns {string[]}
 */
export function patchEvidenceProblems(dir, at, profiles) {
  const out = []
  const evidence = readJson(path.join(dir, EVIDENCE_FILE))
  const measurement = readJson(path.join(dir, 'design-system-measurement.json'))
  const inherited = measurement?.inheritedFrom !== undefined
  const manifest = readJson(path.join(dir, 'manifest.json'))
  const q = manifest?.quickstart ?? {}
  const lockOf = (/** @type {string} */ d) => readJson(path.join(d, 'presentation-lock.json'))
  const factsFile = path.join(dir, 'brand-facts.json')
  if (existsSync(factsFile)) {
    const why = brandFactsProblem(readJson(factsFile), {
      tag: q.release,
      version: q.version,
      lock: lockOf(dir)
    })
    if (why) out.push(why)
  }
  if (inherited) {
    const proof = inheritanceProofAt(dir, { tag: q.release, version: q.version }, measurement.inheritedFrom, {
      selfProblem: inheritanceProblem,
      profiles
    })
    if (proof.problem)
      out.push(`design-system-measurement.json inherits from ${measurement.inheritedFrom}: ${proof.problem}`)
  }
  if (!evidence) return out
  const previousDir = path.join(
    path.dirname(dir),
    String(evidence.previous ?? '')
      .split('/')
      .pop() ?? ''
  )
  const row = profiles.releases?.[q.release]?.[q.version]
  const facts = readJson(path.join(dir, 'brand-facts.json'))
  const previousFacts = readJson(path.join(previousDir, 'brand-facts.json'))
  const lock = lockOf(dir)
  const previousLock = lockOf(previousDir)
  // 🔒 the evidence as the committed files make it, by the one function /ops decides with
  out.push(...evidenceMismatches(dir, { profiles }).problems)
  if (!row) out.push(`template-profiles.json has no ${q.release} ${q.version} row`)
  if (!facts || !previousFacts) out.push(`brand-facts.json of ${facts ? evidence.previous : at} is missing`)
  else {
    for (const d of brandFactDifferences(previousFacts, facts))
      out.push(`brand facts differ, the row was carried: ${d}`)
    const why = brandFactsProblem(previousFacts, {
      tag: q.release,
      version: path.basename(previousDir),
      lock: previousLock
    })
    if (why) out.push(`${evidence.previous}: ${why}`)
  }
  if (row) {
    // the fields the facts do not measure, each held to its own proof on the committed files
    const themeSame = themeOf(lock) === themeOf(previousLock)
    for (const [field, value] of Object.entries(row)) {
      const why = carryProblem(field, value, {
        themeSame,
        contentMapBefore: readJson(path.join(previousDir, 'content-map.json')),
        contentMapAfter: readJson(path.join(dir, 'content-map.json'))
      })
      if (why) out.push(`template-profiles.json ${q.release} ${q.version} was carried with ${why}`)
    }
  }
  return out
}
