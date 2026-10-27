/**
 * 🔒 F4 (30/09/2026): A ROW NAMED BY ITS ULID, WITH NO LANGUAGE BESIDE IT, IS THE ENTRY.
 *
 * v7 EmDash on a 40-language site (V7-delete-chat-dev/-wri, V7-delete-pick-des/-seo): the model named a row
 * by its ULID — a list row, a `content_translations` answer, a pick's `emdash:<collection>:<ulid>:<slug>`
 * mark — for "delete this post", and the door asked about ONE row. The customer said yes, one language
 * went and 39 stayed online (the agent called it done), or the agent walked the other 39 and the customer
 * was asked 40 times (19 LLM calls, 43–47 refused calls, no answer). A ULID and the slug it stands for name
 * the same entry, so they get the same one question and the same one call; a language is named where the
 * call says so (`locale`), and then the card says what stays and the answer says how many remain.
 *
 * P3 (30/09/2026): the other language rows of an agreed entry go three at a time, not one after the other —
 * 40 languages took 8.4 s in v7 cp5. The receipt is the one the sequential loop gave, and a row that failed
 * because the site's database was busy is asked once more, alone, before it is reported — unless that retry
 * meets the same busy database, and then the rest are reported as they came.
 *
 *   node --test packages/tools/tracy-site-tools/test/emdash-row-delete.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { confirmQuestionId, createCallMemory } from '../src/host/call-memory.mjs'
import { refusalNext } from '../src/host/site.mjs'
import { answer, createEmdashState, failed, fakeSite, runDoor } from './emdash-door-fixture.mjs'
import { emdashHost } from './emdash-host-fixture.mjs'

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

/** A site serving en/ru/de whose "hello-world" post exists in all three. */
const TRIO = {
  en: '01FFFFFFFFFFFFFFFFFFFFFFEN',
  ru: '01FFFFFFFFFFFFFFFFFFFFFFR1',
  de: '01FFFFFFFFFFFFFFFFFFFFFFDE'
}

/** @param {{ refuse?: string[] }} [opts] */
function trioSite({ refuse = [] } = {}) {
  const rows = Object.entries(TRIO).map(([locale, id]) => ({
    id,
    locale,
    slug: 'hello-world',
    status: 'published'
  }))
  const site = fakeSite({
    served: ['en', 'ru', 'de'],
    on: {
      content_get: (args) => {
        const row = rows.find((r) => r.locale === args.locale || r.id === args.id)
        return answer({ item: { ...row, data: { title: `Hello world (${row?.locale})` } } })
      },
      content_translations: () => answer({ translationGroup: TRIO.en, translations: rows }),
      content_delete: (args) =>
        refuse.includes(args.id)
          ? failed('[ENTRY_LOCKED] Ana has it open')
          : answer({ deleted: true, id: args.id })
    }
  })
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a')
  const state = createEmdashState()
  const call = (/** @type {Record<string, unknown>} */ args, confirm = false) =>
    runDoor(
      site,
      {
        tool: 'content_delete',
        arguments: { collection: 'posts', ...args },
        ...(confirm ? { confirm: true } : {})
      },
      { memory, state, turn: memory.turnOf('session-a') }
    )
  const deleted = () =>
    site.calls
      .filter((c) => 'name' in c && c.name === 'content_delete')
      .map((c) => /** @type {any} */ (c).arguments.id)
  /** The customer clicks the go-ahead (option 0) or another option of the card a refusal handed over. */
  const answerCard = (/** @type {any} */ asked, option = 0) => {
    const [q] = asked.ask.questions
    memory.customerAnswered('session-a', asked.ask, {
      answers: [{ id: q.id, selected: [q.options[option].label] }]
    })
  }
  return { site, memory, state, call, deleted, answerCard }
}

test('a ULID with no language asks about the entry — one question, and the confirmed call removes every language', async () => {
  const { call, deleted, site, answerCard } = trioSite()
  // Whichever row's ULID the model has — the default language's or another's — the call names no language.
  /** @type {string[]} */
  const ids = []
  for (const [k, id] of [TRIO.en, TRIO.ru].entries()) {
    const asked = await call({ id })
    assert.equal(asked.code, 'CONFIRM_FIRST', id)
    assert.equal(asked.languages, 3, id)
    assert.equal(asked.otherLanguages, undefined, id)
    assert.match(
      asked.ask.questions[0].question,
      /^This removes posts "hello-world" in all 3 languages\. Go ahead\?$/
    )
    ids.push(asked.ask.questions[0].id)
    // The agent is told what the id does not say, and how to say it: EmDash's own tool takes no locale.
    // A second row of the same entry in the same turn is answered short (09/10/2026: a burst of 20 such
    // calls in one step), with the same question and a next that says one call is the whole delete.
    if (k === 0)
      assert.equal(
        asked.error,
        'content_delete removes posts "hello-world" in all 3 languages. One language only: add locale.'
      )
    else {
      assert.equal(asked.already, true)
      assert.equal(
        asked.error,
        "Asked already: the same entry as this turn's first content_delete, in all 3 languages."
      )
      assert.match(
        asked.next,
        /ONE content_delete with confirm:true removes all 3 languages\. Send no other row\.$/
      )
    }
  }
  assert.equal(ids[0], ids[1], 'one question for the entry, whichever row named it')
  assert.deepEqual(deleted(), [], 'nothing went before the answer')
  answerCard(await call({ id: TRIO.en }))
  const done = await call({ id: TRIO.en }, true)
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  assert.deepEqual(done.removed, { languages: 3, of: 3 })
  assert.equal(done.failed, undefined)
  assert.deepEqual(deleted(), [TRIO.en, TRIO.ru, TRIO.de], 'the id named first, then the others')
  assert.equal(site.names().filter((n) => n === 'content_translations').length, 1, 'one read of the rows')
})

