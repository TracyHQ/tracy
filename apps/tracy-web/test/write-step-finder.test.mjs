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
  assert.deepEqual(asked, [['/', '/about']])
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
