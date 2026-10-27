/**
 * REG-PR-1134-ds-contracts-r2b: round 2 of the slot contracts (batch r2b, 11/10/2026) — four JA Joomla
 * j6 templates measured not ready in round 1 now wear a design system, from their 1.0.1 re-release:
 *   - JA Titan: its look is its own dark mode (body.dark-active): the slot writes on that body too
 *     (tokenScope) and its grey scale and link colours take their roles by name (varRoles);
 *   - JA Rights: its Bootstrap-utility panels stay its own (keepScopes, keepText, keepDefaultsYield),
 *     its semantic-colour links read the readable accent (accentVars), its button text is answered
 *     !important (buttonTextImportant);
 *   - JA Stark: its page ground, text and call to action follow through T4's style template
 *     (t4Placeholders: css/tpl/theme.tpl.css, which T4 renders into media/t4/css on every change);
 *   - JA Fresco: its photo bands keep their own overlays and text.
 *   S1 the library's tests; S2 the contracts and the tokenizer/emitter options they rely on; S3
 *   tracy-web's door at 1.0.1 and 1.0.0; S4 JA Fresco through pass-joomla.mjs (release restored,
 *   stylesheets tokenized, four systems worn, cleared). S4 needs Docker, the fleet's Joomla image,
 *   Chrome and read access to JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT, run, needsTasks } from './lib.mjs'

needsTasks()

// A contract re-measured since this round names that later measure (ds-remeasure-N / ds-reverify-X,
// 11-12/10/2026) instead; that folder of the template must be on disk.
const laterEvidence = (slug, note) =>
  [...String(note).matchAll(/tasks\/evidence\/ds-re(?:measure|verify)-[^\s),;]+/g)]
    .map((m) => m[0].replace(/[.:]$/, ''))
    .some((d) => d.includes(slug) && existsSync(join(ROOT, d)))

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const imp = (p) => import(pathToFileURL(join(LIB, p)).href)
const { contractBase, loadContract, loadProfile } = await imp('src/library.mjs')
const { joomlaSlot } = await imp('src/joomla.mjs')
const { tokenizeCss } = await imp('src/tokenize.mjs')
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2
const SLUGS = ['ja-titan', 'ja-rights', 'ja-stark', 'ja-fresco']
const k = Object.fromEntries(SLUGS.map((s) => [s, loadContract(`joomla-${s}`)]))
for (const s of SLUGS) {
  c.eq(`S2 ${s} is ready`, k[s].ready, true)
  c.eq(`S2 ${s} wears from 1.0.1`, k[s].minVersion?.[`quickstart/${s}/j6`], '1.0.1')
  c.check(
    `S2 ${s} names its evidence`,
    String(k[s].readyNote).includes(`ds-contracts-r2b-2026-10-11/templates/${s}-j6`) ||
      laterEvidence(s, k[s].readyNote),
    k[s].readyNote
  )
}
c.check(
  'S2 ja-titan writes on body.dark-active',
  k['ja-titan'].tokenScope.includes('body.dark-active'),
  k['ja-titan'].tokenScope
)
c.eq('S2 ja-titan title grey is text', k['ja-titan'].varRoles?.['--t4-gray-900'], 'fg-2')
const titanCss = '.dark-active{--t4-gray-900:#F8F8F8;--t4-gray-100:#1B1B1B}'
const base = contractBase(ROOT, k['ja-titan'])
const titanPal = Object.fromEntries(['bg', 'fg', 'fg-2', 'border', 'surface'].map((n) => [n, base[`--${n}`]]))
c.eq(
  'S2 ja-titan dark-mode greys tokenize by role',
  tokenizeCss(titanCss, [titanPal, ...k['ja-titan'].extraPalettes], { varRoles: k['ja-titan'].varRoles }).css,
  '.dark-active{--t4-gray-900:var(--ds-c-fg-2, #F8F8F8);--t4-gray-100:var(--ds-c-surface, #1B1B1B)}'
)
c.eq(
  'S2 ja-stark body ground from the style template',
  tokenizeCss('body{background-color:__color_white;color:__body_text_color}', [titanPal], {
    t4Placeholders: k['ja-stark'].t4Placeholders
  }).css,
  'body{background-color:var(--ds-c-bg, __color_white);color:var(--ds-c-fg, __body_text_color)}'
)
c.check('S2 ja-stark does not rely on the generated sheet', !k['ja-stark'].t4SiteCss, k['ja-stark'].t4SiteCss)
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const rightsCss =
  joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, k['ja-rights']), k['ja-rights']).css ?? ''
c.check(
  'S2 ja-rights button text !important',
  rightsCss.includes('color:var(--ds-c-accent-on)!important'),
  ''
)
c.check(
  'S2 ja-rights kept panels yield to their own variables',
  rightsCss.includes(':where(.item-align-center,.t4-footer,.bg-white,.bg-dark,.bg-purple){'),
  ''
)
c.check(
  'S2 ja-fresco keeps its photo bands',
  ['.t4-hero', '.acm-features'].every((x) => k['ja-fresco'].keepScopes.includes(x)),
  k['ja-fresco'].keepScopes
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
  execFileSync('gh', ['release', 'view', 'quickstart/ja-fresco/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsr2b-'))
try {
  const r = run(
    process.execPath,
    [
      join(LIB, 'scripts/pass-joomla.mjs'),
      'ja-fresco',
      '--port',
      '53661',
      '--cdp',
      '9871',
      '--evidence',
      work
    ],
    { timeoutS: 2400 }
  )
  let s = null
  try {
    s = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S4 ja-fresco: ran', !!s, r.stderr.slice(-400))
  if (s) {
    c.eq('S4 ja-fresco: verdicts', s.pass, '12/12')
    c.eq('S4 ja-fresco: controls (differences against the release)', s.controls.join(','), '0,0,0,0')
    c.check('S4 ja-fresco: no text under 4.5:1 worse than its own', s.lowContrast.length === 0, s.lowContrast)
    c.check('S4 ja-fresco: at least half the page follows', Math.min(...s.follows) >= 0.5, s.follows)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
