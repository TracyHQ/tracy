// Seam 2 of spec TracyHQ/tracy#189 (ticket #191): the demo-leftover check over served pages. Fixture pages that still
// hold one kind of leftover each (C01..C19 of the leftover analysis) are reported with kind, page and place; clean pages
// pass. The template's demo and the business below are made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDemoLeftovers, LEFTOVER_KINDS } from '../domain/demo-leftovers.mjs'

/** A trimmed content map of a made-up kickboxing template, one or two slots per kind. */
const contentMap = {
  roleVocabularyVersion: 3,
  entities: [
    { key: 'module-10', kind: 'module' },
    { key: 'article-20', kind: 'article', identity: { alias: 'kickboxing-legends-remembered' } },
    { key: 'article-30', kind: 'article', identity: { alias: 'beginner-kickboxing' } },
    { key: 'menuItem-40', kind: 'menuItem', identity: { path: 'about/our-coaches/rowan-mercer' } }
  ],
  pages: [],
  slots: [
    {
      key: 'module-10.0',
      entity: 'module-10',
      type: 'image',
      role: 'business.hero_image',
      sample: 'images/demo/hero/ring.jpg'
    },
    {
      key: 'module-10.1',
      entity: 'module-10',
      type: 'image',
      role: 'business.hero_image',
      sample: 'images/demo/hero/fighter.png'
    },
    {
      key: 'article-20.0',
      entity: 'article-20',
      type: 'text',
      role: 'article.title',
      sample: 'Kickboxing legends remembered'
    },
    {
      key: 'article-30.0',
      entity: 'article-30',
      type: 'text',
      role: 'offering.name',
      sample: 'Beginner Kickboxing'
    },
    {
      key: 'article-30.1',
      entity: 'article-30',
      type: 'image',
      role: 'offering.image',
      sample: 'images/demo/classes/shared-bag.jpg'
    },
    {
      key: 'module-11.0',
      entity: 'module-11',
      type: 'image',
      role: 'editorial.item_icon',
      sample: 'images/demo/icons/glove.svg'
    },
    {
      key: 'module-12.0',
      entity: 'module-12',
      type: 'image',
      role: 'editorial.illustration',
      sample: 'images/demo/classes/shared-bag.jpg'
    },
    { key: 'module-13.0', entity: 'module-13', type: 'text', role: 'person.name', sample: 'Rowan Mercer' },
    {
      key: 'module-14.0',
      entity: 'module-14',
      type: 'url',
      role: 'business.video',
      sample: 'https://www.youtube.com/watch?v=AbCdEfGhIjK'
    },
    {
      key: 'module-15.0',
      entity: 'module-15',
      type: 'text',
      role: 'editorial.button_label',
      sample: 'Try a kickboxing class'
    },
    {
      key: 'module-16.0',
      entity: 'module-16',
      type: 'image',
      role: 'business.logo',
      sample: 'images/demo/logo/kick-logo.png'
    },
    {
      key: 'module-17.0',
      entity: 'module-17',
      type: 'image',
      role: 'stat.proof_image',
      sample: 'images/demo/others/avatars.png'
    },
    {
      key: 'module-18.0',
      entity: 'module-18',
      type: 'text',
      role: 'contact.email',
      sample: 'sales@kickdemo.example'
    },
    {
      key: 'module-18.1',
      entity: 'module-18',
      type: 'text',
      role: 'contact.phone',
      sample: '(555) 010-4477'
    },
    {
      key: 'module-19.0',
      entity: 'module-19',
      type: 'url',
      role: 'contact.social_url',
      sample: 'https://facebook.com/kickdemo'
    },
    {
      key: 'module-20.0',
      entity: 'module-20',
      type: 'url',
      role: 'editorial.navigation_url',
      sample: 'index.php?Itemid=193'
    }
  ]
}

/** A made-up bakery that owns the site now. */
const brief = {
  business: {
    name: 'Copperleaf Bakery',
    phone: '+44 20 7946 0321',
    email: 'hello@copperleaf.example',
    address: '14 Mill Lane, Ashby Vale',
    socials: { instagram: 'https://instagram.com/copperleafbakery' }
  },
  reading: { about: 'Sourdough, pastries and coffee in Ashby Vale.' }
}

