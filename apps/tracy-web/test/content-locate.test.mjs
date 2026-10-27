// content.locate (comment → edit, plan P5): which record printed a picked element.
//
// The resolver is driven by the provenance spike's raw data (`packages/ui/tracy-chat-input/test/fixtures/provenance-spike/`,
// Northgate demo content on three dev sites, 27/09/2026): `<cms>-detail.json.gz` is every English
// record as `content.read {id}` answered it, `<cms>-dom[-stamped].json.gz` the visible elements of
// four pages with the render marks (`chain`, innermost first) the spike's plugins printed. The marks
// of each element below are read from that file, never typed here, so a case is exactly what the
// picker would have sent. The EmDash detail predates the `prose` fix (TracyHQ/tch#456): its home-band
// copy is not in the Content API and must answer `unknown`, never a guess.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { writeComponent } from '../src/sites/store.js'
import {
  askHead,
  createLocateStore,
  createSerialGate,
  EMDASH_REBUILD,
  emdashEntryOf,
  fileWhy,
  imageKey,
  INLINE_TAGS,
  indexContents,
  isCutText,
  LEVEL_VALUE_CHARS,
  LOCATE_BATCH,
  locateElement,
  locateQuery,
  locateQueryProblem,
  isDistinctive,
  isWeakString,
  isWeakValue,
  locateReads,
  markOwner,
  notInContentNext,
  normalizeText,
  ownTextOf,
  replaceAtOf,
  roadToolsets
} from '../src/sites/content-locate.js'
import { ALTERNATES_MAX, pagesDocument } from '../src/sites/content-pages.js'
import {
  createStringStore,
  EMDASH_WHY,
  indexStrings,
  markupValuesOf,
  stringEntries
} from '../src/sites/content-strings.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const INPUTS = new URL(
  '../../../packages/ui/tracy-chat-input/test/fixtures/provenance-spike/',
  import.meta.url
)
const load = (name) => JSON.parse(gunzipSync(readFileSync(new URL(name, INPUTS))).toString('utf8'))

/** One CMS of the spike: its index and the picked elements of its four pages. */
function site(cms, domFile) {
  const details = load(`${cms}-detail.json.gz`)
  const siteUrl = new URL(details[0].url).origin
  return { details, siteUrl, index: indexContents(details, { siteUrl }), dom: load(domFile) }
}
const W = site('w', 'w-dom-stamped.json.gz')
const J = site('j', 'j-dom-stamped.json.gz')
const E = site('e', 'e-dom.json.gz')

/** The picker's request for the element on `path` whose own text (or picture) starts with `start`. */
function pick(s, path, start) {
  const bare = (url) => new URL(url).pathname.replace(/\/+$/, '') || '/'
  const page = Object.keys(s.dom).find((url) => bare(url) === (path.replace(/\/+$/, '') || '/'))
  assert.ok(page, `no page ${path}`)
  const element = s.dom[page].find((one) => (one.text ?? one.src ?? '').startsWith(start))
  assert.ok(element, `no element "${start}" on ${path}`)
  return {
    url: page.split('?')[0],
    marks: element.chain ?? [],
    ...(element.kind === 'image' ? { image: { src: element.src } } : { text: element.text })
  }
}

const EDITOR = { content: true, code: false, site: false, lifecycle: false }
const KIND_TOOLSET = { article: 'content', menuItem: 'content', module: 'code', post: 'content' }
const mayWriteAs = (perms) => (road) =>
  roadToolsets(road, (kind) => KIND_TOOLSET[kind] ?? 'site').some((set) => Boolean(perms[set]))

const locate = (s, query, perms = EDITOR, platform = null) =>
  locateElement(s.index, query, { mayWrite: mayWriteAs(perms), platform })
const recordOf = (answer) => answer.levels.find((level) => level.kind === 'record')
const titleOf = (s, id) => s.details.find((one) => one.id === id)?.title
const slugOf = (s, id) => s.details.find((one) => one.id === id)?.slug

// ── the text both sides compare ─────────────────────────────────────────────────────────────────

test('own text: an element keeps its words and its inline descendants’, not its blocks’; pictures come out by src', () => {
  const { segments, images } = ownTextOf(
    '<div>Lead <b>bold</b> tail<img src="/a/factory-ru-1-1024x683.png" alt=""><script>x()</script></div><p>A &amp; B&nbsp;C</p>'
  )
  assert.deepEqual(segments, ['bold', 'Lead bold tail', 'A & B C'])
  assert.deepEqual(images, ['/a/factory-ru-1-1024x683.png'])
  assert.equal(normalizeText('  A &amp; B  '), 'a & b')
  assert.equal(
    imageKey('https://x.test/wp-content/uploads/2026/09/factory-ru-1-1024x683.png?v=2'),
    'factory-ru-1'
  )
  assert.equal(imageKey('/img/hero@2x.webp'), 'hero')
})

test('own text follows the picker: a linked title, a linked menu label, a card that stays split', () => {
  const read = (html) => ownTextOf(html).segments
  assert.deepEqual(read('<h2 class="wp-block-post-title"><a href="/x/">Hello Northwind</a></h2>'), [
    'Hello Northwind',
    'Hello Northwind'
  ])
  assert.deepEqual(read('<li><a href="/s/"><span>Services</span></a></li>'), [
    'Services',
    'Services',
    'Services'
  ])
  assert.ok(
    read('<p>Some <strong>bold</strong> words<br>and a<wbr>line</p>').includes('Some bold words and aline')
  )
  assert.deepEqual(read('<div class="card"><h3>T</h3><p>P</p></div>'), ['T', 'P'])
  assert.deepEqual(read('<div>Lead<p>inner</p>tail</div>'), ['inner', 'Lead tail'])
})

test('the resolver splits by the same inline tags the picker reads', async () => {
  const { INLINE_TAGS: page } = await import('../../../packages/cms/tracy-cms-preview/protocol.mjs')
  assert.deepEqual([...INLINE_TAGS], [...page])
})

// ── WordPress, with the render marks of spike round 2 ───────────────────────────────────────────

test('WordPress: the "Services" menu label resolves to the header menu, item field first', () => {
  const query = pick(W, '/', 'Services')
  assert.ok(query.marks.some((mark) => mark.startsWith('ref:68:tracy')))
  const answer = locate(W, query)
  assert.equal(answer.status, 'resolved')
  assert.deepEqual(answer.sources, { value: 'exact', mark: 'confirmed' })
  assert.deepEqual(
    answer.levels.map((level) => level.kind),
    ['field', 'block', 'record']
  )
  assert.equal(answer.levels[0].fieldKey, 'label')
  assert.ok(answer.levels[0].itemId)
  assert.equal(slugOf(W, recordOf(answer).id), 'tracy')
  // The menu sits inside the header template part, which every page shows (19 in this snapshot).
  assert.equal(answer.impact.pages, 19)
  // A menu is a shared part: its record road is `code`, which an editor seat does not hold.
  assert.equal(recordOf(answer).writable, false)
})

test('WordPress: "Sergey Trofimov" — the About page holds it; marks on an article page name the article, which does not', () => {
  const home = locate(
    W,
    pick(W, '/four-common-mistakes-in-heavy-machine-foundation-design', 'Sergey Trofimov')
  )
  // The spike's case: on the article page the value names the About page, the marks name the
  // article's author box, which the Content API does not carry. The machine cannot tell which is
  // wrong: `unconfirmed`.
  assert.equal(home.status, 'unconfirmed')
  assert.deepEqual(home.sources, { value: 'exact', mark: 'coarser' })
  assert.equal(slugOf(W, recordOf(home).id), 'about')
  const about = locate(W, pick(W, '/about', 'Sergey Trofimov'))
  assert.equal(about.status, 'resolved')
  assert.equal(about.sources.mark, 'confirmed')
  assert.equal(slugOf(W, recordOf(about).id), 'about')
  assert.equal(recordOf(about).writable, true, 'a page is content: an editor writes it')
})

test('WordPress: a heading on its own page resolves to that page; a word five parts share stays candidates', () => {
  const heading = locate(W, pick(W, '/about', 'Building Russian industrial'))
  assert.equal(heading.status, 'resolved')
  assert.equal(slugOf(W, recordOf(heading).id), 'about')
  assert.deepEqual(heading.sources, { value: 'exact', mark: 'confirmed' })
  // The words are in two fields of the page (its body and its summary): the record, no field guessed.
  assert.deepEqual(
    heading.levels.map((level) => level.kind),
    ['record']
  )

  // "Company" in the footer: the footer part's mark picks it out of the five footer-company parts…
  const footer = locate(W, pick(W, '/', 'Company'))
  assert.equal(footer.status, 'resolved')
  assert.equal(slugOf(W, recordOf(footer).id), 'footer')
  // …while the category chip on /news carries marks with no owner (a core query block): candidates.
  const company = locate(W, pick(W, '/news', 'Company'))
  assert.equal(company.status, 'candidates')
  assert.equal(company.sources.mark, 'coarser')
  assert.equal(company.levels.length, 0)
  assert.equal(company.candidates.length, 5)
  assert.ok(company.candidates.every((level) => level.contentId && level.label.length <= 80))
})

test('WordPress: an element no record holds is unknown, and a picture is matched by its file name', () => {
  const unknown = locateElement(W.index, { url: `${W.siteUrl}/`, text: 'Expand search field', marks: [] })
  assert.equal(unknown.status, 'unknown')
  assert.deepEqual(unknown.sources, { value: 'none', mark: 'none' })
  assert.deepEqual(unknown.levels, [])
  const factory = {
    url: `${W.siteUrl}/about/`,
    image: { src: `${W.siteUrl}/wp-content/uploads/2026/09/factory-ru-1-1024x640.png` },
    marks: ['post:37:about block:core/image', 'post:37:about block:core/post-content']
  }
  const picture = locateElement(W.index, factory)
  assert.equal(picture.status, 'resolved')
  assert.equal(slugOf(W, recordOf(picture).id), 'about')
  // Five records hold the picture: with no mark the page is no tiebreak, the holders are asked.
  const bare = locateElement(W.index, { ...factory, marks: [] })
  assert.equal(bare.status, 'candidates')
  assert.equal(slugOf(W, bare.candidates[0].contentId), 'about', 'this page first')
})

// ── Joomla, with the render marks of spike round 3 ──────────────────────────────────────────────

test('Joomla: a menu label resolves to its menu item block, the mark outvoting a shared part with the same word', () => {
  const services = locate(J, pick(J, '/en', 'Services'))
  assert.equal(services.status, 'resolved')
  assert.deepEqual(services.sources, { value: 'exact', mark: 'confirmed' })
  assert.equal(titleOf(J, recordOf(services).id), 'Services')
  const block = services.levels.find((level) => level.kind === 'block')
  assert.match(block.label, /menuItem-601\.0/)
  // "Careers" is also a word of the shared Search module on every page; the menu item mark decides.
  const careers = locate(J, pick(J, '/en', 'Careers'))
  assert.equal(careers.status, 'resolved')
  assert.equal(titleOf(J, recordOf(careers).id), 'Careers')
  assert.equal(recordOf(careers).writable, true, 'a menu item is content')
})

test('Joomla: "Hotline" resolves through its {placeholder} to the topbar module, on every page it is shown', () => {
  const answer = locate(J, pick(J, '/en', 'Hotline'))
  assert.equal(answer.status, 'resolved')
  assert.deepEqual(answer.sources, { value: 'placeholder', mark: 'confirmed' })
  assert.match(recordOf(answer).label, /Topbar - Contacts/)
  assert.equal(answer.impact.pages, 22)
  // A module is `code`: an editor sees where it is and that this seat cannot write it.
  assert.equal(recordOf(answer).writable, false)
  assert.equal(recordOf(locate(J, pick(J, '/en', 'Hotline'), { content: true, code: true })).writable, true)
})

test('roads: a contract slot takes the slot’s own toolset — an editor writes a text slot inside a module (27/09)', () => {
  const kindOf = (kind) => KIND_TOOLSET[kind] ?? 'site'
  const road = {
    platform: 'joomla',
    level: /** @type {'field'} */ ('field'),
    record: { id: 'm', type: 'shared', title: 'Topbar' },
    where: { blockKey: 'module-430', blockId: 'b', field: 'content', slotKey: 'module-430.0' }
  }
  // The module itself is code; the slot is a text slot of the contract, so content.
  const textSlot = (key) => (key === 'module-430.0' ? 'content' : 'code')
  assert.deepEqual(roadToolsets(road, kindOf, textSlot), ['content', 'code'])
  assert.equal(
    roadToolsets(road, kindOf, textSlot).some((set) => Boolean(EDITOR[set])),
    true,
    'the editor holds content: the field is writable'
  )
  // A slot the contract does not type as words, a picture or a link stays code, and so does a
  // caller that has no contract to ask.
  assert.deepEqual(
    roadToolsets(road, kindOf, () => 'code'),
    ['code']
  )
  assert.deepEqual(roadToolsets(road, kindOf), ['code'])
  // The record level is never opened by a slot: the module stays code.
  assert.deepEqual(roadToolsets({ ...road, level: 'record' }, kindOf, textSlot), ['code'])
})

test('Joomla: "01" is a weak value — unknown, never a guess', () => {
  const answer = locate(J, pick(J, '/en', '01'))
  assert.equal(answer.status, 'unknown')
  assert.deepEqual(answer.sources, { value: 'weak', mark: 'coarser' })
  assert.deepEqual(answer.levels, [])
})

test('Joomla: site identity printed by a custom module is unconfirmed — a coarse mark, not a contradiction', () => {
  const answer = locate(J, pick(J, '/en', 'sales@northgate-ind.ru'))
  assert.equal(answer.status, 'unconfirmed')
  assert.deepEqual(answer.sources, { value: 'exact', mark: 'coarser' })
  assert.match(recordOf(answer).label, /Site identity/)
})

test('Joomla: with no mark, a headline two records hold through a placeholder is candidates', () => {
  const answer = locate(J, pick(J, '/en/news', 'Northgate Industrial wins'))
  assert.equal(answer.status, 'candidates')
  assert.equal(answer.sources.value, 'placeholder')
  assert.equal(answer.candidates.length, 2)
  // On the article's own page the breadcrumb/article mark picks the article.
  const own = locate(J, pick(J, '/en/news/disclosure/zavolzhye-2-tender', 'Northgate Industrial wins'))
  assert.equal(own.status, 'resolved')
  assert.match(recordOf(own).label, /^article /)
})

// ── EmDash: no marks yet (stage 1), the value index alone ───────────────────────────────────────

test('EmDash: a topbar line resolves to the site chrome field; the home band copy is unknown in this detail file', () => {
  const hotline = locate(E, pick(E, '/', 'Hotline'), EDITOR, 'emdash')
  assert.equal(hotline.status, 'resolved')
  assert.deepEqual(hotline.sources, { value: 'exact', mark: 'none' })
  assert.equal(hotline.levels[0].fieldKey, 'topbar_phone')
  assert.equal(recordOf(hotline).writable, true, 'EmDash entries are written with tracy_emdash: content')
  // Detail read before the `prose` fix (#456): the band copy lives only in the seed.
  const band = locate(E, pick(E, '/', 'Design–build main contractor'), EDITOR, 'emdash')
  assert.equal(band.status, 'unknown')
  assert.equal(band.sources.value, 'none')
})

test('EmDash: page narrowing, shared words and weak numbers', () => {
  const author = locate(
    E,
    pick(E, '/news/four-common-mistakes-in-heavy-machine-foundation-design', 'Sergey Trofimov')
  )
  // The article's author field and the About page's team member hold the name; with no mark the
  // article page is no tiebreak — candidates, the page's own record first.
  assert.equal(author.status, 'candidates')
  assert.equal(author.candidates[0].fieldKey, 'author')
  // "Services" on the home page: the site chrome's footer title and the /services breadcrumb hold
  // it. Before decision 9 the shared chrome won as "on every page" — the drawer menu's false
  // resolve of §5e. With no mark: candidates.
  const footer = locate(E, pick(E, '/', 'Services'))
  assert.equal(footer.status, 'candidates')
  assert.ok(footer.candidates.some((level) => level.fieldKey === 'footer_services_title'))
  // On /services too, ranked page-first.
  const onServices = locate(E, pick(E, '/services', 'Services'))
  assert.equal(onServices.status, 'candidates')
  assert.ok(onServices.candidates.length >= 2 && onServices.candidates.length <= 5)
  const quote = locate(E, pick(E, '/services', 'Request a quote'))
  assert.equal(quote.status, 'candidates')
  assert.equal(locate(E, pick(E, '/', '01')).status, 'unknown')
})

// ── EmDash: marks printed by Tracy's EmDash template (`src/lib/stamps.ts`) ─────────────────────

test('marks: an EmDash mark names the entry by slug, and may name a field or a repeater', () => {
  assert.deepEqual(markOwner('emdash:services_page:01JQ8Z6N3V:services'), { kind: 'slug', slug: 'services' })
  assert.deepEqual(markOwner('emdash:site:01JQ8Z6N3W:site field:quote_label'), {
    kind: 'slug',
    slug: 'site',
    field: 'quote_label'
  })
  assert.deepEqual(markOwner('emdash:site:01JQ8Z6N3W:site block:social'), {
    kind: 'slug',
    slug: 'site',
    block: 'social'
  })
  assert.deepEqual(markOwner('emdash:site:01JQ8Z6N3W:site field:social.handle'), {
    kind: 'slug',
    slug: 'site',
    field: 'social.handle'
  })
  assert.equal(markOwner('emdash:services'), null, 'an EmDash mark names collection, id and slug')
  assert.equal(markOwner('emdash:Services!:01J:x'), null, 'a collection is a lowercase machine name')
})

