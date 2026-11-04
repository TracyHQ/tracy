// Every link that comes from DATA goes through the link gate (PAGE-4): a slide, a button, a card, a category, a Portable Text
// link. The rich-text half (`src/lib/data-links.ts`) runs here; the components are held at the SOURCE, since no Astro
// renderer runs in this package's node tests (the rendered pages are walked in the end-to-end run on a built site, DECISIONS D60).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gateBlocks, linkHrefs } from '../src/lib/data-links.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const astroFiles = (dir) =>
  readdirSync(path.join(ROOT, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`
    return statSync(path.join(ROOT, rel)).isDirectory()
      ? astroFiles(rel)
      : rel.endsWith('.astro')
        ? [rel]
        : []
  })

const link = (key, href) => ({ _key: key, _type: 'link', href })
const para = (...spans) => ({
  _type: 'block',
  markDefs: spans.flatMap((s) => (s.def ? [s.def] : [])),
  children: spans.map((s) => ({ _type: 'span', text: s.text, marks: s.def ? [s.def._key] : [] }))
})

test('a Portable Text link to an unticked page loses its mark, the words stay; the others are untouched', () => {
  const value = [
    para(
      { text: 'Book on the ' },
      { text: 'menu page', def: link('a', '/menu') },
      { text: ' or ' },
      { text: 'Google', def: link('b', 'https://example.com/menu') }
    ),
    para({ text: 'Nested', def: link('c', '/menu/simple-menu') }),
    { _type: 'quote', paragraphs: [para({ text: 'quoted', def: link('d', '/menu') })] }
  ]
  assert.deepEqual(linkHrefs(value), ['/menu', 'https://example.com/menu', '/menu/simple-menu', '/menu'])
  const live = (u) => !u.startsWith('/menu')
  const out = gateBlocks(value, live)
  assert.deepEqual(
    linkHrefs(out),
    ['https://example.com/menu'],
    'only the external link is left, nested quote included'
  )
  assert.equal(out[0].children.map((c) => c.text).join(''), 'Book on the menu page or Google')
  assert.deepEqual(out[0].children[1].marks, [])
  assert.deepEqual(out[0].children[3].marks, ['b'])
  assert.deepEqual(out[2].paragraphs[0].children[0].marks, [])
  assert.deepEqual(
    gateBlocks(value, () => true),
    value,
    'nothing dead: the same blocks'
  )
})

// every component that draws a link from data, and what it must do with a dead one
const GATED = {
  'src/components/site/Header.astro': [/pruneMenu\(chrome\.primary, live\)/],
  'src/components/sections/Slideshow.astro': [/s\.slide_link && live\(s\.slide_link\)/],
  'src/components/sections/HappyHours.astro': [/entry\.hp_link_text && live\(entry\.hp_link\)/],
  'src/components/sections/Stats.astro': [/entry\.button_title && live\(entry\.button_link\)/],
  'src/components/sections/FeaturesCollage.astro': [/it\.btn_value && live\(it\.btn_link\)/],
  'src/components/sections/FeaturesIntro.astro': [/liveBlocks\(/, /button && link && live\(link\.href\)/],
  'src/components/sections/Reservation.astro': [
    /liveBlocks\(/,
    /b\.button_label && live\(b\.button_link\)/,
    /r\.online_button && live\(r\.online_link\)/
  ],
  'src/components/sections/Contact.astro': [/liveBlocks\(/],
  'src/components/sections/Categories.astro': [/live\(`\/\$\{c\.slug\}`\) \?/],
  'src/components/sections/Sidebar.astro': [
    /categories\.filter\(\(c\) => live\(/,
    /banner\.button_label && live\(banner\.button_link\)/
  ],
  'src/views/Home.astro': [/liveBlocks\(Astro\.request, locale, stampBlocks\(\$hero/, /livePosts\(/],
  'src/views/Post.astro': [/liveBlocks\(Astro\.request, locale, stampBlocks\(\$post/, /livePosts\(/],
  'src/views/Page.astro': [/liveBlocks\(Astro\.request, locale, stampBlocks\(\$page/],
  'src/views/BlogList.astro': [/livePosts\(/],
  'src/views/Search.astro': [/livePosts\(/]
}
// files with an href the gate does not need to see, and why
const UNGATED = {
  'src/components/sections/GalleryStrip.astro':
    'its albums come from livePosts (Home.astro) and its link goes to the Gallery they hang under',
  'src/components/site/Footer.astro':
    'the map link and the contact lines are external, tel: or mailto: values',
  'src/components/site/Pager.astro': 'its own page numbers: ?page=n of the page being drawn',
  'src/components/site/PostCard.astro': 'its post comes from livePosts, whichever list draws the card',
  'src/views/Gallery.astro': 'album links under the Gallery page, which is 404 itself when Gallery is off',
  'src/views/NotFound.astro': 'the way back to the front page',
  'src/layouts/Base.astro': 'the skip link to #main'
}

test('every component that draws a link from data goes through the gate', () => {
  for (const [file, patterns] of Object.entries(GATED)) {
    const text = read(file)
    assert.match(text, /@\/lib\/(link-gate|menu-gate)/, `${file} imports the gate`)
    for (const re of patterns) assert.match(text, re, `${file}: ${re}`)
  }
})

test('a new component with an href is either gated or named, with the reason, as not needing the gate', () => {
  const unknown = astroFiles('src')
    .filter((f) => /\bhref=\{/.test(read(f)))
    .filter((f) => !(f in GATED) && !(f in UNGATED))
  assert.deepEqual(unknown, [], 'gate it (link-gate.ts) or add it to UNGATED with the reason')
  for (const file of Object.keys(UNGATED)) assert.ok(read(file).length > 0, file)
})
