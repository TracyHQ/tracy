// The memory site prints and stores as the template and the plugin were measured to (ticket #597, "Escaping of every
// place the build writes", plugin 0.24.85): a place the kit declares escaped prints escaped (`metadesc`, `og_*`, a menu
// item title; the main menu title twice, in a list page's hidden heading); an article `attribs` key, a module title
// and the site name print raw, so a legacy reference reaches the page as written; `site.identity` stores the site name
// with `<` and `>` taken out and its references read. Invented values on the real JA Boxing kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-memory-site-prints.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoryDoors } from '../domain/write-order-memory-doors.mjs'
import { renderedOf, tagNamesIn, undeclaredIn, valuesOf } from '../domain/write-order-memory-render.mjs'
import { boxingKit } from './fixtures/draft-write/boxing-site.mjs'

const kit = boxingKit()
const blank = () => memoryDoors({ lock: kit.lock, contentMap: kit.blankContract })
const mapping = kit.mapping
const known = valuesOf(blank(), { mapping })
const allowed = tagNamesIn(renderedOf(blank(), { mapping }))

function withRecords() {
  const memory = blank()
  const { records } = memory.site
  records.article.set(1, {
    id: 1,
    title: 'Morning bouquet',
    metadesc: 'Stems < 5 days old',
    attribs: JSON.stringify({ og_title: 'Fresh <b>stems</b>', 'ft-desc': 'Since &copy 2026' })
  })
  records.menuItem.set(2, { id: 2, title: 'Roses & <i>more</i>', menutype: 'mainmenu', params: '{}' })
  records.module.set(3, { id: 3, module: 'mod_custom', title: 'Our team ©', params: '{}', content: '' })
  return memory
}

test('an escaped place prints escaped; the main menu title twice; with no mapping every value prints raw', () => {
  const html = renderedOf(withRecords(), { known, mapping })
  assert.ok(html.includes('Stems &lt; 5 days old'))
  assert.ok(html.includes('Fresh &lt;b&gt;stems&lt;/b&gt;'))
  assert.ok(html.includes('Roses &amp; &lt;i&gt;more&lt;/i&gt;'))
  assert.ok(html.includes('Roses &amp;amp; &amp;lt;i&amp;gt;more&amp;lt;/i&amp;gt;'))
  assert.deepEqual(undeclaredIn(html, allowed), [])
  const raw = renderedOf(withRecords(), { known: valuesOf(blank()) })
  assert.ok(undeclaredIn(raw, allowed).some((f) => f.what === 'tag' && f.name === 'b'))
})

test('an article attribs key and a module title print raw: a legacy reference reaches the page as written', () => {
  const html = renderedOf(withRecords(), { known, mapping })
  // A browser shows `&copy 2026` printed raw as the sign: the write escapes the `&` at such a place.
  assert.ok(html.includes('>Since &copy 2026<'))
  assert.ok(html.includes('>Our team ©<'))
})

test('site.identity stores the site name with < and > taken out and its references read', async () => {
  const memory = blank()
  await memory.doors.identity({
    applyId: 'a1',
    fields: { sitename: 'Larkspur <b>Blooms</b> &amp; co', MetaDesc: 'a < b' }
  })
  const got = await memory.doors.readIdentity()
  assert.equal(got.sitename, 'Larkspur bBlooms/b & co')
  assert.equal(got.MetaDesc, 'a < b')
})
