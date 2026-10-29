// The leftover check never reads a site that does not answer as clean (spec TracyHQ/tracy#189). A bakery and a dental
// clinic, both made up; the domain check is the real one.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDemoLeftovers } from 'website-opportunities/domain/demo-leftovers.mjs'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'

const run = (answers, paths) =>
  runLeftoverCheck({
    readPage: async (path) => answers[path] ?? { status: 404, html: '' },
    check: checkDemoLeftovers,
    contentMap: { slots: [] },
    brief: {},
    paths
  })

test('every page answering 500 or 404 is a broken site, not a clean one', async () => {
  const bakery = await run({ '/': { status: 500, html: '' } }, ['/loaves', '/contact'])
  assert.equal(bakery.pass, false)
  assert.deepEqual(bakery.broken.map((b) => b.path).sort(), ['/', '/contact', '/loaves'])
  assert.equal(bakery.counts.C01, 0)
  const clinic = await run({}, [])
  assert.equal(clinic.pass, false)
  assert.equal(clinic.broken[0].path, '/')
})

test('a site that answers 200 passes, and a kept page served under the index prefix is not broken', async () => {
  const ok = await run(
    {
      '/': { status: 200, html: '<a href="/index.php/whitening">Whitening</a><p>Northgate Dental</p>' },
      '/index.php/whitening': { status: 200, html: '<p>Whitening</p>' }
    },
    ['/whitening']
  )
  assert.deepEqual(ok.broken, [])
  assert.equal(ok.pass, true)
})

test('one kept page that 404s with no page of that address served is broken even when home is fine', async () => {
  const r = await run({ '/': { status: 200, html: '<p>Hello</p>' } }, ['/whitening'])
  assert.deepEqual(
    r.broken.map((b) => b.path),
    ['/whitening']
  )
  assert.equal(r.pass, false)
})
