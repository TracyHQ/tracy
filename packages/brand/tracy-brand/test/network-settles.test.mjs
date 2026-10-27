/**
 * The boot cover lifts when networkSettles() resolves, so these tests pin the moment it does.
 *
 * The scenario is not invented: it is the waterfall measured on cowork.tracy.ai on 2026-09-07,
 * fresh account, five runs. The page loads in TWO waves with a ~950ms quiet between them, and the
 * old rule — start counting at the first request of any kind — resolved inside that quiet, while
 * identity and the site list had not been asked for yet. Four clean runs put the cover 1.0-2.3s
 * ahead of the screen.
 *
 * Time is driven by hand rather than by real timers: a test that sleeps 950ms to prove a 500ms
 * window is a test nobody runs twice.
 */
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { networkSettles, IDLE_MS, GATE_TIMEOUT_MS, FALLBACK_IDLE_MS } from '../src/shared/network-settles.mjs'

/** A scope with a fetch whose responses are resolved by hand. @returns the scope and its controls. */
function makeScope() {
  const pending = []
  const scope = {
    fetch: (input) => {
      let settle
      const promise = new Promise((resolve) => {
        settle = resolve
      })
      pending.push({ url: typeof input === 'string' ? input : input.url, settle })
      return promise
    }
  }
  /** Answer every request currently in flight. @returns a promise for the microtasks to drain. */
  const respondAll = async () => {
    const batch = pending.splice(0)
    for (const p of batch) p.settle({ ok: true })
    // .finally() callbacks are microtasks; two turns is enough for the chain in networkSettles.
    await Promise.resolve()
    await Promise.resolve()
  }
  return { scope, respondAll }
}

/** WAVE 1: what dsh asks for while it raises an empty frame. */
const WAVE_1 = [
  '/sidebar/api/shell.get',
  '/sidebar/api/settings.get',
  '/api/dynamicCordisRunner/inventory',
  '/api/session/modelCatalog'
]

/** WAVE 2: what the person actually came to see. The gate request rides here. */
const WAVE_2 = ['/api/session/list', '/api/sites', '/auth/me', '/api/team']

test('it does NOT resolve in the quiet between wave 1 and wave 2', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { scope, respondAll } = makeScope()
    let settled = false
    void networkSettles(scope).then(() => {
      settled = true
    })

    for (const url of WAVE_1) void scope.fetch(url)
    await respondAll()

    // The measured gap was 952ms. Anything past IDLE_MS would have tripped the old rule.
    mock.timers.tick(952)
    await Promise.resolve()

    assert.equal(settled, false, 'lifted inside the gap — wave 2 has not even been asked for')
  } finally {
    mock.timers.reset()
  }
})

test('it resolves once /auth/me has answered and the page goes quiet', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { scope, respondAll } = makeScope()
    let settled = false
    void networkSettles(scope).then(() => {
      settled = true
    })

    for (const url of WAVE_1) void scope.fetch(url)
    await respondAll()
    mock.timers.tick(952)

    for (const url of WAVE_2) void scope.fetch(url)
    await respondAll()
    assert.equal(settled, false, 'the idle window has not elapsed yet')

    mock.timers.tick(IDLE_MS)
    await Promise.resolve()
    assert.equal(settled, true, 'both waves are done and the page is quiet')
  } finally {
    mock.timers.reset()
  }
})

test('a request arriving inside the idle window pushes the window back', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { scope, respondAll } = makeScope()
    let settled = false
    void networkSettles(scope).then(() => {
      settled = true
    })

    void scope.fetch('/auth/me')
    await respondAll()

    mock.timers.tick(IDLE_MS - 100)
    void scope.fetch('/api/sites')
    mock.timers.tick(200)
    await Promise.resolve()
    assert.equal(settled, false, 'a late request must reopen the window')

    await respondAll()
    mock.timers.tick(IDLE_MS)
    await Promise.resolve()
    assert.equal(settled, true)
  } finally {
    mock.timers.reset()
  }
})

test('no gate in front of this build: it falls back to the old rule', async () => {
  // 🔒 This is local. A dev profile serves no /auth/me, and without this fallback every local
  // boot would sit at the 8s deadline.
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { scope, respondAll } = makeScope()
    let settled = false
    void networkSettles(scope).then(() => {
      settled = true
    })

    void scope.fetch('/sidebar/api/shell.get')
    await respondAll()

    mock.timers.tick(IDLE_MS)
    await Promise.resolve()
    assert.equal(settled, false, 'still waiting for a gate that is not coming')

    mock.timers.tick(GATE_TIMEOUT_MS)
    await Promise.resolve()
    mock.timers.tick(FALLBACK_IDLE_MS)
    await Promise.resolve()
    assert.equal(settled, true, 'past the gate timeout the old rule resumes, on the wider window')
  } finally {
    mock.timers.reset()
  }
})

test('a page that asks for nothing at all still resolves', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { scope } = makeScope()
    let settled = false
    void networkSettles(scope).then(() => {
      settled = true
    })

    mock.timers.tick(IDLE_MS * 2)
    await Promise.resolve()
    assert.equal(settled, true)
  } finally {
    mock.timers.reset()
  }
})

test('it puts fetch back the way it found it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { scope } = makeScope()
    const original = scope.fetch
    const done = networkSettles(scope)
    assert.notEqual(scope.fetch, original, 'wrapped while listening')

    mock.timers.tick(IDLE_MS * 2)
    await done
    assert.equal(scope.fetch, original, 'restored once it has an answer')
  } finally {
    mock.timers.reset()
  }
})

test('the fallback firing inside the gap must NOT lift the cover', async () => {
  // 🔒 THE REGRESSION THIS FILE EXISTS FOR, ONE LAYER DOWN. GATE_TIMEOUT_MS is counted from the
  // cover mounting, so it can fire a beat before /auth/me answers. Landing inside the 952ms quiet
  // must not be enough to open the window, or the fallback reintroduces the original bug.
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { scope, respondAll } = makeScope()
    let settled = false
    void networkSettles(scope).then(() => {
      settled = true
    })

    for (const url of WAVE_1) void scope.fetch(url)
    await respondAll()

    // Push past the gate timeout while the page is quiet — the worst possible moment.
    mock.timers.tick(GATE_TIMEOUT_MS)
    await Promise.resolve()
    mock.timers.tick(952 - IDLE_MS)
    await Promise.resolve()
    assert.equal(settled, false, 'the measured gap is 952ms and must not fit the fallback window')

    for (const url of WAVE_2) void scope.fetch(url)
    await respondAll()
    mock.timers.tick(FALLBACK_IDLE_MS)
    await Promise.resolve()
    assert.equal(settled, true, 'wave 2 arrived and finished, so now it may lift')
  } finally {
    mock.timers.reset()
  }
})

test('a wrapper another plugin installed after it survives the restore', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { scope, respondAll } = makeScope()
    const done = networkSettles(scope)
    // Another plugin wraps fetch while the cover is listening (dsh-passwords' picker does this).
    const below = scope.fetch
    const seen = []
    const theirs = function theirs(...args) {
      seen.push(args[0])
      return below.apply(this, args)
    }
    scope.fetch = theirs

    mock.timers.tick(IDLE_MS * 2)
    await done
    assert.equal(scope.fetch, theirs, 'the later wrapper is still installed')

    // Calls after the restore still pass through every layer and reach the real fetch.
    void scope.fetch('/api/directoryPicker/list')
    assert.deepEqual(seen, ['/api/directoryPicker/list'])
    await respondAll()
  } finally {
    mock.timers.reset()
  }
})
