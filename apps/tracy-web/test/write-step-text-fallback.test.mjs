// Card AS: a text slot the plugin refuses must not keep its demo words. The write step tries, once each: the plain version of
// the customer's words (emphasis left out), then hiding the slot when the kit and the site allow it, and only then a failed line
// that says the demo text remains. Kit, copy and site are invented (Quay Fitness Studio of the copy check fixtures).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy as baseCopy, KIT, runStep } from './_write-step-run.mjs'

const TOO_LONG = { code: 'SLOT_TOO_LONG', message: 'Content too long', limit: 30, actual: 52 }

function emphasised() {
  const kit = KIT()
  const slot = kit.doc.blocks.find((b) => b.id === 'block-2').slots.find((s) => s.id === 'block-2.1')
  slot.inline = [{ tag: 'span', attrs: '', text: 'fittest', at: 'inside' }]
  const copy = baseCopy()
  copy.slots.find((s) => s.slot === 'block-2.1').emphasis = 'coach'
  return { kit, copy }
}

test('the three rungs, each tried once: plain words, then hide, then a failed line naming the demo text', async () => {
  const { kit, copy } = emphasised()
  const { report, site, line } = await runStep(
    { copy },
    {
      // The emphasised value is refused, its plain words are taken; two other slots are refused whatever they say.
      refuseWhen: (key, value) => {
        if (key === 'module-2.1' && value.includes('((')) return TOO_LONG
        if (key === 'module-5.1') return TOO_LONG
        // Refused while it holds words; emptying it is taken.
        if (key === 'module-3.1' && value)
          return { code: 'SLOT_NOT_CONTENT', message: 'Markup is not content' }
        return null
      },
      overSlot: (slot) => ({ canHide: slot.key === 'module-3.1' })
    },
    { kit }
  )
  assert.equal(report.status, 'done')
  const plain = line('block-2.1')
  assert.equal(plain.status, 'written')
  assert.equal(plain.ordered, 'Train with a coach who knows you')
  assert.equal(plain.textFallback, 'plain')
  assert.match(plain.reason, /SLOT_TOO_LONG/)
  assert.equal(site.held['module-2.1'], 'Train with a coach who knows you')

  const hidden = line('block-3.1')
  assert.equal(hidden.status, 'hidden')
  assert.equal(hidden.textFallback, 'hidden')
  assert.equal(site.held['module-3.1'], '')

  const stuck = line('block-5.1')
  assert.equal(stuck.status, 'failed')
  assert.equal(stuck.textFallback, 'demo-remains')
  assert.match(stuck.reason, /the demo text remains on the site/)
  assert.equal(site.held['module-5.1'], undefined)

  // The first call and its retry without the refused, then one call per rung that had something to send.
  const applies = site.applies()
  assert.equal(applies.length, 4)
  assert.deepEqual(Object.keys(applies[2].params.changes), ['module-2.1'])
  assert.deepEqual(applies[3].params.empty_slots, ['module-3.1'])
})

test('plain words refused as well go to the hide rung, and a slot the kit keeps is never hidden', async () => {
  const { kit, copy } = emphasised()
  kit.doc.blocks.find((b) => b.id === 'block-2').slots.find((s) => s.id === 'block-2.1').canHide = false
  // The door call keeps the mapping object, which the retry loop changes later: what was sent is recorded as it is asked.
  const asked = []
  const { site, line } = await runStep(
    { copy },
    {
      refuseWhen: (key, value) => {
        if (key !== 'module-2.1') return null
        if (asked.at(-1) !== value) asked.push(value)
        return TOO_LONG
      },
      overSlot: (slot) => (slot.key === 'module-2.1' ? { canHide: true } : {})
    },
    { kit }
  )
  const l = line('block-2.1')
  assert.equal(l.status, 'failed')
  assert.equal(l.textFallback, 'demo-remains')
  assert.deepEqual(
    asked,
    ['Train with a ((span))coach((/span)) who knows you', 'Train with a coach who knows you'],
    'the plain words are sent once'
  )
  assert.ok(
    !site.applies().some((a) => (a.params.empty_slots ?? []).includes('module-2.1')),
    'no hide is asked for'
  )
})

test('a refused slot whose plain words are the words sent, and which the site cannot hide, fails at once', async () => {
  const { site, line } = await runStep(
    {},
    { refuse: { 'module-2.1': TOO_LONG }, overSlot: () => ({ canHide: false }) },
    {}
  )
  assert.equal(line('block-2.1').textFallback, 'demo-remains')
  assert.equal(site.applies().length, 2)
})

for (const capability of ['measured', 'unmeasured']) {
  test(`native ${capability} permission hides refused plain text`, async () => {
    const { site, line } = await runStep(
      {},
      {
        refuseWhen: (key, value) => (key === 'module-2.1' && value ? TOO_LONG : null),
        overSlot: (slot) => (slot.key === 'module-2.1' ? { canHide: capability } : {})
      }
    )
    assert.equal(site.held['module-2.1'], '')
    assert.equal(line('block-2.1').textFallback, 'hidden')
  })
}