test('EmDash: the template marks decide what the words alone leave as candidates', () => {
  const page = 'https://gf1410.tracy.site/services'
  const chrome = 'emdash:site:01JSITE:site'
  const services = 'emdash:services_page:01JSVCP:services'
  // "Services" on /services: the page breadcrumb and the footer column title both hold it.
  const breadcrumb = locate(E, {
    url: page,
    text: 'Services',
    marks: [`${services} field:breadcrumb`, chrome]
  })
  assert.equal(breadcrumb.status, 'resolved')
  assert.deepEqual(breadcrumb.sources, { value: 'exact', mark: 'confirmed' })
  assert.equal(slugOf(E, recordOf(breadcrumb).contentId), 'services')
  assert.equal(breadcrumb.levels[0].fieldKey, 'breadcrumb')
  const footer = locate(E, {
    url: page,
    text: 'Services',
    marks: [`${chrome} field:footer_services_title`, chrome]
  })
  assert.equal(footer.status, 'resolved')
  assert.equal(footer.levels[0].fieldKey, 'footer_services_title')
  // The header button: the site chrome's quote label, not the page's own CTA with the same words.
  const quote = locate(E, { url: page, text: 'Request a quote', marks: [`${chrome} field:quote_label`] })
  assert.equal(quote.status, 'resolved')
  assert.equal(quote.levels[0].fieldKey, 'quote_label')
})

test('EmDash: a field mark picks the field when one entry holds the words twice', () => {
  const details = [
    {
      id: 'c-home',
      type: 'page',
      title: 'Home',
      slug: 'home',
      url: 'https://e.test/',
      fields: [
        { key: 'hero_badge', type: 'text', value: 'Since 1994' },
        { key: 'band_text', type: 'text', value: 'Since 1994' }
      ],
      blocks: [
        {
          id: 'b-stats',
          key: 'stats',
          fields: [],
          items: [{ id: 'i-1', fields: [{ key: 'label', type: 'text', value: 'Since 1994' }] }]
        }
      ]
    }
  ]
  const index = indexContents(details, { siteUrl: 'https://e.test' })
  const at = (marks) => locateElement(index, { url: 'https://e.test/', text: 'Since 1994', marks })
  const owner = 'emdash:home:01JHOME:home'
  assert.equal(at([owner]).levels[0].kind, 'record', 'three fields hold it: the entry is as fine as it gets')
  assert.equal(at([`${owner} field:band_text`, owner]).levels[0].fieldKey, 'band_text')
  const row = at([`${owner} field:stats.label`, `${owner} block:stats`, owner])
  assert.equal(row.levels[0].fieldKey, 'label')
  assert.equal(row.levels[0].blockId, 'b-stats')
  // A field the answer does not hold (a portable-text body the Content API leaves unresolved)
  // does not throw the entry away: the entry's own hits stand.
  assert.equal(at([`${owner} field:content`]).status, 'resolved')
})

// ── words with no mark (plan decision 9) ────────────────────────────────────────────────────────

test('no mark: short words equal to a site chrome field are never resolved (§5e, four measured cases)', () => {
  // Measured on r2e2302 (`p6-acceptance.md` §5e): the drawer menu's "Services"/"Contact"/"News" and
  // the language button's "English" carry no mark (EmDash menus are not Content API records; the
  // language name is template text), and each equals one site chrome field that does not print it.
  // The spike's EmDash detail holds the same four values in the same fields. Before decision 9 all
  // four resolved to that field; "Services", "Contact" and "News" have a second holder (a page's
  // breadcrumb or title) that the page narrowing used to set aside because the chrome is shared.
  const expected = {
    Services: ['candidates', 'footer_services_title'],
    Contact: ['candidates', 'footer_contact_title'],
    News: ['candidates', 'key'],
    English: ['unconfirmed', 'language_name']
  }
  for (const [text, [status, field]] of Object.entries(expected)) {
    const answer = locate(E, { url: `${E.siteUrl}/`, text, marks: [] }, EDITOR, 'emdash')
    assert.equal(answer.status, status, text)
    assert.deepEqual(answer.sources, { value: 'exact', mark: 'none' }, text)
    // The chrome field is still named — as the one holder to check, or among the holders to ask.
    const named = status === 'unconfirmed' ? answer.levels : answer.candidates
    assert.ok(
      named.some((level) => level.fieldKey === field),
      `${text}: ${named.map((level) => level.label).join(' | ')}`
    )
  }
})

test('no mark: distinctive words one record holds still resolve; the same words two records hold are candidates', () => {
  assert.equal(isDistinctive('services'), false)
  assert.equal(isDistinctive('12 aug 2026'), false, 'two words, eleven characters')
  assert.equal(isDistinctive('sales@northgate-ind.ru'), false, 'one long word')
  assert.equal(isDistinctive('request a quote'), true)
  assert.equal(isDistinctive('关于我们'), false, 'four characters')
  assert.equal(isDistinctive('北方工业集团设计建造总承包商'), true, 'unspaced script: a character is a word')
  // A long paragraph with no mark, held by one record (WordPress About page): resolved.
  const about = pick(W, '/about', 'Building Russian industrial')
  const bare = locate(W, { ...about, marks: [] })
  assert.equal(bare.status, 'resolved')
  assert.deepEqual(bare.sources, { value: 'exact', mark: 'none' })
  assert.equal(slugOf(W, recordOf(bare).id), 'about')
  // The EmDash topbar line: distinctive, one field of the site chrome.
  const hotline = locate(E, pick(E, '/', 'Hotline'), EDITOR, 'emdash')
  assert.equal(hotline.status, 'resolved')
  // A teaser: the page holds the article's words too. Without a mark the page is no tiebreak.
  const teaser = locateElement(SMALL, { url: 'https://s.test/about', text: 'Our story since 2004' })
  assert.equal(teaser.status, 'candidates')
  assert.deepEqual(
    teaser.candidates.map((level) => level.contentId),
    ['p-1', 'a-1'],
    'this page first'
  )
})

test('no mark vs mark: a menu item mark still resolves the short word the bare value leaves as a question', () => {
  // Joomla: "Services" is a menu item's title. With T4's menu item id on the <li> it resolves…
  const joomla = pick(J, '/en', 'Services')
  assert.ok(
    joomla.marks.some((mark) => mark.startsWith('menuItem:')),
    joomla.marks.join(' | ')
  )
  assert.equal(locate(J, joomla).status, 'resolved')
  // …and with no mark the menu item is one of the holders to ask about, never a pick.
  const bareJ = locate(J, { ...joomla, marks: [] })
  assert.equal(bareJ.status, 'candidates')
  assert.ok(bareJ.candidates.some((level) => titleOf(J, level.contentId) === 'Services'))
  // WordPress: the header menu's `ref:` mark confirms the label.
  const wordpress = pick(W, '/', 'Services')
  assert.equal(locate(W, wordpress).status, 'resolved')
  assert.equal(locate(W, { ...wordpress, marks: [] }).status, 'candidates', 'five parts hold "Services"')
})

test('EmDash: a Portable Text block mark field:<field>.<_key> picks that block, also among repeats', () => {
  // The Content API gives each text block of a Portable Text field its own value `<field>.<_key>`;
  // the template stamps the rendered block with the same key. Two paragraphs with the same words.
  const details = [
    {
      id: 'c-post',
      type: 'article',
      title: 'Tender',
      slug: 'tender',
      url: 'https://e.test/news/tender',
      fields: [
        { key: 'content.k1', type: 'text', value: 'Works start in October.' },
        { key: 'content.k7', type: 'text', value: 'Works start in October.' },
        { key: 'content.k9', type: 'text', value: 'A single paragraph.' }
      ],
      blocks: [
        {
          id: 'b-toc',
          key: 'content',
          fields: [],
          items: [{ id: 'i-1', fields: [{ key: 'k1', type: 'text', value: 'Works start in October.' }] }]
        }
      ]
    }
  ]
  const index = indexContents(details, { siteUrl: 'https://e.test' })
  const owner = 'emdash:posts:01JPOST:tender'
  const at = (text, marks) => locateElement(index, { url: 'https://e.test/news/tender', text, marks })
  const block = at('Works start in October.', [`${owner} field:content.k7`, `${owner} field:content`])
  assert.equal(block.status, 'resolved')
  assert.equal(block.levels[0].kind, 'field')
  assert.equal(block.levels[0].fieldKey, 'content.k7')
  assert.equal(block.levels[0].blockId, undefined, 'a body block is a field of the entry, not a repeater row')
  const single = at('A single paragraph.', [`${owner} field:content.k9`])
  assert.equal(single.levels[0].fieldKey, 'content.k9')
  assert.deepEqual(markOwner(`${owner} field:content.k7`), {
    kind: 'slug',
    slug: 'tender',
    field: 'content.k7'
  })
})

// ── the whole of four pages, pinned at what the spike data gives today ──────────────────────────

/**
 * The share of the distinct elements of a spike site's four pages that resolve to one source, each
 * asked as the picker asks it. A map, never content: every level label is a name.
 */
function coverage(s, strings = null) {
  const counts = {}
  for (const [url, elements] of Object.entries(s.dom)) {
    const seen = new Set()
    for (const one of elements) {
      const key = `${one.kind}\u0000${one.text ?? one.src}`
      if (seen.has(key)) continue
      seen.add(key)
      const query = {
        url: url.split('?')[0],
        marks: one.chain ?? [],
        ...(one.kind === 'image' ? { image: { src: one.src } } : { text: one.text })
      }
      const answer = locateElement(s.index, query, { strings })
      counts[answer.status] = (counts[answer.status] ?? 0) + 1
      for (const level of [...answer.levels, ...(answer.candidates ?? [])])
        assert.ok(level.label.length <= 80)
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return (counts.resolved ?? 0) / total
}

test('WordPress: the topbar "Hotline: <a>phone</a>" paragraph resolves by the words the picker now sends', () => {
  const query = { ...pick(W, '/', 'Hotline'), text: 'Hotline: 8 800 550-67-89' }
  const answer = locate(W, query)
  assert.equal(answer.status, 'resolved')
  assert.equal(answer.sources.value, 'exact')
})

test('coverage on the spike pages: every element answered, and no fewer resolved than measured 27/09', () => {
  // Measured: WordPress 387/459 (marks), Joomla 239/360 (marks), EmDash 272/444 (no marks, old detail).
  // WordPress 383/459 since 27/09 evening: the fixture's texts were captured under the old own-text
  // rule, and the topbar's `<p>Hotline: <a>8 800…</a></p>` (four pages) now indexes as one string,
  // the one today's picker sends — the test below resolves it. No element the picker sends was lost.
  // Decision 9 (words with no mark resolve only when distinctive and held by one record): WordPress
  // unchanged, Joomla 235/360 (four unmarked short words), EmDash 170/444 — its spike pages carry no
  // marks at all, so every short word and every page narrowing became a question.
  assert.ok(coverage(W) >= 0.83)
  assert.ok(coverage(J) >= 0.65)
  assert.ok(coverage(E) >= 0.38)
})

// ── the rules the fixtures cannot show ──────────────────────────────────────────────────────────

/** A three-record site: a page, an article teasered on it, and a header part. */
const SMALL = indexContents(
  [
    {
      id: 'p-1',
      type: 'page',
      slug: 'about',
      url: 'https://s.test/about',
      title: 'About',
      bodyHtml: '<p>Our story since 2004</p>',
      revision: 'r1'
    },
    {
      id: 'a-1',
      type: 'article',
      slug: 'story',
      url: 'https://s.test/news/story',
      title: 'Story',
      summary: 'Our story since 2004',
      revision: 'r1'
    },
    {
      id: 'h-1',
      type: 'shared',
      slug: 'header',
      title: 'Header',
      fields: [
        { key: 'tagline', type: 'text', value: '{site.name} builds plants' },
        { key: 'brand', type: 'text', value: '{site.name}' }
      ],
      revision: 'r1'
    }
  ],
  { siteUrl: 'https://s.test' }
)

test('conflict: the page itself holds the words, but the mark names the other record that holds them too', () => {
  const answer = locateElement(SMALL, {
    url: 'https://s.test/about',
    text: 'Our story since 2004',
    marks: ['post:7:story block:core/post-excerpt']
  })
  assert.equal(answer.status, 'conflict')
  assert.deepEqual(answer.levels, [])
  assert.deepEqual(
    answer.candidates.map((level) => level.contentId),
    ['a-1', 'p-1'],
    'the mark’s record first'
  )
  // Without marks the page does not narrow it (decision 9: the page's copy of the words looks
  // exactly like a teaser of the article); on a third page too they stay candidates.
  assert.equal(
    locateElement(SMALL, { url: 'https://s.test/about', text: 'Our story since 2004' }).status,
    'candidates'
  )
  assert.equal(
    locateElement(SMALL, { url: 'https://s.test/', text: 'Our story since 2004' }).status,
    'candidates'
  )
})

test('placeholders: six fixed characters make a pattern; a bare {site.name} matches nothing', () => {
  const tagline = locateElement(SMALL, { url: 'https://s.test/', text: 'Northgate builds plants' })
  assert.equal(tagline.status, 'resolved')
  assert.equal(tagline.sources.value, 'placeholder')
  assert.equal(locateElement(SMALL, { url: 'https://s.test/', text: 'Northgate' }).status, 'unknown')
})

test('the request: named fields refused, over-long picks cut to the picker’s own limits', () => {
  assert.match(locateQueryProblem({}), /^url must be/)
  assert.match(locateQueryProblem({ url: 'https://s.test/' }), /text .*, image \{src\} or marks/)
  assert.match(locateQueryProblem({ url: 'https://s.test/', text: 'x', body: 1 }), /unknown parameter "body"/)
  assert.match(
    locateQueryProblem({ url: 'https://s.test/', text: 'x', marks: 'part:header' }),
    /^marks must be/
  )
  assert.match(locateQueryProblem({ url: 'https://s.test/', image: { alt: 'x' } }), /^image must be/)
  // A warm names the page only; it still needs the page, and `warm` is a flag, not a word.
  assert.equal(locateQueryProblem({ url: 'https://s.test/', warm: true }), null)
  assert.match(locateQueryProblem({ warm: true }), /^url must be/)
  assert.match(locateQueryProblem({ url: 'https://s.test/', warm: 'yes' }), /^warm must be/)
  assert.match(locateQueryProblem({ url: 'https://s.test/', warm: false }), /text .*, image \{src\} or marks/)
  assert.deepEqual(locateQuery({ url: 'https://s.test/', warm: true }), {
    url: 'https://s.test/',
    marks: [],
    warm: true
  })
  assert.equal(
    locateQueryProblem({
      url: 'https://s.test/',
      image: { src: '/a.png' },
      selector: 'img',
      domPath: 'main > img'
    }),
    null
  )
  const cut = locateQuery({
    url: ' https://s.test/ ',
    text: 'x'.repeat(400),
    marks: Array.from({ length: 20 }, (_, i) => `part:p${i}`)
  })
  assert.equal(cut.url, 'https://s.test/')
  assert.equal(cut.text.length, 300)
  assert.equal(cut.marks.length, 12)
  assert.equal(cut.marks[0], 'part:p0', 'innermost kept')
})

// ── the snapshot store ──────────────────────────────────────────────────────────────────────────

/** A fake site reader over `details`: listing pages of `pageSize`, details by id; `slow` ms each. */
/**
 * `batch`: the reader answers `{ids}` (Claude Cowork plugin for Joomla, since read-perf): at most
 * `fits` contents per answer, the rest `pending`; `whole` ids never fit a batch (read them alone);
 * ids of no detail are `missing`. Without it an `{ids}` read is refused, as an older plugin does.
 */
function reader(
  details,
  { slow = 0, pageSize = 100, failIds = new Set(), batch = false, fits = 100, whole = new Set() } = {}
) {
  const asked = []
  const rows = () =>
    details.map(({ id, type, title, url, locale, revision }) => ({ id, type, title, url, locale, revision }))
  const ask = async (params) => {
    asked.push(params)
    if (slow) await new Promise((resolve) => setTimeout(resolve, slow))
    if (params.ids !== undefined) {
      if (!batch) return { error: { code: 'CONTENT_BAD_QUERY', message: 'Invalid content query' } }
      const contents = []
      const pending = []
      const missing = []
      for (const id of params.ids) {
        const one = details.find((d) => d.id === id)
        if (!one) missing.push(id)
        else if (whole.has(id) || contents.length >= fits) pending.push(id)
        else contents.push({ ...one, detailState: 'complete' })
      }
      return {
        schemaVersion: 'tracy-content/v1',
        contents,
        pagination: { pending, missing, nextCursor: null }
      }
    }
    if (params.id !== undefined) {
      if (failIds.has(params.id)) return null
      const one = details.find((d) => d.id === params.id)
      return one
        ? { schemaVersion: 'tracy-content/v1', contents: [{ ...one, detailState: 'complete' }] }
        : null
    }
    const all = rows()
    const from = params.cursor ? Number(params.cursor) : 0
    const next = from + pageSize < all.length ? String(from + pageSize) : null
    return {
      schemaVersion: 'tracy-content/v1',
      site: { url: 'https://s.test', locales: ['en'], defaultLocale: 'en' },
      contents: all.slice(from, from + pageSize),
      pagination: { nextCursor: next }
    }
  }
  return { ask, asked }
}

const DETAILS = [
  {
    id: 'p-1',
    type: 'page',
    slug: 'about',
    url: 'https://s.test/about',
    title: 'About our company',
    revision: 'r1'
  },
  { id: 'h-1', type: 'shared', slug: 'header', title: 'Main site header', revision: 'r1' },
  {
    id: 'a-1',
    type: 'article',
    slug: 'story',
    url: 'https://s.test/news/story',
    title: 'Our long story',
    revision: 'r1'
  }
]
const input = (ask, extra = {}) => ({
  siteKey: 's.test',
  locale: 'en',
  principalClass: 'seat:x',
  pageUrl: 'https://s.test/about',
  ask,
  ...extra
})

test('snapshot: built within the call, kept whole, then revalidated by revision — only what moved is read again', async () => {
  const details = DETAILS.map((one) => ({ ...one }))
  const site = reader(details)
  const store = createLocateStore()
  const first = await store.snapshotFor(input(site.ask))
  assert.equal(first.incomplete, false)
  assert.equal(
    locateElement(first.index, { url: 'https://s.test/about', text: 'About our company' }).status,
    'resolved'
  )
  assert.equal(site.asked.filter((p) => p.id !== undefined).length, 3)

  site.asked.length = 0
  const again = await store.snapshotFor(input(site.ask))
  assert.equal(again.incomplete, false)
  assert.equal(again.index, first.index, 'nothing moved: the same snapshot')
  assert.deepEqual(
    site.asked,
    [
      { locale: 'en', limit: 100 },
      { type: 'shared', limit: 100 }
    ],
    'the listing walks (the language, then the shared parts without one), no detail'
  )

  details[2] = { ...details[2], title: 'Our longer story', revision: 'r2' }
  details.splice(0, 1)
  site.asked.length = 0
  const moved = await store.snapshotFor(input(site.ask))
  assert.equal(moved.incomplete, false)
  assert.deepEqual(
    site.asked.filter((p) => p.id !== undefined),
    [{ id: 'a-1' }]
  )
  assert.equal(
    locateElement(moved.index, { url: 'https://s.test/news/story', text: 'Our longer story' }).status,
    'resolved'
  )
  assert.equal(
    locateElement(moved.index, { url: 'https://s.test/about', text: 'About our company' }).status,
    'unknown',
    'removed'
  )
})

test('snapshot: a build past the budget answers incomplete, runs on, and is kept only when whole', async () => {
  const site = reader(DETAILS, { slow: 15 })
  const store = createLocateStore({ budgetMs: 20 })
  const early = await store.snapshotFor(input(site.ask))
  assert.equal(early.incomplete, true)
  await new Promise((resolve) => setTimeout(resolve, 120))
  // The build finished whole and was kept: the index it left resolves. The RECHECK that follows is
  // raced against the same budget (28/09), and on this site one listing walk alone outruns 20 ms — so
  // the answer comes from the snapshot, marked `incomplete` because nothing proved it still current.
  const later = await store.snapshotFor(input(site.ask))
  assert.equal(
    locateElement(later.index, { url: 'https://s.test/', text: 'Main site header' }).status,
    'resolved'
  )
  // With a budget the recheck fits in, the listing proves nothing moved and the answer is whole.
  const roomy = createLocateStore({ budgetMs: 5_000 })
  await roomy.snapshotFor(input(site.ask))
  const rechecked = await roomy.snapshotFor(input(site.ask))
  assert.deepEqual([rechecked.incomplete, rechecked.cached], [false, true])

  // A failed detail read is never kept: every call answers incomplete until a build finishes whole.
  const broken = reader(DETAILS, { failIds: new Set(['a-1']) })
  const fresh = createLocateStore()
  assert.equal((await fresh.snapshotFor(input(broken.ask))).incomplete, true)
  broken.asked.length = 0
  assert.equal((await fresh.snapshotFor(input(broken.ask))).incomplete, true)
  assert.ok(
    broken.asked.some((p) => p.id === 'p-1'),
    'built again, not answered from a partial snapshot'
  )
})

/**
 * 🔒 A PICK WAITS ITS OWN BUDGET, NEVER THE SITE'S READ (28/09/2026). A BUILD was raced against
 * `budgetMs`; the RECHECK of a kept snapshot was awaited outright, and every pick shares that one
 * promise. One slow read on the component — the door allows 170 s — held every pick queued behind it
 * for as long as the site took: measured 3,000 ms against a 100 ms budget.
 */
test('🔒 snapshot: a recheck past the budget answers from the snapshot instead of holding the queue', async () => {
  const site = reader(DETAILS)
  const store = createLocateStore({ budgetMs: 100 })
  const built = await store.snapshotFor(input(site.ask))
  assert.equal(built.incomplete, false, 'the build itself was whole')
  // The site now takes far longer than the door's own patience would allow to matter.
  const slow = reader(DETAILS, { slow: 3_000 })
  const started = Date.now()
  const answers = await Promise.all([
    store.snapshotFor(input(slow.ask)),
    store.snapshotFor(input(slow.ask)),
    store.snapshotFor(input(slow.ask))
  ])
  const waited = Date.now() - started
  assert.ok(waited < 1_500, `every pick answered inside its budget, not the read's: ${waited} ms`)
  for (const answer of answers) {
    assert.equal(answer.incomplete, true)
    assert.equal(
      locateElement(answer.index, { url: 'https://s.test/', text: 'Main site header' }).status,
      'resolved',
      'the snapshot it has is still an answer'
    )
  }
})

test('snapshot: the page and shared parts are read first; a listing cut short is never kept; a refusal is handed back', async () => {
  const site = reader(DETAILS)
  await createLocateStore().snapshotFor(input(site.ask, { pageUrl: 'https://s.test/news/story' }))
  assert.deepEqual(
    site.asked.filter((p) => p.id !== undefined).map((p) => p.id),
    ['a-1', 'h-1', 'p-1']
  )
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `r-${i}`,
    type: 'page',
    title: `Record number ${i}`,
    revision: 'r1'
  }))
  const paged = reader(many, { pageSize: 1 })
  const cut = await createLocateStore().snapshotFor(input(paged.ask))
  assert.equal(cut.incomplete, true, 'PAGES_MAX_CALLS reached')
  const refused = await createLocateStore().snapshotFor(
    input(async () => ({ error: { code: 'CONTENT_FORBIDDEN', message: 'no' } }))
  )
  assert.equal(refused.refusal.error.code, 'CONTENT_FORBIDDEN')
})

