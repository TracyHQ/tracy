// The body sent to Tracy's POST /v1/demos: public facts and public photo links only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEMO_REQUEST_SCHEMA,
  demoRequestFingerprint,
  toDemoRequest
} from '../src/plugins/builders/tracy-request.js'
import { validateDemoRequest } from '../domain/demo-request.mjs'

const PLACE = {
  name: 'Corner Cafe',
  candidate: { name: 'Corner Cafe', address: '1 Main Street', phone: '+1 555 0100', lat: 40.7, lon: -74 }
}
const BRIEF = {
  business: {
    name: 'Corner Cafe',
    address: '1 Main Street, Springfield',
    phone: '+1 555 0100',
    hours: ['Monday: 8 AM to 4 PM'],
    trade: 'cafe',
    website: 'http://corner-cafe.example',
    socials: {
      facebook: 'https://www.facebook.com/cornercafe',
      linkedin: 'https://www.linkedin.com/company/cornercafe',
      myspace: 'https://myspace.example/x'
    }
  },
  googlePlace: { summaries: { editorial: 'A small cafe on the corner.' } },
  sitemap: [
    { slug: 'home', title: 'Home', sections: [{ kind: 'hero', copy: '', assetIds: [] }] },
    {
      slug: 'menu',
      title: 'Menu',
      sections: [
        {
          kind: 'menu',
          copy: '',
          assetIds: [],
          menuItems: [
            { name: 'Flat white', price: '4.50', currency: 'USD', section: 'Coffee', verified: true },
            { name: 'Flat white', price: '4.50', currency: 'USD', section: 'Coffee', verified: false },
            { name: 'Flat white', price: '5.50', currency: 'USD', section: 'Coffee', size: 'Large' },
            { name: 'Banh mi', price: null, currency: null, section: null }
          ]
        }
      ]
    }
  ],
  content: {
    items: [
      { id: 'a', kinds: ['dish'], title: 'Flat white', body: 'Double shot.', authorship: 'page', posts: [] }
    ]
  },
  assets: [
    {
      id: '1',
      kind: 'image',
      category: 'food',
      sha256: 'a',
      alt: 'Coffee'
    },
    { id: '2', kind: 'image', category: 'space', sha256: 'b' },
    { id: '3', kind: 'image', category: 'space', sha256: 'c' },
    { id: '4', kind: 'image', category: 'space', sha256: 'd' },
    { id: '5', kind: 'image', category: 'space', sha256: 'e' },
    { id: '6', kind: 'image', category: 'space', sha256: 'f', objectKey: 'places/abc' },
    { id: '7', kind: 'video', category: 'space', sha256: 'g' }
  ]
}

/** The research rows behind BRIEF's assets: their public addresses, which the brief itself does not keep. */
const MEDIA = [
  { id: '1', sourceUrl: 'https://cdn.example/a.jpg', caption: 'Our flat white, poured this morning.' },
  { id: '2', sourceUrl: 'https://cdn.example/a.jpg' },
  { id: '3', sourceUrl: 'http://cdn.example/plain.jpg' },
  { id: '4', sourceUrl: 'https://10.0.0.0/x.jpg' },
  { id: '5', sourceUrl: 'https://printer.local/x.jpg' },
  { id: '6' },
  { id: '7', sourceUrl: 'https://cdn.example/v.mp4' }
]

test('a researched place: business facts, items and only public https photos', () => {
  assert.deepEqual(toDemoRequest(PLACE, BRIEF, { cms: 'wordpress' }, MEDIA), {
    schema: DEMO_REQUEST_SCHEMA,
    business: {
      name: 'Corner Cafe',
      address: '1 Main Street, Springfield',
      location: { lat: 40.7, lon: -74 },
      phone: '+1 555 0100',
      website: 'http://corner-cafe.example/',
      category: 'cafe',
      hours: ['Monday: 8 AM to 4 PM'],
      socials: { facebook: 'https://www.facebook.com/cornercafe' },
      description: 'A small cafe on the corner.',
      items: [
        { name: 'Flat white', price: '4.50', currency: 'USD', section: 'Coffee' },
        { name: 'Flat white (Large)', price: '5.50', currency: 'USD', section: 'Coffee' },
        { name: 'Banh mi' }
      ]
    },
    photos: [
      { url: 'https://cdn.example/a.jpg', caption: 'Our flat white, poured this morning.', alt: 'Coffee' }
    ],
    cms: 'wordpress'
  })
})

