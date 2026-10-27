/**
 * The page's half of "notify me when the agent finishes" (tasks/todo-desktop-onboard-agent.md §4):
 * a turn that ends LIVE in a conversation this page follows is reported to the desktop app, with
 * its outcome; history, an older app and a turn reported twice never are. The app decides focus,
 * dedupe and the switch (packages/desktop/tracy-desktop/src/notify-bridge.js).
 * Bundled with esbuild the same way the other tests bundle the client.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(here, '..', 'src', 'client')
const coreModules = path.resolve(here, '..', '..', '..', 'core', 'tracy-core', 'node_modules')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ts-turn-watch-'))
  const outfile = path.join(outDir, 'turn-watch.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `export * from './turn-watch'\nexport { en } from './strings'`,
      resolveDir: clientDir,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    nodePaths: [coreModules],
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** A dsh session event window: `replace` on open, `append` per live event, like `MutableSessionEventSource`. */
function eventSource(history = []) {
  const listeners = new Set()
  let snapshot = {
    revision: 0,
    entries: history,
    change: { kind: 'replace', entries: history }
  }
  const publish = (change, entries) => {
    snapshot = { revision: snapshot.revision + 1, entries, change }
    for (const l of listeners) l()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    append: (...events) => {
      const entries = events.map((event) => ({ type: 'event', event }))
      publish({ kind: 'append', entries }, [...snapshot.entries, ...entries])
    },
    replace: (...events) => {
      const entries = events.map((event) => ({ type: 'event', event }))
      publish({ kind: 'replace', entries }, entries)
    },
    listeners
  }
}

/** `ctx.sessions` with the given bound conversations, all retained by the main view. */
function sessionsOf(bound) {
  const listeners = new Set()
  let subscribed = 0
  return {
    list: {
      getSnapshot: () => ({
        byId: Object.fromEntries(Object.keys(bound).map((id) => [id, { retainedBy: { mainView: 1 } }]))
      }),
      subscribe: (l) => {
        subscribed += 1
        listeners.add(l)
        return () => listeners.delete(l)
      }
    },
    binding: (id) => bound[id],
    get subscribed() {
      return subscribed
    },
    changed: () => {
      for (const l of listeners) l()
    }
  }
}

/** The desktop app's bridge at `protocolVersion`, recording every report. */
function appAt(protocolVersion) {
  const calls = []
  return {
    calls,
    app: {
      protocolVersion,
      notifications: {
        turnFinished: async (input) => {
          calls.push(input)
          return { decision: 'shown' }
        }
      }
    }
  }
}

const turnEnd = (seq, turn, reason) => ({ type: 'turn/end', seq, time: 0, data: { turn, reason } })
const words = (key) => lib.en[key] ?? key

function start(app, sessions, title = () => 'fijitrips.example') {
  return lib.startTurnWatch({ app, sessions, title, words })
}

test('a turn that ends live is reported once, with its outcome, ids, title and words', async () => {
  const source = eventSource([turnEnd(4, 1, { kind: 'completed' })])
  const sessions = sessionsOf({ s1: { eventSource: source } })
  const { app, calls } = appAt(2)
  start(app, sessions)
  source.append(turnEnd(9, 2, { kind: 'completed' }))
  assert.deepEqual(calls, [
    {
      sessionId: 's1',
      turnId: '2@9',
      outcome: 'completed',
      title: 'fijitrips.example',
      body: 'The agent is done.'
    }
  ])
})

test('the same turn arriving twice is reported once', () => {
  const source = eventSource()
  const { app, calls } = appAt(2)
  start(app, sessionsOf({ s1: { eventSource: source } }))
  const end = turnEnd(9, 2, { kind: 'completed' })
  source.append(end)
  source.append(end)
  assert.equal(calls.length, 1)
})

