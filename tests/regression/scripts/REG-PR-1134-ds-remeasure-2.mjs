/**
 * REG-PR-1134-ds-remeasure-2: fourteen JA Joomla j6 slot contracts first found ready with the four
 * first-match probes were re-measured (11/10/2026) with the per-element probe (flow.mjs: every visible
 * heading, text and text-holding div judged on the paint under it, text over a photo against the photo),
 * on the release their minVersion names, under Moxie, MotherDuck, Toggl Track and Apple at 1440 and 390.
 * Eleven needed contract fixes; the last four of them:
 *   - JA Focus: the jatabs plugin paints the active tab white — it takes the worn page ground;
 *   - JA Fresco: the footer's outline button takes the system text; the testimonial band
 *     (#t4-section-8) keeps its dark ground and text;
 *   - JA Gamex: the hiring card title and the testimonial score take the system text (fg);
 *   - JA Good: category label links take accent-on, the news-3 photo card keeps its grey byline,
 *     the kept dark bands keep their own text colour.
 * flow.mjs: Joomla 3's .element-invisible words are screen-reader text (not measured), and a text layer
 * laid out of the flow over an in-flow <img> is read off the photo.
 *   S1 the library's tests; S2 the contracts and the module sheets they make; S3 tracy-web's door at
 *   each minVersion; S4 JA Good stood up from its published 1.0.1 and measured with flow.mjs under the
 *   four systems (needs Docker, the fleet's Joomla image, Chrome and gh read access to
 *   JoomlArt-Products/ja-products).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT, run, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const imp = (p) => import(pathToFileURL(join(LIB, p)).href)
const { contractBase, loadContract, loadProfile } = await imp('src/library.mjs')
const { joomlaSlot } = await imp('src/joomla.mjs')
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2
const SLUGS = [
  'ja-company',
  'ja-conf',
  'ja-diner',
  'ja-directory',
  'ja-donate',
  'ja-educatsy',
  'ja-ego',
  'ja-essence',
  'ja-eventcamp',
  'ja-fit',
  'ja-focus',
  'ja-fresco',
  'ja-gamex',
  'ja-good'
]
const k = Object.fromEntries(SLUGS.map((s) => [s, loadContract(`joomla-${s}`)]))
for (const s of SLUGS) {
  c.eq(`S2 ${s} is ready`, k[s].ready, true)
  c.check(
    `S2 ${s} names its re-measure`,
    String(k[s].readyNote).includes(`ds-remeasure-2-2026-10-11/${s}-j6`),
    k[s].readyNote
  )
  for (const kind of ['text', 'block'])
    c.check(`S2 ${s} judges every ${kind} element`, typeof k[s].contrast?.[kind] === 'string', k[s].contrast)
  c.check(
    `S2 ${s} evidence is committed`,
    existsSync(join(ROOT, `tasks/evidence/ds-remeasure-2-2026-10-11/${s}-j6/summary.json`)),
    ''
  )
}
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const sheet = (s, id = MOXIE) => joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, k[s]), k[s]).css ?? ''
c.check(
  'S2 ja-focus active tab takes the worn page ground',
  /\.ja-tabs-title li\.active[^{]*\{background-color:var\(--ds-c-bg\)\}/.test(sheet('ja-focus')),
  ''
)
const fresco = sheet('ja-fresco')
c.check(
  'S2 ja-fresco footer button takes the system text',
  /\.t4-footer \.btn\.btn-outline-light[^{]*\{color:var\(--ds-c-fg\);border-color:var\(--ds-c-fg\)\}/.test(
    fresco
  ),
  ''
)
c.check(
  'S2 ja-fresco testimonial band is kept',
  k['ja-fresco'].keepScopes.includes('#t4-section-8') && fresco.includes('#t4-section-8'),
  k['ja-fresco'].keepScopes
)
const gamex = sheet('ja-gamex')
c.check(
  'S2 ja-gamex hiring title and score take the system text',
  /\.contact-info h4[^{]*\{color:var\(--ds-c-fg\)\}/.test(gamex) &&
    /\.testimonial-rating \.rating-score[^{]*\{color:var\(--ds-c-fg\)\}/.test(gamex),
  ''
)
const good = sheet('ja-good')
c.check(
  'S2 ja-good label links take accent-on',
  /\.article-slideshow \.mod-articles-category-category a[^{]*\{color:var\(--ds-c-accent-on\)\}/.test(good),
  ''
)
c.check(
  'S2 ja-good photo card keeps its grey byline',
  good.includes('.ja-news-3 .news-big .article-info dd{color:#999999}'),
  ''
)
for (const band of ['.t3-header', '.brick-layout'])
  c.check(`S2 ja-good ${band} keeps its text colour`, good.includes(`${band}{color:rgb(85, 85, 85)}`), '')
const flowSrc = readFileSync(join(LIB, 'scripts/flow.mjs'), 'utf8')
c.check(
  'S2 flow.mjs leaves .element-invisible words unmeasured',
  // the skip list has grown since (.screen-reader-text, 12/10/2026); .element-invisible stays in it
  /closest\('[^']*\.element-invisible\b[^']*'\)/.test(flowSrc),
  ''
)
c.check(
  'S2 flow.mjs reads a positioned text layer off the photo beside it',
  flowSrc.includes('!(out(s) || out(e))'),
  ''
)

// S3
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
for (const s of SLUGS) {
  const key = `quickstart/${s}/j6`
  const version = k[s].minVersion?.[key]
  if (!version) continue // a release not yet published wears it (minVersionNote)
  c.eq(
    `S3 ${s} at ${version}`,
    JSON.stringify(
      contractFor(templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') }), { key, version })
    ),
    JSON.stringify({ contract: `joomla-${s}` })
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
  execFileSync('gh', ['release', 'view', 'quickstart/ja-good/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const S = join(LIB, 'scripts')
const NAME = 'reg-dsrm2-good'
const work = mkdtempSync(join(tmpdir(), 'reg-dsrm2-'))
try {
  const up = run(
    process.execPath,
    [
      join(S, 'stand.mjs'),
      'up',
      'quickstart/ja-good/j6',
      '--port',
      '53818',
      '--name',
      NAME,
      '--version',
      '1.0.1'
    ],
    { timeoutS: 1200 }
  )
  const stand = JSON.parse(up.stdout.trim().split('\n').pop())
  const prefix = JSON.parse(readFileSync(join(stand.dir, 'dl/manifest.json'), 'utf8')).prefix
  const SYSTEMS = [
    MOXIE,
    'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567',
    'refero:813be405-c2b9-41be-9864-7b53d66483dc',
    'od:apple'
  ]
  run(
    process.execPath,
    [
      join(S, 'flow.mjs'),
      '--cms',
      'joomla',
      '--template',
      'joomla-ja-good',
      '--site',
      stand.site,
      '--cdp',
      '9918',
      '--out',
      join(work, 'baseline'),
      '--snap'
    ],
    { timeoutS: 1500 }
  )
  run(
    process.execPath,
    [
      join(S, 'flow.mjs'),
      '--cms',
      'joomla',
      '--template',
      'joomla-ja-good',
      '--site',
      stand.site,
      '--cdp',
      '9918',
      '--joomla-db',
      stand.db,
      '--joomla-prefix',
      prefix,
      '--joomla-login',
      'site',
      '--out',
      join(work, 'final'),
      '--baseline',
      join(work, 'baseline/default.json'),
      ...SYSTEMS
    ],
    { timeoutS: 3000 }
  )
  const f = JSON.parse(readFileSync(join(work, 'final/flow.json'), 'utf8'))
  const sys = f.verdicts.filter((v) => v.kind === 'system')
  c.eq('S4 ja-good: verdicts', `${f.verdicts.filter((v) => v.pass).length}/${f.verdicts.length}`, '12/12')
  c.eq(
    'S4 ja-good: controls',
    f.verdicts
      .filter((v) => v.kind === 'control')
      .map((v) => v.differences)
      .join(','),
    '0,0,0,0'
  )
  c.check(
    'S4 ja-good: no text under 4.5:1 worse than its own',
    sys.every((v) => (v.contrast ?? []).every((x) => x.regressed !== true)),
    sys.flatMap((v) =>
      (v.contrast ?? []).filter((x) => x.regressed).map((x) => `${v.label}/${v.vw} ${x.name} ${x.ratio}`)
    )
  )
  c.check(
    'S4 ja-good: at least half the page follows',
    sys.every((v) => (v.follows?.rate ?? 0) >= 0.5),
    sys.map((v) => v.follows?.rate)
  )
} finally {
  try {
    run(process.execPath, [join(S, 'stand.mjs'), 'down', '--name', NAME], { timeoutS: 300 })
  } catch {}
  rmSync(work, { recursive: true, force: true })
}
c.done()
