// `content.contract` on an EmDash site (src/sites/emdash-contract.js): the JA Diner release's content map read and written
// over the site's own MCP tools, in the protocol the write step speaks on Joomla — inspect, then one apply, all or nothing,
// refusals by slot. The site is the release's own seed behind fake tools (_emdash-mcp-site.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EMDASH_INFO,
  emdashBrandCall,
  emdashContractCall,
  emdashContractOf,
  markdownOf,
  plainOf,
  rememberEmdashPicture
} from '../src/sites/emdash-contract.js'
import {
  HIDE_ORDERS_DOOR,
  opens,
  PAGE_CREATE_DOOR,
  ROWS_REMOVE_DOOR
} from '../src/write-step/plugin-doors.js'
import { DINER_CONTRACT, DINER_SITE, dinerContentMap, emdashMcpSite } from './_emdash-mcp-site.mjs'

const SITE_KEY = 'emd-contract.sites.example'
const sha = (c) => c.repeat(64)

function door(site, siteKey = SITE_KEY) {
  const contentMap = dinerContentMap()
  return (params) =>
    emdashContractCall({ siteKey, params, contract: DINER_CONTRACT, contentMap, calls: site.calls })
}
const inspect = async (ask) => (await ask({ operation: 'inspect' })).body
const applyOf = (revision, more) => ({
  operation: 'apply',
  expected_revision: revision,
  apply_id: 'contract-t1',
  ...more
})

test('the site row names its release: the JA Diner content map, and nothing for a release with none', () => {
  const found = emdashContractOf(DINER_SITE)
  assert.equal(found.contract, DINER_CONTRACT)
  assert.ok(found.contentMap.slots.length > 400)
  assert.equal(emdashContractOf({ quickstart_tag: 'tracy-diner/emdash-0.x', quickstart_version: null }), null)
  assert.equal(
    emdashContractOf({ quickstart_tag: 'quickstart/ja-diner/j6', quickstart_version: '1.0.8' }),
    null
  )
  assert.equal(emdashContractOf(null), null)
})

test('inspect: the slots the site holds, with what each holds now, its pages, and a revision that stays put', async () => {
  const site = emdashMcpSite()
  const ask = door(site)
  const reading = await inspect(ask)
  assert.equal(reading.ok, true)
  assert.equal(reading.contract, DINER_CONTRACT)
  assert.match(reading.revision, /^emdash-[0-9a-f]{40}$/)
  const by = new Map(reading.slots.map((s) => [s.key, s]))
  assert.equal(by.get('settings.title').current, 'JA Diner')
  assert.equal(by.get('settings.title').canHide, false)
  assert.equal(by.get('slideshow.slideshow.items[0].button1').current, 'Book a Table')
  assert.equal(by.get('slideshow.slideshow.items[0].button1').row, 'slideshow.slideshow.items[0]')
  assert.equal(by.get('slideshow.slideshow.items[0].button1').canHide, 'unmeasured')
  assert.equal(by.get('taxonomy.category.our-blog').current, 'Our Blog')
  // A rich text field reads as its words (the tool's Markdown), never as blocks.
  assert.match(by.get('posts.lorem-ipsum.body').current, /^Lorem ipsum dolor sit amet/)
  assert.deepEqual(
    reading.pages.find((p) => p.entity === 'pages.home'),
    {
      entity: 'pages.home',
      route: '/',
      title: 'Home',
      published: true
    }
  )
  // Reads only, in one host request of the mapped entities.
  assert.ok(site.sent.every((c) => /_get$|_list_terms$/.test(c.tool)))
  assert.equal((await inspect(ask)).revision, reading.revision)
})

