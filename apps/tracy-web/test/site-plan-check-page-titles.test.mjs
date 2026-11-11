// Site plan checker: every kept page has a written title, measured by the kit's `pages[].titleSlot` (template-kit
// page-titles.mjs). Inputs: the kit and the invented brief of the other plan checker tests.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { brief, decisionOf, kit, plan } from './_site-plan-check.mjs'

const CONTACT = 'page-about-us_contact'
const BODY = 'body-about-us_contact'
const TITLE = `${BODY}.title`

/** The contact page titled by a slot of its own body; every other page keeps no title field. */
function inputs(write) {
  const k = kit()
  k.pages.find((p) => p.id === CONTACT).titleSlot = TITLE
  k.blocks
    .find((b) => b.id === BODY)
    .slots.push({ id: TITLE, type: 'text', role: 'editorial.heading', sample: 'Contact', maxCharacters: 40 })
  const p = plan()
  write?.(decisionOf(p, BODY), p)
  return { plan: p, kit: k, brief: brief() }
}
const r20 = (input) => checkPlan(input).rules.find((r) => r.id === 'R20')
const says = (slot) => ({ slot, says: 'the page title', basis: 'trade', factIds: [] })

test('R20 a kept page whose title slot the plan does not write', () => {
  const rule = r20(inputs())
  assert.equal(rule.status, 'fail')
  assert.match(rule.failures[0].detail, /page-about-us_contact.*body-about-us_contact\.title/)
})

test('R20 a kept page whose title slot the plan writes', () => {
  const rule = r20(inputs((d) => (d.copy = [...(d.copy ?? []), says(TITLE)])))
  assert.equal(rule.status, 'pass')
})

test('R20 a title written in a list row counts', () => {
  const rule = r20(
    inputs((d) => (d.lists = [...(d.lists ?? []), { list: 'x', rows: 1, items: [{ copy: [says(TITLE)] }] }]))
  )
  assert.equal(rule.status, 'pass')
})

test('R20 a title the plan hides is not written', () => {
  const rule = r20(
    inputs((d) => {
      d.copy = [...(d.copy ?? []), says(TITLE)]
      d.hiddenSlots = [...(d.hiddenSlots ?? []), { slot: TITLE, why: 'not needed' }]
    })
  )
  assert.equal(rule.status, 'fail')
})

test('R20 a copy entry with neither words nor intent is not a title', () => {
  const rule = r20(
    inputs((d) => (d.copy = [...(d.copy ?? []), { slot: TITLE, basis: 'trade', factIds: [] }]))
  )
  assert.equal(rule.status, 'fail')
})

test('R20 a page the kit could not settle passes on any slot it names', () => {
  const input = inputs((d) => (d.copy = [...(d.copy ?? []), says(`${BODY}.other`)]))
  const page = input.kit.pages.find((p) => p.id === CONTACT)
  input.kit.blocks
    .find((b) => b.id === BODY)
    .slots.push({
      id: `${BODY}.other`,
      type: 'text',
      role: 'editorial.heading',
      sample: 'Contact',
      maxCharacters: 40
    })
  page.titleSlot = null
  page.titleCandidates = [TITLE, `${BODY}.other`]
  assert.equal(r20(input).status, 'pass')
})

test('R20 a kit made before page titles were measured says it cannot check', () => {
  const rule = r20({ plan: plan(), kit: kit(), brief: brief() })
  assert.equal(rule.status, 'skip')
  assert.match(rule.notes.join(' '), /titleSlot/)
})
