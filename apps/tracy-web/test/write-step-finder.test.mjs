// The finder of step 9b (#448): it shoots every page the write report keeps at both widths through the host's capture and
// asks its door once per page, keeping only faults on tiles it was shown. The door and the capture are fakes; the pages
// and words are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { siteFinder } from '../src/write-step/finder/finder.js'

const TILE = Buffer.from('a tile of a page').toString('base64')

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
  assert.deepEqual(finderDoor.calls, [
    { page: '/', images: 2 },
    { page: '/about', images: 2 }
  ])
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
  const run = siteFinder({ door: finderDoor, capture }).find(MANY, { signal: controller.signal })
  release('/')
  release('/about')
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
