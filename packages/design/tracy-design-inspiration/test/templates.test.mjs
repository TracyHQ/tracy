/**
 * Template cards on the host half of D37 — where they come from, and where their pictures do.
 *
 * 🔒 A CARD HAS ONE SOURCE: Tracy's `/api/templates`, answered from the releases (Lee, 16/09). The
 * image once carried a second copy inside `quickstarts.json`; it is gone, because Publish and
 * Unpublish are one press on the operations screen and an image copy would need a commit and a
 * build to follow each press. What the image still holds is the PICTURES, so a card that names one
 * by bare file name is drawn without a round trip to the demo site.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  pictureType,
  quickstartCandidates,
  readPicture,
  readQuickstarts,
  templatesFromTracy
} from '../src/host/templates.mjs'
import { cardPoster, homeLayout, pictureAddress, templateRows } from '../src/client/templates.mjs'

const catalogue = {
  'tracy-base/j6': { platform: 'joomla', version: '1.0.0' },
  'tracy-business/j6': {
    platform: 'joomla',
    version: '1.0.0',
    template: { id: 'tracy-business', label: 'Tracy Business' }
  },
  'tracy-business/emdash': {
    platform: 'emdash',
    version: '1.0.0',
    template: { id: 'tracy-business', label: 'Tracy Business' }
  }
}

test('the catalogue is read from the first candidate that exists, pictures beside it, never off the path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-templates-'))
  writeFileSync(join(dir, 'quickstarts.json'), JSON.stringify(catalogue))
  mkdirSync(join(dir, 'templates', 'tracy-business'), { recursive: true })
  writeFileSync(join(dir, 'templates', 'tracy-business', 'business-home-1440.png'), 'png-bytes')
  const found = await readQuickstarts([join(dir, 'nope.json'), join(dir, 'quickstarts.json')])
  assert.equal(found.dir, join(dir, 'templates'))
  assert.equal(Object.keys(found.catalogue).length, 3)
  assert.equal(await readQuickstarts([join(dir, 'nope.json')]), null)
  assert.equal(String(await readPicture(found.dir, 'tracy-business', 'business-home-1440.png')), 'png-bytes')
  assert.equal(await readPicture(found.dir, '../tracy-business', 'business-home-1440.png'), null)
  assert.equal(await readPicture(found.dir, 'tracy-business', '../../quickstarts.json'), null)
  assert.equal(await readPicture(found.dir, 'tracy-business', 'missing.png'), null)
  assert.equal(pictureType('a.png'), 'image/png')
  assert.equal(pictureType('a.webp'), 'image/webp')
  const candidates = quickstartCandidates('/etc/tracy/q.json')
  assert.equal(candidates[0], '/etc/tracy/q.json')
  assert.equal(candidates[1], '/opt/tracy/quickstarts.json')
})

test('the template cards come from Tracy — and a door that did not answer is not an empty list', async () => {
  const served = {
    readAt: '2026-09-15T13:00:00Z',
    templates: [
      {
        id: 'tracy-business',
        label: 'Tracy Business',
        card: { provider: 'JoomlArt', category: 'Business', blurb: 'B2B site.', image: 'home.png' },
        platforms: [
          { platform: 'joomla', tag: 'tracy-business/j6', version: '1.0.0' },
          { platform: 'emdash', tag: 'tracy-business/emdash-0.x', version: '1.0.0' }
        ]
      }
    ]
  }
  const asked = []
  const ok = await templatesFromTracy('https://cowork.tracy.ai', async (url) => {
    asked.push(String(url))
    return new Response(JSON.stringify(served), { status: 200 })
  })
  assert.equal(asked[0], 'https://cowork.tracy.ai/api/templates')
  assert.equal(ok.length, 1)
  assert.deepEqual(ok[0].platforms.sort(), ['emdash', 'joomla'], 'the card lists every CMS that builds it')
  assert.equal(ok[0].provider, 'JoomlArt')

  // 🔒 A DOOR THAT DID NOT ANSWER IS NOT A DEPLOYMENT WITH NO CARDS. Null says so. The tab draws
  // no template cards either way since 16/09 — there is no image copy to fall back to — but only
  // null is a reason to go and look at the door.
  assert.equal(
    await templatesFromTracy('https://cowork.tracy.ai', async () => new Response('', { status: 502 })),
    null
  )
  assert.equal(
    await templatesFromTracy('https://cowork.tracy.ai', async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }),
    null
  )
  // An empty list is an ANSWER, now that the cards live on the releases: it means this deployment
  // has published no finished sites, and a list that drew some anyway would be drawing yesterday's.
  assert.deepEqual(
    await templatesFromTracy(
      'https://cowork.tracy.ai',
      async () => new Response('{"templates":[]}', { status: 200 })
    ),
    []
  )
  // A body that is not the shape promised is also "no answer": half a card is worse than none.
  assert.equal(
    await templatesFromTracy(
      'https://cowork.tracy.ai',
      async () => new Response('{"templates":"soon"}', { status: 200 })
    ),
    null
  )
})

const SERVED = {
  templates: [
    {
      id: 'tracy-business',
      label: 'Tracy Business',
      card: {
        provider: 'JoomlArt',
        category: 'Professional & Corporate',
        blurb: 'B2B site.',
        image:
          'https://cowork.tracy.site/api/templates/tracy-business/shots/business-home-390.png?v=0123abcd',
        demo: { url: 'https://business-emdash.tracy.site', version: '1.0.0' },
        languages: ['en', 'ru'],
        layouts: [
          {
            key: 'home',
            label: 'Home',
            path: '/',
            shots: {
              desktop:
                'https://cowork.tracy.site/api/templates/tracy-business/shots/business-home-1440.png?v=89abcdef',
              mobile:
                'https://cowork.tracy.site/api/templates/tracy-business/shots/business-home-390.png?v=0123abcd'
            }
          },
          { key: 'service', label: 'Service', path: '/services/x', count: 12 }
        ]
      },
      platforms: [
        { platform: 'joomla', tag: 'tracy-business/j6', version: '1.0.0' },
        { platform: 'emdash', tag: 'tracy-business/emdash-0.x', version: '1.0.0' }
      ]
    }
  ]
}

test('a card Tracy serves is the row shape the list reads: one nested template, pictures by address', () => {
  const [row] = templateRows(SERVED)
  // 🔒 THE KEYS THE LIST READS, ALL NESTED UNDER `template`. The list and `PreviewDialog` both
  // branch on `template` and draw nothing without it, so a row of another shape is a blank card
  // with nothing anywhere to say why.
  assert.equal(row.id, 'tracy-business')
  assert.equal(row.name, 'Tracy Business')
  assert.equal(row.provider, 'JoomlArt')
  assert.equal(row.category, 'Professional & Corporate')
  assert.deepEqual(row.platforms, ['joomla', 'emdash'])
  assert.deepEqual(row.template.quickstarts, {
    joomla: 'tracy-business/j6',
    emdash: 'tracy-business/emdash-0.x'
  })
  assert.equal(row.template.version, '1.0.0')
  assert.equal(row.template.blurb, 'B2B site.')
  assert.equal(
    row.template.image,
    'https://cowork.tracy.site/api/templates/tracy-business/shots/business-home-390.png?v=0123abcd'
  )
  assert.deepEqual(row.template.demo, { url: 'https://business-emdash.tracy.site', version: '1.0.0' })
  assert.deepEqual(row.template.languages, ['en', 'ru'])
  assert.equal(
    row.template.layouts[0].shots.mobile,
    'https://cowork.tracy.site/api/templates/tracy-business/shots/business-home-390.png?v=0123abcd'
  )
  assert.equal(
    row.template.layouts[0].shots.desktop,
    'https://cowork.tracy.site/api/templates/tracy-business/shots/business-home-1440.png?v=89abcdef'
  )
  assert.equal(row.template.layouts[1].count, 12)
  assert.equal(row.template.layouts[1].shots, undefined)
  // The filter traits a template card wears until an administrator sets them.
  assert.deepEqual([row.nav, row.hero, row.dark], ['top-left', 'split', true])
  assert.equal(templateRows({ templates: 'soon' }), null, 'a body of the wrong shape is no answer')
  assert.deepEqual(templateRows({ templates: [null, { label: 'no id' }] }), [], 'a row with no id is dropped')
})

test('dark is the card’s own flag: false hides the demo’s Light/Dark, absent keeps the old true (Akemi, 30/09)', () => {
  const served = (/** @type {unknown} */ dark) => ({
    templates: [{ id: 'ja-vega', card: dark === undefined ? {} : { dark } }]
  })
  assert.equal(templateRows(served(false))?.[0].dark, false, 'the card says the demo has no dark mode')
  assert.equal(templateRows(served(true))?.[0].dark, true)
  assert.equal(templateRows(served(undefined))?.[0].dark, true, 'a card that never said reads as before')
  assert.equal(templateRows(served('no'))?.[0].dark, true, 'only a boolean is an answer')
})

