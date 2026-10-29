/**
 * Tabs the site plan binds to offerings are one per offering, titled with the name as given; an outline of a session is
 * the page's offering's own (spec TracyHQ/tracy#189, round 9). Fictional bakery and dental clinic.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { processWritingOf } from '../src/process-writing.mjs'

const tabs = (entity, count, presentation = 'offering-tabs') =>
  Array.from({ length: count }, (_, item) =>
    ['title', 'description'].map((field) => ({
      key: `${entity}.${item}.${field}`,
      entity,
      type: 'text',
      role: `step.${field}`,
      group: { id: `${entity}.step.${item}`, kind: 'step', item, presentation },
      sample: field === 'title' ? `Demo phase ${item}` : '((p))Demo.((/p))((ul))((li))Demo((/li))((/ul))'
    }))
  ).flat()

for (const [trade, names] of [
  ['bakery', ['Sourdough', 'Rye loaf', 'Croissants', 'Celebration cakes']],
  ['dental clinic', ['Checkups', 'Cleaning', 'Whitening', 'Braces']]
]) {
  test(`${trade}: every bound tab is its own offering, named as given, with no first-visit tab`, () => {
    const slots = tabs('module-8', 4)
    const offerings = Object.fromEntries(names.map((n, i) => [`module-8.step.${i}`, n]))
    const plan = processWritingOf(slots, offerings)
    const titles = slots.filter((s) => s.role === 'step.title').map((s) => plan.get(s.key))
    assert.deepEqual(
      titles.map((t) => [t.subject, t.name]),
      names.map((n) => ['offering', n])
    )
  })

  test(`${trade}: a tab with no bound offering is unavailable, never a free first-visit tab`, () => {
    const slots = tabs('module-8', 4)
    const offerings = Object.fromEntries(names.slice(0, 3).map((n, i) => [`module-8.step.${i}`, n]))
    const plan = processWritingOf(slots, offerings)
    assert.deepEqual(
      slots.filter((s) => s.role === 'step.title').map((s) => plan.get(s.key).subject),
      ['offering', 'offering', 'offering', 'unavailable']
    )
  })

  test(`${trade}: an outline of a session is written for the page's offering`, () => {
    const slots = tabs('article-5', 3, 'session-outline')
    const plan = processWritingOf(slots, { 'article-5.offering': names[1] })
    const task = plan.get('article-5.0.title')
    assert.equal(task.kind, 'session-outline')
    assert.equal(task.offering, names[1])
    assert.equal(task.count, 3)
  })
}
