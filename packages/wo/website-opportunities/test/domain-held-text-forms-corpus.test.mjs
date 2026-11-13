// The held name forms a reviewer's differential corpus found at the first matcher of #609 (decision D46) and every
// later round must keep: eight invented names, twenty four ways to write each, three sentences around it, in the
// default forms and in prose only (`forms: 'words'`, what reviews and values read). The forms a name lost for a round
// (`Siobhan ONeill`, `JeanLuc Marchand`: a part joined by an apostrophe or a hyphen written together) are listed on
// their own, and so are the near misses the matcher must still refuse. Invented names and texts only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-held-text-forms-corpus.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heldNamesIn, heldSlugsIn } from '../domain/held-reviews.mjs'
import { heldSpansIn } from '../domain/held-text-match.mjs'

const NAMES = [
  "Siobhan O'Neill",
  'Jean-Luc Marchand',
  'José Álvarez',
  '山田花子',
  'Brannoch',
  'Pellam Orrick Vey',
  'Ana Bo',
  '김민지'
]

/** Every way the corpus writes a name, by form. */
function formsOf(name) {
  const parts = name.split(/[\s'’-]+/u).filter(Boolean)
  const lower = (sep) => parts.join(sep).toLowerCase()
  return Object.entries({
    exact: name,
    apostropheDropped: name.replace(/['’]/gu, ''),
    apostropheAsSpace: name.replace(/['’]/gu, ' '),
    apostropheCurly: name.replace(/'/gu, '’'),
    hyphenDropped: name.replace(/-/gu, ''),
    hyphenAsSpace: name.replace(/-/gu, ' '),
    hyphenAsSign: name.replace(/-/gu, String.fromCodePoint(0x2013)),
    glued: parts.join(''),
    slug: lower('-'),
    slugOfAll: name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-'),
    slugUnderscore: lower('_'),
    email: `${lower('.')}@x.example`,
    emailGlued: `${lower('')}@x.example`,
    handle: `@${lower('')}`,
    handleUnderscore: `@${lower('_')}`,
    possessive: `${name}'s`,
    upper: name.toUpperCase(),
    lower: name.toLowerCase(),
    url: `https://x.example/team/${lower('-')}`,
    file: `${lower('-')}.jpg`,
    dotted: parts.join('.'),
    spacedTwice: parts.join('  '),
    noBreakSpace: parts.join(String.fromCodePoint(0xa0)),
    newline: parts.join('\n')
  })
}
const WRAPS = [(x) => x, (x) => `Meet ${x} today.`, (x) => `Contact: ${x} for help`]
const held = (text, name, opts) => heldSpansIn(text, [name], opts).length > 0

test('every form of the corpus is held, in the default forms and in prose only (0 lost of 1152 trials)', () => {
  const lost = []
  let trials = 0
  for (const name of NAMES)
    for (const [form, written] of formsOf(name))
      for (const wrap of WRAPS)
        for (const [mode, opts] of [
          ['default', {}],
          ['words', { forms: 'words' }]
        ]) {
          trials += 1
          if (!held(wrap(written), name, opts)) lost.push(`${mode} ${form}: ${wrap(written)}`)
        }
  assert.equal(trials, NAMES.length * 24 * WRAPS.length * 2)
  assert.deepEqual(lost, [])
})

test('the forms lost for a round: a part joined by an apostrophe or a hyphen, written together or apart', () => {
  for (const [name, texts] of [
    [
      "Siobhan O'Neill",
      ['Siobhan ONeill', 'Siobhan O Neill', 'Siobhan O-Neill', 'Siobhan O’Neill', 'SIOBHAN ONEILL']
    ],
    ['Jean-Luc Marchand', ['JeanLuc Marchand', 'Jeanluc Marchand', 'Jean Luc Marchand', 'Jean-Luc Marchand']],
    ["O'Neill", ['Ask ONeill today.', 'Ask O Neill today.']]
  ])
    for (const text of texts) {
      assert.deepEqual(heldNamesIn(text, [name]), [name], text)
      assert.deepEqual(heldSlugsIn(text, [name]), [name], text)
    }
  // A held text of several words written as one whole token is held in prose too; never inside a longer token.
  assert.deepEqual(heldNamesIn('Thanks SiobhanONeill!', ["Siobhan O'Neill"]), ["Siobhan O'Neill"])
  assert.deepEqual(heldNamesIn('Follow @pellamorrickvey', ['Pellam Orrick Vey']), ['Pellam Orrick Vey'])
  assert.deepEqual(heldNamesIn('See brannoch2.jpg', ['Brannoch']), ['Brannoch'])
  // Joined over several tokens of a slug is the slug form's only: prose reads one whole token.
  assert.deepEqual(heldSlugsIn('anab-o.jpg', ['Ana Bo']), ['Ana Bo'])
  assert.deepEqual(heldNamesIn('anab-o.jpg', ['Ana Bo']), [])
})

test('the near misses stay refused: words apart in the held text are never glued inside a longer word', () => {
  for (const [name, text] of [
    ['Ed Lee', 'Fed leeks to the garden club.'],
    ['Ed Lee', 'Ask Fred Lee about the garden club.'],
    ['Al Ma', 'Normal maps of the shop.'],
    ['Ana Bo', 'banana-boat.jpg'],
    ['Ed Lee', 'used-leek.jpg'],
    ['Ed Lee', '/img/fedlee.png'],
    ['Al Ma', 'animal-magic.jpg'],
    ["Siobhan O'Neill", 'Siobhanoneills are a myth.'],
    ['Jean-Luc Marchand', 'Ajeanluc Marchand'],
    ["O'Neill", 'Ask Joneill today.']
  ]) {
    assert.deepEqual(heldSlugsIn(text, [name]), [], `${name} in ${text}`)
    assert.deepEqual(heldNamesIn(text, [name]), [], `${name} in ${text}`)
  }
})