test('apply: words, a repeater row, rich text, a date, a term, a setting and emptied slots land, each entry published once', async () => {
  const site = emdashMcpSite()
  const ask = door(site)
  const { revision } = await inspect(ask)
  site.sent.length = 0
  const done = await ask(
    applyOf(revision, {
      changes: {
        'settings.title': 'Harbour Kitchen',
        'pages.home.title': 'Welcome',
        'slideshow.slideshow.items[0].button1': 'Book now',
        'slideshow.slideshow.items[1].title': '((p))Fresh fish((/p))\n((p))Every morning((/p))',
        'posts.lorem-ipsum.body':
          '((p))Our ((strong))first((/strong)) day.((/p))\n((ul))\n((li))Tea((/li))\n((li))Cake((/li))\n((/ul))',
        'posts.lorem-ipsum.date': '2026-11-01T10:00:00.000Z',
        'taxonomy.category.our-blog': 'News'
      },
      empty_slots: ['slideshow.slideshow.items[0].button2']
    })
  )
  assert.equal(done.outcome, 'ok', JSON.stringify(done.body))
  assert.equal(done.body.ok, true)
  assert.equal(site.settings.title, 'Harbour Kitchen')
  assert.equal(site.entry('pages', 'home').data.title, 'Welcome')
  const slides = site.entry('slideshow', 'slideshow').data.items
  assert.equal(slides[0].button1, 'Book now')
  assert.equal(slides[0].button2, '')
  assert.equal(slides[0].desc.startsWith('Nonimperdiet'), true, 'the rest of the row is kept')
  assert.equal(slides[1].title, 'Fresh fish\nEvery morning', 'a plain field takes the words alone')
  assert.equal(site.entry('posts', 'lorem-ipsum').data.body, 'Our **first** day.\n\n- Tea\n- Cake')
  assert.equal(site.entry('posts', 'lorem-ipsum').data.date, '2026-11-01T10:00:00.000Z')
  assert.equal(site.terms.get('category').find((t) => t.slug === 'our-blog').label, 'News')
  const updates = site.sent.filter((c) => c.tool === 'content_update')
  assert.equal(updates.length, 3, 'one update per entry')
  assert.ok(updates.every((c) => c.args.status === 'published' && typeof c.args._rev === 'string'))
  // The repeater is written whole, from the rows the site held.
  assert.equal(updates.find((c) => c.args.collection === 'slideshow').args.data.items.length, slides.length)
})

test('🔒 all or nothing: a refused slot is named with its code, and nothing is written', async () => {
  const site = emdashMcpSite()
  const ask = door(site)
  const { revision } = await inspect(ask)
  site.sent.length = 0
  const done = await ask(
    applyOf(revision, {
      changes: {
        'pages.home.title': 'Welcome',
        'slideshow.slideshow.items[0].btn_link1': 'Book a table today',
        'posts.lorem-ipsum.date': 'next Tuesday',
        'pages.nowhere.title': 'x',
        'taxonomy.category.our-blog': ' '
      },
      empty_slots: ['settings.title'],
      empty_links: ['slideshow.slideshow.items[0].btn_link2']
    })
  )
  assert.equal(done.outcome, 'refused')
  assert.equal(done.body.ok, false)
  const codes = Object.fromEntries(done.body.errors.map((e) => [e.field.slotKey, e.code]))
  assert.deepEqual(codes, {
    'slideshow.slideshow.items[0].btn_link2': 'SLOT_NOT_HIDEABLE',
    'slideshow.slideshow.items[0].btn_link1': 'SLOT_BAD_URL',
    'posts.lorem-ipsum.date': 'SLOT_BAD_DATE',
    'pages.nowhere.title': 'SLOT_UNKNOWN',
    'taxonomy.category.our-blog': 'SLOT_REQUIRED',
    'settings.title': 'SLOT_NOT_HIDEABLE'
  })
  assert.equal(site.entry('pages', 'home').data.title, 'Home')
  assert.equal(site.sent.filter((c) => !/_get$|_list_terms$/.test(c.tool)).length, 0)
})

