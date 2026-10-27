/**
 * REG-PR-1008-ja-essence-wp7-layout-fixes-1-0-8: wp-ja-essence 1.0.8 carries the layout rules measured against the Joomla source.
 * S1: the shipped theme and its overlay are 1.0.8 and both hold four of the rules (author cards'
 * 260px photo, the footer inner box released at 1199px, the two-column "more" cards below 992px,
 * the gallery slider's 24px margin). S2: the release's recorded site sweep ran on the shipped zip,
 * passes every check, and the baseline it compares with (1.0.7) failed `heights` and `forms`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-essence-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const flat = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')

c.eq(
  'S1: style.css lines reading "Version: 1.0.8"',
  countLines(`${THEME}/src/wp-ja-essence/style.css`, 'Version: 1.0.8'),
  1
)
for (const [name, dir] of [
  ['shipped theme', `${THEME}/src/wp-ja-essence/assets/css`],
  ['overlay', `${THEME}/overlays/wp-ja-essence/assets/css`]
]) {
  const category = flat(read(`${dir}/je-category.css`))
  const detail = flat(read(`${dir}/je-detail.css`))
  c.check(
    `S1: ${name} draws the author photo 260px high`,
    /\.je-authors \.je-author__photo \{ height: 260px; aspect-ratio: auto; \}/.test(category)
  )
  c.check(
    `S1: ${name} releases the footer inner box up to 1199px`,
    /@media \(max-width: 1199px\) \{ \.je-footer__inner \{ max-width: none; margin-inline: 0; \} \}/.test(
      detail
    )
  )
  c.check(
    `S1: ${name} lays the more-reading cards in two columns below 992px`,
    /@media \(max-width: 991px\) \{ \.je-more__items--cards \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important; \} \}/.test(
      detail
    )
  )
  c.check(
    `S1: ${name} draws the hit-counter eye 15px wide`,
    /\.je-hits__icon \{ flex: 0 0 auto; width: 15px; height: 14px;/.test(detail)
  )
  c.check(
    `S1: ${name} gives the gallery slider a 24px bottom margin`,
    /\.je-gslider \{ margin: 0 0 24px; \}/.test(detail)
  )
}

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-essence-1.0.8.zip')) ?? ''
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
c.eq('S2: baseline version', m.baseline.version, '1.0.7')
c.eq('S2: baseline heights passed', m.baseline.checks.find((k) => k.id === 'heights')?.pass, false)
c.eq('S2: baseline forms passed', m.baseline.checks.find((k) => k.id === 'forms')?.pass, false)
c.done()
