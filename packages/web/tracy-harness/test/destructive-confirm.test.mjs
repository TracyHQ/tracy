/**
 * The presses of the harness that take something down, mounted (#800).
 *
 *   - F-S8-005 — Demos: Redeploy, Update and Move tore a public demo down on one press; only
 *     Remove asked first. An install over a recorded row that is not live asks as well, and
 *     does not claim a teardown the server would not run.
 *   - F-S8-006 — Delete set sent its DELETE on one press, and Unpublish took a card customers
 *     choose from off Design inspiration on one press.
 *
 * These tests press the real `DemoAction`, `Demos` and `DesignInspirationPanel`:
 * the first press only asks and names what goes, the second sends one request for exactly that,
 * leaving the control or changing what it was asked about starts over, and a refusal, a dropped
 * request or an answer that does not confirm is printed while what is on screen stays.
 *
 * `class:malformed-error-response:*` — a failed answer whose `error`, `reason`, `detail`, `next` or
 * `problems` is not the text the screen expects (an object, a list, a number, `null`, a body that
 * is not JSON) used to throw or print an object where the failure had to be said. Each press is
 * given those answers and must still print one sentence, keep what is on screen, and not retry.
 *
 * The screens are bundled in memory (nothing is written to disk) and mounted with react-dom on a
 * linkedom document; `fetch` is a fixture. What is proven is the screens' own behaviour — no
 * tracy-web, no host, no GitHub and no database is involved, and no demo is torn down.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))
const { parseHTML } = rootRequire('linkedom')

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const deferred = () => {
  /** @type {(value: any) => void} */
  let resolve = () => {}
  /** @type {(reason: any) => void} */
  let reject = () => {}
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const json = (status, body) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
/** A fixture's answer as a Response: a `[status, body]` pair, a Response, or a thrown error. */
const said = async (answer) => {
  const got = await answer
  return got instanceof Response ? got : json(got[0], got[1])
}
/** The ways a 2xx can fail to say what the door promises. */
const UNCONFIRMED = [
  ['empty body', () => new Response('', { status: 200 })],
  ['broken JSON', () => new Response('{"ok":', { status: 200 })],
  ['null', () => [200, 'null']],
  ['wrong shape', () => [200, { done: true }]],
  ['ok:false', () => [200, { ok: false }]]
]

const GLOBALS = [
  'window',
  'document',
  'location',
  'fetch',
  'ResizeObserver',
  'MutationObserver',
  'HTMLElement',
  'Element',
  'Node',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'IS_REACT_ACT_ENVIRONMENT'
]
const saved = new Map()
/** @type {any} */
let lib
/** @type {any} */
let dom
/** @type {(() => Promise<void>)[]} */
let cleanups = []

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { DemoAction, Demos } from './Demos'
        export { Quickstarts } from './Quickstarts'
        export { DesignInspirationPanel } from './DesignInspiration'`,
      resolveDir: path.join(pkgRoot, 'src', 'cms'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    // React stays outside the bundle and is loaded by Node itself: bundled, its `act` cannot find
    // `module.require` and falls back to a MessageChannel that keeps the test process alive.
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  const { window } = dom
  set('window', window)
  set('document', dom.document)
  set('location', { origin: 'http://harness.test', href: 'http://harness.test/cms', pathname: '/cms' })
  set('MutationObserver', window.MutationObserver)
  set('HTMLElement', window.HTMLElement)
  set('Element', window.Element)
  set('Node', window.Node)
  set(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const styles = () => new Proxy({ getPropertyValue: () => '' }, { get: (t, k) => (k in t ? t[k] : '') })
  set('getComputedStyle', styles)
  set('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0))
  set('cancelAnimationFrame', (id) => clearTimeout(id))
  for (const [name, value] of Object.entries({
    getComputedStyle: styles,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    ResizeObserver: globalThis.ResizeObserver,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  }))
    if (typeof window[name] !== 'function') window[name] = value
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
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

/** Mount one component; `render(next)` draws it again with those props merged in. */
async function mountOf(component, props) {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  let current = props
  const render = (next = {}) =>
    lib.act(async () => {
      current = { ...current, ...next }
      root.render(lib.createElement(component, current))
    })
  const settle = () => lib.act(async () => tick(5))
  let mounted = true
  const unmount = async () => {
    if (!mounted) return
    mounted = false
    await lib.act(async () => root.unmount())
    host.remove()
  }
  cleanups.push(unmount)
  await render()
  await settle()
  await settle()
  const fire = (el, type) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }))
  return {
    host,
    render,
    settle,
    unmount,
    buttons: (scope = host) => [...scope.querySelectorAll('button')],
    /** Press `button()` `times` times in one tick, before React can redraw it. */
    press: async (button, times = 1) => {
      await lib.act(async () => {
        for (let i = 0; i < times; i += 1) {
          const el = typeof button === 'function' ? button() : button
          if (el) fire(el, 'click')
        }
        await tick(5)
      })
      await settle()
    },
    leave: (el) => lib.act(async () => void fire(el, 'focusout')),
    /** Everything the screen prints in its error colour. */
    errors: () =>
      [...host.querySelectorAll('.text-destructive')]
        .filter((el) => el.tagName !== 'BUTTON' && el.closest('button') === null)
        .map((el) => el.textContent.trim())
        .filter((text) => text !== '')
  }
}

// ── F-S8-005 — Demos ─────────────────────────────────────────────────────────────────────────────

const ZONE = 'demo.tracy.test'
const SERVERS = [
  { name: 'h1', serverName: 'fleet-01', serverIp: '10.0.0.1' },
  { name: 'h2', serverName: 'fleet-02', serverIp: '10.0.0.2' }
]
const HOST_TARGET = { name: 'tracy', kind: 'host', zone: ZONE, serverName: 'fleet-01', serverIp: '10.0.0.1' }
const RECORD_TARGET = {
  name: 'joomlart',
  kind: 'record',
  zone: 'demo.joomlart.test',
  serverName: 'j-ja-demo',
  serverIp: '10.9.9.9'
}
const demoRow = (tag, deployed = {}, row = {}) => {
  const label = row.label === undefined ? tag : row.label
  return {
    tag,
    platform: 'wordpress',
    label,
    defaultLabel: label,
    address: label ? `https://${label}.${ZONE}` : null,
    pinned: false,
    revision: 1,
    updatedBy: null,
    updatedAt: null,
    deployed:
      deployed === null
        ? null
        : {
            label,
            host: 'h1',
            address: `https://${label}.${ZONE}`,
            version: '1.0.0',
            jobId: 'job-0',
            state: 'done',
            step: null,
            deployedAt: '2026-10-01T00:00:00Z',
            live: true,
            ...deployed
          },
    ...row
  }
}

/** Mount one row's controls with spies for what a confirmed press would start. */
async function mountAction(props = {}) {
  const calls = { press: 0, remove: 0 }
  const ui = await mountOf(lib.DemoAction, {
    row: demoRow('live-wp'),
    job: undefined,
    writable: true,
    releaseVersion: '1.0.0',
    target: HOST_TARGET,
    servers: SERVERS,
    server: 'h1',
    onServerChange: () => {},
    onPress: () => void (calls.press += 1),
    onRemove: () => void (calls.remove += 1),
    ...props
  })
  const main = () => ui.buttons().find((b) => !/Remove/.test(b.textContent))
  const removeButton = () => ui.buttons().find((b) => /Remove/.test(b.textContent)) ?? null
  return { ...ui, calls, main, removeButton }
}

test('F-S8-005: Redeploy, Update, Move and an install over a recorded demo ask first and name the demo', async () => {
  const address = `live-wp.${ZONE}`
  const faces = [
    ['Redeploy', {}, [/Redeploy/, address], ['fleet-01', '1.0.0']],
    ['Update', { releaseVersion: '1.1.0' }, [/Update/, address, '1.1.0'], ['1.1.0']],
    ['Move', { server: 'h2' }, [/Move/, address, 'fleet-02'], ['fleet-01', 'fleet-02']],
    // A recorded row that is not live and stays on its machine: nothing is torn down by tracy-web
    // (`old = live ?? leaving`), the install goes over what is recorded there. Its last job failed,
    // so the press reads Retry install (11/10/2026).
    ['Retry install', { row: demoRow('live-wp', { live: false, state: 'failed' }) }, [address], ['fleet-01']]
  ]
  for (const [face, props, asks, titles] of faces) {
    const ui = await mountAction(props)
    assert.match(ui.main().textContent, new RegExp(face), `${face}: the face before any press`)
    await ui.press(ui.main)
    assert.equal(ui.calls.press, 0, `${face}: the first press must not start anything`)
    for (const part of asks)
      assert.ok(
        part instanceof RegExp ? part.test(ui.main().textContent) : ui.main().textContent.includes(part),
        `${face}: the question says ${String(part)} — ${ui.main().textContent}`
      )
    for (const part of titles)
      assert.ok(ui.main().getAttribute('title').includes(part), `${face}: the title says ${part}`)
    // A teardown is announced exactly where the server runs one: a live copy, or a move.
    assert.equal(
      /torn down/.test(ui.main().getAttribute('title')),
      face !== 'Retry install',
      `${face}: ${ui.main().getAttribute('title')}`
    )
    await ui.press(ui.main)
    assert.equal(ui.calls.press, 1, `${face}: the second press starts it, once`)
    assert.equal(ui.calls.remove, 0)
    await ui.unmount()
  }
})

