/**
 * REG-PR-1179-ds-reverify-b: eighteen ready Joomla slot contracts (JA Donate to JA Landscape) re-verified on
 * 12/10/2026 with the unified probe (scripts/flow.mjs) on the release each contract's minVersion names.
 * What the re-verify recorded and changed must hold:
 *   S1 the library's tests;
 *   S2 every contract stays ready at the release measured, and its evidence summary shows controls 0 and no
 *      text under 4.5:1 worse than the template's own;
 *   S3 the three fixes the eye found are in the module sheet: JA Fresco's header logo inverts under a light
 *      system only, JA Impact's hero intro takes the system's light ground under a light system only, and
 *      JA Kidscorner's container width reaches its features carousel, never every owl carousel (the hero);
 *   S4 tracy-web's door offers each at its minVersion and refuses the version before.
 * No Docker, no network.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const imp = (p) => import(pathToFileURL(join(LIB, p)).href)
const { contractBase, loadContract, loadProfile } = await imp('src/library.mjs')
const { joomlaSlot } = await imp('src/joomla.mjs')
const c = checks()
const EV = 'tasks/evidence/ds-reverify-b-2026-10-12'

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2: the eighteen contracts and the release each was re-verified on
const MEASURED = {
  'ja-donate': '1.0.2',
  'ja-educatsy': '1.0.1',
  'ja-ego': '1.0.1',
  'ja-essence': '1.0.6',
  'ja-eventcamp': '1.0.1',
  'ja-fit': '1.0.1',
  'ja-focus': '1.0.1',
  'ja-fresco': '1.0.1',
  'ja-gamex': '1.0.1',
  'ja-good': '1.0.1',
  'ja-healthcare': '1.0.1',
  'ja-helple': '1.0.1',
  'ja-impact': '1.0.1',
  'ja-insight': '1.0.1',
  'ja-justitia': '1.0.1',
  'ja-kidscorner': '1.0.1',
  'ja-kinetic': '1.0.4',
  'ja-landscape': '1.0.1'
}
const FIXED = ['ja-fresco', 'ja-impact', 'ja-kidscorner']
const name = (s) => `joomla-${s}`
const k = Object.fromEntries(Object.keys(MEASURED).map((s) => [s, loadContract(name(s))]))
const cmp = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
const summary = (s, fix) => {
  const p = join(ROOT, EV, `${s}-j6`, fix ? 'fix/summary.json' : 'summary.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}
for (const [s, v] of Object.entries(MEASURED)) {
  const q = `quickstart/${s}/j6`
  c.eq(`S2 ${s} ready`, k[s].ready, true)
  c.eq(`S2 ${s} minVersion is the measured release`, k[s].minVersion?.[q], v)
  c.check(
    `S2 ${s} maxVersion at or above it`,
    typeof k[s].maxVersion?.[q] === 'string' && cmp(k[s].maxVersion[q], v) >= 0,
    k[s].maxVersion
  )
  const sm = summary(s, FIXED.includes(s))
  c.check(
    `S2 ${s} evidence: controls 0, no low contrast`,
    sm && sm.controls.every((n) => n === 0) && sm.lowContrast.length === 0,
    sm
  )
  c.check(
    `S2 ${s} evidence: half the page or more follows`,
    sm && sm.follows.every((f) => f >= 0.5),
    sm?.follows
  )
}
for (const s of FIXED)
  c.check(`S2 ${s} names its re-verify`, String(k[s].readyNote).includes(`${EV}/${s}-j6`), '')

// S3: the fixes, in the module sheet under a dark (Moxie) and a light (Apple) system
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const APPLE = 'od:apple'
const sheet = (s, sys) => joomlaSlot(loadProfile(ROOT, sys), contractBase(ROOT, k[s]), k[s]).css ?? ''
const has = (css, sel, decl) =>
  css.split('\n').some((l) => l.includes(sel) && l.includes('{') && l.includes(decl))

c.check(
  'S3 ja-fresco header logo inverts under a light system',
  has(sheet('ja-fresco', APPLE), '.navbar-brand .logo-img', 'filter:invert(1)'),
  ''
)
c.check(
  'S3 ja-fresco header logo stays white under a dark system',
  !sheet('ja-fresco', MOXIE).includes('.logo-img'),
  ''
)
c.check(
  'S3 ja-impact hero intro takes the light ground under a light system',
  has(sheet('ja-impact', APPLE), '.acm-hero.style-1 .description', 'color:var(--ds-c-bg)'),
  ''
)
c.check(
  'S3 ja-impact hero intro untouched under a dark system',
  !sheet('ja-impact', MOXIE).includes('.acm-hero.style-1 .description'),
  ''
)
const kid = sheet('ja-kidscorner', APPLE)
c.check(
  'S3 ja-kidscorner container width reaches the features carousel only',
  has(kid, 'div.features-image div.owl-carousel.owl-theme', 'max-width:') &&
    !kid
      .split('\n')
      .some((l) =>
        /(^|[\s,])div\.owl-carousel\.owl-theme/.test(
          l.split('{')[0].replace(/div\.features-image div\.owl-carousel\.owl-theme/g, '')
        )
      ),
  ''
)

// S4: the door at minVersion and the version before it
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
const before = (v) => v.replace(/(\d+)$/, (n) => String(Number(n) - 1))
for (const [s, v] of Object.entries(MEASURED)) {
  const key = templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') })
  c.eq(
    `S4 ${s} at ${v}`,
    JSON.stringify(contractFor(key, { key: `quickstart/${s}/j6`, version: v })),
    JSON.stringify({ contract: name(s) })
  )
  c.eq(
    `S4 ${s} at ${before(v)} needs the update`,
    contractFor(key, { key: `quickstart/${s}/j6`, version: before(v) }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
}

c.done()
