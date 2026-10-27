import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createCallMemory } from '../src/host/call-memory.mjs'
import {
  EMDASH_INDEX_SCRIPT,
  EMDASH_WRITE_SCRIPT,
  parseEmdashIndex,
  parseEmdashWrite
} from '../src/host/exec.mjs'
import { canonicalCall, WRITER_LOCK_MESSAGE } from '../src/host/site.mjs'
import { changesSite, replaceWroteSome, resultOutcomeUnknown } from '../src/host/site-context.mjs'
import { answerContent } from '../src/host/look.mjs'
import {
  createDryRunMemory,
  replaceAliases,
  runReplace,
  TIMING_KEY,
  timingMeta
} from '../src/host/replace-road.mjs'
import { EMDASH_REPLACE_NEXT } from '../src/host/replace-emdash.mjs'
import { createFakeEmdash, runScript } from './fixtures/replace/emdash/fake-emdash.mjs'
import { TOKEN_PAGES, tokenSite } from './fixtures/replace/fake-wordpress.mjs'

// The replace job's host road (IX2, PR2): which engine a site gets, and the fences it keeps.

const FIXTURES = new URL('./fixtures/replace/', import.meta.url)
const SITE = JSON.parse(readFileSync(new URL('emdash/site.json', FIXTURES), 'utf8'))
const HOME = readFileSync(new URL('pages/emdash-home.html', FIXTURES), 'utf8')
const STRUCTURE = ['settings_update', 'menu_set_items']

/** The benchemdash01 baseline behind the REAL index and write scripts, every MCP call recorded. */
function emdashRoad() {
  const em = createFakeEmdash(SITE)
  return {
    em,
    road: {
      index: async (req) =>
        parseEmdashIndex(await runScript(EMDASH_INDEX_SCRIPT, { fetch: em.fetch, stdin: req })),
      write: async (req) =>
        parseEmdashWrite(await runScript(EMDASH_WRITE_SCRIPT, { fetch: em.fetch, stdin: req })),
      artifact: SITE.artifact
    }
  }
}

const noDoor = async () => assert.fail('an EmDash replace never reaches the Apply door')

function onEmdash(params, { contractBound, clock, planAgreed }) {
  const { em, road } = emdashRoad()
  return runReplace({
    params,
    platform: 'emdash',
    contractDoor: false,
    contractBound,
    sessionId: 's1',
    label: 'benchemdash01',
    memory: createCallMemory(),
    dryRuns: createDryRunMemory(),
    send: noDoor,
    siteCall: noDoor,
    pageHtml: async (p) =>
      p === '/' ? { ok: true, status: 200, html: HOME } : { ok: false, code: 'READ_FAILED' },
    emdash: async () => road,
    ...(clock ? { clock } : {}),
    ...(planAgreed ? { planAgreed } : {})
  }).then((out) => ({ out, sent: em.calls.filter((c) => STRUCTURE.includes(c.name)), em }))
}

/**
 * One EmDash replace whose INDEX read answers `reads[n]` (`'ok'` = the real script on the fake site,
 * anything else = that failure), through one call memory shared between the calls of a test.
 * @param {ReturnType<typeof createCallMemory>} memory
 * @param {string} label
 * @param {Array<'ok' | Record<string, unknown>>} reads
 */
async function onEmdashReads(memory, label, reads) {
  const { road } = emdashRoad()
  let n = 0
  const real = road.index
  return runReplace({
    params: { find: 'Northgate Industrial', replace: 'Northgate Group', path: '/' },
    platform: 'emdash',
    contractDoor: false,
    sessionId: 's1',
    label,
    memory,
    dryRuns: createDryRunMemory(),
    send: noDoor,
    siteCall: noDoor,
    pageHtml: async (p) =>
      p === '/' ? { ok: true, status: 200, html: HOME } : { ok: false, code: 'READ_FAILED' },
    emdash: async () => ({
      ...road,
      index: async (req) => {
        const one = reads[Math.min(n++, reads.length - 1)]
        return one === 'ok' ? real(req) : /** @type {any} */ (one)
      }
    })
  })
}

const DEADLINE = { ok: false, kind: 'deadline', error: 'the index ran past 45000 ms' }

