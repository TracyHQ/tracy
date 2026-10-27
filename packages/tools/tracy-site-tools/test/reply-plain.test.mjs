/**
 * WHAT THE AGENT SAYS TO THE CUSTOMER (29/09/2026). The product owner: "the agent's text output
 * is messy — money, prices, lots of technical detail — while our users are usually non-technical."
 * Measured on 171 bench answers: tool or action names in 57%, apply_id / revision / slot in 52%, file
 * paths in 32%, record ids in 25%, layer words in 13%, HTTP status in 8%; and `media.draw` answered
 * "Model google/gemini-3.1-flash-lite-image, image cost $0.0336" because the tool text said "say what
 * it cost" and the answer carried `costUsd` and `model`.
 *
 * The reply contract itself is one paragraph in `config/mode-matrix.json` `identity` (held by
 * `scripts/test/reply-contract.test.mjs`). This suite holds the OTHER half: every instruction in this
 * plugin that used to ask for the opposite now agrees with it — and, just as deliberately, that the
 * instructions which make the agent DECIDE well did not move. Only what it says changed, never how it
 * decides: the layer is still decided before the first call, a request still spans layers until every
 * one is done, a several-item job still checks its writes against its plan, and the receipt's id is
 * still there for `apply.revert` — kept by the agent, not read out.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { answerVerdict, createCallMemory } from '../src/host/call-memory.mjs'
import { mediaDraw } from '../src/host/draw.mjs'
import { EMDASH_RECEIPT_NEXT } from '../src/host/emdash.mjs'
import { JOOMLA_OPEN_NEXT } from '../src/host/replace-joomla-open.mjs'
import { EMDASH_REPLACE_NEXT } from '../src/host/replace-emdash.mjs'
import { WP_REPLACE_NEXT } from '../src/host/replace-wordpress.mjs'
import { REPLACE_NEXT } from '../src/host/replace.mjs'
import { runSiteCall, WRITE_RECEIPT_NEXT } from '../src/host/site-call.mjs'
import { siteContext, stepBudgetNotice, turnLengthNotice } from '../src/host/site-context.mjs'
import { planCall } from '../src/host/site.mjs'
import { fullSiteToolDescription, SURFACE_ACTIONS, siteToolDescription } from '../src/host/surface.mjs'
import { confirmSentence, DESTRUCTIVE_ACTIONS } from '../src/host/tiers.mjs'

const SURFACES = /** @type {(keyof typeof SURFACE_ACTIONS)[]} */ (Object.keys(SURFACE_ACTIONS))

/** Words about money. None may reach an instruction to the agent about what to tell the customer. */
const MONEY = /costUsd|\bpaid\b|\bcosts?\b|\bprices?\b|\bpricing\b|\bcredits?\b|\busd\b|[$]\d/i

// ── Money: media.draw says nothing about cost, and its answer carries neither price nor model ─────

test('no tracy_site description on any surface tells the agent to speak of a cost, and none names a price field', () => {
  const texts = [
    ...SURFACES.flatMap((s) => [siteToolDescription(s), siteToolDescription(s, { wordpressReadBack: true })]),
    fullSiteToolDescription()
  ]
  for (const text of texts) assert.doesNotMatch(text, MONEY)
})

test('what stops runaway drawing stays, worded without money: one call per picture', () => {
  assert.match(fullSiteToolDescription(), /One call per picture · /)
  assert.match(
    siteToolDescription('wordpress'),
    /Effects: media\.draw adds ONE picture per call: write its path where it belongs\./
  )
  assert.match(
    siteToolDescription('emdash'),
    /Effects: media\.draw adds one picture per call: write its id with tracy_emdash content_update\./
  )
  // The returns list names no price and no model: {path} on an open site, {id, url} on EmDash.
  assert.match(
    siteToolDescription('wordpress'),
    /the largest images \{path, url, width, height\} · \{path\}\./
  )
  assert.match(
    fullSiteToolDescription(),
    /media\.draw \{prompt, slot\? \| like\? \| aspect\?\} → \{path, width, height, next\}:/
  )
})

/** A picture model that answers a 1600×1000 JPEG at a price, as the seeder's `drawPicture` reports it. */
const drawn = () => ({
  ok: true,
  bytes: Buffer.from('jpeg'),
  ext: 'jpg',
  path: 'images/tracy-content/abc.jpg',
  width: 1600,
  height: 1000,
  model: 'google/gemini-3.1-flash-lite-image',
  costUsd: 0.0336
})

