/**
 * The client binds every conversation the page comes to show to its viewer, not only the one it
 * loaded on. dsh opens a conversation with `pushState`, which fires no `popstate`; measured
 * 23/09/2026 on `j-0a5wcu` and `wp-3bn5a1`, a page that entered the site at `/<site>/` and then
 * opened a conversation inside the SPA left that conversation with no viewer, and its build failed
 * `check` with `NO_VIEWER`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { followShownSession } from '../src/client/follow-session.mjs'

/** A sessions service whose main view shows `main`, as dsh's list reports it (`retainedBy`). */
function sessions(initial) {
  let main = initial
  const listeners = new Set()
  return {
    list: {
      getSnapshot: () => ({
        byId: {
          ...(main === undefined ? {} : { [main]: { retainedBy: { mainView: 1 } } }),
          'session-in-a-side-pane': { retainedBy: { sidebar: 1 } }
        }
      }),
      subscribe: (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      }
    },
    show(id) {
      main = id
      for (const fn of listeners) fn()
    },
    listeners
  }
}

test('each conversation the main view comes to show is reported once; the one on screen at the start is not', () => {
  const s = sessions('session-a')
  const shown = []
  const stop = followShownSession(s, (id) => shown.push(id))
  s.show('session-a')
  s.show('session-b')
  s.show('session-b')
  s.show(undefined)
  s.show('session-c')
  assert.deepEqual(shown, ['session-b', 'session-c'])

  stop()
  s.show('session-d')
  assert.deepEqual(shown, ['session-b', 'session-c'], 'nothing is reported once following stops')
  assert.equal(s.listeners.size, 0)
})

test('a page with nothing on screen yet reports the first conversation it comes to show', () => {
  const s = sessions(undefined)
  const shown = []
  followShownSession(s, (id) => shown.push(id))
  s.show('session-a')
  assert.deepEqual(shown, ['session-a'])
})
