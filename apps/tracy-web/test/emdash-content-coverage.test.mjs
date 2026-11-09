/**
 * EmDash content map and content coverage on the Road to live (PR-A). A release's artifacts (content map, content
 * coverage, template kit, demo baseline) are looked up beside the theme's contract data, with no `manifest.json` and
 * with `contractFor` untouched; the two released themes (JA Diner 0.1.0, JA Restaurant 1.0.1) are read from the tree as
 * the image ships them.
 */
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { problemsOfTheme, problemsOfTree } from '../../../scripts/check-emdash-content-map.mjs'
import { fitOfRelease } from '../src/lib/content-coverage/fit.js'
import { COVERAGE_POLICY } from '../src/lib/content-coverage/judge.js'
import { contentCoverageStep, coverageOfRelease } from '../src/lib/content-coverage/road-step.js'
import { rolesOfRelease } from '../src/lib/content-coverage/roles.js'
import { contractFor } from '../src/lib/contracts.js'
import { contractOfRelease, emdashContractDir } from '../src/lib/slot-roles-of-release.js'
import { baselineOfRelease } from '../src/lib/template-kit/demo-baseline-file.js'
import { kitMapOfRelease } from '../src/lib/template-kit/flow-reads.js'
import { kitOfRelease } from '../src/lib/template-kit/road-step.js'
import { fixOf } from '../src/lib/template-readiness/fixes.js'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const RELEASES = [
  ['tracy-diner', '0.1.0', 'tracy-emdash-theme-diner'],
  ['tracy-restaurant', '1.0.1', 'tracy-emdash-theme-restaurant']
]
const emdash = (template, version) => ({
  tag: `${template}/emdash-0.x`,
  platform: 'emdash',
  setting: { template, version }
})
const put = (step, state, code, params) => ({ step, state, code, params })
const road = (release, version) => {
  const contracts = new Map()
  return contentCoverageStep(put, () => undefined, {
    release,
    version,
    contractId: contractOfRelease(release, contracts)?.id ?? null,
    coverage: coverageOfRelease(release, contracts),
    roles: rolesOfRelease(release, contracts),
    fit: fitOfRelease(release, contracts)
  })
}

for (const [template, version, folder] of RELEASES) {
  test(`${template} ${version}: the lookup finds the theme's contract folder, shaped like a profile, with no manifest`, () => {
    const release = emdash(template, version)
    const contract = contractOfRelease(release, new Map())
    assert.equal(contract.dir, path.join(REPO, 'packages/cms', folder, 'contracts', version))
    assert.equal(contract.dir, emdashContractDir(release, version))
    assert.deepEqual([contract.id, contract.platform], [`${template}/emdash-0.x/${version}`, 'emdash'])
    // `contractFor` is what it was: an EmDash release has no profile in the index.
    assert.equal(contractFor(new Map(), release.tag, version), null)
  })

  test(`${template} ${version}: coverage, roles and Slot fit are all read from that folder`, () => {
    const release = emdash(template, version)
    const coverage = coverageOfRelease(release, new Map())
    assert.equal(coverage.state, 'measured', coverage.reason)
    assert.equal(coverage.doc.platform, 'emdash')
    assert.deepEqual(rolesOfRelease(release, new Map()), { state: 'ready' })
    assert.deepEqual(fitOfRelease(release, new Map()), { state: 'ready' })
  })

  test(`${template} ${version}: the Road to live step is a measured verdict, never "not needed"`, () => {
    const step = road(emdash(template, version), version)
    assert.ok(step.params.measuredAt, 'a measurement was read')
    assert.notEqual(step.code, 'coverage-not-needed')
    assert.notEqual(step.code, 'coverage-roles-only')
    assert.ok(['coverage-ready', 'coverage-holes'].includes(step.code), step.code)
    // the crawl audits pages the map does not list, too
    assert.equal(step.params.pages.audited, step.params.pages.inMap + step.params.pages.notInMap)
    assert.ok(step.params.pages.notInMap > 0)
    assert.equal(step.params.fitState, 'ready')
    assert.equal(step.params.rolesState, 'ready')
  })
}

