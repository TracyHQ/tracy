/**
 * REG-PR-1134-ds-remeasure-1: fifteen JA Joomla j6 slot contracts made ready in rounds 1-3 (aiga, alpha,
 * alumni, artsy, athena, beauty, blockk, boxing, campaign, candidate, cityguide, civica, coach, colab,
 * comics) re-measured on their 1.0.1 builds with the probe as it stands (11/10/2026): every visible
 * heading and text judged element by element (contrast kinds `heading` and `text` over the whole body),
 * the paint stack, pictures, carousels held still. What the re-measure found and fixed:
 *   - JA Alpha: the client-story counter card painted #3F3836 with white text (literals) follows as the
 *     page's inverse (followRules);
 *   - JA Alumni: the signature picture (name and title drawn in it) is inverted on a dark system
 *     (inkImages); the phone header bar painted with the accent under a white logo is kept; the Facebook
 *     pill's icon takes the accent's own text colour;
 *   - JA Athena: the call-to-action panel on the accent writes its text in the accent's own text colour
 *     (selectors.onAccent);
 *   - JA Beauty: the active menu item on the dark header takes the accent tinted toward white under a
 *     light system (sideRules.light);
 *   - JA Campaign: the numbered steps on the accent take its own text colour, the phone logo strip
 *     the page ground (followRules);
 *   - JA Colab: the navy follow-us strip is kept with its own icon colours (keepScopes, keepColors);
 *   - JA Blockk, JA Comics: the closed header search, whose only paint is a dark magnifier drawn as the
 *     input's background picture, is inverted on a dark system (sideRules.dark); JA Comics' dark wordmark
 *     too (inkImages);
 *   - flow.mjs: a ::before/::after painted through a mask is a shape, not a ground (JA Alpha's section
 *     ornament), and a text's own fill is its ground before whatever lies beneath it (JA Candidate's hero
 *     button read on the slide layer, #000).
 *   S1 the library's tests; S2 the contracts and the module sheets they make; S3 tracy-web's door at 1.0.1
 *   and 1.0.0; S4 the committed measures (summary.json per template). No Docker: the measures are in the
 *   evidence, taken one stand at a time from each 1.0.1 zip.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const EV = 'tasks/evidence/ds-remeasure-1-2026-10-11/templates'
const imp = (p) => import(pathToFileURL(join(LIB, p)).href)
const { contractBase, loadContract, loadProfile } = await imp('src/library.mjs')
const { joomlaSlot } = await imp('src/joomla.mjs')
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs', 'test/contracts.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2
const SLUGS = [
  'ja-aiga',
  'ja-alpha',
  'ja-alumni',
  'ja-artsy',
  'ja-athena',
  'ja-beauty',
  'ja-blockk',
  'ja-boxing',
  'ja-campaign',
  'ja-candidate',
  'ja-cityguide',
  'ja-civica',
  'ja-coach',
  'ja-colab',
  'ja-comics'
]
const k = Object.fromEntries(SLUGS.map((s) => [s, loadContract(`joomla-${s}`)]))
for (const s of SLUGS) {
  c.eq(`S2 ${s} is ready`, k[s].ready, true)
  c.eq(`S2 ${s} wears from 1.0.1`, k[s].minVersion?.[`quickstart/${s}/j6`], '1.0.1')
  c.check(`S2 ${s} names the re-measure`, String(k[s].readyNote).includes(`${EV}/${s}-j6`), k[s].readyNote)
  c.check(
    `S2 ${s} judges every heading`,
    (k[s].contrast?.heading ?? '').startsWith('body :is(h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4)'),
    k[s].contrast?.heading
  )
  c.check(
    `S2 ${s} judges every text`,
    (k[s].contrast?.text ?? '').startsWith(
      'body :is(p, li, a, span, small, label, td, dd, blockquote, figcaption)'
    ),
    k[s].contrast?.text
  )
}
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const MOTHERDUCK = 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'
const sheet = (s, id = MOXIE) => joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, k[s]), k[s]).css ?? ''
const has = (css, ...parts) => parts.every((p) => css.includes(p))
// a followRules rule as emitted: the selector, then the kept bands it stops at, then its declarations
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const rule = (css, sel, decls) => new RegExp(`${esc(sel)}(:not\\([^{]*\\))?\\{${esc(decls)}\\}`).test(css)

const alpha = sheet('ja-alpha')
c.check(
  'S2 ja-alpha dark counter card follows as the inverse',
  rule(alpha, '.features-item:nth-child(2n)', 'background-color:var(--ds-c-fg);color:var(--ds-c-bg)') &&
    rule(alpha, ':is(.ft-num, .ft-title, .ft-description)', 'color:var(--ds-c-bg)!important'),
  ''
)
const alumni = sheet('ja-alumni')
c.check(
  'S2 ja-alumni signature inverted on a dark system',
  has(alumni, 'img[src*="hero/Sign.png"]', 'filter:invert(1) hue-rotate(180deg)'),
  ''
)
c.check(
  'S2 ja-alumni phone header kept',
  k['ja-alumni'].keepScopes.includes('.t3-header'),
  k['ja-alumni'].keepScopes
)
c.check(
  'S2 ja-alumni Facebook icon on the accent',
  rule(alumni, '.facebook-block i', 'color:var(--ds-c-accent-on)'),
  ''
)
c.check(
  'S2 ja-athena call-to-action panel text on the accent',
  has(sheet('ja-athena'), '.acm-cta.style-1 .cta-inner', 'color:var(--ds-c-accent-on)'),
  ''
)
const beautyLight = sheet('ja-beauty', MOTHERDUCK)
const ACTIVE = 'div.t4-megamenu .navbar-nav li.nav-item.active a.nav-link'
c.check(
  'S2 ja-beauty active menu item tinted toward white under a light system',
  has(beautyLight, ACTIVE, 'color-mix(in srgb, var(--ds-c-accent) 55%, #fff)!important'),
  ''
)
c.check('S2 ja-beauty dark systems leave it to accent-text', !sheet('ja-beauty').includes(ACTIVE), '')
const campaign = sheet('ja-campaign', MOTHERDUCK)
c.check(
  'S2 ja-campaign numbered steps take the accent text',
  rule(campaign, '.bg-primary.text-white.number', 'color:var(--ds-c-accent-on)!important'),
  ''
)
c.check(
  'S2 ja-campaign phone logo strip takes the page ground',
  rule(campaign, '#t4-header .t4-brand', 'background-color:var(--ds-c-bg)'),
  ''
)
c.check(
  'S2 ja-colab follow-us strip kept with its own text colour',
  k['ja-colab'].keepScopes.includes('.horizontal-nav') &&
    k['ja-colab'].keepColors?.['.horizontal-nav'] === 'rgb(33, 37, 41)',
  k['ja-colab'].keepColors
)
const SEARCH_FILTER = 'filter:invert(1) hue-rotate(180deg)'
c.check(
  'S2 ja-blockk closed header search inverted on a dark system, not on a light one',
  has(
    sheet('ja-blockk'),
    '.head-search:not(.search-expanded) :is(.form-control, .inputbox, .search-query):not(:focus)',
    SEARCH_FILTER
  ) && !sheet('ja-blockk', MOTHERDUCK).includes('.head-search:not(.search-expanded)'),
  ''
)
c.check(
  'S2 ja-comics closed header search inverted on a dark system, not on a light one',
  has(
    sheet('ja-comics'),
    '.t4-header :is(.search, .form-search) :is(.form-control, .inputbox, .search-query):not(:focus)',
    SEARCH_FILTER
  ) && !sheet('ja-comics', MOTHERDUCK).includes(':is(.search, .form-search)'),
  ''
)
c.check(
  'S2 ja-comics wordmark inverted on a dark system',
  has(sheet('ja-comics'), '.navbar-brand img', 'filter:invert(1) hue-rotate(180deg)'),
  ''
)
const flowSrc = readFileSync(join(LIB, 'scripts/flow.mjs'), 'utf8')
c.check(
  'S2 flow.mjs reads a masked pseudo as a shape',
  flowSrc.includes('const masked = (cs)') && flowSrc.includes('!masked(ps)'),
  ''
)
c.check(
  'S2 flow.mjs reads a text’s own fill first',
  flowSrc.includes('stack.slice(stack[at] === el ? at : at + 1)'),
  ''
)

// S3
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
for (const s of SLUGS) {
  const key = templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') })
  c.eq(
    `S3 ${s} at 1.0.1`,
    JSON.stringify(contractFor(key, { key: `quickstart/${s}/j6`, version: '1.0.1' })),
    JSON.stringify({ contract: `joomla-${s}` })
  )
  c.eq(
    `S3 ${s} at 1.0.0 needs the update`,
    contractFor(key, { key: `quickstart/${s}/j6`, version: '1.0.0' }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
}

// S4: the measures behind each readyNote
for (const s of SLUGS) {
  const f = join(ROOT, EV, `${s}-j6/summary.json`)
  if (!existsSync(f)) {
    c.check(`S4 ${s} has its measure`, false, f)
    continue
  }
  const m = JSON.parse(readFileSync(f, 'utf8'))
  c.eq(`S4 ${s} controls 0`, JSON.stringify(m.controls), '[0,0,0,0]')
  c.eq(`S4 ${s} no text worse than the template's`, m.regressed.length, 0)
  c.eq(`S4 ${s} every kind sampled`, m.missingKinds.length, 0)
  c.check(`S4 ${s} at least half the page follows`, Math.min(...m.follows) >= 0.5, m.follows)
  c.check(
    `S4 ${s} fails only on page-role misses`,
    m.failed.length === 0 ||
      m.misses.every((x) => /^(page\.backgroundColor|button-primary\.(backgroundColor|color))=/.test(x)),
    m.misses
  )
}
c.done()
