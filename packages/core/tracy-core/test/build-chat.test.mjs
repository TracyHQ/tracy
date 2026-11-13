// TracyHQ/tracy#602: the browser knows the build chat by the session the seat door minted for it.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BUILD_CHAT_PATH, isBuildChatPage, isBuildChatSession } from '../src/build-chat/index.mjs'

const ID = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'

test('only a door-shaped build session is the build chat', () => {
  assert.equal(BUILD_CHAT_PATH, '/new/build')
  assert.equal(isBuildChatSession(ID), true)
  for (const other of [
    'session-widget-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e',
    'session-1',
    `${ID}x`,
    'session-build-',
    undefined,
    7
  ])
    assert.equal(isBuildChatSession(other), false, String(other))
})

test('the build chat page is that session in the creation workspace, nowhere else', () => {
  assert.equal(isBuildChatPage(`/new/s/${ID}`), true)
  assert.equal(isBuildChatPage(`/new/s/${ID}/`), true)
  for (const other of ['/new/', '/new/s/session-1', `/site.example/s/${ID}`, `/s/${ID}`, `/new/s/${ID}/more`])
    assert.equal(isBuildChatPage(other), false, other)
})