test('🔒 the revision: a change between inspect and apply refuses the apply, as the plugin does', async () => {
  const site = emdashMcpSite()
  const ask = door(site)
  const { revision } = await inspect(ask)
  const e = site.entries.get('pages/about-us')
  e.rev += 1
  const done = await ask(applyOf(revision, { changes: { 'pages.home.title': 'Welcome' } }))
  assert.equal(done.body.error, 'revision_mismatch')
  assert.equal(done.body.message, 'Content changed; inspect again')
  assert.equal(site.entry('pages', 'home').data.title, 'Home')
})

test('pictures: the path the run uploaded becomes the library item, found by its upload or by its file name', async () => {
  const fresh = {
    id: 'MEDIA01',
    filename: `${sha('a')}.jpg`,
    storageKey: 'k-fresh.jpg',
    width: 2160,
    height: 1260,
    mimeType: 'image/jpeg'
  }
  const older = {
    id: 'MEDIA02',
    filename: `${sha('b')}.webp`,
    storageKey: 'k-older.webp',
    mimeType: 'image/webp'
  }
  const deduped = { id: 'MEDIA03', filename: 'item-1.jpg', storageKey: 'k-seed.jpg', mimeType: 'image/jpeg' }
  const filler = Array.from({ length: 150 }, (_, i) => ({
    id: `F${i}`,
    filename: `f${i}.jpg`,
    storageKey: `f${i}`
  }))
  const site = emdashMcpSite({ media: [fresh, ...filler, older, deduped] })
  // A picture of the same bytes as a seeded one answered the seeded item, under its own file name.
  rememberEmdashPicture(SITE_KEY, `${sha('c')}.jpg`, 'MEDIA03')
  const ask = door(site)
  const { revision } = await inspect(ask)
  const done = await ask(
    applyOf(revision, {
      changes: {
        'slideshow.slideshow.items[0].image': `images/tracy-content/${sha('a')}.jpg`,
        'slideshow.slideshow.items[1].image': `images/tracy-content/${sha('b')}.webp`,
        'features_intro.meet-three-broomsticks.items[0].ft_img': `images/tracy-content/${sha('c')}.jpg`
      }
    })
  )
  assert.equal(done.body.ok, true, JSON.stringify(done.body))
  const rows = site.entry('slideshow', 'slideshow').data.items
  assert.deepEqual(rows[0].image, {
    id: 'MEDIA01',
    provider: 'local',
    meta: { storageKey: 'k-fresh.jpg' },
    src: '/_emdash/api/media/file/k-fresh.jpg',
    width: 2160,
    height: 1260,
    alt: '',
    mimeType: 'image/jpeg'
  })
  assert.equal(rows[1].image.id, 'MEDIA02', 'found on the second page of the library')
  assert.equal(
    site.entry('features_intro', 'meet-three-broomsticks').data.items[0].ft_img.id,
    'MEDIA03',
    'the upload answered it'
  )
  // Read back by inspect as the page draws it.
  const again = await inspect(ask)
  assert.equal(
    again.slots.find((s) => s.key === 'slideshow.slideshow.items[0].image').current,
    '/_emdash/api/media/file/k-fresh.jpg'
  )
})

test('a picture the library does not hold, or words in a picture slot, refuse that slot only', async () => {
  const site = emdashMcpSite()
  const ask = door(site, 'emd-other.sites.example')
  const { revision } = await inspect(ask)
  const done = await ask(
    applyOf(revision, {
      changes: {
        'pages.home.title': 'Welcome',
        'slideshow.slideshow.items[0].image': `images/tracy-content/${sha('d')}.jpg`,
        'slideshow.slideshow.items[1].image': 'Guests dining on Emirati dishes'
      }
    })
  )
  const codes = Object.fromEntries(done.body.errors.map((e) => [e.field.slotKey, e.code]))
  assert.deepEqual(codes, {
    'slideshow.slideshow.items[1].image': 'SLOT_BAD_PICTURE',
    'slideshow.slideshow.items[0].image': 'PICTURE_NOT_IN_LIBRARY'
  })
  assert.equal(site.entry('pages', 'home').data.title, 'Home')
})

