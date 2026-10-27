/**
 * A running chat turn holds a deploy lease, and a follow-up sent while the deploy drains is held in
 * the queue and released by the next process (#295), followed by id until it ran (#517). Measured 24/09 on dev: a drain that saw only
 * imports recreated dsh under a turn that had run 14m40s and written to the site.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, mock, test } from 'node:test'

import {
  chatLeases,
  chatSessionId,
  HELD_FILE,
  heldPrompts,
  MAX_ATTEMPTS,
  mayResend,
  messageFates,
  queuedMessages,
  verdict,
  CUT,
  GONE,
  NOT_RUN,
  NOTICE_ID,
  NOTICE_TTL_MS,
  questionLeaseWaterfall,
  readHeldFile,
  SESSION_ID,
  wireDeployHold,
  writeHeldFile
} from '../src/host/deploy-hold.mjs'

let home
let previous
beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'deploy-hold-'))
  previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
})
afterEach(() => {
  if (previous === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previous
  rmSync(home, { recursive: true, force: true })
})

const leaseFile = (id) => path.join(home, 'leases', `chat-${id}.json`)

test('a running turn in a site holds one chat lease, and stopping releases it', () => {
  const chats = chatLeases()
  chats.status('s1', 'running', 'wp-abc')
  chats.status('s1', 'running', 'wp-abc')
  const { id, kind, siteKey, sessionId, heartbeatAt } = JSON.parse(readFileSync(leaseFile('s1'), 'utf8'))
  assert.deepEqual(
    { id, kind, siteKey, sessionId },
    { id: 'chat-s1', kind: 'chat', siteKey: 'wp-abc', sessionId: 's1' }
  )
  assert.ok(heartbeatAt, 'the deploy judges freshness by the heartbeat')
  assert.deepEqual(chats.running(), ['s1'])
  chats.status('s1', 'idle', null)
  assert.equal(existsSync(leaseFile('s1')), false)
  assert.deepEqual(chats.running(), [])
})

test('a turn outside any site holds no lease; releaseAll drops every lease', () => {
  const chats = chatLeases()
  chats.status('nosite', 'running', null)
  assert.equal(existsSync(leaseFile('nosite')), false)
  chats.status('a', 'running', 'k1')
  chats.status('b', 'running', 'k2')
  chats.releaseAll()
  assert.equal(existsSync(leaseFile('a')), false)
  assert.equal(existsSync(leaseFile('b')), false)
})

// ── #561: a turn waiting only on its customer's answer holds no lease ──────────────────────────
// dsh reports such a turn `running` until the answer comes; measured 29/09 on dev, one held a deploy
// for the full 1200 s drain. The real loop is in deploy-hold-restart.test.mjs; these pin the edges.

test('a question releases the turn’s lease while pending and takes it back once, for that turn only', () => {
  const chats = chatLeases()
  chats.status('s1', 'running', 'wp-abc')
  chats.status('s2', 'running', 'wp-def')
  const resume = chats.waitingForUser('s1')
  assert.equal(existsSync(leaseFile('s1')), false)
  assert.equal(existsSync(leaseFile('s2')), true, 'another session keeps its own lease')
  assert.deepEqual(chats.running(), ['s2'])
  resume()
  assert.equal(existsSync(leaseFile('s1')), true)
  assert.equal(JSON.parse(readFileSync(leaseFile('s1'), 'utf8')).siteKey, 'wp-abc')
  resume()
  assert.deepEqual(chats.running().sort(), ['s1', 's2'])
  chats.status('s1', 'idle', null)
  assert.equal(existsSync(leaseFile('s1')), false)
  chats.releaseAll()
})

test('an answer that comes after its turn ended, or after a new turn began, changes nothing', () => {
  const chats = chatLeases()
  // Ended: idle (a cancel, the stop button, an archive) before the question settled.
  chats.status('s1', 'running', 'wp-abc')
  const late = chats.waitingForUser('s1')
  chats.status('s1', 'idle', null)
  late()
  assert.equal(existsSync(leaseFile('s1')), false, 'a late answer never brings an ended turn’s lease back')
  // Replaced: a new turn holds its own lease; the old answer neither takes nor drops it.
  chats.status('s1', 'running', 'wp-abc')
  const old = chats.waitingForUser('s1')
  chats.status('s1', 'idle', null)
  chats.status('s1', 'running', 'wp-abc')
  old()
  assert.equal(existsSync(leaseFile('s1')), true)
  chats.status('s1', 'idle', null)
  assert.equal(existsSync(leaseFile('s1')), false)
  // Disposed: releaseAll (plugin unload) then an answer.
  chats.status('s1', 'running', 'wp-abc')
  const disposed = chats.waitingForUser('s1')
  chats.releaseAll()
  disposed()
  assert.equal(existsSync(leaseFile('s1')), false)
  assert.deepEqual(chats.running(), [])
})

test('two pending questions of one turn: the lease comes back only after both settled', () => {
  const chats = chatLeases()
  chats.status('s1', 'running', 'wp-abc')
  const first = chats.waitingForUser('s1')
  const second = chats.waitingForUser('s1')
  first()
  assert.equal(existsSync(leaseFile('s1')), false)
  second()
  assert.equal(existsSync(leaseFile('s1')), true)
  chats.releaseAll()
})

test('a session with no lease (outside a site, or not running) is left alone by a question', () => {
  const chats = chatLeases()
  chats.status('nosite', 'running', null)
  chats.waitingForUser('nosite')()
  chats.waitingForUser('never')()
  assert.equal(existsSync(leaseFile('nosite')), false)
  assert.equal(existsSync(leaseFile('never')), false)
  assert.deepEqual(chats.running(), [])
})

test('the question waterfall delegates once and keeps the answer and the error as they are', async () => {
  const chats = chatLeases()
  chats.status('s1', 'running', 'wp-abc')
  const listener = questionLeaseWaterfall(chats)
  const answer = { answers: [{ id: 'go', selected: ['Yes'] }] }
  let calls = 0
  /** @type {boolean[]} */
  const held = []
  const got = await listener({ agent: { id: 's1' } }, async () => {
    calls++
    held.push(existsSync(leaseFile('s1')))
    return answer
  })
  assert.equal(got, answer)
  assert.equal(calls, 1)
  assert.deepEqual(held, [false], 'no lease while the answerers wait')
  assert.equal(existsSync(leaseFile('s1')), true, 'back once it settled')
  const refused = new Error('ASK_ABORTED')
  await assert.rejects(
    listener({ agent: { session: { id: 's1' } } }, async () => {
      assert.equal(existsSync(leaseFile('s1')), false)
      throw refused
    }),
    (error) => error === refused
  )
  assert.equal(existsSync(leaseFile('s1')), true, 'an error settles the question too')
  // No agent, or one without a session id: nothing is guessed, the chain runs as it would.
  for (const request of [{}, { agent: {} }, { agent: { id: 7 } }, null]) {
    assert.equal(await listener(request, async () => 'passed'), 'passed')
    assert.equal(existsSync(leaseFile('s1')), true)
  }
  chats.releaseAll()
})

test('the session an agent event is about: its id, else its session’s, else none', () => {
  assert.equal(chatSessionId({ id: 'a', session: { id: 'b' } }), 'a')
  assert.equal(chatSessionId({ session: { id: 'b' } }), 'b')
  assert.equal(chatSessionId({ id: 3 }), null)
  assert.equal(chatSessionId(undefined), null)
})

const S1 = 'session-one'
const S2 = 'session-two'
const heldFile = () => path.join(home, HELD_FILE)
/** A session dsh has loaded, whose log says `entries`. */
const seen = (entries) => () => {
  const fates = new Map(entries)
  return { fates: () => fates }
}
/** The notice ids a page standing anywhere is shown for `sessionId`: what it confirms after drawing them. */
const drawn = (queue, sessionId) => {
  const { id, earlier } = queue.status(sessionId, undefined)
  return [...earlier.map((n) => n.id), ...(id === null ? [] : [id])]
}
const record = (id) => {
  const read = readHeldFile(home)
  assert.equal(read.ok, true, read.ok ? '' : read.reason)
  return read.sessions.get(id)
}

test('prompt-hold answers true only while draining, and writes the session and its site down', () => {
  let drain = false
  const held = heldPrompts({ draining: () => drain, dir: home })
  assert.equal(held.hold(S1, { site: 'wp-demo' }), undefined)
  assert.equal(existsSync(heldFile()), false)
  drain = true
  assert.equal(held.hold(S1, { site: 'wp-demo' }), true)
  assert.equal(held.hold(S1, { site: 'wp-demo' }), true)
  assert.equal(record(S1).state, 'held')
  assert.equal(record(S1).site, 'wp-demo')
  held.queued(S1, 'm1')
  held.queued(S1, 'm2')
  held.queued(S1, 'm1')
  assert.deepEqual(record(S1).messages, ['m1', 'm2'])
  assert.equal(held.keeps(S1), true)
  assert.equal(held.keeps(S2), false)
})

test('the author of a held message is told it is held; another site learns nothing', () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1, { site: 'wp-demo' })
  held.queued(S1, 'm1')
  const HELD = { state: 'held', count: 1, recorded: true, settled: false, id: null, earlier: [] }
  const NONE = { state: 'none', count: 0, recorded: false, settled: true, id: null, earlier: [] }
  assert.deepEqual(held.status(S1, 'wp-demo'), HELD)
  assert.deepEqual(held.status(S1, undefined), HELD)
  assert.deepEqual(held.status(S1, 'wp-other'), NONE)
  assert.deepEqual(held.status(S1, null), NONE)
  assert.deepEqual(held.status(S2, 'wp-demo'), NONE)
})