test('a slug with no language keeps its own words: no hint for a model that named no id', async () => {
  const { call } = trioSite()
  const asked = await call({ id: 'hello-world' })
  assert.equal(asked.error, 'content_delete removes posts "hello-world" in all 3 languages.')
  assert.equal(asked.languages, 3)
})

test('forty languages, a ULID with no language — one refusal, one confirmed call, forty deletes', async () => {
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const rows = Array.from({ length: 40 }, (_, i) => ({
    id: `01${'W'.repeat(22)}${B32[Math.floor(i / 32)]}${B32[i % 32]}`,
    locale: String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26)),
    slug: 'four-common-mistakes',
    status: 'published'
  }))
  assert.ok(
    rows.every((r) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(r.id)),
    'the fixture ids are ULIDs'
  )
  const site = fakeSite({
    served: rows.map((r) => r.locale),
    on: {
      content_translations: () => answer({ translationGroup: rows[0].id, translations: rows }),
      content_delete: (args) => answer({ deleted: true, id: args.id })
    }
  })
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a')
  const state = createEmdashState()
  const call = (/** @type {boolean} */ confirm) =>
    runDoor(
      site,
      {
        tool: 'content_delete',
        arguments: { collection: 'posts', id: rows[0].id },
        ...(confirm ? { confirm: true } : {})
      },
      { memory, state, turn: memory.turnOf('session-a') }
    )
  const asked = await call(false)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.languages, 40)
  assert.match(asked.error, /in all 40 languages/)
  const [q] = asked.ask.questions
  memory.customerAnswered('session-a', asked.ask, { answers: [{ id: q.id, selected: [q.options[0].label] }] })
  const done = await call(true)
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  assert.deepEqual(done.removed, { languages: 40, of: 40 })
  const gone = site.calls
    .filter((c) => 'name' in c && c.name === 'content_delete')
    .map((c) => /** @type {any} */ (c).arguments.id)
  assert.equal(gone.length, 40)
  assert.equal(new Set(gone).size, 40)
})

// 🔒 09/10/2026 (bench hb, hbr3 EmDash delete by chat): the agent read the entry's 40 translations and sent 20
// content_delete calls in ONE step, one per row — 20 full refusals with the same question, 265k prompt tokens.
// The first call of the entry carries the full refusal; the rest are short, with the same question; nothing is
// deleted before the answer, and after it ONE confirmed call removes every language.
test('a burst of deletes of one entry in one step: one full refusal, the rest short with the same question, nothing deleted — then one call removes all forty', async () => {
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const rows = Array.from({ length: 40 }, (_, i) => ({
    id: `01${'V'.repeat(22)}${B32[Math.floor(i / 32)]}${B32[i % 32]}`,
    locale: String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26)),
    slug: 'four-common-mistakes',
    status: 'published'
  }))
  const site = fakeSite({
    served: rows.map((r) => r.locale),
    on: {
      content_translations: () => answer({ translationGroup: rows[0].id, translations: rows }),
      content_delete: (args) => answer({ deleted: true, id: args.id })
    }
  })
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a')
  const state = createEmdashState()
  const call = (/** @type {string} */ id, /** @type {boolean} */ confirm) =>
    runDoor(
      site,
      {
        tool: 'content_delete',
        arguments: { collection: 'posts', id },
        ...(confirm ? { confirm: true } : {})
      },
      { memory, state, turn: memory.turnOf('session-a') }
    )
  // The burst, as the model sends it: every row at once, confirm:true copied onto each (never the customer's word).
  const burst = await Promise.all(rows.slice(0, 20).map((r) => call(r.id, true)))
  assert.ok(
    burst.every((a) => a.code === 'CONFIRM_FIRST' && a.languages === 40),
    JSON.stringify(burst.map((a) => [a.code, a.languages, a.already, a.error])).slice(0, 900)
  )
  const full = burst.filter((a) => a.already !== true)
  const short = burst.filter((a) => a.already === true)
  assert.equal(full.length, 1, 'one full refusal')
  assert.equal(short.length, 19)
  assert.match(full[0].error, /in all 40 languages/)
  const qid = full[0].ask.questions[0].id
  for (const a of short) {
    assert.equal(a.ask.questions[0].id, qid, 'the same question')
    assert.equal(a.target, undefined, 'short: no target repeated')
  }
  assert.equal(
    site.calls.filter((c) => 'name' in c && c.name === 'content_delete').length,
    0,
    'nothing deleted'
  )
  // The customer answers the one question; ONE call removes the whole entry.
  const [q] = full[0].ask.questions
  memory.customerAnswered('session-a', full[0].ask, {
    answers: [{ id: q.id, selected: [q.options[0].label] }]
  })
  const done = await call(rows[3].id, true)
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  assert.deepEqual(done.removed, { languages: 40, of: 40 })
})

