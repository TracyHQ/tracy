// Three ways a translated page or a blocks-mode page lost content on the way to the site
// (wp-tracy-business, full-1, 15/09): a card anchor read as a call to action (four buttons under
// "Other projects"), a RU section typed by its words where the EN twin is a plain text block
// («Информация…» matched `форм`, and the investor page grew a request form), and a picture
// inside a core/html block that no image table listed (the style guide's three 404 frames).
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { extractMain, sectionFields, sectionItems } from '../lib/html-content.mjs'
import { pairTwinSections } from '../ingest/from-html.mjs'
import { collectImages } from '../seed.mjs'

const sectionOf = (html) => new JSDOM(`<body><main><section>${html}</section></main></body>`).window.document.querySelector('section')

test('sectionFields: a card drawn as one anchor is an item, a label anchor is a CTA', () => {
  const el = sectionOf(`<h2>Other projects</h2>
    <div>
      <a href="#"><div><img src="/img/a.png" alt=""></div><div>Elektra plant, Lipetsk SEZ</div><div>62,000 m² · 2025</div></a>
      <a href="#"><div><img src="/img/b.png" alt=""></div><div>Vorsino IP, phase 3</div><div>48 ha · 2024</div></a>
      <a href="#"><div><img src="/img/c.png" alt=""></div><div>110 kV Obninsk-2 substation</div><div>Utilities · 2024</div></a>
    </div>
    <a href="/projects"><span>All projects</span> <span>→</span></a>`)
  const found = sectionItems(el)
  const fields = sectionFields(el, { itemElements: found.elements })
  assert.deepEqual(fields.ctas, [{ text: 'All projects →', href: '/projects' }])
  // A row of report links — anchor around two divs, no items found — is still not a CTA list.
  const rows = sectionOf(`<h2>Reports</h2><div>
    <a href="#"><div><div>Annual report 2025</div><div>PDF · 6.4 MB</div></div><div>↓</div></a>
    <a href="#"><div><div>IFRS statements 2025</div><div>PDF · 2.1 MB</div></div><div>↓</div></a></div>`)
  assert.deepEqual(sectionFields(rows, { itemElements: [] }).ctas, [])
})

test('pairTwinSections: by data-dc-tpl root id when every section carries one, else by position', () => {
  const s = (id, tpl, type) => ({ id, index: 1, type, title: id, html: tpl ? `<section data-dc-tpl="${tpl}"><h2>x</h2></section>` : '<section><h2>x</h2></section>' })
  const en = [s('ir-en-1', '10', 'text'), s('ir-en-2', '11', null), s('ir-en-3', '12', 'stats')]
  const ru = [s('ir-ru-1', '10', 'form'), s('ir-ru-2', '12', 'stats'), s('ir-ru-3', '11', 'slide')]
  assert.deepEqual(pairTwinSections(ru, en).map(([m, t]) => `${m.id}→${t.id}`), ['ir-ru-1→ir-en-1', 'ir-ru-2→ir-en-3', 'ir-ru-3→ir-en-2'])
  const plainRu = [s('a', null, 'form'), s('b', null, null)]
  const plainEn = [s('c', null, 'text'), s('d', null, null)]
  assert.deepEqual(pairTwinSections(plainRu, plainEn).map(([m, t]) => `${m.id}→${t.id}`), ['a→c', 'b→d'])
  // A different split pairs nothing: the classifier's answer stands.
  assert.deepEqual(pairTwinSections(plainRu, [plainEn[0]]), [])
})

test('extractMain (blocks mode): every <img> of the page is listed, not only those that became core/image', () => {
  const doc = new JSDOM(`<body><main><h1>Style guide</h1><p>Specimens.</p>
    <div style="display:grid"><div><img src="/wp-content/uploads/gd-1.png" alt="16:9 frame"><span>16:9</span></div>
    <div><img src="/wp-content/uploads/gd-2.png" alt="Logo"><span>Logo</span></div></div></main></body>`).window.document
  const main = extractMain(doc, { idPrefix: 'sg', view: 'page' })
  assert.equal(main.mode, 'blocks')
  assert.deepEqual(main.images.map((i) => `${i.file}|${i.alt}`), ['gd-1.png|16:9 frame', 'gd-2.png|Logo'])
})

test('collectImages: an <img> in page or section markup counts even when no image table lists it', () => {
  const spec = {
    content: {
      posts: [],
      pages: [{ images: [], content: '<!-- wp:html --><div><img src="/wp-content/uploads/gd-1.png" alt="16:9 frame"></div><!-- /wp:html -->' }],
      categories: [],
      images: [{ src: '/wp-content/uploads/gd-1.png', file: 'gd-1.png', original: 'img/gd-1.png', alt: '16:9 frame' }, { src: '/wp-content/uploads/gd-3.png', file: 'gd-3.png', original: 'img/gd-3.png', alt: 'Portrait' }]
    },
    sections: { custom: [{ images: [], blocks: '<!-- wp:html --><img src="/wp-content/uploads/gd-3.png" alt=""><!-- /wp:html -->' }], acm: [] }
  }
  assert.deepEqual(collectImages(spec, { types: {} }).map((w) => `${w.key}|${w.alt}`).sort(), ['img/gd-1.png|16:9 frame', 'img/gd-3.png|Portrait'])
})
