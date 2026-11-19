// The planner's round 0 in writing turns of one conversation (ADR 0045 stage 1, plan-turns.js): off unless a run is
// started with harness.planTurns. Turn 1 plans the whole site, then one turn per page group in kit order, each later
// turn the next user message of the same conversation; the turns' plans merge into one plan, checked once, and each
// group's turn records its page-local check. Without the flag round 0 sends the same requests as a step that has no
// turn hooks at all. The run loop is played over an in-memory store (no database) and the scripted fake model of
// _agent-over-door-fake.mjs: no real model is called. Only the last test needs TEST_DATABASE_URL.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { after, before, beforeEach, test } from 'node:test'
import { runBenchRun } from '../src/lib/bench-run-loop.js'
import { runCli } from '../src/site-planner/bench-cli.js'
import { startBenchRun } from '../src/site-planner/bench-control.js'
import { PLANNER_BRIEF_VIEW } from '../src/site-planner/brief-view.js'
import {
  SITE_PLANNER_STEP,
  WRITE_STEP_MESSAGE,
  WRITE_TURN_STEP_MESSAGE
} from '../src/site-planner/bench-worker.js'
import { openKit } from '../src/site-planner/kit-source.js'
import { CHANGES_INSTRUCTION } from '../src/site-planner/plan-changes.js'
import { CHECKER_VERSION, checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { plannerPrompt } from '../src/site-planner/planner-prompt.js'
import {
  firstTurnInstruction,
  firstTurnMessage,
  groupTurnCheck,
  groupTurnMessage,
  mergePlanTurns,
  PAGE_LOCAL_RULES,
  plansInTurns,
  turnGroups
} from '../src/site-planner/plan-turns.js'
import { DOOR, finalReply, scriptedModel, toolCallReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { brief, decisionOf, kit, plan } from './_site-plan-check.mjs'
import { assignPlannerDoor, KIT_REF, readyKitImages, SECRET } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

// --- The passing plan of the checker tests, cut into the answers of its turns ---------------------------------------

const groupOfPage = (k) => new Map(k.pages.map((p) => [p.id, p.group]))

/** The answers a planner writing in turns would give for `p`: the whole site first, then each group's own entries. */
function turnAnswers(p = plan(), k = kit()) {
  const groupOf = groupOfPage(k)
  const { pageGroups, pages, ownerTasks, kitGaps, ...site } = p
  return [
    { ...site, ownerTasks, kitGaps },
    ...turnGroups(k).map((group) => ({
      pageGroups: pageGroups.filter((g) => g.id === group),
      pages: pages.filter((page) => groupOf.get(page.id) === group),
      ownerTasks: [],
      kitGaps: []
    }))
  ]
}

const checkOn = (k) => (p) => checkPlan({ plan: p, kit: k, brief: brief() })

test('a run plans in turns only when it was started with planTurns', () => {
  assert.equal(plansInTurns({ planTurns: true }), true)
  assert.equal(plansInTurns({}), false)
  assert.equal(plansInTurns({ planTurns: 'yes' }), false)
  assert.equal(plansInTurns(undefined), false)
  const ready = { kit: { doc: kit() } }
  assert.equal(SITE_PLANNER_STEP.writesInTurns({ row: { harness: {} }, ready }), false)
  assert.equal(SITE_PLANNER_STEP.writesInTurns({ row: { harness: { planTurns: true } }, ready }), true)
  // A kit without page groups has nothing to plan a turn for: the run plans round 0 as one answer.
  const empty = { kit: { doc: { ...kit(), pageGroups: [] } } }
  assert.equal(
    SITE_PLANNER_STEP.writesInTurns({ row: { harness: { planTurns: true } }, ready: empty }),
    false
  )
  // test-quality: contract the planner's turns are one conversation, so each group's turn sees the plan written before it (ADR 0045 stage 1)
  assert.equal(SITE_PLANNER_STEP.turnsInOneConversation, true)
})

test('turn 1 starts from the run first message and plans the whole site; each later turn plans one group, in kit order', () => {
  const k = kit()
  const groups = turnGroups(k)
  assert.deepEqual(
    groups,
    k.pageGroups.map((g) => g.id)
  )
  const first = firstTurnMessage('THE RUN FIRST MESSAGE', k)
  assert.ok(first.startsWith(`THE RUN FIRST MESSAGE\n\n# Planning in turns: turn 1 of ${groups.length + 1}`))
  assert.ok(first.endsWith(firstTurnInstruction(k)))
  assert.match(
    first,
    /This turn: everything of the whole site, and nothing else: site, mainMenu, sharedBlocks/
  )
  assert.match(first, /the voice, the forms, the legal pages, the not-found page and the footer menu/)
  assert.match(first, /- turn 2: group-home\n- turn 3: group-pages_users_login-form\n/)
  assert.match(first, /write nothing for them in pageGroups or pages now/)
  // A first message with images keeps its parts and gains the instruction as one more text part.
  const parts = firstTurnMessage([{ type: 'text', text: 'kit' }], k)
  assert.equal(parts.length, 2)
  assert.equal(parts[1].text, firstTurnInstruction(k))

  const classes = groups.indexOf('group-classes') + 1
  const message = groupTurnMessage(classes, k)
  assert.match(
    message,
    new RegExp(
      `^# Planning in turns: turn ${classes + 1} of ${groups.length + 1}, the page group group-classes\n`
    )
  )
  assert.match(
    message,
    /plans the page group group-classes and its pages \(page-classes, page-classes_advanced-boxing, /
  )
  assert.match(
    message,
    /write nothing for the whole site \(site, mainMenu, sharedBlocks\) or for another page group/
  )
  assert.doesNotMatch(message, /This is the last turn/)
  assert.match(groupTurnMessage(groups.length, k), /This is the last turn\. Once the turns are put together/)
  assert.equal(groupTurnMessage(groups.length + 1, k), null)
  assert.equal(groupTurnMessage(0, k), null)
})

test('the turns merge into the plan a whole answer would hold: the whole site from turn 1, each group from its own turn', () => {
  const k = kit()
  const whole = plan()
  const answers = turnAnswers(whole, k)
  // Fields a turn writes for what is not its own are not read: turn 1's pages, a group turn's site and menu.
  answers[0].pages = [{ id: 'page-home', decision: 'drop', why: 'not read' }]
  answers[1].site = { language: 'xx' }
  answers[1].sharedBlocks = []
  answers[1].ownerTasks = [
    { what: 'confirm the opening hours', why: 'the brief has none', unblocks: 'publishing' }
  ]
  const merged = mergePlanTurns(answers, k)
  assert.deepEqual(merged.site, whole.site)
  assert.deepEqual(merged.sharedBlocks, whole.sharedBlocks)
  assert.deepEqual(merged.mainMenu, whole.mainMenu)
  assert.equal(merged.version, whole.version)
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]))
  assert.deepEqual(byId(merged.pageGroups), byId(whole.pageGroups))
  assert.deepEqual(byId(merged.pages), byId(whole.pages))
  const pageOrder = k.pages.map((p) => p.id).filter((id) => merged.pages.some((p) => p.id === id))
  assert.deepEqual(
    merged.pages.map((p) => p.id),
    pageOrder
  )
  assert.deepEqual(merged.ownerTasks, [...whole.ownerTasks, answers[1].ownerTasks[0]])
  // Checked as one site, the merged plan scores as the whole answer does.
  assert.deepEqual(checkOn(k)(merged).summary, checkOn(k)(whole).summary)
  assert.equal(checkOn(k)(merged).summary.fail, 0)
  // A menu entry for a page its group's turn drops is taken out.
  const dropped = turnAnswers(whole, k)
  const about = turnGroups(k).indexOf('group-about-us') + 1
  dropped[about].pageGroups = [{ id: 'group-about-us', decision: 'drop', why: 'not for this business' }]
  dropped[about].pages = []
  assert.ok(whole.mainMenu.some((e) => e.page === 'page-about-us'))
  assert.ok(!mergePlanTurns(dropped, k).mainMenu.some((e) => e.page === 'page-about-us'))
})

