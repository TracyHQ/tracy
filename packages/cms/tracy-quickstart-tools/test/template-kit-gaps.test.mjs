// Template kit: the site part joined into the kit (site, main titles, list holds, link actions) and the template
// gaps (/ops judges them): kinds, stable ids, a person's acceptance, the review sheet. Fabricated data only.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mergeSite } from '../template-kit/lib/kit-site.mjs'
import { reviewRows } from '../template-kit/lib/review-sheet.mjs'
import { gapId, templateGaps } from '../template-kit/lib/template-gaps.mjs'

const MAP = {
  entities: [
    { key: 'menuItem-1', kind: 'menuItem' },
    { key: 'article-7', kind: 'article' }
  ],
  slots: [{ key: 'module-3.2', entity: 'module-3', type: 'url', role: 'contact.cta_url' }],
  pages: [
    { entity: 'menuItem-1', route: 'home', link: 'index.php?option=com_content&view=featured' },
    { entity: 'article-7', route: 'news/first-post', link: 'index.php?option=com_content&view=article&id=7' }
  ]
}

const kitOf = () => ({
  pages: [
    { id: 'page-home', path: '/', images: { 1440: 'page-home-1440' } },
    { id: 'page-news_first-post', path: '/news/first-post', images: { 1440: 'page-news_first-post-1440' } }
  ],
  blocks: [
    {
      id: 'block-3',
      images: { 1440: 'block-3-1440' },
      frames: [],
      lists: [
        {
          id: 'block-3.social',
          rowSlots: [{ id: 'block-3.5', role: 'contact.social_url' }],
          maxEvidence: {
            rowLinks: ['https://www.instagram.com/example-gym', 'https://www.facebook.com/example-gym']
          }
        }
      ],
      links: [
        { id: 'block-3.2', label: 'Book a class', target: '/classes' },
        { id: 'block-3.link-2', label: 'Read', target: '/news/first-post' },
        { id: 'block-3.link-3', label: 'Old page', target: '/gone' },
        { id: 'block-3.link-4', label: 'Soon', target: '#' },
        { id: 'block-3.link-5', label: 'Soon again', target: '#' }
      ]
    }
  ],
  images: [
    { id: 'block-3.items-min-2-1440', path: 'images/block-3.items-min-2-1440.jpg' },
    { id: 'block-3.items-min-2-1440-centered', path: 'images/block-3.items-min-2-1440-centered.jpg' }
  ],
  errors: []
})

const SITE = {
  site: { logoSpots: [], brandColours: { primary: { value: '#aa2200' } } },
  mainHeadings: [
    { pageId: 'page-home', path: '/', via: 'content-slot', slot: 'block-3.0', text: 'Example Gym' },
    { pageId: 'page-news_first-post', path: '/news/first-post', via: null, reason: 'the page shows no h1' }
  ],
  errors: [{ kind: 'missing', field: 'pages[page-news_first-post].h1', reason: 'the page shows no h1' }]
}

test('the site part joins the kit: site, main titles, what lists hold and what links do', () => {
  const kit = mergeSite(kitOf(), SITE, MAP)
  assert.equal(kit.site.brandColours.primary.value, '#aa2200')
  assert.deepEqual(kit.pages[0].h1, { via: 'content-slot', slot: 'block-3.0', text: 'Example Gym' })
  assert.equal(kit.pages[1].h1.via, null)
  assert.equal(kit.errors.length, 1, 'the site part errors are merged')
  assert.equal(kit.blocks[0].lists[0].holds, 'socialProfiles')
  const action = Object.fromEntries(kit.blocks[0].links.map((l) => [l.label, l.action]))
  assert.equal(action['Book a class'], 'primary-cta', 'the slot role says it')
  assert.equal(action.Read, 'go-to-item', 'an article page')
  assert.equal(action.Soon, 'page-control')
  const none = mergeSite(kitOf(), null, MAP)
  assert.equal(none.site, null)
  assert.ok(
    none.errors.some((e) => e.field === 'site'),
    'no site part is named, never guessed'
  )
})

