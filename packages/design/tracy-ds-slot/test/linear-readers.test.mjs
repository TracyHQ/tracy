// The readers that once went back over a long run of one character once for each place in it (CodeQL
// polynomial-redos, release 2026-11-05) read it in one pass now, and read every ordinary text as before.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withoutVariableCut } from '../src/fonts.mjs'
import { nestNots, replaceFlatRules } from '../src/joomla.mjs'
import { fromRefero, primaryButton, quickColours } from '../src/normalise.mjs'
import {
  emTracking,
  letterSpacing,
  paddingPair,
  radiusAfter,
  radiusBefore,
  sizeAt,
  sizeOfLabel,
  verticalHorizontalPad,
  verticalSlashHorizontalPad
} from '../src/prose-numbers.mjs'

const prose = {
  paddingPair,
  verticalHorizontalPad,
  verticalSlashHorizontalPad,
  sizeAt,
  sizeOfLabel,
  letterSpacing,
  emTracking,
  radiusAfter,
  radiusBefore
}

const fast = (label, fn) => {
  const t = performance.now()
  const out = fn()
  const ms = performance.now() - t
  assert.ok(ms < 500, `${label} took ${Math.round(ms)}ms`)
  return out
}
const N = 100_000

// a small seeded generator, so the comparisons below are the same on every run
const rand = (seed) => () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32
const fuzz = (alphabet, count, max, seed = 7) => {
  const r = rand(seed)
  return Array.from({ length: count }, () =>
    Array.from({ length: Math.floor(r() * max) }, () => alphabet[Math.floor(r() * alphabet.length)]).join('')
  )
}

test('withoutVariableCut: the variable cut of a family is the family, read as the old regex read it', () => {
  assert.equal(withoutVariableCut('Inter Variable'), 'Inter')
  assert.equal(withoutVariableCut('Inter-VF'), 'Inter')
  assert.equal(withoutVariableCut('Roboto Flex var'), 'Roboto Flex')
  assert.equal(withoutVariableCut('Inter'), 'Inter')
  assert.equal(withoutVariableCut('Intervariable'), 'Intervariable')
  const old = (s) => s.replace(/[\s-]+(variable|var|vf)$/i, '')
  for (const s of fuzz([' ', '\t', '-', 'a', 'v', 'r', 'f', 'V', 'variable', 'var', 'vf'], 3000, 9))
    assert.equal(withoutVariableCut(s), old(s), JSON.stringify(s))
  fast('a run of tabs', () => withoutVariableCut(`A${'\t'.repeat(N)}x`))
})

test('replaceFlatRules: the rules the old regex found, found in one pass', () => {
  const mark = (whole, selectors, body) => `[${selectors}|${body}|${whole.length}]`
  const old = (s) => s.replace(/([^{}]+)\{([^{}]*)\}/g, mark)
  for (const s of fuzz(['{', '}', 'a', ' ', '\n', 'b{c}', '/*x*/'], 5000, 14))
    assert.equal(replaceFlatRules(s, mark), old(s), JSON.stringify(s))
  const long = `${'z'.repeat(N)}`
  assert.equal(
    fast('a text with no brace', () => replaceFlatRules(long, mark)),
    long
  )
  fast('a run of opening selectors', () => replaceFlatRules(`${'a{'.repeat(N)}`, mark))
  assert.equal(
    fast('nestNots on a text with no brace', () => nestNots(long)),
    long
  )
})