test("a group turn's check keeps the page-local failures located in that group, and nothing of the whole site", () => {
  const k = kit()
  const groups = turnGroups(k)
  const about = groups.indexOf('group-about-us') + 1
  const broken = plan()
  // R05 (page-local) on page-about-us, R06 (page-local) on a shared block, R10d (across pages) on page-about-us.
  decisionOf(broken, 'block-190').lists[0].rows = 1
  decisionOf(broken, 'block-176').copy[0].maxCharacters = 41
  decisionOf(broken, 'block-190').links[0].leadsTo = 'page-plans'
  const answers = turnAnswers(broken, k)
  const failing = checkOn(k)(mergePlanTurns(answers, k))
    .rules.filter((r) => r.status === 'fail')
    .map((r) => r.id)
  assert.deepEqual(failing, ['R05', 'R06', 'R10d'])
  assert.deepEqual(groupTurnCheck({ answers: answers.slice(0, about + 1), kit: k, check: checkOn(k) }), {
    group: 'group-about-us',
    failures: 1,
    rules: ['R05']
  })
  const home = groupTurnCheck({ answers: answers.slice(0, 2), kit: k, check: checkOn(k) })
  assert.deepEqual(home, { group: 'group-home', failures: 0, rules: [] })
  // Turn 1 has no group of its own.
  assert.equal(groupTurnCheck({ answers: answers.slice(0, 1), kit: k, check: checkOn(k) }), null)
})

