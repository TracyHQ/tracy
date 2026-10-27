// content.locate for a picked IMAGE (plan "comment thread", C3): the answer points at the printed
// image's own field, and says what the page prints as its alt.
//
// Stand E2E 29/09 (`tasks/evidence/comment-multi-pin/stand-e2e.md` M3, V3-H2, V4-M1): asked to change a
// home card image's alt, the agent changed the hero's alt (WordPress), the article intro alt that the
// Joomla card never prints, or the EmDash project image alt while the card prints the project title.
// The fixtures below copy the shapes `content.read` answered on the stand that day (capiwl1643 post 42,
// capijl1644 article 546, r2e2308 project elektra-lipetsk), cut to two images each.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexContents, locateElement } from '../src/sites/content-locate.js'

const writeAll = () => true

/** A WordPress page with a hero image and two project cards, as the Claude Cowork plugin projects it. */
function wordpress() {
  const imageField = (key, src) => ({
    key,
    type: 'image',
    value: src,
    slotKey: `home.${key}`,
    next: {
      tool: 'tracy_site',
      action: 'content.contract',
      operation: 'apply',
      changes: { [`home.${key}`]: null }
    }
  })
  return {
    id: 'c42',
    type: 'page',
    title: 'Home',
    slug: 'home',
    url: 'https://w.test/',
    revision: 'rev42',
    native: [{ kind: 'post', id: 42 }],
    bodyHtml:
      '<figure><img src="/wp-content/uploads/2026/09/hero-ru.png" alt="Drop a site photo here · 4:5"></figure>' +
      '<figure><img src="/wp-content/uploads/2026/09/factory-ru-1.png" alt="Project photo · 16:10"></figure>' +
      '<figure><img src="/wp-content/uploads/2026/09/proj-ru-2.png" alt="Project photo · 4:3"></figure>',
    blocks: [
      {
        id: 'bHero',
        key: 'hero',
        fields: [imageField('hero.img', '/wp-content/uploads/2026/09/hero-ru.png')]
      },
      {
        id: 'bProjects',
        key: 'projects',
        fields: [{ key: 'projects.heading', type: 'text', value: 'Selected projects' }],
        items: [
          {
            id: 'i1',
            position: 0,
            fields: [
              imageField('projects.item.1.img', '/wp-content/uploads/2026/09/factory-ru-1.png'),
              { key: 'projects.item.1.title', type: 'text', value: 'Elektra appliance plant, Lipetsk SEZ' }
            ]
          },
          {
            id: 'i2',
            position: 1,
            fields: [
              imageField('projects.item.2.img', '/wp-content/uploads/2026/09/proj-ru-2.png'),
              { key: 'projects.item.2.title', type: 'text', value: 'Vorsino Industrial Park, phase 3' }
            ]
          }
        ]
      }
    ],
    images: [
      {
        id: 'mHero',
        src: '/wp-content/uploads/2026/09/hero-ru.png',
        alt: 'Drop a site photo here · 4:5',
        usages: [{ contentId: 'c42', blockId: 'bHero', itemId: null }]
      },
      {
        id: 'mFactory',
        src: '/wp-content/uploads/2026/09/factory-ru-1.png',
        alt: 'Project photo · 16:10',
        usages: [{ contentId: 'c42', blockId: 'bProjects', itemId: 'i1' }]
      },
      {
        id: 'mProj2',
        src: '/wp-content/uploads/2026/09/proj-ru-2.png',
        alt: 'Project photo · 4:3',
        usages: [{ contentId: 'c42', blockId: 'bProjects', itemId: 'i2' }]
      }
    ]
  }
}

