/**
 * REG-PR-1179-ds-reverify-d: twenty-two ready Joomla slot contracts (JA Smallbiz to JA Voyara, Purity III,
 * JA Intranet and five GavickPro templates) re-verified on 12/10/2026 with the unified probe of
 * fix/ds-remeasure, on the release each minVersion names. What the re-verify changed must hold:
 *   S1 the library's tests;
 *   S2 every contract stays ready inside [minVersion, maxVersion], its evidence folder exists, and it
 *      judges a running-text kind; the fixes are in the contract or the module sheet (GK Compact's hero
 *      kept whole, GK Compact's and GK Restly's image logos no longer a text kind, GK Appetit measured on
 *      its News page without a footer kind, JA Teline V's carousel meta kept #999999 on both sides, JA Trip's
 *      highlight card title on the system's text colour);
 *   S3 tracy-web's door offers each at its minVersion and refuses the version before.
 * No Docker, no network.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const imp = (p) => import(pathToFileURL(join(LIB, p)).href)
const { contractBase, loadContract, loadProfile } = await imp('src/library.mjs')
const { joomlaSlot } = await imp('src/joomla.mjs')
const c = checks()
const EV = 'tasks/evidence/ds-reverify-d-2026-10-12'

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2: contract id → [quickstart slug, Joomla template element, release re-verified]
const MEASURED = {
  'ja-smallbiz': ['ja-smallbiz', 'ja_smallbiz', '1.0.1'],
  'ja-social-ii': ['ja-social-ii', 'ja_social_ii', '1.0.2'],
  'ja-spa': ['ja-spa', 'ja_spa', '1.0.2'],
  'ja-space': ['ja-space', 'ja_space', '1.0.3'],
  'ja-spark': ['ja-spark', 'ja_spark', '1.0.1'],
  'ja-stark': ['ja-stark', 'ja_stark', '1.0.1'],
  'ja-symphony': ['ja-symphony', 'ja_symphony', '1.0.1'],
  'ja-teline-v': ['ja-teline-v', 'ja_teline_v', '1.0.1'],
  'ja-titan': ['ja-titan', 'ja_titan', '1.0.1'],
  'ja-tour': ['ja-tour', 'ja_tour', '1.0.1'],
  'ja-trip': ['ja-trip', 'ja_trip', '1.0.4'],
  'ja-vega': ['ja-vega', 'ja_vega', '1.0.4'],
  'ja-vital': ['ja-vital', 'ja_vital', '1.0.3'],
  'ja-vogue': ['ja-vogue', 'ja_vogue', '1.0.4'],
  'ja-voyara': ['ja-voyara', 'ja_voyara', '1.0.5'],
  'purity-iii': ['purity-iii', 'purity_iii', '1.0.1'],
  'ja-intranet': ['ja-intranet', 'ja_intranet', '1.0.1'],
  'gk-appetit': ['gavick-gk-appetit', 'gk_appetit', '1.0.1'],
  'gk-archi': ['gavick-gk-archi', 'gk_archi', '1.0.1'],
  'gk-compact': ['gavick-gk-compact', 'gk_compact', '1.0.1'],
  'gk-restly': ['gavick-gk-restly', 'gk_restly', '1.0.1'],
  'gk-spotlight': ['gavick-gk-spotlight', 'gk_spotlight', '1.0.1']
}
const NOTED = ['gk-appetit', 'gk-compact', 'gk-restly', 'ja-teline-v', 'ja-space', 'ja-trip']
const name = (s) => `joomla-${s}`
const k = Object.fromEntries(Object.keys(MEASURED).map((s) => [s, loadContract(name(s))]))
const cmp = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
for (const [s, [slug, , v]] of Object.entries(MEASURED)) {
  const q = `quickstart/${slug}/j6`
  c.eq(`S2 ${s} ready`, k[s].ready, true)
  c.eq(`S2 ${s} minVersion is the measured release`, k[s].minVersion?.[q], v)
  c.check(
    `S2 ${s} maxVersion at or above it`,
    typeof k[s].maxVersion?.[q] === 'string' && cmp(k[s].maxVersion[q], v) >= 0,
    k[s].maxVersion
  )
  const ev = join(EV, s, 'first/ready-rule.json')
  c.check(`S2 ${s} evidence ${ev}`, existsSync(join(ROOT, ev)), '')
  c.check(
    `S2 ${s} judges running text`,
    Object.keys(k[s].contrast ?? {}).some((x) => /^(body|text|muted|card-text)$/.test(x)),
    Object.keys(k[s].contrast ?? {})
  )
}
for (const s of NOTED)
  c.check(`S2 ${s} readyNote names the re-verify`, String(k[s].readyNote).includes(`${EV}/${s}`), '')

const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const MOTHERDUCK = 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'
const APPLE = 'od:apple'
const sheet = (s, sys) => joomlaSlot(loadProfile(ROOT, sys), contractBase(ROOT, k[s]), k[s]).css ?? ''
const has = (css, sel, decl) =>
  css.split('\n').some((l) => l.includes(sel) && l.includes('{') && l.includes(decl))

// GK Compact: the hero band keeps the template's ground and text under every system
for (const sys of [MOXIE, MOTHERDUCK, APPLE]) {
  const css = sheet('gk-compact', sys)
  c.check(
    `S2 gk-compact hero keeps its ground (${sys})`,
    has(css, '.acm-hero', 'background-color:#161616'),
    ''
  )
  c.check(`S2 gk-compact hero keeps its text (${sys})`, has(css, '.acm-hero', 'color:#828282'), '')
}
c.eq(
  'S2 gk-compact primary-button role outside the kept hero',
  k['gk-compact'].roles['button-primary'],
  '.pricing-table a.btn.btn-primary'
)
for (const s of ['gk-compact', 'gk-restly'])
  c.check(
    `S2 ${s} has no logo text kind (its logo is an image)`,
    !('logo' in (k[s].contrast ?? {})),
    k[s].contrast
  )
c.eq('S2 gk-appetit measured on its News page', k['gk-appetit'].measuredPage, '/index.php/news')
c.check(
  'S2 gk-appetit has no footer kind',
  !('footer' in (k['gk-appetit'].contrast ?? {})),
  k['gk-appetit'].contrast
)
// JA Teline V: the featured carousel's article meta keeps the template's grey on its photo, both sides
for (const sys of [MOXIE, MOTHERDUCK, APPLE])
  c.check(
    `S2 ja-teline-v carousel meta #999999 (${sys})`,
    has(sheet('ja-teline-v', sys), '.magazine-carousel .magazine-item-main .article-aside', 'color:#999999'),
    ''
  )

// JA Trip: the blog highlight card's title on its veil takes the system's text colour, not fg-2
for (const sys of [MOXIE, MOTHERDUCK, APPLE])
  c.check(
    `S2 ja-trip highlight card title takes fg (${sys})`,
    has(
      sheet('ja-trip', sys),
      '.mod-list-layout-1 .item-highlight .content-inner .heading-link',
      'color:var(--ds-c-fg)'
    ),
    ''
  )

// S3: the door at minVersion and the version before it
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
const before = (v) => v.replace(/(\d+)$/, (n) => String(Number(n) - 1))
for (const [s, [slug, element, v]] of Object.entries(MEASURED)) {
  const key = templateKeyOf({ platform: 'joomla', template: element })
  c.eq(
    `S3 ${s} at ${v}`,
    JSON.stringify(contractFor(key, { key: `quickstart/${slug}/j6`, version: v })),
    JSON.stringify({ contract: name(s) })
  )
  c.eq(
    `S3 ${s} at ${before(v)} needs the update`,
    contractFor(key, { key: `quickstart/${slug}/j6`, version: before(v) }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
}

c.done()
