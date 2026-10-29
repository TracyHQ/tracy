// Spec TracyHQ/tracy#189 item 30: an offering's name is placed within the box the template measured for it, so the site
// never refuses it and never keeps the demo's name. A name too long for its box takes a shorter form made of its own words,
// or its card goes whole. Two made-up trades: a bakery and a pottery studio. All names below are made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSite } from '../domain/site-plan.mjs'
import { shortOfferingName } from '../domain/offering-short-name.mjs'

const served = { set: { contentHash: 'c'.repeat(64) }, questions: [{ id: 'name', kind: 'text' }] }

/** Offering cards as articles: a title measured at `box` characters, though the contract allows 50, and an intro. */
function cardsMap(box, count = 3) {
  const slots = []
  const entities = []
  for (let i = 0; i < count; i++) {
    const entity = `article-${40 + i}`
    entities.push({ key: entity, kind: 'article' })
    const group = { id: `${entity}.offering`, item: i, kind: 'service' }
    slots.push(
      {
        key: `${entity}.0`,
        entity,
        column: 'title',
        type: 'text',
        role: 'offering.name',
        sample: `Demo Class ${i}`,
        maxCharacters: 50,
        fit: { measured: true, lines: { desktop: 1 }, maxChars: { desktop: box }, maxCharacters: box },
        group
      },
      {
        key: `${entity}.1`,
        entity,
        column: 'introtext',
        type: 'text',
        role: 'offering.description',
        sample: 'Lorem ipsum dolor sit amet.',
        maxCharacters: 300,
        group
      }
    )
  }
  return { roleVocabularyVersion: 'place-content-roles/3', entities, pages: [], slots }
}

const brief = (name, labels) => ({
  business: { name },
  reading: {
    services: labels.map((label, i) => ({ id: `o${i}`, label, quote: label, source: { kind: 'bio' } }))
  }
})

const plan = (b, map) => planSite(b, served, { now: '2026-10-30T00:00:00.000Z', contentMap: map }).honesty

test('#189 item 30 a short form is the label’s own words ending on what the name is about, never cut', () => {
  assert.equal(shortOfferingName('Seasonal Fruit Tarts', 12), 'Fruit Tarts')
  assert.equal(shortOfferingName('Personal Wheel Throwing', 15), 'Wheel Throwing')
  assert.equal(shortOfferingName('Pottery for Beginners', 12), 'Pottery')
  assert.equal(shortOfferingName('Rye Bread', 12), 'Rye Bread', 'a label that fits stays whole')
  // Only words every offering could carry, or nothing that fits: there is no honest short form.
  assert.equal(shortOfferingName('Private Lessons for Kids', 10), null)
  assert.equal(shortOfferingName('Extraordinarily', 8), null)
})

test('#189 item 30 a bakery: a name over its measured box takes its short form, within the box', () => {
  const h = plan(
    brief('Juniper Lane Bakery', ['Sourdough', 'Seasonal Fruit Tarts', 'Rye Bread']),
    cardsMap(12)
  )
  assert.equal(h.values['article-41.0'].value, 'Fruit Tarts')
  assert.equal(h.values['article-41.0'].reason, 'brief-offering-short')
  assert.equal(
    h.values['article-41.0'].evidence,
    'Seasonal Fruit Tarts',
    'the evidence is the brief’s whole label'
  )
  for (const key of ['article-40.0', 'article-41.0', 'article-42.0'])
    assert.ok([...h.values[key].value].length <= 12, `${key} fits its box`)
  assert.ok(!h.records.some((r) => r.decision === 'hide'), 'every offering keeps its card')
})

test('#189 item 30 a pottery studio: a name with no honest short form takes its card off, and says which', () => {
  const h = plan(
    brief('Kilnhouse Studio', ['Glazing', 'Private Lessons for Kids', 'Raku Firing']),
    cardsMap(10)
  )
  assert.equal(h.values['article-40.0'].value, 'Glazing')
  assert.ok(!('article-41.0' in h.values), 'no demo name and no over-long name is written')
  const off = h.records.find((r) => r.group === 'article-41.offering')
  assert.equal(off.decision, 'hide')
  assert.equal(off.reason, 'offering-name-unavailable')
  assert.equal(off.assigned.label, 'Private Lessons for Kids')
  assert.ok(h.hide.some((x) => x.how === 'entity' && x.entity === 'article-41'))
  assert.ok(!('article-41.offering' in h.cardNames))
})