test('snapshot: older than ten minutes is built again from nothing', async () => {
  let clock = 1_000_000
  const site = reader(DETAILS)
  const store = createLocateStore({ now: () => clock })
  await store.snapshotFor(input(site.ask))
  clock += 10 * 60 * 1000 + 1
  site.asked.length = 0
  await store.snapshotFor(input(site.ask))
  assert.equal(site.asked.filter((p) => p.id !== undefined).length, 3)
})

test('snapshot: calls that overlap share one build, then one revalidation; `cached` says nothing was re-read', async () => {
  const site = reader(DETAILS, { slow: 5 })
  const built = []
  const store = createLocateStore({ onBuilt: (one) => built.push(one) })
  // A warm and the first pick right behind it: one build between them.
  const [warm, pick] = await Promise.all([
    store.snapshotFor(input(site.ask)),
    store.snapshotFor(input(site.ask))
  ])
  assert.equal(warm.incomplete, false)
  assert.equal(warm.cached, false, 'built, not kept')
  assert.equal(pick.index, warm.index)
  assert.equal(site.asked.filter((p) => p.id !== undefined).length, 3, 'each record read once')
  assert.equal(site.asked.filter((p) => p.limit === 100 && p.locale === 'en').length, 1, 'one listing walk')
  assert.equal(built.length, 1, 'one build heard')
  assert.deepEqual({ ...built[0], ms: 0 }, { siteKey: 's.test', locale: 'en', records: 3, kept: true, ms: 0 })

  // Kept: two overlapping calls walk the listing once, and both say it was current.
  site.asked.length = 0
  const again = await Promise.all([store.snapshotFor(input(site.ask)), store.snapshotFor(input(site.ask))])
  assert.deepEqual(
    again.map((one) => one.cached),
    [true, true]
  )
  assert.deepEqual(site.asked, [
    { locale: 'en', limit: 100 },
    { type: 'shared', limit: 100 }
  ])
  // Once it has finished, the next call walks again (single-flight, not a second cache).
  site.asked.length = 0
  assert.equal((await store.snapshotFor(input(site.ask))).cached, true)
  assert.equal(site.asked.length, 2)
  assert.equal(built.length, 1, 'a revalidation is not a build')
})

test('snapshot: a Joomla plugin that reads many ids at once builds the snapshot in one call per batch', async () => {
  const many = Array.from({ length: 5 }, (_, i) => ({
    id: `r-${i}`,
    type: 'page',
    title: `Record number ${i}`,
    url: `https://s.test/r-${i}`,
    revision: 'r1'
  }))
  const site = reader(many, { batch: true })
  const built = await createLocateStore().snapshotFor(input(site.ask, { batch: 2 }))
  assert.equal(built.incomplete, false)
  assert.deepEqual(
    site.asked.filter((p) => p.ids !== undefined || p.id !== undefined),
    [{ ids: ['r-0', 'r-1'] }, { ids: ['r-2', 'r-3'] }, { ids: ['r-4'] }],
    'three batches, no single read'
  )
  assert.equal(
    locateElement(built.index, { url: 'https://s.test/r-4', text: 'Record number 4' }).status,
    'resolved'
  )
})

test('snapshot: an older plugin refuses `ids` — the build reads one id at a time, as before', async () => {
  const site = reader(DETAILS)
  const built = await createLocateStore().snapshotFor(input(site.ask, { batch: 40 }))
  assert.equal(built.incomplete, false)
  const reads = site.asked.filter((p) => p.ids !== undefined || p.id !== undefined)
  assert.deepEqual(reads, [{ ids: ['p-1', 'h-1', 'a-1'] }, { id: 'p-1' }, { id: 'h-1' }, { id: 'a-1' }])
})

test('snapshot: what a batch leaves pending is asked again, and what never fits one is read alone', async () => {
  const many = Array.from({ length: 4 }, (_, i) => ({
    id: `r-${i}`,
    type: 'page',
    title: `Record ${i}`,
    revision: 'r1'
  }))
  const site = reader(many, { batch: true, fits: 2, whole: new Set(['r-1']) })
  const built = await createLocateStore().snapshotFor(input(site.ask, { batch: 40 }))
  assert.equal(built.incomplete, false)
  assert.deepEqual(
    site.asked.filter((p) => p.ids !== undefined || p.id !== undefined),
    [{ ids: ['r-0', 'r-1', 'r-2', 'r-3'] }, { ids: ['r-1', 'r-3'] }, { ids: ['r-1'] }, { id: 'r-1' }]
  )

  // A record that went between the listing and the read leaves the build incomplete, never kept.
  const gone = reader(many, { batch: true })
  const listed = gone.ask
  const store = createLocateStore()
  const vanishing = async (params) =>
    params.ids ? listed({ ids: params.ids.map((id) => (id === 'r-2' ? 'r-gone' : id)) }) : listed(params)
  assert.equal((await store.snapshotFor(input(vanishing, { batch: 40 }))).incomplete, true)
})

test('locateReads: both Claude Cowork plugins read in batches, one call at a time only on Joomla', () => {
  assert.deepEqual(locateReads('joomla'), { concurrency: 1, batch: LOCATE_BATCH })
  assert.deepEqual(locateReads('wordpress'), { concurrency: 4, batch: LOCATE_BATCH })
  assert.deepEqual(locateReads('emdash'), { concurrency: 4, batch: 0 })
  assert.deepEqual(locateReads(undefined), { concurrency: 4, batch: 0 })
})

test('snapshot: WordPress-sized batches — four at a time, a third fitting each answer — read every record', async () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: `w-${i}`,
    type: 'page',
    title: `WordPress record ${i}`,
    url: `https://s.test/w-${i}`,
    revision: 'r1'
  }))
  const site = reader(many, { batch: true, fits: 14 })
  const built = await createLocateStore().snapshotFor(input(site.ask, { batch: 40, concurrency: 4 }))
  assert.equal(built.incomplete, false)
  const reads = site.asked.filter((p) => p.ids !== undefined || p.id !== undefined)
  assert.ok(
    reads.every((p) => p.ids !== undefined),
    'no record is read alone when each answer carries some'
  )
  assert.ok(reads.length <= 8, `60 records at 14 per answer in a handful of calls, not 60 (${reads.length})`)
  assert.equal(
    locateElement(built.index, { url: 'https://s.test/w-59', text: 'WordPress record 59' }).status,
    'resolved'
  )
})

test('snapshot: a revalidation reads what moved in a batch too', async () => {
  const details = DETAILS.map((one) => ({ ...one }))
  const site = reader(details, { batch: true })
  const store = createLocateStore()
  await store.snapshotFor(input(site.ask, { batch: 40 }))
  details[0] = { ...details[0], revision: 'r2' }
  details[2] = { ...details[2], revision: 'r2' }
  site.asked.length = 0
  const moved = await store.snapshotFor(input(site.ask, { batch: 40 }))
  assert.equal(moved.incomplete, false)
  assert.deepEqual(
    site.asked.filter((p) => p.ids !== undefined || p.id !== undefined),
    [{ ids: ['p-1', 'a-1'] }]
  )
})

// ── records no language owns: shared parts in every language's snapshot ────────────────────────

/**
 * A site reader that filters its listing the way the Claude Cowork plugins do (AND of `locale` and
 * `type`; a `locale` filter never lists a record whose locale is null), over one spike detail file.
 */
function filteringReader(s) {
  const asked = []
  const ask = async (params) => {
    asked.push(params)
    if (params.id !== undefined) {
      const one = s.details.find((d) => d.id === params.id)
      return one
        ? { schemaVersion: 'tracy-content/v1', contents: [{ ...one, detailState: 'complete' }] }
        : null
    }
    const rows = s.details
      .filter(
        (d) =>
          (params.locale === undefined || d.locale === params.locale) &&
          (params.type === undefined || d.type === params.type)
      )
      .map(({ id, type, title, url, locale, revision }) => ({ id, type, title, url, locale, revision }))
    return {
      schemaVersion: 'tracy-content/v1',
      site: { url: s.siteUrl },
      contents: rows,
      pagination: { nextCursor: null }
    }
  }
  return { ask, asked }
}

test('snapshot: WordPress template parts and menus carry no locale, and still answer on an English page', async () => {
  const site = filteringReader(W)
  const { index, incomplete } = await createLocateStore().snapshotFor(
    input(site.ask, { siteKey: 'w', locale: 'en-US', pageUrl: `${W.siteUrl}/` })
  )
  assert.equal(incomplete, false)
  // The header part's own words, under its `part:header` mark.
  const address = pick(W, '/', 'Vorsino Industrial Park, Kaluga Region')
  assert.ok(address.marks[0].startsWith('part:header'))
  const inHeader = locateElement(index, address)
  assert.equal(inHeader.status, 'resolved')
  assert.equal(inHeader.sources.mark, 'confirmed')
  assert.equal(slugOf(W, recordOf(inHeader).id), 'header')
  // A navigation label of the header menu (`ref:68:tracy`).
  const nav = locateElement(index, pick(W, '/', 'About'))
  assert.equal(nav.status, 'resolved')
  assert.equal(slugOf(W, recordOf(nav).id), 'tracy')
  // Each record read once, and only this language's pages plus the language-less shared parts.
  const reads = site.asked.filter((p) => p.id !== undefined).map((p) => p.id)
  assert.equal(new Set(reads).size, reads.length)
  const expected = W.details.filter(
    (d) => d.locale === 'en-US' || (d.type === 'shared' && (d.locale ?? null) === null)
  )
  assert.equal(index.meta.size, expected.length)
})

test('snapshot: a Joomla module assigned to every language (locale null) answers, and is not read twice', async () => {
  const site = filteringReader(J)
  const { index, incomplete } = await createLocateStore().snapshotFor(
    input(site.ask, { siteKey: 'j', locale: 'en-GB', pageUrl: `${J.siteUrl}/en` })
  )
  assert.equal(incomplete, false)
  const identity = locateElement(index, pick(J, '/en', 'Northgate Industrial'))
  assert.equal(identity.status, 'resolved')
  assert.match(recordOf(identity).label, /Site identity/)
  // English shared modules come back from both walks; each is read and indexed once.
  const reads = site.asked.filter((p) => p.id !== undefined).map((p) => p.id)
  assert.equal(new Set(reads).size, reads.length)
  assert.equal(
    index.meta.size,
    J.details.filter((d) => d.locale === 'en-GB' || (d.type === 'shared' && d.locale === null)).length
  )
})

// ── marks as the Joomla Claude Cowork plugin prints them ────────────────────────────────────────

test('marks: a Joomla article or category mark may carry its alias; the id decides', () => {
  assert.deepEqual(markOwner('article:550:zavolzhye-2-tender'), { kind: 'block', key: 'article-550' })
  assert.deepEqual(markOwner('article:550'), { kind: 'block', key: 'article-550' })
  assert.deepEqual(markOwner('category:12:news'), { kind: 'block', key: 'category-12' })
  // A link to a tag page (Claude Cowork plugin, category and tag records of their own).
  assert.deepEqual(markOwner('tag:25:factory'), { kind: 'block', key: 'tag-25' })
  assert.deepEqual(markOwner('category:260:disclosure block:mod_breadcrumbs'), {
    kind: 'block',
    key: 'category-260'
  })
  assert.deepEqual(markOwner('module:428 block:mod_custom'), { kind: 'block', key: 'module-428' })
  assert.deepEqual(markOwner('article:550:zavolzhye-2-tender block:mod_articles_news'), {
    kind: 'block',
    key: 'article-550'
  })
  assert.deepEqual(markOwner('menuItem:605'), { kind: 'block', key: 'menuItem-605' })
  assert.equal(markOwner('module:428:alias'), null, 'a module mark carries no alias')

  // The spike's plugin printed `article:550`; the released one prints `article:550:<alias>`.
  const page = '/en/news/disclosure/zavolzhye-2-tender'
  for (const start of ['Contract value RUB 1.2bn', 'Northgate Industrial wins']) {
    const query = pick(J, page, start)
    assert.ok(query.marks.includes('article:550'))
    const bare = locate(J, query)
    const aliased = locate(J, {
      ...query,
      marks: query.marks.map((mark) => mark.replace(/^article:550$/, 'article:550:zavolzhye-2-tender'))
    })
    assert.equal(bare.status, 'resolved')
    assert.equal(aliased.status, 'resolved', start)
    assert.equal(recordOf(aliased).id, recordOf(bare).id)
  }
})

// ── language strings and template files (stage 2) ───────────────────────────────────────────────
//
// The spike indexed the files it read beside the Content API (`inputs/sources.tgz`: the Joomla
// template `tracy_business` with the site's `language/en-GB`, the WordPress theme
// `wp-tracy-business`). The same files, as the host's `/_host/site-files` door hands them over, are
// the fixture here: paths relative to the webroot, text as stored.