test('F-S8-005: a first install where there is no demo is still one press', async () => {
  const ui = await mountAction({ row: demoRow('fresh-wp', null) })
  assert.match(ui.main().textContent, /Install demo/)
  await ui.press(ui.main)
  assert.equal(ui.calls.press, 1)
  assert.equal(ui.removeButton(), null, 'nothing to remove where there is no demo')
})

test('F-S8-005: leaving the control, or changing what it was asked about, starts over', async () => {
  const ui = await mountAction()
  await ui.press(ui.main)
  await ui.leave(ui.main())
  await ui.press(ui.main)
  assert.equal(ui.calls.press, 0, 'a press after leaving asks again')

  // Each of these is a different question from the one that was armed.
  for (const [what, next] of [
    ['another release', { releaseVersion: '1.1.0' }],
    ['another server', { server: 'h2' }],
    ['another target', { target: { ...HOST_TARGET, name: 'second' } }],
    ['another row', { row: demoRow('other-wp') }],
    ['another copy of the demo', { row: demoRow('other-wp', { jobId: 'job-9' }) }]
  ]) {
    await ui.render(next)
    await ui.press(ui.main)
    assert.equal(ui.calls.press, 0, `${what}: the earlier question is not an answer`)
  }
  await ui.press(ui.main)
  assert.equal(ui.calls.press, 1)

  // Arming Remove is not an answer to Redeploy, nor the other way round.
  await ui.press(ui.removeButton)
  await ui.press(ui.main)
  assert.deepEqual(ui.calls, { press: 1, remove: 0 })
  await ui.press(ui.removeButton)
  assert.deepEqual(ui.calls, { press: 1, remove: 0 }, 'Remove was disarmed by the other question')
  await ui.press(ui.removeButton)
  assert.deepEqual(ui.calls, { press: 1, remove: 1 })
})

test('F-S8-005: the guards stand — read-only, busy, no address, and a recorded target has no Remove', async () => {
  for (const [what, props] of [
    ['read-only', { writable: false }],
    ['a job running', { job: { jobId: 'j', kind: 'teardown', state: 'running', step: null, live: false } }],
    ['no address', { row: demoRow('live-wp', {}, { label: null }) }]
  ]) {
    const ui = await mountAction(props)
    assert.equal(ui.main().disabled, true, `${what}: the press is off`)
    await ui.press(ui.main, 2)
    assert.equal(ui.calls.press, 0, what)
    // Remove does not need an address to press again; the other two guards turn it off as well.
    if (what !== 'no address') {
      assert.equal(ui.removeButton().disabled, true, `${what}: Remove is off`)
      await ui.press(ui.removeButton, 2)
      assert.equal(ui.calls.remove, 0, what)
    }
    await ui.unmount()
  }
  const record = await mountAction({ target: RECORD_TARGET, onOverrideChange: () => {} })
  assert.equal(record.removeButton(), null, 'a demo on a machine Tracy does not run is not Tracy’s to remove')
  await record.press(record.main)
  assert.equal(record.calls.press, 0, 'replacing what is at a recorded address asks first too')
  assert.ok(record.main().getAttribute('title').includes('j-ja-demo'))
})

test('F-S8-005: a press whose request has not answered holds every further press', async () => {
  const gate = deferred()
  let started = 0
  const ui = await mountAction({
    onPress: () => {
      started += 1
      return gate.promise
    },
    onRemove: () => {
      started += 1
      return gate.promise
    }
  })
  await ui.press(ui.main)
  await ui.press(ui.main, 4)
  await ui.press(ui.removeButton, 3)
  assert.equal(started, 1, 'one request in flight')
  assert.equal(ui.main().disabled, true)
  await lib.act(async () => {
    gate.resolve(undefined)
    await tick(5)
  })
  await ui.settle()
  assert.equal(ui.main().disabled, false, 'the row comes back when the request settles')
  await ui.unmount()
  // Unmounted while a request is in flight: the late settle must not throw.
  const closing = deferred()
  const gone = await mountAction({ onPress: () => closing.promise })
  await gone.press(gone.main)
  await gone.press(gone.main)
  await gone.unmount()
  closing.reject(new Error('late'))
  await tick(10)
})

test('F-S8-005: an address with markup or quotes is asked about as text', async () => {
  const odd = `<img src=x onerror=alert(1)>"o'brien"-ü`
  const ui = await mountAction({ row: demoRow('odd', { address: `https://${odd}` }) })
  await ui.press(ui.main)
  assert.ok(ui.main().textContent.includes(odd))
  assert.equal(ui.host.querySelector('img'), null)
})

/** The Demos screen over a fake tracy-web. `install(body, n)` answers the n-th install. */
/**
 * `list(target, n)` answers the n-th listing read when it returns something (rows, or a promise of
 * them), and `present` is what a record server says it serves (null = it does not answer).
 */
async function mountDemos({ install, remove, rows, targets = [HOST_TARGET], list, present } = {}) {
  const sent = { installs: [], removes: [], jobs: [], lists: [], sshJobs: [] }
  const demos = rows ?? [demoRow('live-wp'), demoRow('fresh-wp', null)]
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://harness.test')
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/ops/demos/install') {
      const body = JSON.parse(init.body)
      sent.installs.push(body)
      return said(install ? install(body, sent.installs.length) : [202, { jobId: 'job-1' }])
    }
    if (url.pathname === '/api/ops/demos' && method === 'DELETE') {
      sent.removes.push(url.searchParams.get('tag'))
      return said(remove ? remove(sent.removes.length) : [202, { jobId: 'job-2' }])
    }
    if (url.pathname === '/api/ops/demos/job') {
      sent.jobs.push(url.searchParams.get('id'))
      return json(200, {
        jobId: url.searchParams.get('id'),
        kind: 'provision',
        state: 'done',
        step: null,
        live: true
      })
    }
    if (url.pathname === '/api/ops/demos/present')
      return typeof present === 'function'
        ? said(present())
        : present === null
          ? json(502, { error: 'SERVER_DID_NOT_ANSWER' })
          : json(200, { present: present ?? [] })
    if (url.pathname === '/api/ops/demos/install-job') {
      sent.sshJobs.push(url.searchParams.get('id'))
      return json(200, { id: url.searchParams.get('id'), state: 'done', step: 'installed', error: null })
    }
    if (url.pathname === '/api/ops/demos') {
      const target = url.searchParams.get('target')
      sent.lists.push(target)
      const listed = list ? await list(target, sent.lists.length) : undefined
      return json(200, {
        host: 'h1',
        target,
        targets,
        servers: SERVERS,
        defaultServer: 'h1',
        zone: ZONE,
        writable: true,
        reason: null,
        demos: listed ?? demos
      })
    }
    if (url.pathname === '/api/ops/quickstarts')
      return json(200, { releases: demos.map((d) => ({ tag: d.tag, version: '1.0.0' })) })
    return json(404, {})
  }
  const ui = await mountOf(lib.Demos, { cms: 'all' })
  for (let i = 0; i < 10 && ui.host.querySelector('tbody tr') === null; i += 1) await ui.settle()
  const rowOf = (tag) => [...ui.host.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(tag))
  const main = (tag) => () => {
    const cells = [...rowOf(tag).children]
    return ui.buttons(cells[cells.length - 1]).find((b) => !/Remove/.test(b.textContent))
  }
  const removeButton = (tag) => () => {
    const cells = [...rowOf(tag).children]
    return ui.buttons(cells[cells.length - 1]).find((b) => /Remove/.test(b.textContent))
  }
  return { ...ui, sent, main, removeButton }
}

