import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'

const source = new URL('../src/shell/navigation-guard.ts', import.meta.url)
const { createOpsNavigation } = existsSync(source) ? await import(source.href) : {}

// Model only the browser boundary: history traversal moves the URL before an
// asynchronous popstate. The guard and cancelable events are real production code.
function browser(initial = '/ops/servers') {
  const target = new EventTarget()
  const entries = [{ url: initial, state: { other: 'retained' } }]
  let index = 0
  const queue = []
  const win = Object.assign(target, {
    Event,
    location: { href: `http://localhost${initial}` },
    history: {
      get state() {
        return structuredClone(entries[index].state)
      },
      replaceState(state, _title, url) {
        entries[index] = { state: structuredClone(state), url: new URL(url, win.location.href).pathname }
        win.location.href = `http://localhost${entries[index].url}`
      },
      pushState(state, _title, url) {
        entries.splice(index + 1)
        entries.push({ state: structuredClone(state), url: new URL(url, win.location.href).pathname })
        index++
        win.location.href = `http://localhost${entries[index].url}`
      },
      go(delta) {
        queue.push(() => {
          if (index + delta < 0 || index + delta >= entries.length) return
          index += delta
          win.location.href = `http://localhost${entries[index].url}`
          const event = new Event('popstate')
          event.state = structuredClone(entries[index].state)
          win.dispatchEvent(event)
        })
      }
    }
  })
  return {
    win,
    entries,
    flush() {
      while (queue.length) queue.shift()()
    }
  }
}

function setup() {
  assert.equal(typeof createOpsNavigation, 'function', 'navigation guard must exist')
  const b = browser()
  const routes = []
  const navigation = createOpsNavigation(b.win, () => routes.push(b.win.location.href))
  let blocked = false
  let prompts = 0
  b.win.addEventListener('tracy:before-ops-navigation', (event) => {
    prompts++
    if (blocked) event.preventDefault()
  })
  return {
    ...b,
    navigation,
    routes,
    block(value) {
      blocked = value
    },
    get prompts() {
      return prompts
    }
  }
}

test('cancelled push and replace leave history, URL and rendered route unchanged', () => {
  const b = setup()
  b.block(true)
  for (const replace of [false, true]) {
    assert.equal(b.navigation.navigate('/ops/invitations', replace), false)
    assert.equal(b.win.location.href, 'http://localhost/ops/servers')
    assert.equal(b.entries.length, 1)
    assert.deepEqual(b.routes, [])
  }
  assert.equal(b.win.history.state.other, 'retained')
  b.navigation.dispose()
})

test('cancelled Back restores its history position without a second confirmation', () => {
  const b = setup()
  b.navigation.navigate('/ops/invitations')
  b.block(true)
  b.win.history.go(-1)
  b.flush()
  assert.equal(b.win.location.href, 'http://localhost/ops/invitations')
  assert.equal(b.entries.length, 2)
  assert.deepEqual(b.routes, ['http://localhost/ops/invitations'])
  assert.equal(b.prompts, 2)
  b.block(false)
  b.win.history.go(-1)
  b.flush()
  assert.equal(b.win.location.href, 'http://localhost/ops/servers')
  assert.equal(b.routes.at(-1), 'http://localhost/ops/servers')
  b.navigation.dispose()
})

test('cancelled Forward and multi-entry Back restore the exact position', () => {
  const b = setup()
  b.navigation.navigate('/ops/invitations')
  b.navigation.navigate('/ops/ci')
  b.win.history.go(-1)
  b.flush()
  b.block(true)
  b.win.history.go(1)
  b.flush()
  assert.equal(b.win.location.href, 'http://localhost/ops/invitations')
  b.block(false)
  b.win.history.go(1)
  b.flush()
  b.block(true)
  b.win.history.go(-2)
  b.flush()
  assert.equal(b.win.location.href, 'http://localhost/ops/ci')
  assert.equal(b.entries.length, 3)
  b.navigation.dispose()
})

test('replacement keeps the traversal index and a blocked old entry cannot unmount the editor', () => {
  const b = setup()
  b.navigation.navigate('/ops/invitations')
  b.navigation.navigate('/ops/ci', true)
  assert.equal(b.entries.length, 2)
  b.block(true)
  b.entries[0].state = null
  b.win.history.go(-1)
  b.flush()
  assert.equal(b.win.location.href, 'http://localhost/ops/ci')
  assert.deepEqual(b.routes, ['http://localhost/ops/invitations', 'http://localhost/ops/ci'])
  b.block(false)
  b.navigation.navigate('/ops/invitations')
  b.win.history.go(-1)
  b.flush()
  assert.equal(b.win.location.href, 'http://localhost/ops/ci')
  b.navigation.dispose()
})

test('without a blocking listener navigation and browser history remain available', () => {
  const b = setup()
  b.navigation.navigate('/ops/invitations')
  b.win.history.go(-1)
  b.flush()
  b.win.history.go(1)
  b.flush()
  assert.deepEqual(b.routes, [
    'http://localhost/ops/invitations',
    'http://localhost/ops/servers',
    'http://localhost/ops/invitations'
  ])
  b.navigation.dispose()
})

test('plain HTTP development origins do not require secure-context crypto APIs', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} })
  try {
    const b = setup()
    assert.equal(b.navigation.navigate('/ops/invitations'), true)
    assert.equal(b.win.location.href, 'http://localhost/ops/invitations')
    b.navigation.dispose()
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original)
    else delete globalThis.crypto
  }
})