test('a language named beside the id is one row — the card says what stays, the answer says how many remain, and the call it names removes the rest after one question', async () => {
  const { call, deleted, answerCard } = trioSite()
  const asked = await call({ id: TRIO.ru, locale: 'ru' })
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(
    asked.error,
    "content_delete removes posts/hello-world@ru only; the entry's other 2 languages stay online."
  )
  assert.equal(asked.otherLanguages, 2)
  assert.equal(asked.languages, undefined, 'not the whole entry')
  assert.match(
    asked.ask.questions[0].question,
    /^This removes posts "Hello world \(ru\)" \(ru\) only; its other 2 languages stay online\. Go ahead\?$/
  )
  answerCard(asked)
  const one = await call({ id: TRIO.ru, locale: 'ru' }, true)
  assert.equal(one.ok, true, JSON.stringify(one).slice(0, 300))
  assert.deepEqual(one.removed, { languages: 1, of: 3 })
  assert.match(
    one.next,
    /^The entry is still online in 2 other languages: tell the customer\. If they want those removed too: content_delete \{collection, id:"[0-9A-Z]{26}"\} with no locale asks once and removes what is left\. Never remove them unasked\.$/
  )
  assert.deepEqual(deleted(), [TRIO.ru], 'never the others unasked')
  // The call the answer names: an id of a row still online, no language — one question, one call.
  const road = /** @type {string} */ (/id:"([0-9A-Z]{26})"/.exec(one.next)?.[1])
  assert.ok([TRIO.en, TRIO.de].includes(road), 'a row that is still online')
  const wide = await call({ id: road })
  assert.equal(wide.code, 'CONFIRM_FIRST')
  assert.equal(wide.languages, 2, 'what is left, not what the entry once held')
  assert.match(wide.error, /in all 2 languages/)
  answerCard(wide)
  const rest = await call({ id: road }, true)
  assert.deepEqual(rest.removed, { languages: 2, of: 2 })
  assert.deepEqual(deleted(), [TRIO.ru, road, road === TRIO.en ? TRIO.de : TRIO.en], 'no row twice')
})

test('the slug with its language is one row too, and says what stays', async () => {
  const { call } = trioSite()
  const asked = await call({ id: 'hello-world', locale: 'ru' })
  assert.equal(
    asked.error,
    "content_delete removes posts/hello-world@ru only; the entry's other 2 languages stay online."
  )
  assert.equal(asked.otherLanguages, 2)
  assert.equal(asked.languages, undefined)
})

test('the count of what is still online follows the rows this turn removed', async () => {
  const { call, deleted, answerCard } = trioSite()
  const one = async (/** @type {string} */ id, /** @type {string} */ locale) => {
    answerCard(await call({ id, locale }))
    return call({ id, locale }, true)
  }
  const first = await one(TRIO.ru, 'ru')
  assert.match(first.next, /still online in 2 other languages: tell the customer\./)
  // The second row's question already knows the first is gone: one other language stays.
  const asked = await call({ id: TRIO.de, locale: 'de' })
  assert.equal(asked.otherLanguages, 1)
  assert.equal(
    asked.error,
    "content_delete removes posts/hello-world@de only; the entry's other language stays online."
  )
  answerCard(asked)
  const second = await call({ id: TRIO.de, locale: 'de' }, true)
  assert.deepEqual(second.removed, { languages: 1, of: 2 })
  assert.match(
    second.next,
    new RegExp(
      `still online in 1 other language: tell the customer\\. If they want that one removed too: content_delete \\{collection, id:"${TRIO.en}"\\}`
    )
  )
  // The last row is the entry's only one online: no other language to speak of.
  answerCard(await call({ id: TRIO.en, locale: 'en' }))
  const last = await call({ id: TRIO.en, locale: 'en' }, true)
  assert.equal(last.ok, true)
  assert.equal(last.next, undefined)
  assert.deepEqual(deleted(), [TRIO.ru, TRIO.de, TRIO.en])
})

test('the customer who wanted one language declines the entry-wide question — nothing goes — and the id with its language asks about that row', async () => {
  const { call, deleted, answerCard } = trioSite()
  const wide = await call({ id: TRIO.ru })
  assert.equal(wide.languages, 3)
  answerCard(wide, 1)
  assert.equal((await call({ id: TRIO.ru }, true)).code, 'CONFIRM_FIRST', 'a No is a No')
  assert.deepEqual(deleted(), [])
  const row = await call({ id: TRIO.ru, locale: 'ru' })
  assert.equal(row.otherLanguages, 2)
  answerCard(row)
  assert.equal((await call({ id: TRIO.ru, locale: 'ru' }, true)).ok, true)
  assert.deepEqual(deleted(), [TRIO.ru], 'the one language the customer named')
})