/** Milliseconds `fn` takes. @param {() => unknown} fn */
const timed = (fn) => {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

/**
 * Asserts `run` grows linearly: twice the input takes about twice the time (best of five each), never the
 * four times a quadratic reader takes.
 * @param {string} label @param {(n: number) => unknown} run @param {number} n
 */
const assertLinear = (label, run, n) => {
  const best = (/** @type {number} */ k) => Math.min(...Array.from({ length: 5 }, () => timed(() => run(k))))
  const one = best(n)
  const two = best(2 * n)
  assert.ok(two < 2.8 * one + 3, `${label}: ${one.toFixed(1)} ms at n, ${two.toFixed(1)} ms at 2n`)
  assert.ok(two < 300, `${label}: ${two.toFixed(1)} ms at 2n`)
}

test('nestNots joins the blocks under one guard as its patterns joined them, at once on a run of markers', () => {
  const G1 = ':not(.t3-header .navbar, .t3-footer .module, .kept-band-a)'
  const G2 = ':where(.kept-band-b .btn, .kept-band-c .btn, .kept-band-d .x)'
  // [sheet, what the marker patterns answered]
  for (const [css, old] of [
    [`a${G1}{color:red}b${G1}{color:blue}`, `${G1}{a&{color:red}b&{color:blue}}`],
    [`a${G1}{color:red}\n  b${G1}{color:blue}`, `${G1}{a&{color:red}b&{color:blue}}`],
    [`a${G1}{color:red}c{x:y}b${G1}{color:blue}`, `${G1}{a&{color:red}}c{x:y}${G1}{b&{color:blue}}`],
    [`a${G1},b${G1}{color:red}`, `${G1}{a&,b&{color:red}}`],
    [`a${G1},b${G2}{color:red}`, `a${G1},b${G2}{color:red}`],
    [`/* mode: dark */\na${G1}{color:red}`, `/* mode: dark */\n${G1}{a&{color:red}}`],
    [`p${G2}{c:d}q${G2}::before{e:f}a${G1}{g:h}`, `${G2}{p&{c:d}q&::before{e:f}}${G1}{a&{g:h}}`],
    [`@media (x){a${G1}{color:red}b${G1}{c:d}}`, `@media (x){${G1}{a&{color:red}b&{c:d}}}`],
    ['a:not(.short){color:red}', 'a:not(.short){color:red}'],
    ['plain{color:red}', 'plain{color:red}']
  ])
    assert.equal(nestNots(css), old, css)
  assertLinear('nestNots, \\u0000\\u0001', (n) => nestNots(`${'\u0000\u0001'.repeat(n)}a{b:c}`), 50_000)
  assertLinear('nestNots, \\u0000', (n) => nestNots(`${'\u0000'.repeat(n)}a{b:c}`), 50_000)
  assertLinear('nestNots, many guarded rules', (n) => nestNots(`a${G1}{color:red}\n`.repeat(n)), 4_000)
})

test('quickColours: the reference block ends at the next bold line, as before', () => {
  const read = (content) => quickColours({ customSections: [{ title: 'Agent Prompt Guide', content }] })
  assert.deepEqual(read('Quick Color Reference\n- background: #000000\n- text: #f4efd4\n'), {
    background: '#000000',
    text: '#f4efd4'
  })
  assert.deepEqual(read('Quick Color Reference\n- background: #000000\n\n  **Next**\n- text: #f4efd4\n'), {
    background: '#000000'
  })
  // no reference: the whole guide is read
  assert.deepEqual(read('- text: #f4efd4'), { text: '#f4efd4' })
  // the reader as it was
  const old = (text) => {
    const out = {}
    const block = /Quick Color Reference([\s\S]*?)(?:\n\s*\*\*|$)/i.exec(text)?.[1] ?? text
    for (const m of block.matchAll(/^\s*[-*]\s*([a-z][a-z ]{1,24}?)\s*:\s*(#[0-9a-fA-F]+)\b/gim)) {
      const key = m[1].trim().toLowerCase()
      if (!(key in out)) out[key] = m[2].toLowerCase()
    }
    return out
  }
  const parts = [
    '\n',
    '\r',
    ' ',
    '\t',
    '*',
    '**',
    'x',
    '- a: #fff',
    '* bg : #123456',
    'Quick Color Reference'
  ]
  for (const s of fuzz(parts, 5000, 12)) assert.deepEqual(read(s), old(s), JSON.stringify(s))
  fast('a run of line breaks', () => read(`quick color reference\n${'\n'.repeat(N)}x`))
})

test('primaryButton: padding, size and tracking read as before; a long run of digits reads fast', () => {
  const button = (description) => primaryButton({ components: [{ name: 'Primary Button', description }] })
  const b = button(
    'Background #0075de, text #ffffff at 14px weight 500, border-radius 8px, padding 6px 15px, letter-spacing -0.2px'
  )
  assert.deepEqual({ pad: b.pad, tracking: b.tracking }, { pad: { y: 6, x: 15 }, tracking: '-0.014em' })
  const c = button('Background #0075de, 12.5px vertical / 24px horizontal, 16px label, 0.05em tracking')
  assert.deepEqual({ pad: c.pad, tracking: c.tracking }, { pad: { y: 12.5, x: 24 }, tracking: '0.05em' })
  assert.equal(button('Background #0075de, .5em letter-spacing').tracking, '0.5em')
  // a number of any length reads whole, as before
  const long = button(
    'Background #0075de, letter-spacing 0.1234567891em, padding 12345678901.5px 0.12345678901px, 12345678901px radius'
  )
  assert.deepEqual(
    { tracking: long.tracking, pad: long.pad, radius: long.radius },
    { tracking: '0.1234567891em', pad: { y: 12345678901.5, x: 0.12345678901 }, radius: 12345678901 }
  )
  for (const tail of ['0', '00.', '0 ', '-0.']) {
    fast(`a run of ${JSON.stringify(tail)}`, () => button(`Background #0075de ${tail.repeat(N / 4)}`))
    fast(`letter-spacing then ${JSON.stringify(tail)}`, () =>
      button(`Background #0075de letter-spacing ${tail.repeat(N / 4)}`)
    )
  }
})

// Each reader against the regex it replaced (as on the base revision, no cap on a number's length): the same
// captures from the same match on every text, numbers of ten digits and more among them.
test('prose-numbers: each reader captures what its old regex captured', () => {
  const N = String.raw`(\d+(?:\.\d+)?)`
  const pairs = {
    paddingPair: new RegExp(String.raw`padding[:\s]*${N}px\s*(?:vertical\s*)?(?:[×x]\s*)?${N}px`, 'i'),
    verticalHorizontalPad: new RegExp(String.raw`${N}px\s*vertical\s*[×x/]\s*${N}px\s*horizontal`, 'i'),
    verticalSlashHorizontalPad: /(\d+)px\s*vertical\s*\/\s*(\d+)px\s*horizontal/i,
    sizeAt: new RegExp(String.raw`\bat\s*${N}(?:\s*[–-]\s*\d+)?\s*px`, 'i'),
    sizeOfLabel: new RegExp(String.raw`${N}px\s+(?:text|label)`, 'i'),
    letterSpacing: /letter-spacing[:\s]*(-?\d*\.?\d+)\s*(px|em)\b/i,
    emTracking: /(-?\d*\.?\d+)(em)\s+(?:tracking|letter-spacing)/i,
    radiusAfter: new RegExp(String.raw`${N}px\s*(?:border-)?radius`, 'i'),
    radiusBefore: new RegExp(String.raw`radius[:\s]*(?:of\s*)?${N}px`, 'i')
  }
  // each reader's own shape, every part of it drawn from near misses too, sometimes twice over and among noise
  const r = rand(11)
  const pick = (a) => a[Math.floor(r() * a.length)]
  const NUM = ['0', '12', '12345678901', '0.1234567891', '1.5.5', '12345678901.5', '7.', '3', '']
  const SNUM = [...NUM, '-3', '.5', '-.25', '-0.1234567891', '--1', '-']
  const WS = ['', ' ', '  ', '\t', ' \n ']
  const PX = ['px', 'PX', 'Px', 'p', 'pxx', '']
  const shapes = {
    paddingPair: [
      ['padding', 'Padding', 'paddin'],
      [':', '', ' ', ': '],
      NUM,
      PX,
      WS,
      ['vertical', 'Vertical', ''],
      WS,
      ['x', 'X', '×', '', '/'],
      WS,
      NUM,
      PX
    ],
    verticalHorizontalPad: [
      ['', 'a', '9', '.'],
      NUM,
      PX,
      WS,
      ['vertical', 'verticle'],
      WS,
      ['x', '×', '/', '-'],
      WS,
      NUM,
      PX,
      WS,
      ['horizontal', 'Horizontal', 'horiz']
    ],
    verticalSlashHorizontalPad: [
      ['', 'a', '9'],
      NUM,
      PX,
      WS,
      ['vertical', 'verticle'],
      WS,
      ['/', 'x'],
      WS,
      NUM,
      PX,
      WS,
      ['horizontal', 'horiz']
    ],
    sizeAt: [['at', 'At', 'cat', 'a t'], WS, NUM, WS, ['', '-', '–', '—'], WS, ['', '16', 'x'], WS, PX],
    sizeOfLabel: [['', 'a', '9', '.'], NUM, PX, WS, ['text', 'label', 'Label', 'txt']],
    letterSpacing: [
      ['letter-spacing', 'Letter-Spacing', 'letter spacing'],
      [':', '', ' ', ': '],
      SNUM,
      WS,
      ['px', 'em', 'EM', 'pxa', 'em_', 'em-', ''],
      ['', ' ', 'x']
    ],
    emTracking: [
      ['', 'a', '9', '.', '-'],
      SNUM,
      ['em', 'Em', 'e', ''],
      WS,
      ['tracking', 'letter-spacing', 'track']
    ],
    radiusAfter: [
      ['', 'a', '9', '.'],
      NUM,
      PX,
      WS,
      ['border-', 'Border-', '', 'border '],
      ['radius', 'Radius', 'rad']
    ],
    radiusBefore: [
      ['radius', 'Radius'],
      [':', '', ' ', ': ', '::'],
      ['of', 'of ', 'Of', '', 'or'],
      WS,
      NUM,
      PX
    ]
  }
  const one = (slots) => slots.map(pick).join('')
  for (const [name, re] of Object.entries(pairs)) {
    let found = 0
    for (let k = 0; k < 8000; k++) {
      const t =
        (r() < 0.3 ? one(shapes[name]) : '') +
        pick(['', 'x ', '1 ', '-']) +
        one(shapes[name]) +
        pick(['', ' ', ' 2px'])
      const m = re.exec(t)
      if (m) found++
      assert.deepEqual(prose[name](t), m ? m.slice(1) : null, `${name} ${JSON.stringify(t)}`)
    }
    assert.ok(found > 100, `${name}: the texts drawn hold a match often enough to compare (${found})`)
  }
  for (const read of Object.values(prose))
    for (const tail of [
      '0',
      '00.',
      '0 ',
      '-0.',
      '0px ',
      '-',
      '.',
      'padding 0px ',
      'at 0',
      'letter-spacing -0',
      'radius 0',
      '1px vertical x'
    ])
      fast('a long run', () => read(tail.repeat(N / 2)))
})

test('the button padding of the shape reads "12px vertical / 24px horizontal" as before, and fast', () => {
  const system = (description) => ({
    theme: 'light',
    colors: [],
    surfaces: [],
    typography: [],
    typeScale: [],
    spacing: { radius: { buttons: '8px' } },
    components: [{ name: 'Button', description }],
    customSections: []
  })
  const p = fromRefero(system('A pill, 12px vertical / 24px horizontal'), { id: 'x', name: 'X' })
  assert.match(JSON.stringify(p.shape), /12/)
  fast('a run of digits', () => fromRefero(system('0'.repeat(N)), { id: 'x', name: 'X' }))
})
