/**
 * REG-PR-1134-ds-remeasure-4: fourteen JA Joomla slot contracts marked ready with older probes were
 * measured again with the per-element probe (11/10/2026): every visible heading and text element judged
 * against the same element in the template's own look, text over a picture judged against it. Eleven of
 * them failed on the release their minVersion names (kept bands that took the worn page's text colour,
 * white labels on light accents, literal dark text on a dark worn page, contrast kinds that sampled
 * nothing); each was fixed in its contract and measured 12/12. Three probe errors were fixed on the way.
 *   S1 the library's tests;
 *   S2 the fourteen contracts: ready, every one judged per element (heading and text kinds), its
 *      readyNote naming tasks/evidence/ds-remeasure-4-2026-10-11, its release window unchanged;
 *   S3 the slot CSS each fix writes (ds-slot.mjs, no site): kept bands given their text colour back,
 *      Resort's buttons inside kept bands, Rights' red status mixed toward the text colour, Seven's
 *      dark buttons and dark-side glow, Smallbiz's accent panel, Social II's testimonial;
 *   S4 one release measured end to end with the current probe: quickstart/ja-social-ii/j6 1.0.2
 *      (stand.mjs + flow.mjs, Moxie, MotherDuck, Toggl Track, Apple; desktop and phone) — 12/12.
 * No model reads anything. S4 needs Docker, the fleet's Joomla image, Chrome and read access to
 * JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { loadContract } = await import(pathToFileURL(join(LIB, 'src/library.mjs')).href)
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
  'ja-nova',
  'ja-phio',
  'ja-podcast',
  'ja-prodex',
  'ja-purity-iv',
  'ja-rent',
  'ja-resort',
  'ja-restaurant',
  'ja-resume',
  'ja-rights',
  'ja-sensei',
  'ja-seven',
  'ja-smallbiz',
  'ja-social-ii'
]
const WINDOW = {
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
  'ja-seven': '1.0.1',
  'ja-smallbiz': '1.0.1',
  'ja-social-ii': '1.0.2'
}
for (const s of SLUGS) {
  const k = loadContract(`joomla-${s}`)
  const key = `quickstart/${s}/j6`
  c.eq(`S2 ${s} is ready`, k.ready, true)
  c.check(
    `S2 ${s} is judged per element (heading and text kinds)`,
    (k.contrast?.heading ?? '').startsWith('body :is(h1') &&
      (k.contrast?.text ?? '').startsWith('body :is(p, li, a'),
    k.contrast
  )
  c.check(
    `S2 ${s} readyNote names the re-measure`,
    /ds-remeasure-4-2026-10-11/.test(k.readyNote ?? ''),
    (k.readyNote ?? '').slice(0, 200)
  )
  c.eq(`S2 ${s} wears from`, k.minVersion?.[key] ?? null, WINDOW[s])
}

// S3
const SYSTEMS = {
  moxie: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  motherduck: 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567',
  toggl: 'refero:813be405-c2b9-41be-9864-7b53d66483dc',
  apple: 'od:apple'
}
const tmp = mkdtempSync(join(tmpdir(), 'reg-rm4-'))
const css = (template, system) => {
  const out = join(tmp, `${template}-${system}.html`)
  execFileSync(
    process.execPath,
    [join(LIB, 'scripts/ds-slot.mjs'), 'joomla', SYSTEMS[system], '--template', template, '--out', out],
    { encoding: 'utf8' }
  )
  return readFileSync(out, 'utf8')
}
try {
  const resort = css('joomla-ja-resort', 'moxie')
  c.check(
    'S3 ja-resort: kept slider takes its text back',
    / \.item[,{][^}]*/.test(resort) && /color:#7b8383/.test(resort)
  )
  c.check(
    'S3 ja-resort: room card band keeps its white',
    / \.acm-feature-intro\{color:#ffffff\}/.test(resort)
  )
  c.check(
    'S3 ja-resort: the primary button follows inside the kept slider',
    / \.item a\.btn\.btn-primary\{background-color:/.test(resort)
  )
  const resume = css('joomla-ja-resume', 'apple')
  c.check('S3 ja-resume: header kept with its text colour', / #t3-header\{color:#333333\}/.test(resume))
  c.check('S3 ja-resume: contact band kept with its text colour', / #contact\{color:#333333\}/.test(resume))
  c.check(
    'S3 ja-rights: Ended status mixed toward the text colour under a light system',
    /\.text-danger\{color:color-mix\(in srgb, var\(--ds-c-danger\) 75%, var\(--ds-c-fg\)\)!important\}/.test(
      css('joomla-ja-rights', 'motherduck')
    )
  )
  c.check(
    'S3 ja-sensei: kept topbar keeps its grey',
    / \.t3-topbar\{color:#69747f\}/.test(css('joomla-ja-sensei', 'apple'))
  )
  const seven = css('joomla-ja-seven', 'moxie')
  c.check(
    'S3 ja-seven: dark buttons label in the page colour',
    /\.btn-dark[^{]*\{color:var\(--ds-c-bg\)!important/.test(seven)
  )
  c.check(
    'S3 ja-seven: glow tinted under a dark system',
    /\.color-decor\{background-color:color-mix/.test(seven)
  )
  c.check(
    'S3 ja-seven: no glow tint under a light system',
    !/\.color-decor\{/.test(css('joomla-ja-seven', 'apple'))
  )
  c.check(
    'S3 ja-smallbiz: accent panel text takes the accent text',
    /\.features-item\.bg-primary[^{]*\{color:var\(--ds-c-accent-on\)/.test(
      css('joomla-ja-smallbiz', 'motherduck')
    )
  )
  c.check(
    'S3 ja-social-ii: testimonial takes the system text',
    /\.testimonial-text[^{]*\{color:var\(--ds-c-fg\)!important/.test(css('joomla-ja-social-ii', 'toggl'))
  )
} finally {
  rmSync(tmp, { recursive: true, force: true })
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
  execFileSync(
    'gh',
    ['release', 'view', 'quickstart/ja-social-ii/j6', '-R', 'JoomlArt-Products/ja-products'],
    {
      stdio: 'ignore'
    }
  )
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-rm4-flow-'))
const NAME = 'reg-rm4'
try {
  const up = run(
    process.execPath,
    [
      join(LIB, 'scripts/stand.mjs'),
      'up',
      'quickstart/ja-social-ii/j6',
      '--port',
      '52738',
      '--name',
      NAME,
      '--version',
      '1.0.2'
    ],
    { timeoutS: 1500 }
  )
  let st = null
  try {
    st = JSON.parse(up.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S4 stand up (ja-social-ii 1.0.2)', !!st, up.stderr.slice(-400))
  if (st) {
    const prefix = JSON.parse(readFileSync(join(st.dir, 'dl/manifest.json'), 'utf8')).prefix ?? 'tr_'
    const flow = (args) =>
      run(
        process.execPath,
        [
          join(LIB, 'scripts/flow.mjs'),
          '--cms',
          'joomla',
          '--template',
          'joomla-ja-social-ii',
          '--site',
          st.site,
          '--cdp',
          '9742',
          ...args
        ],
        {
          timeoutS: 1500
        }
      )
    flow(['--out', join(work, 'baseline'), '--snap'])
    flow([
      '--joomla-db',
      st.db,
      '--joomla-prefix',
      prefix,
      '--joomla-login',
      'site',
      '--out',
      join(work, 'final'),
      '--baseline',
      join(work, 'baseline/default.json'),
      ...Object.values(SYSTEMS)
    ])
    let f = null
    try {
      f = JSON.parse(readFileSync(join(work, 'final/flow.json'), 'utf8'))
    } catch {}
    c.check('S4 flow ran', !!f?.verdicts, null)
    if (f?.verdicts) {
      c.eq('S4 verdicts passing', `${f.verdicts.filter((v) => v.pass).length}/${f.verdicts.length}`, '12/12')
      const sys = f.verdicts.filter((v) => v.kind === 'system')
      c.check(
        'S4 no text under 4.5:1 worse than the template’s own',
        sys.every((v) => v.contrast.every((x) => !x.regressed)),
        sys.flatMap((v) =>
          v.contrast.filter((x) => x.regressed).map((x) => `${v.label}/${v.vw}:${x.name} ${x.ratio}`)
        )
      )
      c.check(
        'S4 every contrast kind sampled in every view',
        sys.every((v) => v.contrast.length >= 6 && v.contrast.every((x) => x.measured > 0)),
        sys.map((v) => v.contrast.map((x) => `${x.name}:${x.measured}`).join(' '))
      )
      c.check(
        'S4 kept bands unchanged',
        sys.every((v) => !v.kept || v.kept.n === 0),
        sys.map((v) => v.kept?.n)
      )
      c.check(
        'S4 at least half the page follows',
        sys.every((v) => (v.follows?.rate ?? 0) >= 0.5),
        sys.map((v) => v.follows?.rate)
      )
    }
  }
} finally {
  run(process.execPath, [join(LIB, 'scripts/stand.mjs'), 'down', '--name', NAME], { timeoutS: 300 })
  rmSync(work, { recursive: true, force: true })
}
c.done()