test('a row that could not go after the entry was agreed is retried alone: the same answer carries it, never a second removal of the rest', async () => {
  const { call, deleted, site, answerCard } = trioSite({ refuse: [TRIO.de] })
  answerCard(await call({ id: TRIO.en }))
  const done = await call({ id: TRIO.en }, true)
  assert.deepEqual(done.removed, { languages: 2, of: 3 })
  assert.deepEqual(
    done.failed.map((/** @type {any} */ f) => [f.id, f.locale]),
    [[TRIO.de, 'de']]
  )
  site.calls.length = 0
  // The retry the answer names: that id, once more, on the answer already given. One row, no question.
  const retry = await call({ id: TRIO.de }, true)
  assert.equal(retry.code, 'TOOL_FAILED', 'still locked in this fake — refused by EmDash, not by a question')
  assert.deepEqual(deleted(), [TRIO.de], 'only that row was sent')
})

test('an entry with one language keeps the plain question: nothing about other languages', async () => {
  const site = fakeSite({
    on: {
      content_get: () =>
        answer({ item: { id: TRIO.en, slug: 'about-us', locale: 'en', data: { title: 'About us' } } }),
      content_translations: () =>
        answer({ translationGroup: TRIO.en, translations: [{ id: TRIO.en, locale: 'en' }] })
    }
  })
  const asked = await runDoor(site, {
    tool: 'content_delete',
    arguments: { collection: 'pages', id: TRIO.en }
  })
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.error, `content_delete removes pages/${TRIO.en}.`)
  assert.equal(asked.languages, undefined)
  assert.equal(asked.otherLanguages, undefined)
})

test('erasing for good stays a question about the row: the trash holds the rows', async () => {
  const { site, memory, state, call, answerCard } = trioSite()
  answerCard(await call({ id: TRIO.en }))
  assert.equal(
    (await call({ id: TRIO.en }, true)).ok,
    true,
    'the whole entry goes to the trash; the memo holds its rows'
  )
  const erase = await runDoor(
    site,
    { tool: 'content_permanent_delete', arguments: { collection: 'posts', id: TRIO.en } },
    { memory, state, turn: memory.turnOf('session-a') }
  )
  assert.equal(erase.code, 'CONFIRM_FIRST')
  assert.equal(erase.error, 'content_permanent_delete removes posts/hello-world@en.')
  assert.equal(erase.otherLanguages, undefined)
  assert.equal(erase.languages, undefined)
})

test('CONFIRM_FIRST for one language of several says what it removes, and the road to all of them', () => {
  const refusal = {
    ok: false,
    code: 'CONFIRM_FIRST',
    tool: 'content_delete',
    target: 'posts/hello-world@ru',
    otherLanguages: 2
  }
  const next = refusalNext(refusal) ?? ''
  assert.match(next, /ask_user_question/)
  assert.match(next, /removes this language only/)
  assert.match(next, /Without locale it asks about all/)
  assert.doesNotMatch(
    next,
    /\b(?:content|menu|media|schema|taxonomy|revision|settings|byline)_[a-z_]+/,
    'names no EmDash tool'
  )
  assert.ok(next.length <= 200, `${next.length} chars`)
  // The whole-entry sentence still wins where the refusal carries `languages`.
  assert.match(refusalNext({ ...refusal, languages: 3 }) ?? '', /one answer covers every language/)
})

// Through the shipped tool and the host's own listener — `withNext`, the fence and the customer-answer
// hook in the way — where a slip in the wiring would still leave the pieces above green.
test('through the shipped tool: a delete by the ULID of one row asks about the whole entry and removes every language on one yes', async () => {
  const ids = {
    en: '01M36TA83763RSVSN5R28DZ0E1',
    ru: '01M36TA83763RSVSN5R28DZ0E2',
    de: '01M36TA83763RSVSN5R28DZ0E3'
  }
  const rows = Object.entries(ids).map(([locale, id]) => ({ id, locale, slug: 'hello-world' }))
  const on = (/** @type {string} */ name, /** @type {any} */ args) =>
    name === 'content_translations'
      ? { translationGroup: ids.en, translations: rows }
      : name === 'content_delete'
        ? { deleted: true, id: args.id }
        : { ok: true }
  const host = emdashHost({ served: ['en', 'ru', 'de'], on })
  const del = { tool: 'content_delete', arguments: { collection: 'posts', id: ids.ru } }
  const asked = await host.run(del)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.languages, 3)
  assert.match(asked.error, /in all 3 languages\. One language only: add locale\.$/)
  assert.match(asked.next, /one answer covers every language/)
  assert.equal(
    host.calls.filter((c) => c.name === 'content_delete').length,
    0,
    'nothing went before the answer'
  )
  host.answerAsk(asked)
  const done = await host.run({ ...del, confirm: true })
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  assert.deepEqual(done.removed, { languages: 3, of: 3 })
  assert.deepEqual(
    host.calls.filter((c) => c.name === 'content_delete').map((c) => c.args.id),
    [ids.ru, ids.en, ids.de]
  )
})