test('history never notifies: the loaded window, a reload and a page of older events', () => {
  const source = eventSource([turnEnd(4, 1, { kind: 'completed' })])
  const { app, calls } = appAt(2)
  start(app, sessionsOf({ s1: { eventSource: source } }))
  // A reconnect reads the history again, now holding a turn the page never saw live…
  source.replace(turnEnd(4, 1, { kind: 'completed' }), turnEnd(7, 2, { kind: 'error', error: {} }))
  // …and an append that repeats an event at or under what the window already held is not live.
  source.append(turnEnd(7, 2, { kind: 'error', error: {} }))
  source.append(turnEnd(3, 0, { kind: 'completed' }))
  assert.deepEqual(calls, [])
})

test('an app below protocol 2, or a browser, never subscribes', () => {
  for (const app of [appAt(1).app, undefined, null, { protocolVersion: 2 }]) {
    const sessions = sessionsOf({ s1: { eventSource: eventSource() } })
    start(app, sessions)
    assert.equal(sessions.subscribed, 0)
  }
})

test('each way a turn ends maps to its outcome and its words', () => {
  const source = eventSource()
  const { app, calls } = appAt(2)
  start(app, sessionsOf({ s1: { eventSource: source } }))
  source.append(
    turnEnd(10, 1, { kind: 'completed' }),
    turnEnd(11, 2, { kind: 'max-tokens' }),
    turnEnd(12, 3, { kind: 'error', error: { message: 'x' } }),
    turnEnd(13, 4, { kind: 'blocked' }),
    turnEnd(14, 5, { kind: 'aborted', reason: { kind: 'user' } }),
    turnEnd(15, 6, { kind: 'interrupted' }),
    turnEnd(16, 7, { kind: 'forked' }),
    { type: 'approval/asked', seq: 17, time: 0, data: { id: 'ap-1', toolName: 'bash' } },
    {
      type: 'tool/call',
      seq: 18,
      time: 0,
      data: { turn: 8, step: 1, callId: 'c-1', name: 'ask_user_question', arguments: '{}' }
    },
    {
      type: 'tool/call',
      seq: 19,
      time: 0,
      data: { turn: 8, step: 1, callId: 'c-2', name: 'bash', arguments: '{}' }
    },
    { type: 'step/end', seq: 20, time: 0, data: {} }
  )
  assert.deepEqual(
    calls.map((c) => [c.turnId, c.outcome, c.body]),
    [
      ['1@10', 'completed', 'The agent is done.'],
      ['2@11', 'completed', 'The agent is done.'],
      ['3@12', 'error', 'The agent stopped with an error.'],
      ['4@13', 'error', 'The agent stopped with an error.'],
      ['5@14', 'cancelled', 'The turn was cancelled.'],
      ['approval:ap-1', 'needs-input', 'The agent is waiting for you.'],
      ['ask:c-1', 'needs-input', 'The agent is waiting for you.']
    ]
  )
})

test('a subagent conversation is not followed; one bound later is', () => {
  const child = eventSource()
  const later = eventSource()
  const bound = {
    child: { eventSource: child, session: { getSnapshot: () => ({ subagent: { parent: 'p' } }) } }
  }
  const sessions = sessionsOf(bound)
  const { app, calls } = appAt(2)
  start(app, sessions)
  child.append(turnEnd(5, 1, { kind: 'completed' }))
  bound.s2 = { eventSource: later }
  sessions.changed()
  later.append(turnEnd(2, 1, { kind: 'completed' }))
  assert.deepEqual(
    calls.map((c) => c.sessionId),
    ['s2']
  )
})

test('no site gives the product name as the title; stop ends the following', () => {
  const source = eventSource()
  const { app, calls } = appAt(2)
  const stop = start(app, sessionsOf({ s1: { eventSource: source } }), () => null)
  source.append(turnEnd(1, 1, { kind: 'completed' }))
  stop()
  source.append(turnEnd(2, 2, { kind: 'completed' }))
  assert.deepEqual(
    calls.map((c) => c.title),
    ['Tracy Cowork']
  )
  assert.equal(source.listeners.size, 0)
})