test('only an absolute http(s) picture travels; a bare name or any other shape is absent (#523)', () => {
  const card = (image, desktop) => ({
    templates: [
      {
        id: 'ja-restaurant',
        label: 'JA Restaurant',
        card: {
          image,
          layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop, mobile: image } }]
        },
        platforms: [{ platform: 'joomla', tag: 'quickstart/ja-restaurant/j6', version: '1.0.0' }]
      }
    ]
  })
  const address = 'https://cowork.tracy.site/api/templates/tracy-business/shots/home.png?v=0123abcd'
  const [kept] = templateRows(card(address, 'http://tracy.test/api/templates/x/shots/home-1440.png'))
  assert.equal(kept.template.image, address)
  assert.equal(
    kept.template.layouts[0].shots.desktop,
    'http://tracy.test/api/templates/x/shots/home-1440.png'
  )
  // 🔒 MEASURED 27/09: an older tracy-web answered `ja-restaurant`'s pictures by bare name, the lane
  // pointed them at a door that 404s for every name, and the card drew a broken image. Absent now,
  // whatever server answered; the card is still a row.
  for (const bad of [
    'ja-restaurant-home-390.png',
    'template/ja-restaurant/ja-restaurant-home-390.png',
    '../secrets',
    './home.png',
    '/api/templates/ja-restaurant/shots/home.png',
    '//evil.example/home.png',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'https://',
    // Parsed by `new URL`, yet read by a browser on an https page as a same-origin relative path.
    'https:shot.png',
    'https:/shot.png',
    'http:shot.png',
    'HTTPS:/\\evil.example/x.png',
    'https:///shot.png',
    '',
    null,
    undefined,
    7,
    { url: 'https://x.example/a.png' }
  ]) {
    const [row] = templateRows(card(bad, bad))
    assert.equal(row.id, 'ja-restaurant', `the card stays (${String(bad)})`)
    assert.equal(row.template.image, null, String(bad))
    assert.equal(row.template.layouts[0].shots.desktop, null, String(bad))
  }
  const [odd] = templateRows({ templates: [{ id: 'x', card: { image: '../secrets' } }] })
  assert.equal(odd.template.image, null)
  assert.deepEqual(odd.template.demo, { url: '', version: '' }, 'a card with no demo frames nothing')
  assert.deepEqual(odd.template.layouts, [])
})