test('nothing is released while the drain is on; after it, each held session is woken once', async () => {
  let drain = true
  const held = heldPrompts({ draining: () => drain, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  held.hold(S2)
  held.queued(S2, 'b')
  const calls = []
  const release = async (id) => (calls.push(id), 1)
  assert.equal(await held.releaseReady(release, () => false), 0)
  assert.deepEqual(calls, [])
  drain = false
  assert.equal(await held.releaseReady(release, () => false), 2)
  assert.deepEqual(calls, [S1, S2])
  assert.equal(record(S1).state, 'released')
  // Released is not done: the log must show the turn of each message ended before the record ends.
  const claimed = seen([
    ['a', 'ran'],
    ['b', 'ran']
  ])
  assert.equal(await held.releaseReady(release, () => false, claimed), 0)
  assert.deepEqual(calls, [S1, S2], 'a released session is never released again')
  assert.deepEqual(held.pending(), [])
})

test('a released message still pending on an idle agent is released again, not dropped', async () => {
  const writer = heldPrompts({ draining: () => true, dir: home })
  writer.hold(S1)
  writer.queued(S1, 'a')
  const again = heldPrompts({ draining: () => false, dir: home })
  let calls = 0
  const release = async () => (calls += 1)
  await again.releaseReady(release, () => false, seen([['a', 'pending']]))
  assert.equal(calls, 1)
  await again.releaseReady(release, () => false, seen([['a', 'pending']]))
  assert.equal(record(S1).state, 'held', 'idle with the message still queued: back to held')
  await again.releaseReady(release, () => false, seen([['a', 'pending']]))
  assert.equal(calls, 2)
})

test('a session whose agent is running keeps its record until the turn that claimed the messages ended', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  const after = heldPrompts({ draining: () => false, dir: home })
  let running = true
  const zero = async () => 0
  await after.releaseReady(zero, () => running, seen([['a', 'pending']]))
  assert.deepEqual(after.pending(), [S1])
  // Claimed by the running turn: not answered yet.
  await after.releaseReady(zero, () => running, seen([['a', 'claimed']]))
  assert.deepEqual(after.pending(), [S1])
  running = false
  await after.releaseReady(zero, () => running, seen([['a', 'ran']]))
  assert.deepEqual(after.pending(), [])
  assert.equal(record(S1), undefined)
})

test('a message that went to the model in a turn that never ended, or that the update cut, is unknown: never run again, never "ran"', async () => {
  for (const fate of ['entered', 'interrupted']) {
    rmSync(path.join(home, HELD_FILE), { force: true })
    const held = heldPrompts({ draining: () => true, dir: home })
    held.hold(S1, { site: 'wp-demo' })
    held.queued(S1, 'a')
    // The process stopped between the model call and the answer (entered, no turn end, nothing
    // running), or the turn it started was cut by the update (interrupted).
    const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
    let calls = 0
    await after.releaseReady(
      async () => (calls++, 0),
      () => false,
      seen([['a', fate]])
    )
    assert.deepEqual(
      after.status(S1, 'wp-demo'),
      { state: 'unknown', count: 1, recorded: true, settled: true, id: record(S1).notice, earlier: [] },
      fate
    )
    assert.equal(record(S1).reason, CUT, fate)
    assert.equal(after.keeps(S1), false, `${fate}: nothing of it is queued to keep`)
    await after.releaseReady(
      async () => (calls++, 1),
      () => false,
      seen([['a', fate]])
    )
    assert.equal(calls, 1, `${fate}: a notice is never released again`)
  }
})

test('a message its author removed while held ends the record quietly', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  held.queued(S1, 'b')
  held.removed(S1, 'b')
  assert.deepEqual(held.status(S1, undefined), {
    state: 'held',
    count: 1,
    recorded: true,
    settled: false,
    id: null,
    earlier: []
  })
  held.removed(S1, 'a')
  await Promise.resolve()
  // Nothing of the author's waits for the update any more: no "will run", no record.
  assert.deepEqual(held.status(S1, undefined), {
    state: 'none',
    count: 0,
    recorded: false,
    settled: true,
    id: null,
    earlier: []
  })
  assert.equal(record(S1), undefined)
  assert.equal(held.keeps(S1), false)
  const after = heldPrompts({ draining: () => false, dir: home })
  let calls = 0
  await after.releaseReady(
    async () => (calls++, 0),
    () => false,
    seen([['a', 'canceled']])
  )
  assert.equal(calls, 0)
})

test('an edit (the old id discarded, its replacement inserted in the same splice) keeps the record', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'draft')
  held.removed(S1, 'draft')
  held.queued(S1, 'final')
  await Promise.resolve()
  assert.deepEqual(record(S1).messages, ['final'])
  assert.equal(held.keeps(S1), true)
})

test('a message cancelled without its author asking did not run, and is said so', async () => {
  // A release that failed half way (dsh splices the queue out, then sends each back), or a disposal
  // that cleared the queue: the log says cancelled, and the author never removed it.
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1, { site: 'wp-demo' })
  held.queued(S1, 'a')
  held.queued(S1, 'b')
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  await after.releaseReady(
    async () => 0,
    () => false,
    seen([
      ['a', 'ran'],
      ['b', 'canceled']
    ])
  )
  assert.deepEqual(after.status(S1, 'wp-demo'), {
    state: 'failed',
    count: 1,
    recorded: true,
    settled: true,
    id: record(S1).notice,
    earlier: []
  })
  assert.deepEqual(record(S1).messages, ['b'], 'the one that ran is not counted as not run')
})

test('a session dsh cannot wake or read is released again every pass: shown as delayed after the retries, never a notice, and still run once dsh can', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1, { site: 'wp-demo' })
  held.queued(S1, 'a')
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  let ready = false
  let calls = 0
  const release = async () => {
    calls += 1
    if (!ready) throw new Error('session "session-one" not found')
    return 1
  }
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    await after.releaseReady(release, () => false)
    assert.equal(after.status(S1, 'wp-demo').state, 'held', `attempt ${i} is retried`)
  }
  await after.releaseReady(release, () => false)
  assert.deepEqual(after.status(S1, 'wp-demo'), {
    state: 'delayed',
    count: 1,
    recorded: true,
    settled: false,
    id: null,
    earlier: []
  })
  assert.equal(record(S1).reason, 'session "session-one" not found')
  assert.equal(record(S1).state, 'held', 'not given up on: the message may still run')
  assert.equal(after.keeps(S1), true, 'its queue is still kept through a disposal')
  // Past the fifth failure, and across a restart, every pass still tries.
  await after.releaseReady(release, () => false)
  const again = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  assert.equal(again.status(S1, 'wp-demo').state, 'delayed')
  ready = true
  assert.equal(await again.releaseReady(release, () => false), 1)
  assert.equal(calls, MAX_ATTEMPTS + 2)
  assert.deepEqual(again.status(S1, 'wp-demo'), {
    state: 'released',
    count: 1,
    recorded: true,
    settled: false,
    id: null,
    earlier: []
  })
  assert.equal(record(S1).attempts, 0)
  await again.releaseReady(release, () => false, seen([['a', 'ran']]))
  assert.equal(again.status(S1, 'wp-demo').state, 'none')
})

test('a loaded session whose release fails past the retries keeps its message queued, and runs it once the release recovers', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1, { site: 'wp-demo' })
  held.queued(S1, 'a')
  held.queued(S1, 'b')
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  let failing = true
  const calls = []
  const release = async (id) => {
    calls.push(id)
    if (failing) throw new Error('prompt rejected')
    return 2
  }
  const fates = new Map([
    ['a', 'pending'],
    ['b', 'pending']
  ])
  const live = () => ({ fates: () => fates })
  for (let i = 0; i < MAX_ATTEMPTS + 3; i++) await after.releaseReady(release, () => false, live)
  assert.equal(record(S1).state, 'held', 'failed tries never settle a record')
  assert.deepEqual(record(S1).messages, ['a', 'b'])
  assert.equal(fates.get('a'), 'pending', 'nothing was taken out of the queue')
  assert.equal(after.status(S1, 'wp-demo').state, 'delayed')
  failing = false
  assert.equal(await after.releaseReady(release, () => false, live), 2)
  assert.equal(calls.length, MAX_ATTEMPTS + 4)
  fates.set('a', 'ran')
  fates.set('b', 'ran')
  await after.releaseReady(release, () => false, live)
  assert.equal(after.status(S1, 'wp-demo').state, 'none')
  assert.equal(calls.length, MAX_ATTEMPTS + 4, 'released once, not again')
})

test('a different message sent while the held one is delayed leaves the held one to run first, never withdrawn', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1, { site: 'wp-demo' })
  held.queued(S1, 'old')
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  const refuse = async () => {
    throw new Error('not found')
  }
  for (let i = 0; i < MAX_ATTEMPTS; i++) await after.releaseReady(refuse, () => false)
  assert.equal(after.status(S1, 'wp-demo').state, 'delayed')
  // The author asks something else. dsh queues it behind the old one and wakes the agent.
  after.supersede(S1)
  assert.equal(after.hold(S1), undefined, 'no drain: the new message goes through')
  after.turnStarted(S1)
  assert.equal(record(S1).state, 'held', 'the old message is still followed')
  assert.deepEqual(record(S1).messages, ['old'])
  // The turn claims both, in order, and ends; the log settles the old one as run.
  await after.releaseReady(
    async () => 0,
    () => false,
    seen([
      ['old', 'ran'],
      ['new', 'ran']
    ])
  )
  assert.equal(record(S1), undefined)
})

test('answering a notice its page drew (sending again, or a turn starting) ends it; a record still followed is left alone', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  held.hold(S2)
  held.queued(S2, 'b')
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  await after.releaseReady(
    async () => 0,
    () => false,
    (id) => (id === S1 ? seen([['a', 'canceled']])() : seen([['b', 'pending']])())
  )
  assert.equal(after.status(S1, undefined).state, 'failed')
  after.seen(S1, undefined, drawn(after, S1))
  after.supersede(S1)
  assert.equal(after.status(S1, undefined).state, 'none')
  assert.equal(record(S1), undefined)
  after.turnStarted(S2)
  assert.equal(record(S2).state, 'held')
})

