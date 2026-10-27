/**
 * Removing a content version in the preview dialog, mounted (#800). The X on a version tile used
 * to be `hidden … group-hover:grid` — out of reach of a keyboard and of a touch screen — sent its
 * DELETE on the first press, and said nothing when the host refused. These tests press the real
 * `PreviewDialog`: the X is a native button that is always drawn and names the version, the first
 * press only asks (naming the version), the second sends one DELETE for that version, and a
 * refusal, a dropped request or an answer that does not confirm the removal is shown beside the
 * tiles while the version stays where it was.
 *
 * The dialog is bundled in memory (nothing is written to disk) and mounted with react-dom on a
 * linkedom document; `fetch` is a fixture. What is proven is the dialog's own behaviour — no lane,
 * no copy file and no real pointer, keyboard or touch input is involved.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
// react-dom is `@tracy/core`'s dependency, not this plugin's; pnpm resolves both packages' react
// to one copy, so the dialog and the renderer share one React.
const coreRequire = createRequire(path.join(corePkg, 'package.json'))
const { parseHTML } = createRequire(path.join(repoRoot, 'package.json'))('linkedom')

const ORIGIN = 'http://lane.test'
const ALPHA = {
  id: 'sys-alpha',
  name: 'Alpha',
  category: 'saas',
  nav: 'top-left',
  hero: 'split',
  dark: false
}
const BETA = { id: 'sys-beta', name: 'Beta', category: 'saas', nav: 'top-left', hero: 'split', dark: false }
const version = (id, title) => ({
  id,
  title,
  kind: 'llm',
  prompt: null,
  slots: {},
  at: '2026-10-01T00:00:00Z',
  model: null
})
const WARM = version('v-warm', 'Warm welcome')
const BOLD = version('v-bold', 'Bold claim')

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

const GLOBALS = [
  'window',
  'document',
  'location',
  'fetch',
  'DOMParser',
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
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { PreviewDialog } from './PreviewDialog'
        export { en } from './strings'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    // React stays outside the bundle and is loaded by Node itself: bundled, its `act` cannot find
    // `module.require` and falls back to a MessageChannel that keeps the test process alive.
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  const { window } = dom
  set('window', window)
  set('document', dom.document)
  set('location', { origin: ORIGIN, href: `${ORIGIN}/demo.tracy.test/`, pathname: '/demo.tracy.test/' })
  set('DOMParser', window.DOMParser)
  set('MutationObserver', window.MutationObserver)
  set('HTMLElement', window.HTMLElement)
  set('Element', window.Element)
  set('Node', window.Node)
  // The dialog measures its stage and base-ui reads computed styles; neither exists without layout.
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

const json = (status, body) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })

/**
 * Mount the dialog over a fake lane.
 *
 * `copies` is what the copy door holds per inspiration: the versions of the Landing chip (the
 * first chip of a design system) and of the Form chip. `answer(request, n)` is what the door says
 * to the n-th DELETE: a `[status, body]` pair, a Response, or a thrown error. A DELETE the door
 * confirms removes the version from `copies`, as the host does, so a later read shows it gone.
 */