test('pictureAddress: what a component may draw — http(s), or a same-origin rooted fixture path', () => {
  assert.equal(pictureAddress('https://a.example/x.png'), 'https://a.example/x.png')
  // The design bench's Vite fixtures are same-origin rooted paths; nothing off the door is one.
  assert.equal(
    pictureAddress('/src/pages/in-dsh/fixtures/business-home-1440.png'),
    '/src/pages/in-dsh/fixtures/business-home-1440.png'
  )
  for (const bad of [
    'home.png',
    'template/x/home.png',
    'https:x.png',
    'https:/x.png',
    '//evil.example/x.png',
    '/a/../b.png',
    '/\\evil',
    'file:///x.png',
    'javascript:alert(1)',
    '',
    null,
    undefined,
    3
  ]) {
    assert.equal(pictureAddress(bad), null, String(bad))
  }
})

test('the door and the mapping are one: what Tracy answers is what the rows say', async () => {
  const rows = await templatesFromTracy(
    'https://cowork.tracy.ai',
    async () => new Response(JSON.stringify(SERVED), { status: 200 })
  )
  assert.deepEqual(rows, templateRows(SERVED))
})

const { previewSrc } = await import('../src/client/templates.mjs')

test('previewSrc joins the demo to a layout instead of gluing them, and loads where the page answers', () => {
  // The two facts that make gluing wrong: `demoAddress` always ends the demo URL in a slash, and
  // every layout path begins with one. Measured 17/09 against the demo itself —
  // `/index.php/our-services` answers 200, `//index.php/our-services` answers 404 — so for months
  // the frame asked for a page the site does not have and showed the customer its "not found".
  const demo = 'http://ja-vital-joomla.tracy.test:51710/'
  assert.equal(
    previewSrc(demo, { path: '/our-services', address: '/index.php/our-services' }, 'light'),
    'http://ja-vital-joomla.tracy.test:51710/index.php/our-services?theme=light'
  )
  // No address: the path is the address, and it is still joined rather than glued.
  assert.equal(
    previewSrc(demo, { path: '/blog' }, 'dark'),
    'http://ja-vital-joomla.tracy.test:51710/blog?theme=dark'
  )
  assert.equal(
    previewSrc(demo, { path: '/' }, 'light'),
    'http://ja-vital-joomla.tracy.test:51710/?theme=light'
  )

  // A base WITHOUT the trailing slash must land in the same place — the join is what decides, not
  // the shape the caller happened to be handed.
  assert.equal(
    previewSrc('http://demo.test:8080', { path: '/blog' }, 'light'),
    'http://demo.test:8080/blog?theme=light'
  )

  // ⚠ A LAYOUT MAY ALREADY CARRY A QUERY. A Joomla with SEF off addresses every page as
  // `/index.php?option=com_content&id=7`; `theme` must become one more parameter, never a second
  // `?` that turns the whole thing into one unreadable string.
  const q = new URL(previewSrc(demo, { address: '/index.php?option=com_content&id=7' }, 'dark'))
  assert.equal(q.pathname, '/index.php')
  assert.equal(q.searchParams.get('option'), 'com_content')
  assert.equal(q.searchParams.get('id'), '7')
  assert.equal(q.searchParams.get('theme'), 'dark')

  // An elided path is a label the editor wrote, not an address: the home page, not a 404.
  assert.equal(previewSrc(demo, { path: '/pages/…/deep' }, 'light'), `${demo}?theme=light`)

  // Nothing to load from is empty rather than a broken URL, and a layout with nothing usable is
  // still the demo's front page.
  assert.equal(previewSrc('', { path: '/blog' }, 'light'), '')
  assert.equal(previewSrc(demo, {}, 'light'), `${demo}?theme=light`)
  assert.equal(previewSrc(demo, undefined, 'light'), `${demo}?theme=light`)
})