test('🔒 round 7: the second read failure of one site says only the road that worked; a read that answered ends the run', async () => {
  const memory = createCallMemory()
  const first = await onEmdashReads(memory, 'benchemdash04', [DEADLINE])
  assert.equal(first.code, 'SITE_UNREACHABLE')
  assert.equal(first.next, EMDASH_REPLACE_NEXT.readFailedNext, 'the first names both roads')
  const second = await onEmdashReads(memory, 'benchemdash04', [DEADLINE])
  assert.equal(second.code, 'SITE_UNREACHABLE')
  assert.equal(second.next, EMDASH_REPLACE_NEXT.readFailedAgainNext, 'the repeat: the road alone')
  assert.equal(second.error, first.error, 'only the next changes')
  const third = await onEmdashReads(memory, 'benchemdash04', [DEADLINE])
  assert.equal(third.next, EMDASH_REPLACE_NEXT.readFailedAgainNext, 'and it stays so')
  // another site is another fact
  const other = await onEmdashReads(memory, 'benchemdash05', [DEADLINE])
  assert.equal(other.next, EMDASH_REPLACE_NEXT.readFailedNext)
  // a read that answered ends the run: the next failure is a first again
  const served = await onEmdashReads(memory, 'benchemdash04', ['ok'])
  assert.equal(served.ok, true, JSON.stringify(served))
  const fresh = await onEmdashReads(memory, 'benchemdash04', [DEADLINE])
  assert.equal(fresh.next, EMDASH_REPLACE_NEXT.readFailedNext)
})

test('the run of read failures ends after ten minutes, and other refusals leave it alone', async () => {
  let clock = 0
  const memory = createCallMemory({ now: () => clock })
  await onEmdashReads(memory, 'benchemdash04', [DEADLINE])
  clock += 9 * 60_000
  const soon = await onEmdashReads(memory, 'benchemdash04', [DEADLINE])
  assert.equal(soon.next, EMDASH_REPLACE_NEXT.readFailedAgainNext)
  clock += 11 * 60_000
  const late = await onEmdashReads(memory, 'benchemdash04', [DEADLINE])
  assert.equal(late.next, EMDASH_REPLACE_NEXT.readFailedNext, 'a failure long after the last is a first')
  // EmDash refusing the read is TOOL_FAILED with its own next: never rewritten, never counted
  const refused = await onEmdashReads(memory, 'benchemdash04', [
    { ok: false, kind: 'tool', error: 'settings_get: [FORBIDDEN] no' }
  ])
  assert.equal(refused.code, 'TOOL_FAILED')
  assert.equal(refused.next, EMDASH_REPLACE_NEXT.readRefusedNext)
  const after = await onEmdashReads(memory, 'benchemdash04', [DEADLINE])
  assert.equal(after.next, EMDASH_REPLACE_NEXT.readFailedAgainNext, 'the refusal did not end the run')
})

// ADR 0022 (Lee, 26/09/2026): an EmDash quickstart locks nothing but direct database writes, so the
// site name in `settings#title` is written like on any EmDash site.
test('an EmDash site, a quickstart one included, writes the settings a change reaches', async () => {
  const run = await onEmdash({ find: 'Northgate Industrial', replace: 'Northgate Group', path: '/' }, {})
  assert.ok(run.sent.length > 0, 'the change reaches the settings')
})

test('the aliases a model gives are mapped once, said in `normalized`, and a name given twice is left for planReplace', () => {
  assert.deepEqual(replaceAliases({ from: 'a', to: 'b', dry_run: true }), {
    params: { find: 'a', replace: 'b', dryRun: true },
    notes: ['from → find', 'to → replace', 'dry_run → dryRun']
  })
  assert.deepEqual(replaceAliases({ find: 'a', from: 'b' }).params, { find: 'a', from: 'b' })
})

test('`dry_run` reads as a dryRun for the step counter and the preview, as the job reads it', () => {
  const call = { action: 'content.replace', params: { find: 'a', replace: 'b', dry_run: true } }
  assert.equal(canonicalCall(call).params.dryRun, true)
  assert.equal(changesSite(call), false)
})

test('a replace answer that says places were written counts as a change, whatever its ok', () => {
  assert.equal(replaceWroteSome({ ok: false, code: 'PARTIAL', written: ['a'] }), true)
  assert.equal(replaceWroteSome({ ok: false, code: 'STORE_CHANGED', written: [] }), true)
  assert.equal(replaceWroteSome({ ok: false, code: 'TOOL_FAILED', written: ['x'] }), true)
  assert.equal(replaceWroteSome({ ok: false, code: 'SITE_BUSY', written: 2, partial: true }), true)
  assert.equal(replaceWroteSome({ ok: false, code: 'NOT_FOUND' }), false)
  const result = (answer) => ({
    message: { content: [{ type: 'tool-result', content: [{ type: 'text', text: JSON.stringify(answer) }] }] }
  })
  assert.equal(
    resultOutcomeUnknown(result({ ok: false, code: 'PARTIAL', written: ['content:site/x@en#hotline'] })),
    true
  )
  assert.equal(resultOutcomeUnknown(result({ ok: false, code: 'NOT_FOUND' })), false)
})