/** The regular files of a `.tgz`, by path. Enough of ustar for a fixture, nothing more. */
function untar(gz) {
  const tar = gunzipSync(gz)
  const files = new Map()
  const field = (start, length) =>
    tar
      .subarray(start, start + length)
      .toString('utf8')
      .replace(/\0.*$/s, '')
  for (let at = 0; at + 512 <= tar.length; ) {
    const name = field(at, 100)
    if (name === '') break
    const size = parseInt(field(at + 124, 12).trim() || '0', 8)
    const type = field(at + 156, 1)
    const prefix = field(at + 345, 155)
    if (type === '0' || type === '')
      files.set(prefix ? `${prefix}/${name}` : name, tar.subarray(at + 512, at + 512 + size))
    at += 512 + Math.ceil(size / 512) * 512
  }
  return files
}
const SOURCES = untar(readFileSync(new URL('sources.tgz', INPUTS)))
/** One spike site's files, as the host door answers them (`j/…` → `…`). */
function siteFiles(prefix) {
  const files = []
  for (const [name, bytes] of SOURCES)
    if (name.startsWith(`${prefix}/`) && /\.(php|html|ini|po)$/.test(name))
      files.push({ path: name.slice(prefix.length + 1), text: bytes.toString('utf8') })
  return files
}
const JS = indexStrings(
  stringEntries({ platform: 'joomla', locale: 'en-GB', files: siteFiles('j'), images: [] })
)
const WS = indexStrings(
  stringEntries({ platform: 'wordpress', locale: 'en-US', files: siteFiles('w'), images: [] })
)
const DEVELOPER = { content: true, code: true, site: false, lifecycle: false }

test('coverage with language strings and template files: more of the spike pages resolve, none fewer', () => {
  // Measured 27/09: WordPress 84.3% → 87.1%, Joomla 66.4% → 68.6%. The spike's files are the theme
  // and template only (no core block renderers, no plugins), so the stand gains more (p6-acceptance.md).
  // Decision 9: Joomla 65.3% → 65.8% — its template strings ("Dark", "Light") carry no mark and are
  // short, so they answer `unconfirmed`.
  assert.ok(coverage(W, WS) >= 0.87)
  assert.ok(coverage(J, JS) >= 0.658)
})
const locateWith = (s, strings, query, perms = EDITOR, platform = null) =>
  locateElement(s.index, query, { mayWrite: mayWriteAs(perms), platform, strings })

test('strings: a Joomla template string with no mark names its language key, unconfirmed; the override file is the road', () => {
  const query = pick(J, '/en', 'Dark')
  assert.deepEqual(query.marks, [])
  assert.equal(locate(J, query).status, 'unknown', 'no record holds it')
  const answer = locateWith(J, JS, query, EDITOR, 'joomla')
  // One short word, no mark: the one key is named, and the answer says nothing confirmed it.
  assert.equal(answer.status, 'unconfirmed')
  assert.deepEqual(answer.sources, { value: 'exact', mark: 'none', from: 'strings' })
  const [level] = answer.levels
  assert.equal(level.kind, 'string')
  assert.equal(level.key, 'TPL_TRACY_BUSINESS_THEME_DARK')
  assert.equal(level.file, 'language/en-GB/en-GB.tpl_tracy_business.ini')
  assert.equal(level.id, 'language/en-GB/en-GB.tpl_tracy_business.ini#TPL_TRACY_BUSINESS_THEME_DARK')
  assert.equal(level.override, 'language/overrides/en-GB.override.ini')
  assert.equal(level.writable, false, 'an override is a file write: code')
  assert.equal(locateWith(J, JS, query, DEVELOPER, 'joomla').levels[0].writable, true)
  assert.ok(level.label.length <= 80)
})

test('strings: a label held by a language key AND two header layouts is candidates, never a guess', () => {
  const answer = locateWith(J, JS, pick(J, '/en', 'Switch between light and dark'), EDITOR, 'joomla')
  assert.equal(answer.status, 'candidates')
  const ids = answer.candidates.map((one) => one.id)
  assert.ok(
    ids.includes('language/en-GB/en-GB.tpl_tracy_business.ini#TPL_TRACY_BUSINESS_THEME_TOGGLE_ARIA'),
    ids.join(' ')
  )
  assert.ok(
    ids.some((id) => /^templates\/tracy_business\/html\/layouts\/t4\/block\/header-1\.html:\d+$/.test(id)),
    ids.join(' ')
  )
  assert.ok(ids.some((id) => /header-2\.html:\d+$/.test(id)))
})

test('strings: a module mark owning a language string while the module’s own title holds the words is a conflict', () => {
  // Joomla's breadcrumbs module prints its TITLE as the nav's aria-label, and its language file also
  // says "Breadcrumbs". The mark names the module; the value names the module's record by title and
  // its language file by key. Two roads, one right: the answer asks, it does not choose.
  const query = pick(J, '/en/about', 'Breadcrumbs')
  assert.deepEqual(query.marks, ['module:426 mod:mod_breadcrumbs'])
  const answer = locateWith(J, JS, query, EDITOR, 'joomla')
  assert.equal(answer.status, 'conflict')
  assert.deepEqual(answer.sources, { value: 'exact', mark: 'confirmed', from: 'strings' })
  assert.equal(answer.candidates[0].id, 'language/en-GB/mod_breadcrumbs.ini#MOD_BREADCRUMBS')
  assert.equal(titleOf(J, answer.candidates[1].contentId), 'Breadcrumbs')
})

test('strings: a WordPress block attribute in a theme part resolves when the mark names its block', () => {
  const query = pick(W, '/', 'Resources')
  assert.equal(query.marks[0], 'part:header block:wp-tracy-business/mega-menu')
  const answer = locateWith(W, WS, query, DEVELOPER, 'wordpress')
  assert.equal(answer.status, 'resolved')
  assert.deepEqual(answer.sources, { value: 'exact', mark: 'confirmed', from: 'strings' })
  const [level] = answer.levels
  assert.equal(level.kind, 'file')
  assert.equal(level.file, 'wp-content/themes/wp-tracy-business/parts/header.html')
  assert.match(level.id, /^wp-content\/themes\/wp-tracy-business\/parts\/header\.html:\d+$/)
  assert.equal(level.writable, true, 'the theme is code the developer may edit')
  // Blocks of the single template: the mark's block names the block the words sit in.
  for (const start of ['Tags:', 'Related articles', '← Previous', 'Share on LinkedIn']) {
    const one = locateWith(W, WS, pick(W, '/four-common-mistakes-in-heavy-machine-foundation-design', start))
    assert.equal(one.status, 'resolved', start)
    assert.equal(one.levels[0].file, 'wp-content/themes/wp-tracy-business/templates/single.html', start)
  }
})

test('strings: a theme gettext pattern answers "1 min read"; a mark on another block leaves it unconfirmed', () => {
  const page = '/four-common-mistakes-in-heavy-machine-foundation-design'
  const query = pick(W, page, '1 min read')
  const marked = locateWith(W, WS, query)
  assert.equal(
    marked.status,
    'unconfirmed',
    'the mark names core/post-time-to-read, the words are the theme’s'
  )
  assert.equal(marked.sources.value, 'placeholder')
  const bare = locateWith(W, WS, { ...query, marks: [] })
  assert.equal(bare.status, 'unconfirmed', 'three words, ten characters, no mark')
  assert.equal(bare.levels[0].kind, 'string')
  assert.equal(bare.levels[0].key, '%d min read')
  assert.match(bare.levels[0].id, /^wp-content\/themes\/wp-tracy-business\/inc\/extra\.php:\d+#%d min read$/)
})

test('strings: words a record holds are answered from the record, never from a file', () => {
  const query = pick(W, '/', 'Services')
  const plain = locate(W, query)
  const withStrings = locateWith(W, WS, query)
  assert.deepEqual(withStrings, plain)
})

/** Core block renderers and plugin files: the page's own `wp-includes` and `wp-content/plugins`. */
const CORE = indexStrings(
  stringEntries({
    platform: 'wordpress',
    locale: 'en-US',
    files: [
      {
        path: 'wp-includes/blocks/navigation.php',
        text: "<?php\n$open = 'aria-label=\"' . __( 'Open menu' ) . '\"';\n$close = __( 'Close menu' );"
      },
      {
        path: 'wp-includes/blocks/query-total.php',
        text: "<?php\n$output = sprintf( _n( '%d result found', '%d results found', $max_rows ), $max_rows );"
      },
      { path: 'wp-content/plugins/other/menu.php', text: "<?php echo esc_html__( 'Open menu', 'other' );" }
    ],
    images: ['wp-content/plugins/polylang/flags/us.png', 'wp-content/themes/biz/assets/us.svg']
  })
)
const NONE = indexContents([], { siteUrl: 'https://s.test' })

test('strings: a core block string is found by the block the mark names — and is not the seat’s to edit', () => {
  const OWNER = { content: true, code: true, site: true, lifecycle: true }
  const query = { url: 'https://s.test/', text: 'Open menu', marks: ['ref:68:tracy block:core/navigation'] }
  const answer = locateElement(NONE, query, { strings: CORE, mayWrite: mayWriteAs(OWNER) })
  assert.equal(answer.status, 'resolved')
  assert.equal(answer.levels[0].id, 'wp-includes/blocks/navigation.php:2#Open menu')
  assert.equal(answer.levels[0].writable, false, 'WordPress core: an update overwrites an edit')
  // With no mark, the same words in a plugin make two strings: candidates.
  const bare = locateElement(NONE, { ...query, marks: [] }, { strings: CORE })
  assert.equal(bare.status, 'candidates')
  assert.equal(bare.candidates.length, 2)
  // A plural pattern: the count is generated, the string is not.
  const total = locateElement(
    NONE,
    { url: 'https://s.test/', text: '4 results found', marks: ['post:51:news block:core/query-total'] },
    { strings: CORE }
  )
  assert.equal(total.status, 'resolved')
  assert.equal(total.levels[0].key, '%d result found')
  // A picture a plugin ships, by file name, owned by the plugin's block namespace.
  const flag = locateElement(
    NONE,
    {
      url: 'https://s.test/',
      image: { src: 'https://s.test/wp-content/plugins/polylang/flags/us.png' },
      marks: ['part:header block:polylang/language-switcher']
    },
    { strings: CORE }
  )
  assert.equal(flag.status, 'resolved')
  assert.equal(flag.levels[0].id, 'wp-content/plugins/polylang/flags/us.png')
})

test('strings: a mark owning a string while one record alone holds the words is a conflict, not a choice', () => {
  const index = indexContents(
    [
      {
        id: 'm-1',
        type: 'article',
        slug: 'x',
        url: 'https://s.test/x',
        title: 'Next steps now',
        revision: 'r'
      }
    ],
    { siteUrl: 'https://s.test' }
  )
  const strings = indexStrings(
    stringEntries({
      platform: 'wordpress',
      locale: 'en-US',
      files: [{ path: 'wp-includes/blocks/post-navigation-link.php', text: "<?php __( 'Next steps now' );" }],
      images: []
    })
  )
  const answer = locateElement(
    index,
    { url: 'https://s.test/', text: 'Next steps now', marks: ['post:9:y block:core/post-navigation-link'] },
    { strings }
  )
  assert.equal(answer.status, 'conflict')
  assert.equal(answer.candidates[0].kind, 'string')
  assert.equal(answer.candidates[1].contentId, 'm-1')
})

test('strings: short or numeric words are weak — unknown, never a guess', () => {
  const strings = indexStrings(
    stringEntries({
      platform: 'joomla',
      locale: 'en-GB',
      files: [{ path: 'language/en-GB/joomla.ini', text: 'JALL="All"\nJNUM="01"\n' }],
      images: []
    })
  )
  for (const text of ['All', '01'])
    assert.equal(locateElement(NONE, { url: 'https://s.test/', text }, { strings }).status, 'unknown', text)
})

test('weak values count letters of every script, not ASCII: Cyrillic and Vietnamese words are words', () => {
  // `\W` in a JavaScript pattern is ASCII-only even with `u`: every Russian value used to be "weak".
  const two = ['c-1', 'c-2'] // two holders: the one-short-word rule does not apply
  for (const text of ['проекты', 'новости компании', 'tin tức', 'dự án của chúng tôi']) {
    assert.equal(isWeakValue(NONE, normalizeText(text), two), false, text)
    assert.equal(isWeakString(normalizeText(text)), false, text)
  }
  for (const text of ['—', '01', '· 2025', '(42)', '12.08.2026']) {
    assert.equal(isWeakValue(NONE, normalizeText(text), two), true, text)
    assert.equal(isWeakString(normalizeText(text)), true, text)
  }
  // Length is counted in characters as a reader counts them, so the guard treats every script alike.
  assert.equal(isDistinctive(normalizeText('Наши проекты')), true, 'two words, twelve letters')
  assert.equal(isDistinctive(normalizeText('Dự án mới')), false, 'three words, nine letters')
  // End to end: a Russian heading one page holds resolves; before the fix it was unknown.
  const ru = indexContents(
    [
      {
        id: 'p-ru',
        type: 'page',
        slug: 'o-nas',
        url: 'https://s.test/ru/o-nas',
        title: 'О компании Нортгейт'
      }
    ],
    { siteUrl: 'https://s.test' }
  )
  const answer = locateElement(ru, { url: 'https://s.test/ru/o-nas', text: 'О компании Нортгейт' })
  assert.equal(answer.status, 'resolved')
  assert.equal(answer.sources.value, 'exact')
})

test('strings: a Joomla override replaces the stored words; only the page’s language is read', () => {
  const entries = stringEntries({
    platform: 'joomla',
    locale: 'en-GB',
    files: [
      { path: 'language/en-GB/com_users.ini', text: 'COM_USERS_PROFILE_DEFAULT_LABEL="Edit Your Profile"\n' },
      { path: 'language/ru-RU/com_users.ini', text: 'COM_USERS_PROFILE_DEFAULT_LABEL="Подробности"\n' },
      {
        path: 'language/overrides/en-GB.override.ini',
        text: 'COM_USERS_PROFILE_DEFAULT_LABEL="My account"\n'
      }
    ],
    images: []
  })
  const strings = indexStrings(entries)
  const mine = locateElement(NONE, { url: 'https://s.test/', text: 'My account' }, { strings })
  // Two words, ten characters and no mark: the one key is named, unconfirmed (decision 9).
  assert.equal(mine.status, 'unconfirmed')
  assert.equal(mine.levels[0].id, 'language/overrides/en-GB.override.ini#COM_USERS_PROFILE_DEFAULT_LABEL')
  assert.equal(
    locateElement(NONE, { url: 'https://s.test/', text: 'Edit Your Profile' }, { strings }).status,
    'unknown',
    'overridden'
  )
  assert.equal(
    locateElement(NONE, { url: 'https://s.test/', text: 'Подробности' }, { strings }).status,
    'unknown',
    'another language'
  )
})

// ── EmDash: the template source in the site's container (`/app/src`) ───────────────────────────

/** The EmDash spike's template, as the host door answers it (`e/src/…` → `/app/src/…`). */
function emdashFiles() {
  const files = []
  for (const [name, bytes] of SOURCES)
    if (/^e\/src\/.+(?:\.astro|\.tsx|words\.ts)$/.test(name))
      files.push({ path: `/app${name.slice(1)}`, text: bytes.toString('utf8') })
  return files
}
const ES = indexStrings(stringEntries({ platform: 'emdash', locale: 'en', files: emdashFiles(), images: [] }))
const OWNER = { content: true, code: true, site: true, lifecycle: true }

test('EmDash markup: labels and own words of .astro and .tsx — never the code around them', () => {
  const pagination = markupValuesOf(
    '/app/src/components/site/Pagination.astro',
    SOURCES.get('e/src/components/site/Pagination.astro').toString('utf8')
  )
  assert.deepEqual(
    pagination.map((one) => [one.text, one.line]),
    [
      ['Pagination', 18],
      ['Previous', 20],
      ['Next', 22]
    ],
    'the frontmatter (`const box = …`) and `{expressions}` print nothing of their own'
  )
  const sheet = markupValuesOf(
    '/app/src/components/ui/sheet.tsx',
    [
      "import { useState } from 'react'",
      '// A comment is not a label: <b>Nope</b>',
      "const [q, setQ] = useState<string>('') ; const title = 'Not markup'",
      'export const Close = () => (',
      '  <SheetClose className="x" {...props}>',
      '    <span className="sr-only">Close</span>',
      '    <input aria-label="Filter languages" value={q} />',
      '  </SheetClose>',
      ')'
    ].join('\n')
  )
  assert.deepEqual(
    sheet.map((one) => [one.text, one.line]),
    [
      ['Close', 6],
      ['Filter languages', 7]
    ]
  )
})

test('EmDash dictionary: the page language’s words, a function’s literal as a pattern, the English fallback', () => {
  const file = '/app/src/lib/locale-words.ts'
  const text = SOURCES.get('e/src/lib/locale-words.ts').toString('utf8')
  const en = stringEntries({ platform: 'emdash', locale: 'en', files: [{ path: file, text }] })
  const menu = en.find((one) => one.origin.key === 'en.menu')
  assert.equal(menu.text, 'Menu')
  assert.equal(menu.origin.line, 47)
  assert.ok(
    en.every((one) => one.origin.locale === 'en'),
    'one language'
  )
  assert.ok(
    en.some((one) => one.text === '%d min read'),
    '`${m} min read` is a pattern of a count'
  )
  assert.ok(!en.some((one) => one.origin.key === 'en.date'), 'a date shape is code, not words')
  const vi = stringEntries({ platform: 'emdash', locale: 'vi', files: [{ path: file, text }] })
  assert.ok(vi.some((one) => one.origin.key === 'vi.all' && one.text === 'Tất cả'))
  // A language the file does not spell out reads English, as `wordsOf` does.
  const xx = stringEntries({ platform: 'emdash', locale: 'xx', files: [{ path: file, text }] })
  assert.ok(xx.length > 0 && xx.every((one) => one.origin.locale === 'en'))
  const strings = indexStrings(en)
  const read = locateElement(NONE, { url: 'https://s.test/news/x', text: '4 min read' }, { strings })
  // Three words, ten characters, no mark: the key is named, unconfirmed (decision 9).
  assert.equal(read.status, 'unconfirmed')
  assert.equal(read.levels[0].id, `${file}#en.minRead`)
  // The hole is a count, not any words: a line the view joins from a date, a category and the
  // reading time is not the dictionary's (a looser hole claimed it whole, measured on the spike).
  const joined = locateElement(
    NONE,
    { url: 'https://s.test/news/x', text: '12 Aug 2026 · Communications · 4 min read' },
    { strings }
  )
  assert.equal(joined.status, 'unknown')
  const af = stringEntries({ platform: 'emdash', locale: 'af', files: [{ path: file, text }] })
  assert.ok(af.some((one) => one.origin.key === 'af.minRead' && one.text === '%d min leestyd'))
})

test('EmDash: a template word no record holds names its file and line — and is not a file tool’s to edit', () => {
  const answer = locateElement(
    NONE,
    { url: 'https://s.test/news', text: 'Pagination' },
    { strings: ES, platform: 'emdash', mayWrite: mayWriteAs(OWNER) }
  )
  // One short word with no mark: named, unconfirmed (decision 9) — EmDash template words carry none.
  assert.equal(answer.status, 'unconfirmed')
  assert.deepEqual(answer.sources, { value: 'exact', mark: 'none', from: 'strings' })
  const [level] = answer.levels
  assert.equal(level.kind, 'file')
  assert.equal(level.id, '/app/src/components/site/Pagination.astro:18')
  assert.equal(level.writable, false, 'even for the owner')
  assert.match(level.why, /\/app\/src/)
  const menu = locateElement(
    NONE,
    { url: 'https://s.test/', text: 'Menu' },
    { strings: ES, platform: 'emdash', mayWrite: mayWriteAs(OWNER) }
  ).levels[0]
  assert.equal(menu.kind, 'string')
  assert.equal(menu.id, '/app/src/lib/locale-words.ts#en.menu')
  assert.equal(menu.writable, false)
  assert.ok(menu.label.length <= 80)
})

test('coverage on the EmDash spike pages with the template source: none fewer resolve', () => {
  const before = coverage(E)
  const after = coverage(E, ES)
  // Decision 9: every template word the spike pages show is short and carries no mark, so the
  // template source names them `unconfirmed` and adds no `resolved` (0.63 before the rule).
  assert.ok(after >= before, `${after} >= ${before}`)
  assert.ok(after >= 0.38)
})

test('string store: an EmDash answer from the host is indexed like the others', async () => {
  const store = createStringStore()
  const read = async () => ({
    ok: true,
    status: 200,
    body: {
      platform: 'emdash',
      fingerprint: 'e1',
      files: [
        { path: '/app/src/components/site/Breadcrumb.astro', text: '<nav aria-label="Breadcrumb"></nav>' }
      ],
      images: []
    }
  })
  const { index, incomplete } = await store.stringsFor({ siteKey: 'e', locale: 'en', read })
  assert.equal(incomplete, false)
  assert.equal(
    locateElement(NONE, { url: 'https://s.test/', text: 'Breadcrumb' }, { strings: index }).levels[0].id,
    '/app/src/components/site/Breadcrumb.astro:1'
  )
})

test('string store: read once, revalidated by fingerprint, rebuilt after ten minutes; a failed read is never kept', async () => {
  let clock = 1_000_000
  const calls = []
  let answer = {
    ok: true,
    status: 200,
    body: {
      platform: 'joomla',
      fingerprint: 'f1',
      files: [{ path: 'language/en-GB/x.ini', text: 'X_ONE="Select your language"\n' }],
      images: []
    }
  }
  const read = async (asked) => {
    calls.push(asked)
    return typeof answer === 'function' ? answer(asked) : answer
  }
  const store = createStringStore({ now: () => clock })
  const first = await store.stringsFor({ siteKey: 's', locale: 'en-GB', read })
  assert.equal(first.incomplete, false)
  assert.ok(first.index)
  assert.deepEqual(calls.at(-1), { locale: 'en-GB', known: null })
  answer = { ok: true, status: 200, body: { platform: 'joomla', fingerprint: 'f1', unchanged: true } }
  const second = await store.stringsFor({ siteKey: 's', locale: 'en-GB', read })
  assert.equal(second.index, first.index, 'unchanged: the same index')
  assert.deepEqual(calls.at(-1), { locale: 'en-GB', known: 'f1' })
  // After the maximum age the set is read again from nothing.
  clock += 10 * 60 * 1000 + 1
  answer = { ok: true, status: 200, body: { platform: 'joomla', fingerprint: 'f2', files: [], images: [] } }
  await store.stringsFor({ siteKey: 's', locale: 'en-GB', read })
  assert.deepEqual(calls.at(-1), { locale: 'en-GB', known: null })
  // A failed read: no index, incomplete, and nothing kept.
  answer = { ok: false, status: 0, body: null }
  const failed = await store.stringsFor({ siteKey: 's', locale: 'ru-RU', read })
  assert.deepEqual(failed, { index: null, incomplete: true })
  // A truncated read answers, incomplete, and is not kept.
  answer = {
    ok: true,
    status: 200,
    body: { platform: 'joomla', fingerprint: 'f3', files: [], images: [], truncated: true }
  }
  assert.equal((await store.stringsFor({ siteKey: 's', locale: 'ru-RU', read })).incomplete, true)
  assert.deepEqual(calls.at(-1), { locale: 'ru-RU', known: null })
  // A site with no webroot here (an old host, an EmDash site) has no string source — not incomplete.
  answer = { ok: false, status: 404, body: { code: 'NO_WEBROOT' } }
  assert.deepEqual(await store.stringsFor({ siteKey: 'e', locale: null, read }), {
    index: null,
    incomplete: false
  })
})

// ── through the Apply door (needs TEST_DATABASE_URL) ────────────────────────────────────────────

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'component-actor-test-key'
}

