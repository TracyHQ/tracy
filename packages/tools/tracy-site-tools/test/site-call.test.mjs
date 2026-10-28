/**
 * `runSiteCall`: one relayed `tracy_site` call end to end, on a fake relay, clock and sleep. Refusal
 * codes, ids and counts are asserted; the sentences the agent reads are pinned only by invariants.
 * Calls made to reach a state are Arrange; each test has one Act (or one table of independent cases).
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { confirmQuestion, createCallMemory, sameCallRefused } from '../src/host/call-memory.mjs'
import { WALK_FIELDS } from '../src/host/delete-group.mjs'
import { LEGACY_BOUND_MESSAGE, LEGACY_STRUCTURE_CODE } from '../src/host/legacy-refusal.mjs'
import { planCall, RELAY_ACTIONS, withNext } from '../src/host/site.mjs'
import {
  answerLost,
  asksRemoval,
  BUSY_WAITS_MS,
  blockMarkupProblem,
  budgetFor,
  CONTENT_READ_LIST_CHARS,
  cutContentList,
  derivedReplaceNext,
  doorTakesLease,
  emptyListNext,
  lostAnswerRoad,
  outcomeUnknownAnswer,
  READ_ACTIONS,
  READ_BUDGET_LIST,
  READ_BUDGET_ONE,
  runSiteCall,
  withReadBudget,
  withReceipt,
  WRITE_RECEIPT_NEXT
} from '../src/host/site-call.mjs'
import { withSweepRead } from '../src/host/site-call.mjs'
import { ACTION_CLASSES } from '../src/host/site-context.mjs'
import { stoppedAnswer } from '../src/host/turn-stop.mjs'

/** A table row's name in a test title: its JSON, cut, whatever the row holds. */
const rowName = (row) => {
  try {
    return String(JSON.stringify(row)).slice(0, 80)
  } catch {
    return String(row).slice(0, 80)
  }
}

/** @param {string} name */
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const HOME = fixture('contract/home.json').answer
const LOCK = { ok: false, error: 'writer_busy', message: 'another writer is changing this site' }

/**
 * A relay that answers from a script and records every call — except the host's own translation-group
 * read before a delete (`delete-group.mjs`), answered here as a site that cannot say, so these tests count
 * what the call itself sends. The group delete's own tests (`delete-group.test.mjs`) script that read.
 * @param {(action: string, params: Record<string, any>, n: number) => unknown} answer
 */
function relay(answer) {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    if (action === 'content.read' && params.fields === WALK_FIELDS)
      return { ok: false, code: 'NOT_FOUND', error: 'not scripted' }
    // The read a delete or a hide makes to name its record on the question (council 20/10/2026): a
    // script that does not answer it reads as a record titled "Record title", outside `sent`.
    const titleRead = action === 'content.get' && Object.keys(params).sort().join(',') === 'id,kind'
    if (titleRead) {
      const scripted = await answer(action, params, sent.length + 1)
      if (scripted?.ok === false || (scripted?.ok === true && scripted.item)) {
        sent.push([action, structuredClone(params)])
        return scripted
      }
      return { ok: true, item: { id: params.id, title: 'Record title' } }
    }
    sent.push([action, structuredClone(params)])
    return answer(action, params, sent.length)
  }
  return { sent, send }
}

/** @param {Record<string, any>} over */
const joomla = (over = {}) => ({
  memory: createCallMemory({ now: () => 1_000 }),
  sessionId: 'session-a',
  label: 'j-1ibzqi',
  actorKey: 'ana@example.com',
  facts: { platform: 'joomla', sealed: true },
  sleep: async () => {},
  ...over
})
/** @param {Record<string, any>} over */
const wordpress = (over = {}) => ({
  memory: createCallMemory({ now: () => 1_000 }),
  sessionId: 'session-w',
  label: 'wp-dmlj6g',
  actorKey: 'ana@example.com',
  facts: { platform: 'wordpress', sealed: true },
  sleep: async () => {},
  ...over
})
/** A WordPress conversation that does not read bodies back after a write. */
const wpQuiet = (/** @type {any} */ send, /** @type {Record<string, any>} */ over = {}) =>
  wordpress({ send, facts: { platform: 'wordpress', verifyBodyWrites: false }, ...over })
/** An open Joomla conversation (no sealed-contract refusals). */
const openJ = (/** @type {any} */ send, /** @type {Record<string, any>} */ over = {}) =>
  joomla({ send, facts: { platform: 'joomla', sealed: false }, ...over })

/** @param {unknown} args */
const plan = (args) => {
  const p = planCall(args)
  assert.ok(p.ok, JSON.stringify(p))
  return p
}
/** One call from a plan-shaped `{action, params}`. @param {Record<string, any>} ctx @param {unknown} args */
const call = async (ctx, args) => /** @type {any} */ (await runSiteCall({ ...ctx, plan: plan(args) }))
/** The keys of `expect` in `out` equal `expect` (a subset compare that names the failing case). */
const assertHas = (
  /** @type {any} */ out,
  /** @type {Record<string, unknown>} */ expect,
  /** @type {string} */ label = ''
) => assert.deepEqual(Object.fromEntries(Object.keys(expect).map((k) => [k, out[k]])), expect, label)
/** @param {Array<[string, Record<string, any>]>} sent @param {string} action */
const count = (sent, action) => sent.filter(([a]) => a === action).length
/** @param {Array<[string, Record<string, any>]>} sent */
const inspects = (sent) => sent.filter(([, p]) => p.operation === 'inspect').length
/** @param {Array<[string, Record<string, any>]>} sent */
const applies = (sent) => sent.filter(([, p]) => p.operation === 'apply').map(([, p]) => p)

/**
 * A destructive call is refused CONFIRM_FIRST until the customer answers its question; this arms the
 * conversation and returns the plan that will now go through. Nothing is sent by the refused call.
 * @param {Record<string, any>} ctx @param {{ action: string, params: Record<string, unknown> }} p
 */
const armed = async (ctx, p) => {
  // Arming only: the read that names the record on the question answers a title here, whatever the
  // test scripts for the site afterwards (busy, lost, refused).
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) =>
    action === 'content.get' && Object.keys(params).sort().join(',') === 'id,kind'
      ? { ok: true, item: { id: params.id, title: 'Record title' } }
      : ctx.send(action, params)
  const refused = await call({ ...ctx, send }, p)
  assert.equal(
    refused.code,
    'CONFIRM_FIRST',
    `${p.action} is destructive: refused until the customer answers`
  )
  const [q] = refused.ask.questions
  ctx.memory.customerAnswered(ctx.sessionId, refused.ask, {
    answers: [{ id: q.id, selected: [q.options[0].label] }]
  })
  return plan({ ...p, params: { ...p.params, confirm: true } })
}
/** @param {string} text */
const typedBy = (text) => [
  { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } }
]
/** @param {string} [code] */
const lost = (code = 'COMPONENT_UNREACHABLE') => ({
  ok: false,
  code,
  error: 'the site did not answer'
})

const INSPECT_HOME = {
  action: 'content.contract',
  params: { operation: 'inspect', page: 'home', slots: 'text' }
}
const applyContract = (/** @type {Record<string, any>} */ over = {}) => ({
  action: 'content.contract',
  params: {
    operation: 'apply',
    expected_revision: HOME.revision,
    changes: { 'module-428.1': 'Hotline: 1900 1234' },
    ...over
  }
})

test('READ_ACTIONS is the read class of the site context’s ACTION_CLASS, on the relay', () => {
  const reads = Object.entries(ACTION_CLASSES)
    .filter(([action, cls]) => cls === 'read' && RELAY_ACTIONS.includes(action))
    .map(([action]) => action)
    .sort()
  assert.deepEqual([...READ_ACTIONS].sort(), reads)
})

// ── inspect snapshot ─────────────────────────────────────────────────────────────────────────────────

test('inspect: filters are not relayed — the door is asked for the whole inspect', async () => {
  const { sent, send } = relay(() => HOME)

  const first = await call(joomla({ send }), INSPECT_HOME)

  assert.equal(first.slots.length, 144) // the fixture's 164 slots less the 404 page's 20 words slots
  assert.deepEqual(sent, [['content.contract', { operation: 'inspect' }]])
})

{
  const followUps = [
    {
      label: 'an entity filter',
      params: { operation: 'inspect', entity: 'module-441' },
      prefix: 'module-441.'
    },
    {
      label: 'an offset page',
      params: { operation: 'inspect', page: 'home', offset: 40 },
      prefix: ''
    }
  ]
  for (const { label, params, prefix } of followUps)
    test(`inspect: a second inspect in the same turn is served from the snapshot, not the door: ${label}`, async () => {
      const { sent, send } = relay(() => HOME)
      const ctx = joomla({ send })
      await call(ctx, INSPECT_HOME)

      const second = await call(ctx, { action: 'content.contract', params })

      assert.equal(sent.length, 1, label)
      assert.ok(
        second.slots.every((/** @type {any} */ s) => s.key.startsWith(prefix)),
        label
      )
      assert.match(
        second.normalized.join(' '),
        /answered from this turn's inspect \(revision 530cd9278d1e\)/,
        label
      )
    })
}

{
  const misses = [
    {
      label: 'another person',
      first: {},
      second: { actorKey: 'bo@example.com' },
      between: async () => {}
    },
    {
      label: 'a write in between',
      first: {},
      second: {},
      between: async (/** @type {any} */ ctx) =>
        void (await call(ctx, applyContract({ changes: { 'module-441.1': 'Hi' } })))
    },
    {
      label: 'a new customer message',
      first: {},
      second: {},
      between: async (/** @type {any} */ ctx) => ctx.memory.newTurn('session-a')
    },
    {
      label: 'a build that wrote the site',
      first: {},
      second: {},
      between: async (/** @type {any} */ ctx) => ctx.memory.invalidateSite('j-1ibzqi')
    },
    {
      label: 'a call with no conversation',
      first: { sessionId: null },
      second: { sessionId: null },
      between: async () => {}
    },
    {
      label: 'an apply refused "Content changed"',
      first: {},
      second: {},
      between: async (/** @type {any} */ ctx) =>
        void (await call(ctx, applyContract({ expected_revision: 'old' }))),
      applyAnswer: {
        ok: false,
        error: 'contract_failed',
        message: 'Content changed; inspect again'
      }
    }
  ]
  for (const { label, first, second, between, applyAnswer = { ok: true, applied: true } } of misses)
    test(`inspect: the snapshot is never another person’s, another turn’s, older than a write, a refused apply or a build: ${label}`, async () => {
      const { sent, send } = relay((_a, params) => (params.operation === 'inspect' ? HOME : applyAnswer))
      const ctx = joomla({ send })
      await call({ ...ctx, ...first }, INSPECT_HOME)
      await between(ctx)

      await call({ ...ctx, ...second }, INSPECT_HOME)

      assert.equal(inspects(sent), 2, label)
    })
}

test('inspect: an answer that lands after a concurrent write is not remembered', async () => {
  const memory = createCallMemory()
  const { sent, send } = relay(() => {
    memory.invalidateSite('j-1ibzqi') // a build or another conversation wrote while the inspect was out
    return HOME
  })
  const ctx = joomla({ send, memory })
  await call(ctx, INSPECT_HOME)

  await call(ctx, INSPECT_HOME)

  assert.equal(sent.length, 2)
})

// ── lock-miss retry and re-sent ids ──────────────────────────────────────────────────────────────────

test('retry: a lock miss is retried at 3/6/10 s ± 20 % with the same ids, within 19 s, then given up', async () => {
  const waits = /** @type {number[]} */ ([])
  const { sent, send } = relay(() => LOCK)
  let jitter = 0

  const answer = await call(
    {
      ...joomla({ send }),
      sleep: async (/** @type {number} */ ms) => void waits.push(ms),
      random: () => [1, 1, 1][jitter++] ?? 0.5 // +20 % on every wait: the cap must hold
    },
    applyContract({ expected_revision: 'r1', changes: { 'module-441.1': 'Hi' } })
  )

  assert.equal(sent.length, 4)
  assert.equal(
    new Set(sent.map(([, p]) => `${p.apply_id} ${p.request_id}`)).size,
    1,
    'the same ids each time'
  )
  assert.deepEqual(waits, [3_600, 7_200, 8_200], '+20 % each, the last cut so the total stays 19 s')
  assert.equal(answer.retried, 3)
  assert.match(answer.next, /nothing from this call was written/)
})

test('retry: a lock miss then an answer is one more send, waited once within ± 20 %', async () => {
  const waits = /** @type {number[]} */ ([])
  const { sent, send } = relay((_a, _p, n) => (n === 1 ? LOCK : { ok: true, kind: 'article', id: 5 }))

  const answer = await call(
    {
      ...openJ(send),
      sleep: async (/** @type {number} */ ms) => void waits.push(ms),
      random: () => 0
    },
    {
      action: 'content.update',
      params: { kind: 'article', id: 5, fields: { title: 'x' }, apply_id: 'a1' }
    }
  )

  assert.equal(answer.ok, true)
  assert.equal(sent.length, 2)
  assert.deepEqual(waits, [BUSY_WAITS_MS[0] * 0.8])
})

{
  const deadlock = {
    ok: false,
    error: 'writer_busy',
    message: 'Deadlock found when trying to get lock'
  }
  const cases = [
    {
      label: 'another writer_busy message: not a lock miss',
      args: INSPECT_HOME,
      answer: deadlock,
      took: 0,
      destructive: false,
      next: /may have been written/
    },
    {
      label: 'content.delete',
      args: { action: 'content.delete', params: { kind: 'article', id: 5, apply_id: 'a1' } },
      answer: LOCK,
      took: 0,
      destructive: true,
      next: /^/
    },
    {
      label: 'a first send that took 149 s',
      args: INSPECT_HOME,
      answer: LOCK,
      took: 149_000,
      destructive: false,
      next: /^/
    }
  ]
  for (const { label, args, answer, took, destructive, next } of cases)
    test(`retry: a busy answer is not retried when it is another writer_busy message, a destructive action, or the first send used up 150 s: ${label}`, async () => {
      let clock = 0
      const { sent, send } = relay(() => {
        clock += took
        return answer
      })
      const ctx = { ...openJ(send), now: () => clock }
      const toSend = destructive ? await armed(ctx, args) : plan(args)

      const out = /** @type {any} */ (await runSiteCall({ ...ctx, plan: toSend }))

      assert.equal(sent.length, 1, label)
      assert.match(out.next ?? '', next, label)
    })
}

test('apply: an apply the site already holds under that id is re-sent once under a new id, and the answer names it', async () => {
  const { sent, send } = relay((_a, _p, n) =>
    n === 1
      ? {
          ok: false,
          error: 'contract_failed',
          message: 'Use one new apply_id per content revision'
        }
      : { ok: true, applied: 2 }
  )

  const answer = await call(joomla({ send }), applyContract({ expected_revision: 'r1' }))

  assert.equal(sent.length, 2)
  assert.notEqual(sent[0][1].apply_id, sent[1][1].apply_id)
  assert.equal(sent[0][1].request_id, sent[1][1].request_id)
  assert.equal(answer.applyId, sent[1][1].apply_id)
})

test('apply.list with no id reads the newest receipt of this conversation', async () => {
  const { sent, send } = relay(() => ({ ok: true, steps: [] }))
  const ctx = joomla({ send })
  ctx.memory.rememberWrite('session-a', 'j-1ibzqi', { applyId: 'hero-copy', ok: true })

  await call(ctx, { action: 'apply.list', params: {} })

  assert.deepEqual(sent, [['apply.list', { apply_id: 'hero-copy' }]])
})

// ── body guard: a whole-body write may not truncate a page ───────────────────────────────────────────

const R2_WRITES = fixture('body-shrink/r2-writes.json')

/** One recorded r2 write, sent from a conversation that read `readBefore`. @param {Record<string, any>} w */
async function r2Write(w) {
  const { sent, send } = relay((action) =>
    action === 'content.get' ? { ok: false, error: 'not_found' } : { ok: true, kind: w.kind, id: w.id ?? 0 }
  )
  const ctx = wordpress({
    send,
    facts: { platform: 'wordpress', sealed: true, verifyBodyWrites: false }
  })
  if (w.readBefore) ctx.memory.rememberRead('session-w', w.readBefore)
  const fields =
    w.kind === 'post'
      ? { post_content: 'x'.repeat(w.sentChars) }
      : { content: 'x'.repeat(w.sentChars), title: 'T' }
  const answer = await call(ctx, {
    action: 'content.update',
    params: {
      kind: w.kind,
      ...(w.id ? { id: w.id } : {}),
      ...(w.key ? { key: w.key } : {}),
      fields
    }
  })
  return { answer, sent }
}

test('body guard: every recorded r2 truncating write is refused with nothing sent, every other one passes', async () => {
  const cuts = R2_WRITES.filter((/** @type {any} */ w) => w.expect === 'BODY_SHRINK')
  const passes = R2_WRITES.filter((/** @type {any} */ w) => w.expect === 'pass')
  assert.ok(cuts.length > 0 && passes.length > 0)
  for (const w of cuts) {
    const { answer, sent } = await r2Write(w)

    assert.equal(answer.code, 'BODY_SHRINK', w.src)
    assert.equal(sent.length, 0, `${w.src}: nothing is sent`)
    assert.ok(answer.error.length <= 160, w.src)
  }
  for (const w of passes) {
    const { answer } = await r2Write(w)

    assert.equal(answer.ok, true, `${w.src}: ${JSON.stringify(answer).slice(0, 200)}`)
  }
})

{
  const refusals = [
    {
      label: 'read at 26,847, sent 4,155',
      id: 42,
      chars: 4_155,
      read: true,
      error: [/4,155/, /26,847/, /post 42/],
      next: [/blocks:/, /never padded/]
    },
    {
      label: 'never read',
      id: 39,
      chars: 8,
      read: false,
      error: [],
      next: [/content\.get \{kind:"post", id:39\}/]
    }
  ]
  for (const { label, id, chars, read, error, next } of refusals)
    test(`body guard: a length refusal says what was read and sent; a write with no read is sent to the read: ${label}`, async () => {
      const { sent, send } = relay(() => ({ ok: true }))
      const ctx = wpQuiet(send)
      ctx.memory.rememberRead('session-w', { kind: 'post', id: 42, title: 'Home', chars: 26_847 })

      const answer = await call(ctx, {
        action: 'content.update',
        params: { kind: 'post', id, fields: { post_content: 'x'.repeat(chars) } }
      })

      assert.equal(answer.code, 'BODY_SHRINK', label)
      assert.equal(answer.read, read, label)
      for (const re of error) assert.match(answer.error, re, label)
      for (const re of next) assert.match(answer.next, re, label)
      assert.ok(answer.next.length <= 200, label)
      assert.equal(sent.length, 0, label)
    })
}

/**
 * A WordPress body write of `length` chars over post 42 (26,884 chars read), with `removes` and the
 * customer's latest message.
 * @param {string | undefined} removes @param {string} said @param {number} length
 */
async function homeWrite(removes, said, length = 4_155) {
  const { sent, send } = relay(() => ({ ok: true, kind: 'post', id: 42 }))
  const ctx = wpQuiet(send, { events: typedBy(said) })
  ctx.memory.rememberRead('session-w', { kind: 'post', id: 42, title: 'Home', chars: 26_884 })
  const params = { kind: 'post', id: 42, fields: { post_content: 'x'.repeat(length) } }
  const answer = await call(ctx, {
    action: 'content.update',
    params: removes === undefined ? params : { ...params, removes }
  })
  return { answer, sent }
}

{
  const removal = 'Remove the testimonials section and change the hero headline to Build with us'
  const vi = 'Xóa phần cảm nhận khách hàng trên trang chủ'
  const cases = [
    {
      label: 'quotes the request',
      removes: 'delete the testimonials section',
      said: 'Please DELETE the  testimonials section from the home page.',
      length: 9_000,
      ok: true
    },
    {
      label: 'quotes the whole removal',
      removes: 'Remove the testimonials section',
      said: removal,
      length: 20_000,
      ok: true
    },
    {
      label: 'Vietnamese quote with the verb',
      removes: 'xóa phần cảm nhận',
      said: vi,
      length: 20_000,
      ok: true
    },
    {
      label: 'words the customer never wrote',
      removes: 'delete everything else',
      said: 'Please delete the testimonials section.',
      length: 9_000,
      ok: false
    },
    {
      label: 'fewer than 3 words',
      removes: 'testimonials',
      said: 'Please delete the testimonials section.',
      length: 9_000,
      ok: false
    },
    {
      label: 'a two-word quote that has the verb',
      removes: 'delete banner',
      said: 'Please delete banner now',
      length: 9_000,
      ok: false
    },
    {
      label: 'the non-removal half of the request',
      removes: 'change the hero headline',
      said: removal,
      length: 9_000,
      ok: false
    },
    {
      label: 'Vietnamese quote without the verb',
      removes: 'phần cảm nhận khách',
      said: vi,
      length: 20_000,
      ok: false
    },
    {
      label: 'a request that removes nothing',
      removes: 'Change the hero headline',
      said: 'Change the hero headline to Build with us',
      length: 4_155,
      ok: false
    }
  ]
  for (const { label, removes, said, length, ok } of cases)
    test(`body guard: \`removes\` opens it only when it quotes the customer’s latest message, verb included, 3+ words: ${label}`, async () => {
      const { answer, sent } = await homeWrite(removes, said, length)

      assert.deepEqual(
        { ok: answer.ok, code: answer.code },
        { ok, code: ok ? undefined : 'BODY_SHRINK' },
        label
      )
      assert.ok(
        sent.every(([, p]) => p.removes === undefined),
        `${label}: removes is Tracy’s own, never relayed`
      )
    })
}

{
  const asked = 'Remove the testimonials section and change the hero headline to Build with us'
  const cases = [
    {
      label: 'no removes given',
      removes: undefined,
      said: 'Change the hero headline to Build with us',
      next: [/blocks:\{"<i>":"<markup>"\}/, /never padded/],
      forbidden: [/removes/]
    },
    {
      label: 'customer asked a removal, model quoted the wrong half',
      removes: 'change the hero headline',
      said: asked,
      next: [/drop its blocks/, /\{"<i>":null\}/, /never padded/],
      forbidden: []
    }
  ]
  for (const { label, removes, said, next, forbidden } of cases)
    test(`body guard: the refusal next hands out padding never, and names the drop-by-blocks road only for a real removal: ${label}`, async () => {
      const { answer } = await homeWrite(removes, said)

      assert.equal(answer.code, 'BODY_SHRINK', label)
      for (const re of next) assert.match(answer.next, re, label)
      for (const re of forbidden) assert.doesNotMatch(answer.next, re, label)
      assert.ok(answer.next.length <= 200, label)
    })
}

{
  const said = [
    ['please remove the banner', true],
    ['Delete the second paragraph', true],
    ['drop the pricing table', true],
    ['hide the footer links', true],
    ['take out the old address', true],
    ['get rid of the popup', true],
    ['Xóa dòng này', true],
    ['xoá ảnh cũ', true],
    ['Bỏ phần giá', true],
    ['gỡ banner', true],
    ['Ẩn phần dự án đi', true],
    ['Giấu phần giá đi', true],
    ['gỡ bỏ banner', true],
    ['Change the hero headline', false],
    ['hidden gems', false],
    ['removal of doubt', false],
    ['bố cục mới', false],
    ['phần ẩnh', false],
    ['', false]
  ]
  for (const [text, expected] of said)
    test(`asksRemoval: the verb decides, in English and Vietnamese: ${rowName(text)}`, () => {
      assert.equal(asksRemoval(text), expected, text)
    })
}

/**
 * Bench C47 (25/09): the Top bar menu (`wp_navigation` post 69, 721 chars read) written back without
 * its Careers link, in one conversation that keeps its memory across calls. 500 chars is under 80 %.
 */
function c47() {
  const said = 'Xoá trang "Careers" khỏi site và bỏ nó khỏi menu.'
  const { sent, send } = relay(() => ({ ok: true, kind: 'post', id: 69 }))
  const ctx = wpQuiet(send, { events: typedBy(said) })
  ctx.memory.rememberRead('session-w', { kind: 'post', id: 69, title: 'Top bar', chars: 721 })
  ctx.memory.rememberRead('session-w', { kind: 'post', id: 70, title: 'Footer', chars: 721 })
  /** @param {string | undefined} removes @param {number} [length] @param {number} [id] */
  const write = async (removes, length = 500, id = 69) => {
    const params = {
      kind: 'post',
      id,
      fields: { post_content: `<p>${'x'.repeat(length - 7)}</p>` }
    }
    return call(ctx, {
      action: 'content.update',
      params: removes === undefined ? params : { ...params, removes }
    })
  }
  return { sent, ctx, write }
}

test('body guard: the second length refusal on one record in a turn sends the model to the customer', async () => {
  const { write } = c47()
  await write(undefined)

  const second = await write('Careers', 480)

  assert.equal(second.code, 'BODY_SHRINK')
  assert.match(second.next, /Refused twice on this record/)
  assert.match(second.next, /customer/)
  assert.ok(second.next.length <= 200)
})

{
  const restarts = [
    {
      label: 'another record',
      arrange: async (/** @type {any} */ w) => void (await w.write(undefined)),
      act: (/** @type {any} */ w) => w.write(undefined, 500, 70)
    },
    {
      label: 'a new customer message',
      arrange: async (/** @type {any} */ w) => {
        await w.write(undefined)
        await w.write('Careers', 480)
        w.ctx.memory.newTurn('session-w')
      },
      act: (/** @type {any} */ w) => w.write(undefined, 460)
    },
    {
      label: 'a refusal that asked for a read first',
      arrange: async (/** @type {any} */ w) => void (await w.write(undefined, 500, 71)),
      act: (/** @type {any} */ w) => w.write(undefined, 499, 71)
    }
  ]
  for (const { label, arrange, act } of restarts)
    test(`body guard: the refusal count is per record and per customer message, and a read-first refusal is not counted: ${label}`, async () => {
      const site = c47() // post 71 was never read
      await arrange(site)

      const answer = await act(site)

      assert.equal(answer.code, 'BODY_SHRINK', label)
      assert.doesNotMatch(answer.next, /Refused twice/, label)
    })
}
{
  const badBody = (/** @type {string} */ platform, /** @type {unknown} */ post_content) => ({
    label: `${platform} ${JSON.stringify(post_content)}`,
    platform,
    params: { kind: 'post', id: 42, fields: { post_content } },
    code: 'NO_WRITABLE_FIELD',
    next: /post_content as one string/
  })
  const badId = (/** @type {unknown} */ id) => ({
    label: `id ${JSON.stringify(id)} (PHP would cast "42abc" to 42)`,
    platform: 'wordpress',
    params: { kind: 'post', id, fields: { post_content: 'x' } },
    code: 'ADDRESS_MISSING',
    next: /id is a whole number/
  })
  const cases = [
    ...['wordpress', 'unknown'].flatMap((platform) => [
      badBody(platform, ['<p>x</p>']),
      badBody(platform, 7),
      badBody(platform, { rendered: '<p>x</p>' })
    ]),
    badId('42abc'),
    badId(42.5),
    badId(true)
  ]
  for (const { label, platform, params, code, next } of cases)
    test(`body guard: a malformed id or a body that is not one string is refused before the relay, with nothing sent: ${label}`, async () => {
      const { sent, send } = relay(() => ({ ok: true, kind: 'post', id: 42 }))
      const ctx = wordpress({ send, facts: { platform, verifyBodyWrites: false } })
      ctx.memory.rememberRead('session-w', { kind: 'post', id: 42, chars: 26_884 })

      const answer = await call(ctx, { action: 'content.update', params })

      assert.equal(answer.code, code, label)
      assert.match(answer.next, next, label)
      assert.equal(sent.length, 0, label)
    })
}

