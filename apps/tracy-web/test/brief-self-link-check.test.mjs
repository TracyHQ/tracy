// A button never sends the visitor to the page they are already on (spec TracyHQ/tracy#189). Two invented trades.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkSelfLinks } from '../src/opportunities-build/self-link-check.js'

const page = (path, body) => ({
  path,
  servedPath: path,
  status: 200,
  html: `<html><body>${body}</body></html>`
})

for (const [trade, path] of [
  ['bakery', '/about/our-bakers'],
  ['dental clinic', '/team']
])
  test(`${trade}: a body button to its own page is a finding, menus and anchors are not`, () => {
    const out = checkSelfLinks({
      pages: [
        page(
          path,
          `<nav><a href="${path}">Team</a></nav><section><a class="btn" href="${path}">Meet the team</a>` +
            `<a href="${path}#join">Join</a><a href="/contact">Contact</a></section><footer><a href="${path}">Team</a></footer>`
        ),
        page('/', `<a class="btn" href="${path}">Meet the team</a>`)
      ]
    })
    assert.equal(out.pass, false)
    assert.deepEqual(
      out.findings.map((f) => [f.path, f.label, f.reason]),
      [[path, 'Meet the team', 'self-link']]
    )
  })

test('an absolute link to the same site and page is caught; another host is not', () => {
  const body = '<a href="https://club.example/team/">Meet</a><a href="https://other.example/team">Other</a>'
  const out = checkSelfLinks({ pages: [page('/team', body)], origin: 'club.example' })
  assert.equal(out.findings.length, 1)
})
