import assert from 'node:assert/strict'
import test from 'node:test'
import { escapeRe, withoutScripts } from '../tools/html-text.mjs'

test('withoutScripts removes script elements in any case, including one split by a removal', () => {
  assert.equal(withoutScripts('a<script>x()</script>b'), 'ab')
  assert.equal(withoutScripts('a<SCRIPT type="module">x</SCRIPT >b'), 'ab')
  assert.equal(withoutScripts('a<script\nsrc="x.js"></script>b<script/>c</script>d'), 'abd')
  assert.equal(withoutScripts('a<scr<script>y</script>ipt>z</script>b'), 'ab')
})

test('withoutScripts keeps elements whose name only starts with script', () => {
  assert.equal(withoutScripts('<scripted>keep</scripted>'), '<scripted>keep</scripted>')
  assert.equal(
    withoutScripts('<script-widget>Keep</script-widget><script>drop()</script><p>After</p>'),
    '<script-widget>Keep</script-widget><p>After</p>'
  )
})

test('escapeRe matches every metacharacter literally', () => {
  for (const s of ['/index.php?Itemid=1', '/a.b(c)[d]\\e+f', '^x$|y*{2}']) {
    assert.ok(new RegExp(`^${escapeRe(s)}$`).test(s), s)
    assert.ok(!new RegExp(`^${escapeRe(s)}$`).test(`${s}x`), s)
  }
  assert.ok(!new RegExp(escapeRe('a.b')).test('axb'))
})
