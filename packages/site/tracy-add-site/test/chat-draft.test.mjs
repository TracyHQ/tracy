import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chatDraftAnswers, chatDraftOf } from '../src/client/chat-draft.mjs'
const raw = {
  version: 1,
  intent: 'create',
  sourceRevision: '12',
  platform: 'joomla',
  answersByFeed: {
    'site.name': 'Hoa Mai',
    'copy.about': 'Da Nang; green; Vietnamese and English requested',
    'site.languages': ['vi'],
    'copy.tone': 'friendly'
  }
}
const questions = [
  { id: 'name', kind: 'text', feeds: ['site.name'] },
  { id: 'about', kind: 'longtext', feeds: ['copy.about'] },
  { id: 'language', kind: 'languages', feeds: ['site.languages'], options: ['en', 'vi'] },
  { id: 'tone', kind: 'choice', feeds: ['copy.tone'], options: ['formal'] }
]
test('only actually served questions and valid options receive the chat details', () => {
  const draft = chatDraftOf(raw)
  assert.deepEqual(chatDraftAnswers(questions, draft, {}), {
    name: 'Hoa Mai',
    about: raw.answersByFeed['copy.about'],
    language: ['vi']
  })
  assert.deepEqual(chatDraftAnswers([{ id: 'other-name', kind: 'text', feeds: ['site.name'] }], draft, {}), {
    'other-name': 'Hoa Mai'
  })
})
test('typed answers and deliberate clears always win, including a reopened form', () => {
  assert.deepEqual(
    chatDraftAnswers(questions, chatDraftOf(raw), { name: 'My edited name', about: '', language: [] }),
    {}
  )
})
test('malformed metadata and unsafe import URLs cannot prefill a form', () => {
  for (const delta of [
    { version: 2 },
    { intent: 'delete' },
    { sourceRevision: 'no' },
    { platform: 'drupal' },
    { answersByFeed: [] }
  ])
    assert.equal(chatDraftOf({ ...raw, ...delta }), undefined)
  assert.equal(chatDraftOf({ ...raw, importUrl: 'https://user:secret@example.test/' }).importUrl, undefined)
  assert.equal(chatDraftOf({ ...raw, importUrl: 'https://example.test/' }).importUrl, 'https://example.test')
})
