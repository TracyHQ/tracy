// The fault code index (references/fix-map.md section 2) and the fault sections (references/faults.md) must point at
// each other: an agent that meets a code finds its fix in one step, and no fix is left without a code that leads to it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (name) => readFileSync(new URL(`../../references/${name}`, import.meta.url), 'utf8')

const sectionsOf = (text) => {
  const out = []
  for (const line of text.split('\n')) if (line.startsWith('## F')) out.push(line.slice(3, line.indexOf('.')))
  return out
}

const indexedOf = (text) => {
  const at = text.indexOf('## 2. Fault code index')
  assert.ok(at >= 0, 'fix-map.md has a fault code index')
  const out = []
  for (const line of text.slice(at).split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|---') || line.startsWith('| Code')) continue
    const cell = line.split('|').at(-2).trim()
    out.push(cell)
  }
  return out
}

test('every fault section has an index row and every index row names a section that exists', () => {
  const sections = sectionsOf(read('faults.md'))
  const indexed = indexedOf(read('fix-map.md'))
  assert.ok(sections.length > 0)
  assert.deepEqual([...new Set(indexed)].sort(), [...sections].sort())
})

test('every fault section says how to confirm or which code it prints, and the fix', () => {
  const text = read('faults.md')
  const parts = text.split('\n## F').slice(1)
  for (const part of parts) {
    const id = `F${part.slice(0, part.indexOf('.'))}`
    assert.match(part, /\*\*Code\*\*|\| Fault \| Code or check \|/, `${id} names its code`)
    assert.match(part, /\*\*Fix\*\*|next version list/, `${id} names its fix`)
  }
})
