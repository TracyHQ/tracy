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
  BUILD_BUSY_SAY,
  BUILD_DESCRIPTION,
  COLOUR_EDIT_GUIDANCE,
  DESIGN_NOT_BUILDABLE_SAY,
  NOT_DONE_GUIDANCE,
  SITE_NOT_STARTED_SAY,
  OWNER_LANGUAGE_GUIDANCE,
  PLAN_CARD_CONTROLS_GUIDANCE,
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
  // Run 6: the agent named the English label "Use JA Boxing" on a Vietnamese card. It points at the button instead.
  assert.doesNotMatch(one, /Use Sport/)
  assert.match(one, /the button on the card/)
  assert.match(one, /never quote the words on the button/i)
  assert.match(one, /confirm it/i)
  assert.match(one, /do not ask which one/i)
  const several = templatesNext([option('a', 'Sport'), option('b', 'Studio')])
  assert.match(several, /which one they like/i)
  assert.doesNotMatch(several, /confirm/i)
  assert.match(templatesNext([]), /add a site with Add site/i)
  assert.match(persona, /one design fits, ask the owner to confirm it with the card button/i)
})

test('the owner language is the interface language every answer names, never a fixed language, and every handed sentence follows it', async () => {
  // Run 6: English answers on a Vietnamese interface after a fixed message. The decided rule is the interface
  // language (`scripts/test/build-agent-preset.test.mjs`): every answer names it, and only an answer that names none
  // falls back to the language the owner writes in.
  assert.ok(persona.includes(OWNER_LANGUAGE_GUIDANCE), 'the persona says the rule word for word')
  assert.match(persona, /language of the owner's interface/)
  assert.match(OWNER_LANGUAGE_GUIDANCE, /every tracy_build result names it in interfaceLanguage/)
  assert.match(OWNER_LANGUAGE_GUIDANCE, /change only when the owner asks you to/)
  assert.match(OWNER_LANGUAGE_GUIDANCE, /when you cannot tell.*use the language the owner writes in/i)
  assert.doesNotMatch(OWNER_LANGUAGE_GUIDANCE, /\b(English|Vietnamese)\b/)
  assert.match(
    BUILD_DESCRIPTION,
    /in the language of the owner's interface, which each result names in interfaceLanguage/
  )
  const revised = await call(
    toolAnswering(200, {
      step: 'revise',
      state: 'done',
      result: {
        plan: {
          schema: 'tracy-build-plan/v1',
          id: 'p',
          revision: 2,
          name: 'Club',
          facts: [],
          items: [],
          pages: []
        },
        brand: 'own',
        unchanged: true,
        revision: { changed: [], notDone: [{ what: 'A video of the club', why: 'You have no video.' }] }
      }
    }),
    { action: 'plan', request: 'Add a video.' }
  )
  // After a Not done: nothing promised beyond the card and the plan (run 6: "send me the video link and I will add it").
  assert.ok(revised.next.includes(NOT_DONE_GUIDANCE), revised.next)
  assert.match(persona, /Promise nothing beyond what the plan card and the plan offer/)
  assert.match(persona, /Never quote the words on a button/)
})

test('the tool guidance has no em dash or en dash', () => {
  for (const text of [
    OWNER_LANGUAGE_GUIDANCE,
    NOT_DONE_GUIDANCE,
    templatesNext([option('a', 'Sport')]),
    PRIVATE_GUIDANCE_MARK,
    COLOUR_EDIT_GUIDANCE,
    BUILD_DESCRIPTION,
    templatesNext([]),
    PLAN_CARD_CONTROLS_GUIDANCE
  ])
    assert.doesNotMatch(text, /[–—]/)
})

test('the guidance names only the controls the plan card has: facts, service names and the main colour', async () => {
  assert.match(PLAN_CARD_CONTROLS_GUIDANCE, /a business fact, a service name or the main colour/)
  assert.match(PLAN_CARD_CONTROLS_GUIDANCE, /Never say that the language/)
  const refused = await call(toolAnswering(422, { code: 'INVALID_EDIT', problems: ['Nope.'] }), {
    action: 'edit',
    changes: [{ field: 'language', value: 'fr' }]
  })
  assert.ok(refused.next.includes(PLAN_CARD_CONTROLS_GUIDANCE))
  // The card itself: the language and the pictures are shown, never offered as an editor.
  const card = readFileSync(new URL('../src/client/PlanCard.tsx', import.meta.url), 'utf8')
  assert.match(card, /<Value field="language"/)
  assert.match(card, /<Value\s+field="pictures\.generated\.frames"/)
})

test('the busy sentence of the tool is the plan card sentence, word for word', () => {
  const strings = readFileSync(new URL('../src/client/strings.ts', import.meta.url), 'utf8')
  const card = strings.match(/'plan\.busy':\s*'([^']+)'/)?.[1]
  assert.equal(typeof card, 'string')
  assert.equal(BUILD_BUSY_SAY, card)
})

test('a build that did not start: the tool and the card say the same sentence, a plain one for a design', () => {
  const strings = readFileSync(new URL('../src/client/strings.ts', import.meta.url), 'utf8')
  const card = (key) =>
    strings.match(new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'([^']+)'`))?.[1] ??
    strings.match(new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*\\n\\s*'([^']+)'`))?.[1]
  assert.equal(card('stopped.notStarted'), SITE_NOT_STARTED_SAY)
  assert.equal(card('stopped.notStarted.design'), DESIGN_NOT_BUILDABLE_SAY)
  for (const say of [SITE_NOT_STARTED_SAY, DESIGN_NOT_BUILDABLE_SAY]) {
    assert.match(say, /plan is kept/)
    assert.doesNotMatch(say, /[–—]|fail/i)
  }
})

test('a stop that may be rerun: the persona says the sentence, asks nothing, and reruns once on the owner message', () => {
  assert.match(persona, /rerun is true/i)
  assert.match(persona, /do not ask the owner a question about the stop/i)
  assert.match(persona, /Please try again\./)
  assert.match(persona, /call tracy_build once more/i)
  assert.match(BUILD_DESCRIPTION, /rerun/i)
})