async function mount({ copies, answer, read, list = [ALPHA, BETA], index = 0, props = {} } = {}) {
  const held = copies ?? { [ALPHA.id]: { landing: [WARM, BOLD] }, [BETA.id]: { landing: [WARM] } }
  /** @type {{ url: string, id: string, chip: string, vid: string }[]} */
  const deletes = []
  let reads = 0
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    const removal = /\/copy\/([^/]+)\/pages\/([^/]+)\/versions\/([^/]+)$/.exec(url.pathname)
    if (method === 'DELETE' && removal) {
      const [id, chip, vid] = removal.slice(1).map(decodeURIComponent)
      deletes.push({ url: url.pathname, id, chip, vid })
      const said = answer ? await answer({ id, chip, vid }, deletes.length) : [200, { ok: true }]
      if (said instanceof Response) return said
      const [status, body] = said
      if (status === 200 && body?.ok === true && held[id]?.[chip])
        held[id][chip] = held[id][chip].filter((v) => v.id !== vid)
      return json(status, body)
    }
    if (method === 'PUT') return json(200, { ok: true })
    const copy = /\/copy\/([^/]+)$/.exec(url.pathname)
    if (copy) {
      reads += 1
      const id = decodeURIComponent(copy[1])
      // `read(id, n)` answers the n-th read of the copy itself when it returns a Response.
      const instead = read ? read(id, reads) : null
      if (instead) return instead
      const pages = Object.fromEntries(
        Object.entries(held[id] ?? {}).map(([chip, versions]) => [
          chip,
          { versions: [...versions], selected: null, nextPrompt: null }
        ])
      )
      return json(200, {
        schemaVersion: '2',
        system: id,
        writtenAt: '2026-10-01T00:00:00Z',
        lang: 'en',
        brief: null,
        pages,
        defaultPrompts: {}
      })
    }
    if (/\/system\/artifacts\/[a-z]+\.html$/.test(url.pathname))
      return new Response('<!doctype html><html><head></head><body><h1>Sample</h1></body></html>', {
        status: 200
      })
    if (/\/artifact-slots\/[a-z]+$/.test(url.pathname)) return json(200, { slots: [] })
    return json(404, { code: 'NOT_FOUND' })
  }
  const t = (key, params = {}) =>
    key in lib.en ? lib.en[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? '')) : key
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  let at = index
  const render = (next = {}) =>
    lib.act(async () => {
      if (typeof next.index === 'number') at = next.index
      root.render(
        lib.createElement(lib.PreviewDialog, {
          list,
          index: at,
          site: null,
          onClose: () => {},
          onStep: () => {},
          t,
          ...props,
          ...next
        })
      )
    })
  const settle = () => lib.act(async () => tick(5))
  let mounted = true
  const unmount = async () => {
    if (!mounted) return
    mounted = false
    await lib.act(async () => root.unmount())
    host.remove()
    dom.document.body.innerHTML = ''
  }
  cleanups.push(unmount)
  await render()
  for (let i = 0; i < 20 && tiles().length === 0; i += 1) await settle()
  await settle()

  const body = () => dom.document.body
  function tiles() {
    return [...dom.document.body.querySelectorAll('[data-version]')]
  }
  const tile = (vid) => tiles().find((el) => el.getAttribute('data-version') === vid) ?? null
  /** The remove control of a tile: its second native button (the first is the tile itself). */
  const removeButton = (vid) => {
    const el = tile(vid)
    return el ? ([...el.children].filter((c) => c.tagName === 'BUTTON')[1] ?? null) : null
  }
  const fire = (el, type) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }))
  return {
    body,
    deletes,
    held,
    reads: () => reads,
    render,
    settle,
    unmount,
    tile,
    tileIds: () => tiles().map((el) => el.getAttribute('data-version')),
    removeButton,
    /** Press a tile's remove control `times` times in one tick, before React can redraw it. */
    pressRemove: async (vid, times = 1) => {
      await lib.act(async () => {
        for (let i = 0; i < times; i += 1) {
          const button = removeButton(vid)
          if (button) fire(button, 'click')
        }
        await tick(5)
      })
      await settle()
    },
    blurRemove: (vid) => lib.act(async () => void fire(removeButton(vid), 'focusout')),
    pressChip: (key) =>
      lib.act(async () => {
        fire(dom.document.body.querySelector(`[data-chip="${key}"]`), 'click')
        await tick(5)
      }),
    failures: () =>
      [...dom.document.body.querySelectorAll('[data-remove-failed]')].map((el) => el.textContent)
  }
}

test('F-S5-007: the remove control is a native button that is always drawn and names the version', async () => {
  const ui = await mount()
  for (const v of [WARM, BOLD]) {
    const button = ui.removeButton(v.id)
    assert.ok(button, `no remove control on ${v.id}`)
    assert.equal(button.tagName, 'BUTTON')
    assert.equal(button.getAttribute('type'), 'button')
    assert.ok(button.getAttribute('aria-label').includes(v.title), 'the accessible name names the version')
    const classes = (button.getAttribute('class') ?? '').split(/\s+/)
    assert.ok(!classes.includes('hidden'), 'the control is not display:none until hovered')
    assert.ok(!classes.some((c) => c.startsWith('group-hover:')), 'the control does not depend on hover')
    assert.ok(!button.hasAttribute('hidden'))
    assert.notEqual(button.getAttribute('tabindex'), '-1')
    assert.notEqual(button.getAttribute('aria-hidden'), 'true')
  }
  // The two tiles every chip has are not the customer's to remove.
  assert.equal(ui.removeButton('default'), null)
})