{
  const cases = [
    { label: 'short raw body', raw: '<p>x</p>', ok: false, sends: 0 },
    { label: 'whole raw body', raw: 'x'.repeat(26_900), ok: true, sends: 1 }
  ]
  for (const { label, raw, ok, sends } of cases)
    test(`body guard: a REST \`content:{raw}\` body is unwrapped, then measured: ${label}`, async () => {
      const { sent, send } = relay(() => ({ ok: true, kind: 'post', id: 42 }))
      const ctx = wpQuiet(send)
      ctx.memory.rememberRead('session-w', { kind: 'post', id: 42, chars: 26_884 })

      const answer = await call(ctx, {
        action: 'content.update',
        params: { kind: 'post', id: 42, fields: { content: { raw } } }
      })

      assert.deepEqual(
        { ok: answer.ok, code: answer.code },
        { ok, code: ok ? undefined : 'BODY_SHRINK' },
        label
      )
      assert.equal(sent.length, sends, label)
      assert.ok(
        sent.every(([, p]) => typeof p.fields.post_content === 'string'),
        label
      )
    })
}

{
  const held = { ok: true, item: { ID: 42, post_title: 'Home', post_content: 'x'.repeat(26_884) } }
  const cases = [
    {
      label: 'unknown platform, never read',
      platform: 'unknown',
      answer: held,
      read: false,
      chars: 1,
      guarded: true,
      sends: []
    },
    {
      label: 'unknown platform, read, then cut',
      platform: 'unknown',
      answer: held,
      read: true,
      chars: 4_155,
      guarded: true,
      sends: ['content.get']
    },
    {
      label: 'a site known to be Joomla',
      platform: 'joomla',
      answer: { ok: false, error: 'bad_params', message: 'kind must be one of: article' },
      read: false,
      chars: 1,
      guarded: false,
      sends: []
    }
  ]
  for (const { label, platform, answer: door, read, chars, guarded, sends } of cases)
    test(`body guard: a site whose platform could not be read still guards a WordPress-shaped write; a site known to be Joomla does not: ${label}`, async () => {
      const { sent, send } = relay((action) =>
        action === 'content.get' ? door : action === 'content.update' ? door : { ok: true }
      )
      const ctx = wordpress({ send, facts: { platform, verifyBodyWrites: false } })
      if (read) await call(ctx, { action: 'content.get', params: { kind: 'post', id: 42 } })

      const answer = await call(ctx, {
        action: 'content.update',
        params: { kind: 'post', id: 42, fields: { post_content: 'x'.repeat(chars) } }
      })

      assert.equal(answer.code === 'BODY_SHRINK', guarded, label)
      assert.deepEqual(
        sent.map(([a]) => a),
        sends,
        label
      )
    })
}

test('body guard: with no conversation a whole-body write is refused with a stop, not a read loop', async () => {
  const { sent, send } = relay((action) =>
    action === 'content.get'
      ? {
          ok: true,
          kind: 'post',
          id: 42,
          item: { ID: 42, post_title: 'Home', post_content: 'x'.repeat(26_884) }
        }
      : { ok: true, kind: 'post', id: 42 }
  )
  const ctx = wpQuiet(send, { sessionId: null })
  await call(ctx, { action: 'content.get', params: { kind: 'post', id: 42 } }) // remembered for nobody

  const write = await call(ctx, {
    action: 'content.update',
    params: { kind: 'post', id: 42, fields: { post_content: 'x'.repeat(26_000) } }
  })

  assert.equal(write.code, 'BODY_SHRINK')
  assert.equal(write.conversation, false)
  assert.doesNotMatch(write.next, /^content\.get/, 'a read would not be remembered: no loop')
  assert.equal(count(sent, 'content.update'), 0)
})

/** A component holding one post whose writes and revert are kept: `stored.value` is its body. */
function keptPost(/** @type {number} */ heldChars = 26_884) {
  const stored = { value: 'x'.repeat(heldChars) }
  const { sent, send } = relay((action, params) => {
    if (action === 'content.get')
      return { ok: true, item: { ID: 42, post_title: 'Home', post_content: stored.value } }
    if (action === 'apply.revert') {
      stored.value = 'x'.repeat(heldChars)
      return { ok: true, reverted: true }
    }
    stored.value = String(params.fields.post_content)
    return { ok: true, kind: 'post', id: 42, created: false }
  })
  return { stored, sent, send }
}
const bodyWrite = (/** @type {number} */ n, /** @type {Record<string, unknown>} */ extra = {}) => ({
  action: 'content.update',
  params: { kind: 'post', id: 42, fields: { post_content: 'x'.repeat(n) }, ...extra }
})
const getPost42 = { action: 'content.get', params: { kind: 'post', id: 42 } }

{
  const REMOVE = 'Remove the testimonials section'
  const cases = [
    {
      label: 'same turn: 80 % of 26,884 accepted, then judged against 26,884 not the 21,600 now stored',
      steps: [getPost42, bodyWrite(21_600), getPost42],
      final: bodyWrite(17_300),
      expect: { code: 'BODY_SHRINK', chars_stored: 26_884 }
    },
    {
      label: 'next turn starts from what the site holds: 80 % of 21,600',
      steps: [getPost42, bodyWrite(21_600), getPost42, 'newTurn'],
      final: bodyWrite(17_300),
      expect: { ok: true }
    },
    {
      label: 'an accepted removal is the new baseline at once',
      said: `${REMOVE} from the home page`,
      steps: [getPost42, bodyWrite(15_000, { removes: REMOVE })],
      final: bodyWrite(13_000), // 87 % of 15,000, 48 % of 26,884
      expect: { ok: true }
    },
    {
      label: 'after an undo the remembered length is forgotten: read again, never "holds 60,000"',
      steps: [
        getPost42,
        bodyWrite(60_000, { apply_id: 'wp-1' }),
        { action: 'apply.revert', params: { apply_id: 'wp-1' } },
        'newTurn'
      ],
      final: bodyWrite(27_000),
      expect: { code: 'BODY_SHRINK', read: false },
      forbidden: /60,000/
    }
  ]
  for (const {
    label,
    said = '',
    steps,
    final,
    expect,
    forbidden = /never-in-any-error-text-0xC0FFEE/
  } of cases)
    test(`body guard: the baseline is what the site held at the start of the turn — never ratcheted down within a turn, reset by an undo, moved at once by a removal: ${label}`, async () => {
      const { send } = keptPost()
      const ctx = wordpress({
        send,
        events: typedBy(said),
        facts: { platform: 'wordpress', verifyBodyWrites: true }
      })
      ctx.memory.newTurn('session-w')
      for (const step of steps) {
        if (step === 'newTurn') ctx.memory.newTurn('session-w')
        else await call(ctx, step)
      }

      const out = await call(ctx, final)

      assertHas(out, expect, label)
      assert.doesNotMatch(out.error ?? '', forbidden, label)
    })
}

test('body guard: a post this conversation created may be rewritten shorter', async () => {
  const stored = { value: '' }
  const { send } = relay((action, params) => {
    if (action === 'content.get')
      return { ok: true, item: { id: 2057, post_title: 'Autumn', post_content: stored.value } }
    stored.value = String(params.fields?.post_content ?? stored.value)
    return { ok: true, kind: 'post', id: 2057, created: !('id' in params) }
  })
  const ctx = wordpress({ send, facts: { platform: 'wordpress' } })
  const para = (/** @type {string} */ c, /** @type {number} */ n) =>
    `<!-- wp:paragraph --><p>${c.repeat(n)}</p><!-- /wp:paragraph -->`
  await call(ctx, {
    action: 'content.update',
    params: { kind: 'post', fields: { post_title: 'Autumn', post_content: para('x', 1_440) } }
  })

  const second = await call(ctx, {
    action: 'content.update',
    params: { kind: 'post', id: 2057, fields: { post_content: para('y', 980) } }
  })

  assert.equal(second.ok, true)
})

// ── D6′ on Joomla (09/10/2026): the same judgement for article and module bodies ─────────────────────

{
  /** A fake open Joomla component holding article 5 (long) and module 5 (short). */
  const joomlaRows = () => {
    const rows = {
      article: {
        id: '5',
        title: 'About',
        introtext: `<p>${'Words of the about page. '.repeat(80)}</p>`,
        fulltext: ''
      },
      module: { id: '5', title: 'Footer', content: '<p>© 2024 Acme Works Ltd. All rights reserved.</p>' }
    }
    const { send, sent } = relay((action, params) => {
      const row = rows[/** @type {'article' | 'module'} */ (params.kind)]
      if (action === 'content.get') return { ok: true, kind: params.kind, id: 5, item: structuredClone(row) }
      Object.assign(row, params.fields)
      return { ok: true, kind: params.kind, id: 5, created: false }
    })
    return { rows, send, sent }
  }
  const open = (/** @type {Record<string, any>} */ over) =>
    joomla({ facts: { platform: 'joomla', sealed: false }, ...over })

  test('Joomla body guard: a read of article 5 is not a read of module 5 — each record and field by its own name', async () => {
    const { send, sent } = joomlaRows()
    const ctx = open({ send })
    await call(ctx, { action: 'content.get', params: { kind: 'article', id: 5 } })

    const out = await call(ctx, {
      action: 'content.update',
      params: { kind: 'module', id: 5, fields: { content: '<p>© Acme</p>' }, apply_id: 'a-1' }
    })

    assert.equal(out.code, 'BODY_SHRINK')
    assert.equal(out.read, false)
    assert.equal(sent.filter(([a]) => a === 'content.update').length, 0)
  })

  test('Joomla body guard: a short module text read first is written shorter as sent (under SHRINK_JUDGED_FROM)', async () => {
    const { send, rows } = joomlaRows()
    const ctx = open({ send })
    await call(ctx, { action: 'content.get', params: { kind: 'module', id: 5 } })

    const out = await call(ctx, {
      action: 'content.update',
      params: { kind: 'module', id: 5, fields: { content: '<p>© Acme</p>' }, apply_id: 'a-1' }
    })

    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
    assert.equal(rows.module.content, '<p>© Acme</p>')
  })

  test('Joomla body guard: a create has no body to cut, and the agent may rewrite its own article shorter', async () => {
    const { send } = relay((action, params) =>
      action === 'content.get'
        ? { ok: true, kind: 'article', id: 3001, item: { id: '3001', title: 'New', introtext: 'x' } }
        : { ok: true, kind: 'article', id: 3001, created: !params.id }
    )
    const ctx = open({ send })
    const made = await call(ctx, {
      action: 'content.update',
      params: { kind: 'article', fields: { title: 'New', introtext: 'y'.repeat(2_000) }, apply_id: 'a-1' }
    })
    assert.equal(made.ok, true, JSON.stringify(made).slice(0, 300))

    const again = await call(ctx, {
      action: 'content.update',
      params: { kind: 'article', id: 3001, fields: { introtext: 'y'.repeat(900) }, apply_id: 'a-2' }
    })

    assert.equal(again.ok, true, JSON.stringify(again).slice(0, 300))
  })
}

// ── in-tool check: the body is read back once ────────────────────────────────────────────────────────

{
  const held = (/** @type {number} */ n) => ({
    ok: true,
    kind: 'post',
    id: 42,
    item: { ID: 42, post_title: 'Home', post_content: 'x'.repeat(n) }
  })
  const cases = [
    {
      label: 'stored whole',
      read: 26_847,
      sent: 26_000,
      stored: held(26_000),
      expect: { verified: { chars_before: 26_847, chars_sent: 26_000, chars_stored: 26_000 } },
      next: /./
    },
    {
      label: 'the component stripped markup',
      read: 26_000,
      sent: 26_000,
      stored: held(20_000),
      expect: { verified: false },
      next: /content\.get \{kind:"post", id:42\}/
    },
    {
      label: 'the read-back failed',
      read: 100,
      sent: 100,
      stored: { ok: false, error: 'read_failed' },
      expect: { verified: false },
      next: /content\.get \{kind:"post", id:42\}/
    }
  ]
  for (const { label, read, sent: chars, stored, expect, next } of cases)
    test(`verify: a whole body is read back once — the answer reports what the site holds, and is not verified when it holds less: ${label}`, async () => {
      const { sent, send } = relay((action) =>
        action === 'content.get' ? stored : { ok: true, kind: 'post', id: 42, key: null, created: false }
      )
      const ctx = wordpress({ send })
      ctx.memory.rememberRead('session-w', { kind: 'post', id: 42, chars: read })

      const answer = await call(ctx, bodyWrite(chars))

      assertHas(answer, expect, label)
      assert.deepEqual(
        sent.map(([a]) => a),
        ['content.update', 'content.get'],
        label
      )
      assert.match(answer.next, next, label)
    })
}

// ── BLOCK_MARKUP: a body whose block comments WordPress cannot read ──────────────────────────────────

const C45 = fixture('body-shrink/r3-c45-nav.json')

/**
 * The C45 conversation up to its write: the Header menu read as a `content.list` row with its body
 * (828 chars), on a door whose post 68 then holds `stored.value`.
 * @param {{ value: string }} stored
 */
async function headerRead(stored) {
  const { sent, send } = relay((action) =>
    action === 'content.list'
      ? {
          ok: true,
          items: [
            {
              id: 68,
              title: 'Header',
              slug: 'header',
              type: 'wp_navigation',
              status: 'publish',
              content: C45.read.body
            }
          ]
        }
      : action === 'content.get'
        ? {
            ok: true,
            kind: 'post',
            id: 68,
            item: { ID: 68, post_title: 'Header', post_content: stored.value }
          }
        : { ok: true, kind: 'post', id: 68, key: null, created: false }
  )
  const ctx = wordpress({ send })
  await call(ctx, {
    action: 'content.list',
    params: { post_type: 'wp_navigation', include_body: true }
  })
  sent.length = 0
  const write = (/** @type {string} */ body) =>
    call(ctx, {
      action: 'content.update',
      params: { kind: 'post', id: 68, fields: { post_content: body } }
    })
  return { sent, write }
}

test('BLOCK_MARKUP: a menu whose `/-->` were retyped `/>` is refused with the offset, nothing sent', async () => {
  const { sent, write } = await headerRead({ value: C45.sent.body })

  const answer = await write(C45.sent.body) // 820 of 828 chars: no length rule could see it

  assert.deepEqual([answer.ok, answer.code, answer.at, answer.id], [false, 'BLOCK_MARKUP', 0, 68])
  assert.match(answer.found, /^<!-- wp:navigation-link \{"label":"Home"/)
  assert.ok(answer.error.length <= 160)
  assert.match(answer.next, /closes with "-->"/)
  assert.deepEqual(sent, [])
})

{
  const mangled = `${C45.before.body.replaceAll('/-->', '/>')}xxxxxxxxxxxx`
  const cases = [
    {
      label: 'stored as sent',
      stored: C45.before.body,
      expect: { verified: { chars_before: 828, chars_sent: 832, chars_stored: 832 } }
    },
    { label: 'mangled by the site', stored: mangled, expect: { ok: true, verified: false } }
  ]
  for (const { label, stored, expect } of cases)
    test(`BLOCK_MARKUP: a menu with its delimiters kept is sent once, read back and verified; one the site mangled is not verified though its length is whole: ${label}`, async () => {
      const { sent, write } = await headerRead({ value: stored })

      const answer = await write(C45.before.body)

      assertHas(answer, expect, label)
      assert.deepEqual(
        sent.map(([a]) => a),
        ['content.update', 'content.get'],
        label
      )
    })
}

test('blockMarkupProblem: where the first unreadable block comment is, or null — and no delimiter the site accepted is refused', () => {
  const corpus = fixture('body-shrink/block-delimiters.json') // every delimiter of the recorded, accepted WordPress writes
  assert.ok(corpus.delimiters.length > 300)
  const rows = [
    ['attributes cut off mid-string', '<!-- wp:navigation-link {"label":"Home} /-->', 0],
    ['attributes that are an array', '<!-- wp:group [1,2] -->x<!-- /wp:group -->', 0],
    ['a closer cut off at the end', '<p>a</p><!-- wp:paragraph --><p>b</p><!-- /wp:paragraph', 37],
    ['a well-formed pair', '<!-- wp:paragraph --><p>b</p><!-- /wp:paragraph -->x', null],
    ['an empty body', '', null],
    ['a body with no block comments', 'x'.repeat(26_000), null],
    [
      'plain HTML with ordinary comments',
      '<p>Plain <strong>HTML</strong></p><!-- a comment --><!--more-->',
      null
    ],
    ['the recorded delimiters joined', corpus.delimiters.join('\n<p>words</p>\n'), null],
    ['the Header menu as read', C45.read.body, null],
    ...corpus.delimiters.map((/** @type {string} */ d) => [d.slice(0, 120), d, null])
  ]
  for (const [label, body, at] of rows)
    assert.equal(blockMarkupProblem(String(body))?.at ?? null, at, String(label))
})

{
  const broken = '<!-- wp:navigation-link {"label":"Home} /-->'
  const cases = [
    {
      label: 'template part',
      params: { kind: 'templatePart', key: 'header', fields: { content: `<p>x</p>${broken}` } },
      key: 'header',
      at: 8
    },
    {
      label: 'create',
      params: { kind: 'post', fields: { post_title: 'New', post_content: C45.sent.body } },
      key: undefined,
      at: 0
    }
  ]
  for (const { label, params, key, at } of cases)
    test(`BLOCK_MARKUP: a template part and a create are guarded too, and the part keeps its key: ${label}`, async () => {
      const { sent, send } = relay(() => ({ ok: true }))
      const ctx = wordpress({ send })
      ctx.memory.rememberRead('session-w', { kind: 'templatePart', key: 'header', chars: 60 })

      const answer = await call(ctx, { action: 'content.update', params })

      assert.deepEqual(
        [answer.code, answer.key, answer.at, answer.id],
        ['BLOCK_MARKUP', key, at, undefined],
        label
      )
      assert.deepEqual(sent, [], label)
    })
}

// ── template parts ───────────────────────────────────────────────────────────────────────────────────

/**
 * A WordPress door whose template parts are not stored (content.get answers not_found), a theme list
 * naming the active theme, and a webroot holding `files` (path → text). A folder in `folders` exists;
 * any other path cannot be told (undefined).
 * @param {{ active?: string, files?: Record<string, string>, folders?: string[] }} site
 */
function themeSite({ active = 'tracy', files = {}, folders = [`wp-content/themes/${active}`] }) {
  const { sent, send } = relay((action, params) =>
    action === 'content.get'
      ? { ok: false, error: 'not_found', message: `no templatePart at id 0, key "${params.key}"` }
      : action === 'theme.list'
        ? {
            ok: true,
            themes: [
              { stylesheet: 'twentytwentyfive', active: false },
              { stylesheet: active, active: true }
            ]
          }
        : { ok: true, kind: 'templatePart', id: 99, key: params.key, created: true }
  )
  const readWebrootFile = async (/** @type {string} */ file) => {
    if (file in files) return files[file]
    return folders.some((folder) => file.startsWith(`${folder}/`)) ? null : undefined
  }
  return {
    sent,
    send,
    readWebrootFile,
    ctx: wordpress({
      send,
      readWebrootFile,
      facts: { platform: 'wordpress', sealed: false, verifyBodyWrites: false }
    })
  }
}
const partWrite = (/** @type {string} */ key, /** @type {string} */ content) => ({
  action: 'content.update',
  params: { kind: 'templatePart', key, fields: { content, title: key } }
})
const partRead = (/** @type {string} */ key) => ({
  action: 'content.get',
  params: { kind: 'templatePart', key }
})
const HEADER_FILE = 'wp-content/themes/tracy/parts/header.html'

const CHILD = {
  active: 'tracy-child',
  folders: ['wp-content/themes/tracy-child', 'wp-content/themes/tracy'],
  files: {
    'wp-content/themes/tracy-child/style.css': '/*\nTheme Name: Tracy child\nTemplate: tracy\n*/',
    'wp-content/themes/tracy/parts/footer.html': 'f'.repeat(3_000)
  }
}

{
  const cases = [
    {
      label: 'the active theme’s file',
      site: { files: { [HEADER_FILE]: 'h'.repeat(7_848) } },
      part: 'header',
      expect: { theme_file: `.webroot/${HEADER_FILE}`, chars: 7_848 },
      next: /^Not stored: visitors see \.webroot\//
    },
    {
      label: 'a child theme without the part serves its parent’s',
      site: CHILD,
      part: 'footer',
      expect: { theme_file: '.webroot/wp-content/themes/tracy/parts/footer.html', chars: 3_000 },
      next: /^Not stored/
    },
    {
      label: 'no theme file has it',
      site: {},
      part: 'footer',
      expect: { theme_file: undefined },
      next: /No "footer" part here, stored or in the theme/
    }
  ]
  for (const { label, site, part, expect, next } of cases)
    test(`template part: a part the site stores no copy of reads as its theme file — path and length, never its text: ${label}`, async () => {
      const { ctx } = themeSite(site)

      const read = await call(ctx, partRead(part))

      assertHas(read, expect, label)
      assert.match(read.next, next, label)
      assert.ok(!JSON.stringify(read).includes('hhhh'), `${label}: the file’s text never goes to the model`)
    })
}

{
  const header = { files: { [HEADER_FILE]: 'h'.repeat(7_848) } }
  const cases = [
    {
      label: 'header cut to 14 chars',
      site: header,
      part: 'header',
      content: '<p>Call us</p>',
      expect: { code: 'BODY_SHRINK' },
      error: /14 chars.*theme file.*7,848/,
      next: /\.webroot\/wp-content\/themes\/tracy\/parts\/header\.html/,
      writes: 0
    },
    {
      label: 'header markup with the words changed',
      site: header,
      part: 'header',
      content: 'H'.repeat(7_850),
      expect: { ok: true },
      error: /^/,
      next: /^/,
      writes: 1
    },
    {
      label: 'child theme footer cut to 500',
      site: CHILD,
      part: 'footer',
      content: 'x'.repeat(500),
      expect: { code: 'BODY_SHRINK' },
      error: /3,000/,
      next: /./,
      writes: 0
    },
    {
      label: 'theme that cannot be read',
      site: { folders: [] },
      part: 'header',
      content: 'x'.repeat(9_000),
      expect: { code: 'BODY_SHRINK' },
      error: /./,
      next: /cannot be changed safely here/,
      writes: 0
    },
    {
      label: 'a slug no theme file has',
      site: {},
      part: 'footer',
      content: '<p>x</p>',
      expect: { ok: true },
      error: /^/,
      next: /^/,
      writes: 1
    }
  ]
  for (const { label, site, part, content, expect, error, next, writes } of cases)
    test(`template part: a write is judged against the theme file visitors see — a cut is refused, the whole markup passes, a part no theme has is a create: ${label}`, async () => {
      const { sent, ctx } = themeSite(site)
      await call(ctx, partRead(part))

      const out = await call(ctx, partWrite(part, content))

      assertHas(out, expect, label)
      assert.match(out.error ?? '', error, label)
      assert.match(out.next ?? '', next, label)
      assert.equal(count(sent, 'content.update'), writes, label)
    })
}

test('template part: a part read at 7,848 chars is not overwritten with 19', async () => {
  const { sent, ctx } = themeSite({})
  ctx.memory.rememberRead('session-w', {
    kind: 'templatePart',
    id: 80,
    key: 'header',
    chars: 7_848
  })

  const cut = await call(ctx, partWrite('header', 'x'.repeat(19)))

  assert.equal(cut.code, 'BODY_SHRINK')
  assert.match(cut.error, /19 chars.*header part.*7,848/)
  assert.equal(count(sent, 'content.update'), 0)
})

/** Header (post 80, 7,848 chars) and footer (post 81, 3,000) both readable by slug; post 5 is small. */
function slugSite() {
  const { sent, send } = relay((action, params) =>
    action === 'content.get' && params.key === 'header'
      ? { ok: true, key: 'header', item: { id: 80, title: 'Header', content: 'H'.repeat(7_848) } }
      : action === 'content.get' && params.key === 'footer'
        ? { ok: true, key: 'footer', item: { id: 81, title: 'Footer', content: 'F'.repeat(3_000) } }
        : action === 'content.get' && params.id === 5
          ? { ok: true, item: { ID: 5, post_title: 'Tiny', post_content: 'p'.repeat(100) } }
          : { ok: true, kind: 'templatePart', id: 80, key: params.key, created: false }
  )
  return { sent, ctx: wpQuiet(send) }
}
const headerWithId = (/** @type {number} */ id, /** @type {number} */ n) => ({
  action: 'content.update',
  params: {
    kind: 'templatePart',
    key: 'header',
    id,
    fields: { content: 'x'.repeat(n), title: 'Header' }
  }
})

{
  const cases = [
    {
      label: 'the footer’s id beside the header slug',
      reads: [partRead('header'), partRead('footer')],
      args: headerWithId(81, 2_500),
      expect: { code: 'BODY_SHRINK', chars_stored: 7_848 }
    },
    {
      label: 'a small post’s id beside a header never read',
      reads: [{ action: 'content.get', params: { kind: 'post', id: 5 } }],
      args: headerWithId(5, 90),
      expect: { code: 'BODY_SHRINK', read: false }
    }
  ]
  for (const { label, reads, args, expect } of cases)
    test(`template part: looked up by its slug alone — another record’s id beside it never decides: ${label}`, async () => {
      const { sent, ctx } = slugSite()
      for (const step of reads) await call(ctx, step)

      const out = await call(ctx, args)

      assertHas(out, expect, label)
      assert.equal(count(sent, 'content.update'), 0, label)
    })
}

test('template part: the id never reaches the component — a part is written by its key', async () => {
  const { sent, send } = relay(() => ({
    ok: true,
    kind: 'templatePart',
    id: 80,
    key: 'header',
    created: false
  }))
  const ctx = wpQuiet(send)
  ctx.memory.rememberRead('session-w', {
    kind: 'templatePart',
    id: 80,
    key: 'header',
    chars: 7_848
  })

  const written = await call(ctx, headerWithId(81, 7_900))

  assert.equal(written.ok, true)
  assert.equal(sent[0][1].id, undefined)
  assert.match(written.normalized.join(' '), /templatePart id 81 dropped/)
})

{
  const row80 = {
    ok: true,
    id: 80,
    item: {
      ID: 80,
      post_type: 'wp_template_part',
      post_name: 'header',
      post_title: 'Header',
      post_content: 'H'.repeat(7_848)
    }
  }
  const byRow = (/** @type {number} */ n) => ({
    action: 'content.update',
    params: { kind: 'templatePart', id: 80, fields: { content: 'H'.repeat(n) } }
  })
  const asHeader = [{ key: 'header', id: undefined, title: 'Header' }]
  const cases = [
    {
      label: 'read as a post, written whole',
      readFirst: true,
      n: 7_848,
      expect: { ok: true },
      written: asHeader
    },
    {
      label: 'read as a post, cut to 19',
      readFirst: true,
      n: 19,
      expect: { code: 'BODY_SHRINK', read: true, chars_stored: 7_848 },
      written: []
    },
    {
      label: 'never read: fails closed after one read that names the part',
      readFirst: false,
      n: 7_848,
      expect: { code: 'BODY_SHRINK', read: false, key: 'header' },
      written: []
    }
  ]
  for (const { label, readFirst, n, expect, written } of cases)
    test(`template part: written by its row number, the write goes under the slug the read named and is judged against that read: ${label}`, async () => {
      const { sent, send } = relay((action) =>
        action === 'content.get'
          ? row80
          : { ok: true, kind: 'templatePart', id: 80, key: 'header', created: false }
      )
      const ctx = wpQuiet(send)
      if (readFirst) await call(ctx, { action: 'content.get', params: { kind: 'post', id: 80 } })
      sent.length = 0

      const out = await call(ctx, byRow(n))

      assertHas(out, expect, label)
      assert.deepEqual(
        sent
          .filter(([a]) => a === 'content.update')
          .map(([, p]) => ({ key: p.key, id: p.id, title: p.fields.title })),
        written,
        label
      )
    })
}

// ── listings, budgets, refusals before the relay ─────────────────────────────────────────────────────

test('list: rows are cut by field, not record — r2’s 21-row list keeps every row within 4,000 chars', async () => {
  const { answer: listed, args } = fixture('wp-list-21.json')
  const { send } = relay(() => listed)

  const answer = await call(wordpress({ send }), args)

  assert.equal(answer.items.length, 21)
  assert.ok(JSON.stringify(answer).length <= 4_000)
  assert.deepEqual(Object.keys(answer.items[0]).sort(), ['id', 'path', 'slug', 'status', 'title', 'type'])
  assert.ok(answer.items.every((/** @type {any} */ r) => r.path.startsWith('/')))
})

test('list: a body list is cut at a record boundary — valid JSON, whole rows, the narrowing named', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    title: `P${i}`,
    slug: `p${i}`,
    type: 'page',
    status: 'publish',
    url: `https://x/p${i}/`,
    content: 'y'.repeat(1_500)
  }))
  const { send } = relay(() => ({ ok: true, kind: 'post', offset: 0, items: rows }))

  const answer = await call(wordpress({ send }), {
    action: 'content.list',
    params: { kind: 'post', include_body: true, offset: 10 }
  })

  const text = JSON.stringify(answer)
  assert.ok(text.length <= 8_000, String(text.length))
  assert.equal(JSON.parse(text).items.at(-1).content.length, 1_500, 'no record is cut inside')
  assert.equal(answer.truncated.total, 25)
  assert.match(answer.next, new RegExp(`include_body:false.*offset:${10 + answer.truncated.shown}`))
})

