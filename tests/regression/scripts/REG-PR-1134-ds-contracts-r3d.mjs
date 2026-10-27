/**
 * REG-PR-1134-ds-contracts-r3d: round 3 of the slot contracts (batch r3d, 11/10/2026) — four JA Joomla
 * j6 templates measured not ready in round 1 now wear a design system, from their 1.0.1 re-release:
 *   - JA Coach: its eyebrows and statistics are .text-secondary (T4's var(--color-secondary)!important):
 *     the contract points that variable at the readable accent, its card and theme fills follow the
 *     page and surface, and the kept footer gets back the --headings-color its h1-h6 rule reads;
 *   - JA Colab: its dark panel and closing photo hero are kept (keepDefaultsYield, keepText), text on
 *     its accent band takes the accent's own text colour, its line icons are inverted on a dark page;
 *   - JA Candidate: the quote section over a white flag photo is kept whole with its own ground
 *     (keepGround), and the container rule skips the hero (a narrower container pushed the portrait
 *     over the title);
 *   - JA Cityguide (T3): its released styles compile LESS in dev mode, so its tokenized css/*.css never
 *     reached the page (24% followed): the 1.0.1 release ships with dev mode off (t3DevmodeOff).
 *   S1 the library's tests; S2 the contracts; S3 tracy-web's door at 1.0.1 and 1.0.0; S4 JA Coach
 *   through pass-joomla.mjs (release restored, stylesheets tokenized, four systems worn, cleared).
 *   S4 needs Docker, the fleet's Joomla image, Chrome and read access to JoomlArt-Products/ja-products.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const imp = (p) => import(pathToFileURL(join(LIB, p)).href)
const { contractBase, loadContract, loadProfile } = await imp('src/library.mjs')
const { joomlaSlot } = await imp('src/joomla.mjs')
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/contracts.test.mjs', 'test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2
const SLUGS = ['ja-coach', 'ja-colab', 'ja-candidate', 'ja-cityguide']
const k = Object.fromEntries(SLUGS.map((s) => [s, loadContract(`joomla-${s}`)]))
for (const s of SLUGS) {
  c.eq(`S2 ${s} is ready`, k[s].ready, true)
  c.eq(`S2 ${s} wears from 1.0.1`, k[s].minVersion?.[`quickstart/${s}/j6`], '1.0.1')
  c.check(
    `S2 ${s} names its evidence`,
    String(k[s].readyNote).includes(`ds-contracts-r3d-2026-10-11/${s}-j6`),
    k[s].readyNote
  )
  c.check(
    `S2 ${s} judges every heading and text`,
    !!k[s].contrast?.heading && !!k[s].contrast?.text,
    k[s].contrast
  )
  c.check(`S2 ${s} does not rely on T4's generated sheet`, !k[s].t4SiteCss, k[s].t4SiteCss)
}
c.eq(
  'S2 ja-coach secondary is text',
  k['ja-coach'].templateVars?.['--color-secondary'],
  'var(--ds-c-accent-text)'
)
c.eq(
  'S2 ja-coach footer keeps its heading colour',
  k['ja-coach'].keepDefaults?.['--headings-color'],
  '#212121'
)
c.check(
  'S2 ja-colab keeps its dark panel, yielding to its own variables',
  k['ja-colab'].keepScopes.includes('.bg-dark') && k['ja-colab'].keepDefaultsYield === true,
  k['ja-colab'].keepScopes
)
c.eq(
  'S2 ja-candidate quote section keeps its ground',
  JSON.stringify(k['ja-candidate'].keepGround),
  '["#t4-section-2"]'
)
c.check(
  'S2 ja-candidate container rule skips the hero',
  k['ja-candidate'].selectors.container.every((x) => x.includes(':not(.t4-hero)')),
  k['ja-candidate'].selectors.container
)
c.eq('S2 ja-cityguide ships T3 dev mode off', k['ja-cityguide'].t3DevmodeOff, true)
const TOGGL = 'refero:813be405-c2b9-41be-9864-7b53d66483dc'
const coachCss =
  joomlaSlot(loadProfile(ROOT, TOGGL), contractBase(ROOT, k['ja-coach']), k['ja-coach']).css ?? ''
c.check(
  'S2 ja-coach sheet points --color-secondary at the readable accent',
  coachCss.includes('--color-secondary:var(--ds-c-accent-text)'),
  ''
)
const colabCss =
  joomlaSlot(loadProfile(ROOT, TOGGL), contractBase(ROOT, k['ja-colab']), k['ja-colab']).css ?? ''
c.check(
  'S2 ja-colab inverts its feature icons on a dark system',
  colabCss.includes('.features-item .img-icon img{filter:invert(1) hue-rotate(180deg)}'),
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
  execFileSync('gh', ['release', 'view', 'quickstart/ja-coach/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsr3d-'))
try {
  const r = run(
    process.execPath,
    [
      join(LIB, 'scripts/pass-joomla.mjs'),
      'ja-coach',
      '--port',
      '53745',
      '--cdp',
      '9876',
      '--evidence',
      work
    ],
    { timeoutS: 2400 }
  )
  let s = null
  try {
    s = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S4 ja-coach: ran', !!s, r.stderr.slice(-400))
  if (s) {
    c.eq('S4 ja-coach: verdicts', s.pass, '12/12')
    c.eq('S4 ja-coach: controls (differences against the release)', s.controls.join(','), '0,0,0,0')
    c.check('S4 ja-coach: no text under 4.5:1 worse than its own', s.lowContrast.length === 0, s.lowContrast)
    c.check('S4 ja-coach: at least half the page follows', Math.min(...s.follows) >= 0.5, s.follows)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