test('F-S5-007: the first press only asks, naming the version; the second sends one DELETE for it', async () => {
  const ui = await mount()
  await ui.pressRemove(WARM.id)
  assert.equal(ui.deletes.length, 0, 'the first press must not send the DELETE')
  const armed = ui.removeButton(WARM.id)
  assert.ok(armed.textContent.includes(WARM.title), `the question names the version: ${armed.textContent}`)
  assert.ok(armed.getAttribute('aria-label').includes(WARM.title))
  // Only the tile that was pressed asks.
  assert.ok(!ui.removeButton(BOLD.id).textContent.includes(BOLD.title))

  await ui.pressRemove(WARM.id)
  assert.equal(ui.deletes.length, 1)
  assert.deepEqual(
    { id: ui.deletes[0].id, chip: ui.deletes[0].chip, vid: ui.deletes[0].vid },
    { id: ALPHA.id, chip: 'landing', vid: WARM.id }
  )
  assert.deepEqual(ui.tileIds(), ['default', BOLD.id])
  assert.deepEqual(ui.failures(), [])
})

test('F-S5-007: leaving the control, another tile, another chip or another inspiration starts over', async () => {
  const ui = await mount({
    copies: { [ALPHA.id]: { landing: [WARM, BOLD], form: [WARM] }, [BETA.id]: { landing: [WARM] } }
  })
  // Blur.
  await ui.pressRemove(WARM.id)
  await ui.blurRemove(WARM.id)
  await ui.pressRemove(WARM.id)
  assert.equal(ui.deletes.length, 0, 'a press after leaving the control asks again')
  await ui.blurRemove(WARM.id)

  // Another tile: the question moves, it is not answered for the first one.
  await ui.pressRemove(WARM.id)
  await ui.pressRemove(BOLD.id)
  assert.equal(ui.deletes.length, 0, 'pressing another tile must not confirm the first')
  assert.ok(!ui.removeButton(WARM.id).textContent.includes(WARM.title))
  await ui.blurRemove(BOLD.id)

  // Another chip that holds a version of the same id.
  await ui.pressRemove(WARM.id)
  await ui.pressChip('form')
  await ui.settle()
  await ui.pressRemove(WARM.id)
  assert.equal(ui.deletes.length, 0, 'a question asked on Landing is not an answer on Form')
  await ui.blurRemove(WARM.id)
  await ui.pressChip('landing')
  await ui.settle()

  // Another inspiration that holds a version of the same id on the same chip.
  await ui.pressRemove(WARM.id)
  await ui.render({ index: 1 })
  for (let i = 0; i < 20 && (ui.tileIds().includes(BOLD.id) || ui.tile(WARM.id) === null); i += 1)
    await ui.settle()
  await ui.pressRemove(WARM.id)
  assert.equal(ui.deletes.length, 0, 'a question asked on Alpha is not an answer on Beta')
  await ui.pressRemove(WARM.id)
  assert.equal(ui.deletes.length, 1)
  assert.equal(ui.deletes[0].id, BETA.id)
})

test('F-S5-007: a refusal is shown, names the version, and leaves the tile and the copy alone', async () => {
  for (const [status, body] of [
    [401, { code: 'NOT_SIGNED_IN' }],
    [403, { code: 'FORBIDDEN' }],
    [404, { code: 'NO_SUCH_VERSION' }],
    [409, { code: 'CONFLICT' }],
    [500, { code: 'NOT_WRITTEN' }],
    [502, '<html>bad gateway</html>']
  ]) {
    const ui = await mount({ answer: () => [status, body] })
    await ui.pressRemove(WARM.id)
    await ui.pressRemove(WARM.id)
    assert.equal(ui.deletes.length, 1, `HTTP ${status}: one request`)
    assert.ok(ui.tile(WARM.id), `HTTP ${status}: the tile is still there`)
    const [said] = ui.failures()
    assert.ok(said, `HTTP ${status}: the refusal is shown`)
    assert.ok(said.includes(WARM.title), `HTTP ${status}: it names the version — ${said}`)
    assert.ok(
      said.includes(typeof body === 'string' ? String(status) : body.code),
      `HTTP ${status}: it says why — ${said}`
    )
    // Not the sentence of a take that could not be written.
    assert.equal(ui.body().querySelector('[data-failed]'), null)
    // The control is released: the person can ask again.
    assert.equal(ui.removeButton(WARM.id).disabled, false)
    await ui.unmount()
  }
})

