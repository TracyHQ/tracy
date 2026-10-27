/**
 * The Demo Site row of a template page (`ReleaseDemo`) and the refresh rule of that page.
 *
 *   - While the server has a demo job in flight for the release, the action button is off and
 *     reads "Installing…" — from the press until the job settles, and also when the job was started
 *     earlier (another tab, before a reload, before the CMS chip was switched): the row's own latest
 *     job is followed again, never forgotten.
 *   - When the job settles the page is told (`onChanged`), so the problems panel, its counts, the
 *     tab dots and the header Publish are read again from the one list they all come from.
 *
 * Mounted with react-dom on a linkedom document; `fetch` is a fixture, nothing leaves the process.
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
const GLOBALS = ['window', 'document', 'fetch', 'HTMLElement', 'Element', 'Node', 'IS_REACT_ACT_ENVIRONMENT']
const saved = new Map()
let lib
let dom
let cleanups = []

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { ReleaseDemo } from './ReleaseDemo'`,
      resolveDir: path.join(pkgRoot, 'src', 'cms'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  set('window', dom.window)
  set('document', dom.document)
  set('HTMLElement', dom.window.HTMLElement)
  set('Element', dom.window.Element)
  set('Node', dom.window.Node)
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

async function mount(props) {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  await lib.act(async () => {
    root.render(lib.createElement(lib.ReleaseDemo, props))
    await tick(5)
  })
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  const settle = () =>
    lib.act(async () => {
      await tick(5)
    })
  const click = (el) =>
    lib.act(async () => {
      el.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }))
      await tick(5)
    })
  return { host, click, settle, button: () => host.querySelector('button') }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const TAG = 'tracy-base/j6'
const deployed = (over) => ({
  label: 'tracy-base-j6',
  host: 'fleet-01',
  address: 'https://tracy-base-j6.demo.test',
  version: '1.1.0',
  jobId: 'job-old',
  state: 'done',
  step: null,
  deployedAt: '2026-10-10T00:00:00Z',
  live: true,
  ...over
})
const listing = (d) => ({
  host: 'fleet-01',
  zone: 'demo.test',
  writable: true,
  reason: null,
  demos: [
    {
      tag: TAG,
      platform: 'joomla',
      label: 'tracy-base-j6',
      defaultLabel: 'tracy-base-j6',
      address: 'https://tracy-base-j6.demo.test',
      pinned: false,
      revision: 1,
      updatedBy: null,
      updatedAt: null,
      deployed: d
    }
  ]
})

/**
 * The server, in one object the test moves along: `row` is what `GET /api/ops/demos` answers,
 * `poll` is a promise the job door answers with (held open until the test resolves it).
 */
function stubServer(start) {
  const server = { row: start, calls: [], poll: null }
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    server.calls.push([init.method ?? 'GET', u])
    if (u.startsWith('/api/ops/demos/install')) {
      // The door records the new job on the demo's row before it answers.
      server.row = deployed({ jobId: 'job-new', state: 'running', step: 'teardown' })
      return json({ jobId: 'job-new' })
    }
    if (u.startsWith('/api/ops/demos/job')) return server.poll ? server.poll : json({ error: 'gone' }, 404)
    if (u.startsWith('/api/ops/demos')) return server.down ? json({}, server.down) : json(listing(server.row))
    return json({}, 404)
  }
  return server
}
function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

test('Update: the button is off and reads "Installing…" until the job settles, then the page is told', async () => {
  const server = stubServer(deployed({}))
  let changed = 0
  const ui = await mount({ tag: TAG, releaseVersion: '1.2.0', onChanged: () => (changed += 1) })
  assert.match(ui.button().textContent, /Update to 1\.2\.0/)
  assert.equal(ui.button().disabled, false)

  const held = deferred()
  server.poll = held.promise
  await ui.click(ui.button()) // arms
  await ui.click(ui.button()) // confirms: the install is sent
  assert.ok(server.calls.some(([m, u]) => m === 'POST' && u === '/api/ops/demos/install'))
  // The server says the update is running; the poll has not answered yet.
  await ui.settle()
  assert.equal(ui.button().disabled, true, 'off while the job runs')
  assert.match(ui.button().textContent, /Installing…/)
  assert.equal(changed, 0, 'nothing settled yet')

  // The job finishes: the demo runs the release's version.
  server.row = deployed({ jobId: 'job-new', version: '1.2.0' })
  held.resolve(json({ jobId: 'job-new', kind: 'provision', state: 'done', step: null, live: true }))
  await ui.settle()
  await ui.settle()
  assert.equal(changed, 1, 'the page reads its list again once the job settles')
  assert.match(ui.host.textContent, /Up to date/)
})

