// Ticket TracyHQ/tracy#196 (spec #189): what a brief build decides OUTSIDE the template's content map. Every rule runs on a
// made-up kickboxing demo AND on a made-up dental clinic demo of another shape. Businesses and demos are fictional.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  copyrightLine,
  demoBackgrounds,
  errorPagePictures,
  hiddenByHeadBlock,
  holdsCredit,
  leftoverHeadBlock,
  planAliases,
  planOutsideMap,
  planVideos,
  slugOf,
  withHeadBlock,
  withoutCredit
} from '../domain/outside-map.mjs'

const kickboxing = {
  entities: [
    { key: 'article-14', kind: 'article', sourceId: 14, identity: { alias: 'beginner-kickboxing' } },
    { key: 'article-15', kind: 'article', sourceId: 15, identity: { alias: 'sparring-night' } },
    { key: 'article-29', kind: 'article', sourceId: 29, identity: { alias: '404' } },
    { key: 'article-28', kind: 'article', sourceId: 28, identity: { alias: 'offline-page' } }
  ],
  slots: [
    {
      key: 'article-14.4',
      entity: 'article-14',
      column: 'title',
      type: 'text',
      role: 'offering.name',
      sample: 'Beginner Kickboxing'
    },
    {
      key: 'article-15.0',
      entity: 'article-15',
      column: 'title',
      type: 'text',
      role: 'offering.name',
      sample: 'Sparring Night'
    },
    {
      key: 'article-14.12',
      entity: 'article-14',
      type: 'text',
      role: 'business.video',
      sample: 'AbCdEfGhIjK'
    },
    {
      key: 'module-181.6',
      entity: 'module-181',
      type: 'url',
      role: 'business.video',
      sample: 'https://www.youtube.com/watch?v=ZyXwVuTsRqP'
    },
    {
      key: 'module-10.0',
      entity: 'module-10',
      type: 'image',
      role: 'business.hero_image',
      sample: 'images/demo/hero/ring.jpg#joomlaImage://x'
    },
    {
      key: 'article-29.5',
      entity: 'article-29',
      type: 'image',
      role: 'editorial.illustration',
      sample: 'images/demo/others/404.jpg'
    },
    {
      key: 'article-28.5',
      entity: 'article-28',
      type: 'image',
      role: 'editorial.illustration',
      sample: 'images/demo/others/offline.jpg'
    }
  ]
}

const dental = {
  entities: [
    { key: 'article-3', kind: 'article', sourceId: 3, identity: { alias: 'whitening-myths' } },
    { key: 'article-9', kind: 'article', sourceId: 9, identity: { alias: 'error-page' } }
  ],
  slots: [
    {
      key: 'article-3.0',
      entity: 'article-3',
      column: 'title',
      type: 'text',
      role: 'article.title',
      sample: 'Whitening myths'
    },
    {
      key: 'article-9.1',
      entity: 'article-9',
      type: 'image',
      role: 'business.hero_image',
      sample: 'images/clinic/lost-tooth.png'
    }
  ]
}

const bakery = { business: { name: 'Copperleaf Bakery' }, reading: { about: 'Sourdough in Ashby Vale.' } }

test('slugOf makes a latin address from a title, accents dropped, and nothing from a title with no latin letter', () => {
  assert.equal(slugOf('Padel coaching & fitness!'), 'padel-coaching-and-fitness')
  assert.equal(slugOf('Cr\u00e8me br\u00fbl\u00e9e class'), 'creme-brulee-class')
  assert.equal(slugOf('\u7259\u79d1'), '')
})