test('F-S5-007: a dropped request or an answer that does not confirm is shown as not confirmed', async () => {
  const cases = [
    ['network', () => Promise.reject(new TypeError('fetch failed'))],
    ['empty body', () => new Response('', { status: 200 })],
    ['broken JSON', () => new Response('{"ok":', { status: 200 })],
    ['null', () => [200, 'null']],
    ['wrong shape', () => [200, { removed: true }]],
    ['ok:false', () => [200, { ok: false }]],
    ['ok:"true"', () => [200, { ok: 'true' }]]
  ]
  for (const [name, answer] of cases) {
    const ui = await mount({ answer })
    const readsBefore = ui.reads()
    await ui.pressRemove(BOLD.id)
    await ui.pressRemove(BOLD.id)
    await ui.settle()
    assert.equal(ui.deletes.length, 1, `${name}: one request, no retry`)
    assert.ok(ui.tile(BOLD.id), `${name}: the tile is not removed on a guess`)
    const [said] = ui.failures()
    assert.ok(said, `${name}: something is said`)
    assert.ok(said.includes(BOLD.title), `${name}: it names the version — ${said}`)
    // The copy is read again so the tiles show what the host holds, whatever became of the request.
    assert.ok(ui.reads() > readsBefore, `${name}: the copy is read again`)
    assert.equal(ui.removeButton(BOLD.id).disabled, false)
    await ui.unmount()
  }
})

test('F-S5-007: a removal that reached the host but lost its answer shows the tile gone after the re-read', async () => {
  const ui = await mount({
    answer: ({ id, chip, vid }) => {
      // The host removed it, then the answer was lost on the way back.
      ui.held[id][chip] = ui.held[id][chip].filter((v) => v.id !== vid)
      return Promise.reject(new TypeError('socket hang up'))
    }
  })
  await ui.pressRemove(WARM.id)
  await ui.pressRemove(WARM.id)
  await ui.settle()
  assert.equal(ui.deletes.length, 1)
  assert.equal(ui.tile(WARM.id), null, 'the re-read shows what the host holds')
  assert.equal(ui.failures().length, 1, 'and the person is still told the answer never came')
})

test('F-S5-007: pressing again while a removal is running sends nothing more', async () => {
  const gate = deferred()
  const ui = await mount({ answer: () => gate.promise })
  await ui.pressRemove(WARM.id)
  // Confirm, then hammer the same control and another tile's before the answer lands.
  await ui.pressRemove(WARM.id, 4)
  await ui.pressRemove(BOLD.id, 2)
  assert.equal(ui.deletes.length, 1, 'one mutation at a time')
  assert.ok(ui.removeButton(WARM.id).disabled, 'the control is locked while the removal runs')
  await lib.act(async () => {
    gate.resolve([200, { ok: true }])
    await tick(5)
  })
  await ui.settle()
  assert.deepEqual(ui.tileIds(), ['default', BOLD.id])
  assert.equal(ui.deletes.length, 1)
})

