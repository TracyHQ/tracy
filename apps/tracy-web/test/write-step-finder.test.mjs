// The finder of step 9b (#448): it shoots every page the write report keeps at both widths through the host's capture and
// asks its door once per page, keeping only faults on tiles it was shown. The door and the capture are fakes; the pages
// and words are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { siteFinder } from '../src/write-step/finder/finder.js'

/** A viewport tile as the host sends it: a plain JPEG (the finder stitches tiles into sheets, so they must decode). */
const TILE = (
  await sharp({ create: { width: 390, height: 300, channels: 3, background: '#d0d0d0' } })
    .jpeg()
    .toBuffer()
).toString('base64')

/** A host capture that streams one tile per page and width, and fails the pages named in `failing`. */
function fakeCapture(failing = []) {
  const asked = []
  const capture = async (layouts, { onFrame }) => {
    asked.push(layouts.map((l) => l.path))
    for (const layout of layouts)
      for (const width of [1440, 390]) {
        const base = { page: layout.path, key: layout.key, width }
        if (failing.includes(layout.path)) {
          await onFrame({ type: 'view-end', ...base, complete: false, reason: 'CAPTURE_PAGE_FAILED' })
          continue
        }
        await onFrame({ type: 'view-start', ...base, documentHeight: 900 })
        await onFrame({ type: 'tile', ...base, index: 0, y: 0, height: 900, documentHeight: 900, jpeg: TILE })
        await onFrame({ type: 'view-end', ...base, complete: true })
      }
    return { ok: true }
  }
  return { capture, asked }
}

const door = (answers) => {
  const calls = []
  return {
    calls,
    ok: true,
    async ask({ content }) {
      const page = content[0].text.replace(/^Page (.*)\.$/, '$1')
      calls.push({ page, images: content.filter((c) => c.type === 'image_url').length })
      return { text: JSON.stringify(answers[page] ?? { faults: [] }), costUsd: 0.01 }
    }
  }
}

const REPORT = {
  site: 'site.example',
  keptPages: [
    { path: '/', id: 'page-home' },
    { path: 'about', id: 'page-about' }
  ]
}

test('the finder looks at every kept page at both widths and keeps faults on tiles it was shown', async () => {
  const { capture, asked } = fakeCapture()
  const finderDoor = door({
    '/about': {
      faults: [
        {
          page: '/about',
          viewport: 'phone',
          tile: 0,
          kind: 'broken-layout',
          seen: 'The heading "Our coaches" runs off the page'
        },
        // A tile it was never shown: dropped.
        { page: '/about', viewport: 'phone', tile: 4, kind: 'wrong-alt', seen: 'no such tile' },
        { page: '/about', viewport: 'desktop', tile: 0, kind: 'taste', seen: 'The font is dull' }
      ]
    }
  })
  const { faults, problems, costUsd } = await siteFinder({ door: finderDoor, capture }).find(REPORT)
  assert.deepEqual(
    asked.sort(),
    [['/'], ['/about']],
    'each page is shot on its own, so it is asked about once shot'
  )
  // Pages are asked about as each one's sheets are ready, in no fixed order.
  assert.deepEqual(
    finderDoor.calls.toSorted((a, b) => a.page.localeCompare(b.page)),
    [
      { page: '/', images: 2 },
      { page: '/about', images: 2 }
    ]
  )
  assert.deepEqual(
    faults.map((f) => [f.page, f.viewport, f.kind]),
    [
      ['/about', 'phone', 'broken-layout'],
      ['/about', 'desktop', 'other']
    ]
  )
  assert.deepEqual(problems, [])
  assert.equal(costUsd, 0.02)
})

test('a page that could not be shot is named, never counted as clean; a refused door finds nothing and says why', async () => {
  const { capture } = fakeCapture(['/about'])
  const looked = await siteFinder({ door: door({}), capture }).find(REPORT)
  assert.deepEqual(
    looked.problems.map((p) => [p.page, p.viewport]),
    [
      ['/about', 'desktop'],
      ['/about', 'phone']
    ]
  )
  assert.match(looked.problem, /2 page views not looked at/)
  const refused = await siteFinder({
    door: { ok: false, code: 'FINDER_DOOR_UNSET', reason: 'no model' },
    capture
  }).find(REPORT)
  assert.deepEqual(refused.faults, [])
  assert.match(refused.problem, /FINDER_DOOR_UNSET/)
})

test('a second look names its pages: only those are shot and asked about', async () => {
  const { capture, asked } = fakeCapture()
  const finderDoor = door({})
  await siteFinder({ door: finderDoor, capture }).find(REPORT, { pages: ['/about'] })
  assert.deepEqual(asked, [['/about']])
  assert.deepEqual(
    finderDoor.calls.map((c) => c.page),
    ['/about']
  )
})

/** A promise and the hands that settle it. */
const deferred = () => {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const PAGES = ['/', '/about', '/classes', '/coaches', '/prices', '/contact']
const MANY = { site: 'site.example', keptPages: PAGES.map((p) => ({ path: p, id: null })) }

/** A capture held until the test lets each page go; records how many run at once. */
function heldCapture() {
  const held = new Map(PAGES.map((p) => [p, deferred()]))
  const state = { running: 0, most: 0, started: [] }
  const capture = async (layouts, { onFrame, signal }) => {
    const [layout] = layouts
    state.running += 1
    state.most = Math.max(state.most, state.running)
    state.started.push(layout.path)
    try {
      await Promise.race([
        held.get(layout.path).promise,
        new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))))
      ])
      for (const width of [1440, 390]) {
        const base = { page: layout.path, key: layout.key, width }
        await onFrame({ type: 'tile', ...base, index: 0, y: 0, height: 900, documentHeight: 900, jpeg: TILE })
        await onFrame({ type: 'view-end', ...base, complete: true })
      }
      return { ok: true }
    } finally {
      state.running -= 1
    }
  }
  return { capture, state, release: (page) => held.get(page).resolve() }
}

