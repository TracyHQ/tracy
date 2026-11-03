// save_brand_file gate: the shape rules of the logo material, the mark, the icon record and its attempts.
// Each case breaks one thing in a passing invented case and expects the field named.
import { test } from 'node:test'
import { all, assertNames, del, expectRejected, put, putBrief } from './_brand-gate-rules.mjs'

const clone = (x) => structuredClone(x)
/** Rows: [title, case id, mutate, expected field, optional why regex]. */
const ROWS = [
  [
    'the mark decision is one of three',
    '1-padel',
    put('logo.mark.decision', 'draw'),
    'logo.mark.decision',
    /cut \| icon/
  ],
  ['the mark has a reason', '1-padel', put('logo.mark.why', ''), 'logo.mark.why'],
  [
    'a lettermark has 1 or 2 letters',
    '2-words-only',
    all(put('logo.mark.decision', 'lettermark'), put('logo.mark.letters', 'abc')),
    'logo.mark.letters',
    /1 or 2/
  ],
  ['a cut mark has no letters', '1-padel', put('logo.mark.letters', 'A'), 'logo.mark.letters', /cut mark/],
  ['an icon has no letters', '2-words-only', put('logo.mark.letters', 'A'), 'logo.mark.letters', /an icon/],
  [
    'a cut needs material',
    '3-no-logo',
    put('logo.mark.decision', 'cut'),
    'logo.mark.decision',
    /cut needs material/
  ],
  ['recoloured is an object', '1-padel', put('logo.mark.recoloured', 'none'), 'logo.mark.recoloured'],
  ['recoloured names both sides', '1-padel', del('logo.mark.recoloured.light'), 'logo.mark.recoloured.light'],
  ['an icon mark records its icon', '2-words-only', put('logo.mark.icon', null), 'logo.mark.icon', /records/],
  [
    'a cut mark has no icon',
    '1-padel',
    put('logo.mark.icon', { subject: 'x' }),
    'logo.mark.icon',
    /cut mark/
  ],
  ['the icon has a subject', '2-words-only', put('logo.mark.icon.subject', ''), 'logo.mark.icon.subject'],
  [
    'the icon colours come from logo or accent',
    '2-words-only',
    put('logo.mark.icon.coloursFrom', 'sky'),
    'logo.mark.icon.coloursFrom',
    /logo \| accent/
  ],
  [
    'the icon has 1 or 2 colours',
    '2-words-only',
    put('logo.mark.icon.colours', []),
    'logo.mark.icon.colours',
    /1 or 2/
  ],
  [
    'logo colours need a logo',
    '3-no-logo',
    put('logo.mark.icon.coloursFrom', 'logo'),
    'logo.mark.icon.coloursFrom',
    /needs material/
  ],
  [
    'logo colours need colours measured from the logo',
    '2-words-only',
    putBrief('brand.colorsFrom', 'accent'),
    'logo.mark.icon.coloursFrom',
    /no colours measured/
  ],
  [
    'a logo with colours is not drawn in the accent',
    '5-bakery-words',
    put('logo.mark.icon.coloursFrom', 'accent'),
    'logo.mark.icon.coloursFrom',
    /takes them/
  ],
  [
    'the icon names its provider',
    '2-words-only',
    put('logo.mark.icon.provider', ''),
    'logo.mark.icon.provider'
  ],
  [
    'an attempt verdict is known',
    '2-words-only',
    put('logo.mark.icon.attempts.0.verdict', 'maybe'),
    'logo.mark.icon.attempts[0].verdict',
    /pass \| fail/
  ],
  [
    'an attempt has its subject',
    '2-words-only',
    put('logo.mark.icon.attempts.0.subject', ''),
    'logo.mark.icon.attempts[0].subject'
  ],
  [
    'the plate shape is known',
    '2-words-only',
    put('logo.mark.icon.attempts.0.plate', {
      shape: 'star',
      iconColour: '#111111',
      plateColour: '#eeeeee',
      ratio: 17
    }),
    'logo.mark.icon.attempts[0].plate.shape'
  ],
  [
    'the plate uses the two icon colours',
    '2-words-only',
    put('logo.mark.icon.attempts.0.plate', {
      shape: 'circle',
      iconColour: '#111111',
      plateColour: '#eeeeee',
      ratio: 17
    }),
    'logo.mark.icon.attempts[0].plate',
    /two icon colours/
  ],
  [
    'a drawn attempt records its plate',
    '2-words-only',
    del('logo.mark.icon.attempts.0.plate'),
    'logo.mark.icon.attempts[0].plate',
    /plate fallback/
  ],
  [
    'nothing follows the passing attempt',
    '2-words-only',
    put('logo.mark.icon.attempts', (a) => [...a, { subject: 'x', verdict: 'tool-failed' }]),
    'logo.mark.icon.attempts',
    /nothing after/
  ],
  [
    'only the last drawn attempt can pass',
    '2-words-only',
    put('logo.mark.icon.attempts', (a) => [clone(a[0]), a[0]]),
    'logo.mark.icon.attempts (drawn 1)'
  ],
  [
    'a lettermark follows failed drawings',
    '2-words-only',
    all(put('logo.mark.decision', 'lettermark'), put('logo.mark.letters', 'GB')),
    'logo.mark.icon.attempts',
    /lettermark after icons/
  ]
]

for (const [title, id, mutate, field, why] of ROWS) {
  test(`gate: ${title}`, async () => {
    assertNames(await expectRejected(id, mutate), field, why)
  })
}