test('the demo-frame door travels with the demo only as the address tracy-web wrote', () => {
  const served = (probe) => ({
    templates: [
      {
        id: 'tracy-business',
        label: 'Tracy Business',
        card: { demo: { url: 'https://business-emdash.tracy.site/', version: '1.0.0', probe } },
        platforms: [{ platform: 'emdash', tag: 'tracy-business/emdash-0.x', version: '1.0.0' }]
      }
    ]
  })
  const [withDoor] = templateRows(served('https://cowork.tracy.site/api/templates/tracy-business/demo-frame'))
  assert.deepEqual(withDoor.template.demo, {
    url: 'https://business-emdash.tracy.site/',
    version: '1.0.0',
    probe: 'https://cowork.tracy.site/api/templates/tracy-business/demo-frame'
  })
  // A bare path is not an address a card on another surface could fetch; it is dropped, and the
  // card then keeps its poster — the same "advertise less, never wrongly" every picture follows.
  const [withoutDoor] = templateRows(served('api/templates/tracy-business/demo-frame'))
  assert.deepEqual(withoutDoor.template.demo, {
    url: 'https://business-emdash.tracy.site/',
    version: '1.0.0'
  })
  const [none] = templateRows(served(undefined))
  assert.equal(none.template.demo.probe, undefined)
})