test('C08: a video slot takes the brief’s own YouTube video, else becomes a still picture', () => {
  const none = planVideos({ contentMap: kickboxing, brief: bakery })
  assert.deepEqual(
    none.map((v) => [v.key, v.demo, v.decision, v.reason]),
    [
      ['article-14.12', 'AbCdEfGhIjK', 'still', 'no-playable-video'],
      ['module-181.6', 'ZyXwVuTsRqP', 'still', 'no-playable-video']
    ]
  )
  const own = planVideos({
    contentMap: kickboxing,
    brief: {
      ...bakery,
      business: { ...bakery.business, socials: { youtube: 'https://youtube.com/@copperleaf' } },
      media: ['https://youtu.be/OwnVideo001']
    }
  })
  assert.deepEqual(
    own.map((v) => [v.decision, v.value ?? null]),
    [
      ['video', 'OwnVideo001'],
      ['still', null]
    ]
  )
  // A dental demo with no video slot plans nothing.
  assert.deepEqual(planVideos({ contentMap: dental, brief: bakery }), [])
})

test('C12: an article keeps the demo’s address only while its title is the demo’s; a written title gives a new, unique one', () => {
  const steps = planAliases({
    contentMap: kickboxing,
    articles: [
      { id: 14, alias: 'beginner-kickboxing', title: 'Padel coaching', catid: 9 },
      { id: 15, alias: 'sparring-night', title: 'Sparring Night', catid: 9 },
      { id: 16, alias: 'padel-coaching', title: 'Something of the owner', catid: 9 }
    ]
  })
  assert.deepEqual(steps, [
    { id: 14, alias: 'padel-coaching-2', from: 'beginner-kickboxing', reason: 'title-written' }
  ])
  const clinic = planAliases({
    contentMap: dental,
    articles: [{ id: 3, alias: 'whitening-myths', title: 'Gentle cleaning', catid: 2 }]
  })
  assert.deepEqual(
    clinic.map((s) => s.alias),
    ['gentle-cleaning']
  )
  // An address someone already changed is theirs.
  assert.deepEqual(
    planAliases({
      contentMap: dental,
      articles: [{ id: 3, alias: 'our-cleaning', title: 'Gentle cleaning' }]
    }),
    []
  )
})

test('C10: a stylesheet or inline background naming a demo file outside the content map is found with its selector', () => {
  const found = demoBackgrounds({
    styles: [
      {
        css: '.t4-content{background-color:#fff;background-image:url(/images/demo/others/bg-cta.jpg)}\n@media (min-width:768px){.page-title{background:url("../images/demo/hero/ring.jpg")}}\n.hero{background-image:url(/images/tracy-content/ab.jpg)}'
      }
    ],
    pages: [
      {
        html: '<div class="cta" style="background-image: url(&quot;/images/demo/others/band.jpg&quot;)"></div>'
      }
    ],
    contentMap: kickboxing
  })
  assert.deepEqual(found, [
    { selector: '.t4-content', file: 'images/demo/others/bg-cta.jpg' },
    { selector: '[style*="images/demo/others/band.jpg"]', file: 'images/demo/others/band.jpg' }
  ])
  // Another shape: a clinic theme's header band.
  assert.deepEqual(
    demoBackgrounds({
      styles: [{ css: 'body.inner header{background:url(/images/clinic/band.webp) center}' }],
      contentMap: dental
    }),
    [{ selector: 'body.inner header', file: 'images/clinic/band.webp' }]
  )
})

test('C16: the pictures of the not-found and offline pages are found by their entity’s own address', () => {
  assert.deepEqual(
    errorPagePictures({ contentMap: kickboxing }).map((p) => p.file),
    ['images/demo/others/404.jpg', 'images/demo/others/offline.jpg']
  )
  assert.deepEqual(
    errorPagePictures({ contentMap: dental }).map((p) => p.file),
    ['images/clinic/lost-tooth.png']
  )
})

