/**
 * A word that is the same in both languages ("Menu", "Logo", "Blog" in Dutch) — #1403 item 8. Measured 16/10/2026 on the
 * stand (Dutch, Joomla): each such word went through the batch asked again, every split half down to one line and the tries
 * alone, the same answer each time, and stayed as it was. The LANG-2 rule is unchanged (an unchanged answer is no
 * translation, said as kept); only the asking stops repeating itself.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { translateLines } from '../src/sites/brief-engines/translate-lines.js'

const SAME = new Set(['Menu', 'Logo'])
const toNl = (/** @type {string} */ text) => (SAME.has(text) ? text : `NL ${text}`)

/** A model that answers every line in Dutch, and keeps the words that are Dutch already. Counts what it is asked. */
function dutch() {
  /** @type {Array<{ batch: boolean, size: number }>} */
  const calls = []
  return {
    calls,
    usage: () => ({}),
    chat: async (/** @type {any} */ { messages }) => {
      const input = JSON.parse(messages[messages.length - 1].content)
      if (Array.isArray(input)) {
        calls.push({ batch: true, size: input.length })
        return JSON.stringify(input.map(({ i, text }) => ({ i, text: toNl(text) })))
      }
      calls.push({ batch: false, size: 1 })
      return JSON.stringify({ text: toNl(input.text) })
    }
  }
}

const line = (key, sample) => ({ key, type: 'text', sample, maxCharacters: 60 })

test('a word the model keeps as it is in a readable batch is asked alone, never split; the next time not at all', async () => {
  const model = dutch()
  const notes = []
  const lines = [
    line('a1', 'Menu'),
    ...Array.from({ length: 9 }, (_, i) => line(`a${i + 2}`, `About us ${i}`)),
    line('b1', 'Logo'),
    ...Array.from({ length: 8 }, (_, i) => line(`b${i + 2}`, `Our team ${i}`)),
    line('b10', 'Menu')
  ]
  const out = await translateLines({
    lines,
    locale: 'nl-NL',
    shipped: new Map(),
    model,
    note: (n) => notes.push(n),
    what: 'the menu',
    batch: 10
  })
  // Every other line is Dutch; the two words stay as written — and are said as kept, as before.
  assert.equal(out.a2, 'NL About us 0')
  assert.equal(out.b2, 'NL Our team 0')
  assert.equal('a1' in out || 'b1' in out || 'b10' in out, false)
  assert.ok(
    notes.some((n) => /3 line\(s\) of the menu keep the template’s language/.test(n)),
    notes.join(' | ')
  )
  assert.ok(!notes.some((n) => /smaller parts/.test(n)), 'nothing was split')
  // No batch smaller than the two whole ones (nothing split), and each word asked alone twice at most — "Menu" once only.
  const batches = model.calls.filter((c) => c.batch)
  assert.ok(
    batches.every((c) => c.size === 10),
    JSON.stringify(batches)
  )
  const alone = model.calls.filter((c) => !c.batch)
  assert.ok(alone.length <= 4, `asked alone ${alone.length} times`)
})

test('a line a batch could not answer at all is still split and asked alone (the LANG-2 path is kept)', async () => {
  const calls = []
  const model = {
    usage: () => ({}),
    chat: async (/** @type {any} */ { messages }) => {
      const input = JSON.parse(messages[messages.length - 1].content)
      if (Array.isArray(input)) {
        calls.push(input.length)
        // Leaves "Contact" out of every batch answer.
        return JSON.stringify(
          input.filter(({ text }) => text !== 'Contact').map(({ i, text }) => ({ i, text: `NL ${text}` }))
        )
      }
      calls.push(1)
      return JSON.stringify({ text: `NL ${input.text}` })
    }
  }
  const out = await translateLines({
    lines: [line('x1', 'Contact'), line('x2', 'Home'), line('x3', 'Shop')],
    locale: 'nl-NL',
    shipped: new Map(),
    model,
    note: () => {},
    what: 'the menu',
    batch: 3
  })
  assert.equal(out.x1, 'NL Contact', 'translated alone in the end')
  assert.equal(out.x2, 'NL Home')
})
