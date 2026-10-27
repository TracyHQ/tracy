/**
 * A second app window keeps its own copy of the page's window-level storage keys (column widths, the
 * conversation on screen) and never writes them back, so it cannot change how the main window opens.
 *
 *   node --test packages/desktop/tracy-desktop/test/window-storage.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { isolateWindowStorage, WINDOW_KEYS } = require('../src/window-storage.js')

/** A browser-like realm: one Storage class, a local and a session area, window events. */
function realm({ local = new Map(), session = new Map() } = {}) {
  class Storage {
    constructor(map) {
      this.map = map
    }
    getItem(key) {
      return this.map.has(String(key)) ? this.map.get(String(key)) : null
    }
    setItem(key, value) {
      this.map.set(String(key), String(value))
    }
    removeItem(key) {
      this.map.delete(String(key))
    }
  }
  const listeners = []
  const scope = {
    Storage,
    localStorage: new Storage(local),
    sessionStorage: new Storage(session),
    addEventListener(type, fn, capture) {
      listeners.push({ type, fn, capture: capture === true || capture?.capture === true })
    },
    /** Dispatch like a browser: capture listeners first, stopImmediatePropagation honoured. */
    dispatch(event) {
      let stopped = false
      event.stopImmediatePropagation = () => {
        stopped = true
      }
      const heard = []
      for (const l of [...listeners.filter((x) => x.capture), ...listeners.filter((x) => !x.capture)]) {
        if (l.type !== event.type) continue
        l.fn(event)
        if (stopped) break
        heard.push(l)
      }
      return heard.length
    }
  }
  return { scope, local, session }
}

const WIDTH = 'dsh-layout:chat-width:v2'

test('a second window starts from the shared value', () => {
  const { scope } = realm({ local: new Map([[WIDTH, '640']]) })
  isolateWindowStorage(WINDOW_KEYS, scope)
  assert.equal(scope.localStorage.getItem(WIDTH), '640')
})

test("a second window's writes stay in that window", () => {
  const { scope, local } = realm({ local: new Map([[WIDTH, '640']]) })
  isolateWindowStorage(WINDOW_KEYS, scope)
  scope.localStorage.setItem(WIDTH, 512)
  assert.equal(scope.localStorage.getItem(WIDTH), '512')
  assert.equal(local.get(WIDTH), '640')
})

test('once started, a second window does not follow later changes of the main window', () => {
  const { scope, local } = realm({ local: new Map([[WIDTH, '640']]) })
  isolateWindowStorage(WINDOW_KEYS, scope)
  assert.equal(scope.localStorage.getItem(WIDTH), '640')
  local.set(WIDTH, '900')
  assert.equal(scope.localStorage.getItem(WIDTH), '640')
})

test('a removal in a second window is remembered there and does not reach the main window', () => {
  const { scope, local } = realm({ local: new Map([[WIDTH, '640']]) })
  isolateWindowStorage(WINDOW_KEYS, scope)
  scope.localStorage.removeItem(WIDTH)
  assert.equal(scope.localStorage.getItem(WIDTH), null)
  assert.equal(local.get(WIDTH), '640')
})

test('every other key, drafts included, is shared as before', () => {
  const { scope, local } = realm({ local: new Map([['dsh.conversation.session-1', '{"draft":"hi"}']]) })
  isolateWindowStorage(WINDOW_KEYS, scope)
  assert.equal(scope.localStorage.getItem('dsh.conversation.session-1'), '{"draft":"hi"}')
  scope.localStorage.setItem('dsh.conversation.session-1', '{"draft":"hello"}')
  scope.localStorage.setItem('dsh.ui-theme.v1', 'dark')
  assert.equal(local.get('dsh.conversation.session-1'), '{"draft":"hello"}')
  assert.equal(local.get('dsh.ui-theme.v1'), 'dark')
})

test("the page's own session storage keeps working, under the same key names", () => {
  const { scope } = realm()
  isolateWindowStorage(WINDOW_KEYS, scope)
  scope.sessionStorage.setItem(WIDTH, 'page-owned')
  scope.localStorage.setItem(WIDTH, '512')
  assert.equal(scope.sessionStorage.getItem(WIDTH), 'page-owned')
  assert.equal(scope.localStorage.getItem(WIDTH), '512')
})

test("a reload of the second window keeps that window's values", () => {
  const session = new Map()
  const local = new Map([[WIDTH, '640']])
  const first = realm({ local, session })
  isolateWindowStorage(WINDOW_KEYS, first.scope)
  first.scope.localStorage.setItem(WIDTH, '512')
  first.scope.localStorage.removeItem('dsh.sessions.current')
  local.set('dsh.sessions.current', '{"main":"s-main"}')
  // Same tab, new document: same session area, a fresh realm.
  const second = realm({ local, session })
  isolateWindowStorage(WINDOW_KEYS, second.scope)
  assert.equal(second.scope.localStorage.getItem(WIDTH), '512')
  assert.equal(second.scope.localStorage.getItem('dsh.sessions.current'), null)
})

test("the main window's storage events about an isolated key do not reach the second window's page", () => {
  const { scope } = realm()
  isolateWindowStorage(WINDOW_KEYS, scope)
  const heard = []
  scope.addEventListener('storage', (e) => heard.push(e.key))
  scope.dispatch({ type: 'storage', key: WIDTH, storageArea: scope.localStorage, newValue: '900' })
  scope.dispatch({
    type: 'storage',
    key: 'dsh.ui-theme.v1',
    storageArea: scope.localStorage,
    newValue: 'dark'
  })
  scope.dispatch({ type: 'storage', key: WIDTH, storageArea: scope.sessionStorage, newValue: 'x' })
  assert.deepEqual(heard, ['dsh.ui-theme.v1', WIDTH])
})

test('installing twice in one document is the same as once', () => {
  const { scope, local } = realm({ local: new Map([[WIDTH, '640']]) })
  isolateWindowStorage(WINDOW_KEYS, scope)
  isolateWindowStorage(WINDOW_KEYS, scope)
  scope.localStorage.setItem(WIDTH, '512')
  assert.equal(scope.localStorage.getItem(WIDTH), '512')
  assert.equal(local.get(WIDTH), '640')
})

test('with no session storage the copy lives in the document, never in the shared area', () => {
  const { scope, local } = realm({ local: new Map([[WIDTH, '640']]) })
  Object.defineProperty(scope, 'sessionStorage', {
    get() {
      throw new Error('SecurityError')
    }
  })
  isolateWindowStorage(WINDOW_KEYS, scope)
  scope.localStorage.setItem(WIDTH, '512')
  assert.equal(scope.localStorage.getItem(WIDTH), '512')
  assert.equal(local.get(WIDTH), '640')
})

test('the function carries no outside reference, so it can run in the page by its source alone', () => {
  // contextBridge.executeInMainWorld sends the function's source; rebuild it from that.
  const rebuilt = new Function(`return (${isolateWindowStorage.toString()})`)()
  const { scope, local } = realm({ local: new Map([[WIDTH, '640']]) })
  rebuilt([WIDTH], scope)
  scope.localStorage.setItem(WIDTH, '512')
  assert.equal(local.get(WIDTH), '640')
})
