// A module printed inside another block with no wrapper of its own is that block's content: in a T4 layout column
// named after its position, or printed by a module whose params name its position. Its icon-only links take the
// address slots of its rows in order. Fabricated rowing club.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { withModulesInside } from '../template-kit/lib/contract-read.mjs'
import { findBlocks } from '../template-kit/lib/find-blocks.js'
import { buildBlock } from '../template-kit/lib/kit-blocks.mjs'
import { assignedAt, indexMap } from '../template-kit/lib/map-index.mjs'
import { sampleIndex } from '../template-kit/lib/sample-index.mjs'

const PAGE = `<!doctype html><html><head><style>
body{margin:0;width:1200px} div,section{display:block} .box{height:120px}
</style></head><body>
<section class="t4-section t4-footer box"><div class="row t4-row">
  <div class="col-sm footer t4-col"><div class="mod-footer">Rowing club 2026</div></div>
  <div class="col-lg-4 footer-r t4-col"><div class="acm-social"><a class="icon" href="#"><span class="fa fa-facebook"></span></a></div></div>
</div></section>
<div id="Mod46" class="box"><div class="acm-features"><h3>Stay connected</h3>
  <div class="social"><div class="acm-social"><a class="icon" href="#"><span class="fa fa-twitter"></span></a></div></div></div></div>
</body></html>`

const ASSIGNED = [
  { entity: 'module-22', position: 'footer' },
  { entity: 'module-63', position: 'footer-r' },
  { entity: 'module-46', position: 'section-8' },
  { entity: 'module-47', position: 'follow', inside: 'module-46' }
]

test('a module in a T4 column inside a block, and a module printed by another, are contained by that block', async (t) => {
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    await page.setContent(PAGE)
    const { blocks } = await page.evaluate(findBlocks, ASSIGNED)
    const by = Object.fromEntries(blocks.map((b) => [b.block, b]))
    assert.equal(by['module-22']?.kind, 'position', 'the footer module is found by its position wrapper')
    assert.deepEqual(by['module-22'].contains, ['module-63'], 'the footer-r column inside it')
    assert.deepEqual(by['module-46'].contains, ['module-47'], 'the module whose position module-46 prints')
    assert.equal(by['module-63'], undefined, 'no block of its own')
  } finally {
    await browser.close()
  }
})

const LOCK = {
  entities: {
    'module-46': {
      published: '1',
      params: JSON.stringify({
        'jatools-config': JSON.stringify({ features: { 'feature-intro[items_position-2]': ['follow'] } })
      })
    },
    'module-47': { published: '1', params: '{"module_tag":"div"}' },
    'module-48': { published: '0', params: '{"position":"news"}' }
  }
}
const MAP = {
  entities: [],
  pages: [
    {
      entity: 'menuItem-101',
      route: 'home',
      assignedModules: [
        { entity: 'module-46', position: 'section-8', published: '1' },
        { entity: 'module-47', position: 'follow', published: '1' },
        { entity: 'module-49', position: 'news', published: '1' },
        { entity: 'module-50', position: 'footer-r', published: '0' }
      ]
    },
    { entity: 'menuItem-102', route: 'about', assignedModules: [{ entity: 'module-47', position: 'follow' }] }
  ]
}

test('a module whose params name a position holds the modules of that position, on the pages it is on', () => {
  const map = withModulesInside(MAP, LOCK)
  assert.deepEqual(
    map.pages[0].assignedModules.map((a) => a.inside ?? null),
    [null, 'module-46', null, null],
    'an unpublished module prints no position'
  )
  assert.equal(map.pages[1].assignedModules[0].inside, undefined, 'module-46 is not on that page')
  assert.equal(withModulesInside(MAP, null), MAP)
  assert.deepEqual(
    assignedAt(indexMap(map), '/').map((a) => a.entity),
    ['module-46', 'module-47', 'module-49'],
    'an unpublished module is no block of the page'
  )
})

const row = (n, type, role, sample) => ({
  key: `module-63.${n}`,
  entity: 'module-63',
  type,
  role,
  sample,
  group: { id: `module-63.social.${n % 4}` }
})
const ICON_MAP = {
  entities: [{ key: 'module-63', kind: 'module', identity: {} }],
  slots: [
    row(0, 'text', 'contact.social_label', ''),
    row(1, 'text', 'contact.social_label', ''),
    row(4, 'url', 'contact.social_url', '#'),
    row(5, 'url', 'contact.social_url', '#')
  ],
  pages: []
}
const icon = (network) => ({ mechanism: 'font-icon', classes: `fa fa-${network}`, title: null })

test('icon-only links take the address slots of the icon-only rows in row order', () => {
  const b = buildBlock({
    rec: {
      id: 'block-22',
      source: 'module-22',
      contains: ['module-63'],
      widths: { 1440: { pages: ['home'], details: { texts: [], links: [], repeats: [] } } }
    },
    entity: 'module-22',
    idx: indexMap(ICON_MAP),
    samples: sampleIndex(ICON_MAP),
    errors: [],
    minEvidence: {},
    linkIcons: [
      { position: 0, label: 'Rowing club', href: 'http://club.example/' },
      { position: 1, label: '', href: '#', icon: icon('facebook') },
      { position: 2, label: '', href: '#', icon: icon('twitter') }
    ],
    siteUrl: 'http://site.example',
    aliasHosts: [],
    widths: ['1440']
  })
  assert.deepEqual(
    b.links.map((l) => l.id),
    ['block-22.link-1', 'block-63.4', 'block-63.5']
  )
})
