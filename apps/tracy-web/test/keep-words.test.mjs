// The keep lines of a site written in another language: split headings asked as one phrase (`keep-words.js`, LANG-2).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { phrasesOf, piecesFrom, translateKeep } from '../src/sites/brief-engines/keep-words.js'

const boxing = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.4')
const slotsOf = (contract) =>
  JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8')).slots.filter(
    (s) => s.customize === 'keep'
  )

test('the pieces of one styled heading are one phrase; a paragraph beside it and a link label in another block are not', () => {
  const slots = slotsOf(boxing).filter((s) => s.entity === 'module-157' || s.entity === 'module-160')
  const { phrases, singles } = phrasesOf(slots.filter((s) => s.type === 'text'))
  const asKeys = phrases.map((group) => group.map((s) => s.key).join(','))
  assert.ok(asKeys.includes('module-157.20,module-157.21'), asKeys.join(' | '))
  assert.ok(asKeys.includes('module-160.0,module-160.1'))
  assert.ok(asKeys.includes('module-160.4,module-160.5,module-160.6'))
  const single = singles.map((s) => s.key)
  for (const key of ['module-157.22', 'module-157.24', 'module-160.2', 'module-160.7'])
    assert.ok(single.includes(key), key)
})

test('an answer keeps each piece’s own spacing, and is refused when a piece is missing, empty or unchanged', () => {
  const group = [
    { sample: 'Join over ', maxCharacters: 40 },
    { sample: '100k', maxCharacters: 40 },
    { sample: ' of inspiring creatives', maxCharacters: 66 }
  ]
  assert.deepEqual(piecesFrom('{"pieces": ["Tham gia cùng hơn", "100k", "người sáng tạo"]}', group), [
    'Tham gia cùng hơn ',
    '100k',
    ' người sáng tạo'
  ])
  assert.equal(piecesFrom('{"pieces": ["Tham gia", "100k"]}', group), null)
  assert.equal(piecesFrom('{"pieces": ["Tham gia", " ", "người"]}', group), null)
  assert.equal(piecesFrom('{"pieces": ["Join over", "100k", "of inspiring creatives"]}', group), null)
  assert.equal(piecesFrom('not json', group), null)
})

test('a phrase whose answer cannot be used falls back to its pieces one by one; facts, template strings and users are left', async () => {
  const slots = [
    {
      key: 'm.0',
      entity: 'module-1',
      column: 'params',
      jsonPath: ['main-section'],
      xpath: '/html/body/div/text()[1]',
      type: 'text',
      sample: 'THE',
      maxCharacters: 40
    },
    {
      key: 'm.1',
      entity: 'module-1',
      column: 'params',
      jsonPath: ['main-section'],
      xpath: '/html/body/div/span/text()',
      type: 'text',
      sample: 'WORKOUT',
      maxCharacters: 40
    },
    {
      key: 'f.0',
      entity: 'contact-1',
      type: 'text',
      sample: '12 Hang Bac',
      requiresEvidence: true,
      maxCharacters: 40
    },
    { key: 's.0', entity: 'languageString-1', type: 'text', sample: 'Close', maxCharacters: 40 },
    { key: 'u.0', entity: 'user-1', type: 'text', sample: 'Drew Stokes', maxCharacters: 40 }
  ]
  const phrases = []
  const model = {
    chat: async ({ messages }) => {
      const input = JSON.parse(messages[1].content)
      if (messages[0].content.startsWith('You translate one phrase')) {
        phrases.push(input)
        return '{"pieces": ["only one"]}'
      }
      return JSON.stringify(input.map(({ i, text }) => ({ i, text: `vi ${text}` })))
    }
  }
  const notes = []
  const out = await translateKeep({
    slots,
    locale: 'vi-VN',
    source: 'en-GB',
    model,
    note: (n) => notes.push(n)
  })
  assert.equal(phrases.length, 2, 'asked twice as a phrase')
  assert.deepEqual(out, { 'm.0': 'vi THE', 'm.1': 'vi WORKOUT' })
  assert.deepEqual(
    await translateKeep({ slots, locale: 'en-GB', source: 'en-GB', model, note: () => {} }),
    {}
  )
})