test('through the shipped tool: one language named — the card says what stays and the answer says how many are online', async () => {
  const ids = {
    en: '01M36TA83763RSVSN5R28DZ0E1',
    ru: '01M36TA83763RSVSN5R28DZ0E2',
    de: '01M36TA83763RSVSN5R28DZ0E3'
  }
  const rows = Object.entries(ids).map(([locale, id]) => ({ id, locale, slug: 'hello-world' }))
  const host = emdashHost({
    served: ['en', 'ru', 'de'],
    on: (name, args) =>
      name === 'content_translations'
        ? { translationGroup: ids.en, translations: rows }
        : name === 'content_delete'
          ? { deleted: true, id: args.id }
          : { ok: true }
  })
  const one = { tool: 'content_delete', arguments: { collection: 'posts', id: ids.ru, locale: 'ru' } }
  const asked = await host.run(one)
  assert.equal(asked.otherLanguages, 2)
  assert.match(asked.next, /removes this language only\. Without locale it asks about all\./)
  host.answerAsk(asked)
  const gone = await host.run({ ...one, confirm: true })
  assert.equal(gone.ok, true)
  assert.deepEqual(gone.removed, { languages: 1, of: 3 })
  assert.match(gone.next, /still online in 2 other languages: tell the customer\./)
  assert.deepEqual(
    host.calls.filter((c) => c.name === 'content_delete').map((c) => c.args.id),
    [ids.ru],
    'the other two are online still: never removed unasked'
  )
})

// ── P3: the other language rows go three at a time ───────────────────────────────────────────────────

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** One macrotask: what a site answering later than now looks like to the door. */
const tick = () => new Promise((resolve) => setImmediate(resolve))
const ok = (/** @type {any} */ args) => answer({ deleted: true, id: args.id })

/**
 * An entry held in `n` languages, on a site whose `content_delete` is answered by `onDelete(args, attempt,
 * rows)` (`attempt` counts the asks for that row: 1, 2…). `agree()` asks about the whole entry and plays the
 * customer's yes; `call(args, true)` is then the one call that removes every row.
 * @param {number} n
 * @param {(args: any, attempt: number, rows: Array<{ id: string, locale: string }>) => any} onDelete
 */
function bigEntry(n, onDelete) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: `01${'W'.repeat(22)}${B32[Math.floor(i / 32)]}${B32[i % 32]}`,
    locale: String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26)),
    slug: 'sample-post',
    status: 'published'
  }))
  /** @type {Map<string, number>} */
  const attempts = new Map()
  const site = fakeSite({
    served: rows.map((r) => r.locale),
    on: {
      content_translations: () => answer({ translationGroup: rows[0].id, translations: rows }),
      content_delete: (/** @type {any} */ args) => {
        const attempt = (attempts.get(args.id) ?? 0) + 1
        attempts.set(args.id, attempt)
        return onDelete(args, attempt, rows)
      }
    }
  })
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a')
  const state = createEmdashState()
  const call = (/** @type {Record<string, unknown>} */ args, confirm = false) =>
    runDoor(
      site,
      {
        tool: 'content_delete',
        arguments: { collection: 'posts', ...args },
        ...(confirm ? { confirm: true } : {})
      },
      { memory, state, turn: memory.turnOf('session-a') }
    )
  const agree = async () => {
    const asked = await call({ id: rows[0].id })
    assert.equal(asked.code, 'CONFIRM_FIRST')
    assert.equal(asked.languages, n)
    const [q] = asked.ask.questions
    memory.customerAnswered('session-a', asked.ask, {
      answers: [{ id: q.id, selected: [q.options[0].label] }]
    })
  }
  const deleted = () =>
    site.calls
      .filter((c) => 'name' in c && c.name === 'content_delete')
      .map((c) => /** @type {any} */ (c).arguments.id)
  return { rows, site, call, agree, attempts, deleted }
}

test("P3: the other rows go three at a time — never more — and all forty go, started in the entry's order", async () => {
  let inFlight = 0
  let peak = 0
  const { rows, call, agree, deleted } = bigEntry(40, async (args) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await tick()
    inFlight -= 1
    return ok(args)
  })
  await agree()
  const done = await call({ id: rows[0].id }, true)
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  assert.deepEqual(done.removed, { languages: 40, of: 40 })
  assert.equal(done.failed, undefined)
  assert.equal(peak, 3, 'the pool is full, and never wider than three')
  assert.deepEqual(
    deleted(),
    rows.map((r) => r.id),
    "the id named first, then the others in the entry's order"
  )
  assert.ok(done.normalized.includes('every language of this entry went (40)'))
})

