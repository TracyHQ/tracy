/**
 * REG-PR-1100-p3-slot-relative-look: on a site wearing a design-system slot the look guidance writes
 * relative to the slot, the element's leftover literal pins included, and `!` stands only before a slot
 * value. Runs the tests that hold each expect line — the EmDash LOOK road and the design line with its
 * examples (site-tools), look.set's refusal of a slot-owned token (site-tools), the site.rebuild hint
 * (site-build-emdash) and the Tracy Business hero button (the EmDash template).
 */
import { join } from 'node:path'

import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()

const tools = nodeTest([
  'packages/tools/tracy-site-tools/test/ds-slot-worn.test.mjs',
  'packages/tools/tracy-site-tools/test/look-set.test.mjs'
])
c.tapClean('site-tools', tools)
c.passes(
  'EmDash LOOK line',
  tools,
  'LOOK line, EmDash: a value the slot sets beats tokens.css, so the class is written relative to its variable'
)
c.passes(
  'EmDash LOOK line, leftover pins',
  tools,
  'LOOK line, EmDash: the element’s leftover literal pins for what the slot sets are swapped too, and `!` stands only before a slot value'
)
for (const platform of ['emdash', 'wordpress', 'joomla'])
  c.passes(
    `design line, leftover pins and \`!\` (${platform})`,
    tools,
    `design line: a worn slot is named, where it lives, its variables, and edits relative to them — never its values pinned: ${platform}`
  )
c.passes(
  'design line examples',
  tools,
  'design line: the examples are in the syntax of the CMS — Tailwind classes on EmDash, CSS elsewhere — with the slot’s own variables'
)
for (const platform of ['emdash', 'joomla'])
  c.passes(
    `look.set refusal (${platform})`,
    tools,
    `scope site, a token the design-system slot sets: refused as the system's own, with the road for one element, nothing written: ${platform}`
  )

const build = nodeTest(['packages/site/tracy-site-build-emdash/test/stages.test.mjs'])
c.tapClean('site-build-emdash', build)
c.passes(
  'site.rebuild hint',
  build,
  'site.rebuild: the hint sends a colour to tokens.css unless the design-system slot sets it'
)
c.passes(
  'site.rebuild hint, leftover pins',
  build,
  'site.rebuild: the hint says an element’s leftover literal pins are replaced as well'
)

const hero = nodeTest(['tests/ds-slot-hero.test.mjs'], {
  cwd: join(ROOT, 'packages/cms/tracy-emdash-theme-business')
})
c.tapClean('Tracy Business hero', hero)
c.passes(
  'Tracy Business hero',
  hero,
  'the hero CTA takes the worn system’s button padding, the template’s own values when none is worn'
)
c.done()