test('a post is never sent as a menu item: items come from the brief menu only', () => {
  const noMenu = { ...BRIEF, sitemap: [] }
  assert.equal('items' in toDemoRequest(PLACE, noMenu).business, false)
})

test("a photo's caption is the caption it was published with, never its category", () => {
  const out = toDemoRequest(PLACE, BRIEF, {}, [{ id: '1', sourceUrl: 'https://cdn.example/a.jpg' }])
  assert.deepEqual(out.photos, [{ url: 'https://cdn.example/a.jpg', alt: 'Coffee' }])
})

test('an unresearched place still sends its saved name, address and location', () => {
  const out = toDemoRequest(PLACE, null, { cms: 'not-a-cms' })
  assert.equal(out.business.name, 'Corner Cafe')
  assert.equal(out.business.address, '1 Main Street')
  assert.deepEqual(out.photos, [])
  assert.equal('cms' in out, false)
})

test('no name, no request', () => {
  assert.equal(toDemoRequest({ candidate: {} }, null), null)
})

test('the fingerprint ignores key order and follows every fact', () => {
  const a = toDemoRequest(PLACE, BRIEF)
  const b = JSON.parse(JSON.stringify(a))
  const reordered = Object.fromEntries(Object.entries(b).reverse())
  assert.equal(demoRequestFingerprint(a), demoRequestFingerprint(reordered))
  b.business.phone = '+1 555 0199'
  assert.notEqual(demoRequestFingerprint(a), demoRequestFingerprint(b))
})

test('every body the builder makes passes the contract Tracy validates (demo-request/v1)', () => {
  for (const [place, brief, choice] of [
    [PLACE, BRIEF, { cms: 'wordpress' }],
    [PLACE, null, {}],
    [PLACE, BRIEF, { cms: 'emdash', template: { quickstart: 'tracy-business', design: 'warm' } }]
  ]) {
    const body = toDemoRequest(place, brief, choice)
    const checked = validateDemoRequest(body)
    assert.equal(checked.ok, true, JSON.stringify(checked.errors))
  }
})

const ALL = ['items.size', 'items.priceScale', 'items.photo', 'brand', 'links', 'posts']
const POST_BODY = 'Our autumn menu starts Friday: pumpkin soup and a cinnamon flat white.'
const RICH = {
  ...BRIEF,
  brand: {
    origin: 'website',
    colors: [
      { hex: '#aa3300', role: 'primary' },
      { hex: 'nope', role: 'accent' }
    ],
    logo: 'logo'
  },
  sitemap: [
    {
      slug: 'menu',
      title: 'Menu',
      sections: [
        {
          kind: 'menu',
          copy: '',
          assetIds: [],
          evidence: [
            { source: 'menu photo', url: 'https://cdn.example/menu-board.jpg' },
            { source: 'website', url: 'https://corner-cafe.example/menu' }
          ],
          menuItems: [
            {
              name: 'Pho bo',
              size: 'Large',
              price: '55',
              priceScale: 1000,
              currency: 'VND',
              section: 'Soups',
              photo: {
                assetId: '8',
                status: 'accepted',
                how: 'post-text',
                evidence: {},
                matcher: 'dish-photos/1'
              }
            },
            {
              name: 'Bun cha',
              price: '45',
              photo: {
                assetId: '9',
                status: 'candidate',
                how: 'caption',
                evidence: {},
                matcher: 'dish-photos/1'
              }
            },
            {
              name: 'Che',
              photo: {
                assetId: '1',
                status: 'candidate',
                how: 'menu-card',
                evidence: {},
                matcher: 'dish-photos/1'
              }
            }
          ]
        }
      ]
    }
  ],
  integrations: [{ kind: 'booking', url: 'https://book.example/corner', verified: false }],
  content: {
    items: [
      {
        id: 'post:facebook:p1',
        kinds: ['offer'],
        title: 'Autumn menu',
        body: POST_BODY,
        posts: [
          {
            source: 'facebook',
            id: 'p1',
            url: 'https://www.facebook.com/cornercafe/posts/p1',
            publishedAt: '2026-10-20T08:00:00.000Z'
          }
        ]
      },
      {
        id: 'post:tripadvisor:p2',
        kinds: ['news'],
        title: 'x',
        body: 'A visit.',
        posts: [{ source: 'tripadvisor', id: 'p2' }]
      }
    ],
    links: [{ kind: 'menu', url: 'https://corner-cafe.example/autumn-menu', source: 'facebook' }]
  }
}
const RICH_MEDIA = [
  ...MEDIA,
  { id: '8', kind: 'image', sourceUrl: 'https://cdn.example/pho.jpg', caption: 'Pho bo' },
  { id: '9', kind: 'image', sourceUrl: 'https://cdn.example/bun.jpg' },
  { id: 'logo', kind: 'image', sourceUrl: 'https://cdn.example/logo.png' },
  { id: '10', kind: 'image', sourceUrl: 'https://cdn.example/autumn.jpg', postId: 'p1' }
]

