// `jsLiteral`: a contract value written into the JavaScript `flow.mjs` runs in the page.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jsLiteral } from '../src/js-literal.mjs'

test('a plain value reads back as itself', () => {
  for (const v of ['.ja-theme-toggle', ':root.dark-active', ['header', 'footer'], null, { a: 1 }])
    assert.deepEqual(new Function(`return ${jsLiteral(v)}`)(), v)
  assert.equal(jsLiteral('.ja-theme-toggle'), JSON.stringify('.ja-theme-toggle'))
})

test('a value cannot close the script or break the line it is written into', () => {
  const v = '</script><script>alert(1)</script>\u2028\u2029'
  const out = jsLiteral(v)
  assert.doesNotMatch(out, /[<>/\u2028\u2029]/)
  assert.equal(new Function(`return ${out}`)(), v)
})
