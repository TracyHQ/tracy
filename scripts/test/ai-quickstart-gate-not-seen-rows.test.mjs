// Why a written value no page shows (ticket #586, slice B gate fault G10): a site-wide copy (a masthead) holds rows
// keyed to the pages they show on (`menuitem_config.item_id[i]` names the page of row `i`). A row's value is judged on
// the page its row names, not on the page whose block created the copy. Invented write plan and pages.
import assert from 'node:assert/strict'
import test from 'node:test'
import { codeOf, textMarker } from '../ai-quickstart/gate/marker-codec.mjs'
import { notSeenOf } from '../ai-quickstart/gate/not-seen.mjs'

const [A, B] = [3, 4].map(codeOf)
const at = (field, i) => ({ entity: 'module-9', column: 'params', jsonPath: ['rows', field, i] })
const plan = {
  ops: [
    {
      key: 'copy:site.block-9',
      kind: 'module.copy',
      values: [
        { loc: at('title', 0), value: textMarker(A), entry: 'news.news-b5.pages.1.title' },
        { loc: { ...at('item_id', 0), jsonPath: ['rows', 'item_id', 0, 0] }, value: { ref: 'page:about' } },
        { loc: at('title', 1), value: textMarker(B), entry: 'news.news-b5.pages.2.title' },
        { loc: { ...at('item_id', 1), jsonPath: ['rows', 'item_id', 1, 0] }, value: { ref: 'page:news' } }
      ]
    }
  ]
}
const page = (pageType, html) => ({ pageType, html, theme: 'light', width: 1440 })

test('G10: a keyed row of a site-wide copy is judged on the page its row names', () => {
  const out = notSeenOf({
    writePlan: plan,
    registry: [],
    seen: new Set(),
    // The masthead prints on about (module 201) without row 0; the news page does not print it at all.
    renders: [page('about', '<div id="Mod201"></div>'), page('news', '<main></main>')],
    ids: { 'copy:site.block-9': 201 }
  })
  const by = Object.fromEntries(out.map((n) => [n.code, n]))
  assert.equal(by[A].page, 'about')
  assert.equal(by[A].reason, 'block_printed_without_value')
  assert.equal(by[B].page, 'news')
  assert.equal(by[B].reason, 'block_not_printed')
})
