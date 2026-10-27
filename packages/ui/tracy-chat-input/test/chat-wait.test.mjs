/**
 * The line under a running chat that says what its turn waits on (#1403 item 10): another
 * conversation's write, the previous request's changes being saved, the page being looked at. The
 * chat showed only "Thinking for…" through waits of up to 100 / 120 / 30 s.
 *
 *   node --test packages/ui/tracy-chat-input/test/chat-wait.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { readWait, WAIT_SHOW_AFTER_S, waitLine } from '../src/client/chat-wait.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
const coreRequire = createRequire(path.join(corePkg, 'package.json'))
const { parseHTML } = createRequire(path.join(repoRoot, 'package.json'))('linkedom')
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

test('waitLine: a known wait long enough to look stuck gets its line; anything else none', () => {
  assert.deepEqual(waitLine({ kind: 'lease', seconds: 41.9 }), {
    key: 'wait.lease',
    kind: 'lease',
    seconds: 41
  })
  assert.equal(waitLine({ kind: 'previous', seconds: WAIT_SHOW_AFTER_S }).key, 'wait.previous')
  assert.equal(waitLine({ kind: 'check', seconds: 12 }).key, 'wait.check')
  assert.equal(waitLine({ kind: 'lease', seconds: WAIT_SHOW_AFTER_S - 1 }), null, 'a short wait says nothing')
  assert.equal(waitLine({ kind: 'someone', seconds: 40 }), null)
  assert.equal(waitLine({ kind: 'lease' }), null)
  assert.equal(waitLine(null), null)
})

test('readWait asks the held door with wait: true; a refusal, a foreign body or no answer is nothing', async () => {
  const calls = []
  const answer = (status, body) => async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return new Response(JSON.stringify(body), { status })
  }
  const dshUrl = (p) => `/qaem643.tracy.site${p}`
  assert.deepEqual(
    await readWait('session-1', {
      dshUrl,
      fetchImpl: answer(200, { ok: true, waiting: { kind: 'lease', seconds: 9 } })
    }),
    { kind: 'lease', seconds: 9 }
  )
  assert.deepEqual(calls[0], {
    url: '/qaem643.tracy.site/api/tracy-site-tools/held',
    body: { sessionId: 'session-1', wait: true }
  })
  assert.equal(await readWait('session-1', { dshUrl, fetchImpl: answer(200, { ok: true }) }), null)
  assert.equal(await readWait('session-1', { dshUrl, fetchImpl: answer(403, { ok: false }) }), null)
  assert.equal(
    await readWait('session-1', {
      dshUrl,
      fetchImpl: async () => {
        throw new TypeError('offline')
      }
    }),
    null
  )
})

// ── The line, mounted (harness of `turn-undo-card.test.mjs`) ──────────────────────────────────
const GLOBALS = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT']
const saved = new Map()
let lib
let dom
const cleanups = []

before(async () => {
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { ChatWaitLine } from './ChatWaitLine'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  set('window', dom.window)
  set('document', dom.document)
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  const load = (id) => (id.startsWith('react-dom') ? coreRequire(id) : require(id))
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(load, mod, mod.exports)
  lib = mod.exports
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

/** Mount the line for a chat that is (or is not) running, over a host half that answers `waits` in order. */
async function mount({ running, waits }) {
  const asked = []
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  const render = (isRunning) =>
    lib.act(async () => {
      root.render(
        lib.createElement(lib.ChatWaitLine, {
          sessionId: 'session-1',
          useSession: (select) => select({ running: isRunning }),
          every: 20,
          read: async (id) => {
            asked.push(id)
            return waits[Math.min(asked.length - 1, waits.length - 1)]
          }
        })
      )
    })
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await render(running)
  return { host, asked, render }
}

test('a running chat whose turn waits on another conversation says so, with the seconds; never who', async () => {
  const line = await mount({ running: true, waits: [{ kind: 'lease', seconds: 12 }] })
  await lib.act(async () => tick(60))
  assert.equal(line.host.querySelector('[data-chat-wait]')?.getAttribute('data-chat-wait'), 'lease')
  assert.equal(line.host.textContent, 'Waiting for another conversation to finish changing this site… 12 s')
  // The turn ended: the line goes, and nothing more is asked.
  await line.render(false)
  const asked = line.asked.length
  await lib.act(async () => tick(60))
  assert.equal(line.host.textContent, '')
  assert.equal(line.asked.length, asked)
})

test('an idle chat asks nothing; a running one with no wait, or a short one, draws nothing', async () => {
  const idle = await mount({ running: false, waits: [{ kind: 'lease', seconds: 40 }] })
  await lib.act(async () => tick(60))
  assert.deepEqual(idle.asked, [])
  assert.equal(idle.host.textContent, '')
  const quiet = await mount({ running: true, waits: [null, { kind: 'previous', seconds: 1 }] })
  await lib.act(async () => tick(80))
  assert.ok(quiet.asked.length >= 2)
  assert.equal(quiet.host.textContent, '')
})