// 🔒 02/10/2026, measured on an imported WordPress copy: two empty lists (`wp_navigation`, `wp_template_part`)
// and then 21 tool calls for a menu label that one content.replace changes.
test('an empty list points at content.replace, once, and nothing else about a list changes', () => {
  const empty = { ok: true, kind: 'post', offset: 0, items: [] }
  for (const platform of ['wordpress', 'joomla']) {
    const out = emptyListNext(platform, empty, null, false)
    assert.match(out.next, /content\.replace \{find, replace\}/, platform)
    assert.deepEqual(
      { ...out, next: undefined },
      { ...empty, next: undefined },
      `${platform}: only next is added`
    )
  }
  const rows = { ...empty, items: [{ id: 1, title: 'A' }] }
  assert.equal(emptyListNext('wordpress', rows, null, false), rows, 'a list with rows is the same object')
  const refused = { ok: false, code: 'READ_FAILED', error: 'x' }
  assert.equal(emptyListNext('wordpress', refused, null, false), refused, 'a refusal is untouched')
  const own = { ...empty, next: 'its own next' }
  assert.equal(emptyListNext('wordpress', own, null, false), own, 'a next the answer already has stays')
  assert.equal(emptyListNext('emdash', empty, null, false), empty, 'EmDash has its own roads')
  assert.equal(
    emptyListNext('wordpress', empty, ['content.list'], false),
    empty,
    'a surface without content.replace'
  )
  assert.equal(emptyListNext('wordpress', empty, undefined, true), empty, 'a sealed site, actions unknown')
  assert.match(emptyListNext('wordpress', empty, ['content.replace'], true).next, /content\.replace/)
})

// 🔒 02/10/2026, imported Joomla copy: words in a module's settings were refused with a road that sent the agent
// to read a JSON blob; the slot index it needed was one grep away.
test('an imported site’s refused words point at its slot index, and only when the refusal leaves a road open', () => {
  const road = {
    ok: false,
    code: 'NOT_EDITABLE',
    error: 'words of module 126 this call does not read (its settings)',
    next: 'content.get {kind:"module", id:126} shows them'
  }
  const out = derivedReplaceNext(road, { derived: true })
  assert.match(out.next, /^content\.get \{kind:"module", id:126\} shows them\. ?On this imported site/)
  assert.match(out.next, /grep -i "<part of it>" docs\/agents\/import-contract\/slots\.tsv/)
  // No revision read in this conversation: the first apply answers INSPECT_FIRST, and the sentence says so.
  assert.match(
    out.next,
    /then content\.contract apply \(its first answer is INSPECT_FIRST with the slot's current words and a revision: send the same apply again\)\.$/
  )
  assert.doesNotMatch(out.next, /ONE content\.contract apply/)
  // A conversation that read a revision: ONE apply is true.
  const read = derivedReplaceNext(road, { derived: true }, true)
  assert.match(read.next, /then ONE content\.contract apply\.$/)
  assert.deepEqual({ ...out, next: undefined }, { ...road, next: undefined }, 'only next changes')
  assert.equal(derivedReplaceNext(road, { derived: false }), road, 'a site that is not imported')
  assert.equal(derivedReplaceNext(road, {}), road)
  assert.equal(derivedReplaceNext(road, null), road)
  const final = {
    ...road,
    next: 'tell the customer this text cannot change here; do not look for another way in: that is an answer'
  }
  assert.equal(derivedReplaceNext(final, { derived: true }), final, 'a final refusal stays final')
  const notFound = {
    ok: false,
    code: 'NOT_FOUND',
    error: 'x',
    next: 'page.text {path, match}, then this replace quoting those words exactly'
  }
  assert.match(derivedReplaceNext(notFound, { derived: true }).next, /slots\.tsv/)
  // Review of 02/10/2026: a `where` that names the wrong region is answered with the same call and the right
  // `where`; the slot index is no road for it, and the sentence only blurred the one that is.
  const wrongWhere = {
    ok: false,
    code: 'NOT_FOUND',
    error: '"Help center" is not in header on this page; it is in topbar, footer',
    next: 'the same call with where:"topbar" if that is the place meant, or without where.'
  }
  assert.equal(
    derivedReplaceNext(wrongWhere, { derived: true }),
    wrongWhere,
    'a where that names the wrong region'
  )
  const other = { ok: false, code: 'VALUE_NOT_ALLOWED', error: 'x', next: 'y' }
  assert.equal(derivedReplaceNext(other, { derived: true }), other, 'another refusal code')
  const receipt = { ok: true, changed: [{ at: 'module:1.title' }] }
  assert.equal(derivedReplaceNext(receipt, { derived: true }), receipt, 'a receipt')
  const bare = { ok: false, code: 'NOT_EDITABLE', error: 'x' }
  assert.equal(derivedReplaceNext(bare, { derived: true }), bare, 'no next to extend')
})

test('list: an empty answer through the whole call carries the hint, a full one does not', async () => {
  const { send } = relay(() => ({ ok: true, kind: 'post', offset: 0, items: [] }))
  const none = await call(wpQuiet(send), { action: 'content.list', params: { post_type: 'wp_navigation' } })
  assert.match(none.next, /content\.replace \{find, replace\}/)
  assert.deepEqual(none.items, [])
  const full = relay(() => ({
    ok: true,
    kind: 'post',
    offset: 0,
    items: [{ id: 2, title: 'Help', slug: 'help', type: 'page', status: 'publish', url: 'https://x/help/' }]
  }))
  const some = await call(wpQuiet(full.send), { action: 'content.list', params: { search: 'Help' } })
  // a list with rows keeps whatever next the call already gave it, and never the empty-list sentence
  assert.doesNotMatch(String(some.next ?? ''), /Nothing is stored under that name/)
})

test('list: a body read through a list is remembered whole, so a cut of it is refused', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    title: `P${i}`,
    slug: `p${i}`,
    type: 'page',
    status: 'publish',
    url: `https://x/p${i}/`,
    content: 'y'.repeat(1_500)
  }))
  const { send } = relay(() => ({ ok: true, kind: 'post', offset: 0, items: rows }))
  const ctx = wpQuiet(send)
  await call(ctx, { action: 'content.list', params: { kind: 'post', include_body: true } })

  const cut = await call(ctx, {
    action: 'content.update',
    params: { kind: 'post', id: 25, fields: { post_content: 'z'.repeat(500) } }
  })

  assert.deepEqual([cut.code, cut.chars_stored], ['BODY_SHRINK', 1_500])
})

test('get: a 60,000-char post is answered whole — a cut body cannot be written back', async () => {
  const { send } = relay(() => ({
    ok: true,
    kind: 'post',
    id: 42,
    item: { ID: 42, post_content: 'z'.repeat(60_000) }
  }))

  const post = await call(wordpress({ send }), {
    action: 'content.get',
    params: { kind: 'post', id: 42 }
  })

  assert.equal(post.item.post_content.length, 60_000)
  assert.equal(post.truncated, undefined)
})

test('db.dump: an over-budget dump is cut and names table, limit and cursor', async () => {
  const { send } = relay(() => ({
    ok: true,
    table: 'wp_posts',
    sql_b64: 'Q'.repeat(20_000),
    next_cursor: 'c1',
    done: false,
    rows: 500,
    total: 900
  }))

  const dumped = await call(wordpress({ send, facts: { platform: 'wordpress', sealed: false } }), {
    action: 'db.dump',
    params: { table: 'wp_posts' }
  })

  assert.ok(JSON.stringify(dumped).length <= 8_000)
  assert.match(dumped.next, /db\.dump \{table:"wp_posts", limit:<fewer rows>, cursor:""\}/)
})

test('budgetFor: media.scan and reads with no narrowing parameter are not capped', () => {
  assert.equal(budgetFor('media.scan', { limit: 100 }, 'joomla'), null)
})

{
  for (const action of ['info', 'content.get', 'extension.list', 'plugin.list', 'theme.list', 'db.tables'])
    test(`budgetFor: media.scan and reads with no narrowing parameter are not capped: ${rowName(action)}`, () => {
      assert.equal(budgetFor(action, {}, 'wordpress'), null, action)
    })
}

test('a refused call is never sent: wrong platform, unknown parameter, missing address', async () => {
  const { sent, send } = relay(() => assert.fail('nothing may be relayed'))
  for (const args of [
    { action: 'content.contract', params: { operation: 'inspect' } },
    // `query`, not `search`: since 30/09/2026 `search` is a key of content.list (the relay guards it).
    { action: 'content.list', params: { kind: 'post', query: '550-67-89' } },
    { action: 'content.update', params: { apply_id: 'x', fields: { post_content: '<p>x</p>' } } }
  ]) {
    const answer = await call(wordpress({ send }), args)

    assert.equal(answer.ok, false, JSON.stringify(args))
    assert.ok(answer.next.length <= 200, JSON.stringify(args))
  }
  assert.equal(sent.length, 0)
})

test('no wp_navigation menus reads the classic nav_menu_item rows', async () => {
  const { sent, send } = relay((_a, params) =>
    params.post_type === 'wp_navigation'
      ? { ok: true, items: [] }
      : { ok: true, items: [{ id: 5, title: 'Menu item' }] }
  )

  const menus = await call(wordpress({ send }), {
    action: 'content.list',
    params: { kind: 'menuItem' }
  })

  assert.equal(sent[1][1].post_type, 'nav_menu_item')
  assert.equal(menus.items.length, 1)
})

test('a slug is looked up, then read by its id', async () => {
  const { sent, send } = relay((action, params) =>
    action === 'content.list' && params.name === 'contact'
      ? { ok: true, items: [{ id: 39, title: 'Contact' }] }
      : { ok: true, item: { ID: 39, post_title: 'Contact', post_content: '<p>c</p>' } }
  )

  const page = await call(wordpress({ send }), {
    action: 'content.get',
    params: { kind: 'post', key: 'contact' }
  })

  assert.deepEqual(sent.at(-1), ['content.get', { kind: 'post', id: 39 }])
  assert.match(page.normalized.join(' '), /key "contact" → id 39/)
})

test('normalized: none on a clean call, at most 6 entries of 90 chars on a noisy one', async () => {
  const { send } = relay(() => ({ ok: true, items: [] }))
  const noisyPlan = {
    ...plan({ action: 'content.list', params: { kind: 'page', siteKey: 'x', context: 'edit' } }),
    notes: Array.from({ length: 9 }, (_, i) => `${'n'.repeat(120)}${i}`)
  }

  const clean = await call(wordpress({ send }), {
    action: 'content.list',
    params: { kind: 'post' }
  })
  const noisy = /** @type {any} */ (await runSiteCall({ ...wordpress({ send }), plan: noisyPlan }))

  assert.equal(clean.normalized, undefined)
  assert.ok(noisy.normalized.length <= 6)
  assert.ok(noisy.normalized.every((/** @type {string} */ n) => n.length <= 90))
})

test('flight: a write waits for an inspect in flight on the same site instead of overlapping it', async () => {
  const order = /** @type {string[]} */ ([])
  /** @type {(v?: unknown) => void} */
  let release = () => {}
  const held = new Promise((resolve) => {
    release = resolve
  })
  const send = async (/** @type {string} */ action) => {
    order.push(`${action} start`)
    if (action === 'content.contract') await held
    order.push(`${action} end`)
    return action === 'content.contract' ? HOME : { ok: true }
  }
  const ctx = openJ(send, { memory: createCallMemory() })
  const inspecting = call(ctx, INSPECT_HOME)
  const writing = call(ctx, {
    action: 'content.update',
    params: { kind: 'article', id: 5, fields: { title: 'x' }, apply_id: 'a1' }
  })
  await new Promise((resolve) => setImmediate(resolve))

  release()
  await Promise.all([inspecting, writing])

  assert.deepEqual(order, [
    'content.contract start',
    'content.contract end',
    'content.update start',
    'content.update end'
  ])
})

test('a relay that throws is an answer, never a throw; Tracy already asked twice, so it is not told to retry', async () => {
  const answer = await call(
    wordpress({
      send: async () => {
        throw new Error('socket hang up')
      }
    }),
    { action: 'content.list', params: { kind: 'post' } }
  )

  assert.deepEqual([answer.ok, answer.code, answer.asked], [false, 'COWORK_WEB_UNREACHABLE', 2])
  assert.doesNotMatch(answer.next, /\bretry\b/i)
})

// ── lost answers (E2.2) ──────────────────────────────────────────────────────────────────────────────

const POST_42 = { ok: true, kind: 'post', id: 42, key: null, created: false }
const STEP_42 = { op: 'content', created: false, kind: 'post', id: 42, key: null }
const titleWrite = (/** @type {string} */ title) => ({
  action: 'content.update',
  params: { kind: 'post', id: 42, fields: { post_title: title } }
})
// 🔒 E2.2's count is for writes that share one receipt: since 26/10/2026 that is only an id the
// model set itself on each of them (Tracy's own id is one per write, WP-27).
const MODEL_ID = 'wp-model-1'
const sharedId = (/** @type {{ action: string, params: Record<string, unknown> }} */ p) => ({
  ...p,
  params: { ...p.params, apply_id: MODEL_ID }
})

{
  const cases = [
    {
      first: lost('COMPONENT_UNREACHABLE'),
      sends: 2,
      slept: [2_000],
      note: /asked again after 2 s/
    },
    {
      first: lost('COMPONENT_BAD_RESPONSE'),
      sends: 2,
      slept: [2_000],
      note: /asked again after 2 s/
    },
    {
      first: lost('COWORK_WEB_UNREACHABLE'),
      sends: 2,
      slept: [2_000],
      note: /asked again after 2 s/
    },
    {
      first: { ok: false, httpStatus: 502, error: 'Bad Gateway' },
      sends: 2,
      slept: [2_000],
      note: /asked again after 2 s/
    },
    {
      first: { ok: false, httpStatus: 503, code: 'SITE_DOWN', error: 'x' },
      sends: 2,
      slept: [2_000],
      note: /asked again after 2 s/
    },
    {
      first: { ok: false, httpStatus: 504, error: 'Gateway Timeout' },
      sends: 2,
      slept: [2_000],
      note: /asked again after 2 s/
    },
    {
      first: { ok: false, error: 'not_found', message: 'no post 99' },
      sends: 1,
      slept: [],
      note: /^$/
    }
  ]
  for (const { first, sends, slept: expectedSleeps, note } of cases)
    test(`lost read: every lost class is asked once more after 2 s; an answer the component did give is never asked again: ${rowName(first)}`, async () => {
      const slept = /** @type {number[]} */ ([])
      const { sent, send } = relay((_a, _p, n) => (n === 1 ? first : { ok: true, items: [] }))

      const answer = await call(
        wordpress({ send, sleep: async (/** @type {number} */ ms) => void slept.push(ms) }),
        {
          action: 'content.list',
          params: { kind: 'post' }
        }
      )

      const label = JSON.stringify(first)
      assert.equal(sent.length, sends, label)
      assert.deepEqual(slept, expectedSleeps, label)
      assert.match((answer.normalized ?? []).join(' '), note, label)
    })
}

test('lost apply: a contract apply whose answer was lost is re-sent once with the same ids', async () => {
  const { sent, send } = relay((_a, p, n) =>
    p.operation === 'inspect' ? HOME : n === 2 ? { ...lost(), httpStatus: 502 } : { ok: true, ids: [428] }
  )
  const ctx = joomla({ send })
  await call(ctx, INSPECT_HOME)

  const answer = await call(ctx, applyContract())

  const both = applies(sent)
  assert.equal(answer.ok, true)
  assert.equal(both.length, 2)
  assert.deepEqual(both[0], both[1], 'a replay, never a second apply')
  assert.match(answer.normalized.join(' '), /same ids/)
})

test('lost apply: a re-send that meets the lock past its retries is OUTCOME_UNKNOWN, never "nothing was written"', async () => {
  const { sent, send } = relay((_a, p, n) => (p.operation === 'inspect' ? HOME : n === 2 ? lost() : LOCK))
  const ctx = joomla({ send })
  await call(ctx, INSPECT_HOME)

  const answer = await call(ctx, applyContract())

  assert.deepEqual([answer.code, answer.recheck], ['OUTCOME_UNKNOWN', 'inspect'])
  assert.match(answer.next, /Do not repeat the call/)
  assert.doesNotMatch(JSON.stringify(answer), /nothing (?:from this call )?was written/i)
  assert.equal(
    applies(sent).length,
    5,
    'the first send, one re-send, then three lock retries of that re-send'
  )
  assert.ok(ctx.memory.factsFor('session-a', 'j-1ibzqi').unknownIds.includes(answer.apply_id))
})

// ── review C2 (19/10/2026): the customer's Stop — a send on the wire finishes, no second one starts ──

test('🔒 C2: a contract apply on the wire when the customer stops is not replayed — its lost answer is OUTCOME_UNKNOWN', async () => {
  const stop = new AbortController()
  const { sent, send } = relay((_a, p) => {
    if (p.operation === 'inspect') return HOME
    stop.abort()
    return lost()
  })
  const ctx = joomla({ send, signal: stop.signal })
  await call(ctx, INSPECT_HOME)

  const answer = await call(ctx, applyContract())

  assert.equal(applies(sent).length, 1, 'the send on the wire only: no replay after Stop')
  assert.deepEqual([answer.code, answer.recheck], ['OUTCOME_UNKNOWN', 'inspect'])
  assert.ok(
    ctx.memory.factsFor('session-a', 'j-1ibzqi').unknownIds.includes(answer.apply_id),
    'kept as a write whose outcome is unknown'
  )
})

test('🔒 C2: a lost WordPress write after Stop is not counted on its receipt nor sent again', async () => {
  const stop = new AbortController()
  const { sent, send } = relay((action) => {
    if (action === 'apply.list') return { ok: true, apply_id: 'x', steps: [] }
    stop.abort()
    return lost()
  })

  const answer = await call(wordpress({ send, signal: stop.signal }), titleWrite('Stopped'))

  assert.deepEqual(
    sent.map(([a]) => a),
    ['content.update']
  )
  assert.equal(answer.code, 'OUTCOME_UNKNOWN')
})

test('🔒 C2: a lost read after Stop is not asked again', async () => {
  const stop = new AbortController()
  const slept = /** @type {number[]} */ ([])
  const { sent, send } = relay(() => (stop.abort(), lost()))

  const answer = await call(
    wordpress({ send, signal: stop.signal, sleep: async (/** @type {number} */ ms) => void slept.push(ms) }),
    { action: 'content.list', params: { kind: 'post' } }
  )

  assert.equal(sent.length, 1)
  assert.deepEqual(slept, [])
  assert.equal(answer.asked, 1)
})

test('🔒 C2: Stop during a lock-miss pause ends the pause at once; the retry the relay refuses is not a write', async () => {
  const stop = new AbortController()
  const { sent, send } = relay(() => LOCK)
  // The relay as `applyDoor` is: after Stop it sends nothing and says so.
  const gated = async (/** @type {string} */ a, /** @type {Record<string, any>} */ p) =>
    stop.signal.aborted ? stoppedAnswer() : send(a, p)
  const ctx = openJ(gated, {
    signal: stop.signal,
    // A pause that never ends by itself: only the Stop below can end it.
    sleep: () => (stop.abort(), new Promise(() => {}))
  })

  const answer = await call(ctx, {
    action: 'content.update',
    params: { kind: 'article', id: 7, fields: { title: 'x' } }
  })

  assert.equal(sent.length, 1, 'the lock miss only')
  assert.equal(answer.code, 'TURN_STOPPED')
})

// ── review C3 (19/10/2026): the lease is the door's, so its rule for "a write" is ───────────────────

{
  const cases = /** @type {Array<[string, Record<string, unknown>, boolean]>} */ ([
    ['media.upload', { path: 'a.png', content_b64: 'AA==' }, true],
    ['media.delete', { id: 9 }, true],
    ['media.delete', { id: 9, dry_run: true }, false],
    ['content.update', { kind: 'post', id: 42 }, true],
    ['content.read', {}, false],
    ['apply.list', { apply_id: 'x' }, false],
    ['db.dump', {}, false],
    ['content.contract', { operation: 'inspect' }, false],
    ['content.contract', { operation: 'multilingual.plan' }, false],
    ['content.contract', { operation: 'apply' }, true],
    ['site.identity', { operation: 'read' }, false],
    ['site.identity', { operation: 'set', fields: { sitename: 'x' } }, true],
    ['template.siteSettings', {}, false],
    ['apply.revert', { apply_id: 'x' }, true]
  ])
  for (const [action, params, takes] of cases)
    test(`🔒 C3: the calls that take the write lease are the ones tracy-web's changesSite counts: ${rowName([action, params])}`, () => {
      assert.equal(doorTakesLease(action, params), takes)
    })
}

{
  const cases = [
    {
      label: 'did not land',
      steps: [STEP_42],
      landed: undefined,
      actions: ['content.update', 'content.update', 'apply.list', 'content.update'],
      note: /did not land/
    },
    {
      label: 'landed',
      steps: [STEP_42, STEP_42],
      landed: true,
      actions: ['content.update', 'content.update', 'apply.list'],
      note: /first send landed/
    }
  ]
  for (const { label, steps, landed, actions, note } of cases)
    test(`lost write: a lost second write to one WordPress record is judged by the receipt — re-sent if it did not land, else reported landed: ${label}`, async () => {
      const { sent, send } = relay((action, _p, n) =>
        n === 2 ? lost() : action === 'apply.list' ? { ok: true, apply_id: 'x', steps } : POST_42
      )
      const ctx = wordpress({ send })
      await call(ctx, sharedId(titleWrite('First')))

      const second = await call(ctx, sharedId(titleWrite('Second')))

      assert.equal(second.ok, true, label)
      assert.equal(second.landed, landed, label)
      assert.deepEqual(
        sent.map(([a]) => a),
        actions,
        label
      )
      assert.equal(sent[2][1].apply_id, MODEL_ID, `${label}: the model's one id is the receipt asked about`)
      assert.match(second.normalized.join(' '), note, label)
    })
}

{
  const cases = /** @type {Array<[string, Record<string, unknown>]>} */ ([
    ['content.update', { kind: 'post', fields: { post_title: 'New', post_type: 'page' } }],
    ['content.delete', { kind: 'post', id: 42 }],
    ['plugin.install', { slug: 'contact-form-7' }]
  ])
  for (const [action, params] of cases)
    test(`lost write: a lost create, delete or install is never sent again — OUTCOME_UNKNOWN names the receipt: ${rowName(action)}`, async () => {
      const { sent, send } = relay(() => lost('COWORK_WEB_UNREACHABLE'))
      const ctx = wordpress({ send })
      const p = { action, params }
      const toSend = action === 'content.update' ? plan(p) : await armed(ctx, p)

      const answer = /** @type {any} */ (await runSiteCall({ ...ctx, plan: toSend }))

      assert.equal(sent.length, 1, action)
      assert.deepEqual([answer.code, answer.lost], ['OUTCOME_UNKNOWN', 'COWORK_WEB_UNREACHABLE'], action)
      assert.match(answer.next, /do not repeat the call/i, action)
    })
}

{
  const roads = /** @type {Array<[string, Record<string, unknown>, string, string]>} */ ([
    ['content.get', {}, 'wordpress', 'read'],
    ['content.contract', { operation: 'inspect' }, 'joomla', 'read'],
    ['content.contract', { operation: 'multilingual.plan' }, 'joomla', 'read'],
    ['content.contract', { operation: 'apply' }, 'joomla', 'replay'],
    ['content.contract', { operation: 'multilingual.apply' }, 'joomla', 'pass'],
    ['content.batch', {}, 'joomla', 'replay'],
    ['content.update', { kind: 'post', id: 42 }, 'wordpress', 'counted'],
    ['content.update', { kind: 'templatePart', key: 'header' }, 'wordpress', 'counted'],
    ['content.update', { kind: 'post' }, 'wordpress', 'unknown'],
    ['content.update', { kind: 'article', id: 4 }, 'joomla', 'unknown'],
    ['apply.revert', { apply_id: 'wp-1' }, 'wordpress', 'unknown']
  ])
  for (const [action, params, platform, road] of roads)
    test(`lost answers: which calls are re-asked, replayed or counted (lostAnswerRoad), and that the door’s busy answers are never lost: ${rowName(action)}`, () => {
      assert.equal(lostAnswerRoad(action, params, platform), road, `${action} ${JSON.stringify(params)}`)
    })
}

{
  for (const busy of [{ ok: false, httpStatus: 409, code: 'SITE_BUSY' }, LOCK])
    test(`lost answers: which calls are re-asked, replayed or counted (lostAnswerRoad), and that the door’s busy answers are never lost: ${rowName(busy)}`, () => {
      assert.equal(answerLost(busy), false, JSON.stringify(busy))
    })
}

