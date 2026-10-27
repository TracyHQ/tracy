/**
 * The chat's main language for the voice hint (`voice-language.mjs`): the opening message a person
 * wrote, read from the session's event window — a `/` command, an empty message, a picked element's
 * block and a message Tracy sent itself skipped — and kept once known.
 *
 *   node --test packages/ui/tracy-chat-input/test/voice-language.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chatLanguageOf, chatMainLanguage, voiceHint } from '../src/client/voice-language.mjs'

const said = (text, kind) => ({
  type: 'event',
  event: {
    type: 'user/message',
    data: { content: [{ type: 'text', text }], ...(kind ? { source: { kind } } : {}) }
  }
})
const other = (type) => ({ type: 'event', event: { type, data: {} } })

test('the opening clear message gives the language; later ones never change it', () => {
  assert.equal(
    chatLanguageOf([
      other('turn/start'),
      said('Đổi màu nút liên hệ sang xanh đậm giúp tôi'),
      said('Make the header sticky please, and add a contact button')
    ]),
    'vi'
  )
  assert.equal(chatLanguageOf([said('Make the header sticky please'), said('Đổi màu nút sang xanh')]), 'en')
})

test('a command, an empty message, an unsure one and a message not typed by a person are skipped', () => {
  assert.equal(
    chatLanguageOf([
      said('/help'),
      said('   '),
      said('ok'),
      said('Please rewrite the whole homepage in English', 'agent'),
      said('Viết lại phần giới thiệu cho ngắn gọn hơn')
    ]),
    'vi'
  )
})

test('a picked element’s block is not the person’s words', () => {
  const block = [
    'Sửa đoạn này cho dễ đọc hơn nhé',
    '```tracy-element',
    '<mentioned-element tag="p">We build beautiful websites for small business owners everywhere</mentioned-element>',
    '```',
    'Use `tracy_site` content.replace for this element.'
  ].join('\n')
  assert.equal(chatLanguageOf([said(block)]), 'vi')
})

test('no window, no message, nothing clear: no language', () => {
  assert.equal(chatLanguageOf(undefined), '')
  assert.equal(chatLanguageOf([other('turn/start')]), '')
  assert.equal(chatLanguageOf([said('ok')]), '')
})

test('a conversation’s language is read from its live window, then kept', () => {
  let entries = []
  const sessions = {
    binding: (id) => (id === 's1' ? { eventSource: { getSnapshot: () => ({ entries }) } } : undefined)
  }
  assert.equal(chatMainLanguage(sessions, 's1'), '', 'no message yet: the first words are dictated')
  entries = [said('Thêm một trang giới thiệu về công ty')]
  assert.equal(chatMainLanguage(sessions, 's1'), 'vi')
  entries = [said('Add an about page for the company')]
  assert.equal(chatMainLanguage(sessions, 's1'), 'vi', 'history reloaded or scrolled: the language stays')
  assert.equal(chatMainLanguage(sessions, 's2'), '')
  assert.equal(chatMainLanguage(sessions, undefined), '')
  assert.equal(
    chatMainLanguage(
      {
        binding: () => {
          throw new Error('gone')
        }
      },
      's3'
    ),
    '',
    'a binding that throws gives no hint'
  )
})

test('the hint: the chat’s language, else — no clear message yet — the interface’s', () => {
  const window = (entries) => ({ binding: () => ({ eventSource: { getSnapshot: () => ({ entries }) } }) })
  assert.equal(voiceHint(window([said('Make the header sticky please')]), 'h1', 'vi'), 'en')
  assert.equal(voiceHint(window([]), 'h2', 'vi'), 'vi', 'the first words are being dictated')
  assert.equal(voiceHint(window([]), 'h3', 'zh-CN'), 'zh')
  assert.equal(voiceHint(window([]), 'h4', undefined), '')
})