test('every way the check names a place is read: pages, paths, the group, a frame or slot of its blocks', () => {
  const k = kit()
  const groups = turnGroups(k)
  const about = groups.indexOf('group-about-us') + 1
  const answers = turnAnswers(plan(), k).slice(0, about + 1)
  const frame = k.blocks.find((b) => b.id === 'block-190').frames[0].id
  const sharedFrame = k.blocks.find((b) => b.id === 'block-176').frames?.[0]?.id ?? 'block-176.1'
  const at = (id, wheres) => ({ id, failures: wheres.map((where) => ({ where, detail: 'x' })) })
  let seen
  const check = (p) => {
    seen = p
    const home = p.pages.findIndex((page) => page.id === 'page-about-us')
    return {
      rules: [
        at('R07', ['page page-about-us / block block-190 / slot block-190.1', 'pages page-about-us / story']),
        at('R20', ['page-about-us', 'page-home']),
        at('R03', [`$.pages[${home}].blocks[0]`, '$.site.logo', '$.sharedBlocks[0]', 'site.logo']),
        at('R18', [`item block-190.item / frame ${frame}`, `item block-176 / frames ${sharedFrame}, x`]),
        at('R26', [frame, 'block-176.1']),
        at('R06', ['sharedBlocks[1] / block block-176 / slot block-176.1', 'site.forms[0]']),
        at('R12', ['page page-classes / block block-x / slot y']),
        // Rules that read across pages are not counted, wherever they point.
        at('R10d', ['page page-about-us / block block-190 / link block-190.link-1']),
        at('R04', ['pageGroups group-about-us']),
        at('V01', ['page-about-us'])
      ]
    }
  }
  const result = groupTurnCheck({ answers, kit: k, check })
  assert.deepEqual(result, {
    group: 'group-about-us',
    failures: 6,
    rules: ['R07', 'R20', 'R03', 'R18', 'R26']
  })
  // The check read the whole-site part with this group alone.
  assert.deepEqual(
    seen.pageGroups.map((g) => g.id),
    ['group-about-us']
  )
  assert.deepEqual(seen.site, plan().site)
  assert.ok(PAGE_LOCAL_RULES.includes('R26') && !PAGE_LOCAL_RULES.includes('R04'))
})

// --- The run loop over an in-memory store ---------------------------------------------------------------------------