test('F-S8-005: on the Demos screen a confirmed Redeploy sends one install and follows the job it was given', async () => {
  const ui = await mountDemos()
  await ui.press(ui.main('live-wp'))
  assert.equal(ui.sent.installs.length, 0, 'the first press sends nothing')
  await ui.press(ui.main('live-wp'))
  assert.equal(ui.sent.installs.length, 1)
  assert.equal(ui.sent.installs[0].tag, 'live-wp')
  assert.deepEqual(ui.sent.jobs, ['job-1'])
  assert.deepEqual(ui.errors(), [])
  // A fresh install is still one press.
  await ui.press(ui.main('fresh-wp'))
  assert.equal(ui.sent.installs.length, 2)
  assert.equal(ui.sent.installs[1].tag, 'fresh-wp')
})

test('F-S8-005: a refused, dropped or jobless install is printed and no job is followed', async () => {
  const cases = [
    ['401', () => [401, { error: 'NOT_SIGNED_IN' }], /NOT_SIGNED_IN/],
    ['403', () => [403, {}], /403/],
    ['404', () => [404, { error: 'UNKNOWN_QUICKSTART' }], /UNKNOWN_QUICKSTART/],
    [
      '409',
      () => [409, { reason: 'Another install is running at this address.' }],
      /Another install is running/
    ],
    ['502 with no JSON', () => [502, '<html>bad gateway</html>'], /502/],
    [
      'network',
      () => Promise.reject(new TypeError('fetch failed')),
      /did not complete.*fetch failed.*may or may not/
    ],
    ['no jobId', () => [202, { siteKey: 'x' }], /without a job to follow.*may or may not/],
    ['jobId not a string', () => [202, { jobId: 7 }], /without a job to follow/],
    ['empty jobId', () => [202, { jobId: '' }], /without a job to follow/],
    ['empty body', () => new Response('', { status: 202 }), /without a job to follow/],
    ['broken JSON', () => new Response('{"jobId":', { status: 202 }), /without a job to follow/],
    ['null', () => [202, 'null'], /without a job to follow/]
  ]
  for (const [name, install, says] of cases) {
    const ui = await mountDemos({ install })
    await ui.press(ui.main('live-wp'))
    await ui.press(ui.main('live-wp'))
    await ui.settle()
    assert.equal(ui.sent.installs.length, 1, `${name}: one request, no retry`)
    assert.deepEqual(ui.sent.jobs, [], `${name}: nothing is followed`)
    assert.ok(
      ui.errors().some((text) => says.test(text)),
      `${name}: printed — ${JSON.stringify(ui.errors())}`
    )
    assert.equal(ui.main('live-wp')().disabled, false, `${name}: the row is given back`)
    assert.match(ui.main('live-wp')().textContent, /Redeploy/, `${name}: the demo still reads as it was`)
    await ui.unmount()
  }
})

test('F-S8-005: Remove says so when its request drops or names no job', async () => {
  for (const [name, remove, says] of [
    ['network', () => Promise.reject(new TypeError('socket hang up')), /did not complete.*socket hang up/],
    ['no jobId', () => [202, {}], /without a job to follow/],
    ['409', () => [409, { reason: 'The demo is being installed.' }], /being installed/]
  ]) {
    const ui = await mountDemos({ remove })
    await ui.press(ui.removeButton('live-wp'))
    assert.equal(ui.sent.removes.length, 0)
    await ui.press(ui.removeButton('live-wp'))
    await ui.settle()
    assert.deepEqual(ui.sent.removes, ['live-wp'], name)
    assert.deepEqual(ui.sent.jobs, [], `${name}: nothing is followed`)
    assert.ok(
      ui.errors().some((text) => says.test(text)),
      `${name}: printed — ${JSON.stringify(ui.errors())}`
    )
    await ui.unmount()
  }
})

test('F-S8-005: pressing again while the install is being sent sends nothing more', async () => {
  const gate = deferred()
  const ui = await mountDemos({ install: () => gate.promise })
  await ui.press(ui.main('live-wp'))
  await ui.press(ui.main('live-wp'), 5)
  await ui.press(ui.removeButton('live-wp'), 2)
  assert.equal(ui.sent.installs.length, 1)
  assert.equal(ui.sent.removes.length, 0)
  await lib.act(async () => {
    gate.resolve([202, { jobId: 'job-7' }])
    await tick(5)
  })
  await ui.settle()
  assert.deepEqual(ui.sent.jobs, ['job-7'])
})

test('F-S8-005: an answer that lands after another server was opened is not followed on its rows', async () => {
  const second = {
    name: 'second',
    kind: 'host',
    zone: 'demo2.tracy.test',
    serverName: 'fleet-09',
    serverIp: null
  }
  for (const [name, answer, check] of [
    ['a started job', [202, { jobId: 'job-late' }], (ui) => assert.deepEqual(ui.errors(), [])],
    [
      'a refusal',
      [409, { reason: 'Busy.' }],
      (ui) =>
        assert.ok(
          ui
            .errors()
            .some((text) => text.includes('live-wp') && text.includes('fleet-01') && text.includes('Busy.')),
          `the refusal says whose press it was — ${JSON.stringify(ui.errors())}`
        )
    ]
  ]) {
    const gate = deferred()
    const ui = await mountDemos({ install: () => gate.promise, targets: [HOST_TARGET, second] })
    await ui.press(ui.main('live-wp'))
    await ui.press(ui.main('live-wp'))
    assert.equal(ui.sent.installs.length, 1)
    await ui.press(() => ui.buttons().find((b) => b.textContent.includes('demo2.tracy.test')))
    await ui.settle()
    assert.ok(ui.sent.lists.includes('second'), 'the other server is on screen')
    await lib.act(async () => {
      gate.resolve(answer)
      await tick(5)
    })
    await ui.settle()
    assert.deepEqual(ui.sent.jobs, [], `${name}: no job of the first server is followed on the second`)
    check(ui)
    await ui.unmount()
  }
})

// ── F-S8-006 — Delete set ────────────────────────────────────────────────────────────────────────

// ── F-S8-006 — Unpublish ─────────────────────────────────────────────────────────────────────────

const inspirationDetail = (tag, over = {}) => ({
  tag,
  writable: true,
  refusal: null,
  label: 'JA Nova',
  version: '1.2.0',
  languages: ['en'],
  platform: 'wordpress',
  template: 'ja_nova',
  demo: { url: 'https://nova.demo.tracy.test', version: '1.2.0' },
  platforms: [],
  card: {
    provider: 'JoomlArt',
    category: 'Business',
    blurb: 'A company site.',
    image: 'home.png',
    nav: 'top-left',
    hero: 'split',
    dark: false,
    layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'home.png' } }]
  },
  published: true,
  shots: [{ file: 'home.png', bytes: 1, sha256: 'x', updatedAt: '2026-10-01T00:00:00Z' }],
  categories: ['Business'],
  reason: null,
  ...over
})

async function mountInspiration({ answer, details = {}, tag = 'ja nova/wp&1', props = {} } = {}) {
  const sent = { deletes: [], reads: [] }
  let changed = 0
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://harness.test')
    if (url.pathname !== '/api/ops/quickstart/inspiration') return json(404, {})
    const asked = url.searchParams.get('tag')
    if (init.method === 'DELETE') {
      sent.deletes.push({ tag: asked, search: url.search })
      return said(answer ? answer(sent.deletes.length) : [200, { ok: true, deleted: true }])
    }
    sent.reads.push(asked)
    return json(200, inspirationDetail(asked, details[asked] ?? {}))
  }
  const ui = await mountOf(lib.DesignInspirationPanel, {
    tag,
    cell: null,
    writable: true,
    onChanged: () => void (changed += 1),
    ...props
  })
  for (let i = 0; i < 10 && ui.host.querySelector('textarea') === null; i += 1) await ui.settle()
  const unpublish = () => ui.buttons().find((b) => /Unpublish/.test(b.textContent)) ?? null
  const errors = () => [...ui.host.querySelectorAll('p.text-destructive')].map((el) => el.textContent.trim())
  return { ...ui, sent, changed: () => changed, unpublish, errors, tag }
}

test('F-S8-006: Unpublish asks first and names the card; the second press unpublishes exactly that release', async () => {
  const ui = await mountInspiration()
  await ui.press(ui.unpublish)
  assert.equal(ui.sent.deletes.length, 0, 'the first press must not unpublish')
  assert.ok(ui.unpublish().textContent.includes('JA Nova'), 'the question names the card')
  assert.ok(ui.unpublish().textContent.includes('1.2.0'), 'and its version')
  assert.ok(ui.unpublish().getAttribute('title').includes(ui.tag), 'the title names the release')
  const readsBefore = ui.sent.reads.length
  await ui.press(ui.unpublish)
  assert.equal(ui.sent.deletes.length, 1)
  assert.equal(ui.sent.deletes[0].tag, ui.tag)
  assert.equal(ui.sent.deletes[0].search, `?tag=${encodeURIComponent(ui.tag)}`)
  assert.equal(ui.changed(), 1)
  assert.ok(ui.sent.reads.length > readsBefore, 'the sheet is read again once the door confirmed')
  assert.deepEqual(ui.errors(), [])
})