test('the head block repaints backgrounds with the owner’s picture or none, hides demo play buttons, pictures and dead links', () => {
  const block = leftoverHeadBlock({
    backgrounds: [{ selector: '.t4-content', file: 'images/demo/others/bg-cta.jpg' }],
    picture: 'images/tracy-content/ab12.jpg',
    videos: ['AbCdEfGhIjK'],
    files: ['images/demo/others/404.jpg'],
    links: ['Itemid=168', '/about/team']
  })
  assert.match(
    block,
    /\.t4-content\{background-image:url\("\/images\/tracy-content\/ab12\.jpg"\) !important\}/
  )
  assert.match(block, /\[data-src\*="AbCdEfGhIjK"\]/)
  assert.match(block, /a\[href\$="Itemid=168"\]/)
  assert.match(
    leftoverHeadBlock({ backgrounds: [{ selector: 'header', file: 'images/clinic/band.webp' }] }),
    /background-image:none !important/
  )
  assert.equal(leftoverHeadBlock({}), '')
  const hidden = hiddenByHeadBlock(`<head>${block}</head>`)
  for (const token of [
    'images/demo/others/bg-cta.jpg',
    'AbCdEfGhIjK',
    'images/demo/others/404.jpg',
    'Itemid=168',
    '/about/team'
  ])
    assert.ok(hidden.has(token), token)
})

test('withHeadBlock keeps the owner’s own head code and replaces a previous Tracy block', () => {
  const first = withHeadBlock('<script>own()</script>', leftoverHeadBlock({ videos: ['AbCdEfGhIjK'] }))
  const second = withHeadBlock(first, leftoverHeadBlock({ videos: ['ZyXwVuTsRqP'] }))
  assert.match(second, /own\(\)/)
  assert.doesNotMatch(second, /AbCdEfGhIjK/)
  assert.equal(second.split('tracy-leftovers -->').length, 3)
  assert.equal(withHeadBlock(second, ''), '<script>own()</script>')
})

test('C14: the credit line of the CMS or the template is taken out of a module, the business’s copyright stays', () => {
  const html =
    '<div class="mod-footer"><div class="footer1">Copyright © 2026 Copperleaf Bakery.</div><div class="footer2"><a href="https://www.joomla.org">Joomla!</a> is Free Software released under the GNU General Public License.</div></div>'
  const out = withoutCredit(html)
  assert.equal(out.removed, 1)
  assert.match(out.html, /Copperleaf Bakery/)
  assert.equal(holdsCredit(out.html), false)
  assert.equal(
    withoutCredit('<p>Designed by JoomlArt.com</p><p>Smile Studio dental care</p>').html,
    '<p>Smile Studio dental care</p>'
  )
})

test('planOutsideMap carries one decision per leftover kind outside the map, each with its reason', () => {
  const plan = planOutsideMap({ brief: bakery, contentMap: kickboxing })
  assert.equal(plan.version, 'outside-map/1')
  assert.equal(plan.videos.length, 2)
  assert.equal(plan.errorPages.length, 2)
  for (const part of ['backgrounds', 'showcase', 'aliases', 'credit', 'deadLinks'])
    assert.ok(plan[part].reason, part)
  assert.equal(planOutsideMap({ brief: bakery, contentMap: null }).videos.length, 0)
})

test('C14: the copyright line that replaces the credit is said in the site language, with no year and no dash', () => {
  assert.equal(
    copyrightLine('Copperleaf Bakery', 'en-GB'),
    'Copyright \u00a9 Copperleaf Bakery. All Rights Reserved.'
  )
  assert.equal(
    copyrightLine('Smile Studio', 'de-DE'),
    'Copyright \u00a9 Smile Studio. Alle Rechte vorbehalten.'
  )
  assert.equal(copyrightLine('Smile Studio', 'xx-XX'), 'Copyright \u00a9 Smile Studio. All Rights Reserved.')
  for (const locale of ['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es', 'ja', 'ar']) {
    const line = copyrightLine('Smile Studio', locale)
    assert.match(line, /Smile Studio/)
    assert.doesNotMatch(line, /[\u2013\u2014]|\{name\}|\d{4}/)
  }
})
