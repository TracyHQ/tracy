/**
 * REG-PR-1352-emdash-base-saas-two-modes: Tracy Base EmDash 0.5.4 and Tracy SaaS EmDash 1.4.14 pass every
 * built-site rule of the Design system step (13/13 on /ops, like Tracy Business EmDash), and the WordPress
 * slot never forces an empty logo picture visible:
 *   S1 each theme's own test runs the real pre-paint and toggle scripts on one shared storage (a worn
 *      system opens on its own mode, stores nothing, and taking it off gives the template back);
 *   S2 both slot contracts say readsComponents, modes and their switch selector; ds-slot's own tests pass
 *      (base / SaaS two modes, WordPress empty logo);
 *   S3 contracts/<version>/design-system-measurement.json of each release: all eight rules pass;
 *   S4 both quickstarts.json copies pin the published parts; versions and maxVersion agree.
 * No stand, no model, no network.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, ROOT } from './lib.mjs'

const c = checks()
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const text = (p) => readFileSync(join(ROOT, p), 'utf8')
const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { judgeMeasurement } = await import(pathToFileURL(join(LIB, 'src/measurement.mjs')).href)

const ROWS = [
  {
    slug: 'base',
    key: 'tracy-base/emdash',
    tag: 'tracy-base/emdash-0.x',
    contract: 'emdash-base',
    toggle: '[data-tracy-theme-toggle]',
    v: '0.5.4',
    source: [7070333, '5030d7fc4f2c20f62c24bb93ba46d783a1f8403fe44e29182fd964640de850e5', 639429998],
    state: [6168865, 'eed254940a59084520e4de154ca9b76c996c8281b5335dc8f34051e29bd566c8', 639430000]
  },
  {
    slug: 'saas',
    key: 'tracy-saas/emdash',
    tag: 'tracy-saas/emdash-0.x',
    contract: 'emdash-tracy-saas',
    toggle: '.k-theme-toggle',
    v: '1.4.14',
    source: [7808844, '1cacc1f52d7c504bb313a39b7f194e1fa6e6da7744da63674843f11b6b770071', 639438922],
    state: [7674704, '6ce7750f76600d246ff01fae12b64ff81ed498b545247e9f4bc406bdebb80f5b', 639438924]
  }
]

for (const r of ROWS) {
  const THEME = `packages/cms/tracy-emdash-theme-${r.slug}`
  // S1
  const t = spawnSync(process.execPath, ['--test', 'tests/theme-preference.test.mjs'], {
    cwd: join(ROOT, THEME),
    encoding: 'utf8'
  })
  c.check(`S1 ${r.slug} tests/theme-preference.test.mjs passes`, t.status === 0)
  c.check(`S1 ${r.slug} the UNDO-1 case ran`, /UNDO-1/.test(t.stdout))
  // S2
  const k = json(`packages/design/tracy-ds-slot/templates/${r.contract}.json`)
  c.eq(`S2 ${r.contract} readsComponents`, k.readsComponents, true)
  c.eq(`S2 ${r.contract} modes`, k.modes, true)
  c.eq(`S2 ${r.contract} themeToggle`, k.selectors?.themeToggle, r.toggle)
  c.eq(`S2 ${r.contract} maxVersion`, k.maxVersion[r.tag], r.v)
  // S3
  const m = json(`${THEME}/contracts/${r.v}/design-system-measurement.json`)
  c.eq(`S3 ${r.slug} measured version`, m.version, r.v)
  c.eq(`S3 ${r.slug} measured tag`, m.tag, r.tag)
  for (const [id, verdict] of Object.entries(judgeMeasurement(m)))
    c.eq(`S3 ${r.slug} ${id}`, verdict.status, 'pass')
  // S4
  for (const p of [
    'apps/tracy-web/src/quickstarts.json',
    'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
  ]) {
    const pin = json(p)[r.key]
    c.eq(`S4 ${p} ${r.key}: version`, pin.version, r.v)
    for (const [part, [bytes, sha256, githubAssetId]] of [
      ['source', r.source],
      ['state', r.state]
    ]) {
      c.eq(`S4 ${p} ${r.key}: ${part}.bytes`, pin[part].bytes, bytes)
      c.eq(`S4 ${p} ${r.key}: ${part}.sha256`, pin[part].sha256, sha256)
      c.eq(`S4 ${p} ${r.key}: ${part}.githubAssetId`, pin[part].githubAssetId, githubAssetId)
    }
  }
  c.eq(`S4 ${r.slug} package.json version`, json(`${THEME}/package.json`).version, r.v)
  c.eq(`S4 ${r.slug} template.config.json version`, json(`${THEME}/template.config.json`).version, r.v)
  c.check(
    `S4 ${r.slug} Dockerfile label`,
    text(`${THEME}/Dockerfile`).includes(`io.tracy.template.version="${r.v}"`)
  )
}

// S2: ds-slot's own tests (base / SaaS two modes, the WordPress empty logo)
const d = spawnSync(process.execPath, ['--test', 'test/slot.test.mjs', 'test/two-modes.test.mjs'], {
  cwd: LIB,
  encoding: 'utf8'
})
c.check('S2 ds-slot slot + two-modes tests pass', d.status === 0)
c.check('S2 the empty WordPress logo case ran', /logo picture the theme left empty/.test(d.stdout))
c.check(
  'S2 the base / SaaS contract case ran',
  /Tracy Base and Tracy SaaS EmDash keep both modes/.test(d.stdout)
)

c.done()
