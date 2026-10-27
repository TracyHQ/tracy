/**
 * REG-PR-1134-ds-remeasure-3: fourteen JA Joomla j6 slot contracts marked ready by earlier, coarser
 * probes, re-measured with the round-3 flow.mjs (every visible text judged per element, the paint
 * stack under each text) on stands built from the release each contract's minVersion names.
 * Where a text now read worse than the template's own, or the eye saw it, the contract was fixed
 * module-side (no re-release); every one stays ready with the same minVersion, and its readyNote
 * leads with the re-measure record and names its evidence.
 *   S1 the library's tests; S2 the contracts and the module sheets they make; S3 tracy-web's door at
 *   each minVersion; S4 JA Impact measured live from its published 1.0.1 (stand.mjs, T4 sheets
 *   regenerated, Moxie, MotherDuck, Toggl Track and Apple worn, cleared, stand removed). S4 needs
 *   Docker, the fleet's Joomla image, Chrome and read access to JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2
const MIN = {
  'ja-healthcare': '1.0.1',
  'ja-helple': '1.0.1',
  'ja-impact': '1.0.1',
  'ja-insight': '1.0.1',
  'ja-justitia': '1.0.1',
  'ja-kidscorner': '1.0.1',
  'ja-kinetic': '1.0.4',
  'ja-landscape': '1.0.1',
  'ja-lawfirm': '1.0.1',
  'ja-magz-ii': '1.0.1',
  'ja-mason': '1.0.1',
  'ja-mono': '1.0.1',
  'ja-mood': '1.0.1',
  'ja-morgan': '1.0.3'
}
const SLUGS = Object.keys(MIN)
const k = Object.fromEntries(SLUGS.map((s) => [s, loadContract(`joomla-${s}`)]))
for (const s of SLUGS) {
  c.eq(`S2 ${s} is ready`, k[s].ready, true)
  c.eq(`S2 ${s} wears from ${MIN[s]}`, k[s].minVersion?.[`quickstart/${s}/j6`], MIN[s])
  c.check(
    `S2 ${s} leads with the re-measure and names its evidence`,
    (String(k[s].readyNote).startsWith('re-measured 11/10/2026 with the round-3 probe') ||
      (/^re-(?:measured|verified) /.test(String(k[s].readyNote)) && laterEvidence(s, k[s].readyNote))) &&
      String(k[s].readyNote).includes(`ds-remeasure-3-2026-10-11/templates/${s}-j6`),
    String(k[s].readyNote).slice(0, 200)
  )
}
const SYS = {
  moxie: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  motherduck: 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567',
  toggl: 'refero:813be405-c2b9-41be-9864-7b53d66483dc',
  apple: 'od:apple'
}
const sheet = (s, id = SYS.moxie) =>
  joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, k[s]), k[s]).css ?? ''
const has = (name, css, ...parts) =>
  c.check(
    name,
    parts.every((p) => css.includes(p)),
    parts.filter((p) => !css.includes(p))
  )

// JA Impact: photo cards kept, white tiles and buttons follow a dark system
const impact = sheet('ja-impact')
for (const band of ['.donation-layout', '.item-textwhite'])
  c.check(`S2 ja-impact keeps ${band}`, k['ja-impact'].keepScopes.includes(band), k['ja-impact'].keepScopes)
has('S2 ja-impact gives the story titles their heading colour back', impact, '--headings-color:#1d3677')
has(
  'S2 ja-impact figure tiles and blog cards take the surface under a dark system',
  impact,
  '.acm-features .item-detail.bg-white{background-color:var(--ds-c-surface)!important}',
  '.magz-layout.masonry-layout .blog-item .item-content.bg-default{background-color:var(--ds-c-surface)}'
)
c.check(
  'S2 ja-impact blog cards keep their own ground under a light system',
  !sheet('ja-impact', SYS.apple).includes('.item-content.bg-default{background-color'),
  ''
)
has('S2 ja-impact white buttons write the readable accent', impact, '.btn.btn-white:not(:hover):not(:active)')

// JA Kinetic: the variables its dark look leaves literal follow, above html.t4-dark[data-style]
const kinetic = sheet('ja-kinetic', SYS.apple)
has(
  'S2 ja-kinetic dark-look variables follow',
  kinetic,
  'html.t4-dark[data-style]:root{',
  '--elevated:var(--ds-c-surface)',
  '--muted:var(--ds-c-muted)',
  '--chrome-muted:var(--ds-c-muted)',
  '--primary-ink:var(--ds-c-accent-on)'
)
has(
  'S2 ja-kinetic eyebrows take the readable accent',
  kinetic,
  '.acm-bento .acm-bento-eyebrow',
  '.hx-eyebrow',
  '{color:var(--ds-c-accent-text)}'
)

// the other module-side fixes of this pass (Moxie is a dark system, Apple a light one)
const mono = sheet('ja-mono')
has(
  'S2 ja-mono hero multiplies its photo by the darkened accent',
  mono,
  '.acm-cta{background-color:color-mix(in srgb, var(--ds-c-accent) 45%, #000)}'
)
has(
  'S2 ja-mono client logos invert on a dark system',
  mono,
  '.uber-cliens .client-img img',
  'filter:invert(1) hue-rotate(180deg)'
)
c.check(
  'S2 ja-mono client logos stay as drawn on a light system',
  !sheet('ja-mono', SYS.apple).includes('.uber-cliens .client-img img'),
  ''
)
const healthcare = sheet('ja-healthcare')
has(
  'S2 ja-healthcare Opening Hours panel writes the accent text',
  healthcare,
  '.module-bg.bg-primary',
  '{color:var(--ds-c-accent-on)}'
)
has('S2 ja-healthcare navbar keeps its released text', healthcare, '.navbar{color:rgb(129, 140, 152)}')
const insight = sheet('ja-insight')
has(
  'S2 ja-insight logo inverts on a dark system',
  insight,
  '.logo .logo-img',
  'filter:invert(1) hue-rotate(180deg)'
)
has('S2 ja-insight navy band keeps its released text', insight, '.style-3{color:rgb(85, 85, 85)}')
has(
  'S2 ja-lawfirm active menu item reads on the dark header bar',
  sheet('ja-lawfirm', SYS.motherduck),
  '#t3-mainnav li.active:not(.dropdown-menu *) a:not(.dropdown-menu *){color:color-mix(in srgb, var(--ds-c-accent) 40%, #fff)}'
)
const mood = sheet('ja-mood', SYS.motherduck)
has(
  'S2 ja-mood brand band and phone header darken the accent end of their gradient',
  mood,
  '.mod-bg-brand-primary{background-image:linear-gradient(to bottom, #5c58dc 0%, color-mix(in srgb, var(--ds-c-accent) 45%, #000) 100%)}',
  '.t3-wrapper{--ds-mood-accent:var(--ds-c-accent)}',
  '.t3-header{--ds-c-accent:color-mix(in srgb, var(--ds-mood-accent) 45%, #000)}',
  '.t3-header *{--ds-c-accent:var(--ds-mood-accent)}'
)
has(
  'S2 ja-mood primary button drops its half-literal gradient',
  mood,
  '.btn-primary:not(',
  '{background-image:none}'
)
c.check(
  'S2 ja-mood buttons no longer name every link',
  !k['ja-mood'].selectors.button.includes('a') && !k['ja-mood'].selectors.buttonPrimary.includes('a'),
  k['ja-mood'].selectors
)
has(
  'S2 ja-justitia practice-area icons invert on a dark system',
  sheet('ja-justitia'),
  '.acm-features.style-2 .img-icon img',
  'filter:invert(1) hue-rotate(180deg)'
)

// probe: text set at no size is not measured
const flowSrc = readFileSync(join(LIB, 'scripts/flow.mjs'), 'utf8')
c.check(
  'S2 flow.mjs leaves text set at no size unmeasured',
  flowSrc.includes('const sizeless = (e) => parseFloat(getComputedStyle(painter(e)).fontSize) < 1') &&
    flowSrc.includes('!sizeless(e)'),
  ''
)

// S3
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
for (const s of SLUGS) {
  const key = templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') })
  c.eq(
    `S3 ${s} at ${MIN[s]}`,
    JSON.stringify(contractFor(key, { key: `quickstart/${s}/j6`, version: MIN[s] })),
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
  execFileSync('gh', ['release', 'view', 'quickstart/ja-impact/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const NAME = 'reg-rm3-impact'
const node = (script, args, timeoutS = 1800) =>
  run(process.execPath, [join(LIB, 'scripts', script), ...args], { timeoutS })
const work = mkdtempSync(join(tmpdir(), 'reg-dsrm3-'))
try {
  const up = node('stand.mjs', ['up', 'quickstart/ja-impact/j6', '--port', '53819', '--name', NAME])
  let st = null
  try {
    st = JSON.parse(up.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S4 ja-impact: stand up', !!st, up.stderr.slice(-400))
  if (st) {
    // The stand restores the newest published release: 1.0.1 when this case was written, 1.0.2 since
    // (develop, 12/10/2026). It must be one the contract wears: within [minVersion, maxVersion].
    const win = (f) => k['ja-impact'][f]?.['quickstart/ja-impact/j6']
    const vcmp = (a, b) => {
      const [x, y] = [a, b].map((v) => String(v).split('.').map(Number))
      for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
      return 0
    }
    c.check(
      `S4 ja-impact: published release inside the contract's window [${win('minVersion')}, ${win('maxVersion')}]`,
      typeof st.version === 'string' &&
        vcmp(st.version, win('minVersion')) >= 0 &&
        vcmp(st.version, win('maxVersion')) <= 0,
      st.version
    )
    const prefix = JSON.parse(readFileSync(join(st.dir, 'dl/manifest.json'), 'utf8')).prefix
    // a fixed article order lets each look be compared element by element; T4 writes its sheets anew
    docker(
      'exec',
      st.db,
      'mariadb',
      '-usite',
      '-psite',
      'site',
      '-e',
      `update ${prefix}modules set params=replace(params,'"article_ordering":"random"','"article_ordering":"a.id"') where client_id=0`
    )
    docker(
      'exec',
      st.web,
      'sh',
      '-c',
      'cd /var/www/html && rm -rf media/t4/css/* media/t4/optimize/* administrator/cache/t4asset'
    )
    for (let i = 0; i < 2; i++) run('curl', ['-s', '-o', '/dev/null', `${st.site}/`], { timeoutS: 120 })
    const common = ['--cms', 'joomla', '--template', 'joomla-ja-impact', '--site', st.site, '--cdp', '9919']
    node('flow.mjs', [...common, '--out', join(work, 'baseline'), '--snap'])
    node(
      'flow.mjs',
      [
        ...common,
        '--joomla-db',
        st.db,
        '--joomla-prefix',
        prefix,
        '--joomla-login',
        'site',
        '--out',
        join(work, 'flow'),
        '--baseline',
        join(work, 'baseline/default.json'),
        ...Object.values(SYS)
      ],
      2400
    )
    let f = null
    try {
      f = JSON.parse(readFileSync(join(work, 'flow/flow.json'), 'utf8'))
    } catch {}
    c.check('S4 ja-impact: flow ran', !!f?.verdicts, '')
    if (f?.verdicts) {
      const sys = f.verdicts.filter((v) => v.kind === 'system')
      const ctl = f.verdicts.filter((v) => v.kind === 'control')
      c.eq(
        'S4 ja-impact: verdicts',
        `${f.verdicts.filter((v) => v.pass).length}/${f.verdicts.length}`,
        '12/12'
      )
      c.eq('S4 ja-impact: controls', ctl.map((v) => v.differences).join(','), '0,0,0,0')
      c.check(
        'S4 ja-impact: no text worse than its own',
        sys.every((v) => v.contrast.every((x) => !x.regressed)),
        sys.flatMap((v) =>
          v.contrast.filter((x) => x.regressed).map((x) => `${v.label}/${v.vw} ${x.name} ${x.ratio}`)
        )
      )
      c.check(
        'S4 ja-impact: kept bands unchanged',
        sys.every((v) => (v.kept?.n ?? 0) === 0),
        sys.map((v) => v.kept?.n)
      )
      c.check(
        'S4 ja-impact: at least half the page follows',
        sys.every((v) => v.follows.rate >= 0.5),
        sys.map((v) => v.follows.rate)
      )
    }
  }
} finally {
  try {
    node('stand.mjs', ['down', '--name', NAME], 600)
  } catch {}
  rmSync(work, { recursive: true, force: true })
}
c.done()