test("P3: the receipt is the sequential one whichever row finishes first: failed in the entry's order, gone exact", async () => {
  // Earlier rows answer later, so rows finish in reverse; rows 3 and 10 are refused for their own reason, once.
  const { rows, call, agree, attempts, deleted } = bigEntry(40, async (args, attempt, all) => {
    const at = all.findIndex((r) => r.id === args.id)
    for (let i = 0; i < 40 - at; i += 1) await tick()
    return attempt === 1 && (at === 3 || at === 10) ? failed('[ENTRY_LOCKED] Ana has it open') : ok(args)
  })
  await agree()
  const done = await call({ id: rows[0].id }, true)
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  assert.deepEqual(done.removed, { languages: 38, of: 40 })
  assert.deepEqual(
    done.failed.map((/** @type {any} */ f) => [f.id, f.locale, f.error]),
    [3, 10].map((i) => [rows[i].id, rows[i].locale, '[ENTRY_LOCKED] Ana has it open'])
  )
  assert.equal(
    done.next,
    "The customer's answer covers these too: the same content_delete with confirm:true and each id in failed, once more."
  )
  assert.ok(done.normalized.includes('38 of 40 languages went; see failed'))
  assert.equal(
    attempts.get(rows[3].id),
    1,
    'a refusal with its own reason is reported as it came, not asked again'
  )
  assert.equal(attempts.get(rows[10].id), 1)
  assert.equal(deleted().length, 40)

  // `gone` holds exactly the 38 that went: the retry of one failed row asks no question, and two rows were online.
  const one = await call({ id: rows[3].id }, true)
  assert.equal(one.ok, true, JSON.stringify(one).slice(0, 300))
  assert.deepEqual(one.removed, { languages: 1, of: 2 })
  assert.match(one.next, /still online in 1 other language: tell the customer\./)
  assert.deepEqual(deleted().slice(40), [rows[3].id], 'only that row was sent')
})

for (const [shape, first] of [
  ["EmDash's catch-all for a failed delete transaction", '[CONTENT_DELETE_ERROR] Failed to delete content'],
  ["SQLite's own words", 'SQLITE_BUSY: database is locked'],
  ["SQLite's table lock", 'Error: database table is locked']
])
  test(`P3: a row that failed because the database was busy (${shape}) is asked once more, alone, after the others — and goes`, async () => {
    /** @type {Array<[string, string, number, number]>} */
    const log = []
    let inFlight = 0
    const { rows, call, agree, attempts } = bigEntry(40, async (args, attempt) => {
      inFlight += 1
      log.push(['start', args.id, attempt, inFlight])
      await tick()
      inFlight -= 1
      log.push(['end', args.id, attempt, inFlight])
      return attempt === 1 && args.id === rows[7].id ? failed(first) : ok(args)
    })
    await agree()
    const done = await call({ id: rows[0].id }, true)
    assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
    assert.deepEqual(done.removed, { languages: 40, of: 40 })
    assert.equal(done.failed, undefined)
    assert.equal(done.next, undefined)
    assert.equal(attempts.get(rows[7].id), 2)
    assert.ok(
      [...attempts.entries()].every(([id, n]) => id === rows[7].id || n === 1),
      'no other row was asked twice'
    )
    const retry = log.findIndex(([kind, , attempt]) => kind === 'start' && attempt === 2)
    assert.equal(log[retry][3], 1, 'the retry ran alone')
    assert.equal(
      log.slice(0, retry).filter(([kind]) => kind === 'end').length,
      40,
      'after every first ask had been answered, the named row included'
    )
  })

test('P3: a row still busy on its second try is reported failed with the answer it last got, and is not asked a third time', async () => {
  const { rows, call, agree, attempts } = bigEntry(40, (args, attempt) =>
    args.id !== rows[7].id
      ? ok(args)
      : failed(
          attempt === 1
            ? '[CONTENT_DELETE_ERROR] Failed to delete content'
            : 'SQLITE_BUSY: database is locked'
        )
  )
  await agree()
  const done = await call({ id: rows[0].id }, true)
  assert.deepEqual(done.removed, { languages: 39, of: 40 })
  assert.deepEqual(
    done.failed.map((/** @type {any} */ f) => [f.id, f.locale, f.error]),
    [[rows[7].id, rows[7].locale, 'SQLITE_BUSY: database is locked']]
  )
  assert.equal(attempts.get(rows[7].id), 2)
})

test('P3: several busy rows are all asked once more while the database lets them through', async () => {
  const busy = [5, 6, 7]
  const { rows, call, agree, attempts } = bigEntry(40, (args, attempt, all) =>
    attempt === 1 && busy.includes(all.findIndex((r) => r.id === args.id))
      ? failed('[CONTENT_DELETE_ERROR] Failed to delete content')
      : ok(args)
  )
  await agree()
  const done = await call({ id: rows[0].id }, true)
  assert.deepEqual(done.removed, { languages: 40, of: 40 })
  assert.equal(done.failed, undefined)
  assert.deepEqual(
    busy.map((i) => attempts.get(rows[i].id)),
    [2, 2, 2]
  )
})