test('F-S8-006: leaving Unpublish, or opening another release, starts over; the guards stand', async () => {
  const ui = await mountInspiration()
  await ui.press(ui.unpublish)
  await ui.leave(ui.unpublish())
  await ui.press(ui.unpublish)
  assert.equal(ui.sent.deletes.length, 0, 'a press after leaving asks again')
  await ui.render({ tag: 'ja-other-wp' })
  for (let i = 0; i < 10 && !ui.sent.reads.includes('ja-other-wp'); i += 1) await ui.settle()
  await ui.settle()
  await ui.press(ui.unpublish)
  assert.equal(ui.sent.deletes.length, 0, 'another release is another question')
  await ui.press(ui.unpublish)
  assert.deepEqual(
    ui.sent.deletes.map((d) => d.tag),
    ['ja-other-wp']
  )
  await ui.unmount()

  const readOnly = await mountInspiration({ props: { writable: false } })
  assert.equal(readOnly.unpublish().disabled, true)
  await readOnly.press(readOnly.unpublish, 2)
  assert.equal(readOnly.sent.deletes.length, 0)
  await readOnly.unmount()

  const unpublished = await mountInspiration({ tag: 'plain', details: { plain: { published: false } } })
  assert.equal(unpublished.unpublish(), null, 'nothing to unpublish where no card is published')

  const odd = await mountInspiration({ tag: 'odd', details: { odd: { label: '<img src=x> "Nova"' } } })
  await odd.press(odd.unpublish)
  assert.ok(odd.unpublish().textContent.includes('<img src=x> "Nova"'))
  assert.equal(odd.unpublish().querySelector('img'), null, 'the label is text, never markup')
})

test('F-S8-006: a refused, dropped or unconfirmed Unpublish is printed; the form stays and nothing reads as done', async () => {
  const cases = [
    ['401', () => [401, { error: 'NOT_SIGNED_IN' }], /401/],
    ['403', () => [403, {}], /403/],
    ['404', () => [404, { error: 'UNKNOWN_QUICKSTART' }], /404/],
    // The asset may already be gone when the hidden marker is refused: said as not known.
    [
      '502 from GitHub',
      () => [502, { error: 'GITHUB_REFUSED', reason: 'GitHub answered 503' }],
      /GitHub answered 503.*may or may not/
    ],
    ['500 with no JSON', () => [500, '<html>oops</html>'], /500.*may or may not/],
    [
      'network',
      () => Promise.reject(new TypeError('fetch failed')),
      /did not complete.*fetch failed.*may or may not/
    ],
    ...UNCONFIRMED.map(([name, answer]) => [name, answer, /without confirming.*may or may not/])
  ]
  for (const [name, answer, says] of cases) {
    const ui = await mountInspiration({ answer })
    const readsBefore = ui.sent.reads.length
    await ui.press(ui.unpublish)
    await ui.press(ui.unpublish)
    await ui.settle()
    assert.equal(ui.sent.deletes.length, 1, `${name}: one request, no retry`)
    assert.equal(ui.changed(), 0, `${name}: not treated as done`)
    assert.equal(ui.sent.reads.length, readsBefore, `${name}: the form is not replaced`)
    assert.ok(
      ui.errors().some((text) => says.test(text)),
      `${name}: printed — ${JSON.stringify(ui.errors())}`
    )
    assert.ok(ui.host.querySelector('textarea'), `${name}: the form is still there`)
    assert.equal(ui.unpublish().disabled, false, `${name}: the control is given back`)
    await ui.unmount()
  }
})

test('F-S8-006: pressing Unpublish again while it is being sent sends nothing more, and a late answer is quiet', async () => {
  const gate = deferred()
  const ui = await mountInspiration({
    answer: () => gate.promise,
    details: { 'ja-other-wp': { label: 'JA Other' } }
  })
  await ui.press(ui.unpublish)
  await ui.press(ui.unpublish, 4)
  await ui.press(ui.unpublish, 2)
  assert.equal(ui.sent.deletes.length, 1)
  // Another release is opened before the door answers.
  await ui.render({ tag: 'ja-other-wp' })
  for (let i = 0; i < 10 && !ui.host.textContent.includes('JA Other'); i += 1) await ui.settle()
  const readsBefore = ui.sent.reads.length
  await lib.act(async () => {
    gate.resolve([502, { error: 'GITHUB_REFUSED', reason: 'GitHub answered 503' }])
    await tick(5)
  })
  await ui.settle()
  assert.deepEqual(ui.errors(), [], 'the refusal of one release is not printed on another')
  assert.equal(ui.sent.reads.length, readsBefore, 'and the sheet on screen is not re-read as the old release')
  assert.ok(ui.host.textContent.includes('JA Other'))

  const closing = deferred()
  const gone = await mountInspiration({ answer: () => closing.promise })
  await gone.press(gone.unpublish)
  await gone.press(gone.unpublish)
  await gone.unmount()
  closing.reject(new TypeError('late'))
  await tick(10)
  assert.equal(gone.sent.deletes.length, 1)
})

// ── Review round: a record target's demo, late answers, and a failure that may have written ──────

test('F-S8-005: on a server Tracy only records, an install that would replace what is served asks first', async () => {
  // tracy-web answers `deployed: null` for every row of a record target: what is at the address is
  // the far server's to say.
  const row = demoRow('rec-wp', null)
  const base = { row, target: RECORD_TARGET, onOverrideChange: () => {}, onRemove: undefined }

  const served = await mountAction({ ...base, present: new Set(['rec-wp']), override: true })
  await served.press(served.main)
  assert.equal(served.calls.press, 0, 'served there, Override ticked: the first press only asks')
  assert.match(served.main().textContent, /Install over rec-wp\.demo\.tracy\.test\?/)
  assert.match(served.main().getAttribute('title'), /replacing the demo already there/)
  assert.ok(served.main().getAttribute('title').includes('j-ja-demo'))
  // Unticking Override is another question: nothing would be replaced, so nothing stays armed.
  await served.render({ override: false })
  assert.match(served.main().textContent, /Install demo/)
  await served.render({ override: true })
  assert.match(served.main().textContent, /Install demo/, 'ticking it again does not answer the question')
  await served.press(served.main)
  await served.press(served.main)
  assert.equal(served.calls.press, 1, 'the second press installs once')
  await served.unmount()

  for (const [name, present] of [
    ['not asked yet', undefined],
    ['the server did not answer', null]
  ]) {
    const unknown = await mountAction({ ...base, present, override: true })
    await unknown.press(unknown.main)
    assert.equal(unknown.calls.press, 0, `${name}: nobody said the address is free, so it asks`)
    assert.match(unknown.main().getAttribute('title'), /has not said what it serves/, name)
    // The answer arriving is a new question, not a yes to the old one.
    await unknown.render({ present: new Set(['rec-wp']) })
    assert.match(unknown.main().textContent, /Install demo/, name)
    await unknown.unmount()
  }

  // "Free" is what that server said when the table was drawn; the install lands later, and a demo
  // put there meanwhile would be replaced by it. So it asks all the same, and says which it is.
  const free = await mountAction({ ...base, present: new Set(['other-wp']), override: true })
  await free.press(free.main)
  assert.equal(free.calls.press, 0, 'the address read as free: the first press still only asks')
  assert.match(free.main().textContent, /Install over rec-wp\.demo\.tracy\.test\?/)
  assert.match(free.main().getAttribute('title'), /replacing any demo put there since/)
  // The demo appearing in a later reading is a new question, not a yes to the one asked.
  await free.render({ present: new Set(['other-wp', 'rec-wp']) })
  assert.match(free.main().textContent, /Install demo/)
  await free.press(free.main)
  assert.equal(free.calls.press, 0)
  assert.match(free.main().getAttribute('title'), /replacing the demo already there/)
  await free.press(free.main)
  assert.equal(free.calls.press, 1, 'the second press installs once')
  await free.unmount()

  // A row with no address yet is no reason to skip the question either.
  const unnamed = await mountAction({
    ...base,
    row: demoRow('rec-wp', null, { label: null }),
    present: new Set(),
    override: true
  })
  if (!unnamed.main().disabled) {
    await unnamed.press(unnamed.main)
    assert.equal(unnamed.calls.press, 0, 'no address: nothing is sent on one press')
  }
  await unnamed.unmount()

  const kept = await mountAction({ ...base, present: new Set(['rec-wp']), override: false })
  await kept.press(kept.main)
  assert.equal(kept.calls.press, 1, 'Override off never replaces — the far side refuses the name')
})