const settle = async () => {
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r))
}

/** Waits until `ready()` holds: stitching a page's sheets runs off the main thread, so a few turns are not enough. */
const until = async (ready, what) => {
  for (let i = 0; i < 400 && !ready(); i++) await new Promise((r) => setTimeout(r, 5))
  assert.ok(ready(), `waited for ${what}`)
}

test('pages are shot four at once and each is asked about as soon as its shots exist', async () => {
  const { capture, state, release } = heldCapture()
  const asked = []
  const finderDoor = {
    ok: true,
    async ask({ content }) {
      asked.push(content[0].text)
      return { text: '{"faults":[]}', costUsd: 0.01 }
    }
  }
  const run = siteFinder({ door: finderDoor, capture }).find(MANY)
  await settle()
  assert.equal(state.running, 4, 'four pages are shot at once')
  release('/')
  await until(() => asked.length > 0, 'the home page to be asked about')
  await settle()
  assert.deepEqual(asked, ['Page /.'], 'the home page is asked about while the others are still being shot')
  assert.equal(state.most, 4)
  for (const p of PAGES) release(p)
  const looked = await run
  assert.equal(asked.length, PAGES.length)
  assert.equal(looked.costUsd, 0.06)
  assert.deepEqual(looked.problems, [])
})

test('stopped at its time limit, the finder keeps every fault found so far and names each page it did not look at', async () => {
  const { capture, release } = heldCapture()
  const finderDoor = {
    ok: true,
    async ask({ content }) {
      const page = content[0].text.replace(/^Page (.*)\.$/, '$1')
      const fault = { page, viewport: 'desktop', tile: 0, kind: 'broken-layout', seen: `"${page}" runs off` }
      return { text: JSON.stringify({ faults: [fault] }), costUsd: 0.02 }
    }
  }
  const controller = new AbortController()
  let answered = 0
  const counted = { ok: true, ask: async (input) => ((answered += 1), finderDoor.ask(input)) }
  const run = siteFinder({ door: counted, capture }).find(MANY, { signal: controller.signal })
  release('/')
  release('/about')
  await until(() => answered === 2, 'both released pages to be asked about')
  await settle()
  controller.abort()
  const looked = await run
  assert.deepEqual(
    looked.faults.map((f) => f.page),
    ['/', '/about']
  )
  assert.deepEqual(looked.problems.map((p) => p.page).sort(), ['/classes', '/coaches', '/contact', '/prices'])
  for (const p of looked.problems) assert.match(p.problem, /not looked at: the finder's time ran out/)
  assert.equal(looked.costUsd, 0.04)
  assert.match(looked.problem, /4 pages not looked at/)
})

test('each page is handed on as soon as its look ends, with its faults; a page cut off by the time limit is not', async () => {
  const { capture, release } = heldCapture()
  const finderDoor = {
    ok: true,
    async ask({ content }) {
      const page = content[0].text.replace(/^Page (.*)\.$/, '$1')
      const fault = {
        page,
        viewport: 'phone',
        tile: 0,
        kind: 'empty-frame',
        seen: `a broken picture on "${page}"`
      }
      return { text: JSON.stringify({ faults: page === '/about' ? [fault] : [] }), costUsd: 0.01 }
    }
  }
  const handed = []
  const controller = new AbortController()
  const run = siteFinder({ door: finderDoor, capture }).find(MANY, {
    signal: controller.signal,
    onPage: (page, faults) => handed.push([page, faults.map((f) => f.kind)])
  })
  release('/about')
  await until(() => handed.length === 1, 'the about page to be handed on')
  await settle()
  assert.deepEqual(
    handed,
    [['/about', ['empty-frame']]],
    'the page is handed on while the others are still shot'
  )
  release('/')
  await until(() => handed.length === 2, 'the home page to be handed on')
  assert.deepEqual(handed.at(-1), ['/', []], 'a clean page is handed on too, with no faults')
  controller.abort()
  const looked = await run
  assert.equal(
    handed.length,
    2,
    'pages the time limit cut off are named as problems, never handed on as clean'
  )
  assert.equal(looked.faults.length, 1)
})

test('a page whose tiles cannot be read is named, never asked about with nothing', async () => {
  const broken = Buffer.from('not a picture').toString('base64')
  const capture = async (layouts, { onFrame }) => {
    for (const width of [1440, 390]) {
      const base = { page: layouts[0].path, key: layouts[0].key, width }
      await onFrame({ type: 'tile', ...base, index: 0, y: 0, height: 900, documentHeight: 900, jpeg: broken })
      await onFrame({ type: 'view-end', ...base, complete: true })
    }
    return { ok: true }
  }
  const finderDoor = door({})
  const looked = await siteFinder({ door: finderDoor, capture }).find(REPORT, { pages: ['/about'] })
  assert.deepEqual(finderDoor.calls, [])
  assert.deepEqual(
    looked.problems.map((p) => p.page),
    ['/about']
  )
  assert.match(looked.problems[0].problem, /could not be stitched/)
})