test('F-S5-007: an answer that lands after the inspiration changed, or after close, touches nothing', async () => {
  const gate = deferred()
  const ui = await mount({ answer: () => gate.promise })
  await ui.pressRemove(WARM.id)
  await ui.pressRemove(WARM.id)
  assert.equal(ui.deletes.length, 1)
  // Step to Beta, which holds a version of the same id on the same chip.
  await ui.render({ index: 1 })
  for (let i = 0; i < 20 && (ui.tileIds().includes(BOLD.id) || ui.tile(WARM.id) === null); i += 1)
    await ui.settle()
  await lib.act(async () => {
    gate.resolve([500, { code: 'NOT_WRITTEN' }])
    await tick(5)
  })
  await ui.settle()
  assert.ok(ui.tile(WARM.id), "Beta's version is untouched")
  assert.deepEqual(ui.failures(), [], "Alpha's refusal is not shown on Beta")
  assert.equal(ui.removeButton(WARM.id).disabled, false, 'Beta is not locked by a removal on Alpha')
  await ui.unmount()

  // Closed while a removal is in flight: the late answer must not throw or write.
  const second = deferred()
  const closing = await mount({ answer: () => second.promise })
  await closing.pressRemove(WARM.id)
  await closing.pressRemove(WARM.id)
  await closing.unmount()
  second.resolve([200, { ok: true }])
  await tick(10)
  assert.equal(closing.deletes.length, 1)
})

test('F-S5-007: a version named with markup, quotes or a slash is asked about as text and addressed whole', async () => {
  const odd = version('take/2 "b"', `<img src=x onerror=alert(1)> "O'Brien" – Xin chào ✓`)
  const ui = await mount({
    copies: { [ALPHA.id]: { landing: [odd] } },
    answer: () => [500, { code: 'NOT_WRITTEN' }]
  })
  await ui.pressRemove(odd.id)
  const armed = ui.removeButton(odd.id)
  assert.ok(armed.textContent.includes(odd.title))
  assert.equal(armed.querySelector('img'), null, 'the title is text, never markup')
  await ui.pressRemove(odd.id)
  assert.equal(ui.deletes.length, 1)
  assert.equal(ui.deletes[0].vid, odd.id, 'the id reaches the door whole')
  assert.ok(ui.deletes[0].url.endsWith(`/versions/${encodeURIComponent(odd.id)}`))
  const [said] = ui.failures()
  assert.ok(said.includes(odd.title))
  assert.equal(ui.body().querySelector('[data-remove-failed] img'), null)
})

// ── Review round: what a 5xx is allowed to claim, and a re-read that is not a copy ───────────────

const sentence = (key, title, message) => lib.en[key].replace('{title}', title).replace('{message}', message)

test('F-S5-007: only the host’s own two no-write codes read as refused; any other answer may have removed it', async () => {
  for (const [name, said, key, message] of [
    ['404 from the host', [404, { code: 'NO_SUCH_VERSION' }], 'version.removeFailed', 'NO_SUCH_VERSION'],
    ['500 NOT_WRITTEN from the host', [500, { code: 'NOT_WRITTEN' }], 'version.removeFailed', 'NOT_WRITTEN'],
    [
      '502 JSON with a message',
      [502, { message: 'upstream timed out' }],
      'version.removeUnsure',
      'upstream timed out'
    ],
    ['502 JSON with a code', [502, { code: 'BAD_GATEWAY' }], 'version.removeUnsure', 'BAD_GATEWAY'],
    ['500 JSON with an error field', [500, { error: 'internal' }], 'version.removeUnsure', '500'],
    ['503 with no JSON', [503, '<html>unavailable</html>'], 'version.removeUnsure', '503'],
    // A 4xx is not the host's word either: the sign-in gate or a proxy can answer one for a request
    // that went through, and a code only counts at the status the host sends it with.
    ['401 from the gate', [401, { code: 'NOT_SIGNED_IN' }], 'version.removeUnsure', 'NOT_SIGNED_IN'],
    ['404 from something else', [404, { code: 'NOT_FOUND' }], 'version.removeUnsure', 'NOT_FOUND'],
    ['404 with no JSON', [404, '<html>not found</html>'], 'version.removeUnsure', '404'],
    ['409', [409, { code: 'CONFLICT' }], 'version.removeUnsure', 'CONFLICT'],
    ['the 404 code at a 500', [500, { code: 'NO_SUCH_VERSION' }], 'version.removeUnsure', 'NO_SUCH_VERSION'],
    ['the 500 code at a 404', [404, { code: 'NOT_WRITTEN' }], 'version.removeUnsure', 'NOT_WRITTEN'],
    ['a code that is not text', [404, { code: { toString: 1 } }], 'version.removeUnsure', '404']
  ]) {
    const ui = await mount({ answer: () => said })
    await ui.pressRemove(WARM.id)
    await ui.pressRemove(WARM.id)
    await ui.settle()
    assert.equal(ui.deletes.length, 1, `${name}: one request, no retry`)
    assert.deepEqual(ui.failures(), [sentence(key, WARM.title, message)], name)
    await ui.unmount()
  }
})