/** The bench store's interface (lib/bench-run-store.js) in memory; `failOn(event)` loses the lease at that write. */
function memoryStore({ failOn = () => false } = {}) {
  const rounds = new Map()
  const turns = new Map()
  const clone = (x) => (x === undefined ? undefined : structuredClone(x))
  const lost = (event) => failOn(event) === true
  return {
    tables: Object.freeze({ docColumn: 'plan' }),
    rounds,
    turns,
    async setProgress() {
      return true
    },
    async saveBalance() {
      return true
    },
    async cancelAsked() {
      return false
    },
    async saveRound(_pool, input) {
      if (lost({ kind: 'round', ...input })) return false
      const { round, state } = input
      const was = rounds.get(round) ?? {
        round,
        answer: null,
        plan: null,
        checkResult: null,
        failureList: null
      }
      const keep = (field) => (input[field] !== undefined ? clone(input[field]) : (was[field] ?? null))
      rounds.set(round, {
        round,
        state,
        answer: keep('answer'),
        plan: keep('plan'),
        checkResult: keep('checkResult'),
        failureList: keep('failureList'),
        changes: keep('changes'),
        reading: keep('reading'),
        error: input.error ?? null
      })
      return true
    },
    async roundsOf() {
      return [...rounds.values()].sort((a, b) => a.round - b.round).map(clone)
    },
    async saveTurn(_pool, { round, turn }) {
      if (lost({ kind: 'turn', round, turn })) return false
      const had = turns.get(turn.n)
      if (turn.state === 'dispatched') {
        if (had) return false
      } else if (had?.state !== 'dispatched') return false
      turns.set(turn.n, { ...clone(turn), round })
      return true
    },
    async saveTurnProgress() {
      return true
    },
    async abandonTurn(_pool, { n }) {
      const had = turns.get(n)
      if (had?.state !== 'dispatched') return false
      turns.set(n, { ...had, state: 'abandoned', error: { code: 'TURN_ABANDONED' } })
      return true
    },
    async turnCountOf(_pool, _runId, round) {
      return [...turns.values()].filter((t) => t.round === round).length
    },
    async roundSent(_pool, _runId, round, content) {
      return [...turns.values()].some(
        (t) =>
          t.round === round &&
          (t.sent ?? []).some((m) => m?.role === 'user' && isDeepStrictEqual(m.content, content))
      )
    },
    async turnsOf() {
      return [...turns.values()].sort((a, b) => a.n - b.n).map(({ round: _round, ...turn }) => clone(turn))
    }
  }
}

/** The planner step on an in-memory store, prepared on the checker tests' kit with ready kit images. */
async function plannerOn(store, step = SITE_PLANNER_STEP) {
  const opened = openKit(KIT_REF)
  const ready = { ...opened, doc: kit() }
  const { images } = await readyKitImages().ensure(ready)
  return { ...step, store, prepare: async () => ({ ok: true, kit: ready, door: DOOR, images }) }
}

const runRow = (harness = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  harness: {
    briefView: PLANNER_BRIEF_VIEW,
    cacheMarkers: false,
    retry: { attempts: 1 },
    writeAfterToolTurns: 1,
    ...harness
  },
  kit: { ref: KIT_REF },
  brief: brief(),
  brief_source: { kind: 'file', name: 'harbour-sport-club.json' },
  prompt_sha256: plannerPrompt().sha256,
  checker_version: CHECKER_VERSION,
  door: { model: DOOR.model },
  step: 'waiting',
  round: 0,
  cancel_requested_at: null
})

/** Play one claim of a run; `{ end }` holds what the loop finished the run with, `{ lost: true }` a lost lease. */
async function play(step, row, model) {
  let end = null
  const lease = {
    token: 1,
    finish: async (fields) => {
      end = fields
      return true
    }
  }
  const ran = await runBenchRun(
    step,
    { pool: null, fetchImpl: model.fetchImpl, retry: { attempts: 1 } },
    row,
    lease
  )
  return ran === false ? { lost: true } : { end }
}

const readGroups = () =>
  toolCallReply({ calls: [['read_kit_part', { id: 'pageGroups' }]], usage: usageOf({ cost: 0.1 }) })
const answer = (value) => finalReply({ content: JSON.stringify(value), usage: usageOf({ cost: 0.2 }) })
const userTexts = (request) =>
  request.body.messages
    .filter((m) => m.role === 'user')
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join('')))
const lastUser = (request) => userTexts(request).at(-1)