// #316 H4: the Joomla snapshot is the one relay the replace road sends itself (the applies go through
// `runSiteCall`); it now waits out the component's lock and asks a lost answer once more, as every
// inspect `runSiteCall` sends does.
const SNAP_12 = JSON.parse(readFileSync(new URL('joomla/inspect-1.2.0.json', FIXTURES), 'utf8'))
const HOME_12 = readFileSync(new URL('pages/joomla-home.html', FIXTURES), 'utf8')
const LOCK = { ok: false, error: 'writer_busy', message: WRITER_LOCK_MESSAGE }
const LOST = { ok: false, code: 'COMPONENT_UNREACHABLE', error: 'the site did not answer' }

/** A dryRun on a bound Joomla site whose inspect answers `answers` in turn (the last one repeated). */
async function onJoomla(answers) {
  const queue = [...answers]
  /** @type {string[]} */
  const sent = []
  /** @type {number[]} */
  const waits = []
  const out = await runReplace({
    params: { find: 'Selected projects', replace: 'Featured projects', dryRun: true },
    platform: 'joomla',
    contractDoor: true,
    contractBound: true,
    sessionId: 's1',
    label: 'benchjoomla01',
    actorKey: 'an@example.test',
    memory: createCallMemory(),
    dryRuns: createDryRunMemory(),
    send: async (action, params) => {
      sent.push(`${action} ${String(params.operation)}`)
      return queue.length > 1 ? queue.shift() : queue[0]
    },
    siteCall: async () => assert.fail('a dryRun writes nothing'),
    pageHtml: async () => ({ ok: true, status: 200, html: HOME_12 }),
    clock: { now: () => 0, random: () => 0.5, sleep: async (ms) => void waits.push(ms) }
  })
  return { out, sent, waits }
}

test('🔒 #316 H4: the Joomla snapshot waits out a lock miss on the lock-retry schedule, and gets the inspect', async () => {
  const { out, sent, waits } = await onJoomla([LOCK, LOCK, SNAP_12])
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(sent, Array(3).fill('content.contract inspect'))
  assert.deepEqual(waits, [3_000, 6_000])
  // A lock that never frees: three retries (19 s at most), then the lock miss is answered as it is.
  const held = await onJoomla([LOCK])
  assert.equal(held.sent.length, 4)
  assert.deepEqual(held.waits, [3_000, 6_000, 10_000])
  assert.notEqual(held.out.ok, true)
})

test('🔒 #316 H4: a lost snapshot answer is asked once more after 2 s — and only once', async () => {
  const { out, sent, waits } = await onJoomla([LOST, SNAP_12])
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(sent.length, 2)
  assert.deepEqual(waits, [2_000])
  const gone = await onJoomla([LOST])
  assert.equal(gone.sent.length, 2)
  assert.notEqual(gone.out.ok, true)
})

// S5: the replace job's phases ride the answer to `tool/result.meta`, never to the model's text.
const PHASES = ['fetch', 'snapshot', 'index', 'write', 'verify', 'locate']

test('S5: an EmDash replace carries its phases — road, page, index, write, then the re-read as verify', async () => {
  const { out } = await onEmdash({ find: 'Northgate Industrial', replace: 'Northgate Group', path: '/' }, {})
  const t = out[TIMING_KEY]
  assert.equal(t.platform, 'emdash')
  assert.deepEqual(Object.keys(t.phases).sort(), [...PHASES].sort())
  for (const phase of PHASES) assert.ok(Number.isInteger(t.phases[phase]) && t.phases[phase] >= 0, phase)
  assert.ok(t.totalMs >= 0)
  assert.deepEqual(
    t.calls.map((c) => `${c.action}:${c.phase}`),
    ['road:snapshot', 'page:fetch', 'index:index', 'write:write', 'page:verify']
  )
  assert.deepEqual(timingMeta(out), { replace: t })
  assert.equal(timingMeta({ ok: true }), null, 'every other answer projects null meta')
})

test('S5: a Joomla dryRun times the inspect and the page read side by side, and writes nothing', async () => {
  const { out } = await onJoomla([SNAP_12])
  assert.equal(out.ok, true, JSON.stringify(out))
  const t = out[TIMING_KEY]
  assert.equal(t.platform, 'joomla-contract')
  assert.deepEqual(t.calls.map((c) => c.phase).sort(), ['fetch', 'snapshot'])
  assert.equal(t.phases.write, 0)
  assert.equal(t.phases.verify, 0)
})

