/**
 * REG-PR-1134-ds-remeasure-5: fourteen ready Joomla slot contracts (JA Spa … JA Voyara, Purity III)
 * re-measured on 11/10/2026 with the per-element contrast probe, on the release each contract's
 * minVersion names. What the re-measure changed must hold:
 *   S1 the library's tests;
 *   S2 every contract stays ready inside [minVersion, maxVersion], names its re-measure evidence, and
 *      judges at least one running text; the fixes the re-measure made are in the module sheet
 *      (Purity III's kept bands and dark-side pictures, JA Voyara's prices, JA Vogue's logo and icons,
 *      JA Teline V's phone logo, JA Tour's links);
 *   S3 tracy-web's door offers each at its minVersion and refuses the version before;
 *   S4 the probe: a display:none pseudo-element and a pseudo-element picture laid in the flow are no
 *      ground (flow.mjs source, run against fake styles).
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
const EV = 'tasks/evidence/ds-remeasure-5-2026-10-11'

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2: the fourteen contracts and the release each was re-measured on
const MEASURED = {
  'ja-spa': '1.0.2',
  'ja-space': '1.0.3',
  'ja-spark': '1.0.1',
  'ja-stark': '1.0.1',
  'ja-symphony': '1.0.1',
  'ja-teline-v': '1.0.1',
  'ja-titan': '1.0.1',
  'ja-tour': '1.0.1',
  'ja-trip': '1.0.4',
  'ja-vega': '1.0.4',
  'ja-vital': '1.0.3',
  'ja-vogue': '1.0.4',
  'ja-voyara': '1.0.5',
  'purity-iii': '1.0.1'
}
const name = (s) => `joomla-${s}`
const k = Object.fromEntries(Object.keys(MEASURED).map((s) => [s, loadContract(name(s))]))
const cmp = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
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
  c.check(
    `S2 ${s} names its re-measure`,
    String(k[s].readyNote).includes(`${EV}/${s}`) && existsSync(join(ROOT, EV, s, 'after/verdicts.json')),
    ''
  )
  c.check(
    `S2 ${s} judges running text`,
    Object.keys(k[s].contrast ?? {}).some((x) => /^(body|text|muted|card-text)$/.test(x)),
    Object.keys(k[s].contrast ?? {})
  )
}
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const MOTHERDUCK = 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'
const sheet = (s, sys) => joomlaSlot(loadProfile(ROOT, sys), contractBase(ROOT, k[s]), k[s]).css ?? ''
const has = (css, sel, decl) =>
  css.split('\n').some((l) => l.includes(sel) && l.includes(`{`) && l.includes(decl))

const pDark = sheet('purity-iii', MOXIE)
const pLight = sheet('purity-iii', MOTHERDUCK)
c.check(
  'S2 purity-iii kept header and intro band keep their own text colour',
  has(pDark, '.navbar', 'color:#444444') && has(pDark, '.row-feature-primary', 'color:#bbe6ff'),
  ''
)
c.check(
  'S2 purity-iii logo tiles stay white and the T3 logo inverts on a dark system',
  has(pDark, '.row-feature a.thumbnail:has(img)', 'background-color:#ffffff') &&
    has(pDark, '.poweredby .t3-logo', 'invert(1) hue-rotate(180deg)'),
  ''
)
c.check('S2 purity-iii no dark-side rule on a light system', !pLight.includes('invert('), '')
c.check(
  'S2 purity-iii text kinds read its .features-intro rows',
  ['accent-text', 'muted', 'body', 'heading'].every((x) =>
    String(k['purity-iii'].contrast[x]).includes('.features-intro')
  ),
  k['purity-iii'].contrast
)
c.check(
  'S2 ja-voyara prices take the readable accent',
  has(sheet('ja-voyara', MOTHERDUCK), '.voy-price', 'color:var(--ds-c-accent-text'),
  ''
)
const vogue = sheet('ja-vogue', MOXIE)
c.check(
  'S2 ja-vogue logo inverts and header icons draw in the text colour on a dark system',
  has(vogue, '.logo-img', 'invert(1)') && has(vogue, '.navbar-brand svg path', 'stroke:currentColor'),
  ''
)
c.check('S2 ja-vogue keeps them on a light system', !sheet('ja-vogue', MOTHERDUCK).includes('invert('), '')
c.check(
  'S2 ja-teline-v phone logo inverts on a dark system',
  has(sheet('ja-teline-v', MOXIE), '.logo-img-sm', 'invert('),
  ''
)
c.check(
  'S2 ja-tour links painted by T4 take the readable accent',
  k['ja-tour'].followRules?.['.article-more a']?.color === 'accent-text' &&
    k['ja-tour'].followRules?.['.link-primary']?.color === 'accent-text!',
  k['ja-tour'].followRules
)

// S3: the door at minVersion and the version before it
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
const before = (v) => v.replace(/(\d+)$/, (n) => String(Number(n) - 1))
for (const [s, v] of Object.entries(MEASURED)) {
  const key = templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') })
  c.eq(
    `S3 ${s} at ${v}`,
    JSON.stringify(contractFor(key, { key: `quickstart/${s}/j6`, version: v })),
    JSON.stringify({ contract: name(s) })
  )
  c.eq(
    `S3 ${s} at ${before(v)} needs the update`,
    contractFor(key, { key: `quickstart/${s}/j6`, version: before(v) }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
}

// S4: the probe's picture rules, taken from flow.mjs's page source and run against fake styles
const flow = readFileSync(join(LIB, 'scripts/flow.mjs'), 'utf8')
const line = (n) =>
  flow
    .split('\n')
    .find((l) => l.trimStart().startsWith(`const ${n} = `))
    ?.replace(/\\\\/g, '\\')
const pictured = (styles, rect = { width: 100, height: 40 }) =>
  new Function(
    'getComputedStyle',
    `const e = { getBoundingClientRect: () => (${JSON.stringify(rect)}) }; ${line('drawn')}; ${line('pictured')}; return pictured(e)`
  )(
    (_e, p) =>
      styles[p ?? ''] ?? { backgroundImage: 'none', backgroundColor: 'rgba(0, 0, 0, 0)', content: 'none' }
  )
const none = { backgroundImage: 'none', content: 'none' }
c.eq(
  'S4 a display:none ::before picture draws nothing',
  pictured({
    '': none,
    '::before': {
      backgroundImage: 'url("line.png")',
      content: '""',
      display: 'none',
      position: 'absolute',
      width: 'calc(100% + 48px)',
      height: '1px'
    }
  }),
  false
)
c.eq(
  'S4 an inline ::after icon beside the words is no ground',
  pictured({
    '': none,
    '::after': {
      backgroundImage: 'url("flame.svg")',
      content: '""',
      display: 'inline-block',
      position: 'static'
    }
  }),
  false
)
c.eq(
  'S4 a positioned ::before picture covering the box is a ground',
  pictured({
    '': none,
    '::before': {
      backgroundImage: 'url("photo.jpg")',
      content: '""',
      display: 'block',
      position: 'absolute',
      width: '100%',
      height: '100%'
    }
  }),
  true
)

c.done()