async function seat(pool, siteKey, email, role) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [siteKey, rows[0].id, role]
  )
}

/** A Joomla Claude Cowork plugin serving the spike's Joomla records, recording each request body. */
function joomlaCowork() {
  const bodies = []
  const rows = J.details.map(({ id, type, title, url, locale, revision }) => ({
    id,
    type,
    title,
    url,
    locale,
    revision
  }))
  const hostCalls = []
  const fetchImpl = async (input, init) => {
    // The host holding the webroot: the spike's Joomla files, or `unchanged` for the set it holds.
    if (String(input) === 'http://tracy-host.test/_host/site-files') {
      const asked = JSON.parse(init.body)
      hostCalls.push(asked)
      if (asked.known === 'spike-j')
        return Response.json({ platform: 'joomla', fingerprint: 'spike-j', unchanged: true })
      return Response.json({ platform: 'joomla', fingerprint: 'spike-j', files: siteFiles('j'), images: [] })
    }
    const body = JSON.parse(init.body)
    bodies.push(body)
    const params = body.params
    if (params.id !== undefined)
      return Response.json({
        schemaVersion: 'tracy-content/v1',
        contents: J.details.filter((one) => one.id === params.id)
      })
    return Response.json({
      schemaVersion: 'tracy-content/v1',
      site: { id: 's', url: J.siteUrl, defaultLocale: 'en-GB', locales: ['en-GB', 'ru-RU'] },
      contents:
        params.limit === 1
          ? rows.slice(0, 1)
          : rows.filter((row) => !params.locale || row.locale === params.locale),
      pagination: { limit: params.limit, nextCursor: null, total: rows.length }
    })
  }
  return { bodies, hostCalls, fetchImpl }
}

test(
  'Apply door: an editor seat locates with the relay’s own read, and gets a map and the picked field’s own words, nothing more',
  opts,
  async () => {
    const { pool } = db
    const cowork = joomlaCowork()
    const config = readConfig(env)
    const app = buildApp({
      config,
      pool,
      mail: { send: async () => {} },
      host: { hostCall, hostJob },
      fetchImpl: cowork.fetchImpl
    })
    await pool.query(
      `insert into site (site_key, label, host, platform) values ('lantern.localhost', 'lantern', 'local', 'joomla')`
    )
    await seat(pool, 'lantern.localhost', 'owner@x.y', 'owner')
    await seat(pool, 'lantern.localhost', 'editor@x.y', 'editor')
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    const send = async (email, body) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
          method: 'POST',
          headers: {
            cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(body)
        })
      )

    const query = pick(J, '/en', 'Hotline')
    const res = await send('editor@x.y', { action: 'content.locate', params: { ...query, selector: 'a' } })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'private, no-store')
    const answer = await res.json()
    assert.equal(answer.status, 'resolved')
    assert.equal(answer.incomplete, undefined)
    assert.match(answer.levels.at(-1).label, /Topbar - Contacts/)
    // An editor holds `code` (ADR 0028), so the module's words are writable for it by role.
    assert.equal(answer.levels.at(-1).writable, true, 'an editor writes a module by role')
    // A map and the picked field's own stored words (28/09: every content read is `content`, and
    // the agent writes that field in one call) — no other field of the record, no body travels back.
    assert.equal(answer.levels[0].value, 'Hotline: {contact.phone}')
    assert.doesNotMatch(JSON.stringify(answer), /8 800 550|tb-contacts|<li/)

    // The site was read as content.read under the relay's own principal, one walk in the page's language.
    assert.ok(cowork.bodies.length > 1)
    assert.ok(
      cowork.bodies.every((body) => body.action === 'content.read' && body.contentScope === 'published')
    )
    const principals = new Set(cowork.bodies.map((body) => body.contentPrincipal))
    assert.equal(principals.size, 1)
    assert.match([...principals][0], /^seat:[a-f0-9]{64}$/)
    assert.ok(cowork.bodies.some((body) => body.params.locale === 'en-GB' && body.params.limit === 100))

    // The owner is answered from the same snapshot: one listing walk, no detail read again.
    const before = cowork.bodies.length
    const owner = await (await send('owner@x.y', { action: 'content.locate', params: query })).json()
    assert.equal(owner.levels.at(-1).writable, true)
    assert.equal(cowork.bodies.slice(before).filter((body) => body.params.id !== undefined).length, 0)

    // Words no record holds come from the site's files, read by the host once and revalidated by
    // fingerprint; the answer names the file and key, never the file's words.
    const dark = await (
      await send('editor@x.y', { action: 'content.locate', params: pick(J, '/en', 'Dark') })
    ).json()
    // One short word with no mark: the key is named, unconfirmed (decision 9).
    assert.equal(dark.status, 'unconfirmed')
    assert.equal(dark.incomplete, undefined)
    assert.equal(
      dark.levels[0].id,
      'language/en-GB/en-GB.tpl_tracy_business.ini#TPL_TRACY_BUSINESS_THEME_DARK'
    )
    // A language string is a file write (`code`), which an editor holds since ADR 0028.
    assert.equal(dark.levels[0].writable, true)
    assert.deepEqual(cowork.hostCalls[0], { label: 'lantern', locale: 'en-GB', known: null })
    assert.equal(cowork.hostCalls.at(-1).known, 'spike-j')

    // 27/09/2026: every content read is the `content` toolset, so the editor reads content too.
    const read = await send('editor@x.y', { action: 'content.read', params: { limit: 1 } })
    assert.equal(read.status, 200)

    // A request the resolver cannot use is refused by name, before the site is asked anything.
    const asked = cowork.bodies.length
    const bad = await send('editor@x.y', { action: 'content.locate', params: { text: 'Hotline' } })
    assert.equal(bad.status, 400)
    const refusal = await bad.json()
    assert.equal(refusal.error.code, 'LOCATE_BAD_QUERY')
    assert.match(refusal.error.message, /^url must be/)
    assert.equal(cowork.bodies.length, asked)
  }
)

test(
  'Apply door: on EmDash, content.locate reads through the site’s own reader like content.read',
  opts,
  async () => {
    const { pool } = db
    const readToken = 'ec_pat_' + 'r'.repeat(43)
    const siteCalls = []
    const rows = E.details.map(({ id, type, title, url, locale, revision }) => ({
      id,
      type,
      title,
      url,
      locale,
      revision
    }))
    const fetchImpl = async (input, init) => {
      const at = String(input)
      if (at.startsWith('http://tracy-host.test/')) return Response.json({ token: readToken })
      siteCalls.push({ url: at, init })
      const { params } = JSON.parse(init.body)
      if (params.id !== undefined)
        return Response.json({
          schemaVersion: 'tracy-content/v1',
          contents: E.details.filter((one) => one.id === params.id)
        })
      return Response.json({
        schemaVersion: 'tracy-content/v1',
        site: { url: E.siteUrl, defaultLocale: 'en', locales: ['en'] },
        contents: rows,
        pagination: { nextCursor: null }
      })
    }
    const config = readConfig({ ...env, HOST_NAME: 'local' })
    const app = buildApp({
      config,
      pool,
      mail: { send: async () => {} },
      host: { hostCall, hostJob },
      fetchImpl
    })
    await pool.query(
      `insert into site (site_key, label, host, platform, origin) values ('lantern.localhost', 'lantern', 'local', 'emdash', 'fleet_born')`
    )
    await seat(pool, 'lantern.localhost', 'editor@x.y', 'editor')
    const res = await app.fetch(
      new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
        method: 'POST',
        headers: {
          cookie: `tracy_sess=${await mintSession('editor@x.y', config.sessionSecret)}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'content.locate', params: pick(E, '/', 'Hotline') })
      })
    )
    assert.equal(res.status, 200)
    const answer = await res.json()
    assert.equal(answer.status, 'resolved')
    assert.equal(answer.levels[0].fieldKey, 'topbar_phone')
    assert.equal(answer.levels[0].writable, true)
    assert.ok(siteCalls.length > 0)
    for (const call of siteCalls) {
      assert.equal(new URL(call.url).pathname, '/content.json')
      assert.equal(call.init.headers.authorization, `Bearer ${readToken}`)
      assert.equal(JSON.parse(call.init.body).action, 'content.read')
    }
  }
)

test(
  'Apply door: a site with no content identity yet answers content.locate 200 `unavailable` (warm and pick), not an HTTP error; a real refusal stays one',
  opts,
  async () => {
    const { pool } = db
    let reader = {
      status: 501,
      code: 'CONTENT_ADAPTER_UNSUPPORTED',
      message: 'Content identity is not set up on this site yet.'
    }
    const fetchImpl = async () =>
      Response.json({ error: { code: reader.code, message: reader.message } }, { status: reader.status })
    const config = readConfig(env)
    const app = buildApp({
      config,
      pool,
      mail: { send: async () => {} },
      host: { hostCall, hostJob },
      fetchImpl
    })
    await pool.query(
      `insert into site (site_key, label, host, platform) values ('lantern.localhost', 'lantern', 'local', 'wordpress')`
    )
    await seat(pool, 'lantern.localhost', 'editor@x.y', 'editor')
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'editor@x.y'
    )
    const send = async (params) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
          method: 'POST',
          headers: {
            cookie: `tracy_sess=${await mintSession('editor@x.y', config.sessionSecret)}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ action: 'content.locate', params })
        })
      )
    for (const params of [{ url: `${J.siteUrl}/en`, warm: true }, pick(J, '/en', 'Hotline')]) {
      const res = await send(params)
      assert.equal(res.status, 200, `${params.warm ? 'warm' : 'pick'}: an expected state, not an error`)
      const answer = await res.json()
      assert.equal(answer.status, 'unavailable')
      assert.equal(answer.code, 'CONTENT_ADAPTER_UNSUPPORTED')
      assert.match(answer.message, /not set up/)
      assert.match(answer.next, /content\.replace/)
    }
    // The site's reader refusing the relay is a real refusal (a broken site, `capiel1647`): still 403.
    reader = { status: 403, code: 'CONTENT_FORBIDDEN', message: 'Content access denied.' }
    const refused = await send(pick(J, '/en', 'Hotline'))
    assert.equal(refused.status, 403)
    assert.equal((await refused.json()).error.code, 'CONTENT_FORBIDDEN')
  }
)

