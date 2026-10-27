/**
 * REG-PR-1134-ds-contracts-r2a: round 2 of the JA Joomla j6 slot contracts (batch r2a) offers the four
 * templates batch 6 could not, each on its tokenized 1.0.1 re-release:
 *   - JA Mason (dark T3): under a light system its white logo and black striped eyebrow discs are
 *     inverted (sideRules.light); the hero slideshow is a kept band that takes the page text back;
 *   - JA Magz II (T3 magazine): the heading rule names the section titles only, the off-canvas toggle
 *     leaves the button rules, the dark article cards are kept, the black logo is inverted under a
 *     dark system (sideRules.dark);
 *   - JA Lawfirm (T3): stats band and team-card backs kept, the FAQ band takes the page ground back
 *     (keepGround);
 *   - JA Teline V (T3 magazine): white text on its accent fills takes accent-on (selectors.onAccent),
 *     the system is scoped to light mode so the template's own dark mode stays its own.
 * S1 reads the contracts; S2 builds the module sheets; S3 restores JA Magz II's release, tokenizes
 * it and wears four systems (pass-joomla.mjs). S3 needs Docker, the fleet's Joomla image, Chrome
 * and read access to JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cannotRun, checks, ROOT, run, needsTasks } from './lib.mjs'

needsTasks()

// A contract re-measured since this round names that later measure (ds-remeasure-N / ds-reverify-X,
// 11-12/10/2026) instead; that folder of the template must be on disk.
const laterEvidence = (slug, note) =>
  [...String(note).matchAll(/tasks\/evidence\/ds-re(?:measure|verify)-[^\s),;]+/g)]
    .map((m) => m[0].replace(/[.:]$/, ''))
    .some((d) => d.includes(slug) && existsSync(join(ROOT, d)))

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { contractBase, loadContract, loadProfile } = await import(join(LIB, 'src/library.mjs'))
const { joomlaSlot } = await import(join(LIB, 'src/joomla.mjs'))
const c = checks()
const HI = ':root:root:root:root:root:root'

// S1: the four contracts, offered on the release they were measured on
const ALL = ['ja-lawfirm', 'ja-magz-ii', 'ja-mason', 'ja-teline-v']
const k = {}
for (const slug of ALL) {
  k[slug] = loadContract(`joomla-${slug}`)
  c.eq(`S1 ${slug}: template key`, k[slug].template, `joomla/${slug}`)
  c.eq(`S1 ${slug}: offered`, k[slug].ready, true)
  c.eq(`S1 ${slug}: minVersion`, k[slug].minVersion?.[`quickstart/${slug}/j6`], '1.0.1')
  c.check(
    `S1 ${slug}: readyNote names the evidence`,
    String(k[slug].readyNote).includes(`ds-contracts-r2a-2026-10-11/templates/${slug}-j6`) ||
      laterEvidence(slug, k[slug].readyNote),
    k[slug].readyNote
  )
}
c.eq(
  'S1 ja-mason: light-side pictures',
  Object.keys(k['ja-mason'].sideRules?.light ?? {})
    .sort()
    .join(' '),
  '.logo-img .sub-heading::after'
)
c.eq(
  'S1 ja-magz-ii: section titles only',
  k['ja-magz-ii'].selectors.heading.join(' '),
  '#t3-section h3.module-title'
)
c.check(
  'S1 ja-magz-ii: dark cards kept',
  k['ja-magz-ii'].keepScopes.includes('.dark'),
  k['ja-magz-ii'].keepScopes
)
c.eq('S1 ja-lawfirm: FAQ ground', k['ja-lawfirm'].keepGround.join(' '), '.acm-container-tabs')
c.eq('S1 ja-teline-v: light mode only', k['ja-teline-v'].tokenScope, ':root:not([data-theme="dark"])')
c.check('S1 ja-teline-v: accent text pairs', (k['ja-teline-v'].selectors.onAccent ?? []).length === 2, '')

// S2: the module sheets a site wears
const MOTHERDUCK = 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'
const TOGGL = 'refero:813be405-c2b9-41be-9864-7b53d66483dc'
const sheet = (slug, id) => joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, k[slug]), k[slug]).css ?? ''
c.check(
  'S2 ja-mason under MotherDuck (light): logo inverted',
  sheet('ja-mason', MOTHERDUCK).includes(`${HI} .logo-img{filter:invert(1)}`),
  ''
)
c.check(
  'S2 ja-mason under Toggl Track (dark): nothing inverted',
  !sheet('ja-mason', TOGGL).includes('invert('),
  ''
)
c.check(
  'S2 ja-magz-ii under Toggl Track (dark): logo inverted, hue kept',
  sheet('ja-magz-ii', TOGGL).includes(`${HI} .logo-img{filter:invert(1) hue-rotate(180deg)}`),
  ''
)
c.check(
  'S2 ja-lawfirm: the FAQ band takes the page ground',
  sheet('ja-lawfirm', TOGGL).includes(`${HI} .acm-container-tabs{background-color:#ffffff}`),
  ''
)
const tel = sheet('ja-teline-v', TOGGL)
c.check('S2 ja-teline-v: tokens outside dark mode only', tel.includes(':root:not([data-theme="dark"]){'), '')
c.check('S2 ja-teline-v: onAccent rule', tel.includes('{color:var(--ds-c-accent-on)}'), '')

// S3: JA Magz II through its pass — 12/12, controls 0, nothing less readable
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
  execFileSync('gh', ['release', 'view', 'quickstart/ja-magz-ii/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsr2a-'))
try {
  const r = run(
    process.execPath,
    [
      join(LIB, 'scripts/pass-joomla.mjs'),
      'ja-magz-ii',
      '--port',
      '53281',
      '--cdp',
      '9781',
      '--evidence',
      work
    ],
    { timeoutS: 2400 }
  )
  let s = null
  try {
    s = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S3 ja-magz-ii: ran', !!s, r.stderr.slice(-400))
  if (s) {
    c.eq('S3 ja-magz-ii: verdicts', s.pass, '12/12')
    c.eq('S3 ja-magz-ii: controls (differences against the release)', s.controls.join(','), '0,0,0,0')
    c.check(
      'S3 ja-magz-ii: no text under 4.5:1 worse than its own',
      s.lowContrast.length === 0,
      s.lowContrast
    )
    c.check('S3 ja-magz-ii: at least half the page follows', Math.min(...s.follows) >= 0.5, s.follows)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
