/**
 * The wording contract of the guidance `tracy_build` gives the model (TracyHQ/tracy#609). Every `next` is private: it
 * carries the mark that says so, the persona says never to quote it, a colour change has one exact shape, and the
 * template step asks to confirm one design or to pick among several. Every business here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/guidance-contract.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  BUILD_DESCRIPTION,
  COLOUR_EDIT_GUIDANCE,
  PRIVATE_GUIDANCE_MARK,
  createBuildTool,
  templatesNext
} from '../src/host/build-tool.mjs'

const SESSION = 'session-build-0f3c2a8e-1b2d-4c5e-8f90-a1b2c3d4e5f6'
const matrix = JSON.parse(
  readFileSync(new URL('../../../../config/mode-matrix.json', import.meta.url), 'utf8')
)
const persona = matrix.buildAgent.persona

const option = (slug, name) => ({ slug, name, version: '1.0.0', quickstart: 'released', fits: true })

/** A tool whose one door answers the given status and body for every call. */
function toolAnswering(status, body) {
  return createBuildTool({
    http: async () =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    origin: () => 'https://tracy.example',
    actorFor: () => 'signed-assertion',
    eventsOf: () => [],
    now: () => 0,
    sleep: async () => {},
    waitMs: 1000,
    pollMs: 100
  })
}
const call = (tool, args) => tool.execute(args, { agent: { session: { id: SESSION } } })

test('every next the tool returns carries the private guidance mark, whichever path made it', async () => {
  const results = [
    await call(toolAnswering(200, {}), { action: 'nope' }),
    await call(toolAnswering(200, {}), { action: 'edit', changes: [] }),
    await call(toolAnswering(422, { code: 'INVALID_EDIT', problems: ['Nope.'] }), {
      action: 'edit',
      changes: [{ field: 'main colour', value: 'blue' }]
    }),
    await call(toolAnswering(409, { code: 'STALE_EDIT' }), {
      action: 'edit',
      changes: [{ field: 'look.accent', value: '#1F4E9C' }]
    }),
    await call(toolAnswering(200, { templates: [option('ja-sport', 'Sport')] }), { action: 'templates' })
  ]
  for (const r of results) {
    assert.equal(typeof r.next, 'string')
    assert.ok(r.next.startsWith(`${PRIVATE_GUIDANCE_MARK} `), r.next)
  }
  assert.match(PRIVATE_GUIDANCE_MARK, /never quote it/i)
})

test('the persona and the tool description both say next is private and never repeated', () => {
  assert.match(persona, /next field in a tool result is private guidance/i)
  assert.match(persona, /never quote it, paraphrase it or mention it to the owner/i)
  assert.match(BUILD_DESCRIPTION, /next in a result is private guidance: never repeat it/i)
})

test('no next tells the model to say a tool step aloud', async () => {
  const refused = await call(toolAnswering(422, { problems: [] }), {
    action: 'edit',
    changes: [{ field: 'x', value: 1 }]
  })
  assert.doesNotMatch(refused.next, /pass review to ask/i)
})

test('a colour change has one exact shape, in the description, the refusal and the persona', async () => {
  assert.match(COLOUR_EDIT_GUIDANCE, /field:"look\.accent", value:"#RRGGBB"/)
  assert.match(BUILD_DESCRIPTION, /look\.accent/)
  assert.match(persona, /look\.accent/)
  const refused = await call(toolAnswering(422, { code: 'INVALID_EDIT', problems: ['Nope.'] }), {
    action: 'edit',
    changes: [{ field: 'main colour', value: 'blue' }]
  })
  assert.match(refused.next, /look\.accent/)
  assert.match(refused.next, /plan card/)
})

test('the template step confirms a single design and asks to pick among several', () => {
  const one = templatesNext([option('ja-sport', 'Sport')])
  assert.match(one, /"Use Sport"/)
  assert.match(one, /confirm it/i)
  assert.match(one, /do not ask which one/i)
  const several = templatesNext([option('a', 'Sport'), option('b', 'Studio')])
  assert.match(several, /which one they like/i)
  assert.doesNotMatch(several, /confirm/i)
  assert.match(templatesNext([]), /add a site with Add site/i)
  assert.match(persona, /one design fits, ask the owner to confirm it with the card button/i)
})

test('the tool guidance has no em dash or en dash', () => {
  for (const text of [PRIVATE_GUIDANCE_MARK, COLOUR_EDIT_GUIDANCE, BUILD_DESCRIPTION, templatesNext([])])
    assert.doesNotMatch(text, /[–—]/)
})
