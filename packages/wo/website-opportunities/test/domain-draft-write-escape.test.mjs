// Every value of a draft write is safe as raw HTML where it prints (ticket #597): the template escapes almost nothing
// (door measurements of plugin 0.24.85), so the plan escapes the words at a place printed raw, writes them escape
// neutral at a place not measured, leaves a piece to the DOM, and the guard refuses whatever is not safe. A double
// parenthesis is refused everywhere but in the declared markers of a codes field. Invented data (the JA Boxing florist).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-escape.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  doubleParenthesisProblem,
  escapeRaw,
  safetyAt,
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

test('each place has its kind: a JA ACM data key and a module title raw, a piece to the DOM, the rest neutral', () => {
  const kindOf = (match) => {
    for (const op of plan.ops) for (const v of op.values ?? []) if (match(op, v)) return safetyAt(op, v.loc)
    throw new Error('no value matches')
  }
  assert.equal(
    kindOf((_, v) => v.loc.nestedJson === 'jatools-config' && !v.loc.xpath),
    'raw'
  )
  assert.equal(
    kindOf((op, v) => op.kind === 'module.copy' && v.loc.column === 'title'),
    'raw'
  )
  assert.equal(
    kindOf((op, v) => op.kind === 'contract.apply' && v.loc.column === 'value'),
    'raw'
  )
  assert.equal(
    kindOf((_, v) => Boolean(v.loc.xpath)),
    'piece'
  )
  assert.equal(
    kindOf((op, v) => op.kind === 'article.create' && v.loc.column === 'title'),
    'neutral'
  )
  assert.equal(
    kindOf((op) => op.kind === 'site.identity'),
    'neutral'
  )
  assert.equal(
    safetyAt(
      { kind: 'module.copy' },
      { entity: 'module-177', column: 'params', nestedJson: 'jatools-config', jsonPath: ['info-note'] }
    ),
    'neutral'
  )
  assert.equal(safetyAt({ kind: 'article.create' }, { entity: 'article-16', column: 'introtext' }), 'html')
})

test('a hostile writer value is escaped where it prints raw, neutral where not measured, quotes typographic in a piece', () => {
  const raw = 'home.home-b3.paragraph'
  assert.equal(valueOf(planWith(raw, HOSTILE), raw), 'Tom&#039;s &quot;best&quot; &amp; co')
  const neutral = 'class.class-b3.paragraph-3'
  assert.equal(valueOf(planWith(neutral, HOSTILE), neutral), 'Tom’s “best” & co')
  // A piece: the DOM escapes `&`, `<`, `>`, but leaves a quote in a text node, so the words get typographic quotes.
  const piece = 'class.class-b3.paragraph'
  assert.equal(valueOf(planWith(piece, HOSTILE), piece), 'Tom\u2019s \u201cbest\u201d & co')
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

test('the guard refuses a value not escaped at a raw place, or not escape neutral at a place not measured', () => {
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
  for (const words of ['a "b"', "it's", '&amp; co', '&#39;'])
    assert.equal(
      guarded((p) => {
        valueWhere(p, (op, v) => op.kind === 'article.create' && v.loc.column === 'metadesc').value = words
      }),
      'value_not_escaped',
      words
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
