// The host's `pageMeasures` answer, on invented pages: asked for with `measurePages`, one entry per kept page and width,
// and nothing changes for a caller that does not ask. The browser half is read in demo-qa-page-measures-browser.test.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoQaBody, runDemoQa } from '../src/demo-qa.js'

const BASE = 'http://127.0.0.1:5000/'
const measure = (width, extra = {}) => ({
  width,
  links: [],
  textBoxes: [],
  blocks: [],
  pictures: [],
  ...extra
})
/** A page read as the browser half returns it. */
const read =
  (measured = true) =>
  async (url, path) => ({
    path,
    url,
    status: 200,
    error: null,
    loadMs: 10,
    pending: [],
    blocked: [],
    failed: [],
    ...(measured
      ? {
          measures: [
            measure(1440, { links: [{ href: `${BASE}menu`, text: 'Menu' }] }),
            measure(390, { blocks: [{ selector: 'section.long', height: 4000 }] })
          ]
        }
      : {})
  })

test('measurePages is off unless the request says true', () => {
  assert.equal(demoQaBody({ label: 'acme', platform: 'wordpress' }).measurePages, false)
  assert.equal(demoQaBody({ label: 'acme', platform: 'wordpress', measurePages: 'yes' }).measurePages, false)
  assert.equal(demoQaBody({ label: 'acme', platform: 'wordpress', measurePages: true }).measurePages, true)
})

test('a caller that does not ask gets the answer it always got, with no pageMeasures', async () => {
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', pages: ['/', '/a'] })
  const result = await runDemoQa({
    asked,
    base: BASE,
    read: read(false),
    checkLinks: async () => assert.fail()
  })
  assert.equal('pageMeasures' in result, false)
  assert.equal('pageMeasuresSummary' in result, false)
  assert.deepEqual(result.pages, ['/', '/a'])
})

test("asked for, every page read gives one entry per width, 1440 then 390, with the links' status", async () => {
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', pages: ['/', '/a'], measurePages: true })
  const seen = []
  const result = await runDemoQa({
    asked,
    base: BASE,
    read: read(),
    checkLinks: async (entries, { deadlineAt }) => {
      seen.push(deadlineAt)
      return {
        measures: entries.map((e) => ({ ...e, links: e.links.map((l) => ({ ...l, status: 200 })) })),
        summary: { checked: 2, external: 0, overCap: 0, outOfTime: 0 }
      }
    }
  })
  assert.deepEqual(
    result.pageMeasures.map((m) => [m.path, m.width]),
    [
      ['/', 1440],
      ['/', 390],
      ['/a', 1440],
      ['/a', 390]
    ]
  )
  assert.equal(result.pageMeasures[0].links[0].status, 200)
  assert.equal(result.pageMeasures[1].blocks[0].height, 4000)
  assert.equal(result.pageMeasuresSummary.checked, 2)
  assert.ok(Number.isFinite(seen[0]), "the link phase is given the run's own limit")
})

test('the routes and the post are not measured: only the kept pages are', async () => {
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    pages: ['/'],
    routes: ['/r1'],
    routeBudgetMs: 10_000,
    measurePages: true
  })
  const asks = []
  await runDemoQa({
    asked,
    base: BASE,
    read: async (url, path, options) => {
      asks.push([path, options.measurePages])
      return read()(url, path)
    },
    checkLinks: async (entries) => ({ measures: entries, summary: {} })
  })
  assert.deepEqual(asks, [
    ['/', true],
    ['/r1', false]
  ])
})

test('without a link checker the entries still come, with no links rather than links of unknown status', async () => {
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', measurePages: true })
  const result = await runDemoQa({ asked, base: BASE, read: read() })
  assert.equal(result.pageMeasures.length, 2)
  assert.deepEqual(result.pageMeasures[0].links, [])
})

test('a page that did not open has no entry', async () => {
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    pages: ['/', '/gone'],
    measurePages: true
  })
  const result = await runDemoQa({
    asked,
    base: BASE,
    read: async (url, path) =>
      path === '/gone'
        ? { path, url, status: 404, error: null, loadMs: 5, pending: [], blocked: [], failed: [] }
        : read()(url, path)
  })
  assert.deepEqual([...new Set(result.pageMeasures.map((m) => m.path))], ['/'])
})
