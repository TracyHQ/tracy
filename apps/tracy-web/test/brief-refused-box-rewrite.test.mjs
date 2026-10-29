/**
 * Spec TracyHQ/tracy#189 item 30: a line the site refuses as too long for its box is written shorter once, in every place
 * that held it; refused again, its card is taken off whole, never left with the template's demo name. Two made-up trades:
 * a bakery and a pottery studio.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { writeContract } from '../src/sites/brief-engines/joomla.js'
import {
  characterRefusals,
  fitsRewrite,
  refusedCardHides,
  rewriteWithinBox
} from '../src/sites/brief-engines/refused-box-rewrite.js'

/** A contract door that refuses, as the plugin does, the first line over its box. */
function door(boxes) {
  const writes = []
  const applyJoomlaContract = async ({ mapping }) => {
    for (const [key, value] of Object.entries(mapping.changes)) {
      const limit = boxes[key]
      if (limit && [...value].length > limit)
        throw new Error(
          `SLOT_TOO_LONG: Content too long for its box: rewrite it shorter, at most ${limit} characters, keeping its meaning (never cut it or add an ellipsis): ${key}`
        )
    }
    writes.push({ ...mapping.changes })
  }
  return { applyJoomlaContract, writes }
}

const reading = { contract: 'c', revision: 'r1' }
const base = { apply: async () => reading, siteKey: 's', reading, evidence: {}, timed: (job) => job() }

test('#189 item 30 the refusal names the line and the characters its box holds', () => {
  assert.deepEqual(
    characterRefusals(
      'SLOT_TOO_LONG: Content too long for its box: rewrite it shorter, at most 12 characters, keeping its meaning (never cut it or add an ellipsis): article-41.4'
    ),
    [{ key: 'article-41.4', limit: 12 }]
  )
  assert.deepEqual(characterRefusals('Content cannot activate an empty slot: module-3.1'), [])
})

test('#189 item 30 a bakery: a refused name is written shorter once, and every line that held it agrees', async () => {
  const { applyJoomlaContract, writes } = door({ 'article-41.4': 12 })
  const asked = []
  const changes = {
    'article-41.4': 'Seasonal Fruit Tarts',
    'article-41.7': 'Seasonal Fruit Tarts',
    'article-41.0': 'Tarts baked each morning with fruit from the market.'
  }
  const refused = await writeContract({
    ...base,
    applyJoomlaContract,
    changes,
    shorten: async (asks) => {
      asked.push(...asks)
      return { 'article-41.4': 'Fruit Tarts' }
    }
  })
  assert.deepEqual(refused, [])
  assert.deepEqual(asked, [{ key: 'article-41.4', value: 'Seasonal Fruit Tarts', limit: 12 }])
  assert.equal(writes.length, 1)
  assert.equal(writes[0]['article-41.4'], 'Fruit Tarts')
  assert.equal(writes[0]['article-41.7'], 'Fruit Tarts', 'the mirror of the name takes the same words')
  assert.equal(changes['article-41.4'], 'Fruit Tarts', 'the caller knows what was written')
})

test('#189 item 30 a pottery studio: refused again after the one rewrite, the line is set aside, never asked twice', async () => {
  const { applyJoomlaContract, writes } = door({ 'module-12.cards.title.1': 8 })
  let calls = 0
  const refused = await writeContract({
    ...base,
    applyJoomlaContract,
    changes: { 'module-12.cards.title.1': 'Raku Firing Evenings', 'module-12.cards.title.0': 'Glazing' },
    shorten: async () => {
      calls += 1
      return { 'module-12.cards.title.1': 'Raku Firing' }
    }
  })
  assert.equal(calls, 1)
  assert.deepEqual(refused, ['module-12.cards.title.1'])
  assert.deepEqual(writes, [{ 'module-12.cards.title.0': 'Glazing' }])
})

test('#189 item 30 a shorter name uses only the name’s own words, within the box, never an ellipsis', async () => {
  const name = { key: 'k', value: 'Seasonal Fruit Tarts', limit: 12, role: 'offering.name' }
  assert.equal(fitsRewrite(name, 'Fruit Tarts'), true)
  assert.equal(fitsRewrite(name, 'Cake Slices'), false, 'an invented name')
  assert.equal(fitsRewrite(name, 'Seasonal…'), false)
  assert.equal(fitsRewrite(name, 'Seasonal Fruit'), false, 'over the box')
  const line = {
    key: 'p',
    value: 'Throw your first bowl on the wheel tonight',
    limit: 30,
    role: 'editorial.heading'
  }
  assert.equal(fitsRewrite(line, 'Throw your first bowl tonight'), true)

  // The model invents a name: dropped, and the name takes its own short form.
  const inventing = {
    chat: async () => JSON.stringify({ lines: { k: 'Cake Slices', p: 'Your first bowl, tonight' } })
  }
  assert.deepEqual(await rewriteWithinBox({ asks: [name, line], model: inventing }), {
    k: 'Fruit Tarts',
    p: 'Your first bowl, tonight'
  })
  // No model: a name still takes its short form; free words are not invented.
  assert.deepEqual(await rewriteWithinBox({ asks: [name, line], model: null }), { k: 'Fruit Tarts' })
  const failing = { chat: async () => Promise.reject(new Error('down')) }
  assert.deepEqual(await rewriteWithinBox({ asks: [line], model: failing }), {})
})

test('#189 item 30 a card whose name is still refused is taken off whole: an article, or an item of a list', () => {
  const contentMap = {
    entities: [
      { key: 'article-41', kind: 'article' },
      { key: 'module-12', kind: 'module' }
    ],
    slots: [
      {
        key: 'article-41.4',
        entity: 'article-41',
        column: 'title',
        type: 'text',
        role: 'offering.name',
        group: { id: 'article-41.offering', item: 0, kind: 'service' }
      },
      ...[0, 1].map((i) => ({
        key: `module-12.cards.title.${i}`,
        entity: 'module-12',
        column: 'params',
        type: 'text',
        role: 'offering.name',
        jsonPath: ['cards', 'cards[title]', i],
        group: { id: `module-12.service.${i}`, item: i, kind: 'service' }
      })),
      { key: 'module-30.0', entity: 'module-30', type: 'text', role: 'editorial.heading' }
    ]
  }
  const hides = refusedCardHides({
    refused: ['article-41.4', 'module-12.cards.title.1', 'module-30.0'],
    contentMap
  })
  assert.deepEqual(
    hides.map((h) => [h.group, h.how, h.entity, h.reason]),
    [
      ['article-41.offering', 'entity', 'article-41', 'name-refused'],
      ['module-12.service.1', 'item', 'module-12', 'name-refused']
    ]
  )
  assert.equal(hides[1].index, 1)
})