test('🔒 S5: the model-visible answer is byte-identical with and without timing', async () => {
  const params = { find: 'Northgate Industrial', replace: 'Northgate Group', path: '/' }
  // Two runs of the same change on two clocks: the timings differ, the model's text must not.
  let tick = 0
  const slow = { now: () => (tick += 250) }
  const a = (await onEmdash(params, {})).out
  const b = (await onEmdash(params, { clock: slow })).out
  assert.notDeepEqual(a[TIMING_KEY].phases, b[TIMING_KEY].phases)
  const { [TIMING_KEY]: _t, ...without } = a
  const shownA = answerContent(a, [TIMING_KEY])
  assert.deepEqual(shownA, [{ type: 'text', text: JSON.stringify(without) }])
  assert.deepEqual(answerContent(b, [TIMING_KEY]), shownA)
  assert.doesNotMatch(shownA[0].text, /_timing|totalMs|"phases"/)
})

// 🔒 G3 (27/09/2026, A1 WP C04: `where:"all"` answered BAD_PARAMS, then the agent explored theme files).
test('🔒 G3: where naming a reach, not a region, becomes all', () => {
  for (const [where, all] of [
    ['all', true],
    ['Everywhere', true],
    ['*', true],
    ['page', 'page']
  ]) {
    const { params } = canonicalCall({
      action: 'content.replace',
      params: { find: 'a', replace: 'b', where }
    })
    assert.equal(params.all, all, where)
    assert.equal('where' in params, false, where)
  }
  // A real region stays, and an `all` the model sent wins.
  assert.equal(
    canonicalCall({ action: 'content.replace', params: { find: 'a', replace: 'b', where: 'footer' } }).params
      .where,
    'footer'
  )
  assert.equal(
    canonicalCall({
      action: 'content.replace',
      params: { find: 'a', replace: 'b', where: 'all', all: 'page' }
    }).params.all,
    'page'
  )
})

/**
 * One WordPress replace through the road on the identity fixture, as `index.ts` runs it.
 * @param {boolean} contractDoor - the site's surface has `content.contract` (`wordpress-contract`)
 */
async function onTokenSite(contractDoor) {
  const site = tokenSite()
  const out = await runReplace({
    params: { find: 'Golden Crust Bakery', replace: 'Golden Crust Ltd' },
    platform: 'wordpress',
    contractDoor,
    sessionId: 's1',
    label: 'benchwp01',
    memory: createCallMemory(),
    dryRuns: createDryRunMemory(),
    send: site.door,
    siteCall: site.door,
    pageHtml: async (p) =>
      p in TOKEN_PAGES
        ? { ok: true, status: 200, html: TOKEN_PAGES[/** @type {keyof typeof TOKEN_PAGES} */ (p)] }
        : { ok: false, code: 'READ_FAILED' }
  })
  return { out: /** @type {any} */ (out), site }
}

test('a WordPress site with the contract door: words an identity token prints are answered with its identity slot', async () => {
  const sealed = await onTokenSite(true)
  assert.equal(sealed.out.code, 'SITE_IDENTITY', JSON.stringify(sealed.out))
  assert.ok(
    sealed.out.next.includes(
      'content.contract {operation:"apply", changes:{"identity.legalName":"Golden Crust Ltd"}}'
    ),
    sealed.out.next
  )
  assert.deepEqual(sealed.site.writes(), [])
  // the same site on an open surface: the option itself is the door
  const open = await onTokenSite(false)
  assert.equal(open.out.code, 'SITE_IDENTITY', JSON.stringify(open.out))
  assert.match(open.out.next, /content\.update \{kind:"option", key:"tracy_site_identity"/)
})

// A one-press build's saved plan is the customer's yes to the places it writes (`index.ts` `demoPlanAgreed`):
// the build is not stopped mid-way on a question nobody is at the chat to answer (pilot 23/10/2026).
test('many places at once: asked without a saved build plan, written with one, asked again when the plan is not agreed', async () => {
  const call = { find: 'Northgate Industrial', replace: 'Northgate Group', all: true }
  const writes = (em) => em.calls.filter((c) => c.name === 'content_update').length
  const asked = await onEmdash(call, {})
  assert.equal(asked.out.code, 'CONFIRM_FIRST', JSON.stringify(asked.out).slice(0, 300))
  assert.equal(writes(asked.em), 0)
  const refused = await onEmdash(call, { planAgreed: async () => false })
  assert.equal(refused.out.code, 'CONFIRM_FIRST')
  assert.equal(writes(refused.em), 0)
  const planned = await onEmdash(call, { planAgreed: async () => true })
  assert.equal(planned.out.ok, true, JSON.stringify(planned.out).slice(0, 300))
  assert.ok(writes(planned.em) >= 1)
})