test('WordPress: the second card image resolves to its own image field, with the alt the page prints and its write', () => {
  const index = indexContents([wordpress()], { siteUrl: 'https://w.test' })
  const answer = locateElement(
    index,
    {
      url: 'https://w.test/',
      text: '',
      image: {
        src: 'https://w.test/wp-content/uploads/2026/09/proj-ru-2-300x187.png',
        alt: 'Project photo · 4:3'
      },
      marks: ['post:42:home block:core/image', 'post:42:home block:core/group', 'post:42:home']
    },
    { mayWrite: writeAll, platform: 'wordpress' }
  )
  assert.equal(answer.status, 'resolved')
  const [field] = answer.levels
  assert.equal(field.kind, 'field')
  assert.equal(field.fieldKey, 'projects.item.2.img', 'the pinned card, never the hero or the first card')
  assert.equal(field.itemId, 'i2')
  assert.deepEqual(field.image, {
    media: 'mProj2',
    alt: 'Project photo · 4:3',
    printed: 'same',
    next: { tool: 'tracy_site', action: 'content.replace', at: ['post:42#projects.item.2.img@alt'] }
  })
  // The file itself is the contract slot's, as before.
  assert.equal(field.next.action, 'content.contract')
  assert.deepEqual(Object.keys(field.next.changes), ['home.projects.item.2.img'])
})

test('WordPress: the same file twice in one record names no field, and no alt write', () => {
  const page = wordpress()
  page.blocks[1].items[1].fields[0].value = '/wp-content/uploads/2026/09/factory-ru-1.png'
  page.images[1].usages.push({ contentId: 'c42', blockId: 'bProjects', itemId: 'i2' })
  page.images.pop()
  const index = indexContents([page], { siteUrl: 'https://w.test' })
  const answer = locateElement(
    index,
    {
      url: 'https://w.test/',
      image: {
        src: 'https://w.test/wp-content/uploads/2026/09/factory-ru-1.png',
        alt: 'Project photo · 16:10'
      },
      marks: ['post:42:home block:core/image']
    },
    { mayWrite: writeAll, platform: 'wordpress' }
  )
  assert.equal(answer.status, 'resolved')
  assert.ok(
    answer.levels.every((level) => level.kind !== 'field'),
    'two fields hold the file: which one was pinned is not known'
  )
})

/** A Joomla article whose intro image a module card prints with `alt=""`. */
function joomla() {
  return {
    id: 'a546',
    type: 'article',
    title: 'Elektra appliance plant, Lipetsk SEZ',
    slug: 'elektra-plant-lipetsk',
    url: 'https://j.test/en/projects/production/elektra-plant-lipetsk',
    revision: 'rev546',
    native: [{ kind: 'article', id: 546 }],
    blocks: [
      {
        id: 'bTitle',
        key: 'article-546.1',
        fields: [{ key: 'article-546.1', type: 'text', value: 'Elektra appliance plant, Lipetsk SEZ' }]
      },
      {
        id: 'bImages',
        key: 'article-546.images',
        role: 'images',
        fields: [
          { key: 'article-546.image_intro', type: 'image', value: 'images/northgate/factory-ru-1.png' },
          { key: 'article-546.image_fulltext', type: 'image', value: 'images/northgate/proj-big.png' }
        ]
      }
    ],
    images: [
      {
        id: 'mIntro',
        src: 'https://j.test/images/northgate/factory-ru-1.png',
        alt: 'Elektra appliance plant, Lipetsk SEZ',
        usages: [{ contentId: 'a546', blockId: 'bImages', itemId: null }]
      },
      {
        id: 'mFull',
        src: 'https://j.test/images/northgate/proj-big.png',
        alt: 'Elektra plant: 62,000 m² production building',
        usages: [{ contentId: 'a546', blockId: 'bImages', itemId: null }]
      }
    ]
  }
}

const JOOMLA_MARKS = ['article:546:elektra-plant-lipetsk block:mod_ja_acm', 'module:443 block:mod_ja_acm']

test('Joomla: the full-text image resolves to image_fulltext, not the first image of the article', () => {
  const index = indexContents([joomla()], { siteUrl: 'https://j.test' })
  const answer = locateElement(
    index,
    {
      url: 'https://j.test/en/projects/production/elektra-plant-lipetsk',
      image: {
        src: 'https://j.test/images/northgate/proj-big.png',
        alt: 'Elektra plant: 62,000 m² production building'
      },
      marks: JOOMLA_MARKS
    },
    { mayWrite: writeAll, platform: 'joomla' }
  )
  assert.equal(answer.status, 'resolved')
  assert.equal(answer.levels[0].fieldKey, 'article-546.image_fulltext')
  assert.deepEqual(answer.levels[0].image, {
    media: 'mFull',
    alt: 'Elektra plant: 62,000 m² production building',
    printed: 'same'
  })
})