test('the card poster is the home page at the demo’s own width, so the live frame fades in without a jump (#523)', () => {
  const at = (file) => `https://cowork.tracy.site/api/templates/ja-vega/shots/${file}?v=0123abcd`
  const mobile = at('ja-vega-home-390.png')
  const desktop = at('ja-vega-home-1440.png')
  const demo = { url: 'https://ja-vega-joomla.tracy.site/', version: '1.0.0' }
  const layouts = [
    { key: 'about', label: 'About', path: '/about', shots: { desktop: at('ja-vega-about-1440.png') } },
    { key: 'home', label: 'Home', path: '/', shots: { desktop, mobile } }
  ]
  // Measured on JA Vega: `card.image` is the 390-px phone shot while the frame is 1440×900. The
  // poster is the HOME layout's desktop shot — even when home is not the first layout.
  assert.equal(cardPoster({ image: mobile, demo, layouts }), desktop)
  // No desktop shot on home: the card's own picture. Another page's desktop shot is never borrowed.
  assert.equal(
    cardPoster({ image: mobile, demo, layouts: [layouts[0], { key: 'home', shots: { mobile } }] }),
    mobile
  )
  assert.equal(cardPoster({ image: mobile, demo, layouts: [layouts[0]] }), mobile)
  assert.equal(cardPoster({ image: mobile, demo, layouts: [] }), mobile)
  assert.equal(cardPoster({ image: mobile, demo }), mobile)
  // A desktop shot that is not an address is no picture, so the card's own picture stands in.
  assert.equal(
    cardPoster({ image: mobile, demo, layouts: [{ key: 'home', shots: { desktop: 'home-1440.png' } }] }),
    mobile
  )
  // Nothing drawable at all: null, the empty block — never a broken image.
  assert.equal(
    cardPoster({ image: 'home-390.png', demo, layouts: [{ key: 'home', shots: { desktop: null } }] }),
    null
  )
  assert.equal(cardPoster({ image: null, demo, layouts: [] }), null)
  // No live demo: the card keeps the picture it was published with.
  assert.equal(cardPoster({ image: mobile, demo: { url: '', version: '' }, layouts }), mobile)
  assert.equal(cardPoster({ image: null, demo: { url: '', version: '' }, layouts }), null)
  assert.equal(cardPoster(undefined), null)

  // And the frame opens on that same page: home, else the first layout.
  assert.equal(homeLayout(layouts)?.key, 'home')
  assert.equal(homeLayout([layouts[0]])?.key, 'about')
  assert.equal(homeLayout([]), undefined)
  assert.equal(homeLayout(undefined), undefined)
})

test('what tracy-web answers for a card becomes the poster the grid draws', () => {
  const [row] = templateRows(SERVED)
  assert.equal(cardPoster(row.template), row.template.layouts[0].shots.desktop)
  assert.notEqual(cardPoster(row.template), row.template.image, 'not the phone shot')
})

test('a served card carries the design system it wears, or null; the row keeps it for the preview and the create press', () => {
  const [plain] = templateRows(SERVED)
  assert.equal(plain.design, null, 'a card tracy-web joined no design onto is null here, not a guess')
  const wearing = { templates: [{ ...SERVED.templates[0], design: { id: 'apple', source: 'catalog' } }] }
  assert.deepEqual(templateRows(wearing)[0].design, { id: 'apple', source: 'catalog' })
  const odd = { templates: [{ ...SERVED.templates[0], design: 'apple' }] }
  assert.equal(templateRows(odd)[0].design, null, 'a design of another shape is not read')
})

test('a card opens on the side its listing names, and only when it has both sides', () => {
  const row = (card) =>
    templateRows({
      templates: [
        { id: 'ja-boxing', label: 'JA Boxing', card, platforms: [{ platform: 'joomla', tag: 'q/j6' }] }
      ]
    })[0].template.defaultTheme
  assert.equal(row({ dark: true, defaultTheme: 'dark' }), 'dark')
  assert.equal(row({ dark: true, defaultTheme: 'light' }), 'light')
  assert.equal(row({ dark: true }), 'light')
  // One side only: a stale defaultTheme never turns a single-mode card dark.
  assert.equal(row({ dark: false, defaultTheme: 'dark' }), 'light')
})
