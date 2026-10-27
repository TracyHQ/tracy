/**
 * REG-PR-1134-ds-contracts-r3b: round 3 of the slot contracts (batch r3b, 11/10/2026) — four JA Joomla
 * j6 templates measured not ready in round 1 now wear a design system, from their 1.0.1 re-release:
 *   - JA Aiga (T3): its home layout is one full-screen dark photo; the text on it stays light on both
 *     sides of light (sideRules: the system's page colour on a light system, its text colour lightened
 *     toward white on a dark one);
 *   - JA Alpha (T4): its accents follow through T4's style template (t4Placeholders __color_primary), its
 *     light cards through its own --primary_light (templateVars), its red palette band and .bg-primary
 *     bands take the accent and the accent's own text (followRules, onAccent);
 *   - JA Artsy (T4): the active menu link T4 writes !important takes the readable accent (followRules
 *     with a child combinator, now allowed); kept bands keep their text colour (keepColors);
 *   - JA Athena (T4): its kept video band keeps its own link colour (keepDefaultsYield) and the footer
 *     title its #333 (keepDefaults --heading-color).
 *   S1 the library's tests; S2 the contracts and the sheet/tokenizer output they rely on; S3 tracy-web's
 *   door at 1.0.1 and 1.0.0; S4 JA Artsy through pass-joomla.mjs (release restored, stylesheets
 *   tokenized, four systems worn, cleared). S4 needs Docker, the fleet's Joomla image, Chrome and read
 *   access to JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const imp = (p) => import(pathToFileURL(join(LIB, p)).href)
const { contractBase, loadContract, loadProfile } = await imp('src/library.mjs')
const { joomlaSlot } = await imp('src/joomla.mjs')
const { tokenizeCss } = await imp('src/tokenize.mjs')
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/contracts.test.mjs', 'test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2
const SLUGS = ['ja-aiga', 'ja-alpha', 'ja-artsy', 'ja-athena']
const k = Object.fromEntries(SLUGS.map((s) => [s, loadContract(`joomla-${s}`)]))
for (const s of SLUGS) {
  c.eq(`S2 ${s} is ready`, k[s].ready, true)
  c.eq(`S2 ${s} wears from 1.0.1`, k[s].minVersion?.[`quickstart/${s}/j6`], '1.0.1')
  c.check(
    `S2 ${s} names its evidence`,
    String(k[s].readyNote).includes(`ds-contracts-r3b-2026-10-11/templates/${s}-j6`),
    k[s].readyNote
  )
  c.check(`S2 ${s} does not rely on T4's generated sheet`, !k[s].t4SiteCss, k[s].t4SiteCss)
}
const sheet = (s, id) => joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, k[s]), k[s]).css ?? ''
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const MOTHERDUCK = 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'
const TOGGL = 'refero:813be405-c2b9-41be-9864-7b53d66483dc'
c.check(
  'S2 ja-aiga dark system: photo text lightened toward white',
  sheet('ja-aiga', TOGGL).includes('color:color-mix(in srgb, var(--ds-c-fg) 35%, #ffffff)'),
  ''
)
c.check(
  'S2 ja-aiga light system: photo text takes the page colour, the ground behind it the text colour',
  ((x) => x.includes('{color:var(--ds-c-bg)}') && x.includes('{background-color:var(--ds-c-fg)}'))(
    sheet('ja-aiga', MOTHERDUCK)
  ),
  ''
)
const pal = Object.fromEntries(
  ['bg', 'fg', 'accent'].map((n) => [n, contractBase(ROOT, k['ja-alpha'])[`--${n}`]])
)
c.eq(
  'S2 ja-alpha style template accents tokenize by role',
  tokenizeCss(
    '.category-name a{background:__color_primary}.link-primary{color:__color_primary !important}',
    [pal],
    {
      t4Placeholders: k['ja-alpha'].t4Placeholders
    }
  ).css,
  '.category-name a{background:var(--ds-c-accent, __color_primary)}.link-primary{color:var(--ds-c-accent-text, __color_primary) !important}'
)
c.check(
  "S2 ja-alpha cards follow through the template's --primary_light",
  sheet('ja-alpha', MOXIE).includes('--primary_light:var(--ds-c-surface)'),
  ''
)
c.check(
  'S2 ja-artsy active menu link takes the readable accent !important',
  sheet('ja-artsy', MOTHERDUCK).includes('.t4-palette-mainnav .navbar-nav > li.active > a:not(') &&
    sheet('ja-artsy', MOTHERDUCK).includes('color:var(--ds-c-accent-text)!important'),
  ''
)
c.check(
  'S2 ja-athena kept bands yield to their own variables',
  sheet('ja-athena', MOXIE).includes(':where(.t4-section-5,.t4-footnav,.features-content){'),
  ''
)
c.eq(
  'S2 ja-athena footer title keeps its colour',
  k['ja-athena'].keepDefaults?.['--heading-color'],
  '#333333'
)
c.check(
  'S2 the probe reads a ground a ::before paints (flow.mjs cover)',
  // `return pc` then, `return at(e, pc)` since a photo under the text is checked first (develop, 12/10/2026)
  /const pc = cover\(e\); if \(pc\) return /.test(readFileSync(join(LIB, 'scripts/flow.mjs'), 'utf8')),
  ''
)

// S3
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
for (const s of SLUGS) {
  const key = templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') })
  c.eq(
    `S3 ${s} at 1.0.1`,
    JSON.stringify(contractFor(key, { key: `quickstart/${s}/j6`, version: '1.0.1' })),
    JSON.stringify({ contract: `joomla-${s}` })
  )
  c.eq(
    `S3 ${s} at 1.0.0 needs the update`,
    contractFor(key, { key: `quickstart/${s}/j6`, version: '1.0.0' }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
}

// S4
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  docker('image', 'inspect', 'tracy/web-joomla:6-apache-20260923-r1')
  docker('image', 'inspect', 'mariadb:11')
} catch {
  cannotRun('Docker, or the fleet Joomla image, is not on this machine')
}
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chrome)) cannotRun(`no Chrome at ${chrome} (set CHROME)`)
try {
  execFileSync('gh', ['release', 'view', 'quickstart/ja-artsy/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsr3b-'))
try {
  const r = run(
    process.execPath,
    [
      join(LIB, 'scripts/pass-joomla.mjs'),
      'ja-artsy',
      '--port',
      '53662',
      '--cdp',
      '9872',
      '--evidence',
      work
    ],
    { timeoutS: 2400 }
  )
  let s = null
  try {
    s = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S4 ja-artsy: ran', !!s, r.stderr.slice(-400))
  if (s) {
    c.eq('S4 ja-artsy: verdicts', s.pass, '12/12')
    c.eq('S4 ja-artsy: controls (differences against the release)', s.controls.join(','), '0,0,0,0')
    c.check('S4 ja-artsy: no text under 4.5:1 worse than its own', s.lowContrast.length === 0, s.lowContrast)
    c.check('S4 ja-artsy: at least half the page follows', Math.min(...s.follows) >= 0.5, s.follows)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