/** A copy exactly as the host answers it, with one take on the landing chip. */
const TAKE = {
  id: 'v-reread',
  title: 'Reread take',
  kind: 'llm',
  prompt: null,
  slots: { headline: 'Hello' },
  at: '2026-10-01T00:00:00Z',
  model: null
}
const whole = (over = {}, take = TAKE, chip = {}) => ({
  schemaVersion: '2',
  system: ALPHA.id,
  writtenAt: '2026-10-01T00:00:00Z',
  lang: 'en',
  brief: null,
  pages: { landing: { versions: [take], selected: null, nextPrompt: null, ...chip } },
  defaultPrompts: { home: 'Write it warmer.' },
  ...over
})
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key))
const MALFORMED = {
  'a version whose title is an object': whole({}, { ...TAKE, title: { text: 'x' } }),
  'a version with no title': whole({}, without(TAKE, 'title')),
  'a version with an empty id': whole({}, { ...TAKE, id: '' }),
  'a version of an unknown kind': whole({}, { ...TAKE, kind: 'draft' }),
  'a version with no slots': whole({}, without(TAKE, 'slots')),
  'a version whose slots are a list': whole({}, { ...TAKE, slots: ['Hello'] }),
  'a version with a slot that is not text': whole({}, { ...TAKE, slots: { headline: { html: 'x' } } }),
  'a version whose prompt is an object': whole({}, { ...TAKE, prompt: {} }),
  'a version whose date is a number': whole({}, { ...TAKE, at: 7 }),
  'a version whose model is an object': whole({}, { ...TAKE, model: {} }),
  'a version whose trimmed is not a list': whole({}, { ...TAKE, trimmed: 'headline' }),
  'a version that is a string': whole({}, 'v-reread'),
  'versions that are not a list': whole({}, TAKE, { versions: { 0: TAKE } }),
  'a selection that is an object': whole({}, TAKE, { selected: {} }),
  'a next prompt that is a number': whole({}, TAKE, { nextPrompt: 3 }),
  'a chip that is null': whole({ pages: { landing: null } }),
  'no schema version': without(whole(), 'schemaVersion'),
  'a language that is a number': whole({ lang: 1 }),
  'no written date': without(whole(), 'writtenAt'),
  'a brief that is text': whole({ brief: 'warm' }),
  'a brief with no voice': whole({ brief: { goal: 'sell' } }),
  'no brief': without(whole(), 'brief'),
  'a default prompt that is an object': whole({ defaultPrompts: { home: {} } }),
  'default prompts as a list': whole({ defaultPrompts: ['x'] })
}

test('F-S5-007: a well-formed re-read is drawn — the contract does not turn the host’s own file away', async () => {
  const ui = await mount({
    answer: () => Promise.reject(new TypeError('fetch failed')),
    read: (_id, n) =>
      n === 1
        ? null
        : json(200, whole({ brief: { goal: 'sell', voice: 'warm' } }, { ...TAKE, trimmed: ['headline'] }))
  })
  await ui.pressRemove(BOLD.id)
  await ui.pressRemove(BOLD.id)
  await ui.settle()
  assert.ok(ui.tile(TAKE.id), 'the re-read copy is what the tiles show')
  assert.equal(ui.tile(BOLD.id), null, 'the host no longer holds it, so the alert is not needed')
})

