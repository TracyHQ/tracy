// The final check of the Tracy head blocks (spec TracyHQ/tracy#189, item 28): a brief build page without the brand colours
// block (when the plan takes the logo colours), without the leftovers block (when there are leftover rules), or with a card
// row that lost demo cards but no centring rule, is a major finding and the check does not pass. Every business is made up:
// a bicycle repair shop and a dog grooming salon.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkHeadBlocks } from '../src/opportunities-build/head-block-check.js'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'

const TEMPLATE_CSS =
  ':root{--color-primary:#e8402f}.btn.btn-primary{background-color:var(--color-primary)}a{color:#e8402f}'
const row =
  '<div id="acm-teams-3"><div class="row g-0"><div class="col-md-4"><div class="card"><h3>Ana</h3></div></div>' +
  '<div class="col-md-4"><div class="card"><h3>Ben</h3></div></div>' +
  '<div class="col-md-4"><div class="card"><h3></h3></div></div></div></div>'
const head = (blocks) =>
  `<html><head><link rel="stylesheet" href="/t.css">${blocks}</head><body>${row}</body></html>`
const COLOURS = '<style data-tracy-brand-colours>a{color:var(--tracy-brand-0-text)}</style>'
const LEFTOVERS =
  '<style data-tracy-leftovers>\n#acm-teams-3 > div.row.g-0:nth-child(1){display:flex !important}\n</style>'
const plan = (hex) => ({
  pages: [{ path: '/', decision: 'keep' }],
  outside: { videos: [{ key: 'module-1.1', demo: 'demoVidA1', decision: 'still' }] },
  colours: { decision: 'logo-colours', palette: { primary: hex } }
})

test('a page without its brand colours and leftovers blocks: two major findings and the centred row named', () => {
  const found = checkHeadBlocks({
    pages: [{ path: '/', status: 200, html: head('') }],
    sitePlan: plan('#1f5130'),
    styles: [{ css: TEMPLATE_CSS }]
  })
  assert.deepEqual(
    found.map((f) => [f.kind, f.found, f.severity]),
    [
      ['head-block', 'brand colours', 'major'],
      ['head-block', 'leftovers', 'major'],
      ['centred-row', '#acm-teams-3 > div.row.g-0:nth-child(1)', 'major']
    ]
  )
})

test('a page that carries every block it is owed passes; a plan without logo colours owes no colours block', () => {
  assert.deepEqual(
    checkHeadBlocks({
      pages: [{ path: '/', status: 200, html: head(COLOURS + LEFTOVERS) }],
      sitePlan: plan('#6b2f7a'),
      styles: [{ css: TEMPLATE_CSS }]
    }),
    []
  )
  assert.deepEqual(
    checkHeadBlocks({
      pages: [{ path: '/', status: 200, html: head(LEFTOVERS) }],
      sitePlan: { ...plan('#6b2f7a'), colours: { decision: 'template-colours' } },
      styles: [{ css: TEMPLATE_CSS }]
    }),
    []
  )
  // No site plan: not a brief build, nothing is owed.
  assert.deepEqual(checkHeadBlocks({ pages: [{ path: '/', status: 200, html: head('') }] }), [])
})

test('the leftover check does not pass when the head blocks never reached the page', async () => {
  const served = { '/': head(''), '/t.css': TEMPLATE_CSS }
  const report = await runLeftoverCheck({
    readPage: async (path) =>
      path in served ? { status: 200, html: served[path] } : { status: 404, html: '' },
    check: () => ({ pass: true, findings: [], counts: {} }),
    contentMap: null,
    brief: null,
    sitePlan: plan('#1f5130'),
    paths: ['/']
  })
  assert.equal(report.pass, false)
  assert.ok(report.findings.some((f) => f.kind === 'head-block' && f.found === 'brand colours'))
  assert.ok(report.findings.some((f) => f.kind === 'centred-row'))
})
