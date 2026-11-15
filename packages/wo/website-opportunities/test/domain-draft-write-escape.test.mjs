// Every value of a draft write is safe where it prints (ticket #597): the kit declares how each place prints
// (`mapping.escapes`), so the plan escapes the words at a place printed raw, writes plain words where the template
// escapes, writes escape neutral where it is mixed or not declared, leaves a piece to the DOM, and the guard refuses
// whatever is not safe. A double parenthesis is refused everywhere but in the declared markers of a codes field.
// Invented data (the JA Boxing florist).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-escape.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  doubleParenthesisProblem,
  escapeRaw,
  safeValue,
  typographic,
  unsafeAt
} from '../domain/draft-write-escape.mjs'
import { doorLength, visibleLength } from '../domain/draft-write-length.mjs'
import { runsCodeIn } from '../domain/draft-write-markup.mjs'
import { guardPlan } from '../domain/draft-write-guards.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { fieldEntry, guarded, kit, plan, site, valueWhere } from './fixtures/draft-write/guarded.mjs'

const HOSTILE = `Tom's "best" & co`
/** Every problem code the guard finds after `mutate`, or none. */
const codesAfter = (mutate) => {
  const p = structuredClone(plan)
  mutate(p)
  try {
    guardPlan(p, { order: site.order, kit })
    return []
  } catch (error) {
    return error.details.problems.map((x) => x.code)
  }
}
const valueOf = (p, entry) => p.ops.flatMap((op) => op.values ?? []).find((v) => v.entry === entry)?.value
const planWith = (place, words) => {
  const order = structuredClone(site.order)
  fieldEntry(order, place).value = words
  return writePlanOf(order, site.aiq, { stored: site.stored })
}

test('a hostile writer value is escaped where it prints raw, neutral where mixed, quotes typographic in a piece', () => {
  const raw = 'home.home-b3.paragraph'
  assert.equal(valueOf(planWith(raw, HOSTILE), raw), 'Tom&#039;s &quot;best&quot; &amp; co')
  const attribs = 'class.class-b3.paragraph-3'
  assert.equal(valueOf(planWith(attribs, HOSTILE), attribs), 'Tom&#039;s &quot;best&quot; &amp; co')
  // A piece: the DOM escapes `&`, `<`, `>`, but leaves a quote in a text node, so the words get typographic quotes.
  const piece = 'class.class-b3.paragraph'
  assert.equal(valueOf(planWith(piece, HOSTILE), piece), 'Tom\u2019s \u201cbest\u201d & co')
  // A legacy reference with no semicolon is escaped where it prints raw: it shows as written, not as the sign.
  assert.equal(valueOf(planWith(raw, '&copy 2026'), raw), '&amp;copy 2026')
})

test('a module title through the contract is written neutral: the door counts it raw, so it counts what was written', () => {
  const place = 'home.home-b10.heading'
  const value = valueOf(planWith(place, 'Tom\'s "fresh" & co'), place)
  assert.equal(value, 'Tom\u2019s \u201cfresh\u201d & co')
  assert.equal(doorLength(kit.slots.get('module-175.5'), value), visibleLength('Tom\'s "fresh" & co'))
})

test('escaping keeps every count the writer and the door make', () => {
  assert.equal(visibleLength(escapeRaw(HOSTILE)), visibleLength(HOSTILE))
  assert.equal(visibleLength(typographic(HOSTILE)), visibleLength(HOSTILE))
  // A fixed width column counts its raw value, so the guard holds the escaped value to the slot as the door counts it.
  const slot = [...kit.slots.values()].find((s) => s.column === 'title' && s.entity.startsWith('module-'))
  assert.equal(doorLength(slot, escapeRaw('A & B')), 'A &amp; B'.length)
})

test('the guard refuses a value not safe at its kind of place', () => {
  for (const words of ['a "b"', "it's", 'a < b', 'a & b', '&copy; 2026'])
    assert.equal(
      guarded((p) => {
        valueWhere(p, (_, v) => v.loc.nestedJson && !v.loc.xpath).value = words
      }),
      'value_not_escaped',
      words
    )
  assert.equal(
    guarded((p) => {
      valueWhere(p, (_, v) => v.loc.nestedJson && !v.loc.xpath).value = escapeRaw(HOSTILE)
    }),
    'passed'
  )
  // metadesc is escaped once by the template (unsafe []): plain words pass, a text that reads as a reference does not.
  const metadesc = (words) =>
    guarded((p) => {
      valueWhere(p, (op, v) => op.kind === 'article.create' && v.loc.column === 'metadesc').value = words
    })
  for (const words of ['a "b"', "it's", 'a < b', 'Q & A']) assert.equal(metadesc(words), 'passed', words)
  for (const words of ['&amp; co', '&#39;', '&copy 2026'])
    assert.equal(metadesc(words), 'value_not_escaped', words)
  // A place the kit says the build never writes refuses any value.
  assert.equal(
    guarded((p) => {
      p.ops.find((op) => op.kind === 'category.create').recordKind = 'tag'
    }),
    'place_not_written'
  )
})

test('a double parenthesis is refused at every place, with or without a letter after it', () => {
  for (const words of [
    'Open (weekdays (9 to 5))',
    'See you soon ((:',
    ':))',
    '((b))x((/b))',
    '((script))x((/script))'
  ])
    for (const match of [
      (_, v) => v.loc.nestedJson && !v.loc.xpath,
      (_, v) => Boolean(v.loc.xpath) && v.loc.xpath.endsWith('text()'),
      (op) => op.kind === 'site.identity'
    ])
      assert.ok(
        codesAfter((p) => {
          valueWhere(p, match).value = words
        }).includes('markup_forbidden'),
        words
      )
})

test('only the declared markers of a codes field are kept, well formed, and their converted form passes the reader', () => {
  const p = new Set(['p'])
  assert.equal(doubleParenthesisProblem('((p))Fresh &amp; bright((/p))', p, runsCodeIn), null)
  assert.equal(doubleParenthesisProblem('((p))a))((/p))', p, runsCodeIn), 'double_parenthesis')
  assert.equal(doubleParenthesisProblem('((b))a((/b))', p, runsCodeIn), 'double_parenthesis')
  assert.equal(doubleParenthesisProblem('((p))a', p, runsCodeIn), 'markers_unbalanced')
  const a = new Set(['a'])
  assert.equal(
    doubleParenthesisProblem('((a href="javascript:x"))y((/a))', a, runsCodeIn),
    'markers_run_code'
  )
  assert.equal(doubleParenthesisProblem('((a onclick=f))y((/a))', a, runsCodeIn), 'markers_run_code')
  // The words between kept markers are escaped; the markers are not.
  assert.equal(
    safeValue('((p))A & "B"((/p))', { kind: 'raw', markers: p }),
    '((p))A &amp; &quot;B&quot;((/p))'
  )
  assert.equal(unsafeAt('((p))A &amp; B((/p))', { kind: 'raw', markers: p }), null)
})

test('a contact created with an empty name is refused: the site would write it (measured)', () => {
  for (const name of ['', ' '])
    assert.ok(
      codesAfter((p) => {
        valueWhere(p, (op, v) => op.kind === 'contact.create' && v.loc.column === 'name').value = name
      }).includes('record_name_empty'),
      JSON.stringify(name)
    )
  assert.deepEqual(
    codesAfter(() => {}),
    []
  )
})
