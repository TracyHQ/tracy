/**
 * What this package promises, held by machine.
 *
 * Two halves, and the second is the one that matters. The first checks the build the way
 * `cms-motion`'s does — three files, two of them byte-identical, drift detected. The second RUNS the
 * emitted bundle against a hand-built DOM, because the promise this package exists to make is a
 * behavioural one: a `style` refresh must repaint the page WITHOUT reloading it. A test that only
 * compared bytes would pass just as happily on a bundle that reloads every time, which is the exact
 * regression that would make the whole feature pointless while looking perfectly healthy.
 *
 * The DOM is a stub rather than jsdom on purpose: this repo has no jsdom at the root, and the four
 * DOM calls the agent makes are cheap to stand up honestly.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { CHANNEL, DEFAULT_MODE, MODES, VERSION, isMessage, refreshMessage } from '../protocol.mjs'
import { banner, plan, protocolModule, stale } from '../scripts/build.mjs'

test('the contract refuses a mode it does not know, rather than passing it on', () => {
  assert.equal(refreshMessage('style').mode, 'style')
  assert.equal(refreshMessage('body-swap').mode, DEFAULT_MODE)
  assert.equal(refreshMessage(undefined).mode, DEFAULT_MODE)
})

test('a message reader is total: junk from a framed page is not a message', () => {
  for (const junk of [
    null,
    undefined,
    0,
    '',
    'ready',
    [],
    { kind: 'ready' },
    { channel: CHANNEL, v: 99, kind: 'ready' }
  ])
    assert.equal(isMessage(junk, 'ready'), false)
  assert.equal(isMessage({ channel: CHANNEL, v: VERSION, kind: 'ready' }, 'ready'), true)
  assert.equal(isMessage({ channel: CHANNEL, v: VERSION, kind: 'ready' }, 'refresh'), false)
})

test('both themes get the same bytes, and the side card gets the same four constants', async () => {
  const { files } = await plan()
  assert.deepEqual([...files.keys()].sort(), [
    'joomla/media/js/tracy-preview.js',
    'sidecard/preview-protocol.generated.ts',
    'web/tracy-preview.generated.js',
    'wordpress/assets/js/tracy-preview.js'
  ])
  assert.equal(
    files.get('wordpress/assets/js/tracy-preview.js'),
    files.get('joomla/media/js/tracy-preview.js')
  )
  const contract = files.get('sidecard/preview-protocol.generated.ts')
  assert.match(contract, new RegExp(`PREVIEW_CHANNEL = "${CHANNEL}"`))
  assert.match(contract, new RegExp(`PREVIEW_VERSION = ${String(VERSION)}`))
  assert.match(contract, new RegExp(`PREVIEW_DEFAULT_MODE = "${DEFAULT_MODE}"`))
  for (const mode of MODES)
    assert.ok(contract.includes(`"${mode}"`), `${mode} is missing from the side card's copy`)
})

test('line 1 of the emitted bundle names the contract, and survives minification', async () => {
  const { files, version } = await plan()
  assert.equal(files.get('wordpress/assets/js/tracy-preview.js').split('\n')[0], banner(version))
})

test('a generated file that drifted is reported, one line per file', async () => {
  const { files } = await plan()
  const nowhere = {
    wordpress: '/nowhere/wp',
    joomla: '/nowhere/joomla',
    sidecard: '/nowhere/card',
    web: '/nowhere/web'
  }
  assert.equal(stale(files, nowhere).length, files.size)
})

test('the side card copy is a function of the contract alone', () => {
  const one = protocolModule({ channel: 'a', version: 2, modes: ['x'], defaultMode: 'x' })
  const two = protocolModule({ channel: 'a', version: 2, modes: ['x'], defaultMode: 'x' })
  assert.equal(one, two)
  assert.notEqual(one, protocolModule({ channel: 'b', version: 2, modes: ['x'], defaultMode: 'x' }))
})

// ── The bundle, run ───────────────────────────────────────────────────────────────────────────

/**
 * A DOM with exactly what the agent touches, and one stylesheet per entry in `hrefs`.
 * @param {object} input
 * @param {readonly string[]} input.hrefs - the stylesheet addresses the page holds.
 * @param {boolean} [input.framed] - whether the page is inside a frame.
 */
function fakePage({ hrefs, framed = true }) {
  const posted = []
  const listeners = new Map()
  let reloads = 0
  const inserted = []
  const removed = []
  const links = hrefs.map((href) => {
    const link = {
      href,
      tagName: 'LINK',
      cloneNode() {
        const copy = { ...link, cloneNode: link.cloneNode, addEventListener: link.addEventListener, on: {} }
        copy.parentNode = null
        return copy
      },
      on: {},
      addEventListener(name, fn) {
        this.on[name] = fn
      }
    }
    link.parentNode = {
      insertBefore(fresh) {
        inserted.push(fresh)
      },
      removeChild(child) {
        removed.push(child)
      }
    }
    return link
  })
  const window = {
    TracyPreviewStarted: undefined,
    location: {
      origin: 'https://site.example',
      reload() {
        reloads += 1
      }
    },
    addEventListener(name, fn) {
      listeners.set(name, fn)
    },
    postMessage(message) {
      posted.push(message)
    }
  }
  window.parent = framed ? { postMessage: (message) => posted.push(message) } : window
  const document = {
    baseURI: 'https://site.example/page',
    querySelectorAll: () => links
  }
  return { window, document, posted, listeners, links, inserted, removed, reloads: () => reloads }
}