test('a job started earlier is followed again: the button stays off, and the page is told when it settles', async () => {
  // The page opens while the server's latest job for this demo is still running (started from
  // another tab, before a reload, or before the CMS chip was switched away and back).
  const server = stubServer(deployed({ jobId: 'job-earlier', state: 'running', step: 'installing' }))
  const held = deferred()
  server.poll = held.promise
  let changed = 0
  const ui = await mount({ tag: TAG, releaseVersion: '1.2.0', onChanged: () => (changed += 1) })
  assert.ok(
    server.calls.some(([, u]) => u === '/api/ops/demos/job?id=job-earlier'),
    'the running job is polled without any press'
  )
  assert.equal(ui.button().disabled, true)
  assert.match(ui.button().textContent, /Installing…/)

  server.row = deployed({ jobId: 'job-earlier', version: '1.2.0' })
  held.resolve(json({ jobId: 'job-earlier', kind: 'provision', state: 'done', step: null, live: true }))
  await ui.settle()
  await ui.settle()
  assert.equal(changed, 1)
  assert.match(ui.host.textContent, /Up to date/)
})

test('a settled row is not followed and does not tell the page anything', async () => {
  const server = stubServer(deployed({ version: '1.2.0' }))
  let changed = 0
  const ui = await mount({ tag: TAG, releaseVersion: '1.2.0', onChanged: () => (changed += 1) })
  await ui.settle()
  assert.equal(server.calls.filter(([, u]) => u.startsWith('/api/ops/demos/job')).length, 0)
  assert.equal(changed, 0)
  assert.match(ui.host.textContent, /Up to date/)
})

test('a failed install reads as one row: Failed, the tried and latest versions, Retry install at the right', async () => {
  const reason =
    'Warning: simplexml_load_file(): I/O warning : failed to load external entity "pkg_acymailing.xml"'
  stubServer(
    deployed({
      version: '1.0.0',
      live: false,
      state: 'failed',
      step: 'provision',
      reason,
      deployedAt: new Date(Date.now() - 2 * 3600_000).toISOString()
    })
  )
  const ui = await mount({ tag: TAG, releaseVersion: '1.0.2' })
  const row = ui.host.querySelector('[data-release-demo]')
  assert.equal(row.getAttribute('data-release-demo-state'), 'failed')
  const grid = row.firstElementChild
  // Labels, then cells: the same four columns as a live demo.
  const cells = [...grid.children].map((c) => c.textContent)
  assert.deepEqual(cells.slice(0, 3), ['Status', 'Tried version', 'Latest version'])
  assert.match(cells[4], /^FailedLast install failed$/)
  assert.equal(cells[5], '1.0.0')
  assert.equal(cells[6], '1.0.2')
  assert.match(cells[7], /Retry install/)
  const retry = [...ui.host.querySelectorAll('button')].find((b) => /Retry install/.test(b.textContent))
  assert.equal(retry.disabled, false)
  // The version sentence is gone: the two version columns already say it.
  assert.doesNotMatch(row.textContent, /The release is now/)

  const notes = ui.host.querySelector('[data-demo-failed]')
  assert.match(notes.textContent, /2 hours ago/)
  assert.ok(ui.host.querySelector('[aria-label^="Install history"]'), 'the history opens from the row')
  // The raw reason is folded away, closed, in a monospace block with a copy press.
  const details = ui.host.querySelector('details[data-demo-failed-details]')
  assert.ok(details)
  assert.equal(details.hasAttribute('open'), false, 'Error details starts closed')
  assert.match(details.querySelector('summary').textContent, /Error details/)
  assert.equal(details.querySelector('pre').textContent, reason)
  assert.ok(details.querySelector('button[aria-label="Copy error details"]'))
  // No guide knows this reason, so no fact line; no internal step names on screen.
  assert.equal(ui.host.querySelector('[data-demo-failed-guide]'), null)
  assert.doesNotMatch(row.textContent, /provision|door/)
})

