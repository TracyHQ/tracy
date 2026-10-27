/**
 * REG-PR-1003-ja-nova-wp7-theme-name-1-1-9: wp-ja-nova 1.1.9 is listed in WordPress as "WP Nova"; nothing else about the theme changes.
 * S1: the shipped theme's style.css and the overlay's style.css both read `Theme Name: WP Nova`, the shipped
 * style.css reads `Version: 1.1.9` and the overlay's theme.config.json carries "version": "1.1.9".
 * S2: the release's recorded site sweep ran on the released zip (its sha256 is the SHA256SUMS line) and
 * passes every check.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-nova-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

c.eq(
  'S1: shipped style.css lines reading "Theme Name: WP Nova"',
  countLines(`${THEME}/src/wp-ja-nova/style.css`, 'Theme Name: WP Nova'),
  1
)
c.eq(
  'S1: overlay style.css lines reading "Theme Name: WP Nova"',
  countLines(`${THEME}/overlays/wp-ja-nova/style.css`, 'Theme Name: WP Nova'),
  1
)
c.eq(
  'S1: shipped style.css lines reading "Version: 1.1.9"',
  countLines(`${THEME}/src/wp-ja-nova/style.css`, 'Version: 1.1.9'),
  1
)
c.eq(
  'S1: overlay theme.config.json version',
  JSON.parse(read(`${THEME}/overlays/wp-ja-nova/theme.config.json`)).version,
  '1.1.9'
)

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-nova-1.1.9.zip')) ?? ''
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
