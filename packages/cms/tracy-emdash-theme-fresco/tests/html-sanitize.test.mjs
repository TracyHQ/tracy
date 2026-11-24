// Text cleaning: the editor-text allowlist of src/lib/html.ts and the one-pass decoders of ingest/text.mjs.
// Each case is an input that defeated the single-replace version.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanHtml, lines } from '../src/lib/html.ts'
import { decodeWith, stripTags } from '../ingest/text.mjs'

test('cleanHtml: a tag rebuilt from a removed tag is not a tag', () => {
  const out = cleanHtml('<scr<script>ipt>alert(1)</scr</script>ipt>')
  assert.ok(!/<[^>]*script/i.test(out), out)
  assert.ok(!out.includes('<script'), out)
})

test('cleanHtml: a comment rebuilt from a removed comment is gone, a stray marker is escaped', () => {
  const out = cleanHtml('<!<!-- x -->-- y -->after<!-- open')
  assert.ok(!out.includes('<!--'), out)
  assert.ok(out.includes('after'))
})

test('cleanHtml: allowed markup survives, others are dropped, javascript: links lose href', () => {
  assert.equal(
    cleanHtml('<p onclick="x()">a <STRONG>b</STRONG><br/></p>'),
    '<p>a <strong>b</strong><br /></p>'
  )
  assert.equal(
    cleanHtml('<a href="javascript:x()" title="t">l</a><iframe src="x"></iframe>'),
    '<a title="t">l</a>'
  )
  assert.equal(cleanHtml('1 < 2 > 0'), '1 &lt; 2 &gt; 0')
})

test('lines: nested tags leave no tag behind; &amp; is decoded once', () => {
  assert.deepEqual(lines('Fish<b<i>>&amp; Chips<br/>&amp;lt;'), ['Fish& Chips', '&lt;'])
  assert.deepEqual(lines('<scr<b>ipt>x'), ['x'])
})

test('ingest decodeWith: one pass, a decoded & never starts another entity', () => {
  const decode = decodeWith({ '&amp;': '&', '&quot;': '"', '&lt;': '<' })
  assert.equal(decode('&amp;lt;'), '&lt;')
  assert.equal(decode('&amp;quot;'), '&quot;')
  assert.equal(decode('a &amp; b &quot;c&quot;'), 'a & b "c"')
})

test('ingest stripTags: repeats until stable', () => {
  assert.equal(stripTags('<scr<script>ipt>x'), 'x')
  assert.ok(!stripTags('<<b>b>y').includes('<'))
  assert.equal(stripTags('a<br>b', ' '), 'a b')
})
