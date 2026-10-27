/**
 * REG-PR-989-ja-morgan-wp7-layout-fixes-1-1-9: wp-ja-morgan 1.1.9 carries the narrow-width layout fixes measured against the Joomla source.
 * S1: the shipped theme and its overlay are 1.1.9 and both hold the rules this release added (four
 * equal footer columns below 1200 px, xs spacing of the sidebar modules, the 21 px tag chip, the
 * 93.75 px feature icon box on phones, no row gap between footer rows). S2: the release's recorded
 * site sweep ran on the shipped zip, passes every check, and the baseline it compares with (1.1.8)
 * failed `heights`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-morgan-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const flat = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')

c.eq(
  'S1: style.css lines reading "Version: 1.1.9"',
  countLines(`${THEME}/src/wp-ja-morgan/style.css`, 'Version: 1.1.9'),
  1
)
for (const [name, file] of [
  ['shipped theme', `${THEME}/src/wp-ja-morgan/assets/css/wp-ja-morgan.css`],
  ['overlay', `${THEME}/overlays/wp-ja-morgan/assets/css/wp-ja-morgan.css`]
]) {
  const css = flat(read(file))
  c.check(
    `S1: ${name} splits the Home Style 3 footer 3/4/3/2 only from 1200 px`,
    /\.t3-footnav:is\(\.jm-foot-hs3, \.jm-foot-hs4\) \{[^}]*grid-template-columns: repeat\(4, 1fr\);/.test(
      css
    ) &&
      /@media \(min-width: 1200px\) \{ \.t3-footnav\.jm-foot-hs3 \{ grid-template-columns: 3fr 4fr 3fr 2fr; \} \}/.test(
        css
      )
  )
  c.check(
    `S1: ${name} uses the xs sidebar module spacing below 768 px`,
    /@media \(max-width: 767px\) \{ \.t3-sidebar \.t3-module \{ margin-bottom: 25px; \} \.t3-sidebar \.module-title \{ margin-bottom: 12\.5px; \} \}/.test(
      css
    )
  )
  c.check(
    `S1: ${name} draws the tag chip as the source's 21 px box`,
    /display: inline-block; vertical-align: top; box-sizing: border-box; height: 21px; padding: 0 7\.2px; line-height: 21px;/.test(
      css
    )
  )
  c.check(
    `S1: ${name} fixes the feature icon box at 93.75 px on phones`,
    /@media \(max-width: 767px\) \{ \.acm-features\.style-2 \.font-icon \{ height: 93\.75px; \} \}/.test(css)
  )
  c.check(`S1: ${name} leaves no row gap between footer rows`, /\.t3-footnav \{ row-gap: 0; \}/.test(css))
}

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-morgan-1.1.9.zip')) ?? ''
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
c.eq('S2: baseline version', m.baseline.version, '1.1.8')
c.eq('S2: baseline heights passed', m.baseline.checks.find((k) => k.id === 'heights')?.pass, false)
c.done()
