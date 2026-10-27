/**
 * The poll tells tracy-web the language the screen speaks right now (Akemi 04/10/2026), so mail
 * that someone else triggers goes out in that language: the page knows it, a cookie or a
 * browser header can be stale.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { unreadPath } from '../src/client/api.ts'

test('the unread poll names the interface language', () => {
  assert.equal(unreadPath('vi'), '/api/notifications/unread?lang=vi')
  assert.equal(unreadPath('zh-CN'), '/api/notifications/unread?lang=zh-CN')
  assert.equal(unreadPath('en'), '/api/notifications/unread?lang=en')
})

test('without a language the poll names none, and tracy-web falls back on its own order', () => {
  assert.equal(unreadPath(undefined), '/api/notifications/unread')
  assert.equal(unreadPath(''), '/api/notifications/unread')
})