/** A page of the business with nothing of the demo on it. */
const CLEAN = `<html><head><title>Copperleaf Bakery</title></head><body>
  <header><img src="/images/tracy-quickstart/0a1b.jpg" alt="Copperleaf Bakery"><nav><a href="/">Home</a> <a href="/about/contact">Contact</a></nav></header>
  <main><h1>Copperleaf Bakery</h1><p>Sourdough, pastries and coffee in Ashby Vale.</p>
  <a href="tel:+442079460321">+44 20 7946 0321</a> <a href="mailto:hello@copperleaf.example">hello@copperleaf.example</a>
  <a href="https://wa.me/447700901111">WhatsApp</a> <a href="https://instagram.com/copperleafbakery" aria-label="Instagram">Instagram</a>
  <button class="navbar-toggler" data-bs-toggle="collapse"><a href="#" class="menu-toggle" role="button">Menu</a></button></main>
  <footer>Copyright Copperleaf Bakery</footer></body></html>`

const page = (html) => `<html><body>${html}</body></html>`

/** One fixture page per kind, holding that leftover and nothing else of the demo, with the place it must be found at. */
const CASES = [
  ['C01', '/', page('<div class="hero" ><img src="/images/demo/hero/ring.jpg"></div>'), 'module-10.0'],
  ['C02', '/blog', page('<h2>Kickboxing legends remembered</h2>'), 'article-20.0'],
  ['C03', '/classes', page('<h3>Beginner Kickboxing</h3>'), 'article-30.0'],
  ['C04', '/', page('<img src="/images/demo/icons/glove.svg">'), 'module-11.0'],
  ['C05', '/', page('<img src="/images/demo/hero/fighter.png">'), 'module-10.1'],
  [
    'C06',
    '/classes',
    page('<img src="/images/demo/classes/shared-bag.jpg">'),
    'images/demo/classes/shared-bag.jpg'
  ],
  ['C07', '/about/our-coaches', page('<h4>Rowan Mercer</h4>'), 'module-13.0'],
  ['C08', '/', page('<iframe src="https://www.youtube.com/embed/AbCdEfGhIjK"></iframe>'), 'module-14.0'],
  ['C09', '/', page('<a class="btn" href="/classes">Try a kickboxing class</a>'), 'module-15.0'],
  [
    'C10',
    '/plans',
    page('<div style="background-image: url(/images/demo/others/page-title.jpg)"></div>'),
    'background-image'
  ],
  ['C11', '/pages/typography', page('<h1>Typography</h1><p>h1. Heading 1</p>'), '/pages/typography'],
  ['C12', '/', page('<a href="/classes/beginner-kickboxing">Sourdough</a>'), '/classes/beginner-kickboxing'],
  [
    'C13',
    '/',
    page('<a class="logo" href="/"><img src="/images/demo/logo/kick-logo.png"></a>'),
    'module-16.0'
  ],
  [
    'C14',
    '/',
    page('<footer>Joomla! is Free Software released under the GNU General Public License.</footer>'),
    'footer credit'
  ],
  ['C15', '/', page('<img src="/images/demo/others/avatars.png"> Join over 100k members'), 'module-17.0'],
  ['C17', '/about/contact', page('<p>Write to sales@kickdemo.example</p>'), 'module-18.0'],
  ['C18', '/', page('<a href="#" class="fa-facebook" aria-label="Facebook"></a>'), 'a[href="#"] facebook'],
  ['C19', '/', page('<nav><a href="#">Schedule</a></nav>'), 'a[href="#"] "Schedule"']
]

for (const [kind, path, html, place] of CASES)
  test(`${kind} (${LEFTOVER_KINDS[kind].name}) is reported with its kind, page and place`, () => {
    const report = checkDemoLeftovers({ pages: [{ path, status: 200, html }], contentMap, brief })
    assert.equal(report.pass, false)
    const hit = report.findings.find((f) => f.kind === kind)
    assert.ok(hit, `${kind} found: ${JSON.stringify(report.findings)}`)
    assert.equal(hit.page, path)
    assert.equal(hit.place, place)
  })

test('C16 (the not-found or offline page) is reported when it shows a demo picture', () => {
  const report = checkDemoLeftovers({
    pages: [
      { path: '/', status: 200, html: CLEAN },
      { path: '/tracy-missing-page', status: 404, html: page('<img src="/images/demo/hero/ring.jpg">') }
    ],
    contentMap,
    brief
  })
  const hit = report.findings.find((f) => f.kind === 'C16')
  assert.deepEqual([hit.page, hit.place], ['/tracy-missing-page', 'images/demo/hero/ring.jpg'])
})

