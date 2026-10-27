/**
 * The lines of the template that "Apply" could not write the first time: blocks that share a name get a key each, a
 * pending line gets a second chance, and what no honest line exists for is taken off the page.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { uniqueSlots } from '../src/sites/brief-engines/wp-duplicates.js'
import { fit, isInterface, repairSlots } from '../src/sites/brief-engines/repair.js'
import { editBlocks } from '../src/sites/brief-engines/wp-residue.js'
import { namedBlocks, parseBlocks, withText } from '../src/sites/brief-engines/wp-blocks.js'

const contract = contractFor(defaultContracts(), 'tracy-business/wp7', '1.3.2')
const contentMap = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))

test('every repeated key of the real contract gets a key of its own, in the same shape, and says which block it is', () => {
  const { map, repeats } = uniqueSlots(contentMap)
  assert.equal(map.slots.length, contentMap.slots.length)
  const keys = map.slots.map((s) => s.key)
  assert.equal(new Set(keys).size, keys.length, 'no key is left twice')
  assert.equal(repeats.size, 17, 'the second and third blocks of 15 keys')
  // Only the first of each stays as the contract names it.
  for (const slot of contentMap.slots) assert.ok(keys.includes(slot.key))
  assert.deepEqual(repeats.get('about.text2.heading'), {
    key: 'about.text.heading',
    entity: 'page-about',
    block: 'text.heading',
    attr: 'content',
    nth: 2
  })
  assert.equal(repeats.get('about.text3.intro')?.nth, 3)
  assert.equal(repeats.get('investor-relations.links2.item.2.meta')?.block, 'links.item.2.meta')
  // The sample goes with its own key, so the planner is shown the right words for each block.
  const second = map.slots.find((s) => s.key === 'about.text2.heading')
  assert.equal(second.sample, 'Where we work')
})

test('a key nobody repeats is left alone, and a new key never collides with one the contract already has', () => {
  const slot = (key, entity = 'page-a') => ({
    key,
    entity,
    target: { block: 'b', attr: 'content' },
    sample: key
  })
  const clean = { entities: [], slots: [slot('a.x.y'), slot('a.z.y')] }
  assert.deepEqual(uniqueSlots(clean).map.slots, clean.slots)
  assert.equal(uniqueSlots(clean).repeats.size, 0)
  const taken = { entities: [], slots: [slot('a.text.h'), slot('a.text.h'), slot('a.text2.h', 'page-b')] }
  const { map } = uniqueSlots(taken)
  assert.deepEqual(
    map.slots.map((s) => s.key),
    ['a.text.h', 'a.text3.h', 'a.text2.h'],
    'text2 is taken by another slot, so the second block is text3'
  )
  // A slot with no block to find again (an option) is never renamed: nothing could write it by block.
  const option = {
    entities: [],
    slots: [
      { key: 'o.x', entity: 'o', target: {}, sample: 's' },
      { key: 'o.x', entity: 'o', target: {}, sample: 't' }
    ]
  }
  assert.equal(uniqueSlots(option).repeats.size, 0)
})

test("what is only the template's interface is not asked about; a name or a sentence is", () => {
  for (const sample of ['01', '→', 'View all →', 'Contact', 'Services', '2 / 3', '', 'Ok'])
    assert.equal(isInterface(sample), true, sample)
  for (const sample of [
    'Andrey Kulagin',
    'Chief Executive Officer',
    'Request a quote',
    'Where we work today'
  ])
    assert.equal(isInterface(sample), false, sample)
})

test('a line that is too long is cut back to a sentence, and none that is a hopeless run-on', () => {
  assert.equal(fit('Short.', 40), 'Short.')
  assert.equal(fit('First one. Second one is a good deal longer than the first. Third.', 30), 'First one.')
  assert.equal(fit('one two three four five six seven eight nine ten', 20), null)
  assert.equal(fit('  Spaced \n out  ', 40), 'Spaced out')
})

const site = { name: 'Golden Crust Bakery', languages: ['en-us'] }
const slots = [
  {
    key: 'a',
    label: 'about — text.intro',
    sample: 'Head office and plant sit in the Vorsino industrial park.',
    maxCharacters: 120
  },
  { key: 'b', label: 'about — team', sample: 'Andrey Kulagin', maxCharacters: 40 },
  { key: 'c', label: 'about — meta', sample: '01', maxCharacters: 10 }
]
const saying =
  (answer, asked = []) =>
  async (call) => {
    asked.push(call)
    return answer
  }

test('the second chance asks for every line that is more than interface and parses what comes back', async () => {
  const asked = []
  const out = await repairSlots({
    generate: saying('Here: {"values": {"a": "We bake in Hanoi.", "b": null, "z": "ignored"}}', asked),
    site,
    slots
  })
  assert.deepEqual(out.texts, { a: 'We bake in Hanoi.' })
  assert.deepEqual([...out.nulls], ['b'])
  assert.deepEqual(
    asked[0].input.lines.map((l) => l.key),
    ['a', 'b'],
    'the numbering is not put to the model'
  )
  assert.match(asked[0].system, /states\s+no fact/)
})

test('a line the model leaves out of its answer stays what it was, and a line too long to fit goes', async () => {
  const out = await repairSlots({
    generate: saying('{"values": {"b": "A very long answer that has no end in sight and cannot be cut"}}'),
    site,
    slots
  })
  assert.deepEqual(out.texts, {}, 'nothing was said for `a`, so nothing is decided')
  assert.deepEqual([...out.nulls], ['b'], 'an answer that cannot fit its slot is no answer')
})

test('an answer that is not JSON decides nothing', async () => {
  for (const answer of ['no', '{"values": ', '{"values": 7}', '']) {
    const out = await repairSlots({ generate: saying(answer), site, slots })
    assert.deepEqual([out.texts, [...out.nulls]], [{}, []])
  }
  const none = []
  await repairSlots({ generate: saying('{}', none), site, slots: [slots[2]] })
  assert.equal(none.length, 0, 'nothing worth asking, nothing asked')
})

const heading = (name, text) =>
  `<!-- wp:heading {"metadata":{"name":"${name}"}} -->\n<h2>${text}</h2>\n<!-- /wp:heading -->`
const page = [
  heading('text.heading', 'One'),
  heading('text.heading', 'Two'),
  heading('text.heading', 'Three')
].join('\n\n')

test("blocks are found by name in document order, and a block's one line of text is replaced and escaped", () => {
  const root = parseBlocks(page)
  assert.equal(namedBlocks(root, 'text.heading').length, 3)
  assert.equal(namedBlocks(root, 'nope').length, 0)
  const out = withText(page, namedBlocks(root, 'text.heading')[1], 'Fish & <chips>')
  assert.ok(out.includes('<h2>Fish &amp; &lt;chips&gt;</h2>'))
  assert.ok(out.includes('<h2>One</h2>') && out.includes('<h2>Three</h2>'))
  const withLink = '<!-- wp:paragraph -->\n<p>Read <a href="/x">more</a></p>\n<!-- /wp:paragraph -->'
  assert.equal(
    withText(withLink, parseBlocks(withLink).children[0], 'x'),
    null,
    'two runs of text are not one line'
  )
})

test("lines go into the nth block of a name, and a block goes only while it still shows the template's words", () => {
  const out = editBlocks(
    page,
    [
      { block: 'text.heading', nth: 2, value: 'Second' },
      { block: 'text.heading', nth: 3, value: 'Third' },
      { block: 'text.heading', nth: 9, value: 'Nowhere' }
    ],
    []
  )
  assert.deepEqual([out.edited, out.dropped], [2, 0])
  assert.ok(
    out.markup.includes('<h2>One</h2>') &&
      out.markup.includes('<h2>Second</h2>') &&
      out.markup.includes('<h2>Third</h2>')
  )
  const gone = editBlocks(
    page,
    [],
    [
      { block: 'text.heading', nth: 1, sample: 'One' },
      { block: 'text.heading', nth: 3, sample: 'Three' },
      { block: 'text.heading', nth: 2, sample: 'Not what it shows' }
    ]
  )
  assert.equal(gone.dropped, 2, "the block that no longer shows its sample is somebody's, and stays")
  assert.deepEqual(
    parseBlocks(gone.markup).children.map((b) => b.attrs.metadata.name),
    ['text.heading']
  )
  assert.ok(gone.markup.includes('<h2>Two</h2>'))
})

test('a line the template ships empty is not asked about, even when everything is asked', async () => {
  const asked = []
  await repairSlots({
    generate: saying('{"values": {}}', asked),
    site,
    slots: [
      { key: 'e', label: 'x', sample: ' ', maxCharacters: 40 },
      { key: 'n', label: 'x', sample: '380+', maxCharacters: 40 }
    ],
    askAll: true
  })
  assert.deepEqual(
    asked[0].input.lines.map((l) => l.key),
    ['n'],
    'a number that is a fact is asked; an empty line is not'
  )
})

test('🔒 the second chance reads "null" as null and an entity as its character (tamq-7q-bizwp4, 08/10/2026)', async () => {
  const shown = []
  const { texts, nulls } = await repairSlots({
    generate: async ({ input }) => {
      shown.push(...input.lines)
      return JSON.stringify({
        values: { 'contact.hours': 'null', 'home.point': 'Bánh sourdough &amp; bánh Việt' }
      })
    },
    site: { name: 'Tamarind Bakery' },
    slots: [
      { key: 'contact.hours', label: 'hours', sample: 'Mon–Fri, 9:00–18:00 (MSK)', maxCharacters: 80 },
      { key: 'home.point', label: 'point', sample: 'ISO 9001 &amp; ISO 45001 certified', maxCharacters: 80 }
    ]
  })
  assert.equal(shown.find((l) => l.key === 'home.point')?.sample, 'ISO 9001 & ISO 45001 certified')
  assert.ok(nulls.has('contact.hours'))
  assert.equal(texts['contact.hours'], undefined)
  assert.equal(texts['home.point'], 'Bánh sourdough & bánh Việt')
})

test('🔒 the second chance names the language it writes in, and that language is never taken from a place in the brief (TCH #1013)', async () => {
  // tamq-7q-tone-wb (08/10/2026): English chosen, a bakery "in Dubai", 30 lines of `/` in Arabic. "The language of the
  // site" is no language a model can read off `languages: ['en-us']` beside "Dubai": it is named, and binding.
  const asked = []
  const generate = async (call) => {
    asked.push(call)
    return JSON.stringify({ values: {} })
  }
  const slots = [{ key: 'home.hero', label: 'hero', sample: 'We build bridges that last', maxCharacters: 80 }]
  const bakery = { name: 'Tamarind Bakery', about: 'A small family bakery in Dubai', tone: 'bold' }
  await repairSlots({ generate, site: { ...bakery, languages: ['en-us'] }, slots })
  await repairSlots({ generate, site: { ...bakery, languages: ['vi-vn'], sourceLanguage: 'vi-vn' }, slots })
  await repairSlots({ generate, site: { ...bakery, languages: [] }, slots })
  assert.deepEqual(
    asked.map((call) => call.input.language),
    ['en-us', 'vi-vn', 'en']
  )
  assert.match(asked[0].system, /"language"/)
  assert.match(asked[0].system, /never (?:infer|guess|take)/i)
  assert.match(asked[0].system, /place|city|country/i)
})

test('the second chance carries the definition of the customer’s tone, and nothing about tone when none was chosen (TCH #1013)', async () => {
  const { TONES } = await import('../../../packages/cms/tracy-seeder/src/tone.mjs')
  const bold = []
  await repairSlots({ generate: saying('{"values": {}}', bold), site: { ...site, tone: 'Bold' }, slots })
  assert.ok(bold[0].system.includes(TONES.bold), 'the definition of Bold, not the word alone')
  const none = []
  await repairSlots({ generate: saying('{"values": {}}', none), site, slots })
  assert.doesNotMatch(none[0].system, /TONE OF VOICE/)
})