test('Joomla: a card that prints alt="" is said to print none of the stored alt', () => {
  const index = indexContents([joomla()], { siteUrl: 'https://j.test' })
  const answer = locateElement(
    index,
    {
      url: 'https://j.test/en/',
      image: { src: 'https://j.test/images/northgate/factory-ru-1.png', alt: '' },
      marks: JOOMLA_MARKS
    },
    { mayWrite: writeAll, platform: 'joomla' }
  )
  assert.equal(answer.status, 'resolved')
  assert.equal(answer.levels[0].fieldKey, 'article-546.image_intro')
  assert.deepEqual(answer.levels[0].image, {
    media: 'mIntro',
    alt: 'Elektra appliance plant, Lipetsk SEZ',
    printed: 'none'
  })
})

/** An EmDash project whose card prints the project's title as its image's alt. */
function emdash() {
  const src = (ulid) => `https://e.test/_emdash/api/media/file/${ulid}.png`
  return {
    id: 'pElektra',
    type: 'page',
    title: 'Elektra appliance plant, Lipetsk SEZ',
    slug: 'elektra-lipetsk',
    url: 'https://e.test/projects/elektra-lipetsk',
    revision: 'revE',
    locale: 'en',
    fields: [
      { key: 'title', type: 'text', value: 'Elektra appliance plant, Lipetsk SEZ' },
      { key: 'image', type: 'image', value: src('01M3ATZHTH1MJZ35AWQVC9M8SZ.01M3ATZHTKYC3NVZJGTB8CTBBS') },
      { key: 'cover', type: 'image', value: src('01M3ATZHSCFQF9YN5M0H8178MG.01M3ATZHSHYBC9H0JJXSQYWXYQ') }
    ],
    images: [
      {
        id: 'mPlant',
        src: src('01M3ATZHTH1MJZ35AWQVC9M8SZ.01M3ATZHTKYC3NVZJGTB8CTBBS'),
        alt: 'Plant photo',
        usages: [{ contentId: 'pElektra', blockId: null, itemId: null }]
      },
      {
        id: 'mCover',
        src: src('01M3ATZHSCFQF9YN5M0H8178MG.01M3ATZHSHYBC9H0JJXSQYWXYQ'),
        alt: 'Site earthworks, February 2024',
        usages: [{ contentId: 'pElektra', blockId: null, itemId: null }]
      }
    ]
  }
}

test('EmDash: the second image resolves to its field; alt words the page takes from the title are named as the title', () => {
  const index = indexContents([emdash()], { siteUrl: 'https://e.test' })
  const entry = 'emdash:projects:01M3ATZCA8SJZP1TA2KQMEVERM:elektra-lipetsk'
  const cover = locateElement(
    index,
    {
      url: 'https://e.test/',
      image: {
        src: 'https://e.test/_emdash/api/media/file/01M3ATZHSCFQF9YN5M0H8178MG.01M3ATZHSHYBC9H0JJXSQYWXYQ.png',
        alt: 'Site earthworks, February 2024'
      },
      marks: [entry, 'emdash:home:01M3ATZE5H1GVXWVWJMWXYFP1R:home']
    },
    { mayWrite: writeAll, platform: 'emdash' }
  )
  assert.equal(cover.status, 'resolved')
  assert.equal(cover.levels[0].fieldKey, 'cover')
  assert.deepEqual(cover.levels[0].image, {
    media: 'mCover',
    alt: 'Site earthworks, February 2024',
    printed: 'same'
  })

  const card = locateElement(
    index,
    {
      url: 'https://e.test/',
      image: {
        src: 'https://e.test/_emdash/api/media/file/01M3ATZHTH1MJZ35AWQVC9M8SZ.01M3ATZHTKYC3NVZJGTB8CTBBS.png',
        alt: 'Elektra appliance plant, Lipetsk SEZ'
      },
      marks: [`${entry} field:image`, entry]
    },
    { mayWrite: writeAll, platform: 'emdash' }
  )
  assert.equal(card.status, 'resolved')
  assert.equal(card.levels[0].fieldKey, 'image')
  assert.deepEqual(card.levels[0].image, {
    media: 'mPlant',
    alt: 'Plant photo',
    printed: 'other',
    from: 'title'
  })
})