test('a notice that cannot be written away when answered comes back after a restart, and no message runs twice', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  await after.releaseReady(
    async () => 0,
    () => false,
    seen([['a', 'canceled']])
  )
  assert.equal(record(S1).state, 'failed')
  after.seen(S1, undefined, drawn(after, S1))
  chmodSync(home, 0o500)
  try {
    after.supersede(S1)
    assert.equal(after.hold(S1), undefined)
  } finally {
    chmodSync(home, 0o700)
  }
  // The file still says "did not run": shown again after a restart, never released.
  const next = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  assert.equal(next.status(S1, undefined).state, 'failed')
  let calls = 0
  await next.releaseReady(
    async () => (calls++, 1),
    () => false
  )
  assert.equal(calls, 0)
})

test('a confirmation that cannot be written down is refused and marks nothing seen: the notice stays until one is written', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  await after.releaseReady(
    async () => 0,
    () => false,
    seen([['a', 'canceled']])
  )
  const ids = drawn(after, S1)
  chmodSync(home, 0o500)
  try {
    assert.equal(after.seen(S1, undefined, ids), false)
  } finally {
    chmodSync(home, 0o700)
  }
  // Not seen in memory either: sending again does not end a notice its author was never known to see.
  assert.equal(record(S1).seenAt, undefined)
  after.supersede(S1)
  assert.equal(after.status(S1, undefined).state, 'failed')
  // The page confirms again once dsh can write: now it is seen, on disk.
  assert.equal(after.seen(S1, undefined, ids), true)
  assert.equal(typeof record(S1).seenAt, 'number')
  // Nothing new to write: still a taken confirmation, never a refusal the page retries forever.
  assert.equal(after.seen(S1, undefined, ids), true)
})

test('a message the log cannot account for is unknown, never counted as run', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  const after = heldPrompts({ draining: () => false, dir: home })
  await after.releaseReady(
    async () => 0,
    () => false,
    seen([])
  )
  assert.deepEqual(after.status(S1, undefined), {
    state: 'unknown',
    count: 1,
    recorded: true,
    settled: true,
    id: record(S1).notice,
    earlier: []
  })
})

test('a conversation that cannot be read is delayed after the retries, not settled', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  const after = heldPrompts({ draining: () => false, dir: home })
  for (let i = 0; i < MAX_ATTEMPTS; i++)
    await after.releaseReady(
      async () => 0,
      () => false
    )
  assert.deepEqual(after.status(S1, undefined), {
    state: 'delayed',
    count: 1,
    recorded: true,
    settled: false,
    id: null,
    earlier: []
  })
})

test('a notice is kept until its author page confirms it drew it, then forgotten NOTICE_TTL_MS later', async () => {
  let clock = 1_000
  const held = heldPrompts({ draining: () => true, dir: home, now: () => clock })
  held.hold(S1, { site: 'wp-demo' })
  const after = heldPrompts({ draining: () => false, dir: home, now: () => clock, warn: () => {} })
  await after.releaseReady(
    async () => 0,
    () => false,
    seen([])
  )
  assert.equal(record(S1).state, 'unknown')
  // Nobody opened the conversation: weeks pass, the notice waits.
  clock += 5 * NOTICE_TTL_MS
  await after.releaseReady(
    async () => 0,
    () => false
  )
  assert.equal(record(S1).state, 'unknown', 'an unseen notice is never dropped by time alone')
  // Answering the page is not seeing: the answer may be lost on its way.
  assert.equal(after.status(S1, undefined).state, 'unknown')
  assert.equal(record(S1).seenAt, undefined)
  clock += 5 * NOTICE_TTL_MS
  await after.releaseReady(
    async () => 0,
    () => false
  )
  assert.equal(record(S1).state, 'unknown')
  // Another site's page cannot confirm it; the author's page does.
  after.seen(S1, 'wp-other', drawn(after, S1))
  assert.equal(record(S1).seenAt, undefined)
  after.seen(S1, 'wp-demo', drawn(after, S1))
  assert.equal(record(S1).seenAt, clock)
  const seenAt = clock
  clock += 1_000
  after.seen(S1, 'wp-demo', drawn(after, S1))
  assert.equal(record(S1).seenAt, seenAt, 'the first confirmation counts')
  clock = seenAt + NOTICE_TTL_MS
  await after.releaseReady(
    async () => 0,
    () => false
  )
  assert.equal(record(S1)?.state, 'unknown')
  clock += 1
  await after.releaseReady(
    async () => 0,
    () => false
  )
  assert.equal(record(S1), undefined)
})

test('a message sent after the update, before the page ever drew the notice, leaves the notice in place', async () => {
  // #517 as it happened: two messages held, lost across the recreate; the author sends a third
  // before the page asked about the first two.
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1, { site: 'wp-demo' })
  held.queued(S1, 'a')
  held.queued(S1, 'b')
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  await after.releaseReady(
    async () => 0,
    () => false,
    seen([
      ['a', 'canceled'],
      ['b', 'canceled']
    ])
  )
  after.supersede(S1)
  assert.equal(after.hold(S1, { site: 'wp-demo' }), undefined, 'no drain: the third message goes through')
  after.turnStarted(S1)
  assert.deepEqual(after.status(S1, 'wp-demo'), {
    state: 'failed',
    count: 2,
    recorded: true,
    settled: true,
    id: record(S1).notice,
    earlier: []
  })
  // Kept across a restart too, until the page draws it and the author answers it.
  const next = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  next.turnStarted(S1)
  assert.equal(next.status(S1, 'wp-demo').state, 'failed')
  next.seen(S1, 'wp-demo', drawn(next, S1))
  assert.equal(next.status(S1, 'wp-demo').state, 'failed', 'drawing it does not end it')
  next.turnStarted(S1)
  assert.equal(next.status(S1, 'wp-demo').state, 'none')
})

test('one hold whose messages end apart (one in doubt, one surely not run) tells each as its own notice, in either order', async () => {
  for (const [first, second] of [
    ['interrupted', 'canceled'],
    ['canceled', 'interrupted'],
    ['sent', 'dropped'],
    ['dropped', 'entered']
  ]) {
    rmSync(heldFile(), { force: true })
    let drain = true
    const held = heldPrompts({ draining: () => drain, dir: home, warn: () => {} })
    held.hold(S1, { site: 'wp-demo' })
    held.queued(S1, 'a')
    held.queued(S1, 'b')
    drain = false
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([
        ['a', first],
        ['b', second]
      ])
    )
    const label = `${first}, ${second}`
    const unsure = ['interrupted', 'sent', 'entered'].includes(first) ? 'a' : 'b'
    const notRun = unsure === 'a' ? 'b' : 'a'
    const status = held.status(S1, 'wp-demo')
    assert.equal(status.state, 'failed', label)
    assert.equal(status.count, 1, label)
    assert.deepEqual(record(S1).messages, [notRun], label)
    assert.equal(record(S1).reason, NOT_RUN, label)
    assert.equal(status.earlier.length, 1, label)
    assert.equal(status.earlier[0].state, 'unknown', label)
    assert.equal(status.earlier[0].count, 1, label)
    assert.deepEqual(record(S1).earlier[0].messages, [unsure], label)
    assert.equal(record(S1).earlier[0].reason, CUT, label)
    assert.notEqual(status.earlier[0].id, status.id, label)
    // Written down as two notices the next process reads back as they are.
    const next = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
    assert.deepEqual(next.status(S1, 'wp-demo'), status, `${label}: across a restart`)
    // Each is answered only once its page drew it.
    next.seen(S1, 'wp-demo', [status.id])
    next.supersede(S1)
    assert.equal(next.status(S1, 'wp-demo').state, 'unknown', `${label}: the undrawn one stays`)
    next.seen(S1, 'wp-demo', drawn(next, S1))
    next.supersede(S1)
    assert.equal(next.status(S1, 'wp-demo').state, 'none', label)
  }
})

test('a split hold beside an earlier update’s unseen notice merges each part with the notice of its state', async () => {
  for (const earlierState of /** @type {const} */ (['failed', 'unknown'])) {
    rmSync(heldFile(), { force: true })
    let drain = true
    const held = heldPrompts({ draining: () => drain, dir: home, warn: () => {} })
    held.hold(S1, { site: 'wp-demo' })
    held.queued(S1, 'a')
    drain = false
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([['a', earlierState === 'failed' ? 'canceled' : 'interrupted']])
    )
    assert.equal(record(S1).state, earlierState)
    const old = record(S1).notice
    // Update 2: two more held before the page drew the first notice; one in doubt, one not run.
    drain = true
    assert.equal(held.hold(S1, { site: 'wp-demo' }), true)
    held.queued(S1, 'b')
    held.queued(S1, 'c')
    drain = false
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([
        ['a', earlierState === 'failed' ? 'canceled' : 'interrupted'],
        ['b', 'interrupted'],
        ['c', 'dropped']
      ])
    )
    const r = record(S1)
    assert.equal(r.state, 'failed', earlierState)
    assert.deepEqual(r.messages, earlierState === 'failed' ? ['a', 'c'] : ['c'], earlierState)
    assert.equal(r.earlier.length, 1, earlierState)
    assert.equal(r.earlier[0].state, 'unknown', earlierState)
    assert.deepEqual(r.earlier[0].messages, earlierState === 'unknown' ? ['a', 'b'] : ['b'], earlierState)
    // Neither says what the old one said in the same form: both new ids, so its late confirmation
    // confirms neither.
    assert.notEqual(r.notice, old, earlierState)
    assert.notEqual(r.earlier[0].id, old, earlierState)
    held.seen(S1, 'wp-demo', [old])
    assert.equal(record(S1).seenAt, undefined, earlierState)
    assert.equal(record(S1).earlier[0].seenAt, undefined, earlierState)
  }
})

