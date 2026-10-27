// content.locate for a picked IMAGE that a record prints more than once: the answer may name the image
// field only when everything else that holds the file is that field's own print (30/09/2026).
//
// `finestPictures` narrows a picture's hits to the image fields that hold it, so a picture held by its
// named field, by the page's body and by the record's `images` list answers with the field — its slot,
// its revision and the contract write. That is right when the body's `<img>` IS the field's print
// (WordPress projects a page's body whole beside its named blocks). It is wrong when a second place
// prints the same file that no named field holds: an unnamed image block, a raw-HTML card, an `<img>`
// inside another block's HTML field or a Joomla article's text. The picker sends the same address for
// every copy and the answer never sees which was picked, so a field level would hand the agent the
// write of the OTHER picture. Such a record stays the answer, as it was before the narrowing.
//
// Neutral fixtures, in the shapes the Claude Cowork plugins send (`content-locate-image.test.mjs`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexContents, locateElement } from '../src/sites/content-locate.js'

const writeAll = () => true

const FILE = '/wp-content/uploads/2026/09/assembly-line-photo.png'
const RESIZED = '/wp-content/uploads/2026/09/assembly-line-photo-1024x683.png'
const WP = 'https://w.test'

/** One image the way a block's HTML prints it. */
const printed = (src) => `<figure class="wp-block-image"><img src="${src}" alt=""></figure>`

/**
 * A WordPress page with one named image block (`banner`, its image a contract slot). `body` lists the
 * `<img>` sources the page's static HTML prints, `blocks` the other blocks the plugin projects.
 */
function wordpress({ body, blocks = [] }) {
  return {
    id: 'c1',
    type: 'page',
    title: 'Landing',
    slug: 'landing',
    url: `${WP}/`,
    revision: 'rev-1',
    native: [{ kind: 'post', id: 7 }],
    bodyHtml: body.map(printed).join(''),
    blocks: [
      {
        id: 'bBanner',
        key: 'banner',
        fields: [{ key: 'banner.img', type: 'image', value: FILE, slotKey: 'landing.banner.img' }]
      },
      ...blocks
    ],
    images: [
      {
        id: 'mLine',
        src: FILE,
        alt: 'Assembly line',
        usages: [{ contentId: 'c1', blockId: 'bBanner', itemId: null }]
      }
    ]
  }
}

/** The pick of that picture on the page: the file's own address or a resized copy of it. */
function locateOnPage(page, src = FILE) {
  return locateElement(
    indexContents([page], { siteUrl: WP }),
    {
      url: `${WP}/`,
      image: { src: `${WP}${src}`, alt: '' },
      marks: ['post:7:landing block:core/image', 'post:7:landing']
    },
    { mayWrite: writeAll, platform: 'wordpress' }
  )
}

const kinds = (answer) => answer.levels.map((level) => level.kind)
/** Nothing in the answer names a slot or a write: the agent is not handed a field to change. */
const writesNothing = (answer) => answer.levels.every((level) => !('slotKey' in level) && !('next' in level))

test('WordPress: a picture the body prints once, through its one named block, resolves to that field with its write', () => {
  const answer = locateOnPage(wordpress({ body: [FILE] }))
  assert.equal(answer.status, 'resolved')
  assert.deepEqual(kinds(answer), ['field', 'block', 'record'])
  const [field] = answer.levels
  assert.equal(field.fieldKey, 'banner.img')
  assert.equal(field.slotKey, 'landing.banner.img')
  assert.deepEqual(field.next, {
    tool: 'tracy_site',
    action: 'content.contract',
    operation: 'apply',
    changes: { 'landing.banner.img': null },
    expected_content_revisions: { c1: 'rev-1' }
  })
})

test('WordPress: a second copy of the file that no named block prints leaves the record as the answer', () => {
  // The named block prints one `<img>`; an unnamed image block (which the plugin leaves to `bodyHtml`)
  // prints another, spelled as WordPress resizes it. Either could be the one that was picked.
  for (const body of [
    [FILE, RESIZED],
    [FILE, FILE, RESIZED]
  ]) {
    const answer = locateOnPage(wordpress({ body }), RESIZED)
    assert.equal(answer.status, 'resolved')
    assert.deepEqual(kinds(answer), ['record'], `${body.length} body copies`)
    assert.ok(writesNothing(answer))
  }
})

test("WordPress: the file inside another named block's HTML leaves the record as the answer", () => {
  const about = {
    id: 'bAbout',
    key: 'about',
    fields: [
      {
        key: 'about.body',
        type: 'html',
        value: `<p>How the line runs</p>${printed(RESIZED)}`,
        slotKey: 'landing.about.body'
      }
    ]
  }
  // The body prints both blocks' pictures; or its HTML repeats neither (a block whose HTML the page's
  // static HTML does not carry), and then no count of body copies can tell the second place.
  for (const body of [[FILE, RESIZED], []]) {
    const answer = locateOnPage(wordpress({ body, blocks: [about] }), RESIZED)
    assert.equal(answer.status, 'resolved')
    assert.deepEqual(kinds(answer), ['record'], `${body.length} body copies`)
    assert.ok(writesNothing(answer))
  }
})