test("P3: once a retry meets a busy database again the rest are not asked again — each would wait out SQLite's 5 s — and are reported as they came", async () => {
  const busy = [5, 6, 7]
  const { rows, call, agree, attempts } = bigEntry(40, (args, attempt, all) => {
    const at = all.findIndex((r) => r.id === args.id)
    return busy.includes(at)
      ? failed(`[CONTENT_DELETE_ERROR] Failed to delete content (try ${attempt})`)
      : ok(args)
  })
  await agree()
  const done = await call({ id: rows[0].id }, true)
  assert.deepEqual(done.removed, { languages: 37, of: 40 })
  assert.deepEqual(
    done.failed.map((/** @type {any} */ f) => [f.id, f.error]),
    [
      [rows[5].id, '[CONTENT_DELETE_ERROR] Failed to delete content (try 2)'],
      [rows[6].id, '[CONTENT_DELETE_ERROR] Failed to delete content (try 1)'],
      [rows[7].id, '[CONTENT_DELETE_ERROR] Failed to delete content (try 1)']
    ],
    "in the entry's order, each with the last answer it got"
  )
  assert.deepEqual(
    busy.map((i) => attempts.get(rows[i].id)),
    [2, 1, 1],
    'the first retry found the database still taken, so the other two were not asked again'
  )
})

// A row the site did not answer as EmDash — the exec timed out, a 5xx, a body that was not JSON-RPC — says
// nothing about the database, and a dead site asked again only doubles the wait. Such a row is reported as it
// came, whatever its text carries: a 5xx page can quote SQLite's own words, and it is still not EmDash's answer.
for (const [shape, first] of /** @type {Array<[string, Record<string, unknown>]>} */ ([
  [
    'the exec timed out',
    { ok: false, code: 'SITE_UNREACHABLE', error: 'the site could not be reached (timed out)' }
  ],
  [
    'an HTTP 503',
    {
      ok: false,
      code: 'SITE_REFUSED',
      httpStatus: 503,
      error: 'the site (EmDash MCP) → HTTP 503: unavailable'
    }
  ],
  ['a body that was not JSON-RPC', { ok: false, code: 'NOT_MCP', error: 'the answer was not JSON-RPC' }],
  [
    'an HTTP 500 that quotes SQLite',
    {
      ok: false,
      code: 'SITE_REFUSED',
      httpStatus: 500,
      error: 'the site (EmDash MCP) → HTTP 500: SQLITE_BUSY: database is locked'
    }
  ],
  [
    'an exec that timed out with SQLite words in its last line',
    { ok: false, code: 'SITE_UNREACHABLE', error: 'the site could not be reached (database table is locked)' }
  ]
]))
  test(`P3: a row the site did not answer as EmDash (${shape}) is reported as it came, not asked again`, async () => {
    const { rows, call, agree, attempts } = bigEntry(40, (args) =>
      args.id === rows[7].id ? first : ok(args)
    )
    await agree()
    const done = await call({ id: rows[0].id }, true)
    assert.deepEqual(done.removed, { languages: 39, of: 40 })
    assert.deepEqual(
      done.failed.map((/** @type {any} */ f) => [f.id, f.locale, f.error]),
      [[rows[7].id, rows[7].locale, String(first.error)]]
    )
    assert.equal(attempts.get(rows[7].id), 1, 'asked once')
    assert.ok(
      [...attempts.entries()].every(([, n]) => n === 1),
      'no row was asked twice'
    )
  })

test('P3: a row whose first answer was lost but which did go answers NOT_FOUND on the retry, and counts as removed', async () => {
  const { rows, call, agree } = bigEntry(40, (args, attempt) =>
    args.id === rows[7].id && attempt === 1
      ? failed('[CONTENT_DELETE_ERROR] Failed to delete content')
      : args.id === rows[7].id
        ? failed(`[NOT_FOUND] Content item not found: ${args.id}`)
        : ok(args)
  )
  await agree()
  const done = await call({ id: rows[0].id }, true)
  assert.deepEqual(done.removed, { languages: 40, of: 40 })
  assert.equal(done.failed, undefined)
})

test('P3: one other row and a pair both work: the walk is as wide as the rows it has', async () => {
  let inFlight = 0
  let peak = 0
  const { rows, call, agree, deleted } = bigEntry(2, async (args) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await tick()
    inFlight -= 1
    return ok(args)
  })
  await agree()
  const done = await call({ id: rows[0].id }, true)
  assert.deepEqual(done.removed, { languages: 2, of: 2 })
  assert.equal(peak, 1)
  assert.deepEqual(deleted(), [rows[0].id, rows[1].id])

  const four = bigEntry(4, async (args) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await tick()
    inFlight -= 1
    return ok(args)
  })
  peak = 0
  await four.agree()
  assert.deepEqual((await four.call({ id: four.rows[0].id }, true)).removed, { languages: 4, of: 4 })
  assert.equal(peak, 3, 'three other rows, three at once')
})

test('P3: a call that throws stops the walk: what is in flight finishes, nothing new starts, and the error comes out', async () => {
  const { rows, call, agree, deleted } = bigEntry(40, async (args, _attempt, all) => {
    await tick()
    if (args.id === all[5].id) throw new Error('site went away')
    return ok(args)
  })
  await agree()
  await assert.rejects(call({ id: rows[0].id }, true), /site went away/)
  assert.ok(deleted().length < 12, `${deleted().length} deletes started, not forty`)
})

