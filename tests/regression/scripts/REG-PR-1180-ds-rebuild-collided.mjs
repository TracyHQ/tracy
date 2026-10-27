/**
 * REG-PR-1180-ds-rebuild-collided: the design-system re-releases whose numbers other lines took are
 * rebuilt as the next free versions, and what made them collide or fail stays fixed (11/10/2026):
 *   S1 every content contract whose release turned T3 dev mode off says so in its lock (a lock that
 *      pins devmode 1 against a database that ships 0 made the plugin report drift in every template
 *      style at bind: JA Resume / JA Sensei 1.0.1), and the rebuilt contracts embed their own release;
 *   S2 the slot contracts wear exactly the rebuilt versions (minVersion / maxVersion), JA Essence's
 *      transparent buttons take the system's text, and tracy-web's door offers those versions and
 *      refuses the untokenized ones another line released;
 *   S3 Tracy Business 1.7.15 ships no class that pins a value the slot owns, with its rows;
 *   S4 Tracy Base's QA contract validates against the design source git has (its contracts gate
 *      failed on every machine: nine files of the source never reached git);
 *   S5 tracy-web's door tests and the ds-slot library tests.
 * No stand, no model, no network.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const CON = join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const ON = /\\"devmode\\":\\"1\\"/g
const OFF = /\\"devmode\\":\\"0\\"/g

// S1
for (const [slug, v, styles] of [
  ['ja-restaurant', '1.0.4', 5],
  ['ja-resume', '1.0.2', 8],
  ['ja-sensei', '1.0.2', 1]
]) {
  const lock = readFileSync(join(CON, slug, 'j6', v, 'presentation-lock.json'), 'utf8')
  c.eq(`S1 ${slug} ${v}: no template style with dev mode on in the lock`, (lock.match(ON) ?? []).length, 0)
  c.eq(`S1 ${slug} ${v}: ${styles} styles say it off`, (lock.match(OFF) ?? []).length, styles)
  const m = JSON.parse(readFileSync(join(CON, slug, 'j6', v, 'manifest.json'), 'utf8'))
  c.eq(
    `S1 ${slug} ${v}: the contract names its own version`,
    `${m.id} ${m.quickstart.version}`,
    `${slug}/j6/${v} ${v}`
  )
}
// the switch-only releases point at the 1.0.1 installers, same bytes
for (const [slug, sha] of [
  ['ja-resume', '0c87e44ca5090b48cf28186cd653210172b21171026fe58b015cbaba4fc2af8d'],
  ['ja-sensei', '44391ef8d110291a10e2a37ec6e3b1ff5f7e291e891e8a0c3a473820548e6f1f']
]) {
  const p = JSON.parse(readFileSync(join(CON, slug, 'j6', '1.0.2', 'manifest.json'), 'utf8')).quickstart.parts
    .installer
  c.eq(
    `S1 ${slug} 1.0.2 is the 1.0.1 installer`,
    `${p.file} ${p.sha256}`,
    `${slug}-j6-quickstart-1.0.1.zip ${sha}`
  )
}
{
  const m = JSON.parse(readFileSync(join(CON, 'ja-essence/j6/1.0.6/manifest.json'), 'utf8'))
  c.eq(
    'S1 ja-essence 1.0.6 webroot',
    m.quickstart.parts.webroot.sha256,
    '118f1b945360ccba6ceafbf48c70f6546d73f3ab01316e64609e6091532ffdda'
  )
  const same = (f) =>
    createHash('sha256')
      .update(readFileSync(join(CON, 'ja-essence/j6', f)))
      .digest('hex')
  c.eq(
    'S1 ja-essence 1.0.6 keeps 1.0.5’s content map',
    same('1.0.6/content-map.json'),
    same('1.0.5/content-map.json')
  )
}
// the build that writes these locks (release-joomla.mjs) carries the same rule
const rj = readFileSync(join(ROOT, 'packages/design/tracy-ds-slot/scripts/release-joomla.mjs'), 'utf8')
c.check(
  'S1 release-joomla.mjs writes the switched-off value into the lock',
  /lockText = lockText\.replace\(on, off\)/.test(rj),
  null
)

// S2
const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { loadContract } = await import(pathToFileURL(join(LIB, 'src/library.mjs')).href)
for (const [name, key, min, max] of [
  // JA Essence 1.0.7, JA Resume and JA Sensei 1.0.3: the batch-2 Joomla quickstarts moved to their new release
  // (68995730c1, 13/10/2026); this script was not followed then
  ['joomla-ja-essence', 'quickstart/ja-essence/j6', '1.0.6', '1.0.7'],
  ['joomla-ja-restaurant', 'quickstart/ja-restaurant/j6', '1.0.4', '1.0.4'],
  ['joomla-ja-resume', 'quickstart/ja-resume/j6', '1.0.1', '1.0.3'],
  ['joomla-ja-sensei', 'quickstart/ja-sensei/j6', '1.0.1', '1.0.3'],
  // 1.7.16 / 0.5.1 (TCH #1196): the same themes plus sharp as a direct dependency; Base 0.5.2 adds readiness rules only;
  // Business 1.7.17 (TCH #1297) changes only tools/personalize.mjs, the same reader; 1.7.18 (TCH #1321) is 1.7.17 plus
  // the two-mode slot of #1315 (lib/ds-slot.ts reads the sheet's mode line, Base.astro opens on the system's side)
  ['emdash-tracy-business', 'tracy-business/emdash-0.x', '1.7.6', '1.7.18'],
  ['emdash-base', 'tracy-base/emdash-0.x', '0.5.0', '0.5.3']
]) {
  const k = loadContract(name)
  c.eq(`S2 ${name} ready`, k.ready, true)
  c.eq(`S2 ${name} wears [${min}, ${max}]`, `${k.minVersion?.[key]} ${k.maxVersion?.[key]}`, `${min} ${max}`)
}
c.eq(
  'S2 JA Essence’s transparent buttons take the system’s text',
  loadContract('joomla-ja-essence').templateVars?.['--t4-body-color'],
  'var(--ds-c-fg)'
)
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
for (const [platform, template, key, ok, old] of [
  ['joomla', 'ja_essence', 'quickstart/ja-essence/j6', '1.0.6', '1.0.5'],
  ['joomla', 'ja_restaurant', 'quickstart/ja-restaurant/j6', '1.0.4', '1.0.3']
]) {
  const tk = templateKeyOf({ platform, template })
  c.check(
    `S2 ${key} ${ok} is offered`,
    !!contractFor(tk, { key, version: ok }).contract,
    contractFor(tk, { key, version: ok })
  )
  c.eq(
    `S2 ${key} ${old} needs the update`,
    contractFor(tk, { key, version: old }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
}

// S3
const BIZ = 'packages/cms/tracy-emdash-theme-business'
c.eq(
  'S3 Tracy Business is 1.7.18 (1.7.15 + sharp, TCH #1196; + the personalize tool, TCH #1297; + the two-mode slot, TCH #1321)',
  json(`${BIZ}/package.json`).version,
  '1.7.18'
)
c.tapClean('S3 no shipped slot pins', nodeTest(['tests/ds-slot-no-shipped-pins.test.mjs'], { cwd: BIZ }))
c.check(
  'S3 template-profiles 1.7.15',
  !!json('apps/tracy-web/src/lib/template-profiles.json').releases['tracy-business/emdash-0.x']['1.7.15'],
  null
)
const where = json('apps/tracy-web/src/sites/where/emdash-tracy-business.json')
c.check(
  'S3 the where-map names 1.7.15 and has verified 1.7.14',
  where.versions.includes('1.7.15') && where.verifiedReleases.some((r) => r.version === '1.7.14'),
  null
)

// S4
const BASE = 'packages/cms/tracy-emdash-theme-base'
const { validateContract } = await import(pathToFileURL(join(ROOT, BASE, 'tools/qa-contract.mjs')).href)
c.eq(
  'S4 Tracy Base’s QA contract validates against vendor/joomla/html/tracy_base',
  JSON.stringify(
    validateContract(json(`${BASE}/qa.contract.json`), join(ROOT, 'vendor/joomla/html/tracy_base'))
  ),
  '[]'
)

// S5
c.tapClean('S5 tracy-web door', nodeTest(['test/design-system-door.test.mjs'], { cwd: 'apps/tracy-web' }))
c.tapClean(
  'S5 ds-slot library',
  nodeTest(
    [
      'test/cms.test.mjs',
      'test/contracts.test.mjs',
      'test/release-manifest.test.mjs',
      'test/slot.test.mjs',
      'test/tokenize.test.mjs'
    ],
    { cwd: 'packages/design/tracy-ds-slot' }
  )
)

c.done()