test('a draft entry gets its words and stays a draft', async () => {
  const site = emdashMcpSite({ drafts: ['pages/offers'] })
  const ask = door(site)
  const { revision } = await inspect(ask)
  site.sent.length = 0
  const done = await ask(applyOf(revision, { changes: { 'pages.offers.title': 'Set menus' } }))
  assert.equal(done.body.ok, true)
  assert.equal(site.entry('pages', 'offers').status, 'draft')
  assert.equal(site.sent.find((c) => c.tool === 'content_update').args.status, undefined)
})

test('a write the site refuses after another landed is said as one that landed, so the run inspects again', async () => {
  const site = emdashMcpSite({
    refuseUpdate: (args) => (args.collection === 'posts' ? 'Field "body" is too long' : null)
  })
  const ask = door(site)
  const { revision } = await inspect(ask)
  const done = await ask(
    applyOf(revision, {
      changes: { 'pages.home.title': 'Welcome', 'posts.lorem-ipsum.title': 'Opening day' }
    })
  )
  assert.equal(done.outcome, 'unknown')
  assert.equal(done.landed, true)
  assert.equal(done.body.error, 'write_failed')
  assert.equal(done.body.landed, true)
  assert.match(
    done.body.message,
    /^1 of 2 writes were refused by the site \(posts\.lorem-ipsum: Field "body" is too long\); the others landed$/
  )
})

test('an operation EmDash has no door for is refused by name; a host that does not answer is said as such', async () => {
  const site = emdashMcpSite()
  const done = await door(site)({ operation: 'rows.remove', slots: ['x'] })
  assert.equal(done.body.error, 'operation_not_on_emdash')
  assert.match(done.body.message, /rows\.remove has no EmDash door/)
  const down = await emdashContractCall({
    siteKey: SITE_KEY,
    params: { operation: 'inspect' },
    contract: DINER_CONTRACT,
    contentMap: dinerContentMap(),
    calls: async () => ({ ok: false, code: 'NO_TOKEN', detail: 'the agent token file is not present' })
  })
  assert.equal(down.body.code, 'EMDASH_NO_TOKEN')
  assert.equal(down.outcome, 'refused')
  // `info` as the write step's stages read it (plugin-doors.js): hide orders open, no rows.remove, no page creation.
  assert.equal(opens(HIDE_ORDERS_DOOR, EMDASH_INFO), true)
  assert.equal(opens(ROWS_REMOVE_DOOR, EMDASH_INFO), false)
  assert.equal(opens(PAGE_CREATE_DOOR, EMDASH_INFO), false)
})

test("the contract's markup becomes Markdown for rich text and words alone for a plain field", () => {
  assert.equal(markdownOf('Just words'), 'Just words')
  assert.equal(markdownOf('((p))One((/p))\n((p))Two((/p))'), 'One\n\nTwo')
  assert.equal(markdownOf('((ol))\n((li))A((/li))\n((li))B((/li))\n((/ol))'), '1. A\n2. B')
  assert.equal(markdownOf('((p))A ((em))b((/em)) ((span class="x"))c((/span))((/p))'), 'A *b* c')
  assert.equal(plainOf('Hey Harry!!!<br/> Are you ready?'), 'Hey Harry!!!<br/> Are you ready?')
  assert.equal(plainOf('((p))One((/p))\n((p))Two((/p))'), 'One\nTwo')
  assert.equal(plainOf('((span class="accent"))Fresh((/span)) fish'), 'Fresh fish')
})

