/**
 * REG-PR-1179-ds-reverify-c: eighteen ready Joomla slot contracts (JA Lawfirm to JA Seven) re-verified
 * on 12/10/2026 with the unified probe of fix/ds-remeasure, on the release each minVersion names.
 * What the re-verify changed must hold:
 *   S1 the library's tests;
 *   S2 every contract stays ready inside [minVersion, maxVersion], its evidence folder exists, and it
 *      judges a page-wide running text; the six fixes are in the contract or the module sheet
 *      (JA Prodex's hero title on the accent, JA Sensei's hero button fill, JA Magz II's photo-card greys
 *      on a light system only, JA Mood's and JA Morgan's page-wide text kinds, JA Rights held still);
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
const EV = 'tasks/evidence/ds-reverify-c-2026-10-12'

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2: the eighteen contracts and the release each was re-verified on
const MEASURED = {
  'ja-lawfirm': '1.0.1',
  'ja-magz-ii': '1.0.1',
  'ja-mason': '1.0.1',
  'ja-mono': '1.0.1',
  'ja-mood': '1.0.1',
  'ja-morgan': '1.0.3',
  'ja-nova': '1.0.5',
  'ja-phio': '1.0.4',
  'ja-podcast': '1.0.2',
  'ja-prodex': '1.0.1',
  'ja-purity-iv': '1.0.1',
  'ja-rent': '1.0.2',
  'ja-resort': '1.0.2',
  'ja-restaurant': '1.0.4',
  'ja-resume': '1.0.1',
  'ja-rights': '1.0.1',
  'ja-sensei': '1.0.1',
  'ja-seven': '1.0.1'
}
const FIXED = ['ja-magz-ii', 'ja-mood', 'ja-morgan', 'ja-prodex', 'ja-rights', 'ja-sensei']
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
  const ev = FIXED.includes(s) ? join(EV, s, 'after/rule.json') : join(EV, s, 'rule.json')
  c.check(`S2 ${s} evidence ${ev}`, existsSync(join(ROOT, ev)), '')
  c.check(
    `S2 ${s} judges running text`,
    Object.keys(k[s].contrast ?? {}).some((x) => /^(body|text|muted|card-text)$/.test(x)),
    Object.keys(k[s].contrast ?? {})
  )
}
for (const s of FIXED)
  c.check(`S2 ${s} readyNote names the re-verify`, String(k[s].readyNote).includes(`${EV}/${s}`), '')

const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const MOTHERDUCK = 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'
const APPLE = 'od:apple'
const sheet = (s, sys) => joomlaSlot(loadProfile(ROOT, sys), contractBase(ROOT, k[s]), k[s]).css ?? ''
const has = (css, sel, decl) =>
  css.split('\n').some((l) => l.includes(sel) && l.includes('{') && l.includes(decl))

c.check(
  'S2 ja-prodex hero title takes the accent text colour',
  [MOXIE, MOTHERDUCK].every((sys) =>
    has(sheet('ja-prodex', sys), '.acm-hero .hero-title', 'color:var(--ds-c-accent-on)')
  ),
  ''
)
c.check(
  'S2 ja-sensei hero second button keeps its purple fill on light and dark systems',
  [MOXIE, MOTHERDUCK, APPLE].every((sys) =>
    has(
      sheet('ja-sensei', sys),
      '.acm-features.style-1 .btn-action .btn.btn-default',
      'background-color:#955cf0'
    )
  ),
  ''
)
c.check(
  'S2 ja-magz-ii photo-card meta keeps the template greys on a light system',
  [MOTHERDUCK, APPLE].every(
    (sys) =>
      has(sheet('ja-magz-ii', sys), '.items-row article.image .item-content', 'color:#aaaaaa') &&
      has(sheet('ja-magz-ii', sys), '.items-row article.image .article-aside', 'color:#999999')
  ),
  ''
)
c.check(
  'S2 ja-magz-ii no photo-card grey on a dark system',
  !sheet('ja-magz-ii', MOXIE).includes('.items-row article.image .item-content'),
  ''
)
for (const s of ['ja-mood', 'ja-morgan'])
  c.check(
    `S2 ${s} heading and text kinds read the whole page`,
    String(k[s].contrast?.heading).startsWith('body ') && String(k[s].contrast?.text).startsWith('body '),
    k[s].contrast
  )
c.eq('S2 ja-rights measured with carousels held still', k['ja-rights'].measureStill, true)

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

c.done()