test('lost write: a delete leaves the same step as an update — a lost write after it that did not land is re-sent', async () => {
  const { sent, send } = relay((action, _p, n) =>
    action === 'content.delete'
      ? { ok: true, kind: 'post', id: 42, key: null }
      : n === 2
        ? lost()
        : action === 'apply.list'
          ? { ok: true, apply_id: 'x', steps: [STEP_42] }
          : POST_42
  )
  const ctx = wordpress({ send })
  await runSiteCall({
    ...ctx,
    plan: await armed(ctx, { action: 'content.delete', params: { kind: 'post', id: 42, apply_id: MODEL_ID } })
  })

  const update = await call(ctx, sharedId(titleWrite('Back')))

  assert.equal(update.ok, true)
  assert.equal(update.landed, undefined, "the one step is the delete's: not reported as this write")
  assert.deepEqual(
    sent.map(([a]) => a),
    ['content.delete', 'content.update', 'apply.list', 'content.update']
  )
})

test('lost write: a template part reset is recorded by its slug, so a lost rewrite of it is re-sent', async () => {
  const { sent, send } = relay((action, _p, n) =>
    action === 'content.delete'
      ? { ok: true, kind: 'templatePart', id: 80, key: 'header' }
      : n === 2
        ? lost()
        : action === 'apply.list'
          ? {
              ok: true,
              apply_id: 'x',
              steps: [{ op: 'content', created: false, kind: 'templatePart', id: 80, key: 'header' }]
            }
          : { ok: true, kind: 'templatePart', id: 91, key: 'header', created: true }
  )
  const ctx = wpQuiet(send)
  await runSiteCall({
    ...ctx,
    plan: await armed(ctx, {
      action: 'content.delete',
      params: { kind: 'templatePart', key: 'header', apply_id: MODEL_ID }
    })
  })
  ctx.memory.rememberRead('session-w', {
    kind: 'templatePart',
    key: 'header',
    chars: 7_848,
    theme: 'parts/header.html'
  })

  const write = await call(ctx, sharedId(partWrite('header', 'H'.repeat(7_848))))

  assert.equal(write.landed, undefined)
  assert.deepEqual(
    sent.map(([a]) => a),
    ['content.delete', 'content.update', 'apply.list', 'content.update']
  )
})

test('lost write: a write whose outcome stayed unknown is never counted past — the next lost write is OUTCOME_UNKNOWN', async () => {
  const { sent, send } = relay((action, _p, n) =>
    action === 'apply.list'
      ? n === 2
        ? { ok: false, error: 'list_failed', message: 'x' }
        : { ok: true, apply_id: 'x', steps: [STEP_42] }
      : lost()
  )
  const ctx = wordpress({ send })
  await call(ctx, sharedId(titleWrite('First'))) // lost, and its receipt cannot be read

  const second = await call(ctx, sharedId(titleWrite('Second')))

  assert.equal(second.code, 'OUTCOME_UNKNOWN')
  assert.notEqual(second.landed, true)
  assert.deepEqual(
    sent.map(([a]) => a),
    ['content.update', 'apply.list', 'content.update'],
    'the receipt is not asked again'
  )
})

test('lost write: a create whose outcome is unknown blocks the receipt count for every record', async () => {
  const { sent, send } = relay((action) =>
    action === 'apply.list' ? { ok: true, apply_id: 'x', steps: [STEP_42] } : lost()
  )
  const ctx = wordpress({ send })
  await call(ctx, {
    action: 'content.update',
    params: { kind: 'post', fields: { post_title: 'New', post_type: 'page' }, apply_id: MODEL_ID }
  })

  const after = await call(ctx, sharedId(titleWrite('x')))

  assert.equal(after.code, 'OUTCOME_UNKNOWN')
  assert.equal(count(sent, 'apply.list'), 0)
})

test('🔒 one apply id per write (owner, 26/10/2026): two agent writes of one turn go out under two ids of one stem, on WordPress and on open Joomla; an id the call sets is sent as given', async () => {
  const wp = relay(() => POST_42)
  const wpCtx = wordpress({ send: wp.send })
  await call(wpCtx, titleWrite('One'))
  await call(wpCtx, titleWrite('Two'))
  await call(wpCtx, sharedId(titleWrite('Three')))
  const [a, b, c] = wp.sent.filter(([x]) => x === 'content.update').map(([, p]) => p.apply_id)
  assert.match(a, /^wp-.+-1$/)
  assert.equal(b, a.replace(/-1$/, '-2'))
  assert.equal(c, MODEL_ID)

  const jo = relay(() => ({ ok: true, kind: 'article', id: 4 }))
  const joCtx = joomla({ send: jo.send, facts: { platform: 'joomla', sealed: false } })
  for (const title of ['One', 'Two'])
    await call(joCtx, { action: 'content.update', params: { kind: 'article', id: 4, fields: { title } } })
  const ids = jo.sent.filter(([x]) => x === 'content.update').map(([, p]) => p.apply_id)
  assert.equal(ids.length, 2)
  assert.match(ids[0], /^jo-.+-1$/)
  assert.equal(ids[1], ids[0].replace(/-1$/, '-2'))
})

{
  const cases = [
    { label: 'did not land', steps: [], landed: undefined, resent: true },
    { label: 'landed', steps: [STEP_42], landed: true, resent: false }
  ]
  for (const { label, steps, landed, resent } of cases)
    test(`lost write: with one apply id per write (26/10/2026) the lost write's own receipt is read, and an earlier write to the record does not count in it: ${label}`, async () => {
      const { sent, send } = relay((action, p, n) =>
        n === 2
          ? lost()
          : action === 'apply.list'
            ? {
                ok: true,
                apply_id: p.apply_id,
                steps: p.apply_id === sent[1][1].apply_id ? steps : [STEP_42]
              }
            : POST_42
      )
      const ctx = wordpress({ send })
      await call(ctx, titleWrite('First'))

      const second = await call(ctx, titleWrite('Second'))

      assert.equal(second.ok, true, label)
      assert.equal(second.landed, landed, label)
      assert.notEqual(sent[1][1].apply_id, sent[0][1].apply_id, `${label}: each write has an id of its own`)
      assert.equal(sent[2][1].apply_id, sent[1][1].apply_id, `${label}: the lost write's receipt is asked`)
      assert.equal(count(sent, 'content.update'), resent ? 3 : 2, label)
    })
}

test('lost write: with one apply id per write, an earlier write whose outcome stayed unknown no longer blocks the count — its steps live under its own id', async () => {
  const { sent, send } = relay((action, p, n) =>
    action === 'apply.list'
      ? n === 2
        ? { ok: false, error: 'list_failed', message: 'x' }
        : { ok: true, apply_id: p.apply_id, steps: [STEP_42] }
      : lost()
  )
  const ctx = wordpress({ send })
  await call(ctx, titleWrite('First')) // lost, and its receipt cannot be read

  const second = await call(ctx, titleWrite('Second'))

  assert.equal(second.ok, true)
  assert.equal(second.landed, true)
  assert.deepEqual(
    sent.map(([a]) => a),
    ['content.update', 'apply.list', 'content.update', 'apply.list']
  )
  assert.equal(sent[3][1].apply_id, sent[2][1].apply_id, "the second write's own receipt is asked")
  assert.notEqual(sent[2][1].apply_id, sent[0][1].apply_id)
})

/**
 * A clock the fake relay and sleep move: each send takes `took(action, n)` ms.
 * @param {(action: string, params: Record<string, any>, n: number) => unknown} answer
 * @param {(action: string, n: number) => number} took
 */
function timed(answer, took) {
  let t = 0
  const { sent, send } = relay((action, params, n) => {
    t += took(action, n)
    return answer(action, params, n)
  })
  return {
    sent,
    send,
    now: () => t,
    sleep: async (/** @type {number} */ ms) => {
      t += ms
    },
    random: () => 0.5
  }
}

test('clock: a read that timed out at 180 s is not asked again (one clock for the whole call)', async () => {
  const read = timed(
    () => lost(),
    () => 180_000
  )

  const answer = await call(wordpress({ send: read.send, now: read.now, sleep: read.sleep }), {
    action: 'content.list',
    params: { kind: 'post' }
  })

  assert.equal(read.sent.length, 1)
  assert.equal(answer.asked, 1)
  assert.match(answer.next, /no answer in 180 s/)
  assert.doesNotMatch(answer.next, /\bretry\b/i)
})

test('clock: a contract apply that timed out at 180 s is not replayed — OUTCOME_UNKNOWN', async () => {
  const apply = timed(
    (_a, p) => (p.operation === 'inspect' ? HOME : lost()),
    (_a, n) => (n === 1 ? 0 : 180_000)
  )
  const ctx = joomla({
    send: apply.send,
    now: apply.now,
    sleep: apply.sleep,
    random: apply.random
  })
  await call(ctx, INSPECT_HOME)

  const applied = await call(ctx, applyContract())

  assert.deepEqual([applied.code, applied.recheck], ['OUTCOME_UNKNOWN', 'inspect'])
  assert.equal(applies(apply.sent).length, 1)
})

test('clock: a replay’s lock retries count from the FIRST send — 150 s is the call’s, not each send’s', async () => {
  const clock = timed(
    (_a, p, n) => (p.operation === 'inspect' ? HOME : n === 2 ? lost() : LOCK),
    (_a, n) => (n === 2 ? 140_000 : 0)
  )
  const ctx = joomla({
    send: clock.send,
    now: clock.now,
    sleep: clock.sleep,
    random: clock.random
  })
  await call(ctx, INSPECT_HOME)

  const answer = await call(ctx, applyContract())

  assert.equal(answer.code, 'OUTCOME_UNKNOWN')
  assert.equal(applies(clock.sent).length, 4, 'the first send, the replay, and two of the three lock retries')
  assert.ok(clock.now() < 160_000, `${clock.now()} ms`)
})

// ── same-call memory (E3.2) and what the component lacks (E3.3) ──────────────────────────────────────

// A key nobody reads (`query`, not `search`: since 30/09/2026 `search` is a key of content.list).
const listSearch = () => {
  const { sent, send } = relay(() => ({ ok: true, items: [] }))
  return {
    sent,
    ctx: wordpress({ send }),
    args: { action: 'content.list', params: { kind: 'post', query: 'Hotline' } }
  }
}
const shrinkWrite = (/** @type {number} */ id) => ({
  action: 'content.update',
  params: { kind: 'post', id, fields: { post_content: 'x'.repeat(4_155) } }
})

{
  const cases = [
    {
      label: 'an UNKNOWN_PARAM refusal',
      make: listSearch,
      expect: { refused: 'UNKNOWN_PARAM' }
    },
    {
      label: 'a BODY_SHRINK that judged a read',
      make: () => {
        const { sent, send } = relay(() => POST_42)
        const ctx = wpQuiet(send)
        ctx.memory.rememberRead('session-w', {
          kind: 'post',
          id: 42,
          title: 'Home',
          chars: 26_884
        })
        return { sent, ctx, args: shrinkWrite(42) }
      },
      expect: {}
    },
    {
      label: 'a contract apply refused twice (the ids Tracy makes stay out of the key)',
      make: () => {
        const { sent, send } = relay((_a, p) =>
          p.operation === 'inspect' ? HOME : { ok: false, error: 'bad_params', message: 'x' }
        )
        return { sent, ctx: joomla({ send }), args: applyContract(), arrange: INSPECT_HOME }
      },
      expect: {}
    }
  ]
  for (const { label, make, expect } of cases)
    test(`same call: a refusal repeated verbatim in one turn is answered here, nothing sent: ${label}`, async () => {
      const { sent, ctx, args, arrange } = make()
      if (arrange) await call(ctx, arrange)
      const first = await call(ctx, args)
      const sentAfterFirst = sent.length

      const second = await call(ctx, args)

      assert.equal(second.code, 'SAME_CALL_REFUSED', label)
      assert.equal(second.next, first.next, `${label}: the earlier refusal’s own next`)
      assert.ok(second.error.length <= 160, label)
      assert.equal(sent.length, sentAfterFirst, label)
      assertHas(second, expect, label)
    })
}

{
  const manifestRefusal = () => {
    const { sent, send } = relay((action) =>
      action === 'core.manifest' ? { ok: false, error: 'bad_params', message: 'x' } : POST_42
    )
    return { sent, ctx: wordpress({ send }), args: MANIFEST }
  }
  const cases = [
    {
      label: 'a new customer message',
      make: listSearch,
      between: (/** @type {any} */ ctx) => ctx.memory.newTurn('session-w'),
      expect: { code: 'UNKNOWN_PARAM' }
    },
    {
      label: 'a write to the site in between',
      make: manifestRefusal,
      between: (/** @type {any} */ ctx) => ctx.memory.invalidateSite('wp-dmlj6g'),
      expect: {}
    },
    {
      label: 'a transient COMPONENT_UNREACHABLE',
      make: () => {
        const { sent, send } = relay(() => ({ ...lost(), httpStatus: 502 }))
        return {
          sent,
          ctx: wordpress({ send }),
          args: { action: 'content.list', params: { kind: 'post' } }
        }
      },
      between: () => {},
      expect: { code: 'COMPONENT_UNREACHABLE' }
    },
    {
      label: 'a lock miss past its retries (it asks for the same call once more)',
      make: () => {
        const { sent, send } = relay(() => LOCK)
        return {
          sent,
          ctx: openJ(send),
          args: {
            action: 'content.update',
            params: { kind: 'article', id: 4, fields: { title: 'x' } }
          }
        }
      },
      between: () => {},
      expect: {}
    },
    {
      label: 'a BODY_SHRINK that only asked for a read first',
      make: () => {
        const { sent, send } = relay(() => POST_42)
        return { sent, ctx: wpQuiet(send), args: shrinkWrite(39) }
      },
      between: () => {},
      expect: { code: 'BODY_SHRINK' }
    }
  ]
  for (const { label, make, between, expect } of cases)
    test(`same call: a repeat is judged again, not answered from memory, when it could now be right or was never final: ${label}`, async () => {
      const { sent, ctx, args } = make()
      await call(ctx, args)
      const sentAfterFirst = sent.length
      between(ctx)

      const second = await call(ctx, args)

      assert.notEqual(second.code, 'SAME_CALL_REFUSED', label)
      assertHas(second, expect, label)
      assert.ok(sent.length >= sentAfterFirst, label)
    })
}

{
  const upload = {
    path: `images/tracy-content/${'a'.repeat(64)}.png`,
    content_b64: 'iVBORw0KGgo='
  }
  const retire = { operation: 'multilingual.retire', keep: ['en-GB'] }
  const article = { kind: 'article', id: 4, fields: { title: 'Welcome' } }
  const cases = [
    {
      // A Joomla update without an id is no longer refused: Tracy makes it one (J-6, 26/10/2026).
      label: 'a Joomla update refused under a receipt id the site keeps for another kind of write',
      relay: (/** @type {any} */ p) =>
        String(p.apply_id).startsWith('contract-')
          ? { ok: false, error: 'bad_params', message: 'contract- receipts are for contract applies' }
          : { ok: true, kind: 'article', id: 4 },
      first: { action: 'content.update', params: { ...article, apply_id: 'contract-1' } },
      second: { action: 'content.update', params: { ...article, apply_id: 'hero-title' } },
      armed: false,
      sealed: false,
      ids: ['contract-1', 'hero-title'],
      ok: true
    },
    {
      label: 'a sealed Joomla undo of another receipt',
      relay: () => ({
        ok: false,
        error: LEGACY_STRUCTURE_CODE,
        message: 'Only content-contract applies can be reverted in this mode'
      }),
      first: { action: 'apply.revert', params: { apply_id: 'dtrim-1' } },
      second: { action: 'apply.revert', params: { apply_id: 'contract-aaa' } },
      armed: false,
      sealed: true,
      ids: ['dtrim-1', 'contract-aaa'],
      ok: false
    },
    {
      label: 'a language job asked for an mlang- id',
      relay: (/** @type {any} */ p) =>
        String(p.apply_id).startsWith('mlang-')
          ? { ok: true, status: 'running' }
          : {
              ok: false,
              error: 'bad_params',
              message: 'an mlang- apply_id and a request_id are required'
            },
      first: { action: 'content.contract', params: { ...retire, apply_id: 'retire-1' } },
      second: { action: 'content.contract', params: { ...retire, apply_id: 'mlang-retire-1' } },
      armed: true, // retiring languages is destructive: each call is armed by the customer's answer first
      sealed: true,
      ids: ['retire-1', 'mlang-retire-1'],
      ok: true
    },
    {
      label: 'a sealed media upload refused under a contract- receipt',
      relay: (/** @type {any} */ p) =>
        String(p.apply_id).startsWith('contract-')
          ? {
              ok: false,
              error: LEGACY_STRUCTURE_CODE,
              message: 'Media uploads must use a separate apply receipt'
            }
          : { ok: true, path: p.path },
      first: { action: 'media.upload', params: { ...upload, apply_id: 'contract-1' } },
      second: { action: 'media.upload', params: { ...upload, apply_id: 'media-1' } },
      armed: false,
      sealed: true,
      ids: ['contract-1', 'media-1'],
      ok: true
    }
  ]
  for (const { label, relay: answer, first, second, armed: needsArming, sealed, ids, ok } of cases)
    test(`same call: an id the MODEL gave is part of the call — the corrected id a refusal asked for is sent: ${label}`, async () => {
      const { sent, send } = relay((_a, p) => answer(p))
      const ctx = joomla({ send, facts: { platform: 'joomla', sealed } })
      const firstPlan = needsArming ? await armed(ctx, first) : plan(first)
      await runSiteCall({ ...ctx, plan: firstPlan })
      const secondPlan = needsArming ? await armed(ctx, second) : plan(second)

      const out = /** @type {any} */ (await runSiteCall({ ...ctx, plan: secondPlan }))

      assert.notEqual(out.code, 'SAME_CALL_REFUSED', label)
      assert.equal(out.ok === true, ok, label)
      assert.deepEqual(
        sent.map(([, p]) => p.apply_id),
        ids,
        label
      )
    })
}

const MANIFEST = { action: 'core.manifest', params: {} }
const BAD_ACTION = { ok: false, error: 'bad_action', message: 'unknown action: core.manifest' }

{
  const cases = [
    {
      label: 'same conversation, next turn',
      session: 'session-w',
      tick: 0,
      expect: { code: 'NOT_ON_THIS_PLATFORM', learned: true },
      sends: 1
    },
    {
      label: 'another conversation on the site',
      session: 'session-z',
      tick: 0,
      expect: { code: 'NOT_ON_THIS_PLATFORM', learned: true },
      sends: 1
    },
    {
      label: 'an hour later the component is asked again',
      session: 'session-w',
      tick: 3_600_000,
      expect: { code: undefined, learned: undefined, error: 'bad_action' },
      sends: 2
    }
  ]
  for (const { label, session, tick, expect, sends } of cases)
    test(`learned: an action the component answered bad_action for is refused here for every conversation — until an hour has passed: ${label}`, async () => {
      let t = 1_000
      const memory = createCallMemory({ now: () => t })
      const { sent, send } = relay(() => BAD_ACTION)
      const ctx = wordpress({ send, memory })
      await call(ctx, MANIFEST)
      t += tick
      memory.newTurn('session-w') // past same-call memory: a new turn, the same dead road

      const out = await call({ ...ctx, sessionId: session }, MANIFEST)

      assertHas(out, expect, label)
      assert.equal(sent.length, sends, label)
    })
}

test('learned: a plugin install that went through forgets it at once', async () => {
  const { sent, send } = relay((action) =>
    action === 'plugin.install' ? { ok: true } : { ok: true, core: '7.0' }
  )
  const memory = createCallMemory()
  memory.learn('wp-dmlj6g', 'missing', 'core.manifest')
  const ctx = wordpress({ send, memory })
  await runSiteCall({
    ...ctx,
    plan: await armed(ctx, { action: 'plugin.install', params: { slug: 'x' } })
  })

  await call(ctx, MANIFEST)

  assert.equal(count(sent, 'core.manifest'), 1)
})

{
  const refusals = [
    { label: 'bound to its contract', message: LEGACY_BOUND_MESSAGE },
    {
      label: 'a picture path refusal',
      message: 'Use a new content-addressed image in images/tracy-content'
    }
  ]
  for (const { label, message } of refusals)
    test(`learned: only a "bound to its quickstart contract" refusal is learned — nothing is refused before the relay: ${label}`, async () => {
      const { sent, send } = relay(() => ({ ok: false, error: LEGACY_STRUCTURE_CODE, message }))
      const ctx = openJ(send)
      await call(ctx, {
        action: 'content.update',
        params: { kind: 'article', id: 4, fields: { title: 'x' } }
      })

      const next = /** @type {any} */ (
        await runSiteCall({
          ...ctx,
          plan: await armed(ctx, { action: 'content.delete', params: { kind: 'article', id: 5 } })
        })
      )

      assert.equal(next.error, LEGACY_STRUCTURE_CODE, label)
      assert.equal(sent.length, 2, `${label}: the component answered itself`)
    })
}

// ── content.list {search} (30/09/2026): guarded by the relay, learned for the site, never shown unfiltered ──

