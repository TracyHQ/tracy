// The real-page check at the brand-run seam (brand bench, #322): after the gate accepts a brand file (or after the safe
// version) the worker writes the trial site, captures it, judges it and stores the verdict and the captures on the run.
// The writer and the capture are fakes; the models are scripted. A write error stops the check, not the run.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { runFiles } from '../src/brand-step/brand-export.js'
import { RealPageWriteError } from '../src/brand-step/real-page/trial-writer.js'
import { captureRealPage, RealPageCaptureError } from '../src/brand-step/real-page/real-page-capture.js'
import { done, brandCase, runOnce, saveCall } from './_brand-bench.mjs'
import { fileDb } from './_db.mjs'
import { goodCaptures, PALETTE } from './_real-page-fixtures.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const looks = (broken = []) => [
  { body: { choices: [{ message: { content: JSON.stringify({ broken }) } }], usage: { cost: 0.0004 } } }
]

/** A fake real-page check: the writer and capture record what they were handed. */
function fakeRealPage({ writeError = null, captures, captureError = null } = {}) {
  const seen = { wrote: 0, captured: 0, brandFile: null }
  return {
    seen,
    palette: PALETTE,
    async write({ brandFile }) {
      seen.wrote++
      seen.brandFile = brandFile
      if (writeError) throw writeError
      return { site: { label: 'brand-trial', siteKey: 'k' }, written: ['logo', 'head-block'] }
    },
    async capture() {
      seen.captured++
      if (captureError) throw captureError
      return captures ?? (await goodCaptures())
    }
  }
}

test(
  'an accepted brand file is written, captured and judged: the verdict and the captures are on the run',
  opts,
  async () => {
    const c = await brandCase()
    const realPage = fakeRealPage()
    const { run } = await runOnce(db.pool, c, {
      agent: [saveCall(c.brand, 0.03), done(0.01)],
      reviewer: looks(),
      queue: { realPage }
    })
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.outcome, 'brand-file')
    assert.deepEqual(run.brandFile, c.brand)
    assert.equal(realPage.seen.wrote, 1)
    assert.deepEqual(realPage.seen.brandFile, c.brand)
    assert.equal(run.realPageVerdict.verdict, 'pass', JSON.stringify(run.realPageVerdict.checks))
    assert.equal(run.realPageVerdict.site, 'brand-trial')
    assert.deepEqual(run.realPageVerdict.writes, ['logo', 'head-block'])
    // Header, footer, opened menu and tab, in light and dark, are in the run folder.
    const names = c.files.map ? [...c.files.map.keys()] : []
    for (const id of ['header', 'footer', 'menu', 'tab'])
      for (const scheme of ['light', 'dark'])
        assert.ok(
          names.some((n) => n.startsWith(`real-page/${id}-${scheme}`)),
          `${id} ${scheme}`
        )
    assert.ok(
      names.includes('real-page/verdict.json') || names.some((n) => n.startsWith('real-page/verdict'))
    )
    // The look cost is counted on the run, and `get` writes the verdict file.
    assert.ok(run.cost.reviewer > 0)
    const files = await runFiles(db.pool, run, [])
    assert.ok(files.some(([name]) => name === 'real-page/verdict.json'))
  }
)

test(
  'a failing contrast on the page is a failing verdict; the run still keeps its brand file',
  opts,
  async () => {
    const c = await brandCase()
    const { run } = await runOnce(db.pool, c, {
      agent: [saveCall(c.brand), done()],
      reviewer: looks(),
      queue: { realPage: fakeRealPage({ captures: await goodCaptures({ lightInk: '#e6e6e6' }) }) }
    })
    assert.equal(run.status, 'succeeded')
    assert.deepEqual(run.brandFile, c.brand)
    assert.equal(run.realPageVerdict.verdict, 'fail')
    assert.deepEqual(run.realPageVerdict.failed, ['letters'])
    assert.match(run.realPageVerdict.checks.find((x) => x.id === 'letters').detail, /contrast/)
  }
)

test('a write error stops the check with its reason and the run keeps its brand file', opts, async () => {
  const c = await brandCase()
  const realPage = fakeRealPage({
    writeError: new RealPageWriteError('head', 'content.update was refused by the site')
  })
  const { run } = await runOnce(db.pool, c, {
    agent: [saveCall(c.brand), done()],
    reviewer: [],
    queue: { realPage }
  })
  assert.equal(run.status, 'succeeded')
  assert.deepEqual(run.brandFile, c.brand)
  assert.equal(run.realPageVerdict.verdict, 'stopped')
  assert.equal(run.realPageVerdict.stage, 'head')
  assert.match(run.realPageVerdict.reason, /content\.update was refused/)
  assert.equal(realPage.seen.captured, 0, 'nothing is captured after a write error')
})

test('a capture error stops the check with its reason', opts, async () => {
  const c = await brandCase()
  const realPage = fakeRealPage({ captureError: new RealPageCaptureError('the host answered 502') })
  const { run } = await runOnce(db.pool, c, {
    agent: [saveCall(c.brand), done()],
    reviewer: [],
    queue: { realPage }
  })
  assert.equal(run.realPageVerdict.verdict, 'stopped')
  assert.equal(run.realPageVerdict.stage, 'capture')
  assert.match(run.realPageVerdict.reason, /502/)
  assert.deepEqual(run.realPageVerdict.writes, ['logo', 'head-block'])
})

test(
  'the safe version goes through the same check, and its brand file is what is written',
  opts,
  async () => {
    const c = await brandCase()
    const bad = { ...c.brand, name: { ...c.brand.name, value: 'Saffron Lane Pilatez' } }
    const realPage = fakeRealPage()
    const { run } = await runOnce(db.pool, c, {
      agent: [saveCall(bad), done(), saveCall(bad), done(), saveCall(bad), done()],
      reviewer: looks(),
      queue: { realPage }
    })
    assert.equal(run.outcome, 'safe-version')
    assert.equal(realPage.seen.wrote, 1)
    assert.equal(realPage.seen.brandFile.safeVersion.reason, 'gate')
    assert.ok(run.realPageVerdict, 'the safe version has a real-page verdict')
  }
)

test('a server without a trial site runs the bench as before: no check, no verdict', opts, async () => {
  const c = await brandCase()
  const { run } = await runOnce(db.pool, c, { agent: [saveCall(c.brand), done()], reviewer: [] })
  assert.equal(run.status, 'succeeded')
  assert.equal(run.realPageVerdict, null)
})

test('the capture module takes any site and decodes the host answer', async () => {
  const sent = []
  const png = Buffer.from('png').toString('base64')
  const hostCall = async (body) => (
    sent.push(body),
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        url: 'https://x.test/',
        views: [{ id: 'header', scheme: 'light', ok: true, png }],
        icons: [],
        colours: {}
      }
    }
  )
  const got = await captureRealPage({
    site: { label: 'any-site', platform: 'joomla', port: 8080 },
    hostCall,
    bodyFor: () => ({ host: 'any-site.tracy.test' })
  })
  assert.equal(sent[0].mode, 'real-page/1')
  assert.equal(sent[0].label, 'any-site')
  assert.equal(sent[0].host, 'any-site.tracy.test')
  assert.equal(got.views[0].png.toString(), 'png')
  await assert.rejects(
    captureRealPage({
      site: { label: 'a', platform: 'joomla' },
      hostCall: async () => ({
        ok: false,
        status: 502,
        body: { code: 'REAL_PAGE_VIEWS_FAILED', reason: 'no browser' }
      })
    }),
    /no browser/
  )
})
