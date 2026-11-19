// Legal owner text is written at every place and reads as typed (#575): a business name with `&` stopped every page's
// search title (`value_not_escaped` at og_title) on a real plan. For each invented business name with an ampersand,
// quotes, an apostrophe, angle brackets, a text that reads as a character reference, accents or an emoji, the whole
// plan of the invented florist on the real JA Boxing kit is written (no guard refuses it), and every value and record
// column the name reaches reads back as the name: escaped where the place prints raw, its look-alike where a print
// cannot show the mark (`draft-write-look-alike.mjs`). Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-owner-text.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeEntities } from '../domain/draft-write-entities.mjs'
import { safeValue, safetyAt, unsafeAt } from '../domain/draft-write-escape.mjs'
import { lookAlike, NEUTRAL_MARKS } from '../domain/draft-write-look-alike.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { kit, site } from './fixtures/draft-write/guarded.mjs'

// Each name starts with a mark no other words of the plan hold, so the values it reaches can be found. Each is at most
// as long as the florist's own name, so no field limit is reached.
const NAMES = [
  `Zq T&J's "Rg"`,
  'Zq R&D Gym',
  'Zq &copy Club',
  'Zq AT&amp;T',
  'Zq Joe <3 Gym',
  'Zq A > B Gym',
  'Zq Caf\u00e9 \u00d1and\u00fa \u{1f94a}',
  `Zq L'Atelier`
]
// A search title of each page holds an ampersand too (it fell back to the business name in the real plan).
const seoOf = (i) => `Zq K&J ${i}`
const SEO = /Zq K&J \d+/
const LOOK_ALIKES = {
  '\uff06': '&',
  '\uff1c': '<',
  '\uff1e': '>',
  '\u201c': '"',
  '\u201d': '"',
  '\u2018': "'",
  '\u2019': "'"
}
/** The words a visitor reads from a value written at a place of `kind`. */
const readsAs = (value, kind) => {
  const text = ['raw', 'html'].includes(kind) ? decodeEntities(value) : value
  return text
    .replace(/[\uff06\uff1c\uff1e\u201c\u201d\u2018\u2019]/g, (c) => LOOK_ALIKES[c])
    .replaceAll('\u2060', '')
}

const orderWith = (name) => {
  const old = site.order.facts.find((f) => f.kind === 'business.name').value
  const json = JSON.stringify(site.order)
    .split(JSON.stringify(old).slice(1, -1))
    .join(JSON.stringify(name).slice(1, -1))
  const order = JSON.parse(json)
  order.pages.forEach((page, i) => {
    if (page.seo) page.seo.title = seoOf(i)
  })
  return order
}

/** Every value and record column of a plan with the kind of its place. */
function* writtenOf(plan) {
  for (const op of plan.ops) {
    for (const v of op.values ?? [])
      if (typeof v.value === 'string')
        yield {
          op: op.key,
          value: v.value,
          kind: safetyAt(op, v.loc, {
            mapping: kit.mapping,
            slot: v.loc?.slot ? kit.slots.get(v.loc.slot) : null
          }).kind
        }
    if (op.kind.endsWith('.create'))
      for (const [column, text] of Object.entries(op.fields ?? {}))
        if (typeof text === 'string' && column !== 'link')
          yield {
            op: op.key,
            value: text,
            kind: safetyAt(op, { column, entity: op.recordKind }, { mapping: kit.mapping }).kind
          }
  }
}

test('every owner business name is written at every place and reads back as typed', () => {
  for (const name of NAMES) {
    const plan = writePlanOf(orderWith(name), site.aiq, { stored: site.stored })
    const reached = [...writtenOf(plan)].filter((w) => readsAs(w.value, w.kind).includes('Zq '))
    assert.ok(reached.length > 0, `${name}: the name reaches the site`)
    for (const w of reached) {
      const read = readsAs(w.value, w.kind)
      assert.ok(
        read.includes(name.slice(3)) || SEO.test(read),
        `${name} at ${w.op} (${w.kind}) reads ${JSON.stringify(read)}`
      )
    }
  }
})

test('every mark a plain, neutral or piece place cannot show is written as its look-alike, never refused', () => {
  const marked = []
  for (const place of kit.mapping.escapes.places) {
    if (place.escaped === true)
      marked.push({ kind: 'plain', marks: new Set([...(place.unsafe ?? []), ...(place.doorRefuses ?? [])]) })
    if (place.escaped === 'mixed') marked.push({ kind: 'neutral', marks: new Set() })
  }
  assert.ok(marked.length > 10, 'the kit declares its places')
  // No declaration, and an xpath piece (the DOM reads a reference written into an element).
  marked.push({ kind: 'neutral', marks: new Set() }, { kind: 'piece', marks: new Set() })
  for (const how of marked)
    for (const words of [...NAMES, seoOf(1), '&#39; and &#x27;', 'a &amp b']) {
      const value = safeValue(words, how)
      assert.equal(unsafeAt(value, how), null, `${words} at ${how.kind} ${[...how.marks]}`)
      assert.equal(readsAs(value, how.kind), words)
      // Outside a place the build escapes, nothing written reads as a character reference.
      if (how.kind !== 'raw') assert.ok(!/&[#A-Za-z]/.test(value), `${words} at ${how.kind}`)
    }
})

test('a real tag at a plain or neutral place keeps its brackets, so the guard still refuses it', () => {
  assert.equal(lookAlike('<b>bold</b>', NEUTRAL_MARKS), '<b>bold</b>')
  assert.equal(
    unsafeAt(safeValue('<b>x</b>', { kind: 'neutral' }), { kind: 'neutral' }),
    'not_escape_neutral'
  )
})