test('F-S5-007: a re-read that is not this inspiration’s copy is not drawn, and the problem stays on screen', async () => {
  for (const [name, body] of [
    ['an empty object', () => json(200, {})],
    ['null', () => json(200, 'null')],
    ['a list', () => json(200, [])],
    ['not JSON', () => new Response('<html>ok</html>', { status: 200 })],
    ['pages missing', () => json(200, { system: ALPHA.id, defaultPrompts: {} })],
    ['pages as a list', () => json(200, { system: ALPHA.id, pages: [], defaultPrompts: {} })],
    [
      'a chip with no versions',
      () => json(200, { system: ALPHA.id, pages: { landing: {} }, defaultPrompts: {} })
    ],
    [
      'a version with no id',
      () => json(200, { system: ALPHA.id, pages: { landing: { versions: [{}] } }, defaultPrompts: {} })
    ],
    ['no default prompts', () => json(200, { system: ALPHA.id, pages: {} })],
    ['another inspiration’s copy', () => json(200, { system: BETA.id, pages: {}, defaultPrompts: {} })],
    ['another inspiration’s whole copy', () => json(200, whole({ system: BETA.id }))],
    // One contract for the file: every field the dialog draws, wrong in one place at a time.
    ...Object.entries(MALFORMED).map(([name, file]) => [name, () => json(200, file)])
  ]) {
    const ui = await mount({
      answer: () => Promise.reject(new TypeError('fetch failed')),
      // The first read draws the dialog; every later one is the re-read after the failed removal.
      read: (_id, n) => (n === 1 ? null : body())
    })
    const readsBefore = ui.reads()
    await ui.pressRemove(BOLD.id)
    await ui.pressRemove(BOLD.id)
    await ui.settle()
    assert.ok(ui.reads() > readsBefore, `${name}: the copy was read again`)
    assert.deepEqual(
      ui.tileIds().filter((id) => id === WARM.id || id === BOLD.id),
      [WARM.id, BOLD.id],
      `${name}: the tiles stand`
    )
    assert.deepEqual(ui.failures(), [sentence('version.removeUnsure', BOLD.title, 'fetch failed')], name)
    assert.equal(ui.removeButton(BOLD.id).disabled, false, `${name}: the control is given back`)
    await ui.unmount()
  }
})

test('class:malformed-error-response:delete-version a drop or a refusal that is not text is still shown, and the control is given back', async () => {
  const drops = [
    ['an object whose toString is not callable', () => Promise.reject({ toString: 1 })],
    [
      'an Error whose message is an object',
      () => Promise.reject(Object.assign(new Error('x'), { message: {} }))
    ],
    [
      'an Error whose message cannot be made text',
      () => Promise.reject(Object.assign(new Error('x'), { message: { toString: 1 } }))
    ],
    ['null', () => Promise.reject(null)],
    ['nothing', () => Promise.reject(undefined)],
    ['a number', () => Promise.reject(7)],
    ['a list', () => Promise.reject([{}])],
    ['blank text', () => Promise.reject('  ')]
  ]
  const answers = [
    ['a message that is an object', () => [500, { message: {}, code: { toString: 1 } }]],
    ['a code that is a list beside the no-write status', () => [404, { code: ['NO_SUCH_VERSION'] }]],
    ['a list body', () => [500, '["NOT_WRITTEN"]']],
    ['a text body', () => [404, '"NO_SUCH_VERSION"']]
  ]
  for (const [name, answer] of [...drops, ...answers]) {
    const ui = await mount({ answer })
    await ui.pressRemove(BOLD.id)
    await ui.pressRemove(BOLD.id)
    await ui.settle()
    assert.equal(ui.deletes.length, 1, `${name}: one request, no retry`)
    const [said] = ui.failures()
    assert.ok(said, `${name}: something is said`)
    assert.ok(said.includes(BOLD.title), `${name}: it names the version — ${said}`)
    assert.match(said, /may or may not be gone/, `${name}: nobody stands behind this answer — ${said}`)
    assert.ok(!said.includes('[object') && !said.includes('undefined'), `${name}: only text — ${said}`)
    assert.ok(ui.tile(BOLD.id), `${name}: the tile is not removed on a guess`)
    assert.equal(ui.removeButton(BOLD.id).disabled, false, `${name}: the control is given back`)
    await ui.unmount()
  }
  // Text that is already text is still what is said.
  const plain = await mount({ answer: () => Promise.reject('socket closed') })
  await plain.pressRemove(BOLD.id)
  await plain.pressRemove(BOLD.id)
  await plain.settle()
  assert.ok(plain.failures()[0].includes('socket closed'))
})
