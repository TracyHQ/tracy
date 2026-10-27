/** Explicit choices continue once; comparison and final creation remain deliberate. */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const browser = nodeTest(['packages/site/tracy-add-site/test/e2e/design-system-card.test.mjs'], {
  pattern: 'platform selection moves|Use starting design advances|Use another template|Use from Review',
  timeoutS: 180
})
c.tapClean('Explicit choice navigation', browser)
for (const title of [
  'platform selection moves forward once, supports the keyboard and keeps Back editable',
  'Use starting design advances without another Continue (support: true)',
  'Use starting design advances without another Continue (support: false)',
  'Use another template waits for its own support answer (next supported: true)',
  'Use another template waits for its own support answer (next supported: false)',
  'Use from Review edits the template and returns to Review without creating a site'
])
  c.passes(title, browser, title)
c.done()
