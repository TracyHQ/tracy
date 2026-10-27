/**
 * REG-PR-1005-ja-kinetic-wp7-theme-name-1-1-8: wp-ja-kinetic 1.1.8 is listed in WordPress as "WP Kinetic" and nothing else changed.
 * S1: the shipped theme and its overlay read `Theme Name: WP Kinetic`, and the shipped theme reads
 * `Version: 1.1.8`. S2: the release's recorded site sweep was taken on the released zip and passes
 * every check.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-kinetic-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

c.eq(
  'S1: shipped style.css lines reading "Theme Name: WP Kinetic"',
  countLines(`${THEME}/src/wp-ja-kinetic/style.css`, 'Theme Name: WP Kinetic'),
  1
)
c.eq(
  'S1: overlay style.css lines reading "Theme Name: WP Kinetic"',
  countLines(`${THEME}/overlays/wp-ja-kinetic/style.css`, 'Theme Name: WP Kinetic'),
  1
)
c.eq(
  'S1: shipped style.css lines reading "Version: 1.1.8"',
  countLines(`${THEME}/src/wp-ja-kinetic/style.css`, 'Version: 1.1.8'),
  1
)

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-kinetic-1.1.8.zip')) ?? ''
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
