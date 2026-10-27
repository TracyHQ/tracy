/**
 * The identity tokens of a part's lines (`{year}`, `{site.title}`) kept through a model that rewrites the words around them:
 * masked before planning, put back after, and a disobedient answer mended, asked again, translated or said (`wp-runs.js`).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { editRuns, namedRuns } from '../src/sites/brief-engines/wp-leaves.js'
import { finishRuns, maskRun, maskRuns, remask, unmask } from '../src/sites/brief-engines/wp-runs.js'

const RUN = 'Copyright © {year} {site.title}. All Rights Reserved.'
const MASKED = 'Copyright © ⟦1⟧ ⟦2⟧. All Rights Reserved.'
const TOKENS = ['{year}', '{site.title}']

test('a run is masked token by token, and `{year}` is a token too', () => {
  assert.deepEqual(maskRun(RUN), { masked: MASKED, tokens: TOKENS })
})

test('remask puts each mask back where a disobedient answer wrote the name, a year, a token or a misspelt mask', () => {
  const name = { name: 'Tiệm Bánh Vàng' }
  for (const [answer, want] of [
    ['Bản quyền © ⟦1⟧ ⟦2⟧. Bảo lưu mọi quyền.', 'Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.'],
    [
      'Bản quyền © ⟦1⟧ Tiệm Bánh Vàng. Bảo lưu mọi quyền.',
      'Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.'
    ],
    ['Bản quyền © 2026 ⟦2⟧. Bảo lưu mọi quyền.', 'Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.'],
    [
      'Bản quyền © {year} {site.name}. Bảo lưu mọi quyền.',
      'Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.'
    ],
    ['Bản quyền © [[1]] 〚 2 〛. Bảo lưu mọi quyền.', 'Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.'],
    ['Bản quyền © 2026 tiệm bánh vàng.', 'Bản quyền © {year} {site.title}.']
  ])
    assert.equal(unmask(remask(answer, TOKENS, name), TOKENS), want, answer)
})

test('an answer that lacks a mask, or carries one twice, is not one: it would print the template year or name, or none', () => {
  for (const answer of [
    'Bản quyền. Bảo lưu mọi quyền.',
    'Bản quyền © ⟦1⟧. Bảo lưu mọi quyền.',
    'Bản quyền © ⟦1⟧ ⟦2⟧ ⟦2⟧.',
    'Bản quyền © ⟦1⟧ ⟦2⟧ ⟦3⟧.'
  ])
    assert.equal(unmask(remask(answer, TOKENS, { name: 'Tiệm Bánh Vàng' }), TOKENS), null, answer)
})

test('the unnamed copyright paragraph of JA Impact, Nova, Vega, Kinetic and Morgan is a run too; editRuns writes it', () => {
  const footer =
    '<!-- wp:paragraph {"className":"jim-footer__copy1"} -->\n<p class="jim-footer__copy1">Copyright © {year} {site.title}. All Rights Reserved.</p>\n<!-- /wp:paragraph -->\n' +
    '<!-- wp:paragraph -->\n<p>Plain words are the other passes’ lines, not a run of this one</p>\n<!-- /wp:paragraph -->\n' +
    '<!-- wp:site-title /-->'
  assert.deepEqual(namedRuns(footer), [{ text: RUN, block: 'core/paragraph' }])
  const out = editRuns(footer, [{ text: RUN, value: 'Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.' }])
  assert.equal(out.edited, 1)
  assert.ok(out.markup.includes('>Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.</p>'))
  assert.equal(
    editRuns(footer, [{ text: RUN, value: 'Bản quyền © 2026 {site.title}. Bảo lưu mọi quyền.' }]).edited,
    0,
    'a literal year is never written over {year}'
  )
})

test('every copyright line of the shipped WordPress themes is a run', () => {
  for (const file of [
    'wp-ja-essence/parts/footer.html',
    'wp-ja-impact/parts/footer.html',
    'wp-ja-kinetic/parts/footer.html',
    'wp-ja-morgan/parts/footer.html',
    'wp-ja-nova/parts/footer.html',
    'wp-ja-vega/parts/footer.html'
  ]) {
    const part = readFileSync(
      new URL(`../../../packages/cms/tracy-wordpress-theme/src/${file}`, import.meta.url),
      'utf8'
    )
    assert.ok(
      namedRuns(part).some((r) => /rights reserved/i.test(r.text) && r.text.includes('{year}')),
      file
    )
  }
})

/** The planner's lines for the runs, as `planLines` gives them back (by masked text). */
const RUNS = maskRuns([{ slug: 'run-footer', lines: [{ text: RUN, block: 'core/paragraph' }] }])

test('the planner is told to keep the masks; the run comes back by its own text, tokens and all', async () => {
  assert.equal(RUNS.pages[0].lines[0].text, MASKED)
  assert.match(RUNS.pages[0].lines[0].block, /keep ⟦1⟧ ⟦2⟧ exactly as written/)
  const notes = []
  const out = await finishRuns({
    runs: RUNS.runs,
    said: [{ slug: 'run-footer', text: MASKED, value: 'Bản quyền © ⟦1⟧ ⟦2⟧. Bảo lưu mọi quyền.' }],
    retry: async () => assert.fail('nothing to ask again'),
    translate: async () => assert.fail('nothing to translate'),
    note: (n) => notes.push(n)
  })
  assert.deepEqual(out, [
    { slug: 'run-footer', text: RUN, value: 'Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.' }
  ])
  assert.deepEqual(notes, [])
})

test('a disobedient model that drops the masks on every call: asked again, translated, and said when even that fails', async () => {
  const notes = []
  const asked = []
  const out = await finishRuns({
    runs: RUNS.runs,
    said: [{ slug: 'run-footer', text: MASKED, value: 'Bản quyền. Bảo lưu mọi quyền.' }],
    retry: async (open) => {
      asked.push('retry')
      return new Map(open.map((r) => [r, 'Vẫn không có mã nào.']))
    },
    translate: async (open) => {
      asked.push('translate')
      return new Map(open.map((r) => [r, 'Bản quyền © ⟦1⟧. Bảo lưu mọi quyền.']))
    },
    note: (n) => notes.push(n)
  })
  assert.deepEqual(asked, ['retry', 'translate'])
  assert.deepEqual(out, [], 'nothing written over the tokens')
  assert.equal(notes.length, 1)
  assert.match(notes[0], /1 line\(s\) of the header or footer keep the template’s words/)
  assert.match(notes[0], /\{year\} \{site\.title\}/)
})

test('an answer that only gives the template words back is no answer: the translation is asked', async () => {
  const out = await finishRuns({
    runs: RUNS.runs,
    said: [{ slug: 'run-footer', text: MASKED, value: MASKED }],
    retry: async () => {
      throw new Error('model gone')
    },
    translate: async (open) => new Map(open.map((r) => [r, 'Bản quyền © ⟦1⟧ ⟦2⟧. Bảo lưu mọi quyền.'])),
    note: () => {}
  })
  assert.equal(out[0].value, 'Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.')
})
