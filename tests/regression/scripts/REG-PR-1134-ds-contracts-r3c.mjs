/**
 * REG-PR-1134-ds-contracts-r3c: round 3, batch C of the design-system slot contracts (11/10/2026) —
 * JA Beauty, JA Blockk, JA Boxing, JA Campaign (Joomla j6, T4), each measured not ready in round 1:
 *   S1 the library's tests;
 *   S2 the four contracts are ready, wear from 1.0.1 (minVersion) and name their evidence;
 *   S3 tracy-web's door: 1.0.0 needs 1.0.1, 1.0.1 gets the contract;
 *   S4 the emitted slot and tokenizer carry what each was made ready with — JA Beauty's red through
 *      T4's style template (t4Placeholders), JA Campaign's weights !important (weightImportant) and
 *      mainnav followRules, JA Boxing's --color-dark as surface and --headings-color by role,
 *      JA Blockk's content-listing variables (templateVars) and hidden visitor dark mode.
 * No model reads anything; the Docker measures are in the evidence, not re-run here.
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const { loadContract, loadProfile, contractBase } = await import(
  pathToFileURL(join(LIB, 'src/library.mjs')).href
)
const { joomlaSlot } = await import(pathToFileURL(join(LIB, 'src/joomla.mjs')).href)
const { tokenizeCss } = await import(pathToFileURL(join(LIB, 'src/tokenize.mjs')).href)
const { contractFor } = await import(pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href)
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const TOGGL = 'refero:813be405-c2b9-41be-9864-7b53d66483dc'
const SLUGS = ['ja-beauty', 'ja-blockk', 'ja-boxing', 'ja-campaign']
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/contracts.test.mjs', 'test/tokenize.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2 + S3
const K = {}
for (const slug of SLUGS) {
  const k = (K[slug] = loadContract(`joomla-${slug}`))
  c.eq(`S2 ${slug}: ready`, k.ready, true)
  c.eq(
    `S2 ${slug}: minVersion`,
    JSON.stringify(k.minVersion),
    JSON.stringify({ [`quickstart/${slug}/j6`]: '1.0.1' })
  )
  c.check(
    `S2 ${slug}: readyNote names its evidence`,
    (k.readyNote ?? '').includes(`tasks/evidence/ds-contracts-r3c-2026-10-11/templates/${slug}-j6`),
    k.readyNote
  )
  const at = (version) => contractFor(`joomla/${slug}`, { key: `quickstart/${slug}/j6`, version })
  c.eq(`S3 ${slug}: door at 1.0.0`, at('1.0.0').reason, 'TEMPLATE_NEEDS_UPDATE')
  c.eq(`S3 ${slug}: door at 1.0.1`, at('1.0.1').contract, `joomla-${slug}`)
}

// S4
const slot = (slug, id) => joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, K[slug]), K[slug]).css
const tok = (slug, css) =>
  tokenizeCss(css, contractBase(ROOT, K[slug]).palette ?? [], {
    t4Placeholders: K[slug].t4Placeholders,
    varRoles: K[slug].varRoles
  }).css
c.check(
  'S4 ja-beauty: T4 style template placeholder reads the slot',
  /var\(--ds-c-accent-text, __color_primary\)/.test(
    tok('ja-beauty', '.section-title{color:__color_primary}')
  ),
  tok('ja-beauty', '.section-title{color:__color_primary}')
)
const campaign = slot('ja-campaign', MOXIE)
c.check('S4 ja-campaign: weights !important', /font-weight:\d+!important/.test(campaign), '')
c.check(
  'S4 ja-campaign: mainnav links follow',
  campaign.includes('.t4-palette-mainnav .nav li a:not(.nav-link-signin)'),
  ''
)
const boxing = slot('ja-boxing', TOGGL)
c.check('S4 ja-boxing: --color-dark is the surface', boxing.includes('--color-dark:var(--ds-c-surface)'), '')
c.check(
  'S4 ja-boxing: --headings-color by role wherever declared',
  /--headings-color: ?var\(--ds-c-fg-2, ?#fff\)/.test(
    tok('ja-boxing', '.t4-footnav{--headings-color: #fff}')
  ),
  tok('ja-boxing', '.t4-footnav{--headings-color: #fff}')
)
c.check(
  'S4 ja-boxing: visitor light mode hidden',
  boxing.includes('.ja-dark-mode{display:none!important}'),
  ''
)
const blockk = slot('ja-blockk', TOGGL)
c.check('S4 ja-blockk: module excerpt colour follows', blockk.includes('--color-desc:var(--ds-c-muted)'), '')
c.check('S4 ja-blockk: written on body.dark-active too', blockk.includes('body.dark-active{'), '')
c.done()
