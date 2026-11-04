// Plan labels are suggestions (ADR 0042, decision of 2026-11-04). The invented "Quay Fitness Studio" fixtures, plus one
// invented masthead: its kit slot shows a heading that stands alone (demo "Our Sessions"), while the planner gave it
// the label "Coaching for", the first half of a stat row. The writer gets the label beside the kit's sample, role,
// limit and place and the plan's says; code records whether the label was kept (plan-label) or replaced (writer, with
// the label it replaced). No model is called: the writer's answers are written by hand.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyValidChanges, assembleCopy } from '../src/site-writer/copy-changes.js'
import { indexInputs } from '../src/site-writer/copy-check/inputs-index.js'
import { planLabelSlots } from '../src/site-writer/plan-labels.js'
import { writerInput } from '../src/site-writer/writer-input.js'
import { firstUserMessage } from '../src/site-writer/writer-turns.js'
import { checkCopy as check } from '../src/site-writer/copy-check/check-copy.js'
import { brief, copy, kit, plan } from './_site-copy-check.mjs'

// The masthead of the about page: a kit heading slot the kit groups as a menu label (as the invented case has it).
function baseKit() {
  const k = kit()
  k.blocks.push({
    id: 'block-7',
    role: 'masthead',
    look: 'A tall masthead with one large heading on a photograph, nothing else.',
    slots: [
      {
        id: 'block-7.1',
        role: 'editorial.menu_label',
        type: 'text',
        maxCharacters: 18,
        sample: 'Our Sessions',
        paragraphs: 1,
        bullets: 0,
        alsoChanges: { blocks: [], pageTitles: ['page-about'], menus: [] }
      }
    ],
    lists: []
  })
  return k
}
function basePlan() {
  const p = plan()
  p.pages
    .find((x) => x.id === 'page-about')
    .blocks.unshift({
      block: 'block-7',
      seen: 'seen',
      decision: 'keep',
      why: 'fits',
      copy: [
        {
          slot: 'block-7.1',
          says: 'stat label, read with the value every age',
          text: 'Coaching for',
          basis: 'trade',
          maxCharacters: 18
        }
      ]
    })
  return p
}
// The passing copy of the fixtures, with the masthead label kept.
function baseCopy() {
  const c = copy()
  c.slots.push({ slot: 'block-7.1', owner: 'plan-label', text: 'Coaching for', factIds: [] })
  return c
}
const checkCopy = (c) => check({ copy: c, plan: basePlan(), kit: baseKit(), brief: brief() })

const SLOT = 'block-7.1'
const index = () => indexInputs({ plan: basePlan(), kit: baseKit(), brief: brief() })
const fingerprint = baseCopy().fingerprint
const answerWithout = (slot) => {
  const { version: _v, fingerprint: _f, ...rest } = baseCopy()
  return { ...rest, slots: rest.slots.filter((s) => s.slot !== slot && s.owner !== 'plan-label') }
}
const entryOf = (c, slot) => c.slots.find((s) => s.slot === slot)
const w02 = (c) => checkCopy(c).rules.find((r) => r.id === 'W02')

test('a plan label slot whose kit sample is a heading reaches the prompt with its sample, role, limit and place', () => {
  const labels = planLabelSlots({ plan: basePlan(), kit: baseKit() })
  assert.deepEqual(
    labels.map((l) => l.slot),
    ['block-1.1', SLOT]
  )
  assert.deepEqual(
    labels.find((l) => l.slot === SLOT),
    {
      slot: SLOT,
      planLabel: 'Coaching for',
      says: 'stat label, read with the value every age',
      sample: 'Our Sessions',
      role: 'editorial.menu_label',
      maxCharacters: 18,
      prints: { block: 'block-7', blockRole: 'masthead', alsoPageTitleOf: ['page-about'] }
    }
  )
  const input = writerInput({ plan: basePlan(), brief: brief(), kit: baseKit() })
  assert.deepEqual(input.labels, labels)
  const message = firstUserMessage(input)
  assert.match(
    message,
    /## Label slots: the plan's label is a suggestion; keep it when it fits the slot, rewrite it/
  )
  assert.ok(message.includes(JSON.stringify(labels)))
})

