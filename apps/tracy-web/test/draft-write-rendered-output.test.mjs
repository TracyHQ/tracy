// What a whole draft build prints holds no markup the kit does not declare, whatever the writer wrote (#597). Each
// hostile value is set in every writer text field of the florist's order; a value the order check or the guard refuses
// stops the build before any door, and every value that gets through is written on the memory site and printed the way
// the measured template prints it (`renderedOf`: raw, the JA ACM markers replaced blindly). The scan then finds no tag,
// handler, broken attribute or code address the blank site, the fields' inline parts or the library did not declare.
// A control run with the escaping taken out shows the scan finds what it must. Invented data.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-rendered-output.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { escapeRaw } from 'website-opportunities/domain/draft-write-escape.mjs'
import { placesOfOrder } from 'website-opportunities/domain/write-order-check.mjs'
import {
  renderedOf,
  tagNamesIn,
  undeclaredIn,
  valuesOf
} from 'website-opportunities/domain/write-order-memory-render.mjs'
import { blankSite, florist, planOf, runOn } from './draft-write-fixtures.mjs'

const HOSTILE = [
  `" onmouseover="zq()`,
  `' onfocus='zq()`,
  `x" data-zq="1`,
  `Tom's "best" & co`,
  '&quot; onzq=&quot;x',
  'javascript:zq()',
  '((script))zq((/script))',
  'Kids (6+)) and ((zq',
  'a)) ((zq',
  '((zq title="a"))x((/zq))',
  '<zq onclick=zq()>',
  'See you soon ((:'
]

/** The tag names the kit declares: the blank site's own pages, every field's inline parts, the library's HTML. */
function allowedOf(plan) {
  const allowed = tagNamesIn(renderedOf(blankSite()))
  for (const b of florist.aiq.blockStore.blocks)
    for (const f of [...(b.fields ?? []), ...(b.itemFields ?? [])])
      for (const t of [...(f.inline?.wrapper ?? []), ...(f.inline?.emphasis ?? []).map((p) => p.tag)])
        allowed.add(t)
  for (const op of plan.ops) {
    if (op.kind === 'library.create') for (const t of tagNamesIn(op.html)) allowed.add(t)
    // The elements the mapping's pieces name: a created record's frame is made of them (`draft-write-frame.mjs`).
    for (const v of op.values ?? [])
      for (const step of String(v.loc.xpath ?? '').split('/')) {
        const name = /^([a-z][a-z0-9]*)(\[\d+\])?$/.exec(step)?.[1]
        if (name) allowed.add(name)
      }
  }
  return allowed
}

/**
 * The florist's order with `words` in every writer text field it fits; a library block's fields are left as they are
 * (its HTML is rendered from them before the order, so other words there are a stale block, not a test of escaping).
 */
function orderWith(words) {
  const order = structuredClone(florist.order)
  let set = 0
  for (const { block, place } of placesOfOrder(order))
    for (const e of block.library ? [] : (place.fields ?? []))
      if (
        e.type === 'text' &&
        e.from === 'writer' &&
        typeof e.value === 'string' &&
        (e.limit ?? 99) >= words.length
      ) {
        e.value = words
        set += 1
      }
  return { order, set }
}

const allowed = allowedOf(planOf())
// The blank site's own values are the kit's: the scan reads only what the build wrote.
const known = valuesOf(blankSite())
const scan = (memory) => undeclaredIn(renderedOf(memory, { known }), allowed)

test('an ordinary build prints nothing undeclared, and the scan reads what it wrote', async () => {
  const memory = blankSite()
  await runOn(memory)
  assert.ok(renderedOf(memory, { known }).includes('Larkspur Blooms'))
  assert.deepEqual(scan(memory), [])
})

test('hostile writer values at every field: refused before any door, or printed with nothing undeclared', async () => {
  const outcome = {}
  for (const words of HOSTILE) {
    const { order, set } = orderWith(words)
    assert.ok(set > 20, `${set} fields carry ${words}`)
    let plan
    try {
      plan = planOf(order)
    } catch (error) {
      assert.equal(error.noRerun, true, words)
      outcome[words] = `refused: ${error.code}`
      continue
    }
    const memory = blankSite()
    const result = await runOn(memory, { plan })
    assert.equal(result.status, 'done', words)
    assert.deepEqual(scan(memory), [], words)
    outcome[words] = 'written, 0 found'
  }
  // Markup forms stop the build; quotes, entities and scheme words are written and print as words.
  assert.equal(outcome['((script))zq((/script))'], 'refused: order_invalid')
  assert.equal(outcome['See you soon ((:'], 'refused: order_invalid')
  assert.equal(outcome['<zq onclick=zq()>'], 'refused: order_invalid')
  assert.equal(outcome[`" onmouseover="zq()`], 'written, 0 found')
  assert.equal(outcome[`Tom's "best" & co`], 'written, 0 found')
})

test('control: with the escaping taken out, the same build prints a handler and a broken attribute', async () => {
  const words = `" onmouseover="zq()`
  const plan = planOf(orderWith(words).order)
  let undone = 0
  for (const op of plan.ops)
    for (const v of op.values ?? [])
      if (v.value === escapeRaw(words)) {
        v.value = words
        undone += 1
      }
  assert.ok(undone > 5, `${undone} values put back unescaped`)
  const memory = blankSite()
  await runOn(memory, { plan })
  const found = scan(memory)
  assert.ok(found.some((f) => f.what === 'handler'))
  assert.ok(found.some((f) => f.what === 'attribute'))
})

test('control: a marker stored in a JA ACM value is printed as the tag the converter makes', async () => {
  const memory = blankSite()
  await runOn(memory)
  const row = [...memory.site.records.module.values()].find((m) =>
    String(m.params ?? '').includes('jatools-config')
  )
  const params = JSON.parse(row.params)
  params['jatools-config'] = JSON.stringify({ zq: '((zq onmouseover=zq()))x((/zq))' })
  row.params = JSON.stringify(params)
  const found = scan(memory)
  assert.ok(found.some((f) => f.what === 'tag' && f.name === 'zq'))
  assert.ok(found.some((f) => f.what === 'handler'))
})
