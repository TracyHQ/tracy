/**
 * REG-PR-1134-ds-remeasure-6: sixteen slot contracts re-measured with the per-element contrast probe
 * (11/10/2026) — the framework blanks, Tracy's own Joomla templates, the WordPress themes and the three
 * EmDash templates:
 *   S1 the library's tests (bandText included);
 *   S2 each contract: offered only with evidence of this round that passes (every system step, controls
 *      0, no text under 4.5:1 worse than the template's own, at least half the page follows, contrast
 *      samples in every view), or not offered with the reason;
 *   S3 Tracy Business EmDash: the forest band's text is the page colour and the hero's accent line on the
 *      ink band reads 4.5:1 under Toggl Track (bandText); Tracy SaaS's call-to-action eyebrow reads on
 *      every ground of its card;
 *   S4 tracy-web's door: Tracy SaaS — the published 1.4.10 has no reader, the first release that
 *      wears the slot was 1.4.11 (develop's minVersion then; 1.4.12 since), so a site on 1.4.10 is told to update; Tracy Business 1.7.6 and Tracy Base 0.5.0 are offered.
 * No model, no stand: the measurements are the committed evidence.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, nodeTest, ROOT, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const EV = 'tasks/evidence/ds-remeasure-6-2026-10-11'
const { loadContract, loadProfile } = await import(pathToFileURL(join(LIB, 'src/library.mjs')).href)
const { emdashCss } = await import(pathToFileURL(join(LIB, 'src/emit.mjs')).href)
const { contrast, mix } = await import(pathToFileURL(join(LIB, 'src/colour.mjs')).href)
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/slot.test.mjs', 'test/cms.test.mjs'], { cwd: 'packages/design/tracy-ds-slot' })
)

// S2: contract → the evidence folders of this round (one per release measured)
const RUNS = {
  'joomla-t3-bs3-blank': ['joomla-t3-bs3-blank'],
  'joomla-t4-bs5-blank': ['joomla-t4-bs5-blank', 'joomla-t4-bs5-blank-guru'],
  'joomla-tracy-base': ['joomla-tracy-base', 'joomla-tracy-base-apple'],
  'joomla-tracy-airbnb': ['joomla-tracy-airbnb'],
  'joomla-tracy-business': ['joomla-tracy-business'],
  'wordpress-ja-essence': ['wordpress-ja-essence'],
  'wordpress-ja-impact': ['wordpress-ja-impact'],
  'wordpress-ja-kinetic': ['wordpress-ja-kinetic'],
  'wordpress-ja-morgan': ['wordpress-ja-morgan'],
  'wordpress-ja-nova': ['wordpress-ja-nova'],
  'wordpress-ja-vega': ['wordpress-ja-vega'],
  'wordpress-tracy-base': ['wordpress-tracy-base'],
  'wordpress-tracy-business': ['wordpress-tracy-business'],
  'emdash-base': ['emdash-base'],
  'emdash-tracy-business': ['emdash-tracy-business'],
  'emdash-tracy-saas': ['emdash-tracy-saas']
}
for (const [name, runs] of Object.entries(RUNS)) {
  const k = loadContract(name)
  if (k.ready === false) {
    c.check(
      `S2 ${name}: not offered, says why`,
      String(k.readyNote ?? '').startsWith('NOT offered yet'),
      k.readyNote
    )
    continue
  }
  c.check(`S2 ${name}: readyNote names this round's evidence`, String(k.readyNote).includes(EV), k.readyNote)
  c.check(
    `S2 ${name}: every heading and every text of the page is a contrast kind`,
    Boolean(k.contrast?.heading?.startsWith('body :is(h1') && k.contrast?.text?.startsWith('body :is(p')),
    k.contrast
  )
  for (const run of runs) {
    const file = join(ROOT, EV, run, 'final.json')
    if (!c.check(`S2 ${name}: ${run}/final.json`, existsSync(file))) continue
    const f = JSON.parse(readFileSync(file, 'utf8'))
    c.check(`S2 ${run}: every system step passes`, f.systemsPass === true, f.pass)
    c.check(`S2 ${run}: controls 0`, f.controlsZero === true, f.controls)
    c.check(`S2 ${run}: no text worse than the template's own`, f.regressed.length === 0, f.regressed)
    c.check(`S2 ${run}: half the page follows`, f.minFollows >= 0.5, f.minFollows)
    c.check(`S2 ${run}: samples in every view`, f.everyViewHasSamples === true)
  }
}

// S3
const biz = loadContract('emdash-tracy-business')
c.eq('S3 forest band text is the page colour', biz.templateVars['--color-on-forest-muted'], 'var(--ds-c-bg)')
const toggl = emdashCss(loadProfile(ROOT, 'refero:813be405-c2b9-41be-9864-7b53d66483dc'), biz)
const hero = /:root \.band-ink \.text-signal \{ color: (#[0-9a-f]{6}); \}/.exec(toggl.css)?.[1]
c.check(
  'S3 Toggl Track: the hero accent line reads 4.5:1 on the ink band',
  hero && contrast(hero, toggl.vars['--ds-c-fg']) >= 4.5,
  [hero, toggl.vars['--ds-c-fg']]
)
const saasK = loadContract('emdash-tracy-saas')
const apple = emdashCss(loadProfile(ROOT, 'od:apple'), saasK)
const eyebrow = /:root \.cta--card \.cta-eyebrow \{ color: (#[0-9a-f]{6}); \}/.exec(apple.css)?.[1]
const grounds = ['surface-warm', 'surface'].map((r) => apple.vars[`--ds-c-${r}`])
c.check(
  'S3 Tracy SaaS under Apple: the CTA eyebrow reads on every ground of its card',
  eyebrow &&
    [...grounds, ...grounds.map((g) => mix(g, apple.vars['--ds-c-accent-text'], 0.12))].every(
      (g) => contrast(eyebrow, g) >= 4.5
    ),
  eyebrow
)

// S3: the probe reads Tailwind v4's oklab; the forest band's literal title takes the page colour (EmDash followRules)
const { channels } = await import(pathToFileURL(join(LIB, 'src/probe.mjs')).href)
c.eq(
  'S3 the probe reads an oklab veil as white at 80%',
  JSON.stringify(channels('oklab(1 0 0 / 0.8)')),
  JSON.stringify([255, 255, 255, 0.8])
)
const moxie = emdashCss(loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'), biz)
const forestTitle = /:root :is\(\.bg-forest h2[^)]*\) \{ color: (#[0-9a-f]{6}); \}/.exec(moxie.css)?.[1]
c.check(
  'S3 Moxie: the forest band title reads 4.5:1 on the forest fill (the readable accent)',
  forestTitle && contrast(forestTitle, moxie.vars['--ds-c-accent-text']) >= 4.5,
  [forestTitle, moxie.vars['--ds-c-accent-text']]
)

// S4
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
const em = (tag, version) =>
  contractFor(templateKeyOf({ platform: 'emdash', quickstartTag: tag }), { key: tag, version })
// The first release that wears the slot was 1.4.11; develop has since moved minVersion to 1.4.12
// (sharp as a direct dependency, #1182). Whatever it names, 1.4.10 (published without the reader)
// is never offered, and the release it names is.
const saasMin = saasK.minVersion['tracy-saas/emdash-0.x']
const vn = (v) => v.split('.').map(Number)
c.check(
  'S4 Tracy SaaS: the first release that wears the slot is 1.4.11 or later',
  typeof saasMin === 'string' &&
    (vn(saasMin)[0] > 1 ||
      (vn(saasMin)[0] === 1 && (vn(saasMin)[1] > 4 || (vn(saasMin)[1] === 4 && vn(saasMin)[2] >= 11)))),
  saasMin
)
c.eq(
  'S4 Tracy SaaS 1.4.10 (published without the reader) is told to update',
  JSON.stringify(em('tracy-saas/emdash-0.x', '1.4.10')),
  JSON.stringify({ reason: 'TEMPLATE_NEEDS_UPDATE', need: saasMin, have: '1.4.10' })
)
c.eq(
  `S4 Tracy SaaS ${saasMin}`,
  JSON.stringify(em('tracy-saas/emdash-0.x', saasMin)),
  JSON.stringify({ contract: 'emdash-tracy-saas' })
)
c.eq(
  'S4 Tracy Business EmDash 1.7.6',
  JSON.stringify(em('tracy-business/emdash-0.x', '1.7.6')),
  JSON.stringify({ contract: 'emdash-tracy-business' })
)
c.eq(
  'S4 Tracy Base EmDash 0.5.0',
  JSON.stringify(em('tracy-base/emdash-0.x', '0.5.0')),
  JSON.stringify({ contract: 'emdash-base' })
)
c.done()