test('a draw answers no price and no model name — on a sealed site and on EmDash — and still says where the picture goes', async () => {
  const sealed = await mediaDraw({
    params: { prompt: 'a shop front', slot: 'module-441.8' },
    webroot: null,
    door: { imageModel: 'google/gemini-3.1-flash-lite-image' },
    resolveSlot: async () => null,
    draw: async () => drawn(),
    upload: async () => ({ ok: true })
  })
  // A slot the contract does not know is refused before anything is drawn: nothing to leak there either.
  assert.equal(sealed.ok, false)
  const emdash = await mediaDraw({
    params: { prompt: 'a shop front', aspect: '16/10' },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'google/gemini-3.1-flash-lite-image' },
    draw: async () => ({ ...drawn(), path: 'tracy-content/abc.jpg' }),
    upload: async () => ({ ok: true, id: '01MEDIA', url: '/_emdash/media/abc.jpg' })
  })
  assert.equal(emdash.ok, true)
  assert.match(emdash.next, /content_update/)
  // The open road: a draw shaped like a picture the site holds.
  const webroot = mkdtempSync(path.join(tmpdir(), 'reply-plain-'))
  mkdirSync(path.join(webroot, 'images'), { recursive: true })
  const png = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(1600, 16)
  png.writeUInt32BE(1000, 20)
  writeFileSync(path.join(webroot, 'images/hero.png'), png)
  const open = await mediaDraw({
    params: { prompt: 'a shop front', like: 'images/hero.png' },
    webroot,
    door: { imageModel: 'google/gemini-3.1-flash-lite-image' },
    draw: async () => drawn(),
    upload: async () => ({ ok: true })
  })
  assert.equal(open.ok, true)
  assert.match(open.next, /content\.contract/)
  for (const answer of [emdash, open]) {
    assert.equal('costUsd' in answer, false)
    assert.equal('model' in answer, false)
    assert.doesNotMatch(JSON.stringify(answer), /gemini|google|openrouter|cost|[$]\d/i)
  }
})

test('a failed draw and a host with no picture model say so without naming the model or the ops console', async () => {
  const failed = await mediaDraw({
    params: { prompt: 'x', aspect: '16/10' },
    webroot: null,
    platform: 'emdash',
    door: { imageModel: 'google/gemini-3.1-flash-lite-image' },
    // What the seeder's `drawPicture` says when the model returns nothing.
    draw: async () => ({ ok: false, error: 'google/gemini-3.1-flash-lite-image answered no picture' }),
    upload: async () => ({ ok: true })
  })
  assert.equal(failed.code, 'NOT_DRAWN')
  assert.equal(failed.error, 'the picture model answered no picture')
  const none = await mediaDraw({
    params: { prompt: 'x', aspect: '16/10' },
    webroot: null,
    platform: 'emdash',
    door: null,
    draw: async () => drawn(),
    upload: async () => ({ ok: true })
  })
  assert.equal(none.code, 'NO_PICTURE_MODEL')
  assert.doesNotMatch(none.error, /\/ops|administrator/)
  assert.match(none.error, /Tell the customer pictures cannot be drawn on this site yet/)
})

// ── Receipts: the agent keeps the id and the undo, and tells the customer what changed ─────────────

/** An instruction to tell the customer something that names the id or the undo — what the receipt must no longer do. */
const TELLS_THE_UNDO = /\b(tell|say)\b[^.;:]*\b(how to undo|the undo|apply\.revert|apply_id)\b/i

test('a write receipt tells the customer what changed in plain words and keeps the id for the agent', () => {
  assert.match(WRITE_RECEIPT_NEXT, /tell the customer what changed, in plain words\./)
  assert.match(
    WRITE_RECEIPT_NEXT,
    /Keep the apply_id to yourself: apply\.revert with it if they ask to undo\./
  )
  assert.match(EMDASH_RECEIPT_NEXT, /tell the customer what changed, in plain words\./)
  assert.match(EMDASH_RECEIPT_NEXT, /Keep undo to yourself: use it only if they ask to put it back\./)
  for (const next of [WRITE_RECEIPT_NEXT, EMDASH_RECEIPT_NEXT]) {
    assert.doesNotMatch(next, TELLS_THE_UNDO)
    // Deciding did not change: a several-item job keeps going until every change asked is made.
    assert.match(next, /When every change asked is made/)
    assert.match(next, /nothing to read back/)
  }
})

test('the replace receipts say what changed in plain words; the undo is the agent’s, and every decision in them stays', () => {
  for (const key of /** @type {const} */ (['receipt', 'receiptAlsoIn', 'receiptStillHolds'])) {
    assert.match(REPLACE_NEXT[key], /in plain words what changed/, key)
    assert.doesNotMatch(REPLACE_NEXT[key], TELLS_THE_UNDO, key)
    assert.doesNotMatch(REPLACE_NEXT[key], /how to undo|and the undo|before → after/, key)
  }
  assert.match(REPLACE_NEXT.receipt, /Keep the undo for yourself until they ask\. Read nothing back\./)
  // …the decisions that ride in the same sentences.
  assert.match(REPLACE_NEXT.receiptAlsoIn, /Asked for every place\? The same call with all:true changes them/)
  assert.match(REPLACE_NEXT.receiptStillHolds, /Named by the customer\? Add them\. Left out on purpose\?/)
})

