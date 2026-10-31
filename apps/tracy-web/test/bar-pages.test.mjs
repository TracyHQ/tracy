/**
 * The doors `bar/route.js` serves directly, tested against the rendered markup rather than
 * through a database-backed route harness — every export here is a pure function of its
 * arguments. Written against task 6's brief before the shell landed in `bar/pages.js`: these
 * cases are the ones that told the previous 1107-byte, tokenless page it was wrong.
 *
 * Four pages left this file with ADR 0018 — `privatePage`, the two OTP steps and `teamPage` —
 * when the bar stopped gating and stopped signing anyone in. What they were is in
 * `git log -- apps/tracy-web/src/bar/pages.js`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unknownSitePage, messagePage } from '../src/bar/pages.js'

async function html(response) {
  return response.text()
}

test('unknownSitePage and messagePage carry the shared shell — token block, color-scheme', async () => {
  const unknown = await html(unknownSitePage('nope.tracy.test'))
  assert.match(unknown, /<meta name="color-scheme" content="light dark">/)
  assert.match(unknown, /--primary:oklch\(0\.565 0\.136 37\.4\)/)
  assert.match(await html(messagePage('Not found', 'gone', 404)), /--primary:oklch\(0\.565/)
})

test('unknownSitePage: a <script> pushed through hostname never reaches the page unescaped', async () => {
  const text = await html(unknownSitePage('<script>alert(1)</script>.tracy.test'))
  assert.ok(!text.includes('<script>alert(1)</script>'))
  assert.match(text, /&lt;script&gt;/)
})