test('a failure the guides know shows their short fact above Error details', async () => {
  stubServer(
    deployed({
      version: '1.7.11',
      live: false,
      state: 'failed',
      step: 'provision',
      reason: "could not configure this site's mail"
    })
  )
  const ui = await mount({ tag: TAG, releaseVersion: '1.8.0' })
  const fact = ui.host.querySelector('[data-demo-failed-guide]')
  assert.ok(fact)
  assert.ok(fact.textContent.length > 0)
})

test('not installed and installing share the same row layout as live', async () => {
  const server = stubServer(null)
  const ui = await mount({ tag: TAG, releaseVersion: '1.2.0' })
  const grid = ui.host.querySelector('[data-release-demo]').firstElementChild
  let cells = [...grid.children].map((c) => c.textContent)
  assert.deepEqual(cells.slice(0, 3), ['Status', 'Current version', 'Latest version'])
  assert.equal(cells[4], 'Not installed')
  assert.equal(cells[5], 'None')
  assert.equal(cells[6], '1.2.0')
  assert.match(cells[7], /Install demo/)

  server.row = deployed({ live: false, jobId: 'job-run', state: 'running', step: 'provision' })
  server.poll = deferred().promise
  const busy = await mount({ tag: TAG, releaseVersion: '1.2.0' })
  const row = busy.host.querySelector('[data-release-demo]')
  assert.equal(row.getAttribute('data-release-demo-state'), 'installing')
  cells = [...row.firstElementChild.children].map((c) => c.textContent)
  assert.match(cells[4], /Installing · setting up the site/)
  assert.match(cells[7], /Installing…/)
})

test('a failed read says so in plain words, offers Retry, and keeps the last known state', async () => {
  const server = stubServer(deployed({}))
  server.down = 502
  const ui = await mount({ tag: TAG, releaseVersion: '1.2.0' })
  assert.match(
    ui.host.textContent,
    /Couldn’t load the demo status \(server error 502\)\. Reload to try again\./
  )
  assert.doesNotMatch(ui.host.textContent, /door answered/)
  const retry = ui.host.querySelector('[data-demo-retry-load]')
  assert.ok(retry)
  server.down = 0
  await ui.click(retry)
  assert.match(ui.host.textContent, /Update to 1\.2\.0/)
  assert.doesNotMatch(ui.host.textContent, /Couldn’t load/)

  // A later read that fails leaves what was known on screen, with the message beside it.
  const held = deferred()
  server.poll = held.promise
  await ui.click(ui.button())
  await ui.click(ui.button())
  server.down = 502
  held.resolve(json({ jobId: 'job-new', kind: 'provision', state: 'done', step: null, live: true }))
  await ui.settle()
  await ui.settle()
  assert.match(ui.host.textContent, /Couldn’t load the demo status/)
  assert.ok(ui.host.querySelector('[data-release-demo]'), 'the last known row is still drawn')
})

test('while the road holds the demo for the contract, Install demo and Retry install are off with the reason; Update stays on', async () => {
  const WAIT = 'Make the content contract first (step 3).'
  stubServer(null)
  const idle = await mount({ tag: TAG, releaseVersion: '1.2.0', waitReason: WAIT })
  const install = idle.host.querySelector('[data-demo-waiting]')
  assert.equal(install.getAttribute('title'), WAIT)
  assert.match(install.textContent, /Install demo/)
  assert.equal(install.querySelector('button').disabled, true)

  stubServer(deployed({ version: '1.0.0', live: false, state: 'failed', step: 'provision', reason: 'x' }))
  const failed = await mount({ tag: TAG, releaseVersion: '1.0.2', waitReason: WAIT })
  const retry = failed.host.querySelector('[data-demo-waiting]')
  assert.match(retry.textContent, /Retry install/)
  assert.equal(retry.querySelector('button').disabled, true)

  stubServer(deployed({}))
  const live = await mount({ tag: TAG, releaseVersion: '1.2.0', waitReason: WAIT })
  assert.equal(live.host.querySelector('[data-demo-waiting]'), null)
  assert.match(live.button().textContent, /Update to 1\.2\.0/)
  assert.equal(live.button().disabled, false)
})