{
  /** What the relay answers a search whose plugin did not read it (`route.js`, status 501). */
  const UNSUPPORTED = { ok: false, httpStatus: 501, code: 'LIST_SEARCH_UNSUPPORTED' }
  const ROWS = [
    {
      id: 7,
      title: 'Roof repair',
      slug: 'roof-repair',
      type: 'page',
      status: 'publish',
      url: 'https://x/roof-repair/'
    }
  ]
  /** @param {Record<string, unknown>} [over] */
  const searched = (over = {}) => ({
    action: 'content.list',
    params: { kind: 'post', search: 'roof', ...over }
  })
  const PLAIN = { action: 'content.list', params: { kind: 'post' } }
  const FIFTEEN_MINUTES = 900_000

  test('list search: the relay refusing it is learned for the site — the next search is refused before the relay, a plain list still goes, and fifteen minutes later it is asked again', async () => {
    let t = 1_000
    const memory = createCallMemory({ now: () => t })
    const { sent, send } = relay((_a, p) =>
      'search' in p ? UNSUPPORTED : { ok: true, kind: 'post', offset: 0, items: ROWS }
    )
    const ctx = wordpress({ send, memory })

    const first = await call(ctx, searched())
    assertHas(first, { ok: false, code: 'LIST_SEARCH_UNSUPPORTED' }, 'the relay answered it')
    assert.match(first.next, /content\.read \{type:"article", locale, fields:"title,slug"\}/)
    assert.ok(first.next.length <= 200)
    assert.equal(sent.length, 1)

    memory.newTurn('session-w')
    const again = await call(ctx, searched({ search: 'gutter' }))
    assertHas(again, { code: 'LIST_SEARCH_UNSUPPORTED', learned: true }, 'refused here')
    assert.equal(sent.length, 1, 'before the relay')

    const plain = await call(ctx, PLAIN)
    assert.equal(plain.ok, true, 'a list with no search is not the dead road')
    assert.equal(sent.length, 2)

    const other = await call({ ...ctx, sessionId: 'session-z' }, searched())
    assertHas(other, { code: 'LIST_SEARCH_UNSUPPORTED', learned: true }, 'a fact about the site')
    assert.equal(sent.length, 2)

    t = 1_000 + FIFTEEN_MINUTES - 1
    assert.equal((await call(ctx, searched({ search: 'tiles' }))).learned, true, 'still learned')
    assert.equal(sent.length, 2)

    t = 1_000 + FIFTEEN_MINUTES
    const later = await call(ctx, searched({ search: 'tiles' }))
    assert.equal(later.learned, undefined, 'asked again, and the relay answers it itself')
    assert.equal(sent.length, 3)
  })

  test('list search: an ok answer with no `search` key — an older relay, a plugin that never read it — is refused the same way, learned, and its rows are not shown', async () => {
    const { sent, send } = relay(() => ({ ok: true, kind: 'post', offset: 0, items: ROWS }))
    const ctx = wordpress({ send })

    const out = await call(ctx, searched())

    assertHas(out, { ok: false, code: 'LIST_SEARCH_UNSUPPORTED' })
    assert.equal('items' in out, false)
    assert.equal(JSON.stringify(out).includes('roof-repair'), false, 'nothing that looks filtered')
    assert.match(out.next, /content\.read \{type:"article", locale, fields:"title,slug"\}/)
    const again = await call(ctx, searched({ search: 'gutter' }))
    assertHas(again, { code: 'LIST_SEARCH_UNSUPPORTED', learned: true })
    assert.equal(sent.length, 1)
  })

  test('list search: a recorded answer of a plugin that reads it — the echo and `matched` — passes with both, its rows shaped as any list, and the site is not learned as dead', async () => {
    const recorded = { ok: true, kind: 'post', offset: 0, search: 'roof', matched: 1, items: ROWS }
    const { sent, send } = relay(() => recorded)
    const ctx = wordpress({ send })

    const out = await call(ctx, searched())

    assertHas(out, { ok: true, search: 'roof', matched: 1 })
    assert.deepEqual(out.items, [
      {
        id: 7,
        title: 'Roof repair',
        slug: 'roof-repair',
        type: 'page',
        status: 'publish',
        path: '/roof-repair/'
      }
    ])
    await call(ctx, searched({ search: 'gutter' }))
    assert.equal(sent.length, 2, 'the second search went to the relay too')
  })

  test('list search: the KEY is what proves the plugin read it, never its value or the rows — an echo of the empty string, a number or null passes', async () => {
    for (const echo of ['', 0, null, 'roof repair']) {
      const { send } = relay(() => ({ ok: true, kind: 'post', offset: 0, search: echo, items: [] }))
      const out = await call(wordpress({ send }), searched())
      assert.equal(out.ok, true, JSON.stringify(echo))
      assert.equal(out.search, echo)
    }
  })

  test('list search: a plugin that refuses the search itself (bad_params) is not a dead road — its own word is the answer and nothing is learned', async () => {
    const { sent, send } = relay(() => ({
      ok: false,
      error: 'bad_params',
      message: 'search: kind "user" cannot be searched'
    }))
    const ctx = openJ(send)

    const out = await call(ctx, { action: 'content.list', params: { kind: 'user', search: 'ana' } })
    const again = await call(ctx, { action: 'content.list', params: { kind: 'article', search: 'ana' } })

    assertHas(out, { ok: false, error: 'bad_params' })
    assert.equal(again.learned, undefined, 'the next search still goes to the relay')
    assert.equal(sent.length, 2)
  })

  test('list search: Joomla is told the same, and a call that carried no search never meets the guard', async () => {
    const { sent, send } = relay((_a, p) =>
      'search' in p ? UNSUPPORTED : { ok: true, kind: 'article', offset: 0, items: [] }
    )
    const ctx = openJ(send)

    const refused = await call(ctx, { action: 'content.list', params: { kind: 'article', search: 'roof' } })
    const plain = await call(ctx, { action: 'content.list', params: { kind: 'article' } })

    assertHas(refused, { ok: false, code: 'LIST_SEARCH_UNSUPPORTED' })
    assert.match(refused.next, /^No search here: content\.read \{type:"article", locale/)
    assert.equal(plain.ok, true)
    assert.equal(sent.length, 2)
  })

  test('list search: on a plugin that ignores it, a Joomla kind content.read does not list is told the same call paged — from the relay and from this host’s memory — and an article keeps content.read', async () => {
    const { sent, send } = relay((_a, p) =>
      'search' in p ? UNSUPPORTED : { ok: true, kind: p.kind, offset: 0, items: [] }
    )
    const ctx = openJ(send)
    const PAGED =
      'Same call without search: content.list {kind, offset, limit} lists this kind a page at a time.'

    // A banner is in no `content.read` type: the relay would refuse `content.read {type:"banner"}`.
    const banner = await call(ctx, { action: 'content.list', params: { kind: 'banner', search: 'promo' } })
    assertHas(banner, { ok: false, code: 'LIST_SEARCH_UNSUPPORTED' })
    assert.equal(banner.next, PAGED)
    assert.equal(sent.length, 1)

    // Learned for the site: refused here, before the relay, and the next still goes by the kind asked.
    const category = await call(ctx, { action: 'content.list', params: { kind: 'category', search: 'news' } })
    assertHas(category, { code: 'LIST_SEARCH_UNSUPPORTED', learned: true })
    assert.equal(category.next, PAGED)
    const article = await call(ctx, { action: 'content.list', params: { kind: 'article', search: 'news' } })
    assertHas(article, { code: 'LIST_SEARCH_UNSUPPORTED', learned: true })
    assert.match(
      article.next,
      /^No search here: content\.read \{type:"article", locale, fields:"title,slug"\} lists /
    )
    assert.equal(sent.length, 1, 'the memory answered before the relay')
  })

  test('list search: an empty search is dropped and the plain list answers — even on a site that learned the dead road', async () => {
    const { sent, send } = relay(() => ({ ok: true, kind: 'post', offset: 0, items: ROWS }))
    const memory = createCallMemory({ now: () => 1_000 })
    memory.learn('wp-dmlj6g', 'noListSearch')
    const ctx = wordpress({ send, memory })

    const out = await call(ctx, searched({ search: '  ' }))

    assert.equal(out.ok, true)
    assert.equal('search' in sent[0][1], false, 'the empty key never left')
    assert.ok(out.normalized.some((/** @type {string} */ n) => /params\.search dropped/.test(n)))
  })
}

// ── content.list, advertised (30/09/2026): a cut list and a stray key name the way to one record by its title ──

{
  const SEARCH_SENTENCE = 'search:"<part of the title>" finds one by its title.'
  /** A list answer well over the 16,000-character budget: `n` rows of ~250 characters each. */
  const bigList = (
    /** @type {string} */ kind,
    /** @type {number} */ n,
    /** @type {Record<string, unknown>} */ more = {},
    /** @type {number} */ body = 0
  ) => ({
    ok: true,
    kind,
    offset: 0,
    ...more,
    items: Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      title: `Row ${i} ${'t'.repeat(80)}`,
      alias: `row-${i}`,
      slug: `row-${i}`,
      name: `Row ${i}`,
      state: 1,
      status: 'publish',
      type: 'post',
      language: 'en-GB',
      url: `https://x/row-${i}/`,
      note: 'n'.repeat(120),
      // The body a row carries when it was asked for: `content` on WordPress, `introtext` on a Joomla article.
      ...(body > 0 ? { content: 'b'.repeat(body), introtext: 'b'.repeat(body) } : {})
    }))
  })
  const plainList = (/** @type {string} */ kind) => ({ action: 'content.list', params: { kind } })

  test('list: a cut plain list names the way to one record by its title, after the rows that follow — a Joomla article, category and menu item, a WordPress post', async () => {
    for (const [make, kind] of /** @type {const} */ ([
      [openJ, 'article'],
      [openJ, 'category'],
      [openJ, 'menuItem'],
      [wpQuiet, 'post']
    ])) {
      const { send } = relay(() => bigList(kind, 400))

      const out = await call(make(send), plainList(kind))

      assert.equal(out.truncated.total, 400, kind)
      assert.equal(
        out.next,
        `${out.truncated.shown} rows shown: the same call with offset:${out.truncated.shown} gives the next ones; limit sets how many; ${SEARCH_SENTENCE}`,
        kind
      )
    }
  })

  test('list: a cut list of a Joomla kind with no title names the rows that follow and no search', async () => {
    for (const kind of ['user', 'redirect', 'extensionParams']) {
      const { send } = relay(() => bigList(kind, 400))

      const out = await call(openJ(send), plainList(kind))

      assert.equal(out.truncated?.total, 400, kind)
      assert.doesNotMatch(out.next, /search/, kind)
      assert.match(
        out.next,
        /^\d+ rows shown: the same call with offset:\d+ gives the next ones; limit sets how many\.$/
      )
    }
  })

  test('list: a cut answer to a call that already searched, one with bodies, and a site that learned its plugin ignores search say no more about it', async () => {
    const searchedRows = bigList('article', 400, { search: 'row', matched: 400 })
    const asked = relay(() => searchedRows)
    const answered = await call(openJ(asked.send), {
      action: 'content.list',
      params: { kind: 'article', search: 'row' }
    })
    assert.equal(answered.matched, 400, 'the plugin count is kept')
    assert.doesNotMatch(answered.next, /search/)

    // 25 rows with bodies are the most a body list holds, and they are cut at 8,000 characters: the list IS cut
    // (`truncated`), so the assertion below reads a real `next` — with the rows short it read nothing.
    const bodies = relay(() => bigList('article', 25, {}, 600))
    const withBodies = await call(openJ(bodies.send), {
      action: 'content.list',
      params: { kind: 'article', include_body: true }
    })
    assert.equal(withBodies.truncated?.total, 25, 'the body list was cut')
    assert.match(
      withBodies.next,
      /^Bodies of \d+ rows shown: the same call with include_body:false lists every row; offset:\d+ gives the next ones\.$/
    )
    assert.doesNotMatch(withBodies.next, /search/)

    const memory = createCallMemory({ now: () => 1_000 })
    memory.learn('j-1ibzqi', 'noListSearch')
    const learned = relay(() => bigList('article', 400))
    const closed = await call(openJ(learned.send, { memory }), plainList('article'))
    assert.equal(closed.truncated.total, 400)
    assert.doesNotMatch(closed.next, /search/)
  })

  test('budgetFor: only a plain content.list of a kind with a title carries the search sentence, and a site that cannot search does not', () => {
    const nextOf = (
      /** @type {Record<string, unknown>} */ params,
      /** @type {string} */ platform,
      /** @type {Record<string, unknown> | undefined} */ opts
    ) => budgetFor('content.list', params, platform, opts)?.next(76)
    const tail = 'gives the next ones; limit sets how many'
    for (const kind of [
      'article',
      'category',
      'tag',
      'menuItem',
      'module',
      'templateStyle',
      'language',
      'menutype',
      'banner',
      'contact',
      'newsfeed',
      'bannerClient',
      'field'
    ])
      assert.equal(
        nextOf({ kind }, 'joomla'),
        `76 rows shown: the same call with offset:76 ${tail}; ${SEARCH_SENTENCE}`,
        kind
      )
    for (const kind of [
      'user',
      'redirect',
      'extensionParams',
      'languageFilter',
      'articleAssociation',
      'menuAssociation',
      'moduleAssignment',
      'fieldValue'
    ])
      assert.equal(nextOf({ kind }, 'joomla'), `76 rows shown: the same call with offset:76 ${tail}.`, kind)
    // No kind is the platform's default: an article, a post.
    assert.match(nextOf({}, 'joomla') ?? '', /search:"/)
    assert.match(nextOf({}, 'wordpress') ?? '', /search:"/)
    assert.match(
      nextOf({ post_type: 'page', offset: 100 }, 'wordpress') ?? '',
      /^76 rows shown: .*offset:176 /
    )
    assert.doesNotMatch(nextOf({ kind: 'option' }, 'wordpress') ?? '', /search/)
    assert.doesNotMatch(nextOf({ kind: 'article', search: 'roof' }, 'joomla') ?? '', /search/)
    assert.doesNotMatch(nextOf({}, 'joomla', { search: false }) ?? '', /search/)
    assert.doesNotMatch(nextOf({}, 'wordpress', { search: false }) ?? '', /search/)
    // The body list, and the other budgets, are what they were.
    assert.doesNotMatch(budgetFor('content.list', { include_body: true }, 'joomla')?.next(5) ?? '', /search/)
    assert.match(
      budgetFor('db.dump', { table: 'wp_posts' }, 'wordpress')?.next(0) ?? '',
      /^Too large to show/
    )
  })

  test('a search-like key on a list is refused with the road to search — unless this site learned its plugin ignores it, and then the roads that work', async () => {
    const { sent, send } = relay(() => assert.fail('a refused call is never sent'))
    for (const [make, kind, label] of /** @type {const} */ ([
      [openJ, 'article', 'j-1ibzqi'],
      [wpQuiet, 'post', 'wp-dmlj6g']
    ])) {
      const args = { action: 'content.list', params: { kind, query: 'roof' } }

      const open = await call(make(send), args)

      assertHas(open, { ok: false, code: 'UNKNOWN_PARAM' }, `${kind}: refused before the relay`)
      assert.match(open.next, /search:"<part of the title>"/, kind)
      assert.equal(open.allowed.at(-1), 'search')

      const memory = createCallMemory({ now: () => 1_000 })
      memory.learn(label, 'noListSearch')
      const closed = await call(make(send, { memory }), args)

      assertHas(closed, { ok: false, code: 'UNKNOWN_PARAM' }, `${kind}: refused before the relay`)
      assert.doesNotMatch(closed.next, /search:"/, `${kind}: it was found not to be read`)
      assert.match(closed.next, /content\.read \{type:"article", locale, fields:"title,slug"\}/)
      assert.ok(!closed.allowed.includes('search'), `${kind}: ${closed.allowed}`)
    }
    assert.equal(sent.length, 0)
  })
}

// ── contract applies: revisions and evidence ─────────────────────────────────────────────────────────

const applyNoRevision = (text = 'Hotline: 1900 1234') => ({
  action: 'content.contract',
  params: { operation: 'apply', changes: { 'module-428.1': text } }
})

test('an apply with no revision, in a conversation that read none, is answered with one inspect and the values it changes', async () => {
  const { sent, send } = relay((_a, p) => (p.operation === 'inspect' ? HOME : { ok: true, ids: [428] }))

  const first = await call(joomla({ send }), applyNoRevision())

  assert.equal(first.code, 'INSPECT_FIRST')
  assert.equal(first.expected_revision, HOME.revision)
  assert.deepEqual(first.current, { 'module-428.1': 'Hotline: 8 800 550-67-90' })
  assert.ok(first.next.length <= 200)
  assert.deepEqual(
    sent.map(([, p]) => p.operation),
    ['inspect'],
    'nothing was written'
  )
})

{
  const roads = [
    {
      label: 'the receipt names afterRevision',
      applied: { ok: true, ids: [428], afterRevision: 'rev-after-apply' },
      third: 'ok',
      ops: ['inspect', 'apply', 'apply'],
      secondRevision: 'rev-after-apply'
    },
    {
      label: 'an older plugin without the field',
      applied: { ok: true, ids: [428] },
      third: 'INSPECT_FIRST',
      ops: ['inspect', 'apply', 'inspect'],
      secondRevision: undefined
    },
    {
      label: 'a refused apply never teaches a revision',
      applied: { ok: false, error: 'Content changed; inspect again', afterRevision: 'rev-x' },
      third: 'INSPECT_FIRST',
      ops: ['inspect', 'apply', 'inspect'],
      secondRevision: undefined
    }
  ]
  for (const { label, applied, third, ops, secondRevision } of roads)
    test(`an apply is sent on the revision an inspect showed, then on the afterRevision an accepted apply names — else it inspects again: ${label}`, async () => {
      const { sent, send } = relay((_a, p) => (p.operation === 'inspect' ? HOME : applied))
      const ctx = joomla({ send })
      const firstAnswer = await call(ctx, applyNoRevision('Hotline: 1900 1234')) // no revision read yet: INSPECT_FIRST
      await call(ctx, applyNoRevision('Hotline: 1900 1234')) // sent on the revision that inspect showed

      const next = await call(ctx, applyNoRevision('Hotline: 1900 5678'))

      assert.equal(firstAnswer.code, 'INSPECT_FIRST', label)
      assert.equal(next.code ?? 'ok', third, label)
      assert.deepEqual(
        sent.map(([, p]) => p.operation),
        ops,
        label
      )
      assert.deepEqual(
        applies(sent).map((p) => p.expected_revision),
        [HOME.revision, secondRevision].slice(0, applies(sent).length),
        label
      )
    })
}

const HOME_READ = (revision = 'rev-home-1') => ({
  schemaVersion: 'tracy-content/v1',
  protocol: {
    selected: 'tracy-content/v1',
    relayExtensions: [],
    cowork: { kind: 'joomla', capability: 'v1' }
  },
  site: { id: 'site-demo', defaultLocale: 'en-GB', locales: ['en-GB'] },
  contents: [
    {
      id: 'content_home',
      revision,
      type: 'page',
      blocks: [{ fields: [{ slotKey: 'module-428.1' }, { slotKey: 'module-428.0' }], items: [] }]
    }
  ]
})
const readHome = { action: 'content.read', params: { id: 'content_home' } }

test('an afterRevision from a map-only apply is not remembered — the next site-wide apply inspects first', async () => {
  // A map-only apply is checked per content: a foreign change to a content never re-read can be inside its afterRevision.
  const { send } = relay((a, p) =>
    a === 'content.read'
      ? HOME_READ()
      : p.operation === 'inspect'
        ? HOME
        : { ok: true, ids: [428], afterRevision: 'rev-after-incl-foreign-430' }
  )
  const ctx = joomla({ send })
  await call(ctx, readHome)
  await call(ctx, applyNoRevision('Hotline'))

  const second = await call(ctx, {
    action: 'content.contract',
    params: { operation: 'apply', changes: { 'module-430.0': 'Our story' } }
  })

  assert.equal(second.code, 'INSPECT_FIRST')
})

test('a bare phone becomes a tel: link and evidence is the customer’s own sentence', async () => {
  const { sent, send } = relay((_a, p) => (p.operation === 'inspect' ? HOME : { ok: true, ids: [1] }))
  const ctx = joomla({
    send,
    events: typedBy('Our new hotline is +84 909 123 456. Also rename the clients title to Clients we trust.')
  })
  await call(ctx, INSPECT_HOME)

  const answer = await call(
    ctx,
    applyContract({
      changes: { 'module-428.0': '+84 909 123 456', 'module-447.0': 'Clients we trust' }
    })
  )

  const applied = applies(sent)[0]
  assert.equal(answer.ok, true)
  assert.equal(applied.changes['module-428.0'], 'tel:+84909123456')
  assert.equal(applied.evidence['module-447.0'], 'Also rename the clients title to Clients we trust.')
  assert.equal(applied.evidence['module-428.0'], undefined, 'a slot that needs no evidence gets none')
})

test('an apply sent on afterRevision, with no inspect after the write, still gets its tel: link and evidence', async () => {
  const { sent, send } = relay((_a, p) =>
    p.operation === 'inspect' ? HOME : { ok: true, ids: [1], afterRevision: 'rev-after-apply' }
  )
  const ctx = joomla({
    send,
    events: typedBy('Our new hotline is +84 909 123 456. Also rename the clients title to Clients we trust.')
  })
  await call(ctx, INSPECT_HOME)
  await call(ctx, {
    action: 'content.contract',
    params: { operation: 'apply', changes: { 'module-447.0': 'Clients we trust' } }
  })

  const second = await call(ctx, {
    action: 'content.contract',
    params: { operation: 'apply', changes: { 'module-428.0': '+84 909 123 456' } }
  })

  const [firstApply, secondApply] = applies(sent)
  assert.equal(second.ok, true)
  assert.equal(secondApply.expected_revision, 'rev-after-apply')
  assert.equal(secondApply.changes['module-428.0'], 'tel:+84909123456')
  assert.equal(firstApply.evidence['module-447.0'], 'Also rename the clients title to Clients we trust.')
  assert.equal(inspects(sent), 1, 'no inspect between the two applies')
})

// ── content API v2: content.read ─────────────────────────────────────────────────────────────────────

const applyHotline = (text = 'Hotline: 1900 1234') => applyNoRevision(text)

test('content.read then apply — the apply carries the revisions read, and no inspect is sent', async () => {
  const { sent, send } = relay((action, p) =>
    action === 'content.read' ? HOME_READ() : p.operation === 'inspect' ? HOME : { ok: true, ids: [428] }
  )
  const ctx = joomla({ send })
  await call(ctx, readHome)

  const out = await call(ctx, applyHotline())

  const applied = applies(sent)[0]
  assert.equal(out.ok, true)
  assert.deepEqual(applied.expected_content_revisions, { content_home: 'rev-home-1' })
  assert.equal(applied.expected_revision, undefined)
  assert.equal(inspects(sent), 0)
})

{
  const cases = [
    {
      label: 'a slot the read did not show',
      before: [],
      last: {
        action: 'content.contract',
        params: { operation: 'apply', changes: { 'module-428.1': 'x', 'module-447.0': 'y' } }
      },
      applies: 0
    },
    {
      label: 'the receipt named no contentRevisions',
      before: [applyHotline('one')],
      last: applyHotline('two'),
      applies: 1
    }
  ]
  for (const { label, before, last, applies: expectedApplies } of cases)
    test(`when the map read cannot be built — a slot content.read did not show, or no contentRevisions came back — the apply goes the old road: ${label}`, async () => {
      const { sent, send } = relay((action, p) =>
        action === 'content.read' ? HOME_READ() : p.operation === 'inspect' ? HOME : { ok: true, ids: [428] }
      )
      const ctx = joomla({ send })
      await call(ctx, readHome)
      for (const step of before) await call(ctx, step)

      const out = await call(ctx, last)

      assert.equal(out.code, 'INSPECT_FIRST', label)
      assert.equal(applies(sent).length, expectedApplies, label)
    })
}

test('the receipt’s contentRevisions keep the page current — a second apply needs no read either', async () => {
  let rev = 1
  const { sent, send } = relay((action, p) => {
    if (action === 'content.read') return HOME_READ()
    if (p.operation === 'inspect') return HOME
    rev += 1
    return { ok: true, ids: [428], contentRevisions: { content_home: `rev-home-${rev}` } }
  })
  const ctx = joomla({ send })
  await call(ctx, readHome)
  await call(ctx, applyHotline('one'))

  const second = await call(ctx, applyHotline('two'))

  const [a1, a2] = applies(sent)
  assert.equal(second.ok, true)
  assert.deepEqual(a2.expected_content_revisions, { content_home: 'rev-home-2' })
  assert.notEqual(a1.request_id, a2.request_id)
  assert.equal(inspects(sent), 0)
})

const OLD_REFUSAL = {
  ok: false,
  error: 'contract_failed',
  message: 'Content changed; inspect again'
}

test('an older plugin that ignores the map is asked once more the old way — never in a loop', async () => {
  const { sent, send } = relay((action, p) => {
    if (action === 'content.read') return HOME_READ()
    if (p.operation === 'inspect') return HOME
    return p.expected_revision === HOME.revision ? { ok: true, ids: [428] } : OLD_REFUSAL
  })
  const ctx = joomla({ send })
  await call(ctx, INSPECT_HOME) // this conversation inspected earlier: the old road fills that revision
  await call(ctx, readHome)

  const out = await call(ctx, applyHotline())

  const [first, second] = applies(sent)
  assert.equal(out.ok, true)
  assert.equal(applies(sent).length, 2)
  assert.ok(first.expected_content_revisions)
  assert.deepEqual([second.expected_content_revisions, second.expected_revision], [undefined, HOME.revision])
  assert.notEqual(first.apply_id, second.apply_id)
  assert.match(out.normalized.join(' '), /older Claude Cowork plugin/)
})

test('what was learned about an older plugin sticks — the next apply after a read sends no map', async () => {
  const { sent, send } = relay((action, p) => {
    if (action === 'content.read') return HOME_READ()
    if (p.operation === 'inspect') return HOME
    return p.expected_revision === HOME.revision ? { ok: true, ids: [428] } : OLD_REFUSAL
  })
  const ctx = joomla({ send })
  await call(ctx, INSPECT_HOME)
  await call(ctx, readHome)
  await call(ctx, applyHotline()) // learns: two applies
  await call(ctx, readHome)

  await call(ctx, applyHotline('again'))

  assert.equal(applies(sent)[2]?.expected_content_revisions, undefined)
})

test('an older plugin and no revision this conversation read — the fallback is INSPECT_FIRST, once', async () => {
  const { sent, send } = relay((action, p) =>
    action === 'content.read' ? HOME_READ() : p.operation === 'inspect' ? HOME : OLD_REFUSAL
  )
  const ctx = joomla({ send })
  await call(ctx, readHome)

  const out = await call(ctx, applyHotline())

  assert.deepEqual([out.code, out.expected_revision], ['INSPECT_FIRST', HOME.revision])
  assert.equal(applies(sent).length, 1)
  assert.match(out.normalized.join(' '), /older Claude Cowork plugin/)
})

test('a new plugin’s REVISION_STALE is its answer — never the older-plugin fallback', async () => {
  const stale = {
    ok: false,
    error: 'contract_failed',
    message: 'Content changed; inspect again',
    errors: [
      {
        code: 'REVISION_STALE',
        message: 'stale',
        severity: 'recoverable',
        field: { slotKey: 'module-428.1', contentId: 'content_home' },
        current: 'rev-home-9'
      }
    ]
  }
  const { sent, send } = relay((action, p) =>
    action === 'content.read' ? HOME_READ() : p.operation === 'inspect' ? HOME : stale
  )
  const ctx = joomla({ send })
  await call(ctx, readHome)

  const out = await call(ctx, applyHotline())

  assert.equal(applies(sent).length, 1)
  assert.deepEqual(out.errors, stale.errors)
  assert.match(String(out.next), /content\.read/)
  assert.equal(inspects(sent), 0)
})

// ── content API v2: describe, listings, budgets ──────────────────────────────────────────────────────

const DESCRIBE = {
  schemaVersion: 'tracy-content-describe/v1',
  site: {
    id: 'site-demo',
    name: 'Demo',
    url: 'https://demo.invalid',
    defaultLocale: 'en-GB',
    locales: ['en-GB', 'vi-VN']
  },
  protocol: {
    selected: 'tracy-content/v1',
    relayExtensions: [],
    cowork: { kind: 'joomla', capability: 'v1' }
  },
  types: [{ type: 'page', count: 7 }],
  blockKinds: [],
  guidance: 'Words change by slot.'
}
/** @param {number} n @param {number} [size] */
const envelope = (n, size = 10) => ({
  schemaVersion: 'tracy-content/v1',
  site: { id: 'site-demo', defaultLocale: 'en-GB', locales: ['en-GB'] },
  pagination: { limit: n, nextCursor: 'c-after', total: n + 5 },
  contents: Array.from({ length: n }, (_, i) => ({
    id: `content-${i}`,
    type: 'page',
    title: 'x'.repeat(size)
  }))
})
const listPages = { action: 'content.read', params: { type: 'page' } }
const describeSite = { action: 'content.read', params: { describe: true } }

test('JIT: a content.read listing before any describe in this conversation points at {describe:true}', async () => {
  const { send } = relay(() => envelope(2))

  const out = await call(joomla({ send }), listPages)

  assert.deepEqual([out.next.action, out.next.params], ['content.read', { describe: true }])
  assert.ok(out.next.why.length <= 200)
  assert.deepEqual(out.contents, envelope(2).contents, 'the answer itself is untouched')
})

{
  /** @param {any} out */
  const nextOf = (out) => (typeof out.next === 'string' ? 'a string' : out.next?.params)
  const cases = [
    {
      label: 'describe → the pages in the default language',
      answer: DESCRIBE,
      ctx: {},
      args: describeSite,
      next: { type: 'page', locale: 'en-GB' }
    },
    {
      label: 'an old plugin’s describe → the type, no language invented',
      answer: { ...DESCRIBE, site: { id: 's' }, types: [{ type: 'page', count: null }] },
      ctx: {},
      args: describeSite,
      next: { type: 'page' }
    },
    {
      label: 'a refusal keeps its own next',
      answer: { error: { code: 'CONTENT_NOT_FOUND', message: 'no' } },
      ctx: {},
      args: { action: 'content.read', params: { id: 'x' } },
      next: 'a string'
    },
    {
      label: 'no conversation remembers nothing, so it is never nudged',
      answer: envelope(1),
      ctx: { sessionId: null },
      args: { action: 'content.read', params: {} },
      next: undefined
    }
  ]
  for (const { label, answer, ctx, args, next } of cases)
    test(`JIT: what the next points at after describe, a refusal or a call with no conversation: ${label}`, async () => {
      const { send } = relay(() => answer)

      const out = await call(joomla({ send, ...ctx }), args)

      assert.deepEqual(nextOf(out), next, label)
    })
}

{
  const cases = [
    { label: 'the same conversation', between: () => {}, session: 'session-a', nudged: false },
    {
      label: 'after a write made snapshots stale',
      between: (/** @type {any} */ ctx) => ctx.memory.invalidateSite(ctx.label),
      session: 'session-a',
      nudged: false
    },
    {
      label: 'another conversation on the site',
      between: () => {},
      session: 'session-b',
      nudged: true
    }
  ]
  for (const { label, between, session, nudged } of cases)
    test(`JIT: once described, a conversation’s listings are not nudged again — a write does not change describe: ${label}`, async () => {
      const { send } = relay((_a, params) => (params.describe ? DESCRIBE : envelope(2)))
      const ctx = joomla({ send })
      await call(ctx, describeSite)
      between(ctx)

      const listed = await call({ ...ctx, sessionId: session }, listPages)

      assert.equal(listed.next !== undefined, nudged, label)
    })
}

test('content.read: a listing over 24,000 chars loses whole contents from its end and says how to get them', async () => {
  const big = envelope(40, 1_000)
  const { send } = relay(() => big)

  const out = await call(joomla({ send }), {
    action: 'content.read',
    params: { type: 'page', limit: 40 }
  })

  const shown = out.contents.length
  assert.ok(JSON.stringify(out).length <= 24_000)
  assert.ok(shown > 0 && shown < 40)
  assert.deepEqual([out.truncated, out.truncatedCount], [true, 40 - shown])
  assert.deepEqual(out.contents, big.contents.slice(0, shown), 'whole records, in order, from the head')
  assert.deepEqual(out.pagination, big.pagination, 'the plugin’s own fields are not rewritten')
  assert.match(out.next, new RegExp(`${40 - shown} items were dropped`))
  assert.match(out.next, new RegExp(`limit:${shown}\\b`))
  assert.ok(out.next.length <= 200)
})

{
  const small = envelope(3)
  const cases = [
    { label: 'a detail of 60,000 chars', args: { id: 'content-0' }, answer: envelope(1, 60_000) },
    {
      label: 'a describe with 40,000 chars of guidance',
      args: { describe: true },
      answer: { ...DESCRIBE, guidance: 'g'.repeat(40_000) }
    },
    { label: 'a small listing', args: { type: 'page' }, answer: small }
  ]
  for (const { label, args, answer } of cases)
    test(`content.read: a detail, a describe and a small listing come back whole, however large: ${label}`, async () => {
      const { send } = relay(() => answer)

      const out = await call(joomla({ send, sessionId: null }), {
        action: 'content.read',
        params: args
      })

      assert.deepEqual({ ...out, next: undefined }, { ...answer, next: undefined }, label)
      assert.equal(out.truncated, undefined, label)
    })
}

test('content.read view=pages: a long page list is cut to the listing budget and points at url', () => {
  const pages = Array.from({ length: 400 }, (_, i) => ({
    id: `c-${i}`,
    type: 'page',
    title: `Page ${i} ${'x'.repeat(60)}`,
    url: `https://lantern.example/page-${i}`,
    path: `/page-${i}`,
    locale: 'en-GB',
    translationGroupId: null,
    status: 'published'
  }))
  const answer = {
    schemaVersion: 'tracy-content-pages/v1',
    site: { url: 'https://lantern.example' },
    pages,
    truncated: false
  }

  const cut = /** @type {any} */ (cutContentList(answer, { view: 'pages' }))

  assert.ok(JSON.stringify(cut).length <= CONTENT_READ_LIST_CHARS)
  assert.deepEqual([cut.truncated, cut.truncatedCount], [true, 400 - cut.pages.length])
  assert.deepEqual(cut.pages[0], pages[0])
  assert.equal(cut.next.params.view, 'pages')
  assert.ok('url' in cut.next.params)
  assert.match(cut.next.why, /locale/)
})

// ── B7: a page list too long for the budget shows the site's own language first ─────────────────────────

/** A row of the pages view. */
const pageRow = (/** @type {string} */ locale, /** @type {number} */ i) => ({
  id: `c-${locale}-${i}`,
  type: 'page',
  title: `Page ${locale} ${i} ${'x'.repeat(60)}`,
  url: `https://lantern.example/${locale}/page-${i}`,
  path: `/${locale}/page-${i}`,
  locale,
  translationGroupId: null,
  status: 'published'
})
const OTHER_LOCALES = ['de-DE', 'fr-FR', 'ru-RU', 'ja']
/** A multilingual site whose relay lists every other language BEFORE the default one, as ids happen to sort. */
const manyLanguages = (/** @type {number} */ own = 40, /** @type {number} */ each = 100) => {
  const others = OTHER_LOCALES.flatMap((locale) => Array.from({ length: each }, (_, i) => pageRow(locale, i)))
  const ours = Array.from({ length: own }, (_, i) => pageRow('en-GB', i))
  return {
    schemaVersion: 'tracy-content-pages/v1',
    site: { url: 'https://lantern.example', defaultLocale: 'en-GB', locales: ['en-GB', ...OTHER_LOCALES] },
    pages: [...others, ...ours],
    truncated: false
  }
}

test('🔒 content.read view=pages on a site in several languages, too long for the budget: the default language’s pages are what is shown, the rest counted', () => {
  // Before: the head of the relay's order — 300+ pages of other languages and none of the customer's own — and
  // "N more pages not shown", so the customer's own page was in the part never shown.
  const answer = manyLanguages()
  const cut = /** @type {any} */ (cutContentList(answer, { view: 'pages' }))

  assert.ok(JSON.stringify(cut).length <= CONTENT_READ_LIST_CHARS)
  assert.equal(cut.truncated, true)
  assert.equal(cut.pages.length, 40, 'every page in the default language fits and is shown')
  assert.ok(cut.pages.every((/** @type {any} */ p) => p.locale === 'en-GB'))
  assert.equal(
    cut.truncatedCount,
    answer.pages.length - cut.pages.length,
    'what is not shown is counted, other languages included'
  )
  assert.match(cut.next.why, /400 more pages not shown/)
  assert.match(cut.next.why, /other languages/)
  assert.match(cut.next.why, /\{view:"pages", locale\}/)
  assert.equal(cut.next.params.view, 'pages')
  assert.ok('url' in cut.next.params)
})

test('B7: when the default language alone is too long, its head is shown; pages in no language and in "all" stay with it', () => {
  const answer = manyLanguages(300, 20)
  // pages that belong to every language: Joomla's `*`, and a row that names none
  answer.pages.push(
    { ...pageRow('*', 1) },
    /** @type {any} */ ({ ...pageRow('en-GB', 999), locale: undefined })
  )
  const cut = /** @type {any} */ (cutContentList(answer, { view: 'pages' }))

  assert.ok(JSON.stringify(cut).length <= CONTENT_READ_LIST_CHARS)
  assert.ok(cut.pages.length >= 20 && cut.pages.length < 302)
  assert.ok(
    cut.pages.every(
      (/** @type {any} */ p) => p.locale === undefined || p.locale === '*' || p.locale === 'en-GB'
    ),
    'no page of another language in the head'
  )
  assert.deepEqual(
    cut.pages[0],
    answer.pages.find((/** @type {any} */ p) => p.locale === 'en-GB')
  )
  assert.equal(cut.truncatedCount, answer.pages.length - cut.pages.length)
})

test('B7: it only ever changes WHICH pages the head holds — a site with one language, no known default, or none of its own pages is cut as before', () => {
  // one language (the existing behaviour, every page the same locale)
  const one = {
    schemaVersion: 'tracy-content-pages/v1',
    site: { url: 'https://lantern.example', defaultLocale: 'en-GB', locales: ['en-GB'] },
    pages: Array.from({ length: 400 }, (_, i) => pageRow('en-GB', i)),
    truncated: false
  }
  const cutOne = /** @type {any} */ (cutContentList(one, { view: 'pages' }))
  assert.deepEqual(cutOne.pages, one.pages.slice(0, cutOne.pages.length))
  // several languages but no default named: the head of the list, whatever it holds
  const nameless = manyLanguages()
  delete (/** @type {any} */ (nameless.site).defaultLocale)
  const cutNameless = /** @type {any} */ (cutContentList(nameless, { view: 'pages' }))
  assert.deepEqual(cutNameless.pages, nameless.pages.slice(0, cutNameless.pages.length))
  // a default language none of the listed pages is in: nothing to narrow to
  const none = manyLanguages(0)
  const cutNone = /** @type {any} */ (cutContentList(none, { view: 'pages' }))
  assert.deepEqual(cutNone.pages, none.pages.slice(0, cutNone.pages.length))
  assert.doesNotMatch(cutNone.next.why, /other languages/)
})

test('B7: a call that named a language keeps the relay’s list of that language — narrowing to the site default is for a call that named none', () => {
  // `{view:"pages", locale:"fr-FR"}` is the way the cut's own `next` points at. The relay answers that
  // language's pages (and the ones that belong to every language): narrowing THAT list to the default
  // language would leave the `*` page alone at the head and drop the pages the call asked for.
  const answer = {
    ...manyLanguages(0, 0),
    pages: [...Array.from({ length: 300 }, (_, i) => pageRow('fr-FR', i)), pageRow('*', 1)]
  }
  const asked = /** @type {any} */ (cutContentList(answer, { view: 'pages', locale: 'fr-FR' }))
  assert.ok(JSON.stringify(asked).length <= CONTENT_READ_LIST_CHARS)
  assert.ok(asked.pages.length > 20, `the asked language fills the head: ${asked.pages.length}`)
  assert.deepEqual(asked.pages, answer.pages.slice(0, asked.pages.length), 'the relay’s own order')
  assert.ok(asked.pages.every((/** @type {any} */ p) => p.locale === 'fr-FR'))
  assert.equal(asked.truncatedCount, answer.pages.length - asked.pages.length)
  assert.doesNotMatch(asked.next.why, /other languages/)
  // A blank or absent `locale` names none: the narrowing stays for those.
  for (const params of [{ view: 'pages' }, { view: 'pages', locale: '' }, { view: 'pages', locale: '  ' }]) {
    const full = manyLanguages()
    const cut = /** @type {any} */ (cutContentList(full, params))
    assert.ok(
      cut.pages.every((/** @type {any} */ p) => p.locale === 'en-GB'),
      JSON.stringify(params)
    )
    assert.match(cut.next.why, /other languages/)
  }
})

test('B7: a list that fits the budget, and a single link, are returned as they came — narrowing is for a cut only', () => {
  const small = manyLanguages(3, 2)
  assert.equal(cutContentList(small, { view: 'pages' }), small)
  const linked = { ...manyLanguages(), link: '/en-GB/page-3' }
  assert.equal(cutContentList(linked, { view: 'pages', url: '/en-GB/page-3' }), linked)
})

test('withReadBudget: a listing and a single content carry their byte budget; the model’s own and the special reads stand', () => {
  assert.deepEqual(withReadBudget({ type: 'article' }), {
    type: 'article',
    maxBytes: READ_BUDGET_LIST
  })
  assert.deepEqual(withReadBudget({ id: 'content_1' }), {
    id: 'content_1',
    maxBytes: READ_BUDGET_ONE
  })
  assert.deepEqual(withReadBudget({ type: 'page', maxBytes: 8192 }), {
    type: 'page',
    maxBytes: 8192
  })
})

{
  for (const p of [{ describe: true }, { view: 'pages' }, { changedSince: 'cv1.x' }])
    test(`withReadBudget: a listing and a single content carry their byte budget; the model’s own and the special reads stand: ${rowName(p)}`, () => {
      assert.deepEqual(withReadBudget(p), p)
    })
}

test('content.read: the relay call carries the byte budget', async () => {
  const { sent, send } = relay(() => ({
    schemaVersion: 'tracy-content/v1',
    contents: [],
    pagination: { limit: 20, nextCursor: null, total: 0, budget: 32768 }
  }))

  await call(wordpress({ send }), { action: 'content.read', params: { type: 'article' } })

  assert.equal(sent[0][1].maxBytes, READ_BUDGET_LIST)
})

{
  const contents = Array.from({ length: 60 }, (_, i) => ({
    id: `content_${i}`,
    title: 'x'.repeat(900)
  }))
  const budgeted = {
    schemaVersion: 'tracy-content/v1',
    pagination: { limit: 100, nextCursor: 'c2', total: 300, budget: 32768 },
    contents
  }
  const unbudgeted = { ...budgeted, pagination: { limit: 100, nextCursor: 'c2', total: 300 } }
  const oneLink = {
    schemaVersion: 'tracy-content-pages/v1',
    link: '/page-3',
    pages: [{ id: 'c-3', url: 'https://lantern.example/page-3' }]
  }
  const cases = [
    { label: 'unbudgeted', answer: unbudgeted, params: { type: 'article' }, whole: false },
    { label: 'budgeted by the plugin', answer: budgeted, params: { type: 'article' }, whole: true },
    {
      label: 'one link of the pages view',
      answer: oneLink,
      params: { view: 'pages', url: '/page-3' },
      whole: true
    }
  ]
  for (const { label, answer, params, whole } of cases)
    test(`cutContentList: an unbudgeted listing is cut here; a one-link view or a plugin-budgeted answer is returned as it came: ${label}`, () => {
      assert.equal(cutContentList(answer, params) === answer, whole, label)
    })
}

// ── tiers, receipts ──────────────────────────────────────────────────────────────────────────────────

const deletePost = { action: 'content.delete', params: { kind: 'post', id: 42, confirm: true } }
const deleteResult = { ok: true, kind: 'post', id: 42, trashed: true }

test('media.delete previews first, then deletes once only after the door confirmation is answered', async () => {
  const { sent, send } = relay((action, params) =>
    params.dry_run
      ? {
          ok: true,
          deleted: {
            id: 42,
            files: [{ path: 'wp-content/uploads/hero.jpg', size: 1234, sha256: 'abc' }]
          },
          totalBytes: 1234,
          undoCopyUnderCap: true,
          usedIn: [
            { type: 'post', id: 3, postType: 'page', title: 'Home' },
            { type: 'option', key: 'site_logo' }
          ],
          usedInScope: 'the pages checked'
        }
      : {
          ok: true,
          deleted: {
            id: 42,
            files: [{ path: 'wp-content/uploads/hero.jpg', size: 1234, sha256: 'abc' }]
          },
          storageDeleted: true,
          filesLeft: [],
          usedIn: [{ type: 'post', id: 3, postType: 'page', title: 'Home' }],
          usedInScope: 'the pages checked',
          undo: 'apply.revert media-del-1',
          cdnCache: 'may still serve'
        }
  )
  const ctx = wordpress({ send })
  const request = { action: 'media.delete', params: { apply_id: 'media-del-1', id: 42 } }
  const asked = await call(ctx, request)

  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.deepEqual(
    sent.map(([action, params]) => [action, params.dry_run]),
    [['media.delete', true]]
  )
  const question = asked.ask.questions[0].question
  assert.match(question, /hero\.jpg/)
  assert.match(question, /1 file.*1,234 bytes/)
  assert.match(question, /Total size: 1,234 bytes/)
  assert.match(question, /Home/)
  assert.match(question, /option site_logo/)
  assert.match(question, /WordPress attachment/)
  assert.match(question, /site-wide/)

  const q = asked.ask.questions[0]
  ctx.memory.customerAnswered('session-w', asked.ask, {
    answers: [{ id: q.id, selected: [q.options[0].label] }]
  })
  const deleted = await call(ctx, { ...request, params: { ...request.params, confirm: true } })

  assert.equal(deleted.ok, true)
  assert.deepEqual(
    sent.map(([action, params]) => [action, params.dry_run]),
    [
      ['media.delete', true],
      ['media.delete', undefined]
    ]
  )
  assert.match(deleted.next, /WordPress attachment record was removed and its stored files were deleted/)
  assert.match(deleted.next, /CDN or browser may still serve a cached copy/)
  assert.match(deleted.next, /apply\.revert media-del-1/)
  assert.doesNotMatch(deleted.next, /undoUntil|deadline|expiry/i)
  assert.doesNotMatch(deleted.next, /The old URL no longer works\./)
})

test('media.delete dry_run remains a preview even when confirm is present', async () => {
  const { sent, send } = relay((action, params) => ({
    ok: true,
    deleted: { id: params.id, files: [{ path: `uploads/${params.id}.jpg`, size: 10, sha256: 'abc' }] },
    totalBytes: 10,
    undoCopyUnderCap: true,
    usedIn: [],
    usedInScope: 'checked pages'
  }))
  const ctx = wordpress({ send })
  const first = await call(ctx, {
    action: 'media.delete',
    params: { apply_id: 'preview-only-1', id: 42, dry_run: true }
  })
  assert.equal(first.ok, true, JSON.stringify(first))
  assert.equal(first.ask, undefined)
  const generationBeforeConfirmedPreview = ctx.memory.generationOf(ctx.label)

  const confirmedPreview = await call(ctx, {
    action: 'media.delete',
    params: { apply_id: 'preview-only-1', id: 42, dry_run: true, confirm: true }
  })
  assert.equal(confirmedPreview.ok, true)
  assert.equal(confirmedPreview.ask, undefined)
  assert.match(confirmedPreview.next, /preview only; nothing was deleted/i)
  assert.match(confirmedPreview.next, /show the customer/i)
  assert.match(confirmedPreview.next, /uploads\/42\.jpg/)
  assert.match(confirmedPreview.next, /Total size: 10 bytes/)
  assert.match(confirmedPreview.next, /not found in checked pages/)
  assert.match(confirmedPreview.next, /ask.*confirm/i)
  assert.doesNotMatch(confirmedPreview.next, /receipt|landed|keep.*apply_id|apply_id.*undo/i)
  assert.equal(ctx.memory.generationOf(ctx.label), generationBeforeConfirmedPreview)
  assert.deepEqual(sent, [
    ['media.delete', { apply_id: 'preview-only-1', id: 42, dry_run: true }],
    ['media.delete', { apply_id: 'preview-only-1', id: 42, dry_run: true }]
  ])
})

test('a preview-only media.delete exchange cannot confirm a different attachment', async () => {
  const { sent, send } = relay((action, params) => ({
    ok: true,
    deleted: { id: params.id, files: [{ path: `uploads/${params.id}.jpg`, size: 10, sha256: 'abc' }] },
    totalBytes: 10,
    undoCopyUnderCap: true,
    usedIn: [],
    usedInScope: 'checked pages'
  }))
  const ctx = wordpress({ send })
  const preview = await call(ctx, {
    action: 'media.delete',
    params: { apply_id: 'preview-only-2', id: 42, dry_run: true }
  })
  assert.equal(preview.ask, undefined)

  const otherAttachment = await call(ctx, {
    action: 'media.delete',
    params: { apply_id: 'preview-only-2', id: 43, confirm: true }
  })
  assert.equal(otherAttachment.code, 'CONFIRM_FIRST')
  assert.match(otherAttachment.ask.questions[0].question, /attachment id 43/)
  assert.deepEqual(sent, [
    ['media.delete', { apply_id: 'preview-only-2', id: 42, dry_run: true }],
    ['media.delete', { apply_id: 'preview-only-2', id: 43, dry_run: true }]
  ])
})

test('media.delete with storageDeleted:false lists filesLeft and never claims storage or URL removal', async () => {
  const { sent, send } = relay((action, params) =>
    params.dry_run
      ? {
          ok: true,
          deleted: { path: 'legacy.jpg', files: [{ path: 'images/legacy.jpg', size: 80, sha256: 'def' }] },
          totalBytes: 80,
          undoCopyUnderCap: true,
          usedIn: [],
          usedInScope: 'all checked Joomla references'
        }
      : {
          ok: true,
          deleted: { path: 'legacy.jpg', files: [{ path: 'images/legacy.jpg', size: 80, sha256: 'def' }] },
          storageDeleted: false,
          filesLeft: ['images/legacy.jpg'],
          usedIn: [],
          usedInScope: 'all checked Joomla references',
          undo: 'apply.revert media-del-jo'
        }
  )
  const ctx = joomla({ send, facts: { platform: 'joomla', sealed: false } })
  const request = { action: 'media.delete', params: { apply_id: 'media-del-jo', path: 'legacy.jpg' } }
  const asked = await call(ctx, request)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.match(asked.ask.questions[0].question, /not found in all checked Joomla references/)
  assert.match(asked.ask.questions[0].question, /site-wide/)
  assert.match(asked.ask.questions[0].question, /file under images\//)
  assert.doesNotMatch(asked.ask.questions[0].question, /media library record/i)
  assert.match(asked.ask.questions[0].question, /Total size: 80 bytes/)
  const q = asked.ask.questions[0]
  ctx.memory.customerAnswered(ctx.sessionId, asked.ask, {
    answers: [{ id: q.id, selected: [q.options[0].label] }]
  })
  const result = await call(ctx, { ...request, params: { ...request.params, confirm: true } })
  assert.equal(result.ok, true)
  assert.match(result.next, /Joomla media file under images\/ was not confirmed deleted/)
  assert.match(result.next, /Files still present: images\/legacy\.jpg/)
  assert.match(result.next, /may still serve a cached copy/)
  assert.match(result.next, /apply\.revert media-del-jo/)
  assert.doesNotMatch(result.next, /undoUntil|deadline|expiry/i)
  assert.equal(
    sent.filter(([action, params]) => action === 'media.delete' && params.dry_run !== true).length,
    1
  )
})

test('media.delete refuses before confirmation when dry run exceeds undo-copy cap', async () => {
  const { sent, send } = relay(() => ({
    ok: true,
    deleted: { path: 'large.jpg', files: [{ path: 'images/large.jpg', size: 9_000_000, sha256: 'abc' }] },
    totalBytes: 9_000_000,
    undoCopyUnderCap: false,
    usedIn: [],
    usedInScope: 'checked Joomla references'
  }))
  const out = await call(joomla({ send, facts: { platform: 'joomla', sealed: false } }), {
    action: 'media.delete',
    params: { apply_id: 'media-large', path: 'large.jpg' }
  })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'too_large')
  assert.match(out.next, /9,000,000 bytes/)
  assert.match(out.next, /nothing was deleted/)
  assert.match(out.next, /cannot be deleted through Tracy with an undo copy/)
  assert.equal(out.ask, undefined)
  assert.deepEqual(sent, [['media.delete', { apply_id: 'media-large', path: 'large.jpg', dry_run: true }]])
})

test('media.delete on an old Claude Cowork plugin reports its refusal and never falls back', async () => {
  const { sent, send } = relay(() => ({
    ok: false,
    error: 'bad_action',
    message: 'unknown action: media.delete'
  }))
  const out = await call(wordpress({ send }), {
    action: 'media.delete',
    params: { apply_id: 'media-old-plugin', id: 42 }
  })
  assert.equal(out.ok, false)
  assert.match(out.next, /Claude Cowork plugin does not support deleting pictures yet; it needs updating/)
  assert.match(out.next, /report this refusal/i)
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0], ['media.delete', { apply_id: 'media-old-plugin', id: 42, dry_run: true }])
})

