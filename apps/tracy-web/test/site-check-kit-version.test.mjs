// The site check refuses a kit settled by an older template-kit tool (ADR 0044, 2026-11-04), and a measure that measured nothing
// is unmeasured, never green, and counted. Kits and pages are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkLines } from '../src/site-check/check-lines.js'
import { KIT_TOOL_MIN, kitToolVersion } from '../src/site-check/kit-version.js'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { fakeHost, pageRead, pagedSite, writtenReport } from './_site-check-pages.mjs'

const check = (kit, extra = {}) =>
  runSiteCheck({ door: pagedSite(1).door, report: writtenReport(), kit, ...extra })

test('a kit settled by template-kit 3.0.0, or naming no tool, blocks the run on step 0', async () => {
  assert.equal(KIT_TOOL_MIN, '3.1.0')
  for (const kit of [{ tool: 'template-kit 3.0.0', blocks: [] }, { blocks: [] }]) {
    const r = await check(kit)
    const g = r.groups[0]
    assert.deepEqual([g.name, g.status], ['kit-version', 'red'])
    assert.equal(g.failures.length, 1)
    assert.equal(g.failures[0].causingStep, 0)
    assert.match(g.failures[0].reason, /this check needs at least 3\.1\.0: settle it again/)
    assert.ok(r.groups.slice(1).every((x) => x.status === 'not-run'))
  }
  const old = await check({ tool: 'template-kit 3.0.0', blocks: [] })
  assert.match(old.groups[0].failures[0].reason, /^the kit was settled by template-kit 3\.0\.0, this check/)
})

test('a kit settled by template-kit 3.1.0 or later runs on', async () => {
  for (const tool of ['template-kit 3.1.0', 'template-kit 3.2.4']) {
    const r = await check({ tool, blocks: [] })
    assert.equal(r.groups[0].status, 'green')
    assert.notEqual(r.groups[1].status, 'not-run')
  }
  assert.equal(kitToolVersion({ tool: 'template-kit 3.1.0' }), '3.1.0')
  assert.equal(kitToolVersion({ tool: 'something else' }), null)
  // No kit given, no kit group.
  assert.notEqual(
    (await runSiteCheck({ door: pagedSite(1).door, report: writtenReport() })).groups[0].name,
    'kit-version'
  )
})

test('a kit without sentence groups leaves broken-sentence unmeasured, not green, and the summary counts it', async () => {
  const r = await runSiteCheck({
    door: pagedSite(1).door,
    report: writtenReport(),
    host: fakeHost({ '/': pageRead('/') }, { measures: () => [{ path: '/', width: 1440, shownText: 'x' }] })
      .host,
    groups: PAGE_CHECK_GROUPS.filter((g) => g.name === 'broken-sentence'),
    kit: { tool: 'template-kit 3.1.0', blocks: [{ id: 'block-1' }] }
  })
  assert.equal(r.groups[0].status, 'unmeasured')
  assert.equal(r.status, 'unmeasured')
  assert.equal(r.counts.unmeasured, 1)
  assert.match(checkLines(r).at(-1), /^site-check: unmeasured \(0 block, 0 warn, 1 unmeasured\)$/)
})
