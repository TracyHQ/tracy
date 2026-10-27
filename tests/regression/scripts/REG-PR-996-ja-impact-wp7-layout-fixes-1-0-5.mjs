/**
 * REG-PR-996-ja-impact-wp7-layout-fixes-1-0-5: wp-ja-impact 1.0.5 carries the layout fixes measured against the Joomla source.
 * S1: the shipped theme and its overlay are 1.0.5 and both hold the rules this release added (the
 * donations footer columns, the 94 px header bar from 576 px, the contact card spacing, the
 * donations pager counter, the author list gap, the typography demo margins). S2: the release's
 * recorded site sweep ran on the shipped zip, passes every check, and the baseline it compares
 * with (1.0.4) failed `heights`, `overflow`, `background` and `fixed-widgets`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, countLines, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const REL = 'tasks/ja-impact-wp7/release'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const flat = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')

c.eq(
  'S1: style.css lines reading "Version: 1.0.5"',
  countLines(`${THEME}/src/wp-ja-impact/style.css`, 'Version: 1.0.5'),
  1
)
const RULES = [
  [
    'donations footer columns are a quarter wide from 576 px',
    /@media \(min-width: 576px\) and \(max-width: 767\.98px\) \{ body\.tracy\.jim-route-donations \.jim-footer__col:not\(\.jim-footer__col--about\) \{ flex: 0 0 25%; \} \}/
  ],
  [
    'header bar is 94 px high with a 160 px logo from 576 to 991 px',
    /body\.tracy \.jim-header__row \{ min-height: 94px; padding-block: 24px; align-items: flex-start; \} body\.tracy \.jim-logo img \{ width: 160px; height: 46\.2px; \}/
  ],
  [
    'contact card titles sit 32 px above their content',
    /body\.tracy \.jim-contactpage__card-title \{ margin-bottom: 32px; \}/
  ],
  [
    'contact side cards stack with no gap under 992 px',
    /@media \(max-width: 991\.98px\) \{ body\.tracy \.jim-contactpage \{ gap: 0; \}/
  ],
  [
    'author list rows are 32 px apart from 768 to 991 px',
    /body\.tracy \.jim-gb--authors \.jim-author-grid \{ row-gap: 32px; \}/
  ],
  [
    'donations pager counter sits 64 px under the last card from 992 px',
    /@media \(min-width: 992px\) \{ body\.tracy\.jim-route-donations \.jim-pager-host \{ margin: 0 0 7px; \} \}/
  ],
  [
    'typography demo blocks take no block gap above',
    /body\.tracy \.jim-prose > \.t4-typo-example \{ margin-block-start: 0; \}/
  ]
]
for (const [name, file] of [
  ['shipped theme', `${THEME}/src/wp-ja-impact/assets/css/groups/zz-behaviour.css`],
  ['overlay', `${THEME}/overlays/wp-ja-impact/assets/css/groups/zz-behaviour.css`]
]) {
  const css = flat(read(file))
  for (const [what, re] of RULES) c.check(`S1: ${name}: ${what}`, re.test(css))
}

const m = JSON.parse(read(`${REL}/fix-measure.json`))
const zipLine =
  read(`${REL}/SHA256SUMS`)
    .split('\n')
    .find((l) => l.endsWith('wp-ja-impact-1.0.5.zip')) ?? ''
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
c.eq('S2: baseline version', m.baseline.version, '1.0.4')
c.eq('S2: baseline heights passed', m.baseline.checks.find((k) => k.id === 'heights')?.pass, false)
c.done()
