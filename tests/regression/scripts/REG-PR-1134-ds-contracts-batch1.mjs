#!/usr/bin/env node
// REG-PR-1134-ds-contracts-batch1: the batch-1 slot contracts (ten offered, the rest saying why not),
// the mechanisms they rely on, and the release data a re-release needs. No Docker, no network.
//   node tests/regression/scripts/REG-PR-1134-ds-contracts-batch1.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SLOT = join(ROOT, 'packages/design/tracy-ds-slot')
const EV = 'tasks/evidence/ds-contracts-batch1-2026-10-11'
// The public export leaves out `tasks/` (this case's evidence): exit 3, as lib.mjs `cannotRun`.
if (!existsSync(join(ROOT, 'tasks'))) {
  process.stdout.write('CANNOT RUN: this case reads tasks/, which is internal and not in this tree\n')
  process.exit(3)
}
const { loadContract, loadProfile, contractBase } = await import(join(SLOT, 'src/library.mjs'))
const { joomlaSlot } = await import(join(SLOT, 'src/joomla.mjs'))
const { contractFor, templateKeyOf } = await import(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js'))
const profiles = JSON.parse(
  readFileSync(join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8')
).releases
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const results = []
const step = (name, fn) => {
  try {
    fn()
    results.push(`PASS ${name}`)
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message}`)
  }
}

// S1: who is offered, from which release, and why the others are not
const READY = {
  'ja-rent': '1.0.2',
  'ja-directory': '1.0.1',
  'ja-resume': '1.0.1',
  'ja-sensei': '1.0.1',
  'ja-prodex': '1.0.1',
  'ja-seven': '1.0.1',
  'ja-tour': '1.0.1',
  'ja-impact': '1.0.1',
  'ja-podcast': '1.0.2'
}
const BUILT = ['ja-rent', 'ja-directory', 'ja-resume', 'ja-sensei', 'ja-prodex', 'ja-seven', 'ja-tour']
step('S1 ready Joomla contracts name their release and pass evidence', () => {
  for (const [slug, v] of Object.entries(READY)) {
    const c = loadContract(`joomla-${slug}`)
    assert.equal(c.ready, true, slug)
    assert.deepEqual(c.minVersion, { [`quickstart/${slug}/j6`]: v }, slug)
    assert.match(c.readyNote, new RegExp(`${EV}/${slug}-j6`), slug)
    const fin = JSON.parse(readFileSync(join(ROOT, EV, `${slug}-j6/final.json`), 'utf8'))
    const [ok, all] = fin.flow.pass.split('/')
    assert.equal(ok, all, `${slug} verdicts ${fin.flow.pass}`)
    assert.ok(all >= 16, `${slug}: six systems × 2 viewports + controls`)
    assert.deepEqual(fin.flow.controls, [0, 0, 0, 0], slug)
    assert.deepEqual(fin.flow.low, [], slug)
    // Every probe kind of the batch-1 measure found an element, and the contract still judges each.
    // A kind added since (heading, text: the per-element probe of ds-remeasure-2/4, 11/10/2026) must
    // come with that later measure, named in readyNote and present on disk.
    const kinds = Object.keys(c.contrast).sort()
    const measured = [...fin.flow.contrastKinds].sort()
    for (const k of measured) assert.ok(kinds.includes(k), `${slug}: probe kind ${k} still judged`)
    if (kinds.some((k) => !measured.includes(k))) {
      const later = [...c.readyNote.matchAll(/tasks\/evidence\/ds-re(?:measure|verify)-[^\s),;]+/g)]
        .map((m) => m[0].replace(/[.:]$/, ''))
        .filter((d) => d.includes(slug) && existsSync(join(ROOT, d)))
      assert.ok(later.length > 0, `${slug}: kinds ${kinds} beyond ${measured} name their re-measure`)
    }
    assert.ok(Math.min(...fin.flow.follows) >= 0.5, `${slug} follows ${Math.min(...fin.flow.follows)}`)
    // the door offers it to a site of that release, and refuses an older one
    const key = `joomla/${slug}`
    assert.deepEqual(contractFor(key, { key: `quickstart/${slug}/j6`, version: v }), {
      contract: `joomla-${slug}`
    })
  }
  for (const slug of ['ja-resort', 'ja-symphony', 'ja-vital'].filter(
    (s) => !loadContract(`joomla-${s}`).ready
  ))
    assert.match(loadContract(`joomla-${slug}`).readyNote, /^NOT offered yet/, slug)
})

step('S2 each built re-release has its tch contract and its template-profiles row', () => {
  for (const slug of BUILT) {
    const v = READY[slug]
    const dir = join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts', slug, 'j6', v)
    for (const f of ['manifest.json', 'presentation-lock.json', 'content-map.json'])
      assert.ok(existsSync(join(dir, f)), `${slug} ${v} ${f}`)
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    assert.equal(m.id, `${slug}/j6/${v}`)
    assert.match(m.quickstart.builtFrom.change, /stylesheets read the worn design system/)
    assert.ok(profiles[`quickstart/${slug}/j6`]?.[v], `${slug} ${v} profile row`)
  }
  for (const slug of ['ja-resume', 'ja-sensei'])
    assert.match(
      JSON.parse(
        readFileSync(
          join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts', slug, 'j6/1.0.1/manifest.json'),
          'utf8'
        )
      ).quickstart.builtFrom.change,
      /T3 dev mode off/
    )
})

step('S3 the module sheets carry the batch mechanisms', () => {
  const sheet = (name) => {
    const c = loadContract(name)
    return joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, c), c).css
  }
  // JA Tour: what T4 writes as literals follows (followRules), !important where T4 is
  const tour = sheet('joomla-ja-tour')
  assert.match(tour, /body:not\([^)]*\)\{color:var\(--ds-c-fg\);background-color:var\(--ds-c-bg\)\}/)
  assert.match(tour, /\.btn\.btn-secondary:not\([^)]*\)\{background-color:var\(--ds-c-accent\)!important/)
  // JA Podcast: its .dark-active redeclares T4 runtime colours; the slot sets them there too
  assert.match(
    sheet('joomla-ja-podcast'),
    /\[data-bs-theme="dark"\], \.dark-active\{[^}]*--body-text-color:var\(--ds-c-fg\)/
  )
  // JA Impact: a kept band gets the --t4-* colours of the tokenized :root back
  assert.match(sheet('joomla-ja-impact'), /\.header-top[^{]*\{[^}]*--t4-gray-500:#adb5bd/)
  // JA Seven: T4 secondary is its heading colour
  assert.match(sheet('joomla-ja-seven'), /--color-secondary:var\(--ds-c-fg-2\)/)
})

// Tracy SaaS first read the slot at 1.4.5; the contract's minVersion has since followed the
// re-releases (1.4.12 on 12/10/2026, sharp as a direct dependency). The door offers the release the
// contract names, refuses the one before it, and the tree's theme is that release or newer.
const vnum = (v) => v.split('.').map(Number)
const vcmp = (a, b) => {
  const [x, y] = [vnum(a), vnum(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
step('S4 Tracy SaaS EmDash (1.4.5 or a later re-release) reads the slot', () => {
  const SAAS = 'tracy-saas/emdash-0.x'
  const min = loadContract('emdash-tracy-saas').minVersion[SAAS]
  assert.ok(vcmp(min, '1.4.5') >= 0, `minVersion ${min} is 1.4.5 or later`)
  assert.deepEqual(
    contractFor(templateKeyOf({ platform: 'emdash', quickstartTag: SAAS }), { key: SAAS, version: min }),
    { contract: 'emdash-tracy-saas' }
  )
  assert.equal(
    contractFor('emdash/tracy-saas', { key: SAAS, version: '1.4.4' }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
  const before = Object.keys(profiles[SAAS])
    .filter((v) => vcmp(v, min) < 0)
    .sort(vcmp)
    .at(-1)
  assert.equal(
    contractFor('emdash/tracy-saas', { key: SAAS, version: before }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
  const theme = join(ROOT, 'packages/cms/tracy-emdash-theme-saas')
  const have = JSON.parse(readFileSync(join(theme, 'package.json'), 'utf8')).version
  assert.ok(vcmp(have, min) >= 0, `theme ${have} >= ${min}`)
  execFileSync(process.execPath, ['--test', 'tests/ds-slot.test.mjs'], { cwd: theme, stdio: 'pipe' })
  assert.ok(profiles[SAAS]['1.4.5'])
  assert.ok(profiles[SAAS][min])
})

step('S6 Tracy Apple and Tracy Airbnb (j6) are offered from the Apple base 1.3.0', () => {
  const site = { key: 'tracy-apple/j6', version: '1.3.0' }
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'joomla', template: 'tracy' }), site), {
    contract: 'joomla-tracy-base'
  })
  assert.deepEqual(contractFor(templateKeyOf({ platform: 'joomla', template: 'tracy_airbnb' }), site), {
    contract: 'joomla-tracy-airbnb'
  })
  assert.equal(loadContract('joomla-tracy-airbnb').module.position, 'header-r')
})

step('S5 package tests', () => {
  execFileSync(
    process.execPath,
    ['--test', 'test/cms.test.mjs', 'test/slot.test.mjs', 'test/tokenize.test.mjs'],
    {
      cwd: SLOT,
      stdio: 'pipe'
    }
  )
})

for (const r of results) console.log(r)
const failed = results.filter((r) => r.startsWith('FAIL'))
console.log(
  failed.length ? `FAIL ${failed.length}/${results.length}` : `PASS ${results.length}/${results.length}`
)
process.exit(failed.length ? 1 : 0)
