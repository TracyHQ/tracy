/**
 * Remove a pasted source from the Sources table of Details (#537): the door's answers read as their own lines (an
 * older server without the door reads the generic error), only before research or after it failed, and the whole
 * press mounted with React 18 in jsdom against a stubbed API: the trash opens a confirmation dialog, Cancel and
 * Escape close it with nothing called, Remove spins in the dialog while the row is muted, a refusal stays in the
 * dialog with Remove enabled again, and a reload closes it when the source went or was already gone.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-source-remove.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createApi } from '../src/client/api.ts'
import {
  removableLinkOf,
  removeAllowedIn,
  removeRefusalKey,
  removeSource
} from '../src/client/source-remove-model.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

const ID = '00000000-0000-4000-8000-000000000001'
const INSTAGRAM = 'https://www.instagram.com/sample_kite_club'
const WEBSITE = 'https://sample-kite.example/'
const refuse = (status, code) => ({ ok: false, status, code })

test('the door is DELETE …/:id/sources with the link as JSON', async () => {
  const calls = []
  const api = createApi(async (url, init) => {
    calls.push({ url, init })
    return { ok: true, status: 200, json: async () => ({ opportunity: {}, approval: {} }) }
  })
  const answer = await api.removeSource(ID, INSTAGRAM)
  assert.equal(answer.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `/api/website-opportunities/${ID}/sources`)
  assert.equal(calls[0].init.method, 'DELETE')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), { url: INSTAGRAM })
})

test('each refusal has its own line; an unknown one, INVALID_URL and an older server read the generic error', () => {
  assert.equal(removeRefusalKey('LAST_SOURCE', 409), 'source.remove.error.LAST_SOURCE')
  assert.equal(removeRefusalKey('RESEARCH_STARTED', 409), 'source.remove.error.RESEARCH_STARTED')
  // The server no longer answers JOB_ACTIVE for a removal: it has no line of its own any more.
  assert.equal(removeRefusalKey('JOB_ACTIVE', 409), 'action.failed')
  assert.equal(removeRefusalKey('NOT_FOUND', 404), 'source.remove.error.NOT_FOUND')
  assert.equal(
    removeRefusalKey('GOOGLE_LINK_NOT_REMOVED', 422),
    'source.remove.error.GOOGLE_LINK_NOT_REMOVED'
  )
  assert.equal(removeRefusalKey('INVALID_URL', 400), 'action.failed')
  assert.equal(removeRefusalKey('HTTP_404', 404), 'action.failed')
  assert.equal(removeRefusalKey('HTTP_405', 405), 'action.failed')
  assert.equal(removeRefusalKey('NOT_FOUND', 405), 'action.failed')
  assert.equal(removeRefusalKey('NETWORK', 0), 'action.failed')
})

test('a removed or already gone source reloads Details; a refusal does not', async () => {
  const outcome = async (answer) => removeSource({ removeSource: async () => answer }, ID, INSTAGRAM)
  assert.deepEqual(await outcome({ ok: true, status: 200, body: {} }), { refresh: true, noticeKey: null })
  assert.deepEqual(await outcome(refuse(404, 'NOT_FOUND')), {
    refresh: true,
    noticeKey: 'source.remove.error.NOT_FOUND'
  })
  assert.deepEqual(await outcome(refuse(409, 'LAST_SOURCE')), {
    refresh: false,
    noticeKey: 'source.remove.error.LAST_SOURCE'
  })
  assert.deepEqual(await outcome(refuse(405, 'HTTP_405')), { refresh: false, noticeKey: 'action.failed' })
  const thrown = await removeSource(
    {
      removeSource: async () => {
        throw new Error('offline')
      }
    },
    ID,
    INSTAGRAM
  )
  assert.deepEqual(thrown, { refresh: false, noticeKey: 'action.failed' })
})

test('a source can be removed only before research or after it failed', () => {
  assert.equal(removeAllowedIn('not_started'), true)
  assert.equal(removeAllowedIn('failed'), true)
  assert.equal(removeAllowedIn('running'), false)
  assert.equal(removeAllowedIn('done'), false)
  assert.equal(removeAllowedIn(undefined), false)
})

test('only a pasted link can be removed, never the Google place', () => {
  assert.equal(removableLinkOf({ source: 'instagram', pastedLink: INSTAGRAM }), INSTAGRAM)
  assert.equal(removableLinkOf({ source: 'website', ref: WEBSITE, status: 'complete' }), null)
  assert.equal(
    removableLinkOf({ source: 'google-places', pastedLink: 'https://maps.app.goo.gl/SampleKite' }),
    null
  )
  assert.equal(removableLinkOf({ source: 'website', pastedLink: 'javascript:alert(1)' }), null)
})

// The whole press, mounted.
let outDir = ''
let lib
let dom
let pendingScheduler
before(async () => {
  pendingScheduler = setInterval(() => {}, 1000)
  const { JSDOM } = createRequire(path.join(fromStore('jsdom@', 'jsdom'), 'package.json'))('jsdom')
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'navigator',
    'Node',
    'Element',
    'HTMLElement',
    'MouseEvent',
    'KeyboardEvent',
    'Event',
    'FocusEvent',
    'CustomEvent',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ]) {
    Object.defineProperty(globalThis, name, {
      value:
        name === 'window'
          ? window
          : /^[a-z]/.test(name) && typeof window[name] === 'function'
            ? window[name].bind(window)
            : window[name],
      configurable: true,
      writable: true
    })
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const Channel = globalThis.MessageChannel
  globalThis.MessageChannel = class extends Channel {
    constructor() {
      super()
      queueMicrotask(() => this.port1.unref())
    }
  }
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-source-remove-'))
  const outfile = path.join(outDir, 'source-remove.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement, useState } from 'react'
        export { act } from 'react'
        export { createRoot } from 'react-dom/client'
        import { SourcesTable } from './details-parts.tsx'
        import { useSourceRemove } from './source-retry.ts'
        const t = (key, params) => '[' + key + (params ? JSON.stringify(params) : '') + ']'
        export function Harness({ api, initial, reloaded }) {
          const [sources, setSources] = useState(initial)
          const remove = useSourceRemove(api, '${ID}', async () => setSources(reloaded))
          return createElement(SourcesTable, { t, sources, remove, researchState: 'not_started' })
        }
        export { createElement }
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  clearInterval(pendingScheduler)
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const ROWS = [
  { source: 'instagram', ref: INSTAGRAM, status: 'complete', pastedLink: INSTAGRAM },
  { source: 'website', ref: WEBSITE, status: 'complete', pastedLink: WEBSITE }
]

/** Mounts the table with a stubbed door: each call waits until the test settles it; the reload shows `reloaded`. */
function mount(reloaded = ROWS) {
  const calls = []
  const api = {
    removeSource: (id, url) =>
      new Promise((resolve) => {
        calls.push({ id, url, resolve })
      })
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  lib.act(() => root.render(lib.createElement(lib.Harness, { api, initial: ROWS, reloaded })))
  const rowOf = (url) =>
    [...host.querySelectorAll('li.tracy-wo-stab-row')].find((li) => li.querySelector(`a[href="${url}"]`))
  // The dialog is a portal on the body, outside the table.
  const dialog = () => document.body.querySelector('[role="dialog"]')
  const press = (el) => lib.act(() => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  const button = (scope, text) => [...scope.querySelectorAll('button')].find((b) => b.textContent === text)
  const ask = (url) => press(rowOf(url).querySelector('.tracy-wo-stab-remove'))
  const settle = async (answer) => {
    await lib.act(async () => {
      calls.at(-1).resolve(answer)
      await new Promise((r) => setTimeout(r, 10))
    })
  }
  return { host, root, calls, rowOf, dialog, press, button, ask, settle }
}

const unmount = (m) => {
  lib.act(() => m.root.unmount())
  m.host.remove()
}

test('the trash opens a dialog naming the source and its short link; Cancel closes it and calls nothing', () => {
  const m = mount()
  try {
    assert.equal(m.dialog(), null)
    m.ask(INSTAGRAM)
    const dialog = m.dialog()
    assert.ok(dialog, 'dialog open')
    assert.match(dialog.textContent, /\[source\.remove\.title\]/)
    assert.match(
      dialog.textContent,
      /\[source\.remove\.lead\{"name":"Instagram","link":"instagram\.com\/sample_kite_club"\}\]/
    )
    assert.ok(m.button(dialog, '[source.remove.cancel]'))
    assert.ok(m.button(dialog, '[source.remove.confirm]'))
    // No inline confirm on the row: it keeps its pill.
    assert.doesNotMatch(m.host.textContent, /source\.remove\.(ask|keep|confirm)/)
    assert.ok(m.rowOf(INSTAGRAM).querySelector('.tracy-wo-pill'))
    m.press(m.button(dialog, '[source.remove.cancel]'))
    assert.equal(m.dialog(), null)
    assert.equal(m.calls.length, 0)
  } finally {
    unmount(m)
  }
})

test('Escape closes the dialog with nothing changed', () => {
  const m = mount()
  try {
    m.ask(INSTAGRAM)
    assert.ok(m.dialog())
    lib.act(() =>
      m.dialog().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    )
    assert.equal(m.dialog(), null)
    assert.equal(m.calls.length, 0)
    assert.ok(m.rowOf(INSTAGRAM))
  } finally {
    unmount(m)
  }
})

test('Remove calls the door with the row link, spins in the dialog while the row is muted, then closes on success', async () => {
  const m = mount([ROWS[1]])
  try {
    m.ask(INSTAGRAM)
    m.press(m.button(m.dialog(), '[source.remove.confirm]'))
    assert.deepEqual(
      m.calls.map((c) => [c.id, c.url]),
      [[ID, INSTAGRAM]]
    )
    const dialog = m.dialog()
    assert.ok(dialog, 'the dialog stays open while the call runs')
    const confirm =
      m.button(dialog, '[source.remove.confirm]') ?? [...dialog.querySelectorAll('button')].at(-1)
    assert.equal(confirm.disabled, true)
    assert.match(confirm.innerHTML, /\[source\.remove\.removing\]/)
    assert.equal(m.button(dialog, '[source.remove.cancel]').disabled, true)
    const pending = m.rowOf(INSTAGRAM)
    assert.equal(pending.getAttribute('aria-busy'), 'true')
    assert.ok(pending.hasAttribute('data-pending'))
    assert.equal(pending.querySelector('.tracy-wo-stab-remove').disabled, true)
    assert.equal(pending.querySelector('.tracy-wo-pill'), null)
    await m.settle({ ok: true, status: 200, body: { opportunity: {}, approval: {} } })
    assert.equal(m.rowOf(INSTAGRAM), undefined)
    assert.equal(m.dialog(), null)
    assert.equal(m.host.querySelector('[role="alert"]'), null)
  } finally {
    unmount(m)
  }
})

test('each refusal stays in the dialog with Remove enabled again; the row stays as it was', async () => {
  for (const [answer, line] of [
    [refuse(409, 'LAST_SOURCE'), '[source.remove.error.LAST_SOURCE]'],
    [refuse(409, 'RESEARCH_STARTED'), '[source.remove.error.RESEARCH_STARTED]'],
    [refuse(422, 'GOOGLE_LINK_NOT_REMOVED'), '[source.remove.error.GOOGLE_LINK_NOT_REMOVED]'],
    [refuse(400, 'INVALID_URL'), '[action.failed]'],
    [refuse(405, 'HTTP_405'), '[action.failed]'],
    [refuse(404, 'HTTP_404'), '[action.failed]']
  ]) {
    const m = mount()
    try {
      m.ask(INSTAGRAM)
      m.press(m.button(m.dialog(), '[source.remove.confirm]'))
      await m.settle(answer)
      const dialog = m.dialog()
      assert.ok(dialog, line)
      assert.equal(dialog.querySelector('[role="alert"]')?.textContent, line)
      assert.equal(m.button(dialog, '[source.remove.confirm]').disabled, false, line)
      const row = m.rowOf(INSTAGRAM)
      assert.ok(row, line)
      assert.equal(row.getAttribute('aria-busy'), null)
      assert.equal(row.querySelector('[role="alert"]'), null)
      assert.ok(row.querySelector('.tracy-wo-pill'))
      // A second press tries again and clears the line while it runs.
      m.press(m.button(dialog, '[source.remove.confirm]'))
      assert.equal(m.calls.length, 2, line)
      assert.equal(m.dialog().querySelector('[role="alert"]'), null)
      await m.settle(answer)
    } finally {
      unmount(m)
    }
  }
})

test('already gone reloads Details, closes the dialog and says so at the foot of the table', async () => {
  const m = mount([ROWS[1]])
  try {
    m.ask(INSTAGRAM)
    m.press(m.button(m.dialog(), '[source.remove.confirm]'))
    await m.settle(refuse(404, 'NOT_FOUND'))
    assert.equal(m.rowOf(INSTAGRAM), undefined)
    assert.equal(m.dialog(), null)
    assert.equal(
      m.host.querySelector('.tracy-wo-stab-foot [role="alert"]')?.textContent,
      '[source.remove.error.NOT_FOUND]'
    )
  } finally {
    unmount(m)
  }
})
