import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
const source = readFileSync(new URL('../src/widget/assets/live.js', import.meta.url), 'utf8')
function fixture(api) {
  let html = '',
    button = null
  const calls = [],
    delays = [],
    timers = new Map()
  let timerId = 0
  const state = { history: [{ role: 'user', text: 'Saved history' }], brief: {} }
  const context = vm.createContext({
    state,
    draft: 'Current words',
    pendingDraft: 'Manual words',
    speech: {},
    catalogue: {},
    notice: '',
    auth: { active: false, resume() {} },
    stage: {
      set innerHTML(value) {
        html = value
        button = value.includes('id="retry-connection"') ? { disabled: true } : null
      }
    },
    document: { getElementById: () => button },
    head: (value) => value,
    e: String,
    keepPendingDraft() {},
    render() {},
    renderWelcome() {},
    setNotice() {},
    AbortController,
    clearTimeout: (id) => timers.delete(id),
    setTimeout: (fn, ms) => {
      const id = ++timerId
      if (ms === 10000) timers.set(id, { fn, ms })
      else {
        delays.push(ms)
        queueMicrotask(fn)
      }
      return id
    },
    api: async (path, body, signal) => {
      calls.push(path)
      return api(path, signal)
    },
    enterNative: async () => {},
    console
  })
  const start = source.indexOf('let bootstrapPending = null')
  const code =
    start < 0
      ? 'function bootstrap() { return (async () => {' +
        source.slice(
          source.indexOf("try {\n  stage.innerHTML =\n    head('Connecting to Tracy…')"),
          source.indexOf('function fitViewport()')
        ) +
        '})() }'
      : source.slice(start, source.indexOf('await bootstrap()', start))
  vm.runInContext(code, context)
  return {
    context,
    calls,
    delays,
    timers,
    state,
    get html() {
      return html
    },
    get button() {
      return button
    }
  }
}
const unavailable = (retryable) =>
  Object.assign(Error('private database detail'), { code: 'WIDGET_UNAVAILABLE', status: 503, retryable })
const restored = { history: [{ role: 'user', text: 'Restored history' }], speech: { available: true } }
test('only transient bootstrap GET reads retry twice and retain draft/history while connecting', async () => {
  let reads = 0
  const f = fixture((path) => {
    if (path.endsWith('/state') && reads++ < 2) throw unavailable(true)
    return path.endsWith('/state') ? restored : { templates: [], systems: [] }
  })
  await f.context.bootstrap()
  assert.equal(reads, 3)
  assert.equal(f.calls.filter((p) => p.endsWith('/catalogue')).length, 1)
  assert.equal(f.delays.length, 2)
  assert.equal(f.context.pendingDraft, 'Manual words')
  assert.equal(f.context.draft, 'Current words')
  assert.equal(f.context.state.history[0].text, 'Restored history')
})
test('nonretryable, auth and conflict failures keep context and expose a safe explicit retry', async () => {
  for (const error of [
    unavailable(false),
    Object.assign(Error('secret'), { status: 401 }),
    Object.assign(Error('secret'), { code: 'WIDGET_STATE_CONFLICT', status: 409 })
  ]) {
    const f = fixture(() => {
      throw error
    })
    await f.context.bootstrap()
    assert.equal(f.calls.length, 1)
    assert.equal(f.context.state, f.state)
    assert.match(f.html, /Your conversation has not been cleared/)
    assert.doesNotMatch(f.html, /private database|secret|WIDGET_UNAVAILABLE/)
    assert.equal(f.button.disabled, false)
    const retryButton = f.button
    let release
    f.context.api = (path) =>
      path.endsWith('/state')
        ? new Promise((resolve) => {
            release = resolve
          })
        : Promise.resolve({ templates: [], systems: [] })
    const first = retryButton.onclick()
    assert.equal(retryButton.disabled, true)
    assert.equal(f.context.bootstrap(), first)
    release(restored)
    await first
    assert.equal(f.context.pendingDraft, 'Manual words')
  }
})
test('network GET failure retries but native adoption POST failure is not automatically retried', async () => {
  let reads = 0,
    opens = 0
  const f = fixture((path) => {
    if (path.endsWith('/state') && reads++ === 0)
      throw Object.assign(Error('fetch failed'), { name: 'TypeError' })
    return path.endsWith('/state') ? { ...restored, signedIn: true } : { templates: [], systems: [] }
  })
  f.context.enterNative = async () => {
    opens++
    throw unavailable(true)
  }
  let rendered = 0
  f.context.render = () => rendered++
  await f.context.bootstrap()
  assert.equal(reads, 2)
  assert.equal(opens, 1)
  // The state and catalogue were read: discovery renders them instead of a failed connection.
  assert.equal(rendered, 1)
  assert.doesNotMatch(f.html, /could not connect/)
  assert.equal(f.button, null)
})
test('a refused native hand-off at bootstrap (a turn still settling) renders discovery with its state', async () => {
  const f = fixture((path) =>
    path.endsWith('/state')
      ? {
          ...restored,
          signedIn: true,
          recovery: { message: 'Words to review', manualOnly: true }
        }
      : { templates: [], systems: [] }
  )
  const kept = []
  f.context.keepPendingDraft = (words) => kept.push(words)
  f.context.enterNative = async () => {
    throw Object.assign(Error('WIDGET_NATIVE_WAIT_FOR_TURN'), {
      code: 'WIDGET_NATIVE_WAIT_FOR_TURN',
      status: 409
    })
  }
  let rendered = 0
  f.context.render = () => rendered++
  await f.context.bootstrap()
  assert.equal(rendered, 1)
  assert.doesNotMatch(f.html, /could not connect/)
  assert.equal(f.context.state.history[0].text, 'Restored history')
  assert.deepEqual(kept, ['Words to review'])
})
test('api carries only an explicit boolean retry hint from the server', async () => {
  for (const hint of [true, false, 'secret detail']) {
    const context = vm.createContext({
      fetch: async () => Response.json({ code: 'WIDGET_UNAVAILABLE', retryable: hint }, { status: 503 })
    })
    vm.runInContext(
      source.slice(source.indexOf('async function api('), source.indexOf('function modelFailureMessage(')),
      context
    )
    await assert.rejects(
      context.api('/widget/api/state'),
      (error) => error.retryable === (typeof hint === 'boolean' ? hint : undefined)
    )
  }
})

test('a stalled bootstrap read times out per attempt and releases every abort timer', async () => {
  const f = fixture(
    (path, signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(Object.assign(Error('aborted'), { name: 'AbortError' }))
        )
      })
  )
  const pending = f.context.bootstrap()
  for (let n = 0; n < 3; n++) {
    assert.equal(f.timers.size, 1)
    const timer = f.timers.values().next().value
    assert.equal(timer.ms, 10000)
    timer.fn()
    await new Promise(setImmediate)
  }
  await pending
  assert.equal(f.calls.length, 3)
  assert.equal(f.timers.size, 0)
  assert.equal(f.button.disabled, false)
})

test('catalogue retries do not refetch or apply a partial state snapshot', async () => {
  let reads = 0
  const f = fixture((path) => {
    if (path.endsWith('/state')) return restored
    assert.equal(f.context.state, f.state)
    if (reads++ < 2) throw unavailable(undefined)
    return { templates: [], systems: [] }
  })
  await f.context.bootstrap()
  assert.equal(f.calls.filter((path) => path.endsWith('/state')).length, 1)
  assert.equal(reads, 3)
  assert.equal(f.timers.size, 0)
  assert.equal(f.context.state.history[0].text, 'Restored history')
})
