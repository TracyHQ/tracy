// R27 a hide is one the site can take off (site-planner/plan-check/rules-receiver-hides.js): the Joomla receiver empties only
// what its review lists (lib/receiver-hide-review.js, the plugin script's port), and the write step's `rows.remove` door takes
// a slot of an HTML field or a row hidden whole; any other hide is refused and leaves the demo on the page. Inputs: the JA
// Boxing 1.0.10 kit and content map committed in the repo, the checker's passing plan (_site-plan-check.mjs); no model, no
// database.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { hideableSlots, receiverHideReview } from '../src/lib/receiver-hide-review.js'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { brief, decisionOf, kit, plan } from './_site-plan-check.mjs'

const CONTRACTS = '../../../packages/cms/tracy-joomla-quickstart/contracts'
const read = (rel) => JSON.parse(readFileSync(new URL(`${CONTRACTS}/${rel}`, import.meta.url), 'utf8'))
const boxingMap = read('ja-boxing/j6/1.0.10/content-map.json')
const receiver = () => receiverHideReview(kit(), boxingMap)
const r27 = (p, withReceiver = receiver()) =>
  checkPlan({ plan: p, kit: kit(), brief: brief(), receiver: withReceiver }).rules.find((r) => r.id === 'R27')
const CLASS_BODY = 'body-classes_advanced-boxing'
const hide = (d, slot) => d.hiddenSlots.push({ slot, why: 'nothing true to say here' })
const unhide = (d, slot) => (d.hiddenSlots = d.hiddenSlots.filter((h) => h.slot !== slot))
const unpicture = (d, frame) => (d.pictures = d.pictures.filter((p) => p.frame !== frame))

test("the port lists what the plugin's review lists: JA Diner 1.0.8 and JA Boxing 1.0.10, tier by tier", () => {
  const count = (h) => [h.measured.length, h.unmeasured.length, Object.keys(h.withRow).length]
  const diner = hideableSlots(
    read('ja-diner/j6/1.0.8/template-kit.json'),
    read('ja-diner/j6/1.0.8/content-map.json')
  )
  // The plugin's joomla/cowork/lib/hideable-slots.json entry for JA Diner 1.0.8: 38 measured, 258 unmeasured, 43 with row.
  assert.deepEqual(count(diner), [38, 258, 43])
  assert.deepEqual(count(hideableSlots(kit(), boxingMap)), [54, 517, 218])
  // A video's thumbnail picture of an exercise row goes only with another slot of that row.
  assert.deepEqual(receiver().withRow.get('article-16.33'), ['article-16.34', 'article-16.35'])
})

test("an article's title hidden is refused; a sentence of its HTML text goes by the door; a kit with no review skips", () => {
  const p = plan()
  const result = r27(p)
  assert.equal(result.status, 'fail')
  assert.deepEqual(
    result.failures.map((f) => f.where),
    [`page page-classes_advanced-boxing / block ${CLASS_BODY} / hidden article-16.4`]
  )
  assert.match(result.failures[0].detail, /never empties this slot/)
  assert.equal(result.failures[0].cause, 'plan')
  // Written instead of hidden, the title passes; article-16.3, a text node of the full text, was never in question.
  const d = decisionOf(p, CLASS_BODY)
  unhide(d, 'article-16.4')
  d.copy = [{ slot: 'article-16.4', text: 'Advanced Boxing' }]
  assert.equal(r27(p).status, 'pass')
  assert.equal(r27(p, null).status, 'skip')
})

test("a picture the receiver never empties (an article's intro image) cannot be hidden", () => {
  const p = plan()
  const d = decisionOf(p, CLASS_BODY)
  unhide(d, 'article-16.4')
  unpicture(d, 'article-16.5')
  hide(d, 'article-16.5')
  const result = r27(p)
  assert.deepEqual(
    result.failures.map((f) => f.where),
    [`page page-classes_advanced-boxing / block ${CLASS_BODY} / hidden article-16.5`]
  )
})

test('a picture the receiver takes only with its row fails alone and passes once another slot of the row goes too', () => {
  const p = plan()
  const d = decisionOf(p, CLASS_BODY)
  unhide(d, 'article-16.4')
  unhide(d, 'article-16.34')
  unpicture(d, 'article-16.33')
  hide(d, 'article-16.33')
  const alone = r27(p)
  assert.equal(alone.status, 'fail')
  assert.match(alone.failures[0].where, /hidden article-16\.33$/)
  assert.match(
    alone.failures[0].detail,
    /only with another slot of its row \(article-16\.34, article-16\.35\)/
  )
  hide(d, 'article-16.35')
  assert.equal(r27(p).status, 'pass')
})