test('a run started with planTurns writes round 0 as turns of one conversation, merges them and checks once', async () => {
  const store = memoryStore()
  const step = await plannerOn(store)
  const row = runRow({ planTurns: true })
  const k = kit()
  const groups = turnGroups(k)
  const answers = turnAnswers(plan(), k)
  const model = scriptedModel([readGroups(), ...answers.map(answer)])
  const { end } = await play(step, row, model)
  assert.equal(end.status, 'succeeded', end.error)
  assert.equal(model.left(), 0)
  assert.equal(model.requests.length, groups.length + 2)

  // One conversation: every request repeats the one before it, then adds that request's answer and the next message.
  const [first, ...later] = model.requests
  for (const [i, request] of later.entries()) {
    const before = model.requests[i].body.messages
    assert.deepEqual(
      request.body.messages.slice(0, before.length),
      before,
      `request ${i + 2} continues request ${i + 1}`
    )
    assert.equal(request.body.messages[0].content, first.body.messages[0].content, 'the same system prompt')
  }
  // Turn 1 opens with the run's own first message, then what the turn decides.
  const own = SITE_PLANNER_STEP.agentRequest({
    row,
    ready: { kit: { ...openKit(KIT_REF), doc: k }, images: {} },
    history: []
  })
  assert.equal(userTexts(first)[0], firstTurnMessage(own.firstUser, k))
  // The write step after the first read asks for this turn's answer; from then on no tool may be called.
  assert.ok(lastUser(later[0]).endsWith(WRITE_TURN_STEP_MESSAGE))
  assert.ok(model.requests.every((r) => !userTexts(r).some((t) => t.includes(WRITE_STEP_MESSAGE))))
  assert.ok(later.every((r) => r.body.tool_choice === 'none'))
  // Each later turn's message is its group's, sent once, in kit order.
  groups.forEach((group, i) => {
    const request = model.requests[i + 2]
    assert.equal(lastUser(request), groupTurnMessage(i + 1, k))
    assert.match(lastUser(request), new RegExp(`the page group ${group}\n`))
  })

  const [round, ...more] = [...store.rounds.values()]
  assert.equal(more.length, 0, 'the merged plan passed: no fix round')
  assert.equal(round.state, 'checked')
  assert.equal(round.failureList, '')
  assert.deepEqual(
    round.plan,
    SITE_PLANNER_STEP.readAnswer(mergePlanTurns(answers, k), { ready: { kit: { doc: k } } })
  )
  assert.equal(round.reading.conversationFrom, 0)
  assert.equal(round.reading.writingTurns.length, groups.length + 1)
  assert.deepEqual(
    round.reading.turnChecks,
    groups.map((group) => ({ group, failures: 0, rules: [] }))
  )
})

test('a group turn that breaks a page-local rule is recorded; the fix round goes on in the same conversation', async () => {
  const store = memoryStore()
  const step = await plannerOn(store)
  const k = kit()
  const broken = plan()
  decisionOf(broken, 'block-190').lists[0].rows = 1
  const answers = turnAnswers(broken, k)
  // The fix round answers with the whole plan, corrected.
  const model = scriptedModel([...answers.map(answer), answer(plan())])
  const { end } = await play(step, runRow({ planTurns: true }), model)
  assert.equal(end.status, 'succeeded', end.error)
  const [round0, round1] = [...store.rounds.values()]
  assert.deepEqual(
    round0.reading.turnChecks.filter((c) => c.failures),
    [{ group: 'group-about-us', failures: 1, rules: ['R05'] }]
  )
  assert.match(round0.failureList, /^R05 \| /)
  // The fix round's message follows the last turn's answer in the same conversation.
  const last = model.requests[answers.length - 1].body.messages
  const fixRound = model.requests[answers.length].body.messages
  assert.deepEqual(fixRound.slice(0, last.length), last)
  assert.equal(lastUser(model.requests[answers.length]), `${round0.failureList}${CHANGES_INSTRUCTION}`)
  assert.equal(round1.state, 'checked')
})

