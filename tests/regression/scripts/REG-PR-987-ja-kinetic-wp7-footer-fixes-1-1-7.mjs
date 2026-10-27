/**
 * REG-PR-987-ja-kinetic-wp7-footer-fixes-1-1-7: wp-ja-kinetic 1.1.7 carries the two footer fixes measured against the Joomla source.
 * S1: the shipped theme and its overlay are 1.1.7 and both keep footer titles and links on one
 * line with content-sized columns and give the footer link rows 9.15px of block padding instead of
 * a 24px line. S2: the release's recorded site sweep ran on the shipped zip, passes every check,
 * and the baseline it compares with (1.1.6) failed `heights`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-kinetic-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const flat = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')

c.eq(
  'S1: style.css lines reading "Version: 1.1.7"',
  countLines(`${THEME}/src/wp-ja-kinetic/style.css`, 'Version: 1.1.7'),
  1
)
for (const [name, file] of [
  ['shipped theme', `${THEME}/src/wp-ja-kinetic/assets/css/wp-ja-kinetic.css`],
  ['overlay', `${THEME}/overlays/wp-ja-kinetic/assets/css/wp-ja-kinetic.css`]
]) {
  const css = flat(read(file))
  c.check(
    `S1: ${name} keeps footer titles and links on one line`,
    /\.tracy-footer__title, \.tracy-footer__columns \.wp-block-navigation-item__content, \.tracy-footer__columns \.tracy-footer__links a \{ white-space: nowrap; \}/.test(
      css
    )
  )
  c.check(
    `S1: ${name} sizes the three footer columns to their content`,
    /body \.tracy-footer__columns \{ grid-template-columns: repeat\(3, minmax\(min-content, 1fr\)\); \}/.test(
      css
    )
  )
  c.check(`S1: ${name} pads the footer link rows 9.15px`, /padding-block: 9\.15px;/.test(css))
}

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-kinetic-1.1.7.zip')) ?? ''
c.eq('S2: the measure was taken by', m.tool, 'site-sweep.mjs')
c.eq('S2: the measured zip is the released zip', m.artifact.themeZipSha256, zipLine.split(/\s+/)[0])
c.eq('S2: checks passed', `${m.passed}/${m.total}`, '11/11')
c.eq(
  'S2: checks not passing',
  m.checks
    .filter((k) => k.pass !== true)
    .map((k) => k.id)
    .join(','),
  ''
)
c.eq('S2: heights defects', m.checks.find((k) => k.id === 'heights')?.defects, 0)
c.eq('S2: baseline version', m.baseline.version, '1.1.6')
c.eq('S2: baseline heights passed', m.baseline.checks.find((k) => k.id === 'heights')?.pass, false)
c.done()
