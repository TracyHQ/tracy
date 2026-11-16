// A picture printed with no file is a finding of the pages check (ticket #597, gate run 7): an `img` whose `src` is
// empty or names only the site root. A built site printed its footer logo so when the plan had a text logo. Invented
// florist pages only.
//
//   node --test --test-concurrency=1 scripts/test/built-site-check-empty-pictures.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isEmptyPictureSrc } from '../built-site-check/check-empty-pictures.mjs'
import { pages } from './fixtures/built-site-check/florist.mjs'
import { kindsOf, reportOf } from './fixtures/built-site-check/report-of.mjs'

const BASE = new URL('http://pages.invalid/')

test('an empty, root-only or base-only picture address names no file; a file address does', () => {
  const page = { abs: 'http://pages.invalid/classes' }
  for (const src of ['', ' ', '/', '#', 'http://pages.invalid/', './'])
    assert.ok(isEmptyPictureSrc(src, { abs: BASE.href }, BASE), `"${src}" names no file`)
  for (const src of ['/images/logo.png', 'images/a.webp', 'http://pages.invalid/?thumb=1'])
    assert.ok(!isEmptyPictureSrc(src, page, BASE), `"${src}" names a file`)
})

test('a footer logo printed with an empty src is an empty_picture finding on that page, never its words', async () => {
  const files = pages()
  files['index.html'] = files['index.html'].replace(
    '</body>',
    '<div class="footer-logo"><a href="index.php"><img src="" width="175" height="56"></a></div></body>'
  )
  const report = await reportOf({ files })
  const found = report.checks.pages.findings.filter((f) => f.kind === 'empty_picture')
  assert.equal(found.length, 1)
  assert.deepEqual(found[0].place, { parent: 'a', class: null, src: '' })
})

test('the florist pages as built print no empty picture', async () => {
  const report = await reportOf()
  assert.ok(!kindsOf(report, 'pages').includes('empty_picture'))
})
