/**
 * REG-PR-1007-ja-morgan-wp7-theme-name-1-1-10: wp-ja-morgan 1.1.10 is listed in WordPress as "WP Morgan" and the release records a passing sweep.
 * S1: the shipped theme's style.css and the overlay's style.css read `Theme Name: WP Morgan`; the shipped
 * style.css reads `Version: 1.1.10` and the overlay's theme.config.json carries the same version (the
 * overlay's own style.css `Version` line is not the version). S2: the release's recorded site sweep ran on
 * the shipped zip (its sha256 equals the SHA256SUMS line) and passes every check.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-morgan-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

for (const [name, dir] of [
  ['shipped theme', `${THEME}/src/wp-ja-morgan`],
  ['overlay', `${THEME}/overlays/wp-ja-morgan`]
]) {
  c.eq(
    `S1: ${name} style.css lines reading "Theme Name: WP Morgan"`,
    countLines(`${dir}/style.css`, 'Theme Name: WP Morgan'),
    1
  )
}
c.eq(
  'S1: shipped style.css lines reading "Version: 1.1.10"',
  countLines(`${THEME}/src/wp-ja-morgan/style.css`, 'Version: 1.1.10'),
  1
)
c.eq(
  'S1: overlay theme.config.json version',
  JSON.parse(read(`${THEME}/overlays/wp-ja-morgan/theme.config.json`)).version,
  '1.1.10'
)

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-morgan-1.1.10.zip')) ?? ''
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
