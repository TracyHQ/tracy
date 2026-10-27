// A plan read out loud for review in a voice conversation (`src/client/voice-plan.mjs`, council
// 19/10/2026 A6): what is read of it, and the fingerprint an approval is bound to.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planHash, planSpoken, SCOPE_CHARS, TITLE_CHARS } from '../src/client/voice-plan.mjs'

test('the title is the first heading; the scope its first sentences, section headings left out, steps as sentences', () => {
  const spoken = planSpoken(
    [
      '# Đổi màu nút **Liên hệ**',
      '',
      'Đổi nút Liên hệ ở trang chủ sang màu xanh lá. Chữ giữ nguyên.',
      '',
      '## Các bước',
      '- Tìm nút.',
      '- Đổi màu nền.'
    ].join('\n')
  )
  assert.equal(spoken.title, 'Đổi màu nút Liên hệ')
  assert.equal(
    spoken.scope,
    'Đổi nút Liên hệ ở trang chủ sang màu xanh lá. Chữ giữ nguyên. Tìm nút. Đổi màu nền.'
  )
})

test('a long plan is read in whole sentences up to the bound; one long sentence is cut at a word', () => {
  const sentence = 'Rewrite the about page so it tells the story of the bakery in the owner’s own words.'
  const spoken = planSpoken(`# Plan\n\n${Array.from({ length: 10 }, () => sentence).join(' ')}`)
  assert.ok([...spoken.scope].length <= SCOPE_CHARS)
  assert.ok(spoken.scope.endsWith('words.'), 'whole sentences')
  const long = planSpoken(`# Plan\n\n${'word '.repeat(100)}`)
  assert.ok([...long.scope].length <= SCOPE_CHARS)
  assert.ok([...planSpoken(`# ${'Title '.repeat(40)}`).title].length <= TITLE_CHARS)
})

test('a plan that names nothing has no title, and is not read for an approval', () => {
  assert.deepEqual(planSpoken('Just do it.'), { title: '', scope: '' })
  assert.deepEqual(planSpoken(undefined), { title: '', scope: '' })
  assert.equal(planSpoken('# Plan').scope, '')
})

test('the fingerprint is the text’s: the same text agrees, a character more does not', () => {
  const text = '# Plan\n\nDo it.'
  assert.equal(planHash(text), planHash(`${text}`))
  assert.notEqual(planHash(text), planHash(`${text} `))
  assert.notEqual(planHash(text), planHash('# Plan\n\nDo it!'))
  assert.match(planHash(text), /^[0-9a-f]+$/)
  assert.equal(planHash(undefined), planHash(''))
})