test('F-S8-005: on the Demos screen a served demo of a record server is replaced only on the second press', async () => {
  const ui = await mountDemos({
    targets: [RECORD_TARGET],
    rows: [demoRow('rec-wp', null), demoRow('free-wp', null)],
    present: ['rec-wp'],
    install: () => [202, { jobId: 'ssh-1' }]
  })
  for (let i = 0; i < 10 && !ui.host.textContent.includes('Served'); i += 1) await ui.settle()
  await ui.press(ui.main('rec-wp'))
  assert.equal(ui.sent.installs.length, 0, 'the first press sends nothing')
  assert.match(ui.main('rec-wp')().textContent, /Install over/)
  await ui.press(ui.main('rec-wp'))
  await ui.settle()
  assert.equal(ui.sent.installs.length, 1)
  assert.deepEqual(
    {
      tag: ui.sent.installs[0].tag,
      target: ui.sent.installs[0].target,
      override: ui.sent.installs[0].override
    },
    { tag: 'rec-wp', target: 'joomlart', override: true }
  )
  assert.deepEqual(ui.sent.sshJobs, ['ssh-1'], 'followed as the SSH job it is')
  assert.deepEqual(ui.sent.jobs, [])
})

test('F-S8-005: a record server’s presence answer that is not a list of names is not read as "serves nothing"', async () => {
  for (const [name, present] of [
    ['an empty object', () => [200, {}]],
    ['present: null', () => [200, { present: null }]],
    ['present as text', () => [200, { present: 'rec-wp' }]],
    ['present as an object', () => [200, { present: { 'rec-wp': true } }]],
    ['a name that is not text', () => [200, { present: ['other-wp', 7] }]],
    ['null', () => [200, 'null']],
    ['not JSON', () => new Response('<html>ok</html>', { status: 200 })],
    ['a dropped request', () => Promise.reject(new TypeError('fetch failed'))]
  ]) {
    const ui = await mountDemos({
      targets: [RECORD_TARGET],
      rows: [demoRow('rec-wp', null)],
      present,
      install: () => [202, { jobId: 'ssh-1' }]
    })
    for (let i = 0; i < 10 && !ui.host.textContent.includes('Server did not answer'); i += 1)
      await ui.settle()
    assert.ok(ui.host.textContent.includes('Server did not answer'), `${name}: shown as no answer`)
    assert.ok(!ui.host.textContent.includes('Not served'), `${name}: never shown as serving nothing`)
    await ui.press(ui.main('rec-wp'))
    assert.equal(ui.sent.installs.length, 0, `${name}: the first press sends nothing`)
    assert.match(ui.main('rec-wp')().getAttribute('title'), /has not said what it serves/, name)
    await ui.press(ui.main('rec-wp'))
    await ui.settle()
    assert.equal(ui.sent.installs.length, 1, `${name}: the second press installs once`)
    await ui.unmount()
  }
})

test('F-S8-005: on the Demos screen an address that read as free is still replaced only on the second press', async () => {
  // The reading is from when the table was drawn: a demo that appeared on that server since is
  // exactly what a one-press install with Override would take down.
  const ui = await mountDemos({
    targets: [RECORD_TARGET],
    rows: [demoRow('rec-wp', null)],
    present: ['other-wp'],
    install: () => [202, { jobId: 'ssh-1' }]
  })
  for (let i = 0; i < 10 && !ui.host.textContent.includes('Not served'); i += 1) await ui.settle()
  await ui.press(ui.main('rec-wp'))
  assert.equal(ui.sent.installs.length, 0, 'the first press sends nothing')
  assert.match(ui.main('rec-wp')().textContent, /Install over/)
  await ui.press(ui.main('rec-wp'))
  await ui.settle()
  assert.equal(ui.sent.installs.length, 1)
  assert.equal(ui.sent.installs[0].override, true)
})

test('F-S8-005: only a refusal its own door makes before it starts anything reads as certain; any other answer may have started', async () => {
  const bare = (status) => () => new Response(null, { status })
  // [name, answer, what is printed, certain for Install, certain for Remove]
  for (const [name, answer, says, install, remove] of [
    ['502 HOST_REFUSED', () => [502, { error: 'HOST_REFUSED' }], /HOST_REFUSED/, false, false],
    [
      '500 with a reason',
      () => [500, { reason: 'The host hung up.' }],
      /The host hung up\. It may/,
      false,
      false
    ],
    ['504 with no JSON', () => [504, '<html>timeout</html>'], /504/, false, false],
    // The host's own 4xx, handed back after the demo's row was claimed (`ops/demos.js`).
    [
      '409 from the host',
      () => [409, { reason: 'Another install is running.' }],
      /Another install/,
      false,
      false
    ],
    ['400 from the host', () => [400, { error: 'BAD_LABEL' }], /BAD_LABEL/, false, false],
    ['404 from the host', () => [404, { error: 'NO_SUCH_SITE' }], /NO_SUCH_SITE/, false, false],
    ['403 with a body', () => [403, { error: 'FORBIDDEN' }], /FORBIDDEN/, false, false],
    ['401', () => [401, { error: 'NOT_SIGNED_IN' }], /NOT_SIGNED_IN/, false, false],
    // A list is not a code, and is not printed as one: the status is.
    ['a code that is not text', () => [404, { error: ['UNKNOWN_TARGET'] }], /answered 404/, false, false],
    ['an inherited name as the code', () => [400, { error: 'toString' }], /toString/, false, false],
    // Each door's own refusals, at the status it sends them with.
    [
      '503 NO_DEMO_HOST',
      () => [503, { error: 'NO_DEMO_HOST', reason: 'The demo sits on h9, which this server cannot reach.' }],
      /cannot reach/,
      true,
      true
    ],
    ['the guard’s bodiless 403', bare(403), /403/, true, true],
    ['503 NO_SSH_FOR_TARGET', () => [503, { error: 'NO_SSH_FOR_TARGET' }], /NO_SSH_FOR_TARGET/, true, false],
    [
      '404 UNKNOWN_QUICKSTART',
      () => [404, { error: 'UNKNOWN_QUICKSTART' }],
      /UNKNOWN_QUICKSTART/,
      true,
      false
    ],
    ['409 LABEL_TAKEN', () => [409, { error: 'LABEL_TAKEN' }], /LABEL_TAKEN/, true, false],
    [
      '404 NO_DEMO',
      () => [404, { error: 'NO_DEMO', reason: 'No demo of this release.' }],
      /No demo of/,
      false,
      true
    ],
    // The right code at a status its door never sends it with is somebody else's answer.
    [
      '500 UNKNOWN_QUICKSTART',
      () => [500, { error: 'UNKNOWN_QUICKSTART' }],
      /UNKNOWN_QUICKSTART/,
      false,
      false
    ],
    ['a bodiless 404', bare(404), /404/, false, false]
  ]) {
    const ui = await mountDemos({ install: answer, remove: answer })
    await ui.press(ui.main('live-wp'))
    await ui.press(ui.main('live-wp'))
    await ui.settle()
    const [printed] = ui.errors().filter((text) => says.test(text))
    assert.ok(printed, `${name}: printed — ${JSON.stringify(ui.errors())}`)
    assert.equal(/may or may not have started/.test(printed), !install, `${name}: Install — ${printed}`)
    assert.equal(ui.sent.installs.length, 1, `${name}: no retry`)
    await ui.press(ui.removeButton('live-wp'))
    await ui.press(ui.removeButton('live-wp'))
    await ui.settle()
    const [removal] = ui.errors().filter((text) => says.test(text))
    assert.ok(removal, `${name}: Remove printed — ${JSON.stringify(ui.errors())}`)
    assert.equal(/may or may not have started/.test(removal), !remove, `${name}: Remove — ${removal}`)
    assert.deepEqual(ui.sent.removes, ['live-wp'], `${name}: no retry`)
    assert.deepEqual(ui.sent.jobs, [], `${name}: nothing is followed`)
    await ui.unmount()
  }
})

test('F-S8-005: a listing of the server that was left does not replace the rows of the one on screen', async () => {
  const second = {
    name: 'second',
    kind: 'host',
    zone: 'demo2.tracy.test',
    serverName: 'fleet-09',
    serverIp: null
  }
  const late = deferred()
  const ui = await mountDemos({
    targets: [HOST_TARGET, second],
    // The first read draws the screen; the re-read after the press is the one that comes back late.
    list: (target, n) => (target === 'second' ? [demoRow('other-wp')] : n === 1 ? undefined : late.promise)
  })
  await ui.press(ui.main('live-wp'))
  await ui.press(ui.main('live-wp'))
  assert.equal(ui.sent.installs.length, 1)
  await ui.press(() => ui.buttons().find((b) => b.textContent.includes('demo2.tracy.test')))
  for (let i = 0; i < 10 && !ui.host.textContent.includes('other-wp'); i += 1) await ui.settle()
  assert.ok(ui.host.textContent.includes('other-wp'), 'the second server’s rows are on screen')
  const jobsBefore = ui.sent.jobs.length
  await lib.act(async () => {
    late.resolve([demoRow('live-wp'), demoRow('fresh-wp', null)])
    await tick(5)
  })
  await ui.settle()
  const tags = [...ui.host.querySelectorAll('tbody tr')].map((tr) => tr.children[0].textContent.trim())
  assert.deepEqual(tags, ['other-wp'], 'the late listing of the first server is dropped')
  assert.equal(ui.sent.jobs.length, jobsBefore, 'and its job is no longer polled onto these rows')
})

