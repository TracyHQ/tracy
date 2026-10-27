/**
 * REG-PR-1002-add-site-card-three-lines: the "Customize your site" card is a palette badge and three single lines at every
 * panel width (title, count, description), shows the count and never the answers, and the standard question sets' name hint is a real example, not the leftover
 * "Claude Studio". S1 runs the card and sheet end to end in a real browser over the wizard fixture; S2 reads the six
 * question files.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest(['packages/site/tracy-add-site/test/e2e/create-brief-sheet.test.mjs'], {
  extra: ['--test-timeout=120000']
})
c.tapClean('S1', s1)
for (const width of [260, 320, 380, 480, 900])
  c.passes('S1', s1, `at ${width}px the card is three single lines, before and after answering`)
for (const width of [260, 380])
  c.passes('S1', s1, `at ${width}px the failed card stays within three single lines`)
for (const lang of ['de', 'vi', 'fr'])
  for (const width of [260, 320])
    c.passes('S1', s1, `in ${lang} at ${width}px line 1 stays one line with the Optional tag whole`)
for (const name of [
  'the card sits quietly under the address',
  'Done closes the sheet, keeps the answers, and gives focus back to the card',
  'a change of template keeps the answers the new set still asks for',
  'a refused address keeps the answers'
])
  c.passes('S1', s1, name)

// S2
const EN = 'Write it the way customers should see it, for example "Harbor Build & Repair".'
for (const cms of ['wordpress', 'joomla', 'emdash'])
  for (const file of [
    `packages/site/tracy-site-build-${cms}/questions.json`,
    `apps/tracy-web/src/questions/${cms}.json`
  ]) {
    const hint =
      JSON.parse(readFileSync(join(ROOT, file), 'utf8')).questions.find((q) => q.id === 'name')?.hint ?? {}
    const stale = Object.entries(hint).filter(([, v]) => /Claude Studio|Tiệm bánh Cô Ba/.test(v))
    c.check(`S2: ${file} name hint has no leftover example`, stale.length === 0, stale)
    c.eq(`S2: ${file} name hint en`, hint.en, EN)
  }
c.done()
