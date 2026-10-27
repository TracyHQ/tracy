/**
 * REG-PR-1004-ja-vega-wp7-theme-name-1-1-11: wp-ja-vega 1.1.11 is listed in WordPress as "WP Vega".
 * S1: the shipped theme and its overlay both read `Theme Name: WP Vega`; the shipped theme reads
 * `Version: 1.1.11` and the overlay's `theme.config.json` carries version 1.1.11 (the overlay's own
 * style.css Version line is not the version source).
 * S2: the release's recorded site sweep (`fix-measure.json`) was taken on the released zip (its
 * sha256 equals the SHA256SUMS line) and passes every check.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-vega-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

for (const [name, file] of [
  ['shipped theme', `${THEME}/src/wp-ja-vega/style.css`],
  ['overlay', `${THEME}/overlays/wp-ja-vega/style.css`]
]) {
  c.eq(`S1: ${name} lines reading "Theme Name: WP Vega"`, countLines(file, 'Theme Name: WP Vega'), 1)
}
c.eq(
  'S1: shipped theme lines reading "Version: 1.1.11"',
  countLines(`${THEME}/src/wp-ja-vega/style.css`, 'Version: 1.1.11'),
  1
)
c.eq(
  'S1: overlay theme.config.json version',
  JSON.parse(read(`${THEME}/overlays/wp-ja-vega/theme.config.json`)).version,
  '1.1.11'
)

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-vega-1.1.11.zip')) ?? ''
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
c.done()
