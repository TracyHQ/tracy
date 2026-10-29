// Spec TracyHQ/tracy#189, stat and fact boxes (COO rule of 29/10/2026): an emptied box never stays as a hole.
//   - a LONE emptied fact block (no sibling of its shape) is hidden, as repeated ones are
//   - an emptied box among the photos of a grid is shown as an owner photo (a tile), so the grid keeps its shape
//   - the leftovers module goes to a position every served page prints, never one only a dialog of one page shows
// Two invented trades on two invented template shapes: a bakery gallery with a stat box, a dental clinic treatment card
// with an emptied fact row. All names and files are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leftoverHeadBlock } from '../../../packages/wo/website-opportunities/domain/outside-map.mjs'
import { emptyFrameSelectors, emptyFramesOf, photoTiles } from '../src/sites/brief-engines/empty-frames.js'
import { marksOf, writeHeadModule } from '../src/sites/brief-engines/joomla-head-module.js'

const photo = (c) => `/images/tracy-content/${c.repeat(64)}.jpg`

/** A bakery gallery: four photos and one stat box whose words were emptied. */
const bakeryGallery = `<html><body><div id="Mod30"><div class="gallery"><div class="grid">
<div class="tile sizer"></div>
<div class="tile"><a href="${photo('a')}"><img src="${photo('a')}" alt=""></a></div>
<div class="tile"><a href="${photo('b')}"><img src="${photo('b')}" alt=""></a></div>
<div class="tile"><div class="stat-box bg-dark">

</div></div>
<div class="tile"><a href="${photo('c')}"><img src="${photo('c')}" alt=""></a></div>
</div></div></div>
<footer><img src="${photo('d')}" alt="Our shop"></footer></body></html>`

/** A dental clinic treatment card: a description and ONE fact row whose values were emptied (the icon is drawn by CSS). */
const clinicCard = `<html><body><div id="care"><article class="treatment"><div class="content">
<h3>Gentle check-ups</h3><p>Unhurried check-ups for the whole family.</p>
<div class="extra-facts"><div class="facts-inner"><div class="row"><div class="col"><div class="fact"><div class="fact-inner">
</div></div></div></div></div></div>
</div></article></div>
<div class="later-filled"><div class="slot"></div></div>
<script>jQuery(function($){ $('.later-filled').append('<p>x</p>') })</script>
</body></html>`

test('clinic: a lone emptied fact row is hidden; a box a page script fills is left alone', () => {
  const found = emptyFrameSelectors(clinicCard)
  assert.equal(found.length, 1)
  assert.match(
    found[0],
    /^#care > article\.treatment:nth-child\(1\) > div\.content:nth-child\(1\) > div\.extra-facts/
  )
  assert.ok(!found.some((s) => s.includes('later-filled')))
})

test('a lone element with a link, an icon or text, or one beside nothing, is never a frame', () => {
  assert.deepEqual(
    emptyFrameSelectors(
      '<body><div id="x"><p>Words</p><div class="share"><a href="#"><i></i></a></div></div></body>'
    ),
    []
  )
  assert.deepEqual(
    emptyFrameSelectors('<body><div id="x"><div class="wrap"><div class="inner"></div></div></div></body>'),
    []
  )
  assert.deepEqual(
    emptyFrameSelectors(
      '<body><div id="x"><p>Words</p><div class="title-deco"><svg></svg></div></div></body>'
    ),
    []
  )
})

test('bakery: the emptied box among the photos of a grid is a tile, painted inside, with a photo not of its grid', () => {
  const { hide, tiles } = emptyFramesOf(bakeryGallery)
  assert.deepEqual(hide, [])
  assert.equal(tiles.length, 1)
  assert.match(tiles[0].selector, /div\.tile:nth-child\(4\)$/)
  assert.match(tiles[0].target, /div\.tile:nth-child\(4\) > div\.stat-box\.bg-dark:nth-child\(1\)$/)
  const painted = photoTiles([bakeryGallery])
  assert.deepEqual(
    painted.map((t) => t.picture),
    [photo('d').slice(1)]
  )
  // A cut-out's clear picture is never taken, and with no photo left the tile is not painted (it is hidden instead).
  assert.deepEqual(photoTiles([bakeryGallery], { skip: [photo('d')] }), [])
  assert.equal(emptyFrameSelectors(bakeryGallery).length, 1)
})

