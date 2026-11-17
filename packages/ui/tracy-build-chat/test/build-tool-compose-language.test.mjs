/**
 * The plan is composed in the language the owner chats in (#575 walk: a Vietnamese chat read English section
 * reasons): the plan action sends the language the owner writes in to the compose door, which asks the plan's
 * sentences for the owner in it. Every business here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/build-tool-compose-language.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createBuildTool, INTERFACE_LANGUAGE_HEADER } from '../src/host/build-tool.mjs'

const SESSION = 'session-build-7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d'

/** A fake tracy-web that records every compose body and answers a running compose. */
function fakeWeb(interfaceLanguage = 'en') {
  const bodies = []
  const http = async (url, init = {}) => {
    const path = new URL(url).pathname
    if (init.method === 'POST' && path.endsWith('/compose')) bodies.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ step: 'compose', state: 'running' }), {
      status: 200,
      headers: { 'content-type': 'application/json', [INTERFACE_LANGUAGE_HEADER]: interfaceLanguage }
    })
  }
  const tool = createBuildTool({
    http,
    origin: () => 'https://tracy.example',
    actorFor: () => 'signed-assertion',
    eventsOf: () => [],
    waitMs: 0
  })
  return { tool, bodies }
}
const run = (tool, args) => tool.execute(args, { agent: { session: { id: SESSION } } })

test('the plan action names the language the owner writes in to the compose door', async () => {
  const { tool, bodies } = fakeWeb('en')
  await run(tool, { action: 'plan', language: 'vi' })
  assert.equal(bodies.at(-1).language, 'vi')
})

test('a plan call that names no language keeps the one the owner last wrote in', async () => {
  const { tool, bodies } = fakeWeb('en')
  await run(tool, { action: 'templates', language: 'fr' })
  await run(tool, { action: 'plan' })
  assert.equal(bodies.at(-1).language, 'fr')
})
