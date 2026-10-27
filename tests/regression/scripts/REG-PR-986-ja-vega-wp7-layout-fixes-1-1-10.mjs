/**
 * REG-PR-986: wp-ja-vega 1.1.10 carries the three layout fixes measured against the Joomla source.
 * S1: the shipped theme and its overlay are 1.1.10 and both hold the three rules (excerpt clamp on
 * service and related cards, the Continue Reading band's 24/32 px, `small` at .875em). S2: the
 * release's recorded site sweep ran on the shipped zip, passes every check, and the baseline it
 * compares with (1.1.9) failed `heights`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-vega-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const flat = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')

c.eq(
  'S1: style.css lines reading "Version: 1.1.10"',
  countLines(`${THEME}/src/wp-ja-vega/style.css`, 'Version: 1.1.10'),
  1
)
for (const [name, file] of [
  ['shipped theme', `${THEME}/src/wp-ja-vega/assets/css/wp-ja-vega.css`],
  ['overlay', `${THEME}/overlays/wp-ja-vega/assets/css/wp-ja-vega.css`]
]) {
  const css = flat(read(file))
  c.check(
    `S1: ${name} clamps service-card and related excerpts to 3 lines`,
    /\.jv-page \.tracy-grid > \.type-page \.wp-block-post-excerpt__excerpt, \.page-template-page-service \.jv-related \.wp-block-post-excerpt__excerpt \{[^}]*-webkit-line-clamp: 3;/.test(
      css
    )
  )
  c.check(
    `S1: ${name} pads the Continue Reading band 24 px from 576 and 32 px from 992`,
    /@media \(min-width: 576px\) \{ :is\(\.page-template-page-article, \.single\) \.jv-related \{ padding-top: 24px; \} \}/.test(
      css
    ) &&
      /@media \(min-width: 992px\) \{ :is\(\.page-template-page-article, \.single\) \.jv-related \{ padding-top: 32px; \} \}/.test(
        css
      )
  )
  c.check(`S1: ${name} sizes small text .875em`, /small, \.small \{ font-size: 0\.875em; \}/.test(css))
}

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-vega-1.1.10.zip')) ?? ''
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
c.eq('S2: baseline version', m.baseline.version, '1.1.9')
c.eq('S2: baseline heights passed', m.baseline.checks.find((k) => k.id === 'heights')?.pass, false)
c.done()
