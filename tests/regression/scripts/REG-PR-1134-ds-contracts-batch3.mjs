/**
 * REG-PR-1134-ds-contracts-batch3: eleven JA Joomla quickstarts that had no slot contract (batch 3,
 * 11/10/2026) carry one, and the five marked ready wear a design system as measured:
 *   S1 the library's tests (src/release-manifest.mjs reads a release that publishes only its switch);
 *   S2 the contracts: five ready, the five left not ready ready since round 2, JA Intranet (absent in batch 3:
 *      its release answered 500 on Joomla 6) ready since its repaired re-release (REG-PR-1134-ds-contracts-intranet); JA Justitia reads the slot through T4's style-template placeholders
 *      (t4Placeholders; its generated-sheet copy, t4SiteCss, was lost whenever T4 wrote the sheet again), JA Good is
 *      measured on a content page (measuredPage); every ready one wears from 1.0.1 (minVersion);
 *   S3 tracy-web's door finds them: ja_focus → joomla-ja-focus, ja_gamex → joomla-ja-gamex (TEMPLATE_NOT_READY until round 2),
 *      ja_intranet → joomla-ja-intranet (TEMPLATE_HAS_NO_SLOT until its repaired re-release);
 *   S4 two releases through pass-joomla.mjs: ja-focus (an installer zip with no manifest.json and no
 *      tch contract — the switch-only path) and ja-justitia (t4Placeholders) — controls 0, no text worse
 *      than the template's own, at least 60% of the page follows.
 * No model reads anything. S4 needs Docker, the fleet's Joomla image, Chrome and read access to
 * JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
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
  nodeTest(
    ['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs', 'test/release-manifest.test.mjs'],
    { cwd: 'packages/design/tracy-ds-slot' }
  )
)

// S2
const READY = ['ja-focus', 'ja-good', 'ja-healthcare', 'ja-insight', 'ja-justitia']
// Every template batch 3 left not ready was made ready in round 2: JA Fresco in r2b
// (REG-PR-1134-ds-contracts-r2b); JA Gamex, Helple, Kidscorner and Landscape in r2c
// (REG-PR-1134-ds-contracts-r2c). Each stays checked here as ready, so the case still names them
const ROUND2 = ['ja-fresco', 'ja-gamex', 'ja-helple', 'ja-kidscorner', 'ja-landscape']
for (const s of ROUND2) c.eq(`S2 ${s} became ready in round 2`, loadContract(`joomla-${s}`).ready, true)
for (const s of READY) {
  const k = loadContract(`joomla-${s}`)
  c.eq(`S2 ${s} wears from 1.0.1`, k.minVersion?.[`quickstart/${s}/j6`], '1.0.1')
  c.eq(`S2 ${s} is ready`, k.ready, true)
  c.check(`S2 ${s} names its evidence`, /ds-contracts-batch3-2026-10-11/.test(k.readyNote ?? ''), k.readyNote)
}
// JA Intranet had none in batch 3 (1.0.0 answers 500 on Joomla 6); its repaired 1.0.1 carries one
// (REG-PR-1134-ds-contracts-intranet)
c.eq('S2 JA Intranet is ready since its repaired re-release', loadContract('joomla-ja-intranet').ready, true)
// batch 3 shipped t4SiteCss (T4's generated sheet tokenized); a site regenerating that sheet lost it,
// so the contract reads T4's style-template placeholders instead (11/10/2026, regeneration-checked)
c.check(
  'S2 JA Justitia no longer relies on T4’s generated sheet',
  !loadContract('joomla-ja-justitia').t4SiteCss
)
c.eq(
  'S2 JA Justitia reads the slot through T4’s placeholders',
  loadContract('joomla-ja-justitia').t4Placeholders?.__body_text_color,
  'fg'
)
c.check(
  'S2 JA Justitia is regeneration-checked',
  /regeneration-checked/.test(loadContract('joomla-ja-justitia').readyNote)
)
c.eq(
  'S2 JA Good is measured on a content page',
  loadContract('joomla-ja-good').measuredPage,
  '/index.php/home-layouts/home-news'
)

// S3
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
const door = (template) => contractFor(templateKeyOf({ platform: 'joomla', template }))
c.eq('S3 ja_focus', JSON.stringify(door('ja_focus')), JSON.stringify({ contract: 'joomla-ja-focus' }))
c.eq(
  'S3 ja_justitia',
  JSON.stringify(door('ja_justitia')),
  JSON.stringify({ contract: 'joomla-ja-justitia' })
)
const site = (version) => ({ key: 'quickstart/ja-focus/j6', version })
c.eq(
  'S3 ja_focus 1.0.1 (tokenized re-release)',
  JSON.stringify(contractFor(templateKeyOf({ platform: 'joomla', template: 'ja_focus' }), site('1.0.1'))),
  JSON.stringify({ contract: 'joomla-ja-focus' })
)
c.eq(
  'S3 ja_focus 1.0.0 (as first released) needs the update',
  contractFor(templateKeyOf({ platform: 'joomla', template: 'ja_focus' }), site('1.0.0')).reason,
  'TEMPLATE_NEEDS_UPDATE'
)
// no batch-3 template is left not ready (ja_fresco, then ja_gamex, until round 2): ja_gamex finds its contract
c.eq('S3 ja_gamex', JSON.stringify(door('ja_gamex')), JSON.stringify({ contract: 'joomla-ja-gamex' }))
c.eq(
  'S3 ja_intranet',
  JSON.stringify(door('ja_intranet')),
  JSON.stringify({ contract: 'joomla-ja-intranet' })
)

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
  execFileSync('gh', ['release', 'view', 'quickstart/ja-focus/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsb3-'))
try {
  for (const slug of ['ja-focus', 'ja-justitia']) {
    const r = run(
      process.execPath,
      [join(LIB, 'scripts/pass-joomla.mjs'), slug, '--port', '52733', '--cdp', '9741', '--evidence', work],
      { timeoutS: 1800 }
    )
    let s = null
    try {
      s = JSON.parse(r.stdout.trim().split('\n').pop())
    } catch {}
    c.check(`S4 ${slug}: ran`, !!s, r.stderr.slice(-400))
    if (!s) continue
    c.eq(`S4 ${slug}: controls (differences against the release)`, s.controls.join(','), '0,0,0,0')
    c.check(
      `S4 ${slug}: no text under 4.5:1 worse than the template’s own`,
      s.lowContrast.length === 0,
      s.lowContrast
    )
    c.check(
      `S4 ${slug}: the page follows each system (≥ 0.6)`,
      s.follows.every((x) => x >= 0.6),
      s.follows
    )
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
