/**
 * Stage-6 acceptance e2e v4 (send, S12, 30/09/2026): a task TYPED in the chat never made the Browser
 * tab's Refresh spin when the page was opened at the site root (`/<site>/?open=browser…`) and dsh made
 * a NEW conversation for it — 3 runs of 7; the four runs opened through `/s/<session>` passed.
 *
 * Why (read in dsh, `session-controller` `manager.ts` `create`): a session created in a workspace is
 * published as a PLACEHOLDER row with no `cwd` (only a create by directory carries one). The row gets
 * its `cwd` when the host list is read again — on the next page load, which is why `/s/<id>` passed.
 * So `watchTurnProgress` followed the right session, but `siteOf` read no `/site/<label>` on its row and
 * said nothing: no working, no site-changed, no turn-end. The fork's poll then saw Tracy's own write
 * ("New version ready" mid-turn) and the site tabs reloaded the frame silently at the turn end.
 *
 * The session's Browser tab says which site it shows (`tracy:comment-list` `{sessionId, siteKey}`), so
 * a row with no `cwd` is on this page's site when a Browser tab of THAT session lists this site.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SITE_CHANGED_EVENT,
  TURN_END_EVENT,
  watchTurnProgress,
  WORKING_EVENT
} from '../src/client/comment-status.mjs'

const NEW = 'session-1adb0118-6b8d-481a-92e9-f0212488b4fd'
const SITE = 'e3sw0330.tracy.test'
const NOW = Date.UTC(2026, 8, 30, 4, 0, 0)

const entry = (type, data) => ({ type: 'event', event: { type, time: NOW - 500, data } })
const TASK = 'change the heading "Maintenance and retrofit" to "Maintenance and upgrades"'
const turn = [
  entry('turn/start', { turn: 1 }),
  entry('user/message', { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: TASK }] }),
  entry('tool/call', {
    turn: 1,
    callId: 'c1',
    name: 'tracy_site',
    arguments: JSON.stringify({ action: 'content.replace', params: { find: 'a', replace: 'b' } })
  }),
  entry('tool/result', {
    turn: 1,
    message: {
      toolCallId: 'c1',
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ ok: true, applyId: 'x' }) }]
    }
  }),
  entry('turn/end', { turn: 1, reason: 'completed' })
]

/** A fake `ctx.sessions` whose list and bindings the test moves step by step. */
function fakeSessions() {
  /** @type {Record<string, any>} */
  let byId = {}
  const listListeners = new Set()
  /** @type {Map<string, { snapshot: any, listeners: Set<() => void> }>} */
  const sources = new Map()
  const makeSource = (id) => {
    const s = { snapshot: { revision: 0, change: undefined, entries: [] }, listeners: new Set() }
    sources.set(id, s)
    return s
  }
  const sourceFace = (s) => ({
    getSnapshot: () => s.snapshot,
    subscribe: (l) => (s.listeners.add(l), () => s.listeners.delete(l))
  })
  /** @type {Map<string, any>} */
  const faces = new Map()
  return {
    sessions: {
      list: {
        getSnapshot: () => ({ byId }),
        subscribe: (l) => (listListeners.add(l), () => listListeners.delete(l))
      },
      binding: (id) => (faces.has(id) ? { eventSource: faces.get(id) } : undefined)
    },
    setRows(rows) {
      byId = rows
      for (const l of listListeners) l()
    },
    /** A binding (a new generation when called again for the same id). */
    bind(id) {
      const s = makeSource(id)
      faces.set(id, sourceFace(s))
      return s
    },
    append(id, entries) {
      const s = sources.get(id)
      s.snapshot = {
        revision: s.snapshot.revision + 1,
        change: { kind: 'append', entries },
        entries: [...s.snapshot.entries, ...entries]
      }
      for (const l of s.listeners) l()
    }
  }
}

function watch(fake, tabSite) {
  const target = new EventTarget()
  const seen = []
  for (const type of [WORKING_EVENT, SITE_CHANGED_EVENT, TURN_END_EVENT])
    target.addEventListener(type, (e) =>
      seen.push(`${e.detail.sessionId}:${type.replace('tracy:', '')}:${e.detail.siteKey}`)
    )
  const stop = watchTurnProgress({
    sessions: fake.sessions,
    target,
    sentTurns: new Map(),
    siteKey: () => SITE,
    tabSite
  })
  return { seen, stop }
}

const expected = [`${NEW}:tracy-working:${SITE}`, `${NEW}:site-changed:${SITE}`, `${NEW}:turn-end:${SITE}`]

test('S12 root URL → new conversation: a placeholder row with no cwd, its Browser tab on this site — the chat turn is said', () => {
  const fake = fakeSessions()
  const tabs = new Map()
  const w = watch(fake, (id) => tabs.get(id) ?? null)
  // The page opens at the site root: nothing on screen yet.
  fake.setRows({})
  // dsh creates the conversation in the site's workspace: a placeholder row, no cwd, then retained by
  // the main view (the URL turns into /s/<id>).
  fake.bind(NEW)
  fake.setRows({ [NEW]: { blank: true, retainedBy: {} } })
  fake.setRows({ [NEW]: { blank: true, retainedBy: { mainView: 1 } } })
  // `?open=browser`: the conversation's Browser tab mounts and lists this site's comments.
  tabs.set(NEW, SITE)
  // The person types the task in the chat.
  fake.append(NEW, turn.slice(0, 2))
  fake.append(NEW, turn.slice(2, 4))
  fake.append(NEW, turn.slice(4))
  w.stop()
  assert.deepEqual(w.seen, expected)
})

test('a no-cwd session whose Browser tab shows ANOTHER site (or has no tab) still says nothing', () => {
  for (const tabSite of [() => 'southgate.tracy.test', () => null, undefined]) {
    const fake = fakeSessions()
    const w = watch(fake, tabSite)
    fake.bind(NEW)
    fake.setRows({ [NEW]: { blank: true, retainedBy: { mainView: 1 } } })
    fake.append(NEW, turn)
    w.stop()
    assert.deepEqual(w.seen, [])
  }
})

test('the same conversation id with a NEW binding generation: the watcher follows the new feed, not the dead one', () => {
  const fake = fakeSessions()
  const w = watch(fake, () => SITE)
  fake.bind(NEW)
  fake.setRows({ [NEW]: { blank: true, cwd: '/site/e3sw0330', retainedBy: { mainView: 1 } } })
  // dsh drops the blank generation and retains a new one under the same id (any list change after).
  fake.bind(NEW)
  fake.setRows({ [NEW]: { blank: false, cwd: '/site/e3sw0330', retainedBy: { mainView: 1 } } })
  fake.append(NEW, turn)
  w.stop()
  assert.deepEqual(w.seen, expected)
})