test('a host that announces nothing gets the base request: the size in the name, no scale, and no price it would misread', () => {
  const out = toDemoRequest(PLACE, RICH, {}, RICH_MEDIA)
  assert.deepEqual(out.business.items, [
    { name: 'Pho bo (Large)', section: 'Soups' },
    { name: 'Bun cha', price: '45' },
    { name: 'Che' }
  ])
  for (const key of ['brand', 'links', 'posts']) assert.equal(key in out, false, key)
  assert.equal(validateDemoRequest(out).ok, true)
})

test('a host that announces every part gets them, each photo one of the request photos', () => {
  const out = toDemoRequest(PLACE, RICH, {}, RICH_MEDIA, ALL)
  const checked = validateDemoRequest(out)
  assert.equal(checked.ok, true, JSON.stringify(checked.errors))
  assert.deepEqual(out.business.items[0], {
    name: 'Pho bo',
    size: 'Large',
    price: '55',
    priceScale: 1000,
    currency: 'VND',
    section: 'Soups',
    photo: 'https://cdn.example/pho.jpg'
  })
  assert.equal('photo' in out.business.items[1], false, 'a candidate from a caption is not sent')
  assert.equal(out.business.items[2].photo, 'https://cdn.example/a.jpg', 'a photo from the menu card is sent')
  assert.equal(out.photos[0].url, 'https://cdn.example/pho.jpg', 'a dish photo goes before the others')
  assert.deepEqual(out.brand, {
    logo: 'https://cdn.example/logo.png',
    colors: [{ hex: '#aa3300', role: 'primary' }]
  })
  assert.deepEqual(out.links, {
    menu: 'https://corner-cafe.example/autumn-menu',
    booking: 'https://book.example/corner'
  })
  assert.deepEqual(out.posts[0], {
    text: POST_BODY,
    url: 'https://www.facebook.com/cornercafe/posts/p1',
    publishedAt: '2026-10-20T08:00:00.000Z',
    source: 'facebook'
  })
  assert.equal(out.posts[1].source, 'other')
})

test('a post date in another form is sent as an ISO date, an unreadable one not at all', () => {
  const at = (publishedAt) => {
    const brief = {
      ...RICH,
      content: { items: [{ ...RICH.content.items[0], posts: [{ source: 'facebook', publishedAt }] }] }
    }
    return toDemoRequest(PLACE, brief, {}, RICH_MEDIA, ALL)
  }
  const out = at('2026-10-20 08:00:00Z')
  assert.equal(out.posts[0].publishedAt, '2026-10-20T08:00:00.000Z')
  assert.equal(validateDemoRequest(out).ok, true)
  assert.equal('publishedAt' in at('last week').posts[0], false)
})

test('a post photo is sent with its post when it is one of the request photos', () => {
  const brief = { ...RICH, assets: [...BRIEF.assets, { id: '10', kind: 'image', category: 'other' }] }
  const out = toDemoRequest(PLACE, brief, {}, RICH_MEDIA, ALL)
  assert.deepEqual(out.posts[0].photos, ['https://cdn.example/autumn.jpg'])
  assert.equal(validateDemoRequest(out).ok, true)
})