test('a second update in the same conversation keeps the first notice its author has not seen', async () => {
  // Update 1: two messages held, lost; nobody opened the conversation since.
  let drain = true
  const held = heldPrompts({ draining: () => drain, dir: home, warn: () => {} })
  held.hold(S1, { site: 'wp-demo' })
  held.queued(S1, 'a')
  held.queued(S1, 'b')
  drain = false
  await held.releaseReady(
    async () => 0,
    () => false,
    seen([
      ['a', 'canceled'],
      ['b', 'canceled']
    ])
  )
  assert.equal(record(S1).state, 'failed')
  const first = record(S1).notice
  assert.match(first, NOTICE_ID)
  // Update 2 begins; the author sends again in the same conversation before the page drew it.
  drain = true
  held.supersede(S1)
  assert.equal(held.hold(S1, { site: 'wp-demo' }), true)
  held.queued(S1, 'c')
  const both = {
    state: 'held',
    count: 1,
    recorded: true,
    settled: false,
    id: null,
    earlier: [{ id: first, state: 'failed', count: 2 }]
  }
  assert.deepEqual(held.status(S1, 'wp-demo'), both, 'the new hold and the old notice, each its own line')
  assert.deepEqual(record(S1).earlier[0].messages, ['a', 'b'])
  // A turn starting (the release's own) is no answer to a notice never drawn.
  held.turnStarted(S1)
  // Across the recreate of update 2.
  const next = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  assert.deepEqual(next.status(S1, 'wp-demo'), both)
  // c runs: what is left to say is the first notice, still unseen.
  await next.releaseReady(
    async () => 1,
    () => false,
    seen([['c', 'pending']])
  )
  await next.releaseReady(
    async () => 0,
    () => false,
    seen([['c', 'ran']])
  )
  assert.deepEqual(next.status(S1, 'wp-demo'), {
    state: 'failed',
    count: 2,
    recorded: true,
    settled: true,
    id: first,
    earlier: []
  })
  assert.equal(record(S1).seenAt, undefined)
  next.turnStarted(S1)
  assert.equal(next.status(S1, 'wp-demo').state, 'failed', 'still never drawn')
  next.seen(S1, 'wp-demo', drawn(next, S1))
  next.turnStarted(S1)
  assert.equal(next.status(S1, 'wp-demo').state, 'none', 'drawn, then answered')
})

test('a kept notice beside a hold: merged with a notice of its state, kept apart from the other, restored when its message is removed, answered once drawn', async () => {
  /** Update 1 ends in a notice (`failed`: its messages were cancelled; `unknown`: the log lost them); update 2 holds `c`. */
  const lost = async (/** @type {string[]} */ ids, first = 'failed') => {
    rmSync(heldFile(), { force: true })
    let drain = true
    const held = heldPrompts({ draining: () => drain, dir: home, warn: () => {} })
    held.hold(S1, { site: 'wp-demo' })
    for (const id of ids) held.queued(S1, id)
    drain = false
    await held.releaseReady(
      async () => 0,
      () => false,
      seen(first === 'failed' ? ids.map((id) => [id, 'canceled']) : [])
    )
    assert.equal(record(S1).state, first)
    const old = record(S1).notice
    drain = true
    assert.equal(held.hold(S1, { site: 'wp-demo' }), true)
    held.queued(S1, 'c')
    return {
      held,
      old,
      end: () => {
        drain = false
      },
      again: () => {
        drain = true
      }
    }
  }
  // The second hold fails as well: one notice for both, the earlier messages first, under a new id.
  {
    const { held, old, end } = await lost(['a'])
    end()
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([
        ['a', 'canceled'],
        ['c', 'dropped']
      ])
    )
    assert.deepEqual(held.status(S1, 'wp-demo'), {
      state: 'failed',
      count: 2,
      recorded: true,
      settled: true,
      id: record(S1).notice,
      earlier: []
    })
    assert.notEqual(record(S1).notice, old, 'a notice that says more is a new one')
    assert.deepEqual(record(S1).messages, ['a', 'c'])
    assert.equal(record(S1).earlier, undefined)
  }
  // Update 1 did not run, update 2 is in doubt: two lines — never folded into one `unknown`.
  {
    const { held, old, end, again } = await lost(['a'])
    end()
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([['c', 'interrupted']])
    )
    assert.deepEqual(held.status(S1, 'wp-demo'), {
      state: 'unknown',
      count: 1,
      recorded: true,
      settled: true,
      id: record(S1).notice,
      earlier: [{ id: old, state: 'failed', count: 1 }]
    })
    assert.deepEqual(record(S1).messages, ['c'])
    assert.deepEqual(record(S1).earlier[0].messages, ['a'])
    // Update 3 holds `d` before the page drew either: both notices stay beside it, each with its id.
    const doubt = record(S1).notice
    again()
    assert.equal(held.hold(S1, { site: 'wp-demo' }), true)
    held.queued(S1, 'd')
    assert.deepEqual(held.status(S1, 'wp-demo').earlier, [
      { id: old, state: 'failed', count: 1 },
      { id: doubt, state: 'unknown', count: 1 }
    ])
    // `d` runs: the first notice is the record again, the other kept beside it.
    end()
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([['d', 'ran']])
    )
    assert.deepEqual(held.status(S1, 'wp-demo'), {
      state: 'failed',
      count: 1,
      recorded: true,
      settled: true,
      id: old,
      earlier: [{ id: doubt, state: 'unknown', count: 1 }]
    })
  }
  // The other order: update 1 in doubt, update 2 did not run — still two lines, each its own.
  {
    const { held, old, end } = await lost(['a'], 'unknown')
    end()
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([['c', 'dropped']])
    )
    assert.deepEqual(held.status(S1, 'wp-demo'), {
      state: 'failed',
      count: 1,
      recorded: true,
      settled: true,
      id: record(S1).notice,
      earlier: [{ id: old, state: 'unknown', count: 1 }]
    })
    assert.deepEqual(record(S1).messages, ['c'])
  }
  // Its author removes the new message: the old notice is what is left, with its own id.
  {
    const { held, old } = await lost(['a', 'b'])
    held.removed(S1, 'c')
    await new Promise((r) => queueMicrotask(r))
    assert.deepEqual(held.status(S1, 'wp-demo'), {
      state: 'failed',
      count: 2,
      recorded: true,
      settled: true,
      id: old,
      earlier: []
    })
  }
  // Drawn beside the hold: the page's confirmation reaches it, and the next message answers it
  // while the hold goes on.
  {
    const { held } = await lost(['a'])
    held.seen(S1, 'wp-other', drawn(held, S1))
    assert.equal(record(S1).earlier[0].seenAt, undefined, 'another site cannot confirm it')
    held.seen(S1, 'wp-demo', drawn(held, S1))
    assert.equal(typeof record(S1).earlier[0].seenAt, 'number')
    held.supersede(S1)
    assert.deepEqual(held.status(S1, 'wp-demo'), {
      state: 'held',
      count: 1,
      recorded: true,
      settled: false,
      id: null,
      earlier: []
    })
  }
  // A notice already drawn when the new hold begins is answered by it, not kept.
  {
    rmSync(heldFile(), { force: true })
    let drain = true
    const held = heldPrompts({ draining: () => drain, dir: home, warn: () => {} })
    held.hold(S1, { site: 'wp-demo' })
    held.queued(S1, 'a')
    drain = false
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([['a', 'canceled']])
    )
    held.seen(S1, 'wp-demo', drawn(held, S1))
    drain = true
    held.supersede(S1)
    held.hold(S1, { site: 'wp-demo' })
    assert.deepEqual(held.status(S1, 'wp-demo').earlier, [])
  }
})

test('a late confirmation of an older notice never counts for the notice that replaced it', async () => {
  for (const second of /** @type {const} */ (['dropped', 'interrupted'])) {
    rmSync(heldFile(), { force: true })
    let drain = true
    const held = heldPrompts({ draining: () => drain, dir: home, warn: () => {} })
    held.hold(S1, { site: 'wp-demo' })
    held.queued(S1, 'a')
    drain = false
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([['a', 'canceled']])
    )
    // The page draws the `failed` notice; its confirmation is still on its way…
    const late = drawn(held, S1)
    const [old] = late
    // …while another update holds `b`, which then does not run (`failed` again: one new notice),
    // or ends in doubt (`unknown`: its own notice beside the old one).
    drain = true
    held.supersede(S1)
    assert.equal(held.hold(S1, { site: 'wp-demo' }), true)
    held.queued(S1, 'b')
    drain = false
    await held.releaseReady(
      async () => 0,
      () => false,
      seen([
        ['a', 'canceled'],
        ['b', second]
      ])
    )
    const now = held.status(S1, 'wp-demo')
    assert.notEqual(now.id, old, second)
    // The late confirmation lands.
    held.seen(S1, 'wp-demo', late)
    assert.equal(record(S1).seenAt, undefined, `${second}: the newer notice was never drawn`)
    // The author's next message answers only what the page drew; the newer notice stays.
    held.supersede(S1)
    assert.equal(held.status(S1, 'wp-demo').id, now.id, second)
    assert.equal(held.status(S1, 'wp-demo').state, second === 'dropped' ? 'failed' : 'unknown')
    if (second === 'interrupted')
      assert.deepEqual(held.status(S1, 'wp-demo').earlier, [], 'the drawn one is answered')
    // Once the page draws the newer one and confirms it, the next message answers it.
    held.seen(S1, 'wp-demo', drawn(held, S1))
    held.supersede(S1)
    assert.equal(held.status(S1, 'wp-demo').state, 'none', second)
  }
})

test('a record still followed cannot be confirmed as seen', () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  held.seen(S1, undefined, drawn(held, S1))
  assert.equal(record(S1).seenAt, undefined)
})