/**
 * Run the emitted bundle against one fake page, then `body` while that page is still the global
 * one.
 *
 * The globals stay installed for the whole of `body` because the bundle reads `window` and
 * `document` LAZILY — inside the message listener, long after the script itself has run. Restoring
 * them at the end of the script, which is the obvious place, leaves every listener holding an
 * undefined global and every behavioural test failing for a reason that has nothing to do with the
 * code under test.
 * @param {ReturnType<typeof fakePage>} page - the page to run against.
 * @param {(page: ReturnType<typeof fakePage>) => void} [body] - what to do while it is installed.
 */
async function run(page, body) {
  const { files } = await plan()
  const source = files.get('wordpress/assets/js/tracy-preview.js')
  const previous = { window: globalThis.window, document: globalThis.document }
  globalThis.window = page.window
  globalThis.document = page.document
  try {
    // eslint-disable-next-line no-eval -- the emitted IIFE is the artefact under test
    ;(0, eval)(source)
    if (body !== undefined) body(page)
  } finally {
    globalThis.window = previous.window
    globalThis.document = previous.document
  }
}

test('an unframed page — a real visitor — installs nothing and announces nothing', async () => {
  const page = fakePage({ hrefs: ['https://site.example/style.css'], framed: false })
  await run(page)
  assert.deepEqual(page.posted, [])
  assert.equal(page.listeners.size, 0)
  assert.equal(page.window.TracyPreviewStarted, undefined)
})

test('a framed page announces itself once, and listens', async () => {
  const page = fakePage({ hrefs: ['https://site.example/style.css'] })
  await run(page)
  // No `data-parent-origin` on the script tag (a theme's own copy): refresh only, no picker offered.
  assert.deepEqual(page.posted, [{ channel: CHANNEL, v: VERSION, kind: 'ready', features: [] }])
  assert.ok(page.listeners.has('message'))
  assert.ok(page.listeners.has('pageshow'))
})

test('a style refresh swaps the sheet and NEVER reloads — the whole point of this package', async () => {
  const page = fakePage({ hrefs: ['https://site.example/style.css', 'https://cdn.example/font.css'] })
  await run(page, () => page.listeners.get('message')({ data: refreshMessage('style') }))
  assert.equal(page.reloads(), 0, 'a style refresh must not reload the document')
  assert.equal(page.inserted.length, 1, 'only the same-origin sheet is swapped')
  assert.match(page.inserted[0].href, /style\.css\?tracy-preview=\d+/)
  assert.deepEqual(page.posted.at(-1), { channel: CHANNEL, v: VERSION, kind: 'applied', mode: 'style' })
})

test('the old sheet is removed only once the fresh one has loaded, so nothing is ever unstyled', async () => {
  const page = fakePage({ hrefs: ['https://site.example/style.css'] })
  await run(page, () => page.listeners.get('message')({ data: refreshMessage('style') }))
  assert.deepEqual(page.removed, [], 'the page must keep its styling until the replacement arrives')
  page.inserted[0].on.load()
  assert.equal(page.removed.length, 1)
})

test('a style refresh on a page with no same-origin sheet reloads instead of lying', async () => {
  const page = fakePage({ hrefs: ['https://cdn.example/font.css'] })
  await run(page, () => page.listeners.get('message')({ data: refreshMessage('style') }))
  assert.equal(page.reloads(), 1)
  assert.deepEqual(page.posted.at(-1), { channel: CHANNEL, v: VERSION, kind: 'applied', mode: DEFAULT_MODE })
})

test('a full refresh reloads', async () => {
  const page = fakePage({ hrefs: ['https://site.example/style.css'] })
  await run(page, () => page.listeners.get('message')({ data: refreshMessage('full') }))
  assert.equal(page.reloads(), 1)
  assert.equal(page.inserted.length, 0)
})

test('a message from someone else is not a refresh', async () => {
  const page = fakePage({ hrefs: ['https://site.example/style.css'] })
  await run(page, () => {
    for (const data of [
      null,
      'refresh',
      { kind: 'refresh' },
      { channel: 'other', v: VERSION, kind: 'refresh', mode: 'full' },
      { channel: CHANNEL, v: VERSION + 1, kind: 'refresh', mode: 'full' }
    ])
      page.listeners.get('message')({ data })
  })
  assert.equal(page.reloads(), 0)
  assert.equal(page.inserted.length, 0)
})