test('WordPress, imported: a derived slot beside the image block makes no room for a second copy of the file', () => {
  // An imported page lists the picture's block field AND the derived slot of the meta that stores it
  // (`content-locate-derived-picture.test.mjs`): two hits for ONE print. A second `<img>` in the body is
  // a second print, and the slot must not stand for it.
  const derived = 'postmeta-91._builder_data.0a1b2c3d4e'
  const imported = {
    id: 'c-home',
    type: 'page',
    title: 'Home',
    slug: 'home',
    url: `${WP}/`,
    revision: 'r-1',
    native: [{ kind: 'post', id: 12 }],
    bodyHtml: printed(FILE) + printed(RESIZED),
    blocks: [
      {
        id: 'b-image',
        key: 'core/image',
        fields: [{ key: 'url', type: 'image', value: FILE, slotKey: null }],
        items: []
      },
      {
        id: 'b-derived',
        key: derived,
        fields: [
          { key: derived, type: 'image', value: FILE, slotKey: derived, semanticKey: '_builder_data' }
        ],
        items: []
      }
    ],
    images: [
      { id: 'mLine', src: FILE, alt: '', usages: [{ contentId: 'c-home', blockId: 'b-image', itemId: null }] }
    ]
  }
  const answer = locateElement(
    indexContents([imported], { siteUrl: WP }),
    { url: `${WP}/`, image: { src: `${WP}${RESIZED}`, alt: '' } },
    { mayWrite: writeAll, platform: 'wordpress' }
  )
  assert.equal(answer.status, 'resolved')
  assert.deepEqual(kinds(answer), ['record'])
  assert.ok(writesNothing(answer))
})

test('WordPress: two named blocks holding the file name no field, whichever the page printed', () => {
  const footer = {
    id: 'bFooter',
    key: 'footer',
    fields: [{ key: 'footer.img', type: 'image', value: FILE, slotKey: 'landing.footer.img' }]
  }
  const answer = locateOnPage(wordpress({ body: [FILE, FILE], blocks: [footer] }))
  assert.equal(answer.status, 'resolved')
  assert.ok(
    answer.levels.every((level) => level.kind !== 'field'),
    'two fields hold the file: which one was pinned is not known'
  )
  assert.ok(writesNothing(answer))
})

const JOOMLA = 'https://j.test'
const PLANT = 'images/site/assembly-line-photo.png'

/**
 * A Joomla article: `image_intro` is a parameter the article layout prints; its text is the record's
 * own text (`bodyHtml`, the intro and full text joined). `text` says whether a named HTML field of the
 * article holds that text as well, as a custom editor field does.
 */
function joomla({ text }) {
  const html = `<p>How the line runs</p><img src="${PLANT}" alt="">`
  return {
    id: 'a7',
    type: 'article',
    title: 'Assembly line tour',
    slug: 'assembly-line-tour',
    url: `${JOOMLA}/tour`,
    revision: 'rev-7',
    native: [{ kind: 'article', id: 7 }],
    bodyHtml: html,
    blocks: [
      {
        id: 'bImages',
        key: 'article-7.images',
        role: 'images',
        fields: [{ key: 'article-7.image_intro', type: 'image', value: PLANT }]
      },
      ...(text
        ? [
            {
              id: 'bText',
              key: 'article-7.text',
              fields: [{ key: 'article-7.introtext', type: 'html', value: html }]
            }
          ]
        : [])
    ],
    images: [
      {
        id: 'mLine',
        src: `${JOOMLA}/${PLANT}`,
        alt: 'Assembly line',
        usages: [{ contentId: 'a7', blockId: 'bImages', itemId: null }]
      }
    ]
  }
}

function locateInArticle(page, marks) {
  return locateElement(
    indexContents([page], { siteUrl: JOOMLA }),
    { url: `${JOOMLA}/tour`, image: { src: `${JOOMLA}/${PLANT}`, alt: '' }, marks },
    { mayWrite: writeAll, platform: 'joomla' }
  )
}

test('Joomla: the file inside a named HTML field of the article leaves the record as the answer', () => {
  const answer = locateInArticle(joomla({ text: true }), ['article:7:assembly-line-tour'])
  assert.equal(answer.status, 'resolved')
  assert.deepEqual(kinds(answer), ['record'])
})

test("Joomla: an article's own text is no projection of its image fields; its mark scopes a pick to them", () => {
  const page = joomla({ text: false })
  // The article's mark names the block of its fields, so the record's text is not among the hits.
  const marked = locateInArticle(page, ['article:7:assembly-line-tour'])
  assert.equal(marked.status, 'resolved')
  assert.equal(marked.levels[0].fieldKey, 'article-7.image_intro')
  // With no mark to scope it the text is a second place that prints the file, and the record answers.
  const unmarked = locateInArticle(page, [])
  assert.equal(unmarked.status, 'resolved')
  assert.deepEqual(kinds(unmarked), ['record'])
})
