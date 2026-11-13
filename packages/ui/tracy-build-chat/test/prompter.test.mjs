/**
 * Who `tracy_build` acts as: the person who typed last, by the same rule as `tracy-site-tools` (TracyHQ/tracy#609).
 * Both readers are run on the same invented logs, so the copy cannot drift from the original.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/prompter.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { latestPrompter as siteTools } from '../../../tools/tracy-site-tools/src/host/prompter.mjs'
import { latestPrompter } from '../src/host/prompter.mjs'

const said = (source) => ({ type: 'user/message', data: { source } })
const owner = { kind: 'user', prompter: { user: 'owner-1', email: 'owner@harbour-lane.example' } }
const partner = { kind: 'user', prompter: { user: 'partner-2', email: 'partner@harbour-lane.example' } }

const LOGS = [
  undefined,
  [],
  [said(owner)],
  [said(owner), said(partner)],
  [said(partner), said({ kind: 'plugin', prompter: owner.prompter })],
  [said(owner), said({ kind: 'user', prompter: { user: 'gate-master', email: '' } })],
  [said(owner), { type: 'tool/result', data: {} }],
  [said({ kind: 'user' })]
]

test('the build tool names the same person the site tools name, for every log', () => {
  for (const log of LOGS) assert.deepEqual(latestPrompter(log), siteTools(log))
  assert.deepEqual(latestPrompter([said(owner), said(partner)]), partner.prompter)
  assert.equal(
    latestPrompter([said(owner), said({ kind: 'user', prompter: { user: 'gate-master', email: '' } })]),
    null
  )
})