test('a round 0 resumed after a turn was answered but not recorded reads that answer back and sends the next turn once', async () => {
  const k = kit()
  const answers = turnAnswers(plan(), k)
  // The lease is lost at the record of the third turn: its answer is saved as a turn, not yet on the round.
  let armed = true
  const store = memoryStore({
    failOn: (e) => {
      if (!armed || e.kind !== 'round' || e.reading?.writingTurns?.length !== 3) return false
      armed = false
      return true
    }
  })
  const step = await plannerOn(store)
  const row = runRow({ planTurns: true })
  const firstClaim = scriptedModel(answers.slice(0, 3).map(answer))
  assert.deepEqual(await play(step, row, firstClaim), { lost: true })
  const secondClaim = scriptedModel(answers.slice(3).map(answer))
  const { end } = await play(step, row, secondClaim)
  assert.equal(end.status, 'succeeded', end.error)
  assert.equal(secondClaim.left(), 0)
  // Nothing was sent twice: the second claim starts at turn 4's message, after turn 3's saved answer.
  assert.equal(secondClaim.requests.length, answers.length - 3)
  assert.equal(lastUser(secondClaim.requests[0]), groupTurnMessage(3, k))
  const sentMessages = [...firstClaim.requests, ...secondClaim.requests].map(lastUser)
  assert.equal(new Set(sentMessages).size, sentMessages.length)
  const round = store.rounds.get(0)
  assert.equal(round.reading.writingTurns.length, answers.length)
  assert.equal(round.reading.turnChecks.length, answers.length - 1)
  assert.equal(round.reading.turnChecks[1].group, turnGroups(k)[1])
})

test('a later turn dispatched and never answered (a restart while it waited) is sent once more, not twice', async () => {
  const k = kit()
  const answers = turnAnswers(plan(), k)
  // The lease is lost when the answer of the third call comes back: that call stays dispatched.
  let armed = true
  const store = memoryStore({
    failOn: (e) => {
      if (!armed || e.kind !== 'turn' || e.turn.n !== 2 || e.turn.state !== 'answered') return false
      armed = false
      return true
    }
  })
  const step = await plannerOn(store)
  const row = runRow({ planTurns: true })
  const firstClaim = scriptedModel(answers.slice(0, 3).map(answer))
  assert.deepEqual(await play(step, row, firstClaim), { lost: true })
  const secondClaim = scriptedModel(answers.slice(2).map(answer))
  const { end } = await play(step, row, secondClaim)
  assert.equal(end.status, 'succeeded', end.error)
  // The resend carries the same messages as the lost call, then the run goes on with turn 4.
  assert.deepEqual(secondClaim.requests[0].body.messages, firstClaim.requests[2].body.messages)
  assert.equal(lastUser(secondClaim.requests[1]), groupTurnMessage(3, k))
  assert.equal(store.turns.get(2).state, 'abandoned')
  assert.equal(store.turns.get(3).resendOf, 2)
  const users = secondClaim.requests
    .at(-1)
    .body.messages.filter((m) => m.role === 'user')
    .map((m) => m.content)
  assert.equal(new Set(users).size, users.length, 'no turn message twice in the conversation')
})

test('without planTurns round 0 sends the same requests, byte for byte, as a planner step that has no turn hooks', async () => {
  const {
    writesInTurns: _w,
    turnsInOneConversation: _o,
    nextTurn: _n,
    mergeTurns: _m,
    checkTurn: _c,
    ...withoutHooks
  } = SITE_PLANNER_STEP
  const broken = plan()
  decisionOf(broken, 'block-190').lists[0].rows = 1
  // The same scripted replies for both runs (the fake numbers its tool calls as it builds them).
  const replies = [readGroups(), answer(broken), answer(plan())]
  const runs = []
  for (const s of [SITE_PLANNER_STEP, withoutHooks]) {
    const store = memoryStore()
    const model = scriptedModel(replies)
    const { end } = await play(await plannerOn(store, s), runRow(), model)
    runs.push({ end, model, rounds: [...store.rounds.values()] })
  }
  const [now, before] = runs
  assert.equal(now.end.status, before.end.status)
  assert.equal(now.model.requests.length, before.model.requests.length)
  now.model.requests.forEach((request, i) =>
    assert.equal(
      JSON.stringify(request.body),
      JSON.stringify(before.model.requests[i].body),
      `request ${i + 1}`
    )
  )
  assert.deepEqual(now.rounds, before.rounds)
  // And it is the planner's one conversation: its own first message, the whole-plan write step, no turn words.
  const ownFirst = SITE_PLANNER_STEP.agentRequest({
    row: runRow(),
    ready: { kit: { ...openKit(KIT_REF), doc: kit() }, images: {} },
    history: []
  }).firstUser
  assert.equal(userTexts(now.model.requests[0])[0], ownFirst)
  assert.ok(lastUser(now.model.requests[1]).endsWith(WRITE_STEP_MESSAGE))
  assert.ok(now.model.requests.every((r) => !JSON.stringify(r.body).includes('Planning in turns')))
  assert.ok(
    now.rounds.every((r) => !('writingTurns' in (r.reading ?? {})) && !('turnChecks' in (r.reading ?? {})))
  )
})

