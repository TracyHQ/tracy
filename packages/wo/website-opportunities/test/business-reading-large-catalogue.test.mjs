// 🔒 A LARGE CATALOGUE IS READ WHOLE (TracyHQ/tracy#242): a restaurant with dozens of dishes or a shop with many products
// keeps every quoted offering up to 40 a group, not the first 12. Fictional businesses: a noodle bar and a hardware store.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'

for (const [name, kind] of [
  ['Lantern Noodle Bar', 'noodles'],
  ['Bolt Hardware', 'tools']
]) {
  test(`${name}: 35 quoted offerings are all kept`, () => {
    const items = Array.from(
      { length: 35 },
      (_, i) => `${kind} item${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26)}`
    )
    const sources = readingSourcesOf({ bio: `Our menu: ${items.join(', ')}.` })
    const answer = {
      services: items.map((item) => ({ name: item, quote: item, ref: 'bio' }))
    }
    const reading = checkBusinessReading(answer, sources)
    assert.equal(reading.services.length, 35)
  })
}