test("the brand's logo and favicon go into the core settings; the dark logo into the chrome entry's picture field", async () => {
  const logo = { id: 'LOGO1', filename: `${sha('e')}.png`, storageKey: 'k-logo.png', mimeType: 'image/png' }
  const site = emdashMcpSite({ media: [logo] })
  const ask = (action, params) => emdashBrandCall({ action, params, calls: site.calls })
  const set = await ask('emdash.settings', {
    operation: 'set',
    apply_id: 'brand-1',
    fields: { logo: { mediaId: 'LOGO1' }, favicon: { mediaId: 'LOGO1', alt: 'Harbour Kitchen' } }
  })
  assert.equal(set.outcome, 'ok')
  assert.deepEqual(site.settings.logo, { mediaId: 'LOGO1' })
  assert.deepEqual(site.settings.favicon, { mediaId: 'LOGO1', alt: 'Harbour Kitchen' })
  const read = await ask('emdash.settings', { operation: 'read' })
  assert.equal(read.body.fields.logo.mediaId, 'LOGO1')
  // Only the brand's two settings: anything else is refused and nothing is sent.
  site.sent.length = 0
  const other = await ask('emdash.settings', { operation: 'set', fields: { title: 'x' } })
  assert.equal(other.body.error, 'unsupported')
  assert.equal(
    (await ask('emdash.settings', { operation: 'set', fields: { logo: { id: 'LOGO1' } } })).body.error,
    'bad_params'
  )
  assert.deepEqual(site.sent, [])

  const dark = await ask('emdash.entryField', {
    operation: 'set',
    collection: 'chrome',
    slug: 'chrome',
    field: 'logo_dark',
    label: 'Logo for dark backgrounds',
    media: 'LOGO1'
  })
  assert.equal(dark.body.ok, true, JSON.stringify(dark.body))
  assert.deepEqual(dark.body.locales, ['en'])
  assert.equal(site.entry('chrome', 'chrome').data.logo_dark.id, 'LOGO1')
  assert.equal(site.entry('chrome', 'chrome').data.logo_dark.src, '/_emdash/api/media/file/k-logo.png')
  assert.equal(site.entry('chrome', 'chrome').status, 'published')
  const back = await ask('emdash.entryField', {
    operation: 'read',
    collection: 'chrome',
    slug: 'chrome',
    field: 'logo_dark'
  })
  assert.equal(back.body.mediaId, 'LOGO1')
  const missing = await ask('emdash.entryField', {
    operation: 'set',
    collection: 'chrome',
    slug: 'chrome',
    field: 'logo_dark',
    media: 'NOPE'
  })
  assert.equal(missing.body.error, 'not_found')
})

test('the menus are slots too: a label is changed and an emptied item leaves the menu, the rest kept in order', async () => {
  const site = emdashMcpSite()
  const ask = door(site)
  const reading = await inspect(ask)
  const labels = reading.slots.filter((s) => s.key.startsWith('menu.primary.'))
  assert.deepEqual(
    labels.map((s) => [s.key, s.current]),
    [
      ['menu.primary.1.label', 'Home'],
      ['menu.primary.2.label', 'About Us'],
      ['menu.primary.3.label', 'Reservation'],
      ['menu.primary.4.label', 'Offers'],
      ['menu.primary.5.label', 'Our Blog'],
      ['menu.primary.6.label', 'Contact Us']
    ]
  )
  assert.equal(labels[3].canHide, 'unmeasured')
  const done = await ask(
    applyOf(reading.revision, {
      changes: { 'menu.primary.2.label': 'Our story' },
      empty_slots: ['menu.primary.4.label', 'menu.primary.5.label']
    })
  )
  assert.equal(done.body.ok, true, JSON.stringify(done.body))
  const items = site.menus.get('primary').items
  assert.deepEqual(
    items.map((i) => [i.label, i.customUrl]),
    [
      ['Home', '/'],
      ['Our story', '/about-us'],
      ['Reservation', '/reservation'],
      ['Contact Us', '/contact-us']
    ]
  )
  // A menu label is never emptied by words: that is what taking the item off is for.
  const again = await inspect(ask)
  const blank = await ask(applyOf(again.revision, { changes: { 'menu.primary.1.label': ' ' } }))
  assert.equal(blank.body.errors[0].code, 'SLOT_REQUIRED')
})
