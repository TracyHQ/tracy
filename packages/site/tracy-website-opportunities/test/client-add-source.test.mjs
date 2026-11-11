/**
 * Add source of Details (#537, the add source cases review): the checks made before sending, one line for every
 * refusal of the add door, the platform glyph while typing, the checking state on a passed-in clock, the notice left
 * when the popover closes while checking, and the popover mounted with React 18 in jsdom against a stubbed door.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-add-source.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ADD_SOURCE_CLOSED,
  addAllowedIn,
  ADD_SOURCE_SLOW_MS,
  addSourceCheck,
  addSourceCheckingKey,
  addSourceGlyphOf,
  addSourceLinkOf,
  addSourcePlatformOf,
  addSourceRefusal,
  addSourceStep
} from '../src/client/add-source-model.ts'
import { createApi } from '../src/client/api.ts'
import { en } from '../src/client/strings.ts'

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
const keyOf = (m) => m?.key ?? null
/** The en dash and the em dash, never in on-screen words. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

test('the checks before sending use the shared link reader and the words the server case would use', () => {
  assert.equal(keyOf(addSourceCheck('   ')), 'source.add.error.INVALID_URL')
  assert.equal(
    keyOf(addSourceCheck(`https://sample-kite.example/${'a'.repeat(2000)}`)),
    'source.add.error.TOO_LONG'
  )
  assert.equal(keyOf(addSourceCheck('hello')), 'source.add.error.NOT_A_LINK')
  assert.equal(keyOf(addSourceCheck('hello world')), 'source.add.error.NOT_A_LINK')
  assert.equal(keyOf(addSourceCheck('http://localhost/admin')), 'source.add.error.PRIVATE_ADDRESS')
  assert.equal(
    keyOf(addSourceCheck('https://maps.app.goo.gl/SampleKite')),
    'source.add.error.GOOGLE_LINK_NOT_ADDED'
  )
  assert.deepEqual(addSourceCheck('https://x.com/samplekite'), {
    key: 'source.add.error.UNSUPPORTED_LINK',
    platform: 'X'
  })
  assert.equal(addSourceCheck('mobile.twitter.com/samplekite').platform, 'X')
  assert.equal(addSourceCheck('wa.me/0000000').platform, 'WhatsApp')
  // A link without https:// goes through: the server adds it.
  assert.equal(addSourceCheck('instagram.com/sample_kite_club'), null)
  assert.equal(addSourceCheck('https://sample-kite.example'), null)
})

test('every refusal of the add door has its own line; only a 5xx or an unknown code reads the generic one', () => {
  const line = (code, status, extra = {}) => addSourceRefusal({ code, status, ...extra })
  assert.deepEqual(line('UNSUPPORTED_LINK', 422, { platform: 'LinkedIn' }), {
    key: 'source.add.error.UNSUPPORTED_LINK',
    platform: 'LinkedIn'
  })
  assert.equal(line('UNSUPPORTED_LINK', 422).key, 'source.add.error.UNSUPPORTED_LINK_PLAIN')
  assert.equal(line('SOURCE_ALREADY_KNOWN', 409).key, 'source.add.error.SOURCE_ALREADY_KNOWN')
  assert.deepEqual(line('PLATFORM_ALREADY_KNOWN', 409, { platform: 'instagram' }), {
    key: 'source.add.error.PLATFORM_ALREADY_KNOWN',
    platform: 'instagram'
  })
  assert.equal(
    line('PLATFORM_ALREADY_KNOWN', 409, { platform: 'website' }).key,
    'source.add.error.WEBSITE_ALREADY_KNOWN'
  )
  assert.deepEqual(line('TOO_MANY_SOURCES', 409, { max: 5 }), {
    key: 'source.add.error.TOO_MANY_SOURCES',
    params: { max: 5 }
  })
  assert.equal(line('JOB_ACTIVE', 409).key, 'source.add.error.JOB_ACTIVE')
  // Research started while the popover was open: the sources are fixed now.
  assert.equal(line('RESEARCH_STARTED', 409).key, 'source.add.error.RESEARCH_STARTED')
  assert.equal(line('INVALID_URL', 400).key, 'source.add.error.INVALID_URL')
  assert.equal(line('NOT_FOUND', 404).key, 'source.add.error.NOT_FOUND')
  assert.equal(line('FEATURE_OFF', 404).key, 'source.add.error.FEATURE_OFF')
  assert.equal(line('HTTP_403', 403).key, 'source.add.error.FEATURE_OFF')
  assert.equal(line('NOT_SIGNED_IN', 401).key, 'source.add.error.NOT_SIGNED_IN')
  assert.equal(line('HTTP_401', 401).key, 'source.add.error.NOT_SIGNED_IN')
  assert.equal(line('NETWORK', 0).key, 'source.add.error.NETWORK')
  assert.equal(line('HTTP_405', 405).key, 'source.add.error.NO_DOOR')
  assert.equal(line('HTTP_404', 404).key, 'source.add.error.NO_DOOR')
  assert.equal(line('GOOGLE_LINK_NOT_ADDED', 422).key, 'source.add.error.GOOGLE_LINK_NOT_ADDED')
  assert.equal(
    line('NO_USABLE_LINKS', 422, { links: [{ reason: 'blocked' }] }).key,
    'source.add.error.UNREACHABLE'
  )
  assert.equal(
    line('NO_USABLE_LINKS', 422, { links: [{ reason: 'not-public' }] }).key,
    'source.add.error.PRIVATE_ADDRESS'
  )
  assert.equal(
    line('NO_USABLE_LINKS', 422, { links: [{ reason: 'invalid' }] }).key,
    'source.add.error.NOT_A_LINK'
  )
  assert.equal(line('NO_USABLE_LINKS', 422).key, 'source.add.error.NO_USABLE_LINKS')
  assert.equal(line('HTTP_500', 500).key, 'source.add.error.other')
})

test('every key the model can name exists in English, with no dash in the words', () => {
  const keys = Object.keys(en).filter((k) => k.startsWith('source.add'))
  for (const key of [
    'source.add.checking',
    'source.add.slow',
    'source.add.pending',
    'source.add.added',
    'source.add.locked',
    'source.add.tryAgain',
    'source.add.dismiss'
  ])
    assert.ok(keys.includes(key), key)
  for (const code of [
    'UNSUPPORTED_LINK',
    'SOURCE_ALREADY_KNOWN',
    'PLATFORM_ALREADY_KNOWN',
    'TOO_MANY_SOURCES',
    'JOB_ACTIVE',
    'RESEARCH_STARTED',
    'INVALID_URL',
    'NOT_FOUND',
    'FEATURE_OFF',
    'NOT_SIGNED_IN',
    'NETWORK',
    'HTTP_405',
    'HTTP_500'
  ])
    assert.ok(keys.includes(addSourceRefusal({ code, status: 409, platform: 'X', max: 5 }).key), code)
  for (const key of keys) assert.doesNotMatch(en[key], DASHES, key)
})

test('the glyph shows as soon as the text reads as a link; an unknown website gets the globe', () => {
  assert.equal(addSourceGlyphOf('insta'), null)
  assert.equal(addSourceGlyphOf('instagram.com/sample_kite_club'), 'instagram')
  assert.equal(addSourceGlyphOf('https://www.tiktok.com/@samplekite'), 'tiktok')
  assert.equal(addSourceGlyphOf('youtube.com/@samplekite'), 'youtube')
  assert.equal(addSourceGlyphOf('fb.com/samplekite'), 'facebook')
  assert.equal(addSourceGlyphOf('tripadvisor.com/Attraction_Review-g0-d0'), 'tripadvisor')
  assert.equal(addSourceGlyphOf('wa.me/0000000'), 'whatsapp')
  assert.equal(addSourceGlyphOf('sample-kite.example'), 'website')
  assert.equal(addSourcePlatformOf('instagram.com/sample_kite_club'), 'instagram')
  assert.equal(addSourcePlatformOf('yelp.com/biz/sample-kite'), 'Yelp')
  assert.equal(addSourcePlatformOf('sample-kite.example'), 'website')
})

test('the field reads Checking the link, then Still checking after two seconds on the given clock', () => {
  let s = addSourceStep(ADD_SOURCE_CLOSED, { type: 'open' })
  s = addSourceStep(s, { type: 'type', url: INSTAGRAM })
  assert.equal(addSourceCheckingKey(s, 0), null)
  s = addSourceStep(s, { type: 'submit', at: 10_000 })
  assert.equal(addSourceCheckingKey(s, 10_000), 'source.add.checking')
  assert.equal(addSourceCheckingKey(s, 10_000 + ADD_SOURCE_SLOW_MS - 1), 'source.add.checking')
  assert.equal(addSourceCheckingKey(s, 10_000 + ADD_SOURCE_SLOW_MS), 'source.add.slow')
  // The field is locked while checking: typing changes nothing.
  assert.deepEqual(addSourceStep(s, { type: 'type', url: 'changed' }), s)
  // A link refused before sending never starts checking.
  const refused = addSourceStep(addSourceStep(ADD_SOURCE_CLOSED, { type: 'open' }), {
    type: 'type',
    url: 'x.com/a'
  })
  const after = addSourceStep(refused, { type: 'submit', at: 1 })
  assert.equal(after.checkingSince, null)
  assert.equal(after.error.key, 'source.add.error.UNSUPPORTED_LINK')
  assert.equal(addSourceLinkOf(refused), null)
})

test('closed while checking, the notice reads Still adding, then the answer; Try again reopens with the link', () => {
  let s = addSourceStep(ADD_SOURCE_CLOSED, { type: 'open' })
  s = addSourceStep(s, { type: 'type', url: ` ${INSTAGRAM} ` })
  s = addSourceStep(s, { type: 'submit', at: 0 })
  s = addSourceStep(s, { type: 'close' })
  assert.deepEqual(s.notice, { phase: 'pending', url: INSTAGRAM })
  // While it is pending the popover does not open again, and the notice cannot be dismissed.
  assert.deepEqual(addSourceStep(s, { type: 'toggle' }), s)
  assert.deepEqual(addSourceStep(s, { type: 'dismiss' }), s)
  const added = addSourceStep(s, { type: 'done', refusal: null })
  assert.deepEqual(added.notice, { phase: 'added', url: INSTAGRAM, platform: 'instagram' })
  assert.equal(addSourceStep(added, { type: 'dismiss' }).notice, null)
  const refusal = { key: 'source.add.error.PLATFORM_ALREADY_KNOWN', platform: 'instagram' }
  const failed = addSourceStep(s, { type: 'done', refusal })
  assert.deepEqual(failed.notice, { phase: 'failed', url: INSTAGRAM, error: refusal })
  assert.deepEqual(addSourceStep(failed, { type: 'retry' }), {
    open: true,
    url: INSTAGRAM,
    checkingSince: null,
    error: refusal,
    notice: null
  })
  // Opening Add source again clears an old notice; a late answer with nothing pending changes nothing.
  assert.equal(addSourceStep(added, { type: 'open' }).notice, null)
  assert.deepEqual(addSourceStep(ADD_SOURCE_CLOSED, { type: 'done', refusal }), ADD_SOURCE_CLOSED)
})

test('the add door passes the platform and the most listing pages of a refusal through', async () => {
  const api = createApi(async () => ({
    ok: false,
    status: 409,
    json: async () => ({
      code: 'PLATFORM_ALREADY_KNOWN',
      next: 'remove it',
      platform: 'instagram',
      links: []
    })
  }))
  const answer = await api.addSource(ID, INSTAGRAM)
  assert.equal(answer.ok, false)
  assert.equal(answer.platform, 'instagram')
  const many = await createApi(async () => ({
    ok: false,
    status: 409,
    json: async () => ({ code: 'TOO_MANY_SOURCES', next: 'remove one', max: 5 })
  })).addSource(ID, INSTAGRAM)
  assert.equal(many.max, 5)
})

// The popover, mounted.
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
    'Event'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-add-source-'))
  const outfile = path.join(outDir, 'add-source.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        export { act } from 'react'
        export { createRoot } from 'react-dom/client'
        import { AddSourcePopover } from './add-source-popover.tsx'
        const t = (key, params) => '[' + key + (params ? JSON.stringify(params) : '') + ']'
        export function Harness(props) {
          return createElement(AddSourcePopover, { t, ...props })
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

/** Mounts the popover with a stubbed door: each call waits until the test settles it. */
function mount(props = {}) {
  const calls = []
  const onAdd = (url) =>
    new Promise((resolve) => {
      calls.push({ url, resolve })
    })
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  lib.act(() => root.render(lib.createElement(lib.Harness, { locked: false, onAdd, ...props })))
  const press = (el) => lib.act(() => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  const open = () => press(host.querySelector('.tracy-wo-addsrc-btn'))
  const type = (value) =>
    lib.act(() => {
      const input = host.querySelector('input')
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      set.call(input, value)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
  const submit = () =>
    lib.act(async () => {
      host
        .querySelector('form')
        .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    })
  const settle = async (answer) => {
    await lib.act(async () => {
      calls.at(-1).resolve(answer)
      await new Promise((r) => setTimeout(r, 10))
    })
  }
  const escape = () =>
    lib.act(() =>
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    )
  return { host, root, calls, open, type, submit, settle, escape }
}

test('the field is text, shows the glyph while typing, and a refused link never reaches the door', async () => {
  const m = mount()
  try {
    m.open()
    const input = m.host.querySelector('input')
    assert.equal(input.getAttribute('type'), 'text')
    assert.equal(input.getAttribute('inputmode'), 'url')
    assert.equal(m.host.querySelector('.tracy-wo-addsrc-glyph'), null)
    m.type('instagram.com/sample_kite_club')
    assert.equal(
      m.host.querySelector('.tracy-wo-addsrc-glyph [data-logo]').getAttribute('data-logo'),
      'instagram'
    )
    m.type('https://x.com/samplekite')
    await m.submit()
    assert.equal(m.calls.length, 0)
    assert.match(
      m.host.querySelector('[role="alert"]').textContent,
      /source\.add\.error\.UNSUPPORTED_LINK.*"platform":"X"/
    )
  } finally {
    lib.act(() => m.root.unmount())
  }
})

test('while checking the field and Add are locked and read Checking the link; a refusal names the platform', async () => {
  const m = mount()
  try {
    m.open()
    m.type(INSTAGRAM)
    await m.submit()
    assert.deepEqual(
      m.calls.map((c) => c.url),
      [INSTAGRAM]
    )
    assert.equal(m.host.querySelector('input').disabled, true)
    assert.equal(m.host.querySelector('button[type="submit"]').disabled, true)
    assert.match(m.host.querySelector('.tracy-wo-addsrc-checking').textContent, /\[source\.add\.checking\]/)
    await m.settle({ ok: false, status: 409, code: 'PLATFORM_ALREADY_KNOWN', platform: 'instagram' })
    assert.equal(m.host.querySelector('input').disabled, false)
    assert.equal(m.host.querySelector('input').value, INSTAGRAM)
    assert.equal(m.host.querySelector('.tracy-wo-addsrc-checking'), null)
    assert.match(
      m.host.querySelector('[role="alert"]').textContent,
      /source\.add\.error\.PLATFORM_ALREADY_KNOWN.*"platform":"Instagram"/
    )
  } finally {
    lib.act(() => m.root.unmount())
  }
})

test('Escape while checking closes the popover and the notice reads the answer when it comes', async () => {
  const m = mount()
  try {
    m.open()
    m.type(INSTAGRAM)
    await m.submit()
    m.escape()
    assert.equal(m.host.querySelector('form'), null)
    const notice = () => m.host.querySelector('.tracy-wo-addsrc-notice')
    assert.equal(notice().getAttribute('data-phase'), 'pending')
    assert.match(notice().textContent, /\[source\.add\.pending\]/)
    assert.equal(
      notice().querySelector('.tracy-wo-addsrc-notice-link').textContent,
      'instagram.com/sample_kite_club'
    )
    assert.equal(m.host.querySelector('.tracy-wo-addsrc-btn').disabled, true)
    await m.settle({ ok: false, status: 0, code: 'NETWORK' })
    assert.equal(notice().getAttribute('data-phase'), 'failed')
    assert.match(notice().textContent, /\[source\.add\.error\.NETWORK\]/)
    // Try again opens the popover with the link and its refusal.
    const retry = [...notice().querySelectorAll('button')].find(
      (b) => b.textContent === '[source.add.tryAgain]'
    )
    lib.act(() => retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
    assert.equal(m.host.querySelector('input').value, INSTAGRAM)
    assert.match(m.host.querySelector('[role="alert"]').textContent, /source\.add\.error\.NETWORK/)
  } finally {
    lib.act(() => m.root.unmount())
  }
})

test('sources are fixed once research runs: Add source is off with the reason in running and done, on before and after a failure', () => {
  for (const [state, allowed] of [
    ['not_started', true],
    ['failed', true],
    ['running', false],
    ['done', false]
  ]) {
    assert.equal(addAllowedIn(state), allowed, state)
    const m = mount({ locked: !addAllowedIn(state) })
    try {
      assert.equal(m.host.querySelector('.tracy-wo-addsrc-btn').disabled, !allowed, state)
      assert.equal(
        m.host.querySelector('.tracy-wo-addsrc-btnwrap').getAttribute('title'),
        allowed ? null : '[source.add.locked]',
        state
      )
      if (allowed) {
        m.open()
        // One Add for every case: no source is ever added after research.
        assert.equal(m.host.querySelector('button[type="submit"]').textContent, '[source.add.submit]', state)
      }
    } finally {
      lib.act(() => m.root.unmount())
    }
  }
  // test-quality: contract the approved locked wording, and the retired keys must stay gone (#522)
  assert.equal(en['source.add.locked'], 'Sources are fixed once the research has run.')
  // test-quality: contract the approved locked wording, and the retired keys must stay gone (#522)
  assert.equal(en['source.add.submitAgain'], undefined)
  // test-quality: contract the approved locked wording, and the retired keys must stay gone (#522)
  assert.equal(en['source.add.afterResearch'], undefined)
})
