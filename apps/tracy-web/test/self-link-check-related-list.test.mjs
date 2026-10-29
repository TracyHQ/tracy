// The self-link check reads card links of a related list (spec TracyHQ/tracy#189 round 9, class C3). Measured on a real
// build: the page's `<body>` carried a class `nav-breakpoint-lg`, which the check took for a menu, so not one link of any
// page was judged and a "more to enjoy" list linking to its own page passed. A list item hidden by the leftover block's
// current-page rule is not shown, so it is no finding. An invented pottery studio.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkSelfLinks } from '../src/opportunities-build/self-link-check.js'

const list = (rule) => `<html><head>${
  rule
    ? '<style data-tracy-leftovers>:has(a.mod-articles-category-title:not(.active)) > :has(a.mod-articles-category-title.active):not(:has(a.mod-articles-category-title:not(.active))){display:none !important}</style>'
    : ''
}</head><body class="site nav-breakpoint-lg navigation-default"><main><div class="row">
<div class="col"><a class="mod-articles-category-title active" href="/classes/wheel">Wheel throwing</a></div>
<div class="col"><a class="mod-articles-category-title" href="/classes/glazing">Glazing</a></div>
</div></main><footer><a href="/classes/wheel">Wheel throwing</a></footer></body></html>`

test('a card link to its own page counts even when the body class names a navigation breakpoint', () => {
  const out = checkSelfLinks({ pages: [{ path: '/classes/wheel', status: 200, html: list(false) }] })
  assert.equal(out.pass, false)
  assert.deepEqual(
    out.findings.map((f) => f.label),
    ['Wheel throwing']
  )
})

test("the current page's item hidden by the leftover block's rule is no finding", () => {
  const out = checkSelfLinks({ pages: [{ path: '/classes/wheel', status: 200, html: list(true) }] })
  assert.equal(out.pass, true, JSON.stringify(out.findings))
})