test('tiers: a destructive call is refused CONFIRM_FIRST — nothing sent, the model’s own confirm:true is no answer', async () => {
  const { sent, send } = relay(() => deleteResult)

  const first = await call(wordpress({ send }), deletePost)

  assert.deepEqual([first.code, first.tier, sent.length], ['CONFIRM_FIRST', 'destructive', 0])
  assert.match(first.next, /ask_user_question/)
})

test('tiers: after the customer answered, the call runs once without confirm; the next message does not unlock it again', async () => {
  const { sent, send } = relay(() => deleteResult)
  const ctx = wordpress({ send })
  const ran = await runSiteCall({ ...ctx, plan: await armed(ctx, deletePost) })
  ctx.memory.newTurn('session-w') // "thanks!"

  const after = await call(ctx, deletePost)

  assert.equal(/** @type {any} */ (ran).ok, true)
  assert.equal('confirm' in sent[0][1], false, 'confirm is Tracy’s own parameter')
  assert.equal(after.code, 'CONFIRM_FIRST', 'nothing was asked, so nothing was answered')
  assert.equal(sent.length, 1)
})

// A question the agent wrote itself opens no delete: only the door's own question, answered after its refusal, does.
const FOUR_TITLE = 'Four common mistakes in heavy machine foundation design'
/** @param {string} question @param {string} label @param {string} [other] */
const agentCard = (question, label, other = 'Để nguyên, không xoá') => ({
  args: {
    questions: [
      {
        id: 'confirm_delete',
        header: 'Xác nhận xoá',
        question,
        options: [{ label }, { label: other }]
      }
    ]
  },
  value: { answers: [{ id: 'confirm_delete', selected: [label] }] }
})

test('🔒 tiers: a question the agent wrote opens no delete, whatever it names and whatever the customer answered — the door asks its own question once', async () => {
  const cases = [
    // it names THIS post and the customer said yes: still no agreement the door recorded
    agentCard(
      `Bài tin "${FOUR_TITLE}" đang được công khai trên website. Mình xoá nó nhé?`,
      'Xoá bài này (Khuyến nghị)'
    ),
    // it names another post
    agentCard(
      `Xoá bài "500,000 work hours without an incident in Kaluga" nhé?`,
      'Có, xoá đi',
      'Không, giữ lại'
    ),
    // the customer said no
    agentCard(
      `Bài tin "${FOUR_TITLE}" đang được công khai trên website. Mình xoá nó nhé?`,
      'Để nguyên, không xoá',
      'Xoá bài này'
    ),
    // it names the post only by "this one"
    agentCard('Mình xoá bài này nhé?', 'Có, xoá đi', 'Không, giữ lại')
  ]
  for (const card of cases) {
    const { sent, send } = relay(() => ({ ok: true, kind: 'post', id: 26, key: null }))
    const ctx = wordpress({ send, facts: { platform: 'wordpress' } })
    ctx.memory.newTurn('session-w')
    ctx.memory.customerAnswered('session-w', card.args, card.value)
    const out = /** @type {any} */ (
      await runSiteCall({
        ...ctx,
        plan: plan({ action: 'content.delete', params: { kind: 'post', id: 26, confirm: true } })
      })
    )
    assert.equal(out.code, 'CONFIRM_FIRST', card.args.questions[0].question)
    assert.equal(sent.filter(([action]) => action === 'content.delete').length, 0)
    // The door's own question, answered after its refusal, opens the same call once.
    const [q] = out.ask.questions
    ctx.memory.customerAnswered('session-w', out.ask, {
      answers: [{ id: q.id, selected: [q.options[0].label] }]
    })
    const ok = /** @type {any} */ (
      await runSiteCall({
        ...ctx,
        plan: plan({ action: 'content.delete', params: { kind: 'post', id: 26, confirm: true } })
      })
    )
    assert.equal(ok.ok, true)
    assert.ok(ok.normalized.includes('the customer confirmed it'))
    assert.equal(sent.filter(([action]) => action === 'content.delete').length, 1)
  }
})

test('🔒 tiers: Joomla — a delete the customer confirmed gets an apply_id of Tracy’s own, so the component never answers "apply_id required" after the yes', async () => {
  const { sent, send } = relay((action, params) => ({ ok: true, kind: 'article', id: params.id }))
  const ctx = joomla({ send, facts: { platform: 'joomla', sealed: false } })
  ctx.memory.newTurn('session-a', '{"pick":…,"say":"Xoá bài tin này đi"}')
  const refused = /** @type {any} */ (
    await runSiteCall({
      ...ctx,
      plan: plan({ action: 'content.delete', params: { kind: 'article', id: 550 } })
    })
  )
  assert.equal(refused.code, 'CONFIRM_FIRST')
  const [q] = refused.ask.questions
  ctx.memory.customerAnswered('session-a', refused.ask, {
    answers: [{ id: q.id, selected: [q.options[0].label] }]
  })
  const ok = /** @type {any} */ (
    await runSiteCall({
      ...ctx,
      plan: plan({ action: 'content.delete', params: { kind: 'article', id: 550, confirm: true } })
    })
  )
  assert.equal(ok.ok, true, JSON.stringify(ok).slice(0, 300))
  const [, deleted] = /** @type {[string, Record<string, any>]} */ (
    sent.find(([action]) => action === 'content.delete')
  )
  assert.match(deleted.apply_id, /^del-/)
  assert.equal(sent.filter(([action]) => action === 'content.delete').length, 1)
})

test('🔒 tiers: the confirmation is keyed on what the delete does, not on the name its receipt goes by', async () => {
  const { sent, send } = relay(() => ({ ok: true, kind: 'article', id: 550 }))
  const ctx = joomla({ send, facts: { platform: 'joomla', sealed: false } })
  ctx.memory.newTurn('session-a')
  const refused = /** @type {any} */ (
    await runSiteCall({
      ...ctx,
      plan: plan({
        action: 'content.delete',
        params: { kind: 'article', id: 550, apply_id: 'del-news-550' }
      })
    })
  )
  assert.equal(refused.code, 'CONFIRM_FIRST')
  const [q] = refused.ask.questions
  ctx.memory.customerAnswered('session-a', refused.ask, {
    answers: [{ id: q.id, selected: [q.options[0].label] }]
  })
  // The resend carried ANOTHER apply_id and must not be asked again.
  const ok = /** @type {any} */ (
    await runSiteCall({
      ...ctx,
      plan: plan({
        action: 'content.delete',
        params: { kind: 'article', id: 550, apply_id: 'del-zavolzhye2-news', confirm: true }
      })
    })
  )
  assert.equal(ok.ok, true, JSON.stringify(ok).slice(0, 300))
  assert.equal(sent.length, 1)
  assert.equal(sent[0][1].apply_id, 'del-zavolzhye2-news', 'the name the model gave is kept')
})

test('tiers: a mutating call is never asked to confirm, and confirm:true on it is dropped, not relayed', async () => {
  const { sent, send } = relay(() => ({ ok: true, kind: 'post', id: 42 }))

  const answer = await call(wpQuiet(send), {
    action: 'content.update',
    params: { kind: 'post', id: 42, fields: { post_title: 'T' }, confirm: true }
  })

  assert.equal(answer.ok, true)
  assert.equal('confirm' in sent[0][1], false)
})

