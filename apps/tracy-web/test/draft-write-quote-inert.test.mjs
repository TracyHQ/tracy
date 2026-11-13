// A quote in a plain value is words wherever the write step puts it (#597): a value that tries to leave its quotes
// (`" onmouseover="f()`) is written at every kind of place the florist's order reaches (an HTML text node of a created
// article or a copy, a codes place, a params column) on the memory site, and no stored value then holds a handler
// attribute. An HTML attribute piece escapes the quote itself (the piece functions serialize it as `&quot;`), and an
// `inline: html` value written whole is escaped by the plan (`escapeHtml`).
import assert from 'node:assert/strict'
import test from 'node:test'
import { readTags } from 'website-opportunities/domain/draft-write-tags.mjs'
import { textAt } from 'website-opportunities/domain/draft-write-values.mjs'
import { memoryHtml } from 'website-opportunities/domain/write-order-memory-html.mjs'
import { placesOfOrder } from 'website-opportunities/domain/write-order-check.mjs'
import { blankSite, florist, planOf, runOn } from './draft-write-fixtures.mjs'

const PROBE = `Ready " onmouseover="f() ' onfocus='g() now`
const hasHandler = (text) => readTags(text).tags.some((t) => t.attrs.some((a) => a.name.startsWith('on')))

/** Every string a site holds, JSON strings opened (a module's params, an ACM block's nested data). */
function leavesOf(memory) {
  const leaves = []
  const walk = (x) => {
    if (typeof x === 'string') {
      leaves.push(x)
      if (/^\s*[[{]/.test(x))
        try {
          walk(JSON.parse(x))
        } catch {}
    } else if (x && typeof x === 'object') for (const v of Object.values(x)) walk(v)
  }
  for (const table of Object.values(memory.site.records)) for (const row of table.values()) walk(row)
  for (const s of memory.site.slots.values()) walk(s.current)
  return leaves
}

test('a quote that tries to open an attribute stays words at every place the write reaches', async () => {
  const order = structuredClone(florist.order)
  let set = 0
  for (const { place } of placesOfOrder(order))
    for (const e of place.fields)
      if (
        e.type === 'text' &&
        e.from === 'writer' &&
        typeof e.value === 'string' &&
        (e.limit ?? 99) >= PROBE.length
      ) {
        e.value = PROBE
        set += 1
      }
  const plan = planOf(order)
  const kinds = new Set()
  for (const op of plan.ops)
    for (const v of op.values ?? [])
      if (v.value === PROBE)
        kinds.add(v.loc.xpath ? 'html text node' : v.loc.nestedJson ? 'codes' : v.loc.column)
  assert.ok(set > 20, `${set} entries carry the probe`)
  assert.ok(kinds.has('html text node') && kinds.has('codes'), [...kinds].join(', '))
  const memory = blankSite()
  const result = await runOn(memory, { plan })
  assert.equal(result.status, 'done')
  const leaves = leavesOf(memory)
  assert.ok(leaves.filter((l) => l.includes('onmouseover')).length >= set / 2)
  assert.deepEqual(leaves.filter(hasHandler), [])
})

test('an attribute piece and a whole inline HTML value escape the quote', () => {
  const stored = '<a href="#x" title="Old">Old</a>'
  const written = memoryHtml.set(stored, '/html/body/div/a/@title', PROBE)
  assert.equal(hasHandler(written), false, written)
  assert.match(written, /&quot;/)
  assert.equal(memoryHtml.get(written, '/html/body/div/a/@title'), PROBE)
  const whole = textAt(PROBE, {
    loc: { column: 'introtext' },
    inline: { write: 'html', wrapper: ['p'] },
    via: 'open'
  })
  assert.equal(hasHandler(whole.value), false, whole.value)
  assert.match(whole.value, /^<p>Ready &quot; onmouseover=&quot;f\(\)/)
})
