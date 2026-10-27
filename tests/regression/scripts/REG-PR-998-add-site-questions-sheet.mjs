/**
 * REG-PR-998-add-site-questions-sheet: the Add site form asks the template's questions in a "Customize your site"
 * card and sheet, never in a popup, and Create site is never blocked by a question. Runs S1 the brief unit suite and
 * S2 the card and sheet end to end in a real browser over the wizard fixture (the suite launches Playwright's Chromium
 * itself). Each run must exit 0 with 0 failed and 0 skipped, and every test the case names must pass.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest(['packages/site/tracy-add-site/test/site-brief.test.mjs'])
c.tapClean('S1', s1)
for (const name of [
  'the questions the set flags required come first, each group in the set order',
  'a new set keeps the answers whose question it still asks and whose value still fits, and drops the rest',
  'progress counts the questions shown now, a condition opening one adds to the total'
])
  c.passes('S1', s1, name)

// S2
const s2 = nodeTest(['packages/site/tracy-add-site/test/e2e/create-brief-sheet.test.mjs'], {
  extra: ['--test-timeout=120000']
})
c.tapClean('S2', s2)
for (const name of [
  'the card sits quietly under the address',
  "the sheet slides over the panel with the template's own questions, Recommended ones first",
  'Done closes the sheet, keeps the answers, and gives focus back to the card',
  'the corner X closes the sheet',
  'a click on the dimmed panel closes the sheet',
  'Escape closes the sheet',
  'Create site sends the answers with the hash of the set they answer',
  'nothing answered: Create site makes the site at once with no brief',
  'when the questions cannot load the card says so',
  'a template no content contract seals shows no card and sends no brief',
  'a change of template keeps the answers the new set still asks for'
])
  c.passes('S2', s2, name)
c.done()
