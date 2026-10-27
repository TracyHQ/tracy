#!/usr/bin/env node
/**
 * REG-PR-1241: the 29 Published Joomla quickstarts cut by PR #1241 (and JA Resort 1.0.4, #1248) keep what made them pass the Template
 * Customization Question Readiness check, read off the tree:
 *   S1 every contract captured for Claude Cowork 0.24.21 has a template-profiles.json row for its version and a
 *      copy file naming its demo company (ABOUT-3, REL-3, FAV-1, LOGO-*),
 *   S2 the Tracy Base and Tracy Business template patches write no interface word outside a translation in their T4
 *      header blocks and elements (LANG-2 reads T4 blocks since 12/10/2026),
 *   S3 every demo-trim, multilingual and editions map of those contracts is pinned (baseHash) to the bytes of its own
 *      manifest, content map and presentation lock: the Claude Cowork plugin refuses any other,
 *   S4 both quickstarts.json pin Claude Cowork for Joomla 0.24.21 or later and record every new version they serve.
 * Exit 1 with the broken steps; prints one line per step.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hardCodedWords } from '../../../apps/tracy-web/src/lib/template-customization-question-readiness/readers/hard-coded-words.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const PATCHES = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/template-patches')
/** The plugin releases that carry these contracts: 0.24.21 the 29 of #1241, 0.24.22 JA Resort 1.0.4 (#1248). */
const COWORK = ['0.24.21', '0.24.22']
/** Whether version a is b or later. */
const atLeast = (a, b) => {
  const [x, y] = [String(a).split('.').map(Number), b.split('.').map(Number)]
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i]
  return true
}
const problems = { S1: [], S2: [], S3: [], S4: [] }
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

const profiles = json(path.join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'))
const fresh = []
for (const slug of readdirSync(CONTRACTS)) {
  const j6 = path.join(CONTRACTS, slug, 'j6')
  if (!existsSync(j6)) continue
  for (const version of readdirSync(j6)) {
    const dir = path.join(j6, version)
    if (!existsSync(path.join(dir, 'manifest.json'))) continue
    if (!COWORK.includes(json(path.join(dir, 'manifest.json')).coworkContractVersion)) continue
    const tag = slug.startsWith('tracy-') ? `${slug}/j6` : `quickstart/${slug}/j6`
    fresh.push({ slug, version, tag, dir })
    if (!profiles.releases?.[tag]?.[version])
      problems.S1.push(`${tag} ${version}: no template-profiles.json row`)
    const copy = path.join(j6, `${version}.copy.json`)
    if (!existsSync(copy) || !(json(copy).demoCompanyNames ?? []).length)
      problems.S1.push(`${slug}/j6/${version}: no demoCompanyNames`)
    const base = ['manifest.json', 'content-map.json', 'presentation-lock.json']
      .map((f) => `${f}:${sha(path.join(dir, f))}\n`)
      .join('')
    const want = createHash('sha256').update(base).digest('hex')
    for (const map of ['demo-trim-map.json', 'multilingual-map.json', 'editions.json']) {
      const file = path.join(dir, map)
      if (existsSync(file) && json(file).baseHash !== want)
        problems.S3.push(`${slug}/j6/${version}/${map}: baseHash is not its contract's`)
    }
  }
}
if (fresh.length !== 30)
  problems.S1.push(`${fresh.length} contracts captured for ${COWORK.join(' or ')}, expected 30`)

for (const tree of ['tracy-base', 'tracy_business'])
  for (const dir of ['html/layouts/t4/block', 'html/layouts/t4/element']) {
    const full = path.join(PATCHES, tree, dir)
    if (!existsSync(full)) continue
    for (const name of readdirSync(full))
      for (const w of hardCodedWords(`${dir}/${name}`, readFileSync(path.join(full, name), 'utf8')))
        problems.S2.push(`${tree}/${dir}/${name}:${w.line} '${w.text.slice(0, 30)}'`)
  }

for (const file of [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]) {
  const text = readFileSync(path.join(ROOT, file), 'utf8')
  if (/pkg_claudecowork-0\.24\.20\.zip/.test(text)) problems.S4.push(`${file}: a 0.24.20 Joomla pin is left`)
  const q = JSON.parse(text)
  for (const { tag, version } of fresh) {
    const entry = q[tag]
    const cowork = entry?.cowork
    if (!cowork) continue
    const serves = entry.version === version || (cowork.contractVersions ?? []).includes(version)
    if (!atLeast(cowork.version, COWORK[0]) || !serves)
      problems.S4.push(`${file}: ${tag} does not pin ${COWORK[0]} or later for ${version}`)
  }
}

let failed = false
for (const [step, list] of Object.entries(problems)) {
  console.log(`${step}: ${list.length ? `FAIL ${list.length}: ${list.slice(0, 5).join('; ')}` : 'ok'}`)
  if (list.length) failed = true
}
process.exit(failed ? 1 : 0)