test('the drain coming back during a release keeps the rest held', async () => {
  let drain = true
  const held = heldPrompts({ draining: () => drain, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  held.hold(S2)
  held.queued(S2, 'b')
  drain = false
  const calls = []
  await held.releaseReady(
    async (id) => {
      calls.push(id)
      drain = true
      return 0
    },
    () => false
  )
  assert.deepEqual(calls, [S1])
  assert.deepEqual(held.pending(), [S1, S2])
})

test('two passes asked at once run one after the other, never over the same record', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  const after = heldPrompts({ draining: () => false, dir: home })
  let inFlight = 0
  let most = 0
  let calls = 0
  // Held open by the test, so an overlapping second pass has every chance to enter before this one ends.
  let open
  const gate = new Promise((r) => (open = r))
  const release = async () => {
    inFlight += 1
    most = Math.max(most, inFlight)
    await gate
    inFlight -= 1
    calls += 1
    return 1
  }
  const asked = Promise.all([
    after.releaseReady(release, () => false),
    after.releaseReady(release, () => false)
  ])
  await new Promise((r) => setImmediate(r))
  open()
  const counts = await asked
  assert.deepEqual(counts.sort(), [0, 1])
  assert.equal(calls, 1)
  assert.equal(most, 1)
})

test('the next process picks up a version 1 file (#295) as held sessions', async () => {
  writeFileSync(heldFile(), JSON.stringify({ sessions: [S1, S2] }))
  const held = heldPrompts({ draining: () => false, dir: home })
  assert.deepEqual(held.pending(), [S1, S2])
  // Its site is not known yet: the session's holder is answered on any mount (the seat gateway
  // decides who holds it), until dsh loads the session and the site is learned.
  assert.deepEqual(held.status(S1, 'wp-demo'), {
    state: 'held',
    count: 0,
    recorded: true,
    settled: false,
    id: null,
    earlier: []
  })
  held.place(S1, 'wp-demo')
  assert.equal(held.status(S1, 'wp-other').state, 'none')
  held.place(S1, 'wp-other')
  assert.equal(record(S1).site, 'wp-demo', 'placed once')
  const woken = []
  await held.releaseReady(
    async (id) => (woken.push(id), 1),
    () => false
  )
  assert.deepEqual(woken, [S1, S2])
})

// #1403 item 11: a message the update stopped before the model saw it is sent once more, not told
// as "send it again" — but only that kind, only once, and only while its author wrote nothing after.
test('mayResend: only messages the update stopped before the model saw them, once, while the author wrote nothing after', () => {
  const failed = (notRun) => ({ kind: 'failed', notRun })
  const fates = (entries) => new Map(entries)
  // Cancelled by a broken release, or claimed by a turn the process stopped: sent once more.
  assert.equal(mayResend({ messages: ['a'] }, failed(['a']), fates([['a', 'canceled']])), true)
  assert.equal(mayResend({ messages: ['a'] }, failed(['a']), fates([['a', 'claimed']])), true)
  assert.equal(
    mayResend(
      { messages: ['a', 'b'] },
      failed(['b']),
      fates([
        ['a', 'ran'],
        ['b', 'canceled']
      ])
    ),
    true,
    'one ran, the other is sent once more'
  )
  // A turn that ended before the model was asked (a pre-step refused it) would end the same way.
  assert.equal(mayResend({ messages: ['a'] }, failed(['a']), fates([['a', 'dropped']])), false)
  assert.equal(
    mayResend(
      { messages: ['a', 'b'] },
      failed(['a', 'b']),
      fates([
        ['a', 'canceled'],
        ['b', 'dropped']
      ])
    ),
    false
  )
  // Never a second time, never for a version 1 record that names no message.
  assert.equal(mayResend({ messages: ['a'], resent: true }, failed(['a']), fates([['a', 'canceled']])), false)
  assert.equal(mayResend({ messages: ['a'], legacy: true }, failed(['a']), fates([['a', 'canceled']])), false)
  // The author sent something after it: that is their answer, and the notice tells them.
  assert.equal(
    mayResend(
      { messages: ['a'] },
      failed(['a']),
      fates([
        ['a', 'canceled'],
        ['n', 'ran']
      ])
    ),
    false
  )
  // Only a sure "did not run": an unsure one is never replayed.
  assert.equal(
    mayResend(
      { messages: ['a', 'b'] },
      { kind: 'split', notRun: ['a'], unsure: ['b'], reason: CUT },
      fates([
        ['a', 'canceled'],
        ['b', 'interrupted']
      ])
    ),
    false
  )
  assert.equal(
    mayResend({ messages: ['a'] }, { kind: 'unknown', reason: CUT }, fates([['a', 'interrupted']])),
    false
  )
})

test('queuedMessages: each message as the log last queued it, or null when one is missing', () => {
  const m = (id, text) => ({ id, role: 'user', content: [{ type: 'text', text }] })
  const events = [
    {
      type: 'agent/inbox/spliced',
      data: { target: 'next-turn', start: 0, inserted: [m('a', 'first'), m('b', 'two')] }
    },
    {
      type: 'agent/inbox/spliced',
      data: { target: 'next-turn', start: 0, removedCount: 2, inserted: [], outcome: 'canceled' }
    },
    { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [m('a', 'edited')] } }
  ]
  assert.deepEqual(queuedMessages(events, ['a', 'b']), [m('a', 'edited'), m('b', 'two')])
  assert.equal(queuedMessages(events, ['a', 'gone']), null)
})

test('a record sent once more keeps that through a restart; any other value of the key is a failed read', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1, { site: 'wp-demo' })
  held.queued(S1, 'a')
  const resent = []
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  const fates = new Map([['a', 'canceled']])
  await after.releaseReady(
    async () => 0,
    () => false,
    () => ({ fates: () => fates, resend: (ids) => resent.push(ids) > 0 })
  )
  assert.deepEqual(resent, [['a']])
  assert.equal(record(S1).state, 'held')
  assert.equal(record(S1).resent, true)
  const raw = JSON.parse(readFileSync(heldFile(), 'utf8'))
  raw.sessions[S1].resent = 'yes'
  writeFileSync(heldFile(), JSON.stringify(raw))
  assert.equal(readHeldFile(home).ok, false)
})

test('a resend dsh cannot make (an agent running, a message the log lost) is told as not run, as before', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1, { site: 'wp-demo' })
  held.queued(S1, 'a')
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  const fates = new Map([['a', 'canceled']])
  await after.releaseReady(
    async () => 0,
    () => false,
    () => ({ fates: () => fates, resend: () => false })
  )
  assert.equal(record(S1).state, 'failed')
  assert.equal(record(S1).resent, undefined)
})

// e2e dev 24/10/2026: a Website Opportunities demo chat (`wo-demo-<uuid>`, `opportunities-build/demo-actions.js`) was
// refused 400 by `/held` about 500 times, and its held prompt would have made the whole file unreadable.
test("Tracy's own session ids are sessions too; anything that is not an id is still refused", () => {
  for (const id of ['session-a1', 'wo-demo-8b1f0d2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', 'wo-editorial-r1'])
    assert.ok(SESSION_ID.test(id), id)
  for (const id of ['', 'session-a b', '../session-x', 'session-x/../y', '-session', 'x'.repeat(200)])
    assert.equal(SESSION_ID.test(id), false, id)
  const demo = 'wo-demo-8b1f0d2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
  const held = heldPrompts({ draining: () => true, dir: home })
  assert.equal(held.hold(demo, { site: 'wo-demo-x.tracy.site' }), true)
  assert.equal(record(demo).state, 'held')
})

test('a missing file is an empty list', () => {
  assert.deepEqual(readHeldFile(home), { ok: true, sessions: new Map() })
})

