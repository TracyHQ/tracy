/**
 * REG-PR-1100-p6-ready-templates-measure-12: the four JA Joomla contracts marked ready that measured
 * below 12/12 on their current releases (10/10/2026) do measure 12/12, because their probes now read
 * what the role means:
 *   - JA Morgan, JA Vega, JA Social II: `body` is the page's running text, not a lead paragraph or a
 *     slider caption whose weight the template sets itself;
 *   - JA Social II: `container` is the page container, not a half-width column of a slide;
 *   - JA Smallbiz: its largest title is section-sized (the home page has no display heading), so it is
 *     probed as a heading, and no bare `h2` rule hands an off-canvas header the display size.
 * S1 reads the contracts; S2 restores each release and wears four systems (pass-joomla.mjs). Needs
 * Docker, the fleet's Joomla image, Chrome and read access to JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cannotRun, checks, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { loadContract } = await import(join(LIB, 'src/library.mjs'))
const c = checks()

// S1: the probes
const morgan = loadContract('joomla-ja-morgan')
const vega = loadContract('joomla-ja-vega')
const social = loadContract('joomla-ja-social-ii')
const smallbiz = loadContract('joomla-ja-smallbiz')
c.eq('S1 JA Morgan body probe', morgan.roles.body, 'div.features-item > p')
c.eq('S1 JA Vega body probe', vega.roles.body, 'div.features-item div.desc')
c.eq('S1 JA Social II body probe', social.roles.body, 'div.features-item > p')
c.eq('S1 JA Social II container probe', social.roles.container, 'div.t3-section > div.container')
c.check(
  'S1 JA Social II container rule names only page containers',
  !social.selectors.container.some((s) => s.includes('features-content')),
  social.selectors.container
)
c.check('S1 JA Smallbiz has no display probe', !('display' in smallbiz.roles), smallbiz.roles)
c.eq('S1 JA Smallbiz heading probe', smallbiz.roles.heading, 'div.title h2')
c.check('S1 JA Smallbiz has no bare display-size rule', !smallbiz.selectors.displaySize, smallbiz.selectors)
for (const [name, k] of [
  ['JA Morgan', morgan],
  ['JA Vega', vega],
  ['JA Social II', social],
  ['JA Smallbiz', smallbiz]
])
  c.eq(`S1 ${name} is offered (ready)`, k.ready, true)

// S2: each release through its pass — 12/12, controls 0, nothing less readable
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
  execFileSync('gh', ['release', 'view', 'quickstart/ja-morgan/j6', '-R', 'JoomlArt-Products/ja-products'], {
    stdio: 'ignore'
  })
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-ready12-'))
try {
  for (const slug of ['ja-morgan', 'ja-vega', 'ja-social-ii', 'ja-smallbiz']) {
    const r = run(
      process.execPath,
      [join(LIB, 'scripts/pass-joomla.mjs'), slug, '--port', '52297', '--cdp', '9511', '--evidence', work],
      { timeoutS: 1800 }
    )
    let s = null
    try {
      s = JSON.parse(r.stdout.trim().split('\n').pop())
    } catch {}
    c.check(`S2 ${slug}: ran`, !!s, r.stderr.slice(-400))
    if (!s) continue
    c.eq(`S2 ${slug}: verdicts`, s.pass, '12/12')
    c.eq(`S2 ${slug}: controls (differences against the release)`, s.controls.join(','), '0,0,0,0')
    c.check(`S2 ${slug}: no text under 4.5:1`, s.lowContrast.length === 0, s.lowContrast)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
