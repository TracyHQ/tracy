/**
 * REG-PR-991-ja-nova-wp7-layout-fixes-1-1-8: wp-ja-nova 1.1.8 carries the layout fixes measured against the Joomla source.
 * S1: the shipped theme and its overlay are 1.1.8 and both hold each rule this release added
 * (article and author titles, article and project heads, stat title, related band, video-intro
 * pull-up, position row, expertise boxes and pills). S2: the release's recorded site sweep ran on
 * the shipped zip, passes every check, and the baseline it compares with (1.1.7) failed `heights`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-nova-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const flat = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')

c.eq(
  'S1: style.css lines reading "Version: 1.1.8"',
  countLines(`${THEME}/src/wp-ja-nova/style.css`, 'Version: 1.1.8'),
  1
)

const RULES = [
  ['sets the article title to 32px', /body\.tracy \.jn-article__title \{[^}]*font-size: 32px;/],
  [
    'sets the author name to 24px up to 991.98px',
    /@media \(max-width: 991\.98px\) \{ body\.tracy \.jn-author__name a \{ font-size: 24px; line-height: 24px; \} \}/
  ],
  [
    'holds the stat title at 24px below 576px',
    /@media \(max-width: 575\.98px\) \{ body\.tracy \.jn-stat__title \{ min-height: 24px; \} \}/
  ],
  [
    'keeps the project tag row on one nowrap line below 576px',
    /body\.tracy \.jn-project \.jn-article__tags \{ flex-wrap: nowrap; justify-content: center;/
  ],
  [
    'pulls the feature up under the video intro by 16px',
    /body\.tracy \.jn-video-intro \+ \.jn-sec\.jn-feature \{ margin-top: -16px; padding-top: 16px; \}/
  ],
  ['lets the position row shrink and wrap', /body\.tracy \.jn-position__info \{ display: flex; \}/],
  [
    'gives the position title the source line box',
    /body\.tracy \.jn-position__title \{ min-height: 27px; \}/
  ],
  [
    'pads the expertise boxes 32px 24px below 576px',
    /@media \(max-width: 575\.98px\) \{ body\.tracy \.jn-expertise__box \{ padding: 32px 24px; \} \}/
  ],
  [
    'spaces the expertise pills with 8px margins at every width',
    /body\.tracy \.jn-expertise__list \{ gap: 0 8px; \} body\.tracy \.jn-expertise__list li \{ margin-top: 8px; \}/
  ]
]
for (const [name, file] of [
  ['shipped theme', `${THEME}/src/wp-ja-nova/assets/css/wp-ja-nova.css`],
  ['overlay', `${THEME}/overlays/wp-ja-nova/assets/css/wp-ja-nova.css`]
]) {
  const css = flat(read(file))
  for (const [what, re] of RULES) c.check(`S1: ${name} ${what}`, re.test(css))
}

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-nova-1.1.8.zip')) ?? ''
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
c.eq('S2: baseline version', m.baseline.version, '1.1.7')
c.eq('S2: baseline heights passed', m.baseline.checks.find((k) => k.id === 'heights')?.pass, false)
c.done()