test('the head block shows the tile as a cover-cropped owner photo and hides its empty words', () => {
  const [tile] = photoTiles([bakeryGallery])
  const block = leftoverHeadBlock({ tiles: [tile] })
  assert.ok(
    block.includes(`${tile.target}{background:url("/${tile.picture}") center / cover no-repeat !important;`)
  )
  assert.ok(block.includes('aspect-ratio:4 / 3'))
  assert.ok(block.includes(`${tile.target} > *{display:none !important}`))
  assert.ok(!block.includes(`${tile.selector}{display:none`))
})

/** A Joomla site behind the Apply door with a map module (assigned everywhere, printed by one dialog) and a footer one. */
function site(own = null) {
  const modules = [
    {
      id: 64,
      module: 'mod_custom',
      published: 1,
      position: 'map',
      note: '',
      content: '<iframe src="https://maps.example/x"></iframe>'
    },
    {
      id: 68,
      module: 'mod_custom',
      published: 1,
      position: 'copyright',
      note: '',
      content: '<p>Copyright Brightwater Dental 2026</p>'
    },
    ...(own ? [own] : [])
  ]
  const writes = []
  const apply = async ({ action, params }) => {
    if (action === 'content.list') return { ok: true, items: (params.offset ?? 0) === 0 ? modules : [] }
    if (action === 'content.get' && params.kind === 'moduleAssignment')
      return { ok: true, item: { menuids: '[0]' } }
    if (action === 'content.update') {
      writes.push({ kind: params.kind, id: params.id, fields: params.fields })
      return { ok: true, ...(params.id === undefined ? { id: 900 } : {}) }
    }
    return { ok: false, error: 'unknown' }
  }
  return { apply, writes }
}
const home = '<body><main>Home</main><footer><p>Copyright Brightwater Dental 2026</p></footer></body>'
const contact =
  '<body><div class="modal"><iframe src="https://maps.example/x"></iframe></div><footer><p>Copyright Brightwater Dental 2026</p></footer></body>'
const BLOCK = '<!-- tracy-leftovers --><style data-tracy-leftovers>a{}</style><!-- /tracy-leftovers -->'

test('the leftovers module goes to the position every served page prints, not the first one assigned everywhere', async () => {
  const s = site()
  await writeHeadModule({
    apply: s.apply,
    siteKey: 'k',
    block: BLOCK,
    applyId: 'a',
    note: () => {},
    pages: [home, contact]
  })
  assert.equal(s.writes.find((w) => w.kind === 'module').fields.position, 'copyright')
  assert.ok(
    marksOf({ id: 68, content: '<p>Copyright Brightwater Dental 2026</p>' }).includes(
      'Copyright Brightwater Dental 2026'
    )
  )
})

test('a block already written in a position a page does not print is moved', async () => {
  const s = site({
    id: 92,
    module: 'mod_custom',
    published: 1,
    position: 'map',
    note: 'tracy-leftovers',
    content: BLOCK
  })
  await writeHeadModule({
    apply: s.apply,
    siteKey: 'k',
    block: BLOCK,
    applyId: 'a',
    note: () => {},
    pages: [home, contact]
  })
  assert.deepEqual(s.writes, [
    { kind: 'module', id: 92, fields: { content: BLOCK, published: 1, position: 'copyright' } }
  ])
  // Printed on every page already: nothing to write.
  const shown = site({
    id: 92,
    module: 'mod_custom',
    published: 1,
    position: 'copyright',
    note: 'tracy-leftovers',
    content: BLOCK
  })
  await writeHeadModule({
    apply: shown.apply,
    siteKey: 'k',
    block: BLOCK,
    applyId: 'a',
    note: () => {},
    pages: [home + BLOCK, contact + BLOCK]
  })
  assert.deepEqual(shown.writes, [])
})