test('the receipt next is one short line that keeps a several-item job going', () => {
  assert.ok(WRITE_RECEIPT_NEXT.length <= 200)
  assert.match(WRITE_RECEIPT_NEXT, /When every change asked is made/, 'a several-item job keeps going')
})

{
  const written = {
    ok: true,
    kind: 'post',
    id: 42,
    verified: { chars_sent: 10, chars_stored: 10 }
  }
  const cases =
    /** @type {Array<[string, Record<string, unknown>, Record<string, unknown>, string | undefined]>} */ ([
      ['content.update', written, { kind: 'post', id: 42 }, WRITE_RECEIPT_NEXT],
      ['content.contract', { ok: true, ids: [441] }, { operation: 'apply' }, WRITE_RECEIPT_NEXT],
      ['content.contract', { ok: true }, { operation: 'inspect' }, undefined],
      ['content.replace', { ok: true }, { dryRun: true }, undefined],
      ['page.text', { ok: true, text: 'x' }, {}, undefined],
      ['content.update', { ok: false, code: 'BODY_SHRINK' }, {}, undefined],
      ['content.update', { ok: true, next: 'own' }, {}, 'own']
    ])
  for (const [action, answer, params, next] of cases)
    test(`withReceipt: a write that went through says it is the receipt; reads, dry runs, refusals and own nexts do not change: ${rowName(action)}`, () => {
      assert.equal(
        /** @type {any} */ (withReceipt(answer, { action, params })).next,
        next,
        `${action} ${JSON.stringify(answer)}`
      )
    })
}

{
  const same = /** @type {any} */ (
    withNext(sameCallRefused({ code: 'bad_params', error: '', next: null }, { action: 'content.list' }))
  )
  const unknown = /** @type {any} */ (withNext(outcomeUnknownAnswer('media.upload', {}, lost())))

  for (const next of [same.next, unknown.next])
    test(`fallback nexts never ask for the same call again or say nothing was written: ${rowName(next)}`, () => {
      assert.doesNotMatch(next, /\bretry\b|\bsame call (?:once more|again)\b/i)
      assert.doesNotMatch(next, /nothing (?:from this call )?was written/i)
      assert.ok(next.length <= 200)
    })
}

{
  const cases = [
    {
      label: 'two receipts',
      receipts: ['hero-copy', 'footer-phone'],
      candidates: ['hero-copy', 'footer-phone'],
      next: /"hero-copy", "footer-phone" \(newest last\)/
    },
    {
      label: 'no write in this conversation',
      receipts: [],
      candidates: [],
      next: /never guess an id/
    }
  ]
  for (const { label, receipts, candidates, next } of cases)
    test(`apply.revert with no apply_id is refused before the relay — it lists this conversation’s receipts, or says never to guess: ${label}`, async () => {
      const { sent, send } = relay(() => ({ ok: true }))
      const ctx = openJ(send)
      for (const applyId of receipts) ctx.memory.rememberWrite('session-a', 'j-1ibzqi', { applyId, ok: true })

      const answer = await call(ctx, { action: 'apply.revert', params: {} })

      assert.equal(answer.code, 'ADDRESS_MISSING', label)
      assert.deepEqual(answer.candidates, candidates, label)
      assert.match(answer.next, next, label)
      assert.equal(sent.length, 0, label)
    })
}

// ── W2: a WordPress body by its blocks ───────────────────────────────────────────────────────────────

const para = (/** @type {string} */ words) => `<!-- wp:paragraph -->\n<p>${words}</p>\n<!-- /wp:paragraph -->`
/** A post of three sections, 18,000+ characters: over the body shown whole. */
const SECTIONS = [
  para(`Hero ${'a'.repeat(6_000)}`),
  para(`Services ${'b'.repeat(6_000)}`),
  para(`Contact ${'c'.repeat(6_000)}`)
]
const LONG = SECTIONS.join('\n\n')

/** A component holding one post, whose writes are kept. */
function onePost(body = LONG) {
  const post = { ID: 42, post_title: 'Home', post_content: body }
  return relay((action, params) => {
    if (action === 'content.get') return { ok: true, kind: 'post', id: 42, item: { ...post } }
    if (action === 'content.update') {
      if (typeof params.fields?.post_content === 'string') post.post_content = params.fields.post_content
      return { ok: true, kind: 'post', id: 42, created: false }
    }
    return { ok: false, code: 'bad_params' }
  })
}
/** The rev of LONG as content.get answers it (sha256, first 12 hex): a write by position sends it back. */
const LONG_REV = createHash('sha256').update(LONG, 'utf8').digest('hex').slice(0, 12)
const blocksWrite = (
  /** @type {Record<string, unknown>} */ blocks,
  /** @type {Record<string, unknown>} */ extra = {}
) => ({
  action: 'content.update',
  params: { kind: 'post', id: 42, rev: LONG_REV, blocks, ...extra }
})

test('a body over 16,000 characters is read as its outline, its length remembered whole', async () => {
  const site = onePost()
  const ctx = wordpress({ send: site.send })

  const got = await call(ctx, getPost42)

  assert.equal(got.item.post_content, undefined, 'no body in the answer')
  assert.equal(got.item.post_content_chars, LONG.length)
  assert.deepEqual(
    got.outline.map((/** @type {any} */ r) => [r.i, r.block]),
    [
      [0, 'core/paragraph'],
      [1, 'core/paragraph'],
      [2, 'core/paragraph']
    ]
  )
  assert.ok(JSON.stringify(got).length < 2_000)
})

test('🔒 content.get {outline:true} on a page that lists posts answers what the listing shows — no block read after it', async () => {
  // Before: `{i:0, block:"core/query", chars, text:"Nothing here yet."}`, then `block:0` (2.5k characters) for the query.
  const query = {
    perPage: 6,
    pages: 0,
    offset: 0,
    postType: 'post',
    order: 'desc',
    orderBy: 'date',
    inherit: false,
    taxQuery: { category: [9] }
  }
  const body = `<!-- wp:query {"queryId":2,"query":${JSON.stringify(query)}} -->\n<div class="wp-block-query">\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->`
  const site = onePost(body)

  const got = await call(wordpress({ send: site.send }), {
    action: 'content.get',
    params: { kind: 'post', id: 42, outline: true }
  })

  assert.equal(got.outline.length, 1)
  assert.equal(got.outline[0].block, 'core/query')
  assert.deepEqual(got.outline[0].query, query)
  assert.equal(got.item.post_content, undefined, 'still no body in the answer')
  assert.equal(count(site.sent, 'content.get'), 1, 'one read, which is the page')
})

test('a whole-body write made from the part of a long post it could see is cut, and refused', async () => {
  const site = onePost()
  const ctx = wordpress({ send: site.send })
  await call(ctx, getPost42)

  const cut = await call(ctx, {
    action: 'content.update',
    params: { kind: 'post', id: 42, fields: { post_content: SECTIONS[0] } }
  })

  assert.equal(cut.code, 'BODY_SHRINK')
  assert.equal(count(site.sent, 'content.update'), 0)
})

test('a body of one block is shown whole — it has nothing to name but itself', async () => {
  const one = onePost(`<p>${'z'.repeat(20_000)}</p>`)

  const whole = await call(wordpress({ send: one.send }), getPost42)

  assert.equal(whole.item.post_content.length, 20_007)
})

test('one block is read by its index, and block is never relayed', async () => {
  const site = onePost()

  const read = await call(wordpress({ send: site.send }), {
    action: 'content.get',
    params: { kind: 'post', id: 42, block: [1] }
  })

  assert.deepEqual(read.blocks, [{ i: 1, block: 'core/paragraph', markup: SECTIONS[1] }])
  assert.equal(site.sent.at(-1)?.[1].block, undefined)
})

test('one block changed — the body is spliced host-side and written whole through the guard', async () => {
  const site = onePost()
  const changed = para(`Services ${'B'.repeat(6_000)}`)

  const out = await call(wordpress({ send: site.send }), blocksWrite({ 1: changed }))

  const writes = site.sent.filter(([a]) => a === 'content.update')
  assert.equal(out.ok, true)
  assert.equal(writes.length, 1)
  assert.equal(writes[0][1].blocks, undefined)
  assert.equal(writes[0][1].fields.post_content, [SECTIONS[0], changed, SECTIONS[2]].join('\n\n'))
  assert.match(out.normalized.join(' '), /blocks replaced 1/)
})

{
  const cases = [
    {
      label: 'no such position',
      said: '',
      args: blocksWrite({ 7: para('x') }),
      expect: { code: 'BAD_PARAMS', count: 3 },
      next: /outline:true/
    },
    {
      label: 'blocks beside a whole body',
      said: '',
      args: blocksWrite({ 0: para('x') }, { fields: { post_content: LONG } }),
      expect: { code: 'BAD_PARAMS' },
      next: /./
    },
    {
      label: 'block 2 dropped with block 1 cut to a line',
      said: 'Update the services section',
      args: blocksWrite({ 1: para('Services'), 2: null }),
      expect: { code: 'BODY_SHRINK' },
      next: /./
    },
    {
      label: 'every block dropped',
      said: 'Update the services section',
      args: blocksWrite({ 0: null, 1: null, 2: null }),
      expect: { code: 'BODY_SHRINK' },
      next: /./
    }
  ]
  for (const { label, said, args, expect, next } of cases)
    test(`blocks that name no such position, sit beside a whole body, or would cut the page are refused with nothing written: ${label}`, async () => {
      const site = onePost()

      const bad = await call(wordpress({ send: site.send, events: typedBy(said) }), args)

      assertHas(bad, expect, label)
      assert.match(bad.next, next, label)
      assert.equal(count(site.sent, 'content.update'), 0, label)
    })
}

{
  for (const said of ['Ẩn phần dự án đi', '把联系部分去掉', 'Entferne den Kontaktbereich'])
    test(`blocks:{"<i>":null} drops a section without removes, in any language: ${rowName(said)}`, async () => {
      const site = onePost()

      const out = await call(wordpress({ send: site.send, events: typedBy(said) }), blocksWrite({ 1: null }))

      const writes = site.sent.filter(([a]) => a === 'content.update')
      assert.equal(out.ok, true, said)
      assert.equal(writes.length, 1, said)
      assert.equal(writes[0][1].fields.post_content, [SECTIONS[0], SECTIONS[2]].join('\n\n'), said)
      assert.match(out.normalized.join(' '), /dropped 1/, said)
    })
}

// ── F1: a Joomla JSON column is JSON, down to its nested strings ─────────────────────────────────────

/** Module 442 of benchjoomla01, cut to two services: `params` is JSON text whose `jatools-config` is JSON text again. */
const SERVICES_CONFIG = JSON.stringify({
  ':type': 'tracy_business:tb-services',
  'tb-services': {
    'tb-services[title]': ['Four core service lines'],
    'tb-services[item-title]': ['Industrial park infrastructure', 'Crane rental'],
    'tb-services[item-desc]': [
      'Earthworks, internal roads.',
      'Tower cranes up to 250 t, operators included.'
    ],
    'jatools-layout-tb-services': 'style-1'
  }
})
/** @param {string} config */
const servicesParams = (config) =>
  JSON.stringify({
    'jatools-config': config,
    'jatools-layout-tb-services': 'style-1',
    moduleclass_sfx: '',
    cache: 0
  })
/** An open Joomla site whose component accepts every write and holds `params` as module 442's column. */
function joomlaHolding(/** @type {unknown} */ params = '{}') {
  const site = relay((action, p) =>
    action === 'content.get'
      ? { ok: true, item: { id: 442, params } }
      : action === 'content.update'
        ? { ok: true, kind: p.kind, id: p.id, created: false }
        : { ok: true }
  )
  return { site, ctx: openJ(site.send) }
}
/** @param {Record<string, unknown>} fields @param {string} [kind] */
const joomlaWrite = (fields, kind = 'module') => ({
  action: 'content.update',
  params: { kind, id: 442, apply_id: 'svc-crane-rental-en', fields }
})

{
  const brokenConfig = SERVICES_CONFIG.slice(0, -1)
  const wholeCol = { 'jatools-config': SERVICES_CONFIG, cache: 0 }
  const refuse = (
    /** @type {string} */ label,
    /** @type {string} */ kind,
    /** @type {Record<string, unknown>} */ fields,
    /** @type {Record<string, unknown>} */ expect
  ) => ({ label, kind, fields, expect, written: [] })
  const pass = (/** @type {string} */ label, /** @type {Record<string, unknown>} */ fields) => ({
    label,
    kind: 'module',
    fields,
    expect: { ok: true },
    written: [fields.params]
  })
  const words = (/** @type {Record<string, string>} */ nested) => ({
    params: JSON.stringify(nested)
  })
  const cases = [
    refuse(
      'nested jatools-config lost its last }',
      'module',
      { params: servicesParams(brokenConfig) },
      {
        ok: false,
        code: 'PARAMS_NOT_JSON',
        field: 'params',
        key: 'jatools-config',
        offset: brokenConfig.length
      }
    ),
    refuse(
      'params broken at top level',
      'module',
      { params: '{"cache":0' },
      { code: 'PARAMS_NOT_JSON', key: null, offset: 10 }
    ),
    refuse(
      'article attribs with a trailing comma',
      'article',
      { title: 'About', attribs: '{"show_title":"1",}' },
      { code: 'PARAMS_NOT_JSON', field: 'attribs' }
    ),
    refuse('a closed nested list that does not parse', 'module', words({ rows: '[1, 2,]' }), {
      code: 'PARAMS_NOT_JSON'
    }),
    refuse('a nested object that does not parse', 'module', words({ rows: '{"a": 1' }), {
      code: 'PARAMS_NOT_JSON'
    }),
    refuse(
      'params as an object would replace the whole column',
      'module',
      { params: { logo: 'x.png' } },
      { code: 'PARAMS_WHOLE_COLUMN', field: 'params', keys: ['logo'] }
    ),
    refuse(
      'a bigger object is no kinder',
      'module',
      { params: wholeCol },
      { code: 'PARAMS_WHOLE_COLUMN', keys: ['jatools-config', 'cache'] }
    ),
    pass('the same params with the brace kept, byte for byte', {
      params: servicesParams(SERVICES_CONFIG)
    }),
    pass(
      'square-bracket header text',
      words({ header_tag: '[Tracy Business] Home - Services', note: '[the best] cranes' })
    ),
    pass(
      'a loadposition tag and empty JSON words',
      words({ lead: '{loadposition top-a}', empty: '{}', list: '[]' })
    ),
    pass('a footnote marker', words({ note: '[1] See terms' })),
    pass('a Vietnamese footnote marker', words({ note: '[2] Giá chưa gồm VAT' })),
    pass('a bracketed brand', words({ note: '[Tracy] Home' }))
  ]
  for (const { label, kind, fields, expect, written } of cases)
    test(`a JSON column is JSON down to its nested strings — a broken or whole-column write is refused, words that only look like JSON pass: ${label}`, async () => {
      const { site, ctx } = joomlaHolding()

      const out = await call(ctx, joomlaWrite(fields, kind))

      assertHas(out, expect, label)
      assert.deepEqual(
        site.sent.filter(([a]) => a === 'content.update').map(([, p]) => p.fields.params),
        written,
        label
      )
    })
}

test('params {patch} changes one key and keeps every other, nested jatools-config included', async () => {
  const { site, ctx } = joomlaHolding(servicesParams(SERVICES_CONFIG))

  const out = await call(
    ctx,
    joomlaWrite({
      params: {
        patch: {
          cache: 1,
          moduleclass_sfx: null,
          'jatools-config': { 'tb-services': { 'tb-services[title]': ['Five lines'] } }
        }
      }
    })
  )

  const written = site.sent.filter(([a]) => a === 'content.update')
  const params = JSON.parse(written[0][1].fields.params)
  const config = JSON.parse(params['jatools-config'])
  assert.equal(out.ok, true)
  assert.equal(written.length, 1)
  assert.deepEqual(
    [params.cache, 'moduleclass_sfx' in params, params['jatools-layout-tb-services']],
    [1, false, 'style-1']
  )
  assert.deepEqual(config['tb-services']['tb-services[title]'], ['Five lines'])
  assert.deepEqual(config['tb-services']['tb-services[item-title]'], [
    'Industrial park infrastructure',
    'Crane rental'
  ])
  assert.equal(config[':type'], 'tracy_business:tb-services')
})

// 03/10/2026, dev site leemood, module 93 (mod_ja_acm hero): the agent re-typed the whole nested
// `jatools-config` as a STRING inside `{patch}` and typed `":type"` as `"type"`. Merged as RFC 7386 says,
// the string replaced the stored text, the hero printed nothing, and the agent reported it done.
const LEEMOOD_HERO = fixture('joomla-acm/leemood-hero-93.json')