// Through the shipped tool: the pool and the retry sit behind the fence, `withNext` and the customer-answer
// listener, where a slip in the bundle would leave the pieces above green.
test('through the shipped tool: a forty-language delete whose database was busy for two rows removes every language', async () => {
  const B = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const ids = Array.from(
    { length: 40 },
    (_, i) => `01M36TA83763RSVSN5R28D${B[Math.floor(i / 32)]}${B[i % 32]}E1`
  )
  assert.ok(
    ids.every((id) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)),
    'the fixture ids are ULIDs'
  )
  const rows = ids.map((id, i) => ({ id, locale: `l${String(i).padStart(2, '0')}`, slug: 'hello-world' }))
  /** @type {Map<string, number>} */
  const asks = new Map()
  const host = emdashHost({
    served: rows.map((r) => r.locale),
    on: (name, args) => {
      if (name === 'content_translations') return { translationGroup: ids[0], translations: rows }
      if (name !== 'content_delete') return { ok: true }
      const n = (asks.get(args.id) ?? 0) + 1
      asks.set(args.id, n)
      return n === 1 && (args.id === ids[5] || args.id === ids[17])
        ? { isError: true, text: '[CONTENT_DELETE_ERROR] Failed to delete content' }
        : { deleted: true, id: args.id }
    }
  })
  const del = { tool: 'content_delete', arguments: { collection: 'posts', id: ids[0] } }
  const asked = await host.run(del)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.languages, 40)
  host.answerAsk(asked)
  const done = await host.run({ ...del, confirm: true })
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  assert.deepEqual(done.removed, { languages: 40, of: 40 })
  assert.equal(done.failed, undefined)
  const sent = host.calls.filter((c) => c.name === 'content_delete').map((c) => c.args.id)
  assert.equal(sent.length, 42, 'forty rows, and the two busy ones once more')
  assert.deepEqual([...new Set(sent)], ids, "each row reached the site, in the entry's order")
  assert.equal(asks.get(ids[5]), 2)
  assert.equal(asks.get(ids[17]), 2)
})

// 🔒 09/10/2026 (bench hb, hbr3 EmDash pick delete, FAILED): the customer typed "just do what I asked" instead of
// choosing; the answer opened nothing (rightly) and the refusal that followed said exactly what it said before,
// so the agent unpublished the post by another road. A typed answer stays a No; the next refusal says why and
// asks once more. A chosen first option still opens it, a typed "no" is a plain No.
test("a typed answer to the door's question opens nothing, and the next refusal says the customer must choose", async () => {
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a')
  const state = createEmdashState()
  const site = fakeSite({
    served: ['en', 'ru', 'de'],
    on: {
      content_translations: () =>
        answer({
          translationGroup: TRIO.en,
          translations: [
            { id: TRIO.en, locale: 'en', slug: 'hello-world', status: 'published' },
            { id: TRIO.ru, locale: 'ru', slug: 'hello-world', status: 'published' },
            { id: TRIO.de, locale: 'de', slug: 'hello-world', status: 'published' }
          ]
        }),
      content_delete: (args) => answer({ deleted: true, id: args.id })
    }
  })
  const del = (/** @type {boolean} */ confirm) =>
    runDoor(
      site,
      {
        tool: 'content_delete',
        arguments: { collection: 'posts', id: TRIO.en },
        ...(confirm ? { confirm: true } : {})
      },
      { memory, state, turn: memory.turnOf('session-a') }
    )
  const asked = await del(false)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.typed, undefined)
  const [q] = asked.ask.questions
  memory.customerAnswered('session-a', asked.ask, {
    answers: [{ id: q.id, selected: [], custom: 'Cứ làm đúng yêu cầu ban đầu.' }]
  })
  const again = await del(true)
  assert.equal(again.code, 'CONFIRM_FIRST', 'typed words opened nothing')
  assert.equal(again.typed, true)
  const next = refusalNext(again, { platform: 'emdash' }) ?? ''
  assert.match(
    next,
    /^The customer typed words instead of choosing, which opens nothing: ask_user_question with this ask once more \(id as given\)/
  )
  assert.ok(next.length <= 200)
  assert.equal(site.calls.filter((c) => 'name' in c && c.name === 'content_delete').length, 0)
  // Chosen this time: the one call removes the entry.
  memory.customerAnswered('session-a', again.ask, { answers: [{ id: q.id, selected: [q.options[0].label] }] })
  const done = await del(true)
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  // A typed "no" is a plain No, never the "typed instead" hint.
  for (const [custom, typed] of /** @type {[string, boolean][]} */ ([
    ['No, keep it', false],
    ['Không, giữ lại', false],
    ['Yes please, go on', true]
  ])) {
    const m = createCallMemory({ now: () => 1 })
    m.newTurn('s')
    const key = 'tracy_emdash content_delete {"collection":"posts","id":"X"}'
    m.confirmAsked('s', key)
    const card = {
      questions: [
        { id: confirmQuestionId(key), options: [{ label: 'Yes, go ahead' }, { label: 'No, keep it' }] }
      ]
    }
    m.customerAnswered('s', card, { answers: [{ id: confirmQuestionId(key), selected: [], custom }] })
    assert.equal(m.answeredByTyping('s', key), typed, custom)
    assert.equal(m.confirmed('s', key), false, `${custom}: typed words never open a delete`)
  }
})
