// content.locate for a picked IMAGE on an imported WordPress site: picture narrowing (`finestPictures`,
// image fields only) and the derived-slot rule (`preferSlotted`, 29/09/2026) must compose in one order.
//
// `levelsOf` runs `preferSlotted(withoutWholeBody(finestPictures(hits)))`. Reading only the first two
// calls drops the third: a picture held by a real image field AND by a derived image slot (an imported
// site's contract lists derived slots beside the blocks its markup projects; their types are text, image
// or url) then counts as two fields and the answer stops at the record. Derived slots and their keys
// follow `content-locate.test.mjs` ("locate on an imported site"); the picture shapes follow
// `content-locate-image.test.mjs`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexContents, locateElement } from '../src/sites/content-locate.js'

const DERIVED_KEY = 'postmeta-91._builder_data.0a1b2c3d4e'
const FILE = '/wp-content/uploads/2026/09/summer-harbour-panorama.png'

/** An imported page: the picture in its markup's image block, in a derived image slot, and in the body. */
function importedPage(bodyFile) {
  return {
    id: 'c-home',
    type: 'page',
    title: 'Home',
    slug: 'home',
    url: 'https://imported.test/',
    revision: 'r-1',
    native: [{ kind: 'post', id: 12 }],
    bodyHtml: `<figure><img src="${bodyFile}" alt="Harbour panorama"></figure>`,
    blocks: [
      {
        id: 'b-image',
        key: 'core/image',
        fields: [{ key: 'url', type: 'image', value: FILE, slotKey: null }],
        items: []
      },
      {
        id: 'b-derived',
        key: DERIVED_KEY,
        fields: [
          { key: DERIVED_KEY, type: 'image', value: FILE, slotKey: DERIVED_KEY, semanticKey: '_builder_data' }
        ],
        items: []
      }
    ],
    images: [
      {
        id: 'mPanorama',
        src: FILE,
        alt: 'Harbour panorama',
        usages: [{ contentId: 'c-home', blockId: 'b-image', itemId: null }]
      }
    ]
  }
}

function locatePicture(bodyFile) {
  const index = indexContents([importedPage(bodyFile)], { siteUrl: 'https://imported.test' })
  return locateElement(
    index,
    {
      url: 'https://imported.test/',
      text: '',
      image: { src: `https://imported.test${FILE}`, alt: 'Harbour panorama' }
    },
    { mayWrite: () => true, platform: 'wordpress' }
  )
}

test('locate on an imported site: a picture held by an image field and a derived image slot resolves to the slot', () => {
  const answer = locatePicture(FILE)
  assert.equal(answer.status, 'resolved')
  const [field] = answer.levels
  assert.equal(field.kind, 'field')
  assert.equal(field.slotKey, DERIVED_KEY, 'the slot the agent can write, not the unslotted twin')
  assert.equal(field.next.action, 'content.contract')
  assert.deepEqual(Object.keys(field.next.changes), [DERIVED_KEY])
  assert.equal(answer.levels.at(-1).kind, 'record')
})

test('locate on an imported site: the same picture spelled as a resized file in the body still resolves to the slot', () => {
  // WordPress prints a resized copy (`-300x187`) in post_content; before the picture narrowing that
  // copy's address differed from the slot's, `preferSlotted` refused to choose, and only the record was left.
  const answer = locatePicture(FILE.replace('.png', '-300x187.png'))
  assert.equal(answer.status, 'resolved')
  const [field] = answer.levels
  assert.equal(field.kind, 'field')
  assert.equal(field.slotKey, DERIVED_KEY)
})

test('locate on an imported site: the derived slot names its media and alt but offers no alt write', () => {
  // The alt job's units are the page's named blocks (`post:<id>#<name>@alt`); a derived slot's block holds
  // one field keyed by the slot, which is no name the replace job knows, so an address built from it would
  // only be refused. `replaceAtOf` already leaves a derived slot's words without one.
  const [field] = locatePicture(FILE).levels
  assert.equal(field.slotKey, DERIVED_KEY)
  assert.deepEqual(field.image, { media: 'mPanorama', alt: 'Harbour panorama', printed: 'same' })
})