test('a step whose turns are requests of their own (the writer) still opens a fresh conversation for each turn', async () => {
  const store = memoryStore()
  const messages = ['TURN ONE', 'TURN TWO']
  const toy = {
    ...(await plannerOn(store)),
    parts: () => null,
    writesInTurns: undefined,
    turnsInOneConversation: undefined,
    checkTurn: undefined,
    nextTurn: ({ answers }) => messages[answers.length] ?? null,
    mergeTurns: (answers) => ({ ...answers[0], ...answers[1] })
  }
  const { pageGroups, pages, ...site } = plan()
  const model = scriptedModel([answer(site), answer({ pageGroups, pages })])
  const { end } = await play(toy, runRow(), model)
  assert.equal(end.status, 'succeeded', end.error)
  assert.deepEqual(
    model.requests.map((r) => userTexts(r)),
    [['TURN ONE'], ['TURN TWO']]
  )
  assert.equal(store.rounds.get(0).reading.conversationFrom, 1)
  assert.equal(store.rounds.get(0).reading.turnChecks, undefined)
})

// --- Starting a run --------------------------------------------------------------------------------------------------

test('plan turns cannot start beside parallel pages above 1; nothing is read before the refusal', async () => {
  const refused = await startBenchRun({ pool: null, planTurns: true, parallelPages: 2 })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'SITE_PLANNER_BAD_PLAN_TURNS')
  const dir = mkdtempSync(path.join(tmpdir(), 'site-planner-turns-'))
  try {
    writeFileSync(path.join(dir, 'hsc.json'), JSON.stringify(brief()))
    const err = []
    const code = await runCli(
      ['run', '--kit', KIT_REF, '--brief-file', 'hsc.json', '--plan-turns', '--parallel-pages', '3'],
      {
        pool: null,
        secret: SECRET,
        kitImages: readyKitImages(),
        cwd: dir,
        out: () => {},
        err: (l) => err.push(l)
      }
    )
    assert.equal(code, 1)
    assert.match(
      err.join('\n'),
      /^SITE_PLANNER_BAD_PLAN_TURNS: The run cannot start: plan turns writes round 0 as one conversation/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test(
  'the CLI plan-turns flag freezes planTurns on the queued run; without it the harness has no such key',
  opts,
  async () => {
    await assignPlannerDoor(db.pool)
    const dir = mkdtempSync(path.join(tmpdir(), 'site-planner-turns-'))
    try {
      writeFileSync(path.join(dir, 'hsc.json'), JSON.stringify(brief()))
      const start = async (...extra) => {
        const out = []
        const err = []
        const code = await runCli(['run', '--kit', KIT_REF, '--brief-file', 'hsc.json', ...extra], {
          pool: db.pool,
          secret: SECRET,
          kitImages: readyKitImages(),
          cwd: dir,
          out: (l) => out.push(l),
          err: (l) => err.push(l)
        })
        assert.equal(code, 0, err.join('\n'))
        const { rows } = await db.pool.query('select harness from site_planner_run where id = $1', [
          out.at(-1)
        ])
        return rows[0].harness
      }
      assert.equal((await start('--plan-turns', '--parallel-pages', '1')).planTurns, true)
      assert.equal('planTurns' in (await start()), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)