test('Apply door: an EmDash site with no reader answers content.locate 200 `unavailable`', opts, async () => {
  const { pool } = db
  // The host hands out no read token: the site has no Content API reader.
  const fetchImpl = async () => Response.json({})
  const config = readConfig({ ...env, HOST_NAME: 'local' })
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  await pool.query(
    `insert into site (site_key, label, host, platform, origin) values ('lantern.localhost', 'lantern', 'local', 'emdash', 'fleet_born')`
  )
  await seat(pool, 'lantern.localhost', 'editor@x.y', 'editor')
  const res = await app.fetch(
    new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
      method: 'POST',
      headers: {
        cookie: `tracy_sess=${await mintSession('editor@x.y', config.sessionSecret)}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ action: 'content.locate', params: pick(E, '/', 'Hotline') })
    })
  )
  assert.equal(res.status, 200)
  const answer = await res.json()
  assert.equal(answer.status, 'unavailable')
  assert.equal(answer.code, 'CONTENT_ADAPTER_UNSUPPORTED')
  assert.match(answer.next, /tracy_emdash/)
})

test(
  'Apply door: a warm builds the snapshot and resolves nothing; overlapping warms share one build; the seat checks are the same',
  opts,
  async () => {
    const { pool } = db
    const cowork = joomlaCowork()
    const config = readConfig(env)
    // The overlap is held, not timed: the build's listing waits until BOTH warms have reached the
    // snapshot store (a call joins a build in flight synchronously, as it enters `snapshotFor`).
    // A delay here once let a slow runner deliver the second warm after the build, `cached: true`
    // (CI, PR #616).
    let entered = 0
    let bothIn = () => {}
    const bothEntered = new Promise((resolve) => {
      bothIn = resolve
    })
    const locateStoreFactory = (options) => {
      const store = createLocateStore(options)
      return {
        ...store,
        snapshotFor: (input) => {
          const answer = store.snapshotFor(input)
          if (++entered === 2) bothIn()
          return answer
        }
      }
    }
    const app = buildApp({
      config,
      pool,
      mail: { send: async () => {} },
      host: { hostCall, hostJob },
      locateStoreFactory,
      fetchImpl: async (at, init) => {
        if (JSON.parse(init.body)?.params?.limit === 100) await bothEntered
        return cowork.fetchImpl(at, init)
      }
    })
    await pool.query(
      `insert into site (site_key, label, host, platform) values ('lantern.localhost', 'lantern', 'local', 'joomla')`
    )
    await seat(pool, 'lantern.localhost', 'owner@x.y', 'owner')
    await seat(pool, 'lantern.localhost', 'editor@x.y', 'editor')
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    const send = async (email, body) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
          method: 'POST',
          headers: {
            cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(body)
        })
      )
    const warm = { action: 'content.locate', params: { url: `${J.siteUrl}/en`, warm: true } }
    const details = () => cowork.bodies.filter((body) => body.params.id !== undefined).length
    const heads = () => cowork.bodies.filter((body) => body.params.limit === 1).length

    // Two warms at once (a double mount, two tabs): one head read, one build, one file read.
    const [first, second] = await Promise.all([send('editor@x.y', warm), send('editor@x.y', warm)])
    assert.equal(first.status, 200)
    assert.equal(first.headers.get('cache-control'), 'private, no-store')
    const answers = [await first.json(), await second.json()]
    for (const answer of answers) {
      assert.deepEqual(Object.keys(answer).sort(), ['cached', 'ms', 'status'])
      assert.equal(answer.status, 'warmed')
      assert.equal(answer.cached, false)
      assert.ok(Number.isInteger(answer.ms) && answer.ms >= 0)
    }
    const rowsInEnglish = J.details.filter((one) => one.locale === 'en-GB').length
    assert.ok(details() >= rowsInEnglish && details() <= J.details.length, 'each record read once')
    assert.equal(new Set(cowork.bodies.map((b) => b.params.id).filter(Boolean)).size, details())
    assert.equal(heads(), 1)
    // The file read is quick here, so the second warm may come after it and revalidate by
    // fingerprint; it is never read whole twice.
    assert.equal(cowork.hostCalls.filter((call) => call.known === null).length, 1)

    // The next warm finds it current: a listing walk, no detail, no head, `cached`.
    const read = details()
    const again = await (await send('editor@x.y', warm)).json()
    assert.equal(again.status, 'warmed')
    assert.equal(again.cached, true)
    assert.equal(details(), read)
    assert.equal(heads(), 1, 'the head is kept too')

    // The pick behind it is answered from that snapshot: no record read again.
    const picked = await (
      await send('editor@x.y', { action: 'content.locate', params: pick(J, '/en', 'Hotline') })
    ).json()
    assert.equal(picked.status, 'resolved')
    assert.equal(details(), read)

    // The same door as a pick: no seat, no warm; a bad flag is refused by name before the site is asked.
    const asked = cowork.bodies.length
    const stranger = await send('stranger@x.y', warm)
    const strangerPick = await send('stranger@x.y', {
      action: 'content.locate',
      params: pick(J, '/en', 'Hotline')
    })
    assert.equal(stranger.status, strangerPick.status)
    assert.notEqual(stranger.status, 200)
    assert.deepEqual(await stranger.json(), await strangerPick.json())
    const bad = await send('editor@x.y', { action: 'content.locate', params: { url: J.siteUrl, warm: 1 } })
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).error.code, 'LOCATE_BAD_QUERY')
    assert.equal(cowork.bodies.length, asked)
  }
)
// ── category and tag records (Claude Cowork plugin for Joomla, content.read beside the slots) ──

test('marks: a category or tag stamp resolves to its own record, over a menu item holding the same word', () => {
  const block = (key, fields) => ({
    id: `b-${key}`,
    key,
    role: null,
    position: 0,
    sharedContentId: null,
    visibility: 'unknown',
    fields,
    items: []
  })
  const field = (key, value) => ({
    key,
    type: 'text',
    value,
    slotKey: null,
    semanticKey: key.split('.').pop()
  })
  const contents = [
    {
      id: 'c-cat',
      type: 'shared',
      title: 'Disclosure',
      slug: 'disclosure',
      url: null,
      blocks: [block('category-260', [{ ...field('category-260.description', ''), type: 'html' }])],
      native: [{ kind: 'category', id: 260 }]
    },
    {
      id: 'c-tag',
      type: 'shared',
      title: 'factory',
      slug: 'factory',
      url: null,
      blocks: [block('tag-25', [{ ...field('tag-25.description', ''), type: 'html' }])],
      native: [{ kind: 'tag', id: 25 }]
    },
    {
      id: 'c-menu',
      type: 'page',
      title: 'Disclosure',
      slug: 'disclosure-page',
      url: 'https://site.test/en/disclosure',
      blocks: [block('menuItem-700.0', [field('menuItem-700.0', 'Disclosure')])],
      native: [{ kind: 'menuItem', id: 700 }]
    }
  ]
  const index = indexContents(contents, { siteUrl: 'https://site.test' })
  const url = 'https://site.test/en/news/disclosure/tender'
  const crumb = locateElement(index, {
    url,
    text: 'Disclosure',
    marks: ['category:260:disclosure block:mod_breadcrumbs', 'module:426 block:mod_breadcrumbs']
  })
  assert.equal(crumb.status, 'resolved')
  assert.equal(crumb.levels.at(-1).id, 'c-cat')
  const tag = locateElement(index, { url, text: 'factory', marks: ['tag:25:factory', 'article:550:tender'] })
  assert.equal(tag.status, 'resolved')
  assert.equal(tag.levels.at(-1).id, 'c-tag')
  // A category mark names a record the menu item's block never owns: the menu item's own mark still
  // picks the menu item when the word sits in a menu.
  const menu = locateElement(index, { url, text: 'Disclosure', marks: ['menuItem:700'] })
  assert.equal(menu.status, 'resolved')
  assert.equal(menu.levels.at(-1).id, 'c-menu')
})

// ── 28/09: containers, text the picker cut, the site head, one line of reads per Joomla site ─────

test('marks only: a picked container with no words and no picture is answered by its innermost mark’s owner', () => {
  // Joomla: the topbar module's own box → the module's shared record, never the pages listing it.
  const hotline = pick(J, '/en', 'Hotline')
  const box = locate(J, { url: hotline.url, text: '', image: null, marks: hotline.marks })
  assert.equal(box.status, 'resolved')
  assert.deepEqual(box.sources, { value: 'none', mark: 'only' })
  assert.deepEqual(
    box.levels.map((level) => level.kind),
    ['record']
  )
  assert.match(recordOf(box).label, /Topbar - Contacts/)
  assert.equal(recordOf(box).writable, false, 'a module is code; the editor is told')
  assert.equal(box.impact.pages, 22)
  // Joomla: a menu item's padding → the menu item's block in its page, innermost first.
  const services = pick(J, '/en', 'Services')
  const item = locate(J, { url: services.url, text: '', marks: services.marks })
  assert.equal(item.status, 'resolved')
  assert.equal(titleOf(J, recordOf(item).id), 'Services')
  assert.match(item.levels.find((level) => level.kind === 'block').label, /menuItem-601\.0/)
  // WordPress: a group of the header template part → the part; a group of the page → the page.
  const topbar = pick(W, '/', 'Hotline:')
  const group = locate(W, { url: topbar.url, text: '', marks: topbar.marks.slice(1) })
  assert.equal(group.status, 'resolved')
  assert.equal(slugOf(W, recordOf(group).id), 'header')
  const band = locate(W, { url: `${W.siteUrl}/`, text: '', marks: ['post:42:home block:core/group'] })
  assert.equal(slugOf(W, recordOf(band).id), 'home')
  // An owner the index does not hold yields to the next mark out; none at all → unknown.
  const outer = locate(J, { url: hotline.url, text: '', marks: ['menuItem:99999', ...hotline.marks] })
  assert.equal(recordOf(outer).id, recordOf(box).id)
  const none = locate(J, { url: hotline.url, text: '', marks: ['module:99999', 'block:core/group'] })
  assert.equal(none.status, 'unknown')
  assert.deepEqual(none.sources, { value: 'none', mark: 'coarser' })
  assert.deepEqual(none.levels, [])
  // One character (an icon's "×") is no words either.
  assert.equal(locate(J, { url: hotline.url, text: '×', marks: hotline.marks }).status, 'resolved')
})

test('marks only: a slug two records share is candidates, this page’s first; an EmDash field mark starts at the field', () => {
  const index = indexContents(
    [
      {
        id: 'e-home',
        type: 'page',
        slug: 'home',
        url: 'https://e.test/',
        title: 'Home',
        fields: [
          { key: 'hero_title', type: 'text', value: 'Plants that last' },
          { key: 'hero_body', type: 'text', value: 'We design and build them.' }
        ]
      },
      { id: 'e-about', type: 'page', slug: 'about', url: 'https://e.test/about', title: 'About' },
      { id: 'e-news', type: 'article', slug: 'about', url: 'https://e.test/news/about', title: 'About us' }
    ],
    { siteUrl: 'https://e.test' }
  )
  const on = (url, marks) => locateElement(index, { url, text: '', marks }, { platform: 'emdash' })
  const field = on('https://e.test/', ['emdash:pages:01J:home field:hero_title'])
  assert.equal(field.status, 'resolved')
  assert.deepEqual(
    field.levels.map((level) => [level.kind, level.fieldKey ?? level.id]),
    [
      ['field', 'hero_title'],
      ['record', 'e-home']
    ]
  )
  assert.deepEqual(
    on('https://e.test/', ['emdash:pages:01J:home']).levels.map((level) => level.kind),
    ['record'],
    'a mark naming the whole entry narrows nothing'
  )
  const twice = on('https://e.test/news/about', ['emdash:posts:01K:about'])
  assert.equal(twice.status, 'candidates')
  assert.deepEqual(
    twice.candidates.map((level) => level.contentId),
    ['e-news', 'e-about']
  )
})

test('the request: a pick with no words and no picture is accepted when it carries marks', () => {
  const url = 'https://s.test/'
  assert.equal(locateQueryProblem({ url, text: '', image: null, marks: ['module:428 mod:mod_custom'] }), null)
  assert.match(locateQueryProblem({ url, text: '', image: null, marks: [] }), /or marks/)
  assert.match(locateQueryProblem({ url, text: ' ', marks: ['  '] }), /or marks/)
  assert.deepEqual(locateQuery({ url, text: '', image: null, marks: ['module:428'] }), {
    url,
    marks: ['module:428']
  })
})

test('a text the picker cut is the start of a longer value, never a value of its own', () => {
  const paragraph = 'Northgate designs and builds heavy industrial plants across Russia and Central Asia. '
    .repeat(5)
    .trim()
  // The picker's form of a text past its limit (tracy-cms-preview `capText`): 299 characters and "…".
  const cut = `${paragraph.slice(0, 299)}…`
  assert.equal(isCutText(cut), true)
  assert.equal(isCutText('Read more…'), false, 'words that really end in "…"')
  const index = indexContents(
    [
      {
        id: 'p-about',
        type: 'page',
        slug: 'about',
        url: 'https://s.test/about',
        title: 'About',
        bodyHtml: `<p>${paragraph}</p>`
      },
      // An excerpt stored whole that ends where the picker cut: looked up whole, it named itself
      // the one record that printed a text it holds only the start of.
      {
        id: 'a-news',
        type: 'article',
        slug: 'news',
        url: 'https://s.test/news/one',
        title: 'News',
        summary: cut
      },
      // The words inside a longer value, not at its start.
      {
        id: 'p-quote',
        type: 'page',
        slug: 'quote',
        url: 'https://s.test/quote',
        title: 'Quote',
        bodyHtml: `<p>As we like to say: ${paragraph}</p>`
      },
      {
        id: 'p-home',
        type: 'page',
        slug: 'home',
        url: 'https://s.test/',
        title: 'Home',
        bodyHtml: '<p>Read more…</p>'
      }
    ],
    { siteUrl: 'https://s.test' }
  )
  const elsewhere = locateElement(index, { url: 'https://s.test/elsewhere', text: cut, marks: [] })
  assert.equal(elsewhere.status, 'candidates')
  assert.equal(elsewhere.sources.value, 'part')
  assert.deepEqual(elsewhere.candidates.map((level) => level.contentId).sort(), ['a-news', 'p-about'])
  // The page's own mark decides between them, as for any words.
  const own = locateElement(index, { url: 'https://s.test/about', text: cut, marks: ['post:7:about'] })
  assert.equal(own.status, 'resolved')
  assert.equal(recordOf(own).id, 'p-about')
  // Words no value begins with are still found inside one, as before.
  const inside = `${`As we like to say: ${paragraph}`.slice(20, 319)}…`
  const quoted = locateElement(index, { url: 'https://s.test/quote', text: inside, marks: [] })
  assert.ok(quoted.candidates.some((level) => level.contentId === 'p-quote'))
  const marked = locateElement(index, { url: 'https://s.test/quote', text: inside, marks: ['post:9:quote'] })
  assert.equal(recordOf(marked).id, 'p-quote')
  // Words that really end in "…" are matched as they stand.
  const more = locateElement(index, { url: 'https://s.test/', text: 'Read more…', marks: [] })
  assert.equal(more.status, 'resolved')
  assert.equal(more.sources.value, 'exact')
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const HEAD = {
  schemaVersion: 'tracy-content/v1',
  site: { url: 'https://s.test', locales: ['en', 'ru'], defaultLocale: 'en' },
  contents: []
}
const BUSY = { error: { code: 'CONTENT_SOURCE_UNAVAILABLE', message: 'Another read is running' } }

test('site head: a read that failed for a moment is asked once more; a refusal is handed back at once', async () => {
  const answers = (...list) => {
    const asked = []
    return {
      asked,
      ask: async (params) => {
        asked.push(params)
        const next = list.shift()
        if (next instanceof Error) throw next
        return next ?? null
      }
    }
  }
  let site = answers(BUSY, HEAD)
  assert.deepEqual(await askHead(site.ask, { retryMs: 1 }), { head: HEAD })
  assert.deepEqual(site.asked, [{ limit: 1 }, { limit: 1 }])
  site = answers(new Error('socket hang up'), HEAD)
  assert.deepEqual(await askHead(site.ask, { retryMs: 1 }), { head: HEAD })
  site = answers(null, BUSY, HEAD)
  assert.deepEqual(await askHead(site.ask, { retryMs: 1 }), { failed: true }, 'asked twice, no more')
  assert.equal(site.asked.length, 2)
  const refusal = { error: { code: 'CONTENT_ADAPTER_UNSUPPORTED', message: 'not set up' } }
  site = answers(refusal)
  assert.deepEqual(await askHead(site.ask, { retryMs: 1 }), { refusal })
  assert.equal(site.asked.length, 1)
})

test('site head: kept for its age, asked once per site at a time, never waited on past the budget', async () => {
  let clock = 1_000
  const store = createLocateStore({ now: () => clock, headMaxAgeMs: 1_000, headRetryMs: 1 })
  let asks = 0
  const ask = async () => {
    asks += 1
    await sleep(5)
    return HEAD
  }
  const both = await Promise.all([store.headFor({ siteKey: 's', ask }), store.headFor({ siteKey: 's', ask })])
  assert.deepEqual(both, [{ head: HEAD }, { head: HEAD }])
  assert.equal(asks, 1, 'a warm and the pick behind it share one read')
  await store.headFor({ siteKey: 's', ask })
  assert.equal(asks, 1, 'kept')
  clock += 1_001
  await store.headFor({ siteKey: 's', ask })
  assert.equal(asks, 2, 'asked again once old')

  // A head slower than the call's budget is `failed` for that call — and kept when it lands.
  const slow = createLocateStore({ budgetMs: 20, headRetryMs: 1 })
  let slowAsks = 0
  const late = async () => {
    slowAsks += 1
    await sleep(60)
    return HEAD
  }
  assert.deepEqual(await slow.headFor({ siteKey: 's', ask: late }), { failed: true })
  await sleep(70)
  assert.deepEqual(await slow.headFor({ siteKey: 's', ask: late }), { head: HEAD })
  assert.equal(slowAsks, 1)
})

test('serial gate: one task at a time per key, in the order asked; a failure does not stop the line', async () => {
  const gate = createSerialGate()
  const log = []
  let running = 0
  let most = 0
  const task =
    (name, ms, fail = false) =>
    async () => {
      running += 1
      most = Math.max(most, running)
      log.push(`start ${name}`)
      await sleep(ms)
      running -= 1
      log.push(`end ${name}`)
      if (fail) throw new Error(name)
      return name
    }
  const results = await Promise.allSettled([
    gate.run('s', task('a', 20)),
    gate.run('s', task('b', 5, true)),
    gate.run('s', task('c', 1))
  ])
  assert.equal(most, 1)
  assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
  assert.deepEqual(
    results.map((one) => one.status),
    ['fulfilled', 'rejected', 'fulfilled']
  )
  // Two sites do not wait on each other.
  most = 0
  await Promise.all([gate.run('x', task('x', 10)), gate.run('y', task('y', 10))])
  assert.equal(most, 2)
})

test('Joomla: a head and two languages’ snapshots read through one line never overlap, and both are kept', async () => {
  /** A reader that, like Joomla's, refuses a read while another one on the site is running. */
  const joomlaLike = () => {
    const inner = reader(DETAILS, { slow: 3 })
    let busy = 0
    let refused = 0
    const ask = async (params) => {
      if (busy > 0) {
        refused += 1
        return BUSY
      }
      busy += 1
      try {
        return await inner.ask(params)
      } finally {
        busy -= 1
      }
    }
    return { ask, refused: () => refused }
  }
  const run = async (lined) => {
    const site = joomlaLike()
    const gate = createSerialGate()
    const ask = lined ? (params) => gate.run('s.test', () => site.ask(params)) : site.ask
    const store = createLocateStore({ headRetryMs: 1 })
    const [head, en, ru] = await Promise.all([
      store.headFor({ siteKey: 's.test', ask }),
      store.snapshotFor(input(ask, { locale: 'en' })),
      store.snapshotFor(input(ask, { locale: 'ru' }))
    ])
    return { head, en, ru, refused: site.refused() }
  }
  const lined = await run(true)
  assert.equal(lined.refused, 0)
  assert.deepEqual(lined.head, { head: lined.head.head })
  assert.equal(lined.en.incomplete, false)
  assert.equal(lined.ru.incomplete, false)
  // The same three at once, not in line: the reader refuses what overlaps.
  const loose = await run(false)
  assert.ok(loose.refused > 0)
  assert.ok(loose.en.incomplete || loose.ru.incomplete)
})

/** The Apply door over `joomlaCowork()`, with `wrap` around its reads: an editor's `send`. */
async function joomlaDoor(pool, cowork, wrap = (fetchImpl) => fetchImpl) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl: wrap(cowork.fetchImpl)
  })
  await pool.query(
    `insert into site (site_key, label, host, platform) values ('lantern.localhost', 'lantern', 'local', 'joomla')`
  )
  await seat(pool, 'lantern.localhost', 'owner@x.y', 'owner')
  await seat(pool, 'lantern.localhost', 'editor@x.y', 'editor')
  await writeComponent(
    pool,
    'lantern.localhost',
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  return async (params) =>
    app.fetch(
      new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
        method: 'POST',
        headers: {
          cookie: `tracy_sess=${await mintSession('editor@x.y', config.sessionSecret)}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'content.locate', params })
      })
    )
}