test('a patch that re-types a stored JSON text as a string and drops one of its keys is refused, nothing written', async () => {
  const { site, ctx } = joomlaHolding(LEEMOOD_HERO.stored)

  const out = await call(ctx, joomlaWrite({ params: { patch: LEEMOOD_HERO.patch } }))

  assertHas(out, {
    ok: false,
    code: 'PARAMS_KEYS_LOST',
    field: 'params',
    key: 'jatools-config',
    lost: [':type']
  })
  assert.match(String(out.next), /"jatools-config":\{/)
  assert.equal(count(site.sent, 'content.update'), 0)
})

test('the same change sent as an object merges into the stored JSON text and keeps ":type"', async () => {
  const { site, ctx } = joomlaHolding(LEEMOOD_HERO.stored)
  const heading = 'Bật hết cỡ. Chia sẻ khắp nơi. Làm chủ cộng đồng Mood.'

  const out = await call(
    ctx,
    joomlaWrite({
      params: { patch: { 'jatools-config': { hero: { 'hero-style[hero-heading]': [heading] } } } }
    })
  )

  const written = site.sent.filter(([a]) => a === 'content.update')
  const config = JSON.parse(JSON.parse(written[0][1].fields.params)['jatools-config'])
  assert.equal(out.ok, true)
  assert.equal(config[':type'], 'ja_mood:hero')
  assert.deepEqual(config.hero['hero-style[hero-heading]'], [heading])
})

test('a JSON text re-typed as a string that keeps every key of the stored one still replaces it', async () => {
  const { site, ctx } = joomlaHolding(LEEMOOD_HERO.stored)
  const config = JSON.parse(JSON.parse(LEEMOOD_HERO.stored)['jatools-config'])
  config.hero['hero-style[hero-text]'] = ['Watch now']

  const out = await call(
    ctx,
    joomlaWrite({ params: { patch: { 'jatools-config': JSON.stringify(config) } } })
  )

  assert.equal(out.ok, true)
  assert.equal(count(site.sent, 'content.update'), 1)
})

{
  const patch = joomlaWrite({ params: { patch: { a: 1 } } })
  const cases = [
    {
      // A kind the component can create (module, article…) with no id is a CREATE; only one it cannot needs the id.
      label: 'no id',
      held: '{}',
      args: {
        action: 'content.update',
        params: { kind: 'templateStyle', apply_id: 'x', fields: { params: { patch: { a: 1 } } } }
      },
      expect: { code: 'ADDRESS_MISSING' },
      writes: 0
    },
    {
      label: 'stored column is not JSON',
      held: '{"a":',
      args: patch,
      expect: { code: 'PARAMS_NOT_JSON' },
      writes: 0
    },
    { label: 'the read failed', held: null, args: patch, expect: { ok: false }, writes: 0 },
    {
      label: 'an empty column takes the patch',
      held: '',
      args: patch,
      expect: { ok: true },
      writes: 1
    },
    {
      label: 'a patch beside a bare key',
      held: '',
      args: joomlaWrite({ params: { patch: { a: 1 }, b: 2 } }),
      expect: { code: 'PARAMS_WHOLE_COLUMN' },
      writes: 0
    }
  ]
  for (const { label, held, args, expect, writes } of cases)
    test(`a patch needs an id and a stored column that is JSON; a failed read is answered as it came: ${label}`, async () => {
      const site =
        held === null
          ? relay((action) => (action === 'content.get' ? { ok: false, code: 'NOT_FOUND' } : { ok: true }))
          : joomlaHolding(held).site

      const out = await call(openJ(site.send), args)

      assertHas(out, expect, label)
      assert.equal(count(site.sent, 'content.update'), writes, label)
    })
}

// ── v6 WP L4-02: a global-styles post is theme.json, and WordPress drops it when it is not ───────────

const GLOBAL_STYLES = fixture('global-styles/v6-wp-l4-02.json')
/** A WordPress site holding the fixture's global-styles post 384 as `stored`. */
const stylesSite = () =>
  relay((action, params) =>
    action === 'content.get'
      ? {
          ok: true,
          kind: 'post',
          id: 384,
          key: '',
          item: { ...GLOBAL_STYLES.post, post_content: GLOBAL_STYLES.stored }
        }
      : action === 'content.list'
        ? {
            ok: true,
            kind: 'post',
            items: [
              {
                id: 384,
                title: 'Custom Styles',
                type: 'wp_global_styles',
                content: GLOBAL_STYLES.stored
              }
            ]
          }
        : { ok: true, kind: 'post', id: params.id ?? 0, created: false }
  )
const stylesWrite = (/** @type {string} */ postContent) => ({
  action: 'content.update',
  params: { kind: 'post', id: 384, fields: { post_content: postContent } }
})
const stylesCtx = (/** @type {any} */ site) =>
  wordpress({
    send: site.send,
    facts: { platform: 'wordpress', sealed: true, verifyBodyWrites: false }
  })

{
  const FLAG = 'isGlobalStylesUserThemeJSON'
  const stored = JSON.parse(GLOBAL_STYLES.stored)
  const { [FLAG]: _flag, ...unflagged } = stored
  const custom = {
    ...stored.settings.custom,
    tracy: { ...stored.settings.custom.tracy, brand: { orange: '#ff385c' } }
  }
  const sound = JSON.stringify({ ...stored, settings: { ...stored.settings, custom } })
  const at = GLOBAL_STYLES.sent.indexOf(`,"${FLAG}"`)
  const fixed = `${GLOBAL_STYLES.sent.slice(0, at)}}${GLOBAL_STYLES.sent.slice(at)}`
  const create = (/** @type {Record<string, unknown>} */ fields) => ({
    action: 'content.update',
    params: { kind: 'post', fields }
  })
  const wordsBody = '<!-- wp:paragraph --><p>{price} on request</p><!-- /wp:paragraph -->'
  const readPost = { action: 'content.get', params: { kind: 'post', id: 384 } }
  const readList = {
    action: 'content.list',
    params: { post_type: 'wp_global_styles', include_body: true }
  }
  const refused = { code: 'PARAMS_NOT_JSON' }
  const cases = [
    {
      label: 'the measured write that lost one } (answered ok and dropped every user style)',
      read: [readPost],
      args: stylesWrite(GLOBAL_STYLES.sent),
      expect: {
        ok: false,
        code: 'PARAMS_NOT_JSON',
        field: 'post_content',
        globalStyles: true,
        ends: true,
        offset: 2633
      },
      written: []
    },
    {
      label: 'the brace put back at the end closes settings round the flag',
      read: [readPost],
      args: stylesWrite(`${GLOBAL_STYLES.sent}}`),
      expect: { ...refused, flag: FLAG },
      written: []
    },
    {
      label: 'the brace put back where it was dropped',
      read: [readPost],
      args: stylesWrite(fixed),
      expect: { ok: true },
      written: [fixed]
    },
    {
      label: 'JSON without its flag',
      read: [readList],
      args: stylesWrite(JSON.stringify(unflagged)),
      expect: { ...refused, flag: FLAG },
      written: []
    },
    {
      label: 'flag false',
      read: [readList],
      args: stylesWrite(JSON.stringify({ ...stored, [FLAG]: false })),
      expect: { ...refused, flag: FLAG },
      written: []
    },
    {
      label: 'a list, not one object',
      read: [readList],
      args: stylesWrite(JSON.stringify([stored])),
      expect: { ...refused, notObject: true },
      written: []
    },
    {
      label: 'sound JSON that keeps its flag',
      read: [readList],
      args: stylesWrite(sound),
      expect: { ok: true },
      written: [sound]
    },
    {
      label: 'a create by post_type',
      read: [],
      args: create({
        post_type: 'wp_global_styles',
        post_title: 'Custom Styles',
        post_content: '{"version":3'
      }),
      expect: refused,
      written: []
    },
    {
      label: 'a create with the flag named in the text',
      read: [],
      args: create({ post_title: 'x', post_content: `{"version":3,"${FLAG}":true` }),
      expect: refused,
      written: []
    },
    {
      label: 'an ordinary post whose words open with a brace',
      read: [],
      args: create({ post_title: 'Note', post_content: wordsBody }),
      expect: { ok: true },
      written: [wordsBody]
    }
  ]
  for (const { label, read, args, expect, written } of cases)
    test(`global styles: theme.json in a global-styles post must stay whole JSON with its flag — refused by name, nothing sent: ${label}`, async () => {
      const site = stylesSite()
      const ctx = stylesCtx(site)
      for (const step of read) await call(ctx, step)

      const out = await call(ctx, args)

      assertHas(out, expect, label)
      assert.ok((out.next ?? '').length <= 200 && (out.error ?? '').length <= 160, label)
      assert.deepEqual(
        site.sent.filter(([a]) => a === 'content.update').map(([, p]) => p.fields.post_content),
        written,
        label
      )
    })
}

// ── the first call of an add: what a named page lists, and the address it may need under its language ────

{
  const SITE = { id: 's-1', url: 'https://demo.example', defaultLocale: null, locales: ['en-GB', 'ru-RU'] }
  const pageRow = (/** @type {Record<string, unknown>} */ over) => ({
    id: 'content_a',
    type: 'page',
    title: 'Blog',
    url: 'https://demo.example/en/blog',
    path: '/en/blog',
    locale: 'en-GB',
    translationGroupId: 'translation_a',
    status: 'published',
    ...over
  })
  const pages = (
    /** @type {any[]} */ rows,
    /** @type {string} */ link,
    /** @type {Record<string, unknown>} */ site = {}
  ) => ({
    schemaVersion: 'tracy-content-pages/v1',
    site: { ...SITE, ...site },
    link,
    pages: rows,
    truncated: false,
    version: 'cv1.abc'
  })
  const joomlaRow = pageRow({
    native: [
      { kind: 'menuItem', id: 7 },
      { kind: 'module', id: 31 }
    ]
  })
  const wpRow = pageRow({ path: '/blog', native: [{ kind: 'post', id: 51 }] })
  const menuItem = {
    ok: true,
    kind: 'menuItem',
    id: 7,
    item: {
      id: 7,
      link: 'index.php?option=com_content&view=category&layout=blog&id=12',
      params: '{"show_subcategory_content":1}',
      language: 'en-GB'
    }
  }
  const wpPost = {
    ok: true,
    kind: 'post',
    id: 51,
    item: {
      ID: 51,
      post_type: 'page',
      post_content:
        '<!-- wp:query {"queryId":2,"query":{"postType":"post","perPage":12,"inherit":false,"taxQuery":{"category":[47]}}} -->\n<div class="wp-block-query">\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->'
    }
  }
  const FACTS = {
    siteLanguage: 'en-GB',
    languagePrefixes: { 'en-GB': 'en', 'ru-RU': 'ru' },
    defaultPrefixRemoved: false
  }
  const ask = (/** @type {string} */ url) => ({ action: 'content.read', params: { view: 'pages', url } })
  /** A Joomla relay: the pages by address, then the records the lists are read from. */
  const joomlaRelay = (/** @type {(url: string) => unknown} */ byUrl) =>
    relay((action, p) =>
      action === 'content.read' ? byUrl(String(p.url)) : action === 'content.get' ? menuItem : { ok: false }
    )

  test('🔒 first call of an add, Joomla: a pages read by address answers the page’s lists — one more read, told nowhere', async () => {
    const { sent, send } = joomlaRelay(() => pages([joomlaRow], '/en/blog'))

    const out = await call(joomla({ send }), ask('/en/blog'))

    assert.deepEqual(sent, [
      ['content.read', { view: 'pages', url: '/en/blog' }],
      ['content.get', { kind: 'menuItem', id: 7 }]
    ])
    const lists = out.pages[0].lists
    assert.equal(lists.catid, 12)
    assert.equal(lists.language, 'en-GB')
    assert.equal(lists.subcategories, 1)
    assert.equal(lists.create.action, 'content.update')
    assert.equal(lists.create.params.fields.catid, 12)
    assert.equal(out.normalized, undefined, 'nothing to correct: no note')
    assert.equal(out.pages[0].id, 'content_a', 'the row is what the relay said')
    assert.equal(out.version, 'cv1.abc')
  })

  test('🔒 first call of an add, WordPress: the page’s own post is read and its query says what it lists', async () => {
    const { sent, send } = relay((action) => (action === 'content.read' ? pages([wpRow], '/blog') : wpPost))

    const out = await call(wordpress({ send }), ask('/blog'))

    assert.deepEqual(sent, [
      ['content.read', { view: 'pages', url: '/blog' }],
      ['content.get', { kind: 'post', id: 51 }]
    ])
    assert.equal(out.pages[0].lists.postType, 'post')
    assert.deepEqual(out.pages[0].lists.create.params.fields.post_category, [47])
  })

  test('first call of an add, WordPress: the include/exclude taxQuery of WordPress 6.8+ (the seeder’s, on a category with archived articles) names its category', async () => {
    const seeded = {
      ...wpPost,
      item: {
        ...wpPost.item,
        post_content:
          '<!-- wp:query {"queryId":2,"query":{"perPage":12,"postType":"post","inherit":false,"taxQuery":{"include":{"category":[6,7]},"exclude":{"post_tag":[9]}}}} -->\n<div class="wp-block-query">\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->'
      }
    }
    const { send } = relay((action) => (action === 'content.read' ? pages([wpRow], '/blog') : seeded))

    const out = await call(wordpress({ send }), ask('/blog'))

    assert.deepEqual(out.pages[0].lists.taxQuery, { category: [6, 7] })
    assert.deepEqual(out.pages[0].lists.create.params.fields.post_category, [6])
  })

  test('🔒 first call of an add, WordPress: a page that holds a listing the host cannot reduce says where to read it — no create, and the note is what the model reads', async () => {
    // What the seeder writes on a category page that has child pages: a page grid, then the category's posts.
    const grid =
      '<!-- wp:query {"queryId":3,"query":{"perPage":12,"postType":"page","inherit":false,"parents":[40],"orderBy":"menu_order","exclude":[81]}} -->\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n<!-- /wp:query -->'
    const posts =
      '<!-- wp:query {"queryId":2,"query":{"perPage":12,"postType":"post","inherit":false,"taxQuery":{"category":[6,7]}}} -->\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n<!-- /wp:query -->'
    const seeded = { ...wpPost, item: { ...wpPost.item, post_content: `${grid}\n${posts}` } }
    const { sent, send } = relay((action) => (action === 'content.read' ? pages([wpRow], '/blog') : seeded))

    const out = await call(wordpress({ send }), ask('/blog'))

    assert.equal(sent.length, 2)
    const lists = out.pages[0].lists
    assert.deepEqual(Object.keys(lists), ['note'], 'no call to fill: it would carry no category')
    assert.ok(lists.note.includes('content.get {kind:"post", id:51}'))
    assert.match(lists.note, /post_category/)
    assert.equal(out.pages[0].id, 'content_a', 'the row is what the relay said')
  })

  test('the inner reads run on a pages read by address only — not on a describe, a listing, an id or the whole page list', async () => {
    const reads = [
      { describe: true },
      { type: 'page', locale: 'en-GB' },
      { id: 'content_a' },
      { view: 'pages' },
      { view: 'pages', locale: 'en-GB' }
    ]
    for (const params of reads) {
      const { sent, send } = relay(() => pages([joomlaRow], '/en/blog'))
      // No `link` on the whole-list read, as the relay answers it.
      await call(joomla({ send }), { action: 'content.read', params })
      assert.equal(sent.length, 1, JSON.stringify(params))
    }
  })

  test('a failed inner read leaves the pages answer exactly as the relay gave it', async () => {
    const { sent, send } = relay((action) =>
      action === 'content.read' ? pages([joomlaRow], '/en/blog') : { ok: false, code: 'SEAT_REFUSED' }
    )

    const out = await call(joomla({ send }), ask('/en/blog'))

    assert.equal(sent.length, 2)
    assert.equal('lists' in out.pages[0], false)
    assert.deepEqual(out.pages[0], joomlaRow)
  })

  test('a page whose menu item lists only what carries a tag gets no lists — the tag is in the link, where Joomla stores it', async () => {
    const tagged = { ...menuItem, item: { ...menuItem.item, link: `${menuItem.item.link}&filter_tag[0]=5` } }
    const { sent, send } = relay((action) =>
      action === 'content.read' ? pages([joomlaRow], '/en/blog') : tagged
    )

    const out = await call(joomla({ send }), ask('/en/blog'))

    assert.equal(sent.length, 2)
    assert.deepEqual(out.pages[0], joomlaRow)
  })

  test('🔒 an address with no language prefix is asked again under the default language, and the answer says so', async () => {
    const { sent, send } = joomlaRelay((url) =>
      url === '/en/blog' ? pages([joomlaRow], '/en/blog') : pages([], url)
    )

    const out = await call(joomla({ send, siteFacts: async () => FACTS }), ask('/blog'))

    assert.deepEqual(sent, [
      ['content.read', { view: 'pages', url: '/blog' }],
      ['content.read', { view: 'pages', url: '/en/blog' }],
      ['content.get', { kind: 'menuItem', id: 7 }]
    ])
    assert.equal(out.pages.length, 1)
    assert.equal(out.link, '/en/blog')
    assert.equal(out.pages[0].lists.catid, 12, 'and the page it found lists its category too')
    assert.ok(
      out.normalized.some((/** @type {string} */ note) => note.startsWith('"/blog" is "/en/blog"')),
      JSON.stringify(out.normalized)
    )
    assert.ok(out.normalized.every((/** @type {string} */ note) => note.length <= 90))
  })

  test('the retry reads no further when it finds no page: the answer is the first one, with its way on', async () => {
    const { sent, send } = joomlaRelay((url) => pages([], url))

    const out = await call(joomla({ send, siteFacts: async () => FACTS }), ask('/blog'))

    assert.equal(sent.length, 2)
    assert.deepEqual(out.pages, [])
    assert.equal(out.link, '/blog')
    assert.match(out.next.why, /^No page has this address/)
    assert.equal(out.normalized, undefined)
  })

  test('the retry is not made when the default language is not known for sure, or the address is not the kind that needs it', async () => {
    const cases = /** @type {Array<[string, Record<string, unknown>, string]>} */ ([
      ['no facts on Joomla, the listing names no default', joomla({}), '/blog'],
      ['facts that name no prefix', joomla({ siteFacts: async () => ({ siteLanguage: 'en-GB' }) }), '/blog'],
      [
        'a default served without its prefix',
        joomla({ siteFacts: async () => ({ ...FACTS, defaultPrefixRemoved: true }) }),
        '/blog'
      ],
      ['an address that starts with a language', joomla({ siteFacts: async () => FACTS }), '/ru/blog'],
      [
        'facts that cannot be read',
        joomla({ siteFacts: async () => Promise.reject(new Error('gone')) }),
        '/blog'
      ],
      [
        'an EmDash site',
        { ...joomla({ siteFacts: async () => FACTS }), facts: { platform: 'emdash' } },
        '/blog'
      ]
    ])
    for (const [label, ctx, url] of cases) {
      const { sent, send } = joomlaRelay((u) => pages([], u))
      const out = await call({ ...ctx, send }, ask(url))
      assert.equal(sent.length, 1, label)
      assert.deepEqual(out.pages, [], label)
    }
  })

  test('a site that names its own default asks again with no facts at all — WordPress under a language prefix', async () => {
    const { sent, send } = relay((action, p) =>
      action === 'content.read'
        ? p.url === '/en/blog'
          ? pages([wpRow], '/en/blog', { defaultLocale: 'en-US', locales: ['en-US', 'ru-RU'] })
          : pages([], String(p.url), { defaultLocale: 'en-US', locales: ['en-US', 'ru-RU'] })
        : wpPost
    )

    const out = await call(wordpress({ send }), ask('/blog'))

    assert.deepEqual(
      sent.map(([action, p]) => [action, p.url ?? p.kind]),
      [
        ['content.read', '/blog'],
        ['content.read', '/en/blog'],
        ['content.get', 'post']
      ]
    )
    assert.equal(out.pages[0].lists.postType, 'post')
  })

  test('a retry the site refuses or loses is not asked again: the first answer stands, no waiting', async () => {
    let slept = 0
    for (const second of [
      { ok: false, error: { code: 'CONTENT_BAD_QUERY', message: 'no' } },
      { ok: false, code: 'COMPONENT_UNREACHABLE', error: 'the site did not answer' },
      null
    ]) {
      const { sent, send } = joomlaRelay((url) => (url === '/blog' ? pages([], '/blog') : second))
      const out = await call(
        joomla({ send, siteFacts: async () => FACTS, sleep: async () => void (slept += 1) }),
        ask('/blog')
      )
      assert.equal(sent.length, 2)
      assert.deepEqual(out.pages, [])
      assert.match(out.next.why, /^No page has this address/)
    }
    assert.equal(slept, 0)
  })
}

// 20/10/2026, staff on real customer sites: "when Tracy fixes one place it often breaks another place". The
// model's own update of a record other pages show too asks first (`consequence.mjs` `shared`); a door's own
// step (the replace job's planned writes, `page.create`'s menu row) runs as before.
test('the model’s own write to a shared record asks first, nothing sent; the same write as a door’s step runs', async () => {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, params])
    // the module's title, read by Tracy to name it on the card (council 20/10/2026: a card names its record)
    if (action === 'content.get') return { ok: true, item: { id: 442, title: 'Hotline bar' } }
    return { ok: true, kind: 'module', id: 442 }
  }
  const write = joomlaWrite({ title: 'Hotline' })
  const asked = await call(openJ(send, { modelCall: true }), write)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.consequence, 'shared')
  assert.equal(
    asked.ask.questions[0].question,
    'This changes the "Hotline bar" block, which shows on every page it is assigned to, not this page alone. Go ahead?'
  )
  assert.equal(count(sent, 'content.update'), 0, 'nothing written before the customer answers')
  // A shared record Tracy cannot read to name is not asked about, as a delete's is not.
  const dark = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, params])
    return action === 'content.get' ? { ok: false, code: 'NOT_FOUND' } : { ok: true, kind: 'module', id: 442 }
  }
  const unread = await call(openJ(dark, { modelCall: true }), write)
  assert.equal(unread.code, 'TARGET_UNREAD')
  assert.equal(count(sent, 'content.update'), 0, 'nothing written for a record not named')

  const stepped = await call(openJ(send), write)
  assert.notEqual(stepped.code, 'CONFIRM_FIRST')
  assert.equal(count(sent, 'content.update'), 1)
  // An article is no shared record: it runs at once even as the model's own call.
  const article = await call(openJ(send, { modelCall: true }), joomlaWrite({ title: 'About' }, 'article'))
  assert.notEqual(article.code, 'CONFIRM_FIRST')
})

test('a WordPress template part written by the model asks first, naming it, with nothing sent', async () => {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, params])
    return { ok: true, kind: 'templatePart', key: 'footer', created: false }
  }
  const ctx = wpQuiet(send, { modelCall: true })
  const write = {
    action: 'content.update',
    params: {
      kind: 'templatePart',
      key: 'footer',
      fields: { content: '<!-- wp:paragraph --><p>Call 0909 123 456</p><!-- /wp:paragraph -->' }
    }
  }
  const asked = await call(ctx, write)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.consequence, 'shared')
  assert.match(asked.ask.questions[0].question, /part every page of your site shows, not this page alone/)
  assert.equal(count(sent, 'content.update'), 0)
})

// 20/10/2026: the model's own WordPress whole-body write changes at most one existing block; two or more are
// refused BODY_WIDE with nothing sent, and sent to `blocks`, where every block not named stays byte for byte.
{
  const para = (/** @type {string} */ t) => `<!-- wp:paragraph -->\n<p>${t}</p>\n<!-- /wp:paragraph -->`
  const BODY = [para('Welcome to Northgate.'), para('We build plants.'), para('Call us today.')].join('\n\n')
  const wpBody = (/** @type {Record<string, any>} */ over = {}) => {
    /** @type {Array<[string, Record<string, any>]>} */
    const sent = []
    const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
      sent.push([action, params])
      if (action === 'content.get')
        return { ok: true, item: { id: 42, post_type: 'page', post_title: 'Home', post_content: BODY } }
      return { ok: true, kind: 'post', id: 42, created: false }
    }
    const ctx = wpQuiet(send, { modelCall: true, ...over })
    // read first, as the body guard asks (D6′)
    ctx.memory.rememberRead('session-w', { kind: 'post', id: 42, title: 'Home', chars: BODY.length })
    return { sent, ctx }
  }
  const write = (/** @type {string} */ body) => ({
    action: 'content.update',
    params: { kind: 'post', id: 42, fields: { post_content: body } }
  })

  test('a whole body that changes two blocks is refused BODY_WIDE, nothing written, and sent to blocks with the rev', async () => {
    const { sent, ctx } = wpBody()
    const two = BODY.replace('Welcome to Northgate.', 'Welcome!').replace('Call us today.', 'Call now.')
    const out = await call(ctx, write(two))
    assert.equal(out.code, 'BODY_WIDE', JSON.stringify(out))
    assert.deepEqual([out.blocks, out.of], [[0, 1, 2], 3])
    assert.match(out.next, /blocks:\{"<i>": …\} and this rev/)
    assert.equal(count(sent, 'content.update'), 0)
  })

  test('a whole body that changes one block, or adds one, goes on; a door’s own step is not held to it', async () => {
    const one = wpBody()
    const out = await call(one.ctx, write(BODY.replace('We build plants.', 'We build factories.')))
    assert.notEqual(out.code, 'BODY_WIDE', JSON.stringify(out))
    assert.equal(count(one.sent, 'content.update'), 1, JSON.stringify(out))
    const added = wpBody()
    const more = await call(added.ctx, write(`${BODY}\n\n${para('New line.')}`))
    assert.notEqual(more.code, 'BODY_WIDE', JSON.stringify(more))
    const step = wpBody({ modelCall: false })
    const two = BODY.replace('Welcome to Northgate.', 'Welcome!').replace('Call us today.', 'Call now.')
    assert.notEqual((await call(step.ctx, write(two))).code, 'BODY_WIDE')
  })
}

// Council 20/10/2026 (live run): a delete or a hide of one record is asked about by its title, read by
// Tracy from the same site, kind and id; a record that cannot be read is not asked about at all.
test('🔒 a delete names its record on the question, read by Tracy; an unreadable record is not asked about', async () => {
  const titled = relay((action) =>
    action === 'content.get' ? { ok: true, item: { id: 7, title: 'Yêu chính mình' } } : { ok: true }
  )
  const ctx = openJ(titled.send)

  const asked = await call(ctx, { action: 'content.delete', params: { kind: 'article', id: 7 } })

  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.ask.questions[0].question, 'This deletes "Yêu chính mình" from your site. Go ahead?')
  assert.equal(ctx.memory.titleOf(ctx.sessionId, { kind: 'article', id: 7 }), 'Yêu chính mình')
  assert.equal(
    ctx.memory.titleOf(ctx.sessionId, { kind: 'category', id: 7 }),
    null,
    'another kind of the same id is not named'
  )
  assert.equal(count(titled.sent, 'content.delete'), 0)

  const dark = relay((action) => (action === 'content.get' ? { ok: false, code: 'NOT_FOUND' } : { ok: true }))
  const unread = await call(openJ(dark.send), {
    action: 'content.delete',
    params: { kind: 'article', id: 8 }
  })

  assert.equal(unread.code, 'TARGET_UNREAD')
  assert.match(unread.next, /content\.list or content\.find/)
  assert.equal(count(dark.sent, 'content.delete'), 0, 'nothing deleted')
})

test('🔒 a hide names its record too, and the card must say hide, not delete, in the conversation’s language', async () => {
  const titled = relay((action) =>
    action === 'content.get' ? { ok: true, item: { id: 4, title: 'Yêu chính mình' } } : { ok: true }
  )
  const ctx = openJ(titled.send)

  const asked = await call(ctx, {
    action: 'content.update',
    params: { kind: 'article', id: 4, fields: { state: 0 } }
  })
  const [q] = asked.ask.questions
  const as = (question, yes, no) => ({
    questions: [{ ...q, question, options: [{ label: yes }, { label: no }] }]
  })

  assert.equal(asked.consequence, 'hides')
  assert.match(q.question, /"Yêu chính mình"/)
  assert.match(
    String(
      ctx.memory.confirmCardRefusal(
        ctx.sessionId,
        as('Xoá bài "Yêu chính mình" nhé?', 'Đồng ý', 'Không'),
        'Vietnamese'
      )
    ),
    /without deleting it/
  )
  assert.match(
    String(
      ctx.memory.confirmCardRefusal(
        ctx.sessionId,
        as('Ẩn bài "Yêu chính mình" nhé?', 'Không, giữ lại', 'Đồng ý'),
        'Vietnamese'
      )
    ),
    /first option must say yes/
  )
  assert.equal(
    ctx.memory.confirmCardRefusal(
      ctx.sessionId,
      as('Ẩn bài "Yêu chính mình" khỏi trang web nhé?', 'Đồng ý, ẩn đi', 'Không, giữ lại'),
      'Vietnamese'
    ),
    null
  )
})

test('private demo reads and plans take no content lease; frozen asset imports take the write lease', () => {
  for (const operation of ['read', 'plan.read', 'plan.save', 'guard'])
    assert.equal(doorTakesLease('demo.research', { operation }), false)
  assert.equal(doorTakesLease('demo.research', { operation: 'media.import' }), true)
})

// 23/10/2026, a one-press WordPress build stood 50 minutes on "This changes the Header part every page of your site
// shows": in a demo or own-site build whose plan is saved, nobody is at the chat to answer, and the plan already
// says the header changes. A saved plan agrees to consequence writes; a delete still asks.
test('a build whose saved plan agreed is not asked about a shared write; a delete in it still asks', async () => {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, params])
    if (action === 'content.get') return { ok: true, item: { id: 442, title: 'Hotline bar' } }
    return { ok: true, kind: 'module', id: 442 }
  }
  let asked = 0
  const agreed = openJ(send, { modelCall: true, planAgreed: async () => (asked++, true) })
  const out = await call(agreed, joomlaWrite({ title: 'Russ & Daughters' }))
  assert.notEqual(out.code, 'CONFIRM_FIRST', JSON.stringify(out).slice(0, 300))
  assert.equal(count(sent, 'content.update'), 1)
  assert.equal(asked, 1, 'the plan is read only for a write with a consequence')
  // An article has no consequence: the plan is not even read.
  await call(agreed, joomlaWrite({ title: 'About' }, 'article'))
  assert.equal(asked, 1)
  const deleted = await call(agreed, { action: 'content.delete', params: { kind: 'article', id: 5 } })
  assert.equal(deleted.code, 'CONFIRM_FIRST')
  assert.equal(count(sent, 'content.delete'), 0)
  // No saved plan: asked as before.
  const plain = await call(
    openJ(send, { modelCall: true, planAgreed: async () => false }),
    joomlaWrite({ title: 'X' })
  )
  assert.equal(plain.code, 'CONFIRM_FIRST')
})

test('🔒 a yes to a change every page shows in this turn covers a shared write next; a delete, or a new message, still asks (beta report 26/10/2026)', async () => {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, params])
    if (action === 'content.get') return { ok: true, item: { id: 442, title: 'Hotline bar' } }
    return { ok: true, kind: 'module', id: 442 }
  }
  const memory = createCallMemory({ now: () => 1_000 })
  const ctx = openJ(send, { modelCall: true, memory })
  memory.newTurn('session-a')
  // Asked before anything: the shared module write asks as it always did.
  const first = await call(ctx, joomlaWrite({ title: 'A' }))
  assert.equal(first.code, 'CONFIRM_FIRST')
  // The customer agrees to a look every page shows (look.set site scope), in this same message.
  memory.confirmAsked('session-a', 'look-set-site', true, [], null, 'site')
  const q = confirmQuestion('look-set-site', 'x').questions[0]
  memory.customerAnswered('session-a', { questions: [q] }, { answers: [{ id: q.id, selected: ['Yes, go ahead'] }] })
  const covered = await call(ctx, joomlaWrite({ title: 'B' }))
  assert.notEqual(covered.code, 'CONFIRM_FIRST', JSON.stringify(covered).slice(0, 300))
  assert.equal(count(sent, 'content.update'), 1)
  const deleted = await call(ctx, { action: 'content.delete', params: { kind: 'article', id: 5 } })
  assert.equal(deleted.code, 'CONFIRM_FIRST', 'a delete always asks')
  memory.newTurn('session-a')
  const next = await call(ctx, joomlaWrite({ title: 'C' }))
  assert.equal(next.code, 'CONFIRM_FIRST', 'a new message asks again')
})

// ── The residue sweep's placeholder on a template post of one block (product owner, 24/10/2026) ──────────────────

{
  const LOREM = para(`Lorem ipsum ${'dolor sit amet '.repeat(48)}`)
  const loremRev = createHash('sha256').update(LOREM, 'utf8').digest('hex').slice(0, 12)
  const placeholder = {
    action: 'content.update',
    params: { kind: 'post', id: 42, rev: loremRev, blocks: { 0: para('Menu item') } }
  }

  test('🔒 the sweep cuts a one-block template body to its placeholder on a read made for the write', async () => {
    const site = onePost(LOREM)
    const ctx = wordpress({ send: site.send })
    await call(ctx, getPost42)

    const out = await withSweepRead(() => call(ctx, placeholder))

    const writes = site.sent.filter(([a]) => a === 'content.update')
    assert.equal(out.ok, true)
    assert.equal(writes.length, 1)
    assert.equal(writes[0][1].fields.post_content, para('Menu item'))
  })

  test("🔒 the same write outside the sweep, over a customer's own words, is still refused BODY_SHRINK", async () => {
    const OWN = para(
      `Our family has cooked here since 1984, ${"and every recipe is our grandmother's ".repeat(20)}`
    )
    const site = onePost(OWN)
    const ctx = wordpress({ send: site.send })
    await call(ctx, getPost42)
    const ownRev = createHash('sha256').update(OWN, 'utf8').digest('hex').slice(0, 12)

    const out = await call(ctx, { ...placeholder, params: { ...placeholder.params, rev: ownRev } })

    assert.equal(out.code, 'BODY_SHRINK')
    assert.equal(count(site.sent, 'content.update'), 0)
  })

  // The Willow Nook (lrsweep rig, 25/10/2026): post 41 held the template's lorem, and the agent's own shorter
  // post, sent by position with the rev, was refused twice. The template's lorem is residue, never the customer's.
  test("🔒 a block write that replaces the template's lorem may leave the body shorter, outside the sweep too", async () => {
    const TEMPLATE = [
      para(
        'In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo. Nullam dictum felis eu pede mollis pretium. Integer tincidunt. Cras dapibus. Vivamus elementum semper nisi.'
      ),
      para(
        'Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim. Aliquam lorem ante, dapibus in, viverra quis, feugiat a, tellus. Phasellus viverra nulla ut metus varius laoreet.'
      ),
      para(
        'Convallis nulla mauris, eget aucibus elit interdum quis. Proin a est ac nisl porta hendrerit vel itae odio uisque egestas neque a mauris.'
      )
    ].join('\n\n')
    const site = onePost(TEMPLATE)
    const ctx = wordpress({ send: site.send })
    await call(ctx, getPost42)
    const rev = createHash('sha256').update(TEMPLATE, 'utf8').digest('hex').slice(0, 12)

    const out = await call(ctx, {
      action: 'content.update',
      params: {
        kind: 'post',
        id: 42,
        rev,
        blocks: { 0: para('Cocktails on the sofa, from five.'), 1: null, 2: null }
      }
    })

    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
    assert.equal(count(site.sent, 'content.update'), 1)
  })

  test('🔒 the sweep with a rev from an older body is refused REVISION_STALE, nothing sent', async () => {
    const site = onePost(`${LOREM}\n\n${para('added since')}`)
    const ctx = wordpress({ send: site.send })
    await call(ctx, getPost42)

    const out = await withSweepRead(() => call(ctx, placeholder))

    assert.equal(out.code, 'REVISION_STALE')
    assert.equal(count(site.sent, 'content.update'), 0)
  })
}

// ── The residue sweep's research body on a Joomla template article (review of round 12, 26/10/2026) ──────────────

{
  const LOREM = `<p>${'Lorem ipsum dolor sit amet of the template. '.repeat(30)}</p>`
  const article = () => {
    const row = { id: '7', title: 'Sample', introtext: LOREM, fulltext: '' }
    const { send, sent } = relay((action, params) => {
      if (action === 'content.get') return { ok: true, kind: params.kind, id: 7, item: structuredClone(row) }
      Object.assign(row, params.fields)
      return { ok: true, kind: params.kind, id: 7, created: false }
    })
    return { row, send, sent }
  }
  const research = {
    action: 'content.update',
    params: { kind: 'article', id: 7, fields: { introtext: '<p>Groups of 5 to 20 can book.</p>' } }
  }

  test("🔒 the sweep writes a Joomla template article's research body on a read made for the write", async () => {
    const site = article()
    const ctx = joomla({ send: site.send, facts: { platform: 'joomla', sealed: false } })
    await call(ctx, { action: 'content.get', params: { kind: 'article', id: 7 } })

    const out = await withSweepRead(() => call(ctx, research))

    assert.equal(out.ok, true, JSON.stringify(out))
    assert.equal(site.row.introtext, '<p>Groups of 5 to 20 can book.</p>')
  })

  test('🔒 the same Joomla write outside the sweep, or inside it with no read, is still refused BODY_SHRINK', async () => {
    const site = article()
    const ctx = joomla({ send: site.send, facts: { platform: 'joomla', sealed: false } })
    const unread = await withSweepRead(() => call(ctx, research))
    assert.equal(unread.code, 'BODY_SHRINK')
    await call(ctx, { action: 'content.get', params: { kind: 'article', id: 7 } })
    const out = await call(ctx, research)
    assert.equal(out.code, 'BODY_SHRINK')
    assert.equal(site.row.introtext, LOREM)
  })
}
