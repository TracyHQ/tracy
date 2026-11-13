// The two duties of D46 measured on the invented fixtures (#609): every legitimate fact the owner typed survives (in
// its group, or as a fact the writer says in other words), and no copy field the site may say repeats the owner. The
// table is printed; run alone to read it:
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-echo-survival.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { copiesOwner, ownerEchoOf } from '../domain/owner-echo.mjs'
import { ECHO_GROUPS, copyFieldsOf } from '../domain/owner-echo-fields.mjs'
import { readingWithoutOwnerQuotes } from '../domain/owner-statement.mjs'
import { MASSAGE_ANSWER, MASSAGE_BIO, MASSAGE_STATEMENT } from './fixtures/owner-statement/massage-studio.mjs'
import {
  ANSWER_ECHOING_OWNER,
  ANSWER_READING_OWNER,
  OWNER_STATEMENT,
  RESEARCH
} from './fixtures/owner-statement/research.mjs'

const FIXTURES = [
  {
    name: 'massage studio',
    statement: MASSAGE_STATEMENT,
    input: { bio: MASSAGE_BIO },
    answer: MASSAGE_ANSWER
  },
  { name: 'pottery, rewritten', statement: OWNER_STATEMENT, input: RESEARCH, answer: ANSWER_READING_OWNER },
  { name: 'pottery, echoing', statement: OWNER_STATEMENT, input: RESEARCH, answer: ANSWER_ECHOING_OWNER }
]
const KEY = { services: 'name', team: 'name', story: 'text', serviceAreas: 'text', facts: 'text' }
const norm = (t) => String(t ?? '').toLowerCase()

/** Every item of the answer, each `{group, texts}` (its label, and a USP theme's line too). */
const itemsOf = (answer) =>
  ECHO_GROUPS.flatMap((group) =>
    (answer[group] ?? []).map((i) => ({ group, texts: [i[KEY[group] ?? 'label'], i.line].filter(Boolean) }))
  )

/** Whether an item survives in a reading: in its group by its label, or as one of `ownerFacts`. */
const survives = (reading, item) =>
  (Array.isArray(reading[item.group]) &&
    reading[item.group].some((i) => item.texts.some((t) => norm(i.label) === norm(t)))) ||
  (reading.ownerFacts ?? []).some(
    (f) => f.group === item.group && item.texts.some((t) => norm(f.text) === norm(t))
  )

/** Every copy field left in a reading that repeats the owner (the facts for the writer aside). */
const echoesOf = (reading, echo) =>
  ECHO_GROUPS.flatMap((group) =>
    (Array.isArray(reading[group]) ? reading[group] : []).flatMap((i) =>
      copyFieldsOf(group).filter((f) => typeof i[f] === 'string' && copiesOwner(i[f], echo))
    )
  )

test('every owner fact survives the reading and the brief view, and no copy repeats the owner', () => {
  const rows = []
  for (const f of FIXTURES) {
    const sources = readingSourcesOf({ ...f.input, ownerStatement: f.statement })
    const read = checkBusinessReading(f.answer, sources, { trade: 'other' })
    const view = readingWithoutOwnerQuotes({ method: 'model', ...read })
    const echo = ownerEchoOf([f.statement])
    // An item a rule other than the echo guard drops (the USP ladder finds a line generic) is no loss of D46.
    const ladder = new Set((read.uspThemesDropped ?? []).map((d) => norm(d.label)))
    const items = itemsOf(f.answer).filter((i) => !(i.group === 'uspThemes' && ladder.has(norm(i.texts[0]))))
    const row = {
      fixture: f.name,
      factsIn: items.length,
      inReading: items.filter((i) => survives(read, i)).length,
      inBrief: items.filter((i) => survives(view, i)).length,
      copiedInReading: echoesOf(read, echo).length,
      copiedInBrief: echoesOf(view, echo).length
    }
    rows.push(row)
    assert.equal(row.inReading, row.factsIn, `${f.name}: facts lost in the reading`)
    assert.equal(row.inBrief, row.factsIn, `${f.name}: facts lost in the brief view`)
    assert.equal(row.copiedInReading, 0, f.name)
    assert.equal(row.copiedInBrief, 0, f.name)
  }
  console.table(rows)
  assert.equal(rows[0].factsIn, 10, 'the massage studio: eleven items, one USP line the ladder finds generic')
})