for (const [label, make] of [
  ['an empty file', () => writeFileSync(heldFile(), '')],
  ['broken JSON', () => writeFileSync(heldFile(), '{not json')],
  ['an unknown version', () => writeFileSync(heldFile(), JSON.stringify({ version: 3, sessions: {} }))],
  ['a version 2 list', () => writeFileSync(heldFile(), JSON.stringify({ version: 2, sessions: [] }))],
  ['a version 2 null', () => writeFileSync(heldFile(), JSON.stringify({ version: 2, sessions: null }))],
  ['a top-level array', () => writeFileSync(heldFile(), JSON.stringify([]))],
  [
    'a key nobody writes',
    () => writeFileSync(heldFile(), JSON.stringify({ version: 2, sessions: {}, extra: 1 }))
  ],
  [
    'a record with a key nobody writes',
    () =>
      writeFileSync(
        heldFile(),
        JSON.stringify({
          version: 2,
          sessions: {
            [S1]: { site: null, heldAt: 1, messages: [], state: 'held', attempts: 0, updatedAt: 1, x: 1 }
          }
        })
      )
  ],
  [
    'a kept notice of a state no notice has',
    () =>
      writeFileSync(
        heldFile(),
        JSON.stringify({
          version: 2,
          sessions: {
            [S1]: {
              site: null,
              heldAt: 1,
              messages: [],
              state: 'held',
              attempts: 0,
              updatedAt: 1,
              earlier: [
                { id: '00000000-0000-4000-8000-000000000001', state: 'held', messages: [], updatedAt: 1 }
              ]
            }
          }
        })
      )
  ],
  [
    'a kept notice with a key nobody writes',
    () =>
      writeFileSync(
        heldFile(),
        JSON.stringify({
          version: 2,
          sessions: {
            [S1]: {
              site: null,
              heldAt: 1,
              messages: [],
              state: 'held',
              attempts: 0,
              updatedAt: 1,
              earlier: [
                {
                  id: '00000000-0000-4000-8000-000000000001',
                  state: 'failed',
                  messages: [],
                  updatedAt: 1,
                  x: 1
                }
              ]
            }
          }
        })
      )
  ],
  [
    'a kept notice beside a notice of the same state',
    () =>
      writeFileSync(
        heldFile(),
        JSON.stringify({
          version: 2,
          sessions: {
            [S1]: {
              site: null,
              heldAt: 1,
              messages: [],
              state: 'failed',
              attempts: 0,
              updatedAt: 1,
              notice: '00000000-0000-4000-8000-000000000001',
              earlier: [
                { id: '00000000-0000-4000-8000-000000000002', state: 'failed', messages: [], updatedAt: 1 }
              ]
            }
          }
        })
      )
  ],
  [
    'a kept notice that is not a list',
    () =>
      writeFileSync(
        heldFile(),
        JSON.stringify({
          version: 2,
          sessions: {
            [S1]: {
              site: null,
              heldAt: 1,
              messages: [],
              state: 'held',
              attempts: 0,
              updatedAt: 1,
              earlier: {
                id: '00000000-0000-4000-8000-000000000001',
                state: 'failed',
                messages: [],
                updatedAt: 1
              }
            }
          }
        })
      )
  ],
  [
    'two kept notices of one state',
    () =>
      writeFileSync(
        heldFile(),
        JSON.stringify({
          version: 2,
          sessions: {
            [S1]: {
              site: null,
              heldAt: 1,
              messages: [],
              state: 'held',
              attempts: 0,
              updatedAt: 1,
              earlier: [
                { id: '00000000-0000-4000-8000-000000000001', state: 'unknown', messages: [], updatedAt: 1 },
                { id: '00000000-0000-4000-8000-000000000002', state: 'unknown', messages: [], updatedAt: 1 }
              ]
            }
          }
        })
      )
  ],
  [
    'a kept notice without its id',
    () =>
      writeFileSync(
        heldFile(),
        JSON.stringify({
          version: 2,
          sessions: {
            [S1]: {
              site: null,
              heldAt: 1,
              messages: [],
              state: 'held',
              attempts: 0,
              updatedAt: 1,
              earlier: [{ state: 'failed', messages: [], updatedAt: 1 }]
            }
          }
        })
      )
  ],
  [
    'a notice record without its id',
    () =>
      writeFileSync(
        heldFile(),
        JSON.stringify({
          version: 2,
          sessions: {
            [S1]: { site: null, heldAt: 1, messages: [], state: 'failed', attempts: 0, updatedAt: 1 }
          }
        })
      )
  ],
  [
    'a hold carrying a notice id',
    () =>
      writeFileSync(
        heldFile(),
        JSON.stringify({
          version: 2,
          sessions: {
            [S1]: {
              site: null,
              heldAt: 1,
              messages: [],
              state: 'held',
              attempts: 0,
              updatedAt: 1,
              notice: '00000000-0000-4000-8000-000000000001'
            }
          }
        })
      )
  ],
  [
    'a record that is a list',
    () => writeFileSync(heldFile(), JSON.stringify({ version: 2, sessions: { [S1]: [] } }))
  ],
  ['a version 1 bad entry', () => writeFileSync(heldFile(), JSON.stringify({ sessions: [S1, 7] }))],
  ['a version 1 map', () => writeFileSync(heldFile(), JSON.stringify({ sessions: {} }))],
  [
    'a bad entry',
    () => writeFileSync(heldFile(), JSON.stringify({ version: 2, sessions: { [S1]: { state: 'held' } } }))
  ],
  [
    'a traversal id',
    () => writeFileSync(heldFile(), JSON.stringify({ version: 2, sessions: { '../x': {} } }))
  ],
  ['a directory', () => mkdirSync(heldFile())],
  [
    'a symlink',
    () => {
      writeFileSync(path.join(home, 'elsewhere.json'), JSON.stringify({ version: 2, sessions: {} }))
      symlinkSync(path.join(home, 'elsewhere.json'), heldFile())
    }
  ],
  ['a FIFO', () => execFileSync('mkfifo', [heldFile()])]
]) {
  test(`${label} is a failed read: kept as it is, nothing new held, authors told "unknown"`, async () => {
    make()
    const before = lstatSync(heldFile())
    const bytes = before.isFile() ? readFileSync(heldFile(), 'utf8') : null
    assert.equal(readHeldFile(home).ok, false)
    const lines = []
    const held = heldPrompts({ draining: () => true, dir: home, warn: (l) => lines.push(l) })
    assert.match(held.broken ?? '', /held-prompts\.json/)
    assert.match(lines[0], /unreadable/)
    assert.equal(held.hold(S1), undefined, 'the follow-up runs now rather than be held unrecorded')
    assert.deepEqual(held.status(S1, undefined), {
      state: 'unknown',
      count: 0,
      recorded: false,
      settled: true,
      id: null,
      earlier: []
    })
    await held.releaseReady(
      async () => 1,
      () => false
    )
    const after = lstatSync(heldFile())
    assert.equal(after.ino, before.ino)
    if (bytes !== null) assert.equal(readFileSync(heldFile(), 'utf8'), bytes)
  })
}

test('a hold that cannot be written is not a hold', () => {
  const locked = path.join(home, 'locked')
  mkdirSync(locked)
  chmodSync(locked, 0o500)
  try {
    const lines = []
    const held = heldPrompts({ draining: () => true, dir: locked, warn: (l) => lines.push(l) })
    assert.equal(held.broken, null)
    assert.equal(held.hold(S1), undefined)
    assert.deepEqual(held.pending(), [])
    assert.match(lines.at(-1), /could not write held follow-ups/)
  } finally {
    chmodSync(locked, 0o700)
  }
})

test('a failed write leaves the previous file whole and no temp file behind', () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  const bytes = readFileSync(heldFile(), 'utf8')
  const map = new Map([
    [S2, { site: null, heldAt: 1, messages: [], state: 'held', attempts: 0, updatedAt: 1 }]
  ])
  // A value JSON cannot write stands in for a disk that fails mid-write.
  map.get(S2).messages = [10n]
  assert.match(writeHeldFile(map, home) ?? '', /BigInt/)
  assert.equal(readFileSync(heldFile(), 'utf8'), bytes)
  assert.deepEqual(
    readdirSync(home).filter((f) => f.endsWith('.tmp')),
    []
  )
})

test('a short write is retried to the last byte; one that stops is a failed write, the old file whole', () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  const bytes = readFileSync(heldFile(), 'utf8')
  const map = readHeldFile(home).sessions
  map.set(S2, { site: 'wp-demo', heldAt: 2, messages: ['m'], state: 'held', attempts: 0, updatedAt: 2 })
  // A disk that stops after 10 bytes.
  let left = 10
  const stops = (fd, buffer, offset, length) => {
    const n = Math.min(length, left)
    left -= n
    return n === 0 ? 0 : writeSync(fd, buffer, offset, n)
  }
  assert.match(writeHeldFile(map, home, { write: stops }) ?? '', /short write: 10 of \d+ bytes/)
  assert.equal(readFileSync(heldFile(), 'utf8'), bytes)
  assert.deepEqual(
    readdirSync(home).filter((f) => f.endsWith('.tmp')),
    []
  )
  // A disk that writes 7 bytes at a time, all of them in the end.
  const trickle = (fd, buffer, offset, length) => writeSync(fd, buffer, offset, Math.min(length, 7))
  assert.equal(writeHeldFile(map, home, { write: trickle }), null)
  assert.deepEqual(readHeldFile(home).sessions.get(S2)?.messages, ['m'])
})

test('a message id that cannot be written after the hold is shown as unsaved (still runs, never "send again") until a pass writes it', async () => {
  const lines = []
  let drain = true
  const held = heldPrompts({ draining: () => drain, dir: home, warn: (l) => lines.push(l) })
  assert.equal(held.hold(S1), true)
  // The disk refuses the next write: the hold was already answered, the id is not on disk.
  chmodSync(home, 0o500)
  try {
    held.queued(S1, 'a')
    assert.match(lines.at(-1), /could not write held follow-ups/)
    assert.deepEqual(held.status(S1, undefined), {
      state: 'unsaved',
      count: 1,
      recorded: true,
      settled: false,
      id: null,
      earlier: []
    })
    assert.deepEqual(record(S1).messages, [], 'the next process would not know it')
    // The author sends again meanwhile: queued behind the old one, which is still followed.
    held.supersede(S1)
    assert.equal(held.hold(S1), true)
    assert.equal(held.status(S1, undefined).state, 'unsaved')
    assert.equal(held.keeps(S1), true, 'its queue is still kept through a disposal')
  } finally {
    chmodSync(home, 0o700)
  }
  // The next pass writes again, even while the drain holds everything.
  assert.equal(
    await held.releaseReady(
      async () => 1,
      () => false
    ),
    0
  )
  assert.deepEqual(record(S1).messages, ['a'])
  assert.deepEqual(held.status(S1, undefined), {
    state: 'held',
    count: 1,
    recorded: true,
    settled: false,
    id: null,
    earlier: []
  })
  drain = false
})

test('a hold whose message id never reached the disk is unknown after the restart, never "ran"', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  const after = heldPrompts({ draining: () => false, dir: home, warn: () => {} })
  await after.releaseReady(
    async () => 0,
    () => false,
    seen([])
  )
  assert.deepEqual(after.status(S1, undefined), {
    state: 'unknown',
    count: 0,
    recorded: true,
    settled: true,
    id: record(S1).notice,
    earlier: []
  })
})

test('verdict: pending, then unknown, then did not run, then ran', () => {
  const v = (messages, entries, running = false) => verdict({ messages }, new Map(entries), running)
  assert.deepEqual(
    v(
      ['a', 'b'],
      [
        ['a', 'ran'],
        ['b', 'pending']
      ]
    ),
    { kind: 'pending' }
  )
  assert.deepEqual(v(['a', 'b'], [['a', 'ran']]), { kind: 'unknown', reason: GONE, unsure: ['b'] })
  assert.deepEqual(v([], []), { kind: 'unknown', reason: GONE })
  assert.deepEqual(v([], [['x', 'pending']]), { kind: 'pending' })
  // Taken is not answered: pending while its turn runs. Once nothing runs it, one that went to the
  // model is in doubt; one no step took never reached it.
  assert.deepEqual(v(['a'], [['a', 'claimed']], true), { kind: 'pending' })
  assert.deepEqual(v(['a'], [['a', 'entered']], true), { kind: 'pending' })
  assert.deepEqual(v(['a'], [['a', 'sent']], true), { kind: 'pending' })
  assert.deepEqual(v(['a'], [['a', 'entered']]), { kind: 'unknown', reason: CUT, unsure: ['a'] })
  assert.deepEqual(v(['a'], [['a', 'sent']]), { kind: 'unknown', reason: CUT, unsure: ['a'] })
  assert.deepEqual(v(['a'], [['a', 'claimed']]), { kind: 'failed', notRun: ['a'] })
  assert.deepEqual(
    v(
      ['a', 'b'],
      [
        ['a', 'ran'],
        ['b', 'dropped']
      ]
    ),
    { kind: 'failed', notRun: ['b'] }
  )
  assert.deepEqual(v(['a'], [['a', 'interrupted']]), { kind: 'unknown', reason: CUT, unsure: ['a'] })
  assert.deepEqual(v(['a'], [['a', 'interrupted']], true), { kind: 'unknown', reason: CUT, unsure: ['a'] })
  assert.deepEqual(
    v(
      ['a', 'b'],
      [
        ['a', 'ran'],
        ['b', 'canceled']
      ]
    ),
    { kind: 'failed', notRun: ['b'] }
  )
  // One in doubt and one that surely did not run: each told as it is, in either order — never one
  // "unknown" that hides a message its author could safely send again.
  for (const notRun of ['canceled', 'dropped', 'claimed']) {
    assert.deepEqual(
      v(
        ['a', 'b'],
        [
          ['a', 'interrupted'],
          ['b', notRun]
        ]
      ),
      { kind: 'split', notRun: ['b'], unsure: ['a'], reason: CUT },
      notRun
    )
    assert.deepEqual(
      v(
        ['b', 'a'],
        [
          ['b', notRun],
          ['a', 'interrupted']
        ]
      ),
      { kind: 'split', notRun: ['b'], unsure: ['a'], reason: CUT },
      `${notRun}, other order`
    )
  }
  assert.deepEqual(
    v(['a', 'b'], [['b', 'dropped']]),
    { kind: 'split', notRun: ['b'], unsure: ['a'], reason: GONE },
    'one the log never saw'
  )
  assert.deepEqual(v(['a'], [['a', 'ran']]), { kind: 'ran' })
})

