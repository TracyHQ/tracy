// Step 9b (#448) on an empty-controls fault: a button with no words names no slot and no words, only the button the host
// measured (`a.btn`) and where it leads. The fault keeps that selector and address, the served page is searched for the
// wordless button with that address, and the item points at its block, its own path and its provenance marks, so the
// agent and content.locate have an element to act on. Pages, blocks and words are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { faultsToSend } from '../src/write-step/repair-pass/repair-faults.js'
import { servedElementOf, servedPage } from '../src/write-step/repair-pass/repair-served-element.js'
import { checkOf, failure, fakeAgent, stepNine } from './_write-step-nine-repair.mjs'

const WORDLESS = failure('empty-controls', '/index.php/courts/clay', null, 'a.btn -> /index.php/visit', {
  selector: 'a.btn',
  reason: 'A button has no words'
})
const NOWHERE = failure('empty-controls', '/index.php/courts/clay', null, 'Reserve now', {
  selector: 'a.button',
  reason: 'A button goes nowhere (its address is #)'
})
const PAGE = `<html><body>
  <div id="Mod3" class="t4-module"><a class="btn" href="/index.php/visit">Plan a visit</a></div>
  <div id="Mod5" class="t4-module"><div data-tracy-src="module:5"><p>Clay courts all year</p>
    <a class="btn btn-primary" href="/index.php/visit"></a><a class="button" href="#">Reserve now</a></div></div>
</body></html>`

test('an empty-controls fault keeps the button selector and the address it leads to', () => {
  const { pages } = faultsToSend({ firstCheck: checkOf([WORDLESS]) })
  const [fault] = pages[0].faults
  assert.equal(fault.selector, 'a.btn')
  assert.equal(fault.href, '/index.php/visit')
})

test('the wordless button is found on the served page by selector and address, inside its block', () => {
  const { pages } = faultsToSend({ firstCheck: checkOf([WORDLESS, NOWHERE]) })
  const [wordless, nowhere] = pages[0].faults
  const served = servedPage(PAGE)
  const one = servedElementOf(served, wordless)
  assert.ok(one, 'the button is found')
  assert.equal(one.selector, '#Mod5', 'the block holding the wordless button, not the worded one in Mod3')
  assert.equal(one.tag, 'a')
  assert.match(one.path, /^#Mod5 > /)
  assert.deepEqual(one.marks, ['module:5'])
  const two = servedElementOf(served, nowhere)
  assert.equal(two.selector, '#Mod5')
  assert.equal(two.text, 'Reserve now')
  assert.notEqual(two.path, one.path)
})

test('step 9b sends the empty button with its element and says which button, not "as the note describes"', async () => {
  const agent = fakeAgent({ locate: () => ({ status: 'unavailable', code: 'CONTENT_ADAPTER_UNSUPPORTED' }) })
  await stepNine({
    checks: [checkOf([WORDLESS]), checkOf([])],
    agent,
    input: { pageHtml: async () => PAGE }
  })
  const [item] = agent.sent.requests.flatMap((r) => r.items)
  assert.equal(item.element.selector, '#Mod5')
  assert.deepEqual(item.element.marks, ['module:5'])
  assert.equal(item.element.text, '', 'the measure is not shown as words the button holds')
  assert.deepEqual(agent.sent.located, [{ url: item.url, marks: ['module:5'] }])
  assert.doesNotMatch(item.text, /as the note describes/)
  assert.match(item.text, /a\.btn/)
  assert.match(item.text, /\/index\.php\/visit/)
})