test('JA Diner 0.1.0: nothing is left to fix (every unexplained piece is accounted for)', () => {
  const step = road(emdash('tracy-diner', '0.1.0'), '0.1.0')
  assert.deepEqual(
    [step.state, step.code, step.params.holes, step.params.hygiene],
    ['done', 'coverage-ready', 0, 0]
  )
})

test('JA Restaurant 1.0.1: the dead link the audit found (every demo piece is accounted for) holds the release', () => {
  const step = road(emdash('tracy-restaurant', '1.0.1'), '1.0.1')
  assert.deepEqual([step.state, step.code], ['todo', 'coverage-holes'])
  assert.equal(step.params.holes, 0)
  assert.match(String(step.params.incomplete), /dead-link/)
})

test('the other readers take the same lookup: a template kit, a demo baseline and the kit map are not "no contract"', () => {
  const release = emdash('tracy-diner', '0.1.0')
  // None is committed for an EmDash theme yet; what matters is that the answer comes from the folder, not from a profile.
  assert.equal(kitOfRelease(release, new Map()).state, 'none')
  assert.equal(baselineOfRelease(release, new Map()).state, 'none')
  assert.equal(kitMapOfRelease(release, new Map()) !== null, true)
  assert.equal(kitMapOfRelease(emdash('tracy-nothing', '9.9.9'), new Map()), null)
})

test('a Joomla release is looked up as before, and an EmDash release without a theme folder has no contract', () => {
  assert.equal(
    contractOfRelease(
      { tag: 'quickstart/none/j6', platform: 'joomla', setting: { version: '1.0.0' } },
      new Map()
    ),
    null
  )
  assert.equal(contractOfRelease(emdash('tracy-nothing', '9.9.9'), new Map()), null)
})

test('the policy measures EmDash for holes, page problems, Slot fit and label rules, and the new code has a fix entry', () => {
  assert.ok(COVERAGE_POLICY.platforms.includes('emdash'))
  assert.ok(COVERAGE_POLICY.fitPlatforms.includes('emdash'))
  assert.ok(COVERAGE_POLICY.rolesPlatforms.includes('emdash'))
  assert.deepEqual(fixOf('coverage-roles-only', {}), fixOf('coverage-not-needed', {}))
})

test('the content map gate: current for both themes, red when the map is missing, stale, or the coverage names another map', () => {
  assert.deepEqual(problemsOfTree(REPO), [])
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-map-'))
  try {
    const theme = path.join(root, 'tracy-emdash-theme-diner')
    cpSync(path.join(REPO, 'packages/cms/tracy-emdash-theme-diner'), theme, {
      recursive: true,
      filter: (src) => !/node_modules|\.astro|dist$/.test(src)
    })
    assert.deepEqual(problemsOfTheme(theme), [])
    const map = path.join(theme, 'contracts/0.1.0/content-map.json')
    // a fit measured again is not drift from the theme's files, but the coverage file measured the other bytes ...
    const refit = JSON.parse(cpRead(map))
    refit.slots.find((s) => s.fit?.measured).fit.maxChars = { desktop: 1 }
    writeFileSync(map, `${JSON.stringify(refit, null, 2)}\n`)
    assert.match(problemsOfTheme(theme).join('\n'), /measured another content map/)
    assert.doesNotMatch(problemsOfTheme(theme).join('\n'), /not what the theme's seed/)
    // ... but a slot that no longer says what the theme says is
    const doc = JSON.parse(cpRead(map))
    doc.slots[0].sample = 'edited by hand'
    writeFileSync(map, `${JSON.stringify(doc, null, 2)}\n`)
    assert.match(
      problemsOfTheme(theme).join('\n'),
      /not what the theme's seed, field map and content API map generate/
    )
    rmSync(map)
    assert.match(problemsOfTheme(theme).join('\n'), /content-map\.json is missing/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

import { readFileSync } from 'node:fs'

const cpRead = (file) => readFileSync(file, 'utf8')