test('C19 also reports a link to a page the site does not serve', () => {
  const report = checkDemoLeftovers({
    pages: [{ path: '/', status: 200, html: page('<a href="/about/our-coaches">Coaches</a>') }],
    contentMap,
    brief,
    missing: ['/about/our-coaches']
  })
  const hit = report.findings.find((f) => f.kind === 'C19')
  assert.deepEqual([hit.page, hit.place], ['/', '/about/our-coaches'])
})

test('C17 reports the demo email even where the content map has no slot for it', () => {
  const report = checkDemoLeftovers({
    pages: [{ path: '/', status: 200, html: page('<footer>sale@getfit.example</footer>') }],
    contentMap: { slots: [], entities: [], pages: [] },
    brief
  })
  assert.ok(report.findings.some((f) => f.kind === 'C17' && f.found === 'sale@getfit.example'))
})

test('clean pages of the business pass, and every one of the 20 kinds is counted', () => {
  const report = checkDemoLeftovers({
    pages: [
      { path: '/', status: 200, html: CLEAN },
      { path: '/tracy-missing-page', status: 404, html: page('<h1>Page not found</h1>') }
    ],
    contentMap,
    brief
  })
  assert.deepEqual(report.findings, [])
  assert.equal(report.pass, true)
  assert.deepEqual(Object.keys(report.counts), Object.keys(LEFTOVER_KINDS))
  assert.equal(Object.keys(LEFTOVER_KINDS).length, 22)
})

test('a demo word the brief also holds is the business’s own, not a leftover', () => {
  const ownBrief = { ...brief, reading: { about: 'We run a Beginner Kickboxing class every Monday.' } }
  const report = checkDemoLeftovers({
    pages: [{ path: '/classes', status: 200, html: page('<h3>Beginner Kickboxing</h3>') }],
    contentMap,
    brief: ownBrief
  })
  assert.equal(report.findings.filter((f) => f.kind === 'C03').length, 0)
})

test('a template of another shape (WordPress blocks, a dental clinic demo) is judged by its own demo samples', () => {
  const wordpressMap = {
    entities: [
      { key: 'page-12', kind: 'page' },
      { key: 'post-7', kind: 'post', identity: { alias: 'whitening-myths-busted' } }
    ],
    pages: [],
    slots: [
      {
        key: 'page-12:blocks.0.url',
        entity: 'page-12',
        type: 'image',
        role: 'business.hero_image',
        sample: 'wp-content/uploads/images/demo-dental/chair.jpg'
      },
      {
        key: 'page-12:blocks.4.content',
        entity: 'page-12',
        type: 'text',
        role: 'person.name',
        sample: 'Dr. Imogen Vale'
      },
      {
        key: 'page-12:blocks.6.content',
        entity: 'page-12',
        type: 'text',
        role: 'offering.price',
        sample: 'Check-up from $89'
      }
    ]
  }
  const report = checkDemoLeftovers({
    pages: [
      {
        path: '/',
        status: 200,
        html: page(
          '<img src="/wp-content/uploads/images/demo-dental/chair.jpg"><h3>Dr. Imogen Vale</h3><p>Check-up from $89</p><a href="/whitening-myths-busted/">Read</a>'
        )
      }
    ],
    contentMap: wordpressMap,
    brief
  })
  assert.deepEqual(
    report.findings.map((f) => [f.kind, f.place]),
    [
      ['C01', 'page-12:blocks.0.url'],
      ['C07', 'page-12:blocks.4.content'],
      ['C12', '/whitening-myths-busted/'],
      ['C17', 'page-12:blocks.6.content']
    ]
  )
})

test('C02: a one-word line of a demo article ("Light", a typography sample) is no proof of the demo post', () => {
  const map = {
    ...contentMap,
    slots: [
      ...contentMap.slots,
      {
        key: 'article-21.7',
        entity: 'article-21',
        type: 'text',
        role: 'editorial.paragraph',
        sample: 'Light'
      }
    ]
  }
  const report = checkDemoLeftovers({
    pages: [{ path: '/classes/yoga', status: 200, html: page('<li>Light stretching to finish</li>') }],
    contentMap: map,
    brief
  })
  assert.deepEqual(
    report.findings.filter((f) => f.kind === 'C02'),
    []
  )
})
