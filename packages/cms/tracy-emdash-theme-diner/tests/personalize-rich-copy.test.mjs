// tools/personalize.mjs, a `copy` rule on a rich-text field (the shared tool; the case and the measurement are in JA
// Restaurant's `tests/personalize-rich-copy.test.mjs`). This template's four rich-text copy fields — the chef's card, two
// feature cards and the contact card — were never asked: `writeCopy` read only string fields, so they kept the demo's words
// with no word in the report. Each is now asked as its text and written back as blocks; the chef's name stays a heading.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { writeCopy } from '../tools/personalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))
const root = seed.defaultLocale ?? 'en'
const seedEntries = Object.entries(seed.content).flatMap(([collection, rows]) =>
  rows.map((e) => ({ collection, slug: e.slug, locale: e.locale ?? root, data: e.data ?? {} }))
)
const facts = { name: 'Trattoria Lume', about: 'An Italian trattoria in Da Nang.', sector: 'restaurant' }
const model = { url: 'http://model.test/v1/chat', key: 'k', model: 'm' }
const rich = map.copy.filter((c) =>
  Array.isArray(
    seedEntries.find((x) => x.collection === c.collection && x.slug === c.slug && x.locale === root)?.data[
      c.field
    ]
  )
)

test('every rich-text copy field is asked, and an answer of its shape comes back as blocks', async () => {
  assert.ok(rich.length > 0, 'this template has rich-text copy fields')
  const asked = []
  const fetchImpl = async (_url, init) => {
    const user = JSON.parse(JSON.parse(init.body).messages[1].content)
    asked.push(...user.fields)
    const out = Object.fromEntries(
      user.fields.map((f) => [
        f.key,
        (f.parts ?? ['paragraph']).map((_, i) => `Part ${String(i + 1)}.`).join('\n\n')
      ])
    )
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }))
  }
  const only = [...new Set(rich.map((c) => `${c.collection}.${c.slug}`))]
  const written = await writeCopy({ model, map, facts, locale: root, seedEntries, fetchImpl, only })
  for (const c of rich) {
    const key = `${c.collection}.${c.slug}.${c.field}`
    assert.ok(
      asked.some((f) => f.key === key),
      `${key} is asked`
    )
    const blocks = written[key]
    assert.ok(Array.isArray(blocks) && blocks.length > 0, `${key} is written as blocks`)
    assert.equal(blocks[0].children[0].text, 'Part 1.')
  }
  const chef = written['features_intro.meet-our-chef.description']
  assert.deepEqual(
    chef.map((b) => [b.style, b.children.map((c) => c.text).join('')]),
    [
      ['h4', 'Part 1.'],
      ['normal', 'Part 2.']
    ],
    'the heading stays a heading'
  )
})
