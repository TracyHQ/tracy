// The built site check on the REAL shapes (ticket #601): the write order and write plan made by the real modules for
// the invented florist on the real JA Boxing kit (`boxing-pages.mjs`), with pages invented from the plan's own values.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuiltSite } from '../built-site-check/check-built-site.mjs'
import { approvalOf, entriesOf, writeResultOf } from '../built-site-check/inputs.mjs'
import { pagesOfFolder } from '../built-site-check/site-pages.mjs'
import { boxingPages, boxingWrite } from './fixtures/built-site-check/boxing-pages.mjs'
import { folderOf } from './fixtures/built-site-check/florist.mjs'

const ENTRY = 'home.home-b2.button-label'

async function checked({ edit, files: change, result: over } = {}) {
  const { result, approval, kit } = await boxingWrite({ edit })
  const used = over?.(result) ?? result
  const files = boxingPages(result, approval)
  change?.(files)
  const a = approvalOf(approval)
  return checkBuiltSite({
    pages: pagesOfFolder(folderOf(files)),
    base: new URL('http://pages.invalid/'),
    source: { kind: 'pages' },
    plan: a.plan,
    held: a.held,
    write: writeResultOf(used),
    kit
  })
}

/** The real plan with every value of one entry set to `words`. */
const withValue = (words) => (plan) => {
  for (const op of plan.ops) for (const v of op.values ?? []) if (v.entry === ENTRY) v.value = words
}

test('the real write plan keeps only the order ids, and every write value names an entry place', async () => {
  const { result } = await boxingWrite()
  assert.deepEqual(Object.keys(result.plan.order).sort(), ['plan', 'run', 'template'])
  const entries = entriesOf(result.order)
  const named = result.plan.ops.flatMap((op) => (op.values ?? []).filter((v) => v.entry))
  assert.ok(named.length > 100, `${named.length} values`)
  assert.deepEqual(
    named.filter((v) => !entries.has(v.entry)).map((v) => v.entry),
    []
  )
  assert.equal(entries.get(ENTRY).entry.type, 'text')
})

test('every written text field of the real plan is measured on the pages, none passed unmeasured', async () => {
  const report = await checked()
  const limits = report.checks.limits
  assert.equal(limits.status, 'ran')
  assert.ok(limits.fields > 80, `${limits.fields} fields`)
  assert.equal(limits.measured, limits.fields)
  assert.deepEqual(limits.notLocated, [])
  assert.deepEqual(limits.findings, [])
  assert.equal(report.checks.design.status, 'ran')
  assert.deepEqual(report.checks.design.findings, [], 'the real plan writes no design place')
  assert.equal(report.checks.pages.status, 'ran')
  assert.deepEqual(report.checks.pages.findings, [])
})

test('a real field one over its limit is reported; at its limit it is not', async () => {
  const { result } = await boxingWrite()
  const limit = entriesOf(result.order).get(ENTRY).entry.limit
  const at = 'Order a bouquet today '.padEnd(limit, 'x')
  const fits = await checked({ edit: withValue(at) })
  assert.deepEqual(fits.checks.limits.findings, [])
  const over = await checked({ edit: withValue(`${at}y`) })
  assert.deepEqual(
    over.checks.limits.findings.map((f) => [f.place.entry, f.page, f.length, f.limit]),
    [[ENTRY, '/', limit + 1, limit]]
  )
})

test('a real SEO title over the order limit is read in the page title', async () => {
  const report = await checked({
    edit: (plan) => {
      for (const op of plan.ops)
        for (const v of op.values ?? []) if (v.entry === 'seo:contact.title') v.value = 'T'.repeat(61)
    }
  })
  assert.deepEqual(
    report.checks.limits.findings.map((f) => [f.place.entry, f.page, f.place.element, f.length]),
    [['seo:contact.title', '/visit-us', 'title', 61]]
  )
})

test('the real write plan without its order, or with no field on the pages, never says ran', async () => {
  const bare = await checked({ result: (r) => ({ plan: r.plan, report: r.report }) })
  assert.equal(bare.checks.limits.status, 'not_run')
  assert.match(bare.checks.limits.reason, /^write_order_missing/)
  const blank = await checked({
    files: (files) => {
      for (const name of Object.keys(files)) files[name] = '<html><body><p>Nothing</p></body></html>'
    }
  })
  assert.equal(blank.checks.limits.status, 'not_run')
  assert.match(blank.checks.limits.reason, /^nothing_measured: \d+ written text field/)
  assert.equal(blank.counts.limits, null)
})