test(
  'Apply door: a picked container sends marks only — answered by their owner, not refused',
  opts,
  async () => {
    const { pool } = db
    const send = await joomlaDoor(pool, joomlaCowork())
    const hotline = pick(J, '/en', 'Hotline')
    // What the Browser tab sends for a box with no words: `locateParams` of the picked target.
    const res = await send({
      url: hotline.url,
      text: '',
      image: null,
      marks: hotline.marks,
      domPath: 'div.tb-topbar > div.custom',
      selector: 'div.custom'
    })
    assert.equal(res.status, 200)
    const answer = await res.json()
    assert.equal(answer.status, 'resolved')
    assert.deepEqual(answer.sources, { value: 'none', mark: 'only' })
    assert.match(answer.levels.at(-1).label, /Topbar - Contacts/)
    // Nothing at all to go on is still refused by name.
    const empty = await send({ url: hotline.url, text: '', image: null, marks: [] })
    assert.equal(empty.status, 400)
    assert.equal((await empty.json()).error.code, 'LOCATE_BAD_QUERY')
  }
)

test(
  'Apply door: a Joomla head refused twice answers incomplete at once, and builds no all-language snapshot',
  opts,
  async () => {
    const { pool } = db
    const cowork = joomlaCowork()
    let refuseHeads = 2
    const send = await joomlaDoor(pool, cowork, (fetchImpl) => async (at, init) => {
      const body = String(at).includes('/_host/') ? null : JSON.parse(init.body)
      if (body?.params?.limit === 1 && refuseHeads > 0) {
        refuseHeads -= 1
        cowork.bodies.push(body)
        return Response.json(BUSY, { status: 503 })
      }
      return fetchImpl(at, init)
    })
    const hotline = pick(J, '/en', 'Hotline')
    const answer = await (await send(hotline)).json()
    assert.equal(answer.status, 'unknown')
    assert.equal(answer.incomplete, true)
    assert.deepEqual(answer.levels, [])
    assert.equal(cowork.bodies.filter((body) => body.params.limit === 1).length, 2, 'asked twice')
    assert.equal(
      cowork.bodies.filter((body) => body.params.limit === 100).length,
      0,
      'no listing walked: no snapshot of every language'
    )
    // The next pick asks the head again, reads the page's language, and resolves.
    const next = await (await send(hotline)).json()
    assert.equal(next.status, 'resolved')
    assert.equal(next.incomplete, undefined)
    const walks = cowork.bodies.filter((body) => body.params.limit === 100 && body.params.type === undefined)
    assert.ok(walks.length > 0 && walks.every((body) => body.params.locale === 'en-GB'))
  }
)

test(
  'Apply door: a Joomla site’s locates read its component one at a time, across languages',
  opts,
  async () => {
    const { pool } = db
    const cowork = joomlaCowork()
    let running = 0
    let most = 0
    const send = await joomlaDoor(pool, cowork, (fetchImpl) => async (at, init) => {
      if (String(at).includes('/_host/')) return fetchImpl(at, init)
      running += 1
      most = Math.max(most, running)
      try {
        await sleep(2)
        return await fetchImpl(at, init)
      } finally {
        running -= 1
      }
    })
    // Edit turned on in two tabs (English and Russian) and a pick behind them, all at once.
    const [en, ru, picked] = await Promise.all([
      send({ url: `${J.siteUrl}/en`, warm: true }),
      send({ url: `${J.siteUrl}/ru`, warm: true }),
      send(pick(J, '/en', 'Hotline'))
    ])
    assert.deepEqual([en.status, ru.status, picked.status], [200, 200, 200])
    assert.equal((await picked.json()).status, 'resolved')
    assert.ok(
      cowork.bodies.some((body) => body.params.locale === 'ru-RU'),
      'the Russian snapshot was read'
    )
    assert.equal(most, 1, 'never two reads of the component at once')
  }
)

// ── 28/09: the picked field's write target (`at`, `value`, `revision`, `next`) and its twins ──────

/** A seat's roads with the site's contract saying every slot here is a text, image or link slot. */
const withTextSlots = (perms) => (road) =>
  roadToolsets(
    road,
    (kind) => KIND_TOOLSET[kind] ?? 'site',
    () => 'content'
  ).some((set) => Boolean(perms[set]))
const detailOf = (s, id) => s.details.find((one) => one.id === id)

test('Joomla: a picked label names its contract slot as the replace job’s at, its words, revision and the one call', () => {
  const query = pick(J, '/en', 'Careers')
  const answer = locateElement(J.index, query, {
    mayWrite: withTextSlots(EDITOR),
    platform: 'joomla',
    siteLocales: ['en-GB', 'ru-RU']
  })
  assert.equal(answer.status, 'resolved')
  const [field] = answer.levels
  assert.equal(field.kind, 'field')
  assert.equal(field.slotKey, 'menuItem-618.0')
  // The contract engine's unit for a text slot is `at: slot.key` (replace-joomla.mjs `joomlaStore`);
  // the site-tools suite holds the two equal on the engine's own units.
  assert.equal(field.at, 'menuItem-618.0')
  assert.equal(field.value, 'Careers')
  assert.equal(field.valueCut, undefined)
  assert.equal(field.revision, detailOf(J, field.contentId).revision)
  assert.deepEqual(field.next, { tool: 'tracy_site', action: 'content.replace', at: ['menuItem-618.0'] })
  // Its Russian twin, by the CMS's own association, in the site's other language.
  const twin = detailOf(J, recordOf(answer).id).relations.find((one) => one.type === 'translation')
  assert.deepEqual(recordOf(answer).alternates, [{ locale: 'ru-RU', id: twin.contentId }])
  // A seat whose slot road is closed (no contract profile: every slot is `code`) keeps the address
  // and gets no call; a site whose languages Tracy does not know gets no twin's language.
  const closed = locateElement(J.index, query, { mayWrite: mayWriteAs(EDITOR), platform: 'joomla' })
  assert.equal(closed.levels[0].at, 'menuItem-618.0')
  assert.equal(closed.levels[0].next, undefined)
  assert.equal(recordOf(closed).alternates, undefined)
})

test('Joomla: a slot that prints a token hands over its stored words, token and all', () => {
  const answer = locateElement(J.index, pick(J, '/en', 'Hotline'), {
    mayWrite: withTextSlots(EDITOR),
    platform: 'joomla'
  })
  assert.equal(answer.status, 'resolved')
  assert.equal(answer.levels[0].value, 'Hotline: {contact.phone}')
  assert.equal(answer.levels[0].at, 'module-428.1')
})

test('Joomla: a picture slot is written by one contract apply carrying the revision locate read', () => {
  const page = Object.keys(J.dom).find((url) => new URL(url).pathname === '/en')
  const element = J.dom[page].find((one) => one.kind === 'image' && one.src.endsWith('team-crew.png'))
  const answer = locateElement(
    J.index,
    { url: page.split('?')[0], marks: element.chain ?? [], image: { src: element.src } },
    { mayWrite: withTextSlots(EDITOR), platform: 'joomla' }
  )
  assert.equal(answer.status, 'resolved')
  const [field] = answer.levels
  assert.equal(field.at, undefined, 'the replace job places words, not pictures')
  assert.deepEqual(field.next, {
    tool: 'tracy_site',
    action: 'content.contract',
    operation: 'apply',
    changes: { [field.slotKey]: null },
    expected_content_revisions: { [field.contentId]: detailOf(J, field.contentId).revision }
  })
})

test('WordPress: a named block of a page is `post:<id>#<name>`, the body copy of its words set aside', () => {
  // The spike's detail predates `native` (Claude Cowork 0.14.2); the home page's marks name post 42.
  const details = W.details.map((one) =>
    one.slug === 'home' ? { ...one, native: [{ kind: 'post', id: 42 }] } : one
  )
  const index = indexContents(details, { siteUrl: W.siteUrl })
  const query = pick(W, '/', 'Established 2004')
  assert.ok(query.marks[0].startsWith('post:42:home'))
  const answer = locateElement(index, query, { mayWrite: mayWriteAs(EDITOR), platform: 'wordpress' })
  assert.equal(answer.status, 'resolved')
  // The words are in `bodyHtml` (the whole body) and in the named block: the field is the finer name.
  assert.deepEqual(
    answer.levels.map((level) => level.kind),
    ['field', 'block', 'record']
  )
  assert.equal(answer.levels[0].at, 'post:42#hero.eyebrow')
  assert.deepEqual(answer.levels[0].next, {
    tool: 'tracy_site',
    action: 'content.replace',
    at: ['post:42#hero.eyebrow']
  })
  // Without the platform nothing is set aside: the record, as before.
  assert.deepEqual(
    locateElement(index, query, { mayWrite: mayWriteAs(EDITOR) }).levels.map((level) => level.kind),
    ['record']
  )
  // The site tagline is an option, written by a `site` seat only: the address, no call for an editor.
  const tagline = locateElement(index, pick(W, '/', 'Industrial infrastructure'), {
    mayWrite: mayWriteAs(EDITOR),
    platform: 'wordpress'
  })
  assert.equal(tagline.levels[0].at, 'option:blogdescription')
  assert.equal(tagline.levels[0].next, undefined)
  const owner = { content: true, code: true, site: true, lifecycle: true }
  const asOwner = locateElement(index, pick(W, '/', 'Industrial infrastructure'), {
    mayWrite: mayWriteAs(owner),
    platform: 'wordpress'
  })
  assert.deepEqual(asOwner.levels[0].next?.at, ['option:blogdescription'])
})

test('WordPress: a body copy the named block does not account for keeps the record as the answer', () => {
  const page = (bodyHtml) => ({
    id: 'c-home',
    type: 'page',
    title: 'Home',
    slug: 'home',
    url: 'https://w.test/',
    revision: 'r-1',
    native: [{ kind: 'post', id: 42 }],
    bodyHtml,
    blocks: [
      {
        id: 'b-hero',
        key: 'hero',
        fields: [{ key: 'hero.title', type: 'text', value: 'Plants built to last', slotKey: null }],
        items: []
      }
    ]
  })
  const at = (bodyHtml) =>
    locateElement(
      indexContents([page(bodyHtml)], { siteUrl: 'https://w.test' }),
      { url: 'https://w.test/', text: 'Plants built to last', marks: ['post:42:home block:core/heading'] },
      { mayWrite: mayWriteAs(EDITOR), platform: 'wordpress' }
    ).levels[0]
  assert.equal(at('<h1>Plants built to last</h1><p>Other words.</p>').at, 'post:42#hero.title')
  // The same words once more in an unnamed paragraph: the body holds a copy no field names.
  assert.equal(at('<h1>Plants built to last</h1><p>Plants built to last</p>').kind, 'record')
})

test('replaceAtOf: an address only where the engine’s own unit is certain, per CMS', () => {
  const record = (over = {}) => ({
    id: 'c',
    type: 'page',
    title: 't',
    slug: 'home',
    url: null,
    revision: 'r',
    native: [{ kind: 'post', id: 7 }],
    locale: null,
    twins: [],
    keys: new Map([
      ['hero.title', 1],
      ['cta.label', 2]
    ]),
    blockKeys: new Set(),
    shares: new Set(),
    ...over
  })
  const wp = (where, over) => replaceAtOf({ platform: 'wordpress', record: record(over), where })?.at ?? null
  assert.equal(wp({ field: 'title', type: 'text' }), 'post:7.title')
  assert.equal(wp({ field: 'summary', type: 'text' }), 'post:7.excerpt')
  assert.equal(wp({ field: 'hero.title', type: 'text', blockId: 'b' }), 'post:7#hero.title')
  assert.equal(
    wp({ field: 'cta.label', type: 'text', blockId: 'b' }),
    null,
    'a name twice: `.2` is by position'
  )
  assert.equal(wp({ field: 'hero.title', type: 'html', blockId: 'b' }), null, 'words only')
  assert.equal(wp({ field: 'bodyHtml', type: 'html' }), null)
  assert.equal(wp({ field: 'meta.tracy_page_heading', type: 'text' }), null)
  assert.equal(wp({ field: 'hero.title', type: 'text', blockId: 'b' }, { native: null }), null)
  // A menu or a synced pattern (shared, a `post` of its own) and a template part: not derivable.
  assert.equal(wp({ field: 'label', type: 'text', blockId: 'b', itemId: 'i' }, { type: 'shared' }), null)
  assert.equal(
    wp(
      { field: 'hero.title', type: 'text', blockId: 'b' },
      { type: 'shared', native: [{ kind: 'templatePart', key: 'header' }] }
    ),
    null
  )
  assert.equal(
    wp({ field: 'blogname', type: 'text' }, { type: 'shared', slug: null, native: [] }),
    'option:blogname'
  )

  const joomla = (where) => replaceAtOf({ platform: 'joomla', record: record(), where })?.at ?? null
  assert.equal(
    joomla({ field: 'ru-RU::module-441.8', slotKey: 'ru-RU::module-441.8', type: 'text' }),
    'ru-RU::module-441.8'
  )
  assert.equal(joomla({ field: 'module-441.9', slotKey: 'module-441.9', type: 'image' }), null)
  assert.equal(joomla({ field: 'title', type: 'text' }), null, 'a record field no slot names')
  // 01/10/2026: an imported copy's derived slot is no unit of the open Joomla engine — its write is the
  // contract apply (`nextOf`), never a replace pinned to a key the job cannot match (STORE_CHANGED).
  for (const key of [
    'article-12.introtext.0bfa07e1cb',
    'module-17.params.1a2b3c4d5e',
    'menuItem-170.title.da39a3ee5e'
  ])
    assert.equal(joomla({ field: key, slotKey: key, type: 'text' }), null, key)
  assert.equal(
    joomla({ field: 'module-430.0', slotKey: 'module-430.0', type: 'text' }),
    'module-430.0',
    'a quickstart slot'
  )

  const marks = ['emdash:services:01JQ8Z6N3V:home field:intro', 'emdash:pages:01JQ8Z6N3X:about']
  const emdash = (where, over = {}, value = 'Words here') =>
    replaceAtOf({ platform: 'emdash', record: record({ locale: 'en', ...over }), where, value, marks })?.at ??
    null
  assert.equal(emdash({ field: 'intro', type: 'text' }), 'services/home@en#intro')
  assert.equal(
    emdash({ field: 'text', type: 'text', blockId: 'b', blockKey: 'items', itemId: 'i', position: 2 }),
    'services/home@en#items[2].text'
  )
  assert.equal(emdash({ field: 'intro', type: 'text' }, { locale: null }), 'services/home@#intro')
  assert.equal(
    emdash({ field: 'content.k7', type: 'text' }),
    null,
    'a Portable Text block: its index is unknown'
  )
  assert.equal(emdash({ field: 'cta_url', type: 'text' }), null, 'a key the engine never reads as words')
  assert.equal(emdash({ field: 'intro', type: 'text' }, {}, 'https://x.test/a'), null, 'nor a value')
  assert.equal(emdash({ field: 'intro', type: 'text' }, { locale: 'pt-BR' }), null, 'a re-cased locale')
  assert.equal(emdash({ field: 'intro', type: 'text' }, { slug: 'contact' }), null, 'no mark names the entry')
  assert.equal(
    replaceAtOf({
      platform: 'emdash',
      record: record({ locale: 'en' }),
      where: { field: 'intro', type: 'text' },
      value: 'Words',
      marks: [...marks, 'emdash:posts:01JQ8Z6N3Y:home']
    }),
    null,
    'two collections hold the slug'
  )
  assert.deepEqual(emdashEntryOf('emdash:services:01J:home field:intro'), {
    collection: 'services',
    slug: 'home'
  })
  assert.equal(emdashEntryOf('post:42:home'), null)
})

test('value: a field level carries its stored words, cut at the level’s budget and said so', () => {
  const long = `${'Northgate builds plants across Russia and beyond. '.repeat(30)}`.trim()
  const index = indexContents(
    [
      {
        id: 'c-about',
        type: 'page',
        title: 'About',
        slug: 'about',
        url: 'https://s.test/about',
        revision: 'r-9',
        blocks: [
          {
            id: 'b-1',
            key: 'intro',
            fields: [{ key: 'intro.text', type: 'text', value: long, slotKey: 'about.intro.text' }],
            items: []
          }
        ]
      }
    ],
    { siteUrl: 'https://s.test' }
  )
  // The picker cut the paragraph at 300 characters; the level hands the agent the words it holds.
  const cut = `${Array.from(long).slice(0, 299).join('')}…`
  const answer = locateElement(index, { url: 'https://s.test/about', text: cut, marks: [] })
  assert.equal(answer.status, 'resolved')
  const [field] = answer.levels
  assert.equal(Array.from(field.value).length, LEVEL_VALUE_CHARS)
  assert.ok(long.startsWith(field.value))
  assert.equal(field.valueCut, true)
  assert.equal(field.slotKey, 'about.intro.text')
  assert.equal(field.revision, 'r-9')
})