test('F-S8-005: until the picked server’s own listing arrives, the rows of the last one cannot be pressed', async () => {
  const second = {
    name: 'second',
    kind: 'host',
    zone: 'demo2.tracy.test',
    serverName: 'fleet-09',
    serverIp: null
  }
  const slow = deferred()
  const ui = await mountDemos({
    targets: [HOST_TARGET, second],
    list: (target) => (target === 'second' ? slow.promise : undefined)
  })
  await ui.press(() => ui.buttons().find((b) => b.textContent.includes('demo2.tracy.test')))
  await ui.settle()
  assert.equal(ui.host.querySelectorAll('tbody tr').length, 0, 'no row of the first server is left to press')
  await lib.act(async () => {
    slow.resolve([demoRow('other-wp')])
    await tick(5)
  })
  await ui.settle()
  assert.ok(ui.host.textContent.includes('other-wp'))
})

test('F-S8-006: only the card door’s own refusal reads as certain; any other answer says the card may be unpublished', async () => {
  for (const [name, answer, says, sure] of [
    ['404 UNKNOWN_QUICKSTART', () => [404, { error: 'UNKNOWN_QUICKSTART' }], /404/, true],
    ['the guard’s bodiless 403', () => new Response(null, { status: 403 }), /403/, true],
    [
      '502 from GitHub',
      () => [502, { error: 'GITHUB_REFUSED', reason: 'GitHub answered 503' }],
      /GitHub/,
      false
    ],
    ['404 from something else', () => [404, { error: 'NOT_FOUND' }], /404/, false],
    [
      '400 NOT_A_CARD',
      () => [400, { error: 'NOT_A_CARD', reason: 'Publish’s refusal' }],
      /Publish’s refusal/,
      false
    ],
    ['403 with a body', () => [403, { error: 'FORBIDDEN' }], /403/, false],
    ['401', () => [401, { error: 'NOT_SIGNED_IN' }], /401/, false],
    ['the right code at a 500', () => [500, { error: 'UNKNOWN_QUICKSTART' }], /500/, false]
  ]) {
    const ui = await mountInspiration({ answer })
    await ui.press(ui.unpublish)
    await ui.press(ui.unpublish)
    await ui.settle()
    const [printed] = ui.errors().filter((text) => says.test(text))
    assert.ok(printed, `${name}: printed — ${JSON.stringify(ui.errors())}`)
    assert.equal(/may or may not have been unpublished/.test(printed), !sure, `${name}: ${printed}`)
    assert.equal(ui.sent.deletes.length, 1, `${name}: no retry`)
    assert.equal(ui.changed(), 0, name)
    await ui.unmount()
  }
})

test('F-S8-006: a read of the release that was left does not fill the sheet of the one on screen', async () => {
  const late = deferred()
  const sent = { reads: [] }
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://harness.test')
    if (url.pathname !== '/api/ops/quickstart/inspiration') return json(404, {})
    const asked = url.searchParams.get('tag')
    sent.reads.push(asked)
    if (asked === 'ja-slow-wp') await late.promise
    return json(200, inspirationDetail(asked, { label: asked === 'ja-slow-wp' ? 'JA Slow' : 'JA Quick' }))
  }
  const ui = await mountOf(lib.DesignInspirationPanel, {
    tag: 'ja-slow-wp',
    cell: null,
    writable: true,
    onChanged: () => {}
  })
  await ui.render({ tag: 'ja-quick-wp' })
  for (let i = 0; i < 10 && ui.host.querySelector('textarea') === null; i += 1) await ui.settle()
  const unpublish = () => ui.buttons().find((b) => /Unpublish/.test(b.textContent))
  await ui.press(unpublish)
  assert.match(unpublish().textContent, /JA Quick/)
  await lib.act(async () => {
    late.resolve()
    await tick(5)
  })
  await ui.settle()
  // Still the sheet of the release on screen: asked about again, it names that release.
  await ui.press(unpublish)
  await ui.leave(unpublish())
  await ui.press(unpublish)
  assert.match(
    unpublish().textContent,
    /JA Quick/,
    'the late read did not turn the sheet into the old release'
  )
  assert.ok(!ui.host.textContent.includes('JA Slow'))
})

test('F-S8-006: an Unpublish confirmed after another quickstart was opened re-reads the one on screen, not the old one', async () => {
  const gate = deferred()
  const sent = { details: [], deletes: [] }
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://harness.test')
    const asked = url.searchParams.get('tag')
    if (url.pathname === '/api/ops/quickstarts') return json(200, { writable: true, releases: [] })
    if (url.pathname === '/api/ops/quickstart') {
      sent.details.push(asked)
      return json(200, {
        tag: asked,
        name: asked,
        kind: 'quickstart',
        github: 'published',
        tracy: 'ready',
        platform: 'wordpress',
        publishedAt: null,
        setting: { label: `Label of ${asked}`, cms: '7', version: '1.0.0', install: {} },
        sets: [],
        languages: [],
        generations: [],
        inspirationState: null,
        sites: []
      })
    }
    if (url.pathname === '/api/ops/quickstart/inspiration') {
      if (init.method === 'DELETE') {
        sent.deletes.push(asked)
        return said(gate.promise)
      }
      return json(200, inspirationDetail(asked))
    }
    return json(404, {})
  }
  const ui = await mountOf(lib.Quickstarts, {
    cms: 'all',
    setCms: () => {},
    tag: 'qs-first',
    set: null,
    onOpen: () => {}
  })
  const heading = () => ui.host.querySelector('h1')?.textContent ?? ''
  for (let i = 0; i < 10 && !heading().includes('qs-first'); i += 1) await ui.settle()
  await ui.press(() => ui.buttons().find((b) => b.textContent.trim() === 'Design templates'))
  const unpublish = () => ui.buttons().find((b) => /Unpublish/.test(b.textContent)) ?? null
  for (let i = 0; i < 10 && unpublish() === null; i += 1) await ui.settle()
  await ui.press(unpublish)
  await ui.press(unpublish)
  assert.deepEqual(sent.deletes, ['qs-first'])
  await ui.render({ tag: 'qs-second' })
  for (let i = 0; i < 10 && !heading().includes('qs-second'); i += 1) await ui.settle()
  assert.match(heading(), /Label of qs-second/)
  const before = sent.details.length
  await lib.act(async () => {
    gate.resolve([200, { ok: true, deleted: true }])
    await tick(5)
  })
  await ui.settle()
  await ui.settle()
  assert.deepEqual(
    sent.details.slice(before).filter((tag) => tag !== 'qs-second'),
    [],
    'the old quickstart is not read into the page of the new one'
  )
  assert.match(heading(), /Label of qs-second/, 'the page still shows the quickstart that was opened')
})

// ── class:malformed-error-response ───────────────────────────────────────────────────────────────

/** What a door can put where a sentence or a code was expected. */
const NOT_TEXT = [
  ['an object', {}],
  ['a list', [{}]],
  ['an empty list', []],
  ['a number', 7],
  ['true', true],
  ['null', null],
  ['blank text', '  '],
  ['an object whose toString is not callable', { toString: 1 }]
]
/** A failed answer whose whole body is not a JSON object. */
const NOT_AN_OBJECT = [
  ['a null body', (status) => [status, 'null']],
  ['a list body', (status) => [status, '["IN_USE"]']],
  ['a number body', (status) => [status, '7']],
  ['a text body', (status) => [status, '"refused"']],
  ['a body that is not JSON', (status) => [status, '<html>refused</html>']],
  ['a body cut short', (status) => [status, '{"error":']]
]
/** An answer whose body cannot be read at all. */
const unreadable = (status) =>
  Object.assign(new Response(null, { status }), {
    text: () => Promise.reject(new TypeError('body stream aborted')),
    json: () => Promise.reject(new TypeError('body stream aborted'))
  })