test('template gaps: kinds, stable ids, a person accepts, never the kit', () => {
  const kit = kitOf()
  const fixes = [
    {
      selector: 'div.team div.row',
      rule: 'justify-content: center',
      verified: true,
      lists: ['block-3.items'],
      evidence: [
        {
          before: 'images/block-3.items-min-2-1440.jpg',
          after: 'images/block-3.items-min-2-1440-centered.jpg'
        }
      ]
    }
  ]
  const dead = [
    { path: '/gone', status: 404, from: ['/'] },
    { path: '/old-menu', status: 404, from: ['content-map'] }
  ]
  const gaps = templateGaps({ kit, mainHeadings: SITE.mainHeadings, dead, fixes })
  assert.deepEqual(gaps.map((g) => g.kind).sort(), [
    'dead-link',
    'dead-link',
    'dead-path',
    'page-without-h1',
    'sparse-row-left-packed'
  ])
  const h1 = gaps.find((g) => g.kind === 'page-without-h1')
  assert.deepEqual(h1.where, { pageId: 'page-news_first-post' })
  assert.deepEqual(h1.evidence, ['page-news_first-post-1440'])
  assert.equal(h1.id, gapId('page-without-h1', { pageId: 'page-news_first-post' }), 'the id is stable')
  assert.equal(
    gaps.filter((g) => g.kind === 'dead-link' && g.where.path === '#').length,
    1,
    'one per target and block'
  )
  assert.deepEqual(gaps.find((g) => g.kind === 'sparse-row-left-packed').evidence, [
    'block-3.items-min-2-1440',
    'block-3.items-min-2-1440-centered'
  ])
  assert.ok(
    gaps.every((g) => g.accepted === null),
    'nothing is accepted automatically'
  )
  const accepts = { [h1.id]: { reason: 'the post title prints as h2 by design', by: 'owner' } }
  const again = templateGaps({ kit, mainHeadings: SITE.mainHeadings, dead, fixes, accepts })
  assert.deepEqual(again.find((g) => g.id === h1.id).accepted, {
    reason: 'the post title prints as h2 by design',
    by: 'owner'
  })
  const rows = reviewRows({ ...kit, widths: [1440], templateGaps: again, site: SITE.site })
  assert.equal(rows.filter((r) => r.section.startsWith('Template gaps')).length, 5)
  assert.ok(rows.some((r) => r.pics[0] === 'site-palette.png'))
})

test('a block says each CMS sentence once, with its source; the name line is a name slot, not fixed text', () => {
  const kit = kitOf()
  kit.blocks[0].fixedText = [
    { text: 'Copyright © 2031 Example Gym. Every right kept.', source: null },
    { text: 'Example CMS', source: null },
    { text: 'is free software under the', source: null },
    { text: 'Members only', source: null }
  ]
  const site = {
    ...SITE,
    site: {
      ...SITE.site,
      nameSlots: [
        {
          kind: 'printed',
          where: 'text',
          block: 'block-3',
          sample: 'Copyright © 2031 Example Gym',
          text: 'Copyright © 2031 Example Gym. Every right kept.',
          source: { setting: 'cms site name', through: { file: 'f.ini', constant: 'FOOT_LINE1' } }
        }
      ],
      fixedTexts: [
        {
          block: 'block-3',
          text: 'Example CMS is free software under the Open Licence.',
          source: { file: 'f.ini', constant: 'FOOT_LINE2' },
          at: { path: '/', raw: 'module-3' },
          canHide: true
        }
      ]
    }
  }
  const b = mergeSite(kit, site, MAP).blocks[0]
  assert.deepEqual(
    b.fixedText.map((t) => [t.text, t.source?.constant ?? null]),
    [
      ['Members only', null],
      ['Example CMS is free software under the Open Licence.', 'FOOT_LINE2']
    ]
  )
  assert.equal(b.fixedText[1].at, undefined)
  const rows = reviewRows({ ...kit, blocks: [b], widths: [1440] }).filter((r) =>
    r.section.startsWith('Fixed')
  )
  assert.equal(rows.length, 1)
})
