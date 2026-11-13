// Markup is caught where the writer can still redo it (ticket #597): every value the order check refuses for its
// markup (`markupNotDeclared`, a stop of the build) is refused first by the page writer's copy check
// (`fieldValueProblems`, which sends the field back to be rewritten), whatever the field declares. And ordinary prose
// with parentheses, colons and ampersands passes both. Invented values.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-copy-markup-first.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fieldValueProblems } from '../domain/page-copy-check.mjs'
import { markupNotDeclared } from '../domain/write-order-check-entries.mjs'

const MARKUP_CODES = new Set(['markup', 'angle_bracket', 'template_code'])
const DECLARED = [
  undefined,
  {
    inline: { write: 'html', emphasis: [{ tag: 'span', attrs: 'class="a"' }, { tag: 'br' }], wrapper: ['p'] }
  },
  { inline: { write: 'codes', emphasis: [{ tag: 'span', attrs: '' }], wrapper: ['p', 'ul', 'li'] } }
]
const field = { name: 'paragraph', type: 'text', limit: 400 }
const redoable = (value) => fieldValueProblems(field, value).some((p) => MARKUP_CODES.has(p.code))

const VALUES = [
  'f((x))',
  'Call us ((free)) today',
  '((span))Wild((/span)) roses',
  'Fresh ((span onclick=f(1) stems',
  '((p))One((/p))',
  'We <3 roses',
  'Orders 3 < 5 days',
  'Write to <info@shop.example>',
  'Hi <span class="a',
  '<b>Bold</b>',
  'a <!-- b --> c',
  'x > y',
  '((br/))'
]

test('every value the order check refuses for markup, the copy check refuses first, as a rewrite', () => {
  for (const value of VALUES)
    for (const declared of DECLARED)
      if (markupNotDeclared({ value, declared }))
        assert.ok(redoable(value), `${value} (${declared?.inline?.write ?? 'no inline'})`)
})

test('the same holds on generated strings', () => {
  const F = [
    '((',
    '))',
    '((s',
    '((/b',
    '<',
    '>',
    '<b>',
    '</b>',
    '((span))',
    '((/span))',
    '"',
    ' ',
    'a',
    '(',
    ')',
    ':',
    '&',
    '<!',
    '?'
  ]
  let seed = 597
  const rnd = (n) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n
  let refused = 0
  for (let n = 0; n < 5000; n++) {
    let value = 'x'
    for (let k = 1 + rnd(6); k > 0; k--) value += F[rnd(F.length)]
    for (const declared of DECLARED)
      if (markupNotDeclared({ value, declared })) {
        refused += 1
        assert.ok(redoable(value), JSON.stringify(value))
      }
  }
  assert.ok(refused > 1000, `${refused} refusals`)
})

test('ordinary prose passes both checks', () => {
  for (const value of [
    'Open (weekdays (9 to 5))',
    'See you soon ((:',
    'Thanks for visiting :))',
    'Data: we keep only what you send',
    'JavaScript: not needed to order',
    'Smith & Sons supply our stems',
    'Q&A every Friday'
  ]) {
    assert.deepEqual(fieldValueProblems(field, value), [], value)
    for (const declared of DECLARED) assert.equal(markupNotDeclared({ value, declared }), null, value)
  }
})