test('a menu label the kit knows as a menu item says so, from the content map', () => {
  const contentMap = {
    entities: [{ key: 'block-1', kind: 'menuItem' }],
    slots: [{ key: 'block-1.1', entity: 'block-1' }]
  }
  const [button] = planLabelSlots({ plan: basePlan(), kit: baseKit(), contentMap })
  assert.deepEqual(button.prints, { block: 'block-1', blockRole: 'header', menuItem: true })
})

test('a label the writer rewrites is recorded as the writer text, with the plan label it replaced', () => {
  const answer = answerWithout(SLOT)
  answer.slots.push({ slot: SLOT, text: 'Coaching for all', factIds: [] })
  const c = assembleCopy(answer, { fingerprint, index: index() })
  assert.deepEqual(entryOf(c, SLOT), {
    slot: SLOT,
    owner: 'writer',
    text: 'Coaching for all',
    factIds: [],
    replacedPlanLabel: 'Coaching for'
  })
  // The other label, left out, is still the plan's words.
  assert.equal(entryOf(c, 'block-1.1').owner, 'plan-label')
  assert.equal(w02(c).status, 'pass', JSON.stringify(w02(c).failures))
})

test('a label the writer keeps word for word, or leaves out, is recorded as the plan label', () => {
  const kept = answerWithout(SLOT)
  kept.slots.push({ slot: SLOT, owner: 'writer', text: ' Coaching  for', factIds: [] })
  const omitted = answerWithout(SLOT)
  for (const answer of [kept, omitted]) {
    const c = assembleCopy(answer, { fingerprint, index: index() })
    assert.deepEqual(entryOf(c, SLOT), { slot: SLOT, owner: 'plan-label', text: 'Coaching for', factIds: [] })
    assert.equal(w02(c).status, 'pass', JSON.stringify(w02(c).failures))
  }
})

test('a fix round may rewrite a label or give the plan words back, and the trace follows', () => {
  const ready = { index: index() }
  const previous = assembleCopy(answerWithout(SLOT), { fingerprint, index: ready.index })
  const order = previous.slots.map((s) => s.slot)
  const rewritten = applyValidChanges(
    previous,
    { changes: [{ in: 'slots', slot: SLOT, text: 'Coaching at Quay' }] },
    { ready }
  )
  assert.deepEqual(rewritten.rejected, [])
  assert.deepEqual(entryOf(rewritten.doc, SLOT), {
    slot: SLOT,
    owner: 'writer',
    text: 'Coaching at Quay',
    factIds: [],
    replacedPlanLabel: 'Coaching for'
  })
  assert.deepEqual(
    rewritten.doc.slots.map((s) => s.slot),
    order
  )
  const back = applyValidChanges(
    rewritten.doc,
    { changes: [{ in: 'slots', slot: SLOT, text: 'Coaching for' }] },
    { ready }
  )
  assert.deepEqual(entryOf(back.doc, SLOT), {
    slot: SLOT,
    owner: 'plan-label',
    text: 'Coaching for',
    factIds: []
  })
  const returned = applyValidChanges(
    back.doc,
    { changes: [{ in: 'returns', slot: SLOT, reason: 'no idea' }] },
    { ready }
  )
  assert.match(returned.rejected[0].reason, /is a label: write the plan's words as its text to keep them/)
})

test('W02 fails a writer text on a label slot that does not name the plan label it replaced', () => {
  const c = baseCopy()
  Object.assign(entryOf(c, SLOT), { owner: 'writer', text: 'Coaching for all' })
  assert.match(
    w02(c)
      .failures.map((f) => f.detail)
      .join('\n'),
    /block-7\.1: owner is "writer" on a label slot without/
  )
  entryOf(c, SLOT).replacedPlanLabel = 'Coaching for'
  assert.equal(w02(c).status, 'pass')
  const stray = baseCopy()
  entryOf(stray, 'block-2.1').replacedPlanLabel = 'Something'
  assert.match(
    w02(stray)
      .failures.map((f) => f.detail)
      .join('\n'),
    /block-2\.1: replacedPlanLabel on a slot/
  )
})