test('twins: named in their language only when it is known — never guessed', () => {
  const page = (id, locale, relations) => ({
    id,
    type: 'page',
    title: `Page ${id}`,
    slug: `p-${id}`,
    url: `https://s.test/${locale}/p`,
    locale,
    translationGroupId: 'g-1',
    revision: 'r',
    relations,
    fields: [{ key: 'lead', type: 'text', value: `Distinctive lead words ${id}`, slotKey: null }]
  })
  const en = page('c-en', 'en-GB', [{ type: 'translation', contentId: 'c-ru' }])
  const record = (details, siteLocales) =>
    locateElement(
      indexContents(details, { siteUrl: 'https://s.test' }),
      { url: 'https://s.test/en-GB/p', text: 'Distinctive lead words c-en', marks: [] },
      { siteLocales }
    ).levels.at(-1)
  // Two languages and one twin: the twin is in the other one.
  assert.deepEqual(record([en], ['en-GB', 'ru-RU']).alternates, [{ locale: 'ru-RU', id: 'c-ru' }])
  // Three languages: which one is not said by the detail, so nothing is.
  assert.equal(record([en], ['en-GB', 'ru-RU', 'de-DE']).alternates, undefined)
  // A twin this snapshot holds (a page of unknown language reads every language) names its own.
  const both = [
    { ...en, relations: [...en.relations, { type: 'translation', contentId: 'c-de' }] },
    page('c-ru', 'ru-RU', []),
    page('c-de', 'de-DE', [])
  ]
  assert.deepEqual(record(both, ['en-GB', 'ru-RU', 'de-DE']).alternates, [
    { locale: 'ru-RU', id: 'c-ru' },
    { locale: 'de-DE', id: 'c-de' }
  ])
  // A group past the cap is left to the record's own relations.
  const many = Array.from({ length: ALTERNATES_MAX + 1 }, (_, i) => page(`c-${i}`, `x${i}`, []))
  assert.equal(
    record(
      [{ ...en, relations: many.map((one) => ({ type: 'translation', contentId: one.id })) }, ...many],
      []
    ).alternates,
    undefined
  )
})

test('roads: the slot road is the slot’s toolset; the replace job’s is its write door on each CMS', () => {
  const road = (over) =>
    roadToolsets(
      {
        platform: 'joomla',
        level: 'replace',
        record: undefined,
        where: { field: 'k', slotKey: 'module-1.0' },
        ...over
      },
      (kind) => ({ post: 'content', option: 'site' })[kind] ?? 'code',
      () => 'content'
    )
  assert.deepEqual(road({}), ['content'])
  assert.deepEqual(road({ level: 'slot' }), ['content'])
  assert.deepEqual(road({ level: 'slot', where: { field: 'k' } }), [])
  assert.deepEqual(road({ platform: 'wordpress', store: 'post' }), ['content'])
  assert.deepEqual(road({ platform: 'wordpress', store: 'option' }), ['site'])
  assert.deepEqual(road({ platform: 'wordpress' }), [])
  assert.deepEqual(road({ platform: 'emdash' }), ['content'])
})

test('strings: a Joomla language string names its override line; a core string says why not; template words their line', () => {
  const joomla = (files) =>
    indexStrings(stringEntries({ platform: 'joomla', locale: 'en-GB', files, images: [] }))
  const ini = {
    path: 'language/en-GB/mod_languages.ini',
    text: 'MOD_LANGUAGES_PICK="Choose your language"\n'
  }
  const query = {
    url: 'https://s.test/',
    text: 'Choose your language',
    marks: ['module:425 block:mod_languages']
  }
  const level = (strings, perms) =>
    locateElement(NONE, query, { strings, mayWrite: mayWriteAs(perms), platform: 'joomla' }).levels[0]
  const fresh = level(joomla([ini]), DEVELOPER)
  assert.equal(fresh.kind, 'string')
  assert.deepEqual(fresh.next, {
    edit: 'language/overrides/en-GB.override.ini',
    write: 'MOD_LANGUAGES_PICK="<new words>"'
  })
  // Overridden already: the override file's own line.
  const overridden = level(
    joomla([
      ini,
      {
        path: 'language/overrides/en-GB.override.ini',
        text: 'X="y"\nMOD_LANGUAGES_PICK="Choose your language"\n'
      }
    ]),
    DEVELOPER
  )
  assert.deepEqual(overridden.next, {
    edit: 'language/overrides/en-GB.override.ini',
    line: 2,
    write: 'MOD_LANGUAGES_PICK="<new words>"'
  })
  // An editor holds no `code`: no call, and no reason either — the file is the site's own.
  const editor = level(joomla([ini]), EDITOR)
  assert.equal(editor.writable, false)
  assert.equal(editor.next, undefined)
  assert.equal(editor.why, undefined)

  // WordPress core prints "Open menu": not writable for anyone, with the reason.
  const OWNER = { content: true, code: true, site: true, lifecycle: true }
  const core = locateElement(
    NONE,
    { url: 'https://s.test/', text: 'Open menu', marks: ['ref:68:tracy block:core/navigation'] },
    { strings: CORE, mayWrite: mayWriteAs(OWNER), platform: 'wordpress' }
  ).levels[0]
  assert.equal(core.writable, false)
  assert.equal(core.next, undefined)
  assert.equal(core.why, fileWhy('wp-includes/blocks/navigation.php'))
  assert.match(core.why, /WordPress update overwrites/)
  assert.match(fileWhy('wp-content/plugins/x/y.php') ?? '', /plugin's next update/)
  assert.equal(fileWhy('templates/tracy/index.php'), null)

  // Words a theme part carries: that file at that line, for a seat with `code`.
  const part = indexStrings(
    stringEntries({
      platform: 'wordpress',
      locale: 'en-US',
      files: [
        {
          path: 'wp-content/themes/biz/parts/footer.html',
          text: '<footer>\n<p>Built with care in Kaluga</p>\n</footer>'
        }
      ],
      images: []
    })
  )
  const words = locateElement(
    NONE,
    {
      url: 'https://s.test/',
      text: 'Built with care in Kaluga',
      marks: ['part:footer block:core/paragraph']
    },
    { strings: part, mayWrite: mayWriteAs(DEVELOPER), platform: 'wordpress' }
  ).levels[0]
  assert.deepEqual(words.next, { edit: 'wp-content/themes/biz/parts/footer.html', line: 2 })

  // EmDash template source: no file tool reaches it; the shell does, then the rebuild.
  const astro = indexStrings(
    stringEntries({
      platform: 'emdash',
      locale: 'en',
      files: [
        {
          path: '/app/src/components/site/Footer.astro',
          text: '<footer>\n  <p>Proudly engineered in Kaluga</p>\n</footer>'
        }
      ],
      images: []
    })
  )
  const source = locateElement(
    NONE,
    { url: 'https://s.test/', text: 'Proudly engineered in Kaluga', marks: [] },
    { strings: astro, mayWrite: mayWriteAs(DEVELOPER), platform: 'emdash' }
  ).levels[0]
  assert.equal(source.writable, false)
  assert.equal(source.why, EMDASH_WHY)
  assert.deepEqual(source.next, {
    edit: '/app/src/components/site/Footer.astro',
    line: 2,
    through: 'shell',
    after: EMDASH_REBUILD
  })
})

test('view=pages: a walk of every language names each page’s twins; one language’s walk names none', () => {
  const row = (id, locale, group) => ({
    id,
    type: 'page',
    title: id,
    url: `https://s.test/${locale}/${id}`,
    locale,
    translationGroupId: group,
    publication: { status: 'published' }
  })
  const listings = [
    {
      site: { url: 'https://s.test' },
      contents: [
        row('en-about', 'en-GB', 'g-1'),
        row('ru-about', 'ru-RU', 'g-1'),
        row('en-news', 'en-GB', null)
      ]
    }
  ]
  const every = pagesDocument(listings, { truncated: false, alternates: true })
  assert.deepEqual(every.pages[0].alternates, [{ locale: 'ru-RU', id: 'ru-about' }])
  assert.deepEqual(every.pages[1].alternates, [{ locale: 'en-GB', id: 'en-about' }])
  assert.equal(every.pages[2].alternates, undefined, 'no group, no twins')
  assert.equal(pagesDocument(listings, { truncated: false }).pages[0].alternates, undefined)
  assert.equal(pagesDocument(listings, { truncated: true, alternates: true }).pages[0].alternates, undefined)
  // A group past the cap keeps only its translationGroupId.
  const crowd = Array.from({ length: ALTERNATES_MAX + 2 }, (_, i) => row(`p-${i}`, `l${i}`, 'g-2'))
  const wide = pagesDocument([{ site: { url: 'https://s.test' }, contents: crowd }], {
    truncated: false,
    alternates: true
  })
  assert.equal(wide.pages[0].alternates, undefined)
  assert.equal(wide.pages[0].translationGroupId, 'g-2')
})

test(
  'Apply door: a picked label comes back with its replace address and, from the site’s head, its twin’s language',
  opts,
  async () => {
    const { pool } = db
    const send = await joomlaDoor(pool, joomlaCowork())
    const res = await send({ ...pick(J, '/en', 'Careers'), selector: 'a' })
    assert.equal(res.status, 200)
    const answer = await res.json()
    assert.equal(answer.status, 'resolved')
    assert.equal(answer.levels[0].at, 'menuItem-618.0')
    assert.equal(answer.levels[0].value, 'Careers')
    // The head lists two languages (en-GB, ru-RU): the one twin is in the other.
    const record = answer.levels.at(-1)
    const twin = detailOf(J, record.id).relations.find((one) => one.type === 'translation')
    assert.deepEqual(record.alternates, [{ locale: 'ru-RU', id: twin.contentId }])
    // No contract is known for this site row: every slot is `code`, which an editor holds since
    // ADR 0028, so it is handed the replace call.
    assert.deepEqual(answer.levels[0].next, {
      tool: 'tracy_site',
      action: 'content.replace',
      at: ['menuItem-618.0']
    })
  }
)

// ── Imported sites (29/09/2026, `tasks/todo-import-site-contract.md`): the plugin stamps classic
// menu items and widgets, lists derived slots beside the blocks, and some words are in no record ──

test('markOwner: classic menu items and widgets of an imported WordPress site', () => {
  assert.deepEqual(markOwner('menuItem:77'), { kind: 'block', key: 'menuItem-77' })
  assert.deepEqual(markOwner('widget:text-3'), { kind: 'block', key: 'widget-text-3' })
  assert.deepEqual(markOwner('widget:media_image-4'), { kind: 'block', key: 'widget-media_image-4' })
  assert.deepEqual(markOwner('widget:block-2 block:core/paragraph'), { kind: 'block', key: 'widget-block-2' })
  assert.deepEqual(markOwner('post:12:hello-world block:the_content'), { kind: 'slug', slug: 'hello-world' })
  assert.equal(markOwner('widget:'), null)
})

/** An imported WordPress post: its markup's paragraph, and the derived slots the plugin lists after. */
const importedPost = (blocks) => ({
  id: 'c-hello',
  type: 'article',
  title: 'Hello world',
  slug: 'hello-world',
  url: 'https://imported.test/hello-world/',
  revision: 'r-7',
  native: [{ kind: 'post', id: 12 }],
  blocks
})
const DERIVED_KEY = 'postmeta-91._builder_data.0a1b2c3d4e'
/** A seat whose contract slots are all `content` — an imported site's derived profile. */
const derivedEditor = (road) =>
  roadToolsets(
    road,
    (kind) => KIND_TOOLSET[kind] ?? 'site',
    () => 'content'
  ).some((set) => Boolean(EDITOR[set]))

test('locate on an imported site: the same words in a field with a slotKey and in one without — the slot wins', () => {
  const index = indexContents(
    [
      importedPost([
        {
          id: 'b-para',
          key: 'core/paragraph',
          fields: [{ key: 'content', type: 'text', value: 'Harbour tours every morning', slotKey: null }],
          items: []
        },
        {
          id: 'b-derived',
          key: DERIVED_KEY,
          fields: [
            {
              key: DERIVED_KEY,
              type: 'text',
              value: 'Harbour tours every morning',
              slotKey: DERIVED_KEY,
              semanticKey: '_builder_data'
            }
          ],
          items: []
        }
      ])
    ],
    { siteUrl: 'https://imported.test' }
  )
  const answer = locateElement(
    index,
    {
      url: 'https://imported.test/hello-world/',
      text: 'Harbour tours every morning',
      marks: ['post:12:hello-world block:the_content']
    },
    { mayWrite: derivedEditor, platform: 'wordpress' }
  )
  assert.equal(answer.status, 'resolved')
  const [field] = answer.levels
  assert.equal(field.kind, 'field')
  assert.equal(field.slotKey, DERIVED_KEY)
  assert.equal(field.writable, true)
  // A derived block's field is the slot itself: its road is the contract apply, never a replace
  // address the replace job would read as a block name.
  assert.equal(field.at, undefined)
  assert.deepEqual(field.next, {
    tool: 'tracy_site',
    action: 'content.contract',
    operation: 'apply',
    changes: { [DERIVED_KEY]: null },
    expected_content_revisions: { 'c-hello': 'r-7' }
  })
})

test('locate: different words in a slotted and an unslotted field are not narrowed to the slot', () => {
  const index = indexContents(
    [
      importedPost([
        {
          id: 'b-para',
          key: 'core/paragraph',
          fields: [
            { key: 'content', type: 'text', value: 'Harbour tours every morning daily', slotKey: null }
          ],
          items: []
        },
        {
          id: 'b-derived',
          key: DERIVED_KEY,
          fields: [
            { key: DERIVED_KEY, type: 'text', value: 'Harbour tours every morning', slotKey: DERIVED_KEY }
          ],
          items: []
        }
      ])
    ],
    { siteUrl: 'https://imported.test' }
  )
  const answer = locateElement(
    index,
    { url: 'https://imported.test/hello-world/', text: 'Harbour tours every morning…', marks: [] },
    { mayWrite: derivedEditor, platform: 'wordpress' }
  )
  assert.equal(answer.levels[0]?.kind, 'record', 'two stored values: the record, not a guess')
})

test('locate: words no record holds answer unknown with hint not-in-content and where to look', () => {
  const index = indexContents([importedPost([])], { siteUrl: 'https://imported.test' })
  const query = { url: 'https://imported.test/', text: 'Designed by Northwind', marks: ['part:footer'] }
  const wp = locateElement(index, query, { mayWrite: derivedEditor, platform: 'wordpress' })
  assert.equal(wp.status, 'unknown')
  assert.equal(wp.sources.value, 'none')
  assert.equal(wp.hint, 'not-in-content')
  assert.match(wp.next, /not in this site's stored content/)
  // 30/09: words a block theme holds are content.replace's (a pattern, a part, a template), with
  // this page's path in the call, ready to send; the string road and the runtime case stay.
  assert.ok(wp.next.includes('tracy_site content.replace {find:"<its words>", replace, path:"/"}'), wp.next)
  assert.match(wp.next, /pattern this page inserts, a template part, a template/)
  assert.match(wp.next, /own copy/)
  assert.match(wp.next, /override that every page using it shows/)
  assert.match(wp.next, /operation:"string"/)
  assert.match(wp.next, /makes it as it runs/)
  // 23/10: words or a link the theme prints at render time go through the same call, never the Site Editor.
  assert.match(wp.next, /prints only as this page renders/)
  assert.ok(wp.next.includes('href:true'), wp.next)
  assert.doesNotMatch(wp.next, /Site Editor/)
  const joomla = locateElement(index, query, { mayWrite: derivedEditor, platform: 'joomla' })
  assert.equal(joomla.hint, 'not-in-content')
  assert.match(joomla.next, /language override/)
  assert.match(joomla.next, /content\.replace/)
  assert.doesNotMatch(joomla.next, /operation:"string"/)
  assert.doesNotMatch(joomla.next, /href:true/)
  // Never a theme file to edit: that changes every page using it and the next theme update erases it.
  for (const next of [wp.next, joomla.next]) {
    assert.doesNotMatch(next, /grep|Look in the active theme/)
    assert.match(next, /Never edit theme or template files/)
  }
  // The page's own path goes into the call; an address that is not one leaves the placeholder.
  const pricing = locateElement(
    index,
    { ...query, url: 'https://imported.test/pricing/?ref=x' },
    { mayWrite: derivedEditor, platform: 'wordpress' }
  )
  assert.ok(pricing.next.includes('path:"/pricing/"'), pricing.next)
  assert.ok(notInContentNext('wordpress', 'not a url').includes('path:"<the page path>"'))
  // Read from part of the site only: the words may be in a record not read yet — no hint.
  const partial = locateElement(index, query, { platform: 'wordpress', incomplete: true })
  assert.equal(partial.status, 'unknown')
  assert.equal(partial.hint, undefined)
  assert.equal(partial.next, undefined)
  // A weak value is not "not in the database": it is too short to say.
  const numbered = importedPost([
    { id: 'b', key: 'x', fields: [{ key: 'n', type: 'text', value: '01', slotKey: null }], items: [] }
  ])
  const weak = locateElement(
    indexContents([numbered]),
    { url: 'https://imported.test/', text: '01' },
    { platform: 'wordpress' }
  )
  assert.equal(weak.hint, undefined)
})

test('locate: a widget mark confirms the derived block the plugin names after it (widget:media_image-4 → widget-media_image-4)', () => {
  const words = 'Open daily from nine to five'
  const slot = 'option-12.widget_text.0a1b2c3d4e'
  const index = indexContents(
    [
      {
        id: 'c-widget',
        type: 'shared',
        title: 'Image widget',
        slug: null,
        url: null,
        revision: 'r-3',
        native: [{ kind: 'option', key: 'widget_text' }],
        blocks: [
          {
            id: 'b-widget',
            key: 'widget-media_image-4',
            fields: [{ key: slot, type: 'text', value: words, slotKey: slot, semanticKey: 'widget_text' }],
            items: []
          }
        ]
      },
      importedPost([
        {
          id: 'b-para',
          key: 'core/paragraph',
          fields: [{ key: 'content', type: 'text', value: words, slotKey: null }],
          items: []
        }
      ])
    ],
    { siteUrl: 'https://imported.test' }
  )
  const query = { url: 'https://imported.test/hello-world/', text: words }
  const unmarked = locateElement(index, query, { mayWrite: derivedEditor, platform: 'wordpress' })
  assert.equal(unmarked.status, 'candidates', 'two records hold the words')
  const marked = locateElement(
    index,
    { ...query, marks: ['widget:media_image-4'] },
    { mayWrite: derivedEditor, platform: 'wordpress' }
  )
  assert.equal(marked.status, 'resolved')
  assert.equal(marked.sources.mark, 'confirmed')
  assert.equal(marked.levels[0].slotKey, slot)
  assert.equal(marked.levels.at(-1).id, 'c-widget')
})
