// Replace the words, never the style (spec TracyHQ/tracy#189): a slot whose demo mixes styles inside one line is shown to the
// writer as its style pattern, and the writer's marks never make the slot too long. Fictional bakery and dental clinic slots.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planJoomlaContract } from '../src/plan-joomla-contract.mjs'

const state = {
  contract: 'test/v1',
  revision: 'before',
  slots: [
    {
      key: 'section.title',
      sample: 'OUR BREADS',
      maxCharacters: 14,
      label: 'Breads / main-section',
      inlineStyle: { hint: 'OUR[[br]][[BREADS]]', plain: 'OUR BREADS' }
    },
    { key: 'section.intro', sample: 'Baked since 1990', maxCharacters: 40, label: 'Breads / top-desc' }
  ]
}

test('the writer is told the style of a styled slot, and how to mark it', async () => {
  /** @type {any} */
  let seen = null
  let prompt = ''
  await planJoomlaContract({
    state,
    site: { name: 'Golden Crust Bakery' },
    generate: async ({ system, input }) => {
      prompt = system
      seen = input
      return {
        values: { 'section.title': 'FRESH [[LOAVES]]', 'section.intro': 'Warm rolls daily' },
        pending: []
      }
    }
  })
  const styled = seen.slots.find((/** @type {any} */ s) => s.key === 'section.title')
  assert.equal(styled.style, 'OUR[[br]][[BREADS]]')
  assert.equal(seen.slots.find((/** @type {any} */ s) => s.key === 'section.intro').style, undefined)
  assert.match(prompt, /"style"/)
  assert.match(prompt, /\[\[br\]\]/)
})

test('the marks do not count toward the length: a marked answer within the limit is taken', async () => {
  const result = await planJoomlaContract({
    state,
    site: { name: 'Bright Smile Dental' },
    generate: async () => ({
      // 14 characters of words, 20 with the marks.
      values: { 'section.title': 'SMILE[[br]][[BRIGHT]]', 'section.intro': 'Gentle care for all' },
      pending: []
    })
  })
  assert.equal(result.changes['section.title'], 'SMILE[[br]][[BRIGHT]]')
  assert.ok(!result.pending.includes('section.title'))
})
