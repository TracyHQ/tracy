// The served document a check's fingerprint is made of (`demo-qa-browser.js` `stableHtml`): per-request tokens out,
// every change a visitor could see kept (local measure 28/10/2026: "0 unchanged" on every incremental read).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stableHtml } from '../src/demo-qa-browser.js'

const joomla = (token, words = 'Our cocktails') =>
  `<script type="application/json" class="joomla-script-options new">{"system.paths":{"root":""},"csrf.token":"${token}"}</script>` +
  `<form><input type="hidden" name="${token}" value="1"></form><h1>${words}</h1>`

test('two loads of one Joomla page differ only by its form token, and read the same', () => {
  const a = joomla('d4581295758f35d168d28aa0e155e32a')
  const b = joomla('237b2e31c2df1ec3afbf316a2d118b67')
  assert.notEqual(a, b)
  assert.equal(stableHtml(a), stableHtml(b))
})

test('WordPress nonces and CSP nonces are taken out; nothing else is', () => {
  const page = (nonce, csp, words) =>
    `<script nonce="${csp}">var wpApiSettings={"root":"/wp-json/","nonce":"${nonce}"};</script>` +
    `<form><input type="hidden" id="_wpnonce" name="_wpnonce" value="${nonce}"></form><p>${words}</p>`
  assert.equal(
    stableHtml(page('a1b2c3d4e5', 'R4nd0mN0nce+/=', 'Hours: 8 to 6')),
    stableHtml(page('f6e5d4c3b2', 'An0therN0nce==', 'Hours: 8 to 6'))
  )
})

test('a change a visitor could see still changes the document', () => {
  const token = 'd4581295758f35d168d28aa0e155e32a'
  assert.notEqual(stableHtml(joomla(token, 'Our cocktails')), stableHtml(joomla(token, 'Our desserts')))
  // A 32-hex name that is not a hidden form token (an image file named by its hash) is kept.
  assert.notEqual(
    stableHtml('<img src="images/d4581295758f35d168d28aa0e155e32a.jpg">'),
    stableHtml('<img src="images/237b2e31c2df1ec3afbf316a2d118b67.jpg">')
  )
  // A visible input's value is kept.
  assert.notEqual(
    stableHtml('<input type="text" name="d4581295758f35d168d28aa0e155e32a" value="1">'),
    stableHtml('<input type="text" name="237b2e31c2df1ec3afbf316a2d118b67" value="1">')
  )
})