test('messageFates follows each message through the queue by the last thing that happened to it', () => {
  const m = (id) => ({ id })
  const splice = (target, start, removedCount, inserted, outcome) => ({
    type: 'agent/inbox/spliced',
    data: { target, start, removedCount, inserted: inserted.map(m), ...(outcome ? { outcome } : {}) }
  })
  const fates = messageFates([
    splice('next-turn', 0, 0, ['a']),
    splice('next-turn', 1, 0, ['b']),
    splice('next-turn', 2, 0, ['c']),
    // release: spliced out as cancelled, sent back
    splice('next-turn', 0, 3, [], 'canceled'),
    splice('next-turn', 0, 0, ['a', 'b', 'c']),
    // the author removes c, moves b to steering
    splice('next-turn', 2, 1, [], 'canceled'),
    splice('next-turn', 1, 1, [], 'canceled'),
    splice('next-step', 0, 0, ['b']),
    // a turn claims a, a step enters with it; a step claims b and enters with it; the turn ends
    { type: 'turn/start', data: { turn: 1 } },
    splice('next-turn', 0, 1, []),
    { type: 'step/start', data: { turn: 1, step: 1 } },
    { type: 'user/message', data: { id: 'a' } },
    { type: 'assistant/message', data: { turn: 1, step: 1 } },
    splice('next-step', 0, 1, []),
    { type: 'step/start', data: { turn: 1, step: 2 } },
    { type: 'user/message', data: { id: 'b' } },
    { type: 'assistant/message', data: { turn: 1, step: 2 } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    splice('next-turn', 0, 0, ['d'])
  ])
  assert.deepEqual(Object.fromEntries(fates), { a: 'ran', b: 'ran', c: 'canceled', d: 'pending' })
  // Claimed, not answered: dsh claims before the pre-step and the model call.
  const turn = (/** @type {object[]} */ ...tail) =>
    Object.fromEntries(
      messageFates([
        splice('next-turn', 0, 0, ['e']),
        { type: 'turn/start', data: { turn: 2 } },
        splice('next-turn', 0, 1, []),
        ...tail
      ])
    )
  assert.deepEqual(turn(), { e: 'claimed' })
  const step = { type: 'step/start', data: { turn: 2, step: 1 } }
  const entry = { type: 'user/message', data: { id: 'e' } }
  // A step/start names no message: the step may still fail preparing its request before logging it.
  assert.deepEqual(turn(step), { e: 'claimed' }, 'a step started, but nothing logged it yet')
  assert.deepEqual(
    turn(step, entry),
    { e: 'entered' },
    'the step logged it by id: its request is being built'
  )
  const reply = { type: 'assistant/message', data: { turn: 2, step: 1 } }
  const attempt = { type: 'assistant/attempt', data: { turn: 2, step: 1 } }
  assert.deepEqual(turn(step, entry, reply), { e: 'sent' }, 'a model answer logged after it')
  // A failed attempt is no answer: dsh logs it for any stream that failed once started, a stream
  // middleware throwing before the model as much as a refused request.
  assert.deepEqual(turn(step, entry, attempt), { e: 'entered' }, 'a failed attempt logged after it')
  assert.deepEqual(turn(step, entry, attempt, reply), { e: 'sent' }, 'a retry that answered')
  const end = (/** @type {object} */ reason) => ({ type: 'turn/end', data: { turn: 2, reason } })
  // The pre-step replaced the entry with other messages: the step ran, but never with this one.
  const other = { type: 'user/message', data: { id: 'x' } }
  assert.deepEqual(turn(step, other, end({ kind: 'completed' })).e, 'dropped', 'replaced list')
  // A failure preparing the request (before `user/message` and the model call).
  assert.deepEqual(
    turn(step, end({ kind: 'error', error: { message: 'x', code: 'UNKNOWN' } })),
    { e: 'dropped' },
    'failed before the model'
  )
  assert.deepEqual(
    turn(step, { type: 'turn/start', data: { turn: 3 } }),
    { e: 'dropped' },
    'stopped before logging it'
  )
  // Logged in its step, then the request failed before the model was asked (building the request,
  // a stream middleware): no model answer or attempt after it, and an end that is not a cut, so the
  // model never saw it.
  for (const reason of [{ kind: 'error', error: { message: 'x', code: 'UNKNOWN' } }, { kind: 'completed' }])
    assert.deepEqual(turn(step, entry, end(reason)), { e: 'dropped' }, `entered, ${JSON.stringify(reason)}`)
  // Cut after it was logged: the request may have been streaming, which dsh logs nothing for.
  assert.deepEqual(turn(step, entry, end({ kind: 'aborted', reason: { kind: 'disposed' } })), {
    e: 'interrupted'
  })
  // A model answer before the entry (an earlier step) is no evidence for it.
  assert.deepEqual(
    turn(step, reply, entry, end({ kind: 'error', error: { message: 'x', code: 'UNKNOWN' } })),
    { e: 'dropped' },
    'an answer logged before it'
  )
  // A turn that went to the model: its end says whether it ran or was cut.
  const asked = (/** @type {object} */ reason) => turn(step, entry, reply, end(reason))
  assert.deepEqual(asked({ kind: 'aborted', reason: { kind: 'disposed' } }), { e: 'interrupted' })
  assert.deepEqual(asked({ kind: 'interrupted' }), { e: 'interrupted' }, 'crash recovery closed it')
  assert.deepEqual(asked({ kind: 'aborted', reason: { kind: 'hook', reason: 'x' } }), { e: 'interrupted' })
  assert.deepEqual(
    asked({ kind: 'aborted', reason: { kind: 'user' } }),
    { e: 'ran' },
    'its author stopped it'
  )
  assert.deepEqual(asked({ kind: 'error', error: { message: 'x', code: 'UNKNOWN' } }), { e: 'ran' })
  // Attempts that all failed, and a turn that ended on the error: no answer, no tool ran from it.
  assert.deepEqual(
    turn(step, entry, attempt, end({ kind: 'error', error: { message: 'x', code: 'UNKNOWN' } })),
    { e: 'dropped' },
    'a failed request with no answer did not run'
  )
  assert.deepEqual(
    turn(step, entry, attempt, attempt, end({ kind: 'error', error: { message: 'x', code: 'UNKNOWN' } })),
    { e: 'dropped' },
    'retried, failed again'
  )
  assert.deepEqual(
    turn(step, entry, attempt, end({ kind: 'aborted', reason: { kind: 'disposed' } })),
    { e: 'interrupted' },
    'cut after a failed attempt: a retry may have been streaming'
  )
  assert.deepEqual(
    turn(step, entry, attempt, reply, end({ kind: 'error', error: { message: 'x', code: 'UNKNOWN' } })),
    { e: 'ran' },
    'a retry answered it'
  )
  assert.deepEqual(asked({ kind: 'completed' }), { e: 'ran' })
  // A turn that ended before any step took it never showed it to the model, whatever its end says:
  // a pre-step refusal (blocked), an error before the model call, an entry emptied (completed with
  // no step), a cut before the step.
  for (const reason of [
    { kind: 'blocked' },
    { kind: 'error', error: { message: 'x', code: 'UNKNOWN' } },
    { kind: 'completed' },
    { kind: 'aborted', reason: { kind: 'disposed' } },
    { kind: 'interrupted' }
  ])
    assert.deepEqual(turn(end(reason)), { e: 'dropped' }, JSON.stringify(reason))
  // A new turn over one whose end is missing: what may have gone to the model is in doubt (dsh logs
  // nothing while a request streams), the rest dropped.
  assert.deepEqual(turn(step, entry, { type: 'turn/start', data: { turn: 3 } }), { e: 'interrupted' })
  assert.deepEqual(turn(step, entry, reply, { type: 'turn/start', data: { turn: 3 } }), { e: 'interrupted' })
  assert.deepEqual(turn({ type: 'turn/start', data: { turn: 3 } }), { e: 'dropped' })
  // A later step's claim (steering) the pre-step refuses: dropped, while the turn's first message ran.
  assert.deepEqual(
    Object.fromEntries(
      messageFates([
        splice('next-turn', 0, 0, ['f']),
        { type: 'turn/start', data: { turn: 4 } },
        splice('next-turn', 0, 1, []),
        { type: 'step/start', data: { turn: 4, step: 1 } },
        { type: 'user/message', data: { id: 'f' } },
        { type: 'assistant/message', data: { turn: 4, step: 1 } },
        splice('next-step', 0, 0, ['g']),
        splice('next-step', 0, 1, []),
        end({ kind: 'blocked' })
      ])
    ),
    { f: 'ran', g: 'dropped' }
  )
  assert.deepEqual(
    messageFates([{ type: 'agent/inbox/spliced', data: { target: 'nowhere' } }, null]),
    new Map()
  )
})

test('a pass before dsh has its session controller settles nothing and asks again later', async () => {
  const held = heldPrompts({ draining: () => true, dir: home })
  held.hold(S1)
  held.queued(S1, 'a')
  const after = heldPrompts({ draining: () => false, dir: home })
  let controller
  const { tick } = wireDeployHold(
    { on: () => {}, get: (name) => (name === 'sessionController' ? controller : undefined) },
    { queue: after, site: () => null, warn: () => {} }
  )
  for (let i = 0; i < MAX_ATTEMPTS + 1; i++) assert.equal(await tick(), 0)
  assert.equal(after.status(S1, undefined).state, 'held', 'not ready is not a failed attempt')
  controller = { releaseHeldPrompts: async () => 1 }
  assert.equal(await tick(), 1)
  assert.equal(after.status(S1, undefined).state, 'released')
})

// The shipped bundle, wired: `apply` must subscribe every event and serve the door, so a missing
// `ctx.on` line or route fails here even when the pure helpers above still pass.
test('the shipped plugin leases a running turn, holds a follow-up while draining, and tells its author', async () => {
  const { apply } = await import('../lib/index.js')
  const sites = mkdtempSync(path.join(tmpdir(), 'deploy-hold-sites-'))
  const previousRoot = process.env.TRACY_SITES_ROOT
  process.env.TRACY_SITES_ROOT = sites
  /** @type {Map<string, Function[]>} */
  const listeners = new Map()
  const emit = (event, ...args) => (listeners.get(event) ?? []).map((l) => l(...args))
  const disposers = []
  let route
  const cancels = []
  /** @type {Record<string, unknown>} */
  const getters = {}
  // The release pass the plugin schedules on its first timer (5 s after start), driven by hand.
  // Every timer the plugin sets on start is the mock clock's, so nothing is left running for real.
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const HELD_FIRST_MS = 5_000
  const tickOf = async () => {
    mock.timers.tick(HELD_FIRST_MS)
    // The pass is async (it awaits the controller); let it run to its end.
    for (let turn = 0; turn < 5; turn++) await new Promise((r) => setImmediate(r))
  }
  const agent = {
    id: 'session-s9',
    status: 'idle',
    session: { id: 'session-s9', header: { cwd: path.join(sites, 'wp-demo') } },
    inbox: { nextTurn: [{ id: 'm1' }] },
    cancel(cause, options) {
      cancels.push([cause.kind, options?.keepInbox === true])
    }
  }
  try {
    apply({
      webServer: {
        register: (r) => {
          route = r
          return () => {}
        }
      },
      tools: { register: () => () => {} },
      effect: (setup) => {
        disposers.push(setup())
      },
      on: (event, listener) => listeners.set(event, [...(listeners.get(event) ?? []), listener]),
      get: (name) =>
        name === 'agents' ? { get: (id) => (id === agent.id ? agent : undefined) } : getters[name]
    })
  } catch (error) {
    mock.timers.reset()
    throw error
  }
  /** POST the door the chat input asks, naming `body` as its JSON, through the given site mount. */
  const ask = (body, prefix, method = 'POST') =>
    new Promise((resolve) => {
      const res = {
        status: 0,
        writeHead(status) {
          this.status = status
        },
        end(body) {
          resolve({ status: this.status, body: JSON.parse(body) })
        }
      }
      const req = Object.assign(new EventEmitter(), {
        method,
        url: '/api/tracy-site-tools/held',
        headers: prefix === undefined ? {} : { 'x-forwarded-prefix': prefix }
      })
      route.handler(req, res)
      setImmediate(() => {
        if (body !== undefined) req.emit('data', Buffer.from(body))
        req.emit('end')
      })
    })
  try {
    emit('agent/status', { agent, status: 'running' })
    assert.equal(JSON.parse(readFileSync(leaseFile('session-s9'), 'utf8')).siteKey, 'wp-demo')
    emit('agent/status', { agent, status: 'idle' })
    assert.equal(existsSync(leaseFile('session-s9')), false)

    assert.deepEqual(emit('api-session/prompt-hold', 'session-s9'), [undefined])
    writeFileSync(path.join(home, 'draining'), '')
    assert.deepEqual(emit('api-session/prompt-hold', 'session-s9'), [true])
    emit('agent/inbox/inserted', { agent, message: { id: 'm1' } })
    emit('agent/inbox/inserted', { agent, message: { id: 'steered-not-queued' } })
    assert.deepEqual(record('session-s9').messages, ['m1'])
    assert.equal(record('session-s9').site, 'wp-demo')

    // dsh's disposal of a held agent keeps its queue; the stop button does not.
    agent.cancel({ kind: 'disposed' })
    agent.cancel({ kind: 'user' })
    assert.deepEqual(cancels, [
      ['disposed', true],
      ['user', false]
    ])

    const s9 = JSON.stringify({ sessionId: 'session-s9' })
    assert.deepEqual((await ask(s9, '/wp-demo.tracy.site')).body, {
      ok: true,
      draining: true,
      state: 'held',
      count: 1,
      recorded: true,
      settled: false,
      id: null,
      earlier: []
    })
    // A deploy that cut a running turn of this conversation (#1403 item 11), told to its site only.
    writeFileSync(
      path.join(home, 'cut-by-deploy.json'),
      JSON.stringify([
        {
          at: '2026-10-16T10:05:00Z',
          tag: 't',
          work: [{ kind: 'chat', siteKey: 'wp-demo', sessionId: 'session-s9' }]
        }
      ])
    )
    const askCut = JSON.stringify({ sessionId: 'session-s9', cut: true })
    assert.deepEqual((await ask(askCut, '/wp-demo.tracy.site')).body.cutAt, [
      Date.parse('2026-10-16T10:05:00Z')
    ])
    assert.deepEqual((await ask(askCut, '/wp-other.tracy.site')).body.cutAt, [])
    assert.equal(
      'cutAt' in (await ask(s9, '/wp-demo.tracy.site')).body,
      false,
      'the plain answer is unchanged'
    )
    // What the conversation's running turn waits on (#1403 item 10), asked with wait: true only.
    const { beginWait } = await import('../../../core/tracy-core/src/chat-wait/index.mjs')
    const askWait = JSON.stringify({ sessionId: 'session-s9', wait: true })
    assert.equal((await ask(askWait, '/wp-demo.tracy.site')).body.waiting, null)
    const endWait = beginWait('session-s9', 'lease', Date.now() - 7_000)
    assert.deepEqual((await ask(askWait, '/wp-demo.tracy.site')).body.waiting, { kind: 'lease', seconds: 7 })
    assert.equal(
      'waiting' in (await ask(s9, '/wp-demo.tracy.site')).body,
      false,
      'the plain answer is unchanged'
    )
    endWait()
    assert.equal((await ask(s9, '/wp-other.tracy.site')).body.state, 'none')
    assert.equal((await ask(s9, '/new')).body.state, 'none')
    assert.equal((await ask(s9)).body.state, 'held')
    assert.equal((await ask(JSON.stringify({ sessionId: '../../etc' }), '/wp-demo.tracy.site')).status, 400)
    assert.equal((await ask('{}', '/wp-demo.tracy.site')).status, 400)
    assert.equal((await ask('not json', '/wp-demo.tracy.site')).status, 400)
    assert.equal(
      (await ask(JSON.stringify({ sessionId: 'session-s9', seen: 'yes' }), '/wp-demo.tracy.site')).status,
      400
    )
    // A confirmation names the notices drawn, by id: nothing else is one.
    for (const bad of [
      true,
      [],
      ['not-a-notice'],
      [7],
      Array(9).fill('00000000-0000-4000-8000-000000000001')
    ])
      assert.equal(
        (await ask(JSON.stringify({ sessionId: 'session-s9', seen: bad }), '/wp-demo.tracy.site')).status,
        400,
        JSON.stringify(bad)
      )
    // A confirmation about a record still followed changes nothing.
    assert.equal(
      (
        await ask(
          JSON.stringify({ sessionId: 'session-s9', seen: ['00000000-0000-4000-8000-000000000001'] }),
          '/wp-demo.tracy.site'
        )
      ).body.state,
      'held'
    )
    assert.equal(record('session-s9').seenAt, undefined)
    // Only the POST: its JSON body is what the seat gateway holds to the viewer's own sessions.
    assert.equal((await ask(undefined, '/wp-demo.tracy.site', 'GET')).status, 405)

    // A release re-queues through dsh's own splice (a discard, then an insert): not the author's
    // removal. The author's own removal is.
    let release
    const released = new Promise((resolve) => (release = resolve))
    const controller = {
      releaseHeldPrompts: async () => {
        await released
        emit('agent/inbox/discarded', { agent, message: { id: 'm1' } })
        emit('agent/inbox/inserted', { agent, message: { id: 'm1' } })
        return 1
      }
    }
    getters.sessionController = controller
    rmSync(path.join(home, 'draining'))
    // The first tick is scheduled by the plugin; drive one pass by hand through the same wiring.
    const pass = tickOf()
    release()
    await pass
    assert.deepEqual(record('session-s9').messages, ['m1'], 'the release kept following m1')
    // The author removes it: out of the queue, and not sent back.
    agent.inbox.nextTurn = []
    emit('agent/inbox/discarded', { agent, message: { id: 'm1' } })
    await new Promise((r) => setImmediate(r))
    assert.equal(record('session-s9'), undefined, 'the author removed it: nothing waits any more')
  } finally {
    for (const dispose of disposers) dispose?.()
    mock.timers.reset()
    if (previousRoot === undefined) delete process.env.TRACY_SITES_ROOT
    else process.env.TRACY_SITES_ROOT = previousRoot
    rmSync(sites, { recursive: true, force: true })
  }
})