/** A 403 that carries something: not the guard's bodiless one, so it proves nothing. */
const NOT_THE_GUARD = [
  ['a 403 saying null', () => [403, 'null']],
  ['a 403 that is not JSON', () => [403, '<html>forbidden</html>']],
  ['a 403 whose body cannot be read', () => unreadable(403)]
]
/** A request that drops with something that is not an Error and cannot be made into text. */
const ODD_DROPS = [
  ['a drop with an object', () => Promise.reject({ toString: 1 })],
  [
    'a drop with an Error whose message is not text',
    () => Promise.reject(Object.assign(new Error('x'), { message: {} }))
  ]
]
const noObject = (texts, name) =>
  assert.ok(
    texts.every((text) => !text.includes('[object') && !text.includes('undefined')),
    `${name}: nothing but text is printed — ${JSON.stringify(texts)}`
  )

test('class:malformed-error-response:decoder only text that was checked comes out', async () => {
  // Bundled on its own, so the screens' bundle stays exactly the screens.
  const built = await rootRequire('esbuild').build({
    entryPoints: [path.join(pkgRoot, 'src', 'cms', 'response-error.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  const { readAnswer, jsonObject, textField, textList, refusedBy, thrownText } = mod.exports
  for (const [name, value] of NOT_TEXT) {
    assert.equal(textField({ error: value }, 'error'), null, name)
    assert.equal(textField({ reason: value, error: 'CODE' }, 'reason', 'error'), 'CODE', name)
    assert.equal(textList({ problems: value }, 'problems'), null, name)
    assert.equal(textList({ problems: ['a', value] }, 'problems'), null, `${name} among text`)
    assert.equal(refusedBy({ IN_USE: [409] }, { body: { error: value }, empty: false }, 409), false, name)
    assert.equal(typeof thrownText(value), 'string', name)
  }
  for (const body of [null, undefined, 7, 'IN_USE', ['IN_USE'], true]) {
    assert.equal(jsonObject(body), null)
    assert.equal(textField(body, 'error'), null)
    assert.equal(textList(body, 'problems'), null)
    assert.equal(refusedBy({ IN_USE: [409] }, { body, empty: false }, 409), false)
  }
  assert.equal(textField({ error: 'IN_USE' }, 'reason', 'error'), 'IN_USE')
  assert.deepEqual(textList({ problems: ['a', 'b'] }, 'problems'), ['a', 'b'])
  // An inherited name is not a field of the answer.
  assert.equal(textField(Object.create({ error: 'IN_USE' }), 'error'), null)
  assert.equal(refusedBy({ IN_USE: [409] }, { body: { error: 'toString' }, empty: false }, 409), false)
  // A code is a refusal only in its own table and at its own status.
  assert.equal(refusedBy({ IN_USE: [409] }, { body: { error: 'IN_USE' }, empty: false }, 409), true)
  assert.equal(refusedBy({ IN_USE: [409] }, { body: { error: 'IN_USE' }, empty: false }, 500), false)
  assert.equal(refusedBy({}, { body: { error: 'IN_USE' }, empty: false }, 409), false)
  // Only a body that is truly empty is the guard's 403.
  assert.equal(refusedBy({}, { body: null, empty: true }, 403), true)
  assert.equal(refusedBy({}, { body: null, empty: true }, 404), false)
  assert.equal(refusedBy({}, { body: null, empty: false }, 403), false)
  assert.deepEqual(await readAnswer(new Response(null, { status: 403 })), { body: null, empty: true })
  assert.deepEqual(await readAnswer(new Response('', { status: 200 })), { body: null, empty: true })
  assert.deepEqual(await readAnswer(json(403, 'null')), { body: null, empty: false })
  assert.deepEqual(await readAnswer(json(403, '{"error":')), { body: null, empty: false })
  assert.deepEqual(await readAnswer(unreadable(403)), { body: null, empty: false })
  assert.deepEqual(await readAnswer(json(409, { error: 'IN_USE' })), {
    body: { error: 'IN_USE' },
    empty: false
  })
  assert.equal(thrownText(new TypeError('fetch failed')), 'fetch failed')
  assert.equal(thrownText('socket closed'), 'socket closed')
  assert.equal(thrownText({ toString: 1 }), 'no reason given')
})

/** The answers both demo doors are given; `told` is how the press names itself in its fallback. */
const demoCases = (told, ownCode) => {
  const unsure = /may or may not have started/
  const fallback = (status) => new RegExp(`${told} answered ${String(status)}`)
  return [
    ...NOT_TEXT.flatMap(([name, v]) => [
      [`reason is ${name}`, () => [400, { reason: v }], fallback(400), unsure],
      [`error is ${name}`, () => [400, { error: v }], fallback(400), unsure],
      [`reason and error are ${name}`, () => [502, { reason: v, error: v }], fallback(502), unsure],
      // The code is text and is this door's: it is printed, and it still decides.
      [
        `reason is ${name} beside the door’s own code`,
        () => [ownCode[0], { reason: v, error: ownCode[1] }],
        new RegExp(ownCode[1]),
        null
      ]
    ]),
    ...NOT_AN_OBJECT.map(([name, answer]) => [name, () => answer(400), fallback(400), unsure]),
    ...NOT_THE_GUARD.map(([name, answer]) => [name, answer, fallback(403), unsure]),
    ...ODD_DROPS.map(([name, answer]) => [name, answer, /did not complete \(no reason given\)/, unsure]),
    ['the guard’s bodiless 403', () => new Response(null, { status: 403 }), fallback(403), null]
  ]
}

test('class:malformed-error-response:demo-install a refusal that is not text is still printed, and no job is followed', async () => {
  for (const [name, install, says, doubt] of demoCases('the install', [409, 'LABEL_TAKEN'])) {
    const ui = await mountDemos({ install })
    await ui.press(ui.main('live-wp'))
    assert.equal(ui.sent.installs.length, 0, `${name}: the first press sends nothing`)
    await ui.press(ui.main('live-wp'))
    await ui.settle()
    assert.equal(ui.sent.installs.length, 1, `${name}: the request was sent once, no retry`)
    const [printed] = ui.errors().filter((text) => says.test(text))
    assert.ok(printed, `${name}: printed — ${JSON.stringify(ui.errors())}`)
    assert.equal(/may or may not have started/.test(printed), doubt !== null, `${name}: ${printed}`)
    noObject(ui.errors(), name)
    assert.deepEqual(ui.sent.jobs, [], `${name}: nothing is followed`)
    assert.equal(ui.main('live-wp')().disabled, false, `${name}: the row is given back`)
    assert.match(ui.main('live-wp')().textContent, /Redeploy/, `${name}: the demo still reads as it was`)
    await ui.unmount()
  }
})

test('class:malformed-error-response:demo-remove a refusal that is not text is still printed, and no job is followed', async () => {
  for (const [name, remove, says, doubt] of demoCases('the door', [404, 'NO_DEMO'])) {
    const ui = await mountDemos({ remove })
    await ui.press(ui.removeButton('live-wp'))
    assert.equal(ui.sent.removes.length, 0, `${name}: the first press sends nothing`)
    await ui.press(ui.removeButton('live-wp'))
    await ui.settle()
    assert.deepEqual(ui.sent.removes, ['live-wp'], `${name}: the request was sent once, no retry`)
    const [printed] = ui.errors().filter((text) => says.test(text))
    assert.ok(printed, `${name}: printed — ${JSON.stringify(ui.errors())}`)
    assert.equal(/may or may not have started/.test(printed), doubt !== null, `${name}: ${printed}`)
    noObject(ui.errors(), name)
    assert.deepEqual(ui.sent.jobs, [], `${name}: nothing is followed`)
    assert.equal(ui.removeButton('live-wp')().disabled, false, `${name}: the row is given back`)
    await ui.unmount()
  }
})

test('class:malformed-error-response:demo-presence a record server’s failed answer that is not text is said as its status, never as "serves nothing"', async () => {
  const cases = [
    ...NOT_TEXT.flatMap(([name, v]) => [
      [`detail is ${name}`, () => [502, { detail: v }], /did not answer: answered 502/],
      [`error is ${name}`, () => [502, { error: v }], /did not answer: answered 502/],
      [
        `detail is ${name} beside a code`,
        () => [502, { detail: v, error: 'SSH_REFUSED' }],
        /did not answer: SSH_REFUSED/
      ]
    ]),
    ...NOT_AN_OBJECT.map(([name, answer]) => [name, () => answer(502), /did not answer: answered 502/]),
    ['a body that cannot be read', () => unreadable(502), /did not answer: answered 502/],
    ['a list that cannot be read', () => unreadable(200), /answered 200 without the list of what it serves/],
    ...ODD_DROPS.map(([name, answer]) => [name, answer, /did not answer \(no reason given\)/]),
    [
      'a detail that is text',
      () => [502, { detail: 'The key was refused.' }],
      /did not answer: The key was refused\./
    ]
  ]
  for (const [name, present, says] of cases) {
    const ui = await mountDemos({
      targets: [RECORD_TARGET],
      rows: [demoRow('rec-wp', null)],
      present,
      install: () => [202, { jobId: 'ssh-1' }]
    })
    for (let i = 0; i < 10 && !ui.host.textContent.includes('Server did not answer'); i += 1)
      await ui.settle()
    assert.ok(ui.host.textContent.includes('Server did not answer'), `${name}: shown as no answer`)
    assert.ok(!ui.host.textContent.includes('Not served'), `${name}: never shown as serving nothing`)
    assert.ok(
      ui.errors().some((text) => says.test(text)),
      `${name}: the reason is printed — ${JSON.stringify(ui.errors())}`
    )
    noObject(ui.errors(), name)
    // Not knowing what is served never makes the install a one-press one.
    await ui.press(ui.main('rec-wp'))
    assert.equal(ui.sent.installs.length, 0, `${name}: the first press sends nothing`)
    await ui.press(ui.main('rec-wp'))
    await ui.settle()
    assert.equal(ui.sent.installs.length, 1, `${name}: the second press installs once`)
    await ui.unmount()
  }
})

test('class:malformed-error-response:unpublish a refusal that is not text is still printed; the form stays and nothing is retried', async () => {
  const unsure = /may or may not have been unpublished/
  const cases = [
    ...NOT_TEXT.flatMap(([name, v]) => [
      [`reason is ${name}`, () => [400, { reason: v }], /the door answered 400/, unsure],
      [`problems is ${name}`, () => [400, { problems: v }], /the door answered 400/, unsure],
      [
        `problems holds ${name}`,
        () => [400, { problems: ['One thing.', v] }],
        /the door answered 400/,
        unsure
      ],
      [
        `problems holds ${name} beside a reason`,
        () => [502, { problems: [v], reason: 'GitHub answered 503' }],
        /^GitHub answered 503 /,
        unsure
      ],
      [
        `reason is ${name} beside the door’s own code`,
        () => [404, { reason: v, error: 'UNKNOWN_QUICKSTART' }],
        /^the door answered 404$/,
        null
      ]
    ]),
    ...NOT_AN_OBJECT.map(([name, answer]) => [name, () => answer(400), /the door answered 400/, unsure]),
    ...NOT_THE_GUARD.map(([name, answer]) => [name, answer, /the door answered 403/, unsure]),
    ...ODD_DROPS.map(([name, answer]) => [name, answer, /did not complete \(no reason given\)/, unsure]),
    [
      'problems that are text',
      () => [400, { problems: ['One thing.', 'Another.'] }],
      /^One thing\. · Another\. /,
      unsure
    ]
  ]
  for (const [name, answer, says, doubt] of cases) {
    const ui = await mountInspiration({ answer })
    const readsBefore = ui.sent.reads.length
    await ui.press(ui.unpublish)
    assert.equal(ui.sent.deletes.length, 0, `${name}: the first press sends nothing`)
    await ui.press(ui.unpublish)
    await ui.settle()
    assert.equal(ui.sent.deletes.length, 1, `${name}: the request was sent once, no retry`)
    const [printed] = ui.errors().filter((text) => says.test(text))
    assert.ok(printed, `${name}: printed — ${JSON.stringify(ui.errors())}`)
    assert.equal(unsure.test(printed), doubt !== null, `${name}: ${printed}`)
    noObject(ui.errors(), name)
    assert.equal(ui.changed(), 0, `${name}: not treated as done`)
    assert.equal(ui.sent.reads.length, readsBefore, `${name}: the form is not replaced`)
    assert.ok(ui.host.querySelector('textarea'), `${name}: the form is still there`)
    assert.equal(ui.unpublish().disabled, false, `${name}: the control is given back`)
    await ui.unmount()
  }
})

// ── class:stale-confirmation-context ─────────────────────────────────────────────────────────────

test('class:stale-confirmation-context:demo-install a row read again under another address or label asks again, by the new name', async () => {
  const record = {
    target: RECORD_TARGET,
    onOverrideChange: () => {},
    onRemove: undefined,
    override: true,
    // Both names read as served, so the reading itself does not change between the two draws.
    present: new Set(['rec-wp', 'moved-wp'])
  }
  const elsewhere = `https://elsewhere.${ZONE}`
  const cases = [
    [
      'a record row, same tag, another address',
      record,
      demoRow('rec-wp', null),
      demoRow('rec-wp', null, { address: elsewhere }),
      `elsewhere.${ZONE}`
    ],
    [
      'a record row, same tag, another label and address',
      record,
      demoRow('rec-wp', null),
      demoRow('rec-wp', null, { label: 'moved-wp', address: `https://moved-wp.${ZONE}` }),
      `moved-wp.${ZONE}`
    ],
    [
      'a record row, same tag and address, another label',
      record,
      demoRow('rec-wp', null),
      demoRow('rec-wp', null, { label: 'moved-wp', address: `https://rec-wp.${ZONE}` }),
      `rec-wp.${ZONE}`
    ],
    [
      'a host row whose recorded copy reads at another address',
      {},
      demoRow('live-wp'),
      demoRow('live-wp', { address: elsewhere }),
      `elsewhere.${ZONE}`
    ],
    [
      'a host row with no recorded address, read again under another one',
      {},
      demoRow('live-wp', { address: null }),
      demoRow('live-wp', { address: null }, { address: elsewhere }),
      `elsewhere.${ZONE}`
    ]
  ]
  for (const [name, props, first, next, named] of cases) {
    const ui = await mountAction({ ...props, row: first })
    await ui.press(ui.main)
    assert.equal(ui.calls.press, 0, `${name}: the first press only asks`)
    assert.match(ui.main().textContent, /\?$/, `${name}: it is asking`)
    await ui.render({ row: next })
    assert.doesNotMatch(ui.main().textContent, /\?$/, `${name}: the question is withdrawn`)
    await ui.press(ui.main)
    assert.equal(ui.calls.press, 0, `${name}: a press on the new name is a first press`)
    assert.ok(ui.main().textContent.includes(named), `${name}: it asks about ${named}`)
    assert.ok(ui.main().getAttribute('title').includes(named), `${name}: the title names ${named}`)
    await ui.press(ui.main)
    assert.equal(ui.calls.press, 1, `${name}: the second press on the new name starts it, once`)
    await ui.unmount()
  }
})

test('class:stale-confirmation-context:demo-remove a row read again under another address asks again before Remove', async () => {
  const ui = await mountAction({ row: demoRow('live-wp') })
  await ui.press(ui.removeButton)
  assert.equal(ui.calls.remove, 0)
  await ui.render({ row: demoRow('live-wp', { address: `https://elsewhere.${ZONE}` }) })
  await ui.press(ui.removeButton)
  assert.equal(ui.calls.remove, 0, 'the earlier question is not an answer about the new address')
  await ui.press(ui.removeButton)
  assert.deepEqual(ui.calls, { press: 0, remove: 1 })
})

// ── class:malformed-error-response — what a dropped read throws ──────────────────────────────────

test('class:malformed-error-response:dropped-read a listing that drops with something that is not text is still said', async () => {
  for (const [name, drop] of ODD_DROPS) {
    const demos = await mountDemos({ list: () => drop() })
    for (let i = 0; i < 5; i += 1) await demos.settle()
    assert.ok(
      demos.errors().some((text) => text.includes('no reason given')),
      `Demos, ${name}: said — ${JSON.stringify(demos.errors())}`
    )
    noObject(demos.errors(), name)
    await demos.unmount()

    globalThis.fetch = () => drop()
    const panel = await mountOf(lib.DesignInspirationPanel, {
      tag: 'ja-nova-wp',
      cell: null,
      writable: true,
      onChanged: () => {}
    })
    for (let i = 0; i < 5; i += 1) await panel.settle()
    assert.ok(
      panel.errors().some((text) => text.includes('no reason given')),
      `Design templates, ${name}: said — ${JSON.stringify(panel.errors())}`
    )
    noObject(panel.errors(), name)
    await panel.unmount()

    globalThis.fetch = () => drop()
    const list = await mountOf(lib.Quickstarts, {
      cms: 'all',
      setCms: () => {},
      tag: 'qs-first',
      set: null,
      onOpen: () => {}
    })
    for (let i = 0; i < 5; i += 1) await list.settle()
    assert.ok(
      list.errors().some((text) => text.includes('no reason given')),
      `Quickstarts, ${name}: said — ${JSON.stringify(list.errors())}`
    )
    noObject(list.errors(), name)
    await list.unmount()
  }
})