test('a partly written change is told in plain words; the call that puts the rest back is still named', () => {
  for (const [name, dictionary] of /** @type {const} */ ([
    ['WordPress', WP_REPLACE_NEXT],
    ['open Joomla', JOOMLA_OPEN_NEXT]
  ])) {
    assert.match(dictionary.partialNext, /^tell the customer in plain words what stands; /, name)
    assert.match(
      dictionary.busyPartialNext,
      /^tell the customer in plain words that \{n\} places changed and stand; /,
      name
    )
    for (const next of [dictionary.partialNext, dictionary.busyPartialNext]) {
      assert.match(next, /apply\.revert \{apply_id:"\{applyId\}"\} undoes /, name)
      assert.doesNotMatch(next, TELLS_THE_UNDO, name)
      assert.doesNotMatch(next, /\brecords\b/, `${name}: the customer has no "records"`)
    }
    assert.match(dictionary.busyPartialNext, /Do not retry in a loop/, name)
  }
  assert.match(
    EMDASH_REPLACE_NEXT.partialNext,
    /^tell the customer in plain words what was written and what was not; the undo puts the written ones back$/
  )
})

// ── The site context: decide the layer, say what you will change ───────────────────────────────────

/** The context text of one site, per platform. */
async function contextOf(
  /** @type {string} */ label,
  /** @type {'wordpress' | 'joomla' | 'emdash'} */ platform
) {
  const folder = path.join(mkdtempSync(path.join(tmpdir(), 'reply-plain-')), label)
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.tracy.test`, platform })
  )
  mkdirSync(path.join(folder, '.webroot'))
  const context = await siteContext(folder, label, async () => {
    throw new Error('platform detection should not run')
  })
  assert.ok(context)
  return context.text
}

const PLATFORMS = /** @type {const} */ (['wordpress', 'joomla', 'emdash'])

test('the layer rule still makes the agent decide the layer before its first call, and no longer asks it to say the layers', async () => {
  for (const platform of PLATFORMS) {
    const text = await contextOf(`layers-${platform}`, platform)
    // The decisions, untouched.
    assert.match(text, /DECIDE THE LAYER BEFORE THE FIRST CALL\./, platform)
    assert.match(
      text,
      /Everything a visitor sees sits in one of five, each with exactly one door: the WORDS somebody wrote/,
      platform
    )
    assert.match(text, /A request may SPAN layers and is not done until every layer it spans is/, platform)
    assert.match(
      text,
      /Decide which layers a request spans before you start; name none to the customer\./,
      platform
    )
    assert.match(text, /ASK THEM ALL IN ONE STEP/, platform)
    // What it said, which is what the customer read: "Lớp thay đổi: PRESENTATION" ("Layer changed: PRESENTATION").
    assert.doesNotMatch(text, /Say which layers|which you finished|NAME THE LAYER/, platform)
  }
})

test('the sentence before the first call, and the report after a change, are plain — and the plan is still made before the work', async () => {
  for (const platform of PLATFORMS) {
    const text = await contextOf(`plain-${platform}`, platform)
    assert.match(
      text,
      /before the first tool call, and say plainly what you will do\. Two unrelated asks/,
      platform
    )
    assert.doesNotMatch(text, /say your plan in a line/, platform)
    assert.match(
      text,
      /ONE JOB: make the smallest change that does it, then say what changed, plainly\./,
      platform
    )
    assert.doesNotMatch(text, /how to undo it/, platform)
    // Several jobs: the plan first, one item per change, and the writes checked against it — as before.
    assert.match(text, /SEVERAL JOBS: (call `todo_write` FIRST|write the plan FIRST)/, platform)
    assert.match(text, /put the answers of your writes in one plain overview against your list: /, platform)
    assert.match(
      text,
      /an item with no writes was not done, and a write under no item was not asked for\./,
      platform
    )
    assert.match(text, /Needing a write you never planned means the plan was wrong/, platform)
    // The receipt is still the check; nothing here sends the agent to read a write back.
    assert.match(text, /the write's answer is the check/, platform)
    // The reply's language is named per turn now (`prompter.mjs` `replyLanguageRule`, bug 30/09), never
    // by this rule, which named none.
    assert.doesNotMatch(text, /Reply in the customer's language\./, platform)
  }
})

test('a mode with no shell tells the customer a change may show a little later, and does not ask for cache talk', async () => {
  // Writer and SEO/GEO carry no shell (`toolReach`): the cache of a file edit or of a page-cache
  // plugin cannot be cleared by them, and what the customer hears about it is plain.
  const noShell = ['ask_user_question', 'edit', 'glob', 'grep', 'read', 'skill', 'tracy_site', 'write']
  for (const [platform, preset] of /** @type {const} */ ([
    ['joomla', 'seo-geo-joomla'],
    ['wordpress', 'writer-wordpress']
  ])) {
    const folder = path.join(mkdtempSync(path.join(tmpdir(), 'reply-plain-')), `noshell-${platform}`)
    mkdirSync(path.join(folder, '.tracy'), { recursive: true })
    writeFileSync(
      path.join(folder, '.tracy', 'site.json'),
      JSON.stringify({ siteKey: `noshell-${platform}.tracy.test`, platform })
    )
    mkdirSync(path.join(folder, '.webroot'))
    const context = await siteContext(folder, `noshell-${platform}`, async () => platform, preset, {
      tools: noShell
    })
    assert.ok(context)
    assert.match(
      context.text,
      /which takes a shell this mode does not have: tell the customer it may show a little later\./,
      platform
    )
    assert.doesNotMatch(
      context.text,
      /say so when you make one|flushed, which takes a shell this mode does not have: say so\./,
      platform
    )
  }
})

test('the two notices that end a long turn ask for a report in plain words', () => {
  assert.match(
    turnLengthNotice(30, 1),
    /Say in plain words what is now true on the site, what is still wrong, and what you need/
  )
  assert.match(
    stepBudgetNotice(12, false, 2),
    /Say in plain words what you have changed so far, what is left, and the one thing you need from the customer to finish it\./
  )
})

// ── The confirm card: the customer reads a sentence, not an action name ────────────────────────────

test('every destructive action has its own plain sentence, and none of them names the action', () => {
  const actions = [...DESTRUCTIVE_ACTIONS, 'content.contract']
  for (const action of actions) {
    const sentence = confirmSentence(action)
    assert.match(sentence, /^This [a-z]+ .*\.$/, action)
    assert.ok(!sentence.includes(action), `${action}: ${sentence}`)
    assert.doesNotMatch(sentence, /[a-z]+[._][a-z]+\b/, `${action}: a raw name is on the card: ${sentence}`)
    assert.notEqual(sentence, confirmSentence('nothing.like.it'), `${action} has a sentence of its own`)
  }
  // One that has none is described generally, never by name.
  assert.equal(
    confirmSentence('nothing.like.it'),
    'This changes something on your site that is hard to undo.'
  )
})

test('the tracy_site confirm card carries the sentence; the refusal keeps the action for the agent; the answer still opens the call', async () => {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const memory = createCallMemory({ now: () => 1_000 })
  const ctx = {
    memory,
    sessionId: 'session-w',
    label: 'wp-plain',
    actorKey: 'ana@example.com',
    facts: { platform: 'wordpress' },
    sleep: async () => {},
    send: async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
      sent.push([action, structuredClone(params)])
      // The read that names the record on the question (council 20/10/2026).
      if (action === 'content.get') return { ok: true, item: { id: 42, post_title: 'Hello' } }
      return { ok: true, kind: 'post', id: 42, trashed: true }
    }
  }
  const del = () => {
    const plan = planCall({ action: 'content.delete', params: { kind: 'post', id: 42, confirm: true } })
    assert.ok(plan.ok)
    return /** @type {Promise<any>} */ (runSiteCall({ ...ctx, plan }))
  }
  const asked = await del()
  assert.equal(asked.code, 'CONFIRM_FIRST')
  // The agent reads the action; the customer reads the sentence.
  assert.match(
    asked.error,
    /^content\.delete changes what this site runs or holds, and the customer has not been asked\./
  )
  const [q] = asked.ask.questions
  assert.equal(q.question, 'This deletes "Hello" from your site. Go ahead?')
  assert.doesNotMatch(q.question, /content\.delete/)
  // What the answer MEANS never read that text: the question's id and the first option decide it,
  // whatever words the card carries.
  assert.deepEqual(answerVerdict(asked.ask, { answers: [{ id: q.id, selected: [q.options[0].label] }] }), {
    agreed: [q.id],
    declined: [],
    open: false
  })
  const reworded = {
    questions: [
      { ...q, question: 'Xoá bài "Hello" nhé?', options: [{ label: 'Có, xoá' }, { label: 'Không, giữ lại' }] }
    ]
  }
  memory.customerAnswered('session-w', reworded, { answers: [{ id: q.id, selected: ['Có, xoá'] }] })
  const done = await del()
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 200))
  // The only write is the one delete (the host's translation-group read and its title read are reads).
  assert.equal(sent.filter(([action]) => action !== 'content.read' && action !== 'content.get').length, 1)
})
