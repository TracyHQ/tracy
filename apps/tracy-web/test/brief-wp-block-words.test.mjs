/**
 * The words a WordPress site's blocks carry as attributes, translated through the plugin's block-word door
 * (`wp-block-words.js`), with a disobedient translator: markup, an echo of the English and a sentence too long.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { translateBlockWords } from '../src/sites/brief-engines/wp-block-words.js'

const door = (found, sets) => async (action, params) => {
  assert.equal(action, 'content.contract')
  if (params.operation === 'blockWords.read') return { ok: true, found, pairs: found.length, words: {} }
  sets.push(params)
  return { ok: true, written: Object.keys(params.words).length }
}

test('only words WordPress does not translate are asked; a bad answer is never stored, and what is left is said', async () => {
  const sets = []
  const notes = []
  const asked = []
  const out = await translateBlockWords({
    call: door(
      [
        { source: 'Read more', core: 'Xem thêm' },
        { source: 'By ', core: null },
        { source: 'Read the recipe', core: null },
        { source: 'Search the site', core: 'Search the site' },
        { source: 'Older posts', core: '' }
      ],
      sets
    ),
    locale: 'vi',
    applyId: 'words-1',
    translate: async (texts) => {
      asked.push(...texts)
      return new Map([
        ['By ', 'Bởi'],
        ['Read the recipe', 'Read the recipe'],
        ['Search the site', '<b>Tìm</b> trong trang'],
        ['Older posts', 'x'.repeat(201)]
      ])
    },
    note: (n) => notes.push(n)
  })
  assert.deepEqual(asked, ['By ', 'Read the recipe', 'Search the site', 'Older posts'])
  assert.deepEqual(sets, [
    {
      operation: 'blockWords.set',
      apply_id: 'words-1',
      locale: 'vi',
      words: { 'By ': 'Bởi ', 'Search the site': 'Tìm trong trang' }
    }
  ])
  assert.deepEqual(out, { found: 5, written: 2 })
  assert.ok(notes.some((n) => /2 word\(s\) the theme's blocks carry keep the template's language/.test(n)))
})

test('an older plugin refuses the read: said, nothing written, nothing thrown', async () => {
  const notes = []
  const out = await translateBlockWords({
    call: async () => ({
      ok: false,
      error: 'bad_operation',
      message: 'Unknown contract operation blockWords.read'
    }),
    locale: 'vi',
    applyId: 'words-1',
    translate: async () => assert.fail('nothing to translate'),
    note: (n) => notes.push(n)
  })
  assert.deepEqual(out, { found: 0, written: 0 })
  assert.match(notes[0], /could not list them \(Unknown contract operation blockWords\.read\)/)
})
