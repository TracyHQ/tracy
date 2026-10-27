/**
 * What a Website Opportunities build has nothing true for is hidden, never cut (`wp-hide.js`), read on JA Restaurant WP 1.0.1's
 * own home page: the menu keeps the restaurant's dishes and no demo dish, price, special or testimonial a visitor can read,
 * and every block a contract slot writes into is still in the body (the plugin refuses guided edits of a site that lost one).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { leavesOf, namedBlocks, parseBlocks } from '../src/sites/brief-engines/wp-blocks.js'
import { hideBlocks, shownOnly } from '../src/sites/brief-engines/wp-hide.js'
import { writeFacts } from '../src/sites/brief-engines/wp-facts.js'
import {
  editBlocks,
  slotBlocksByPage,
  slotBlocksLost,
  sweepWordPress,
  writtenLines
} from '../src/sites/brief-engines/wp-residue.js'
import { linksOff } from '../src/sites/brief-engines/wp-unlink.js'
import {
  dishItemPictures,
  fillDishItems,
  markSections,
  NEUTRAL_ITEM,
  UNSOURCED
} from '../src/sites/brief-engines/wp-wo-fill.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'

const HOME = readFileSync(
  new URL('./fixtures/ja-restaurant-wp7-1.0.1-homepage.html', import.meta.url),
  'utf8'
)
const CONTRACT = new URL(
  '../../../packages/cms/tracy-wordpress-quickstart/contracts/ja-restaurant/wp7/1.0.1/content-map.json',
  import.meta.url
)
const contentMap = JSON.parse(readFileSync(CONTRACT, 'utf8'))
const keep = slotBlocksByPage(contentMap).get('homepage') ?? new Set()
/** The words a visitor reads: every leaf of the body less its hidden blocks. */
const visible = (/** @type {string} */ markup) => {
  const shown = shownOnly(markup)
  const root = parseBlocks(shown)
  assert.ok(root)
  return leavesOf(shown, root).join(' / ')
}

test('a hidden block carries blockVisibility false and nothing else of the body moves', () => {
  const out = hideBlocks(HOME, [{ block: 'menu.item.3', nth: 1 }])
  assert.equal(out.hidden, 1)
  const item = namedBlocks(parseBlocks(out.markup), 'menu.item.3')[0]
  assert.equal(item.attrs.metadata.blockVisibility, false)
  assert.equal(item.attrs.metadata.name, 'menu.item.3')
  assert.equal(out.markup.replace('"blockVisibility":false,', ''), HOME)
  assert.equal(
    hideBlocks(out.markup, [{ block: 'menu.item.3', nth: 1 }]).hidden,
    0,
    'a retry hides nothing twice'
  )
})

// 🔒 Replace, never remove (product owner, 22/10/2026): the JA Restaurant WP demo hid every dish item and price nothing true
// was collected for, and its pages looked broken. One sourced dish and no price: every dish item of the release's home and
// menu pages stays, nothing is hidden, and no demo dish, price or picture is left in them.
test('JA Restaurant WP, one sourced dish and no price: every dish item stays, nothing hidden, no demo price or picture', async () => {
  const domain = await websiteOpportunitiesDomain()
  const { contractCopyPins, slotRolesFor } = domain
  const map = slotRolesFor('wordpress', 'ja-restaurant')
  const dishes = [
    {
      value: { name: 'Cao lau', description: 'Hoi An noodles with pork and greens.' },
      source: 'post:facebook:1'
    }
  ]
  const copy = contractCopyPins({ map, contentMap, pinned: { dishes } })
  assert.equal(copy.hidden, undefined)
  const picture = 'wp-content/uploads/tracy-content/0a1b2c.jpg'
  const demoDishes = [
    'Chili Chicken',
    'Calamari Fritti',
    'Lettuce Wraps',
    'Lobster Linguine',
    'Wood-Fired Ribeye',
    'Tiramisu'
  ]
  for (const [slug, file] of [
    ['homepage', 'homepage'],
    ['menu', 'menu']
  ]) {
    const body = readFileSync(
      new URL(`./fixtures/ja-restaurant-wp7-1.0.1-${file}.html`, import.meta.url),
      'utf8'
    )
    const pageKeep = slotBlocksByPage(contentMap).get(slug) ?? new Set()
    // The contract door writes the first block of each name: done here by block, as the door does. It writes no empty
    // value (`contractValue`): those blocks are the sweep's to empty.
    const blockOf = (/** @type {string} */ key) => contentMap.slots.find((s) => s.key === key).target.block
    const blank = new Set(
      Object.entries(copy.pins)
        .filter(([key, value]) => key.startsWith(`${slug}.`) && value === '')
        .map(([key]) => blockOf(key))
    )
    assert.ok(blank.size > 0, `${slug}: a dish item with no dish has an empty description`)
    const edits = Object.entries(copy.pins)
      .filter(([key, value]) => key.startsWith(`${slug}.`) && value !== '')
      .map(([key, value]) => ({
        block: blockOf(key),
        nth: 1,
        value
      }))
    const written = editBlocks(body, edits, [], pageKeep)
    const filled = fillDishItems(written.markup, {
      keep: pageKeep,
      blank,
      dishes: copy.dishes,
      neutralPicture: picture,
      neutralAlt: 'Quan Ngon'
    })
    const { markup: out, sections } = markSections(filled.markup)
    assert.equal(slotBlocksLost(body, out, pageKeep), 0, `${slug}: every slot block is still in the body`)
    assert.ok(!out.includes('blockVisibility'), `${slug}: nothing is hidden`)
    const before = parseBlocks(body)
    const after = parseBlocks(out)
    assert.ok(after)
    const items = (/** @type {any} */ root) => {
      const all = []
      const walk = (/** @type {any} */ n) =>
        n.children.forEach(
          (c) => (/\.item\.\d+$/.test(c.attrs?.metadata?.name ?? '') && all.push(c), walk(c))
        )
      walk(root)
      return all.filter(
        (n) =>
          out.slice(n.start, n.end).includes('dish-name') || body.slice(n.start, n.end).includes('dish-name')
      )
    }
    assert.equal(items(after).length, items(before).length, `${slug}: every dish item stays`)
    assert.equal(after.children.length, before.children.length, `${slug}: every section stays`)
    assert.ok(
      sections.length >= 5 && sections.every((name) => out.includes(`tracy-sec-${name}`)),
      `${slug}: ${sections}`
    )
    const seen = leavesOf(out, after).join(' / ')
    assert.ok(seen.includes('Cao lau'), `${slug}: the sourced dish`)
    assert.ok(seen.includes(NEUTRAL_ITEM), `${slug}: the neutral dish name`)
    // 🔒 No filler (plan §7, 26/10/2026): what nothing was collected for is empty.
    for (const filler of domain.forbiddenFillers('en'))
      assert.ok(!seen.includes(filler), `${slug}: ${filler}`)
    for (const demo of demoDishes) assert.ok(!seen.includes(demo), `${slug}: ${demo}`)
    assert.ok(!/\$\s?\d/.test(seen), `${slug}: no demo price: ${seen.match(/.{20}\$\s?\d+.{5}/)?.[0]}`)
    let seenBadges = 0
    for (const item of items(after)) {
      const markup = out.slice(item.start, item.end)
      for (const src of markup.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/g))
        assert.equal(src[1], `/${picture}`, `${slug}: a demo picture is left in a dish item`)
      // A dish item with no photo of its own: the neutral picture, its alt naming no dish. With no dish: the neutral name,
      // an empty description and price.
      // A badge ("Hot", "Sale") is never collected: empty on every dish item, its block kept.
      const badges = []
      const walkBadges = (/** @type {any} */ n) =>
        n.children.forEach(
          (c) => (
            /\.dish-extra-class\.\d+$/.test(c.attrs?.metadata?.name ?? '') && badges.push(c), walkBadges(c)
          )
        )
      walkBadges(item)
      for (const b of badges) {
        assert.deepEqual(leavesOf(out, b), [], `${slug}: a badge keeps its block, empty`)
        // The theme paints `.badge` as a pill with no words in it: the class goes from the comment and the tag alike.
        assert.ok(
          !String(b.attrs?.className ?? '')
            .split(/\s+/)
            .includes('badge'),
          `${slug}: a badge's comment class`
        )
        const tag = /^\s*<[a-z][a-z0-9]*\b[^>]*>/i.exec(out.slice(b.innerStart, b.innerEnd))?.[0] ?? ''
        assert.ok(tag && !/\sclass="[^"]*\bbadge\b/.test(tag), `${slug}: a badge's tag class: ${tag}`)
      }
      seenBadges += badges.length
      const lines = leavesOf(out, item)
      const name = lines.includes(NEUTRAL_ITEM) ? NEUTRAL_ITEM : null
      if (!name) continue
      for (const alt of markup.matchAll(/<img\b[^>]*\salt="([^"]*)"/g))
        assert.equal(alt[1], 'Quan Ngon', `${slug}: the picture's alt text names no dish`)
      assert.deepEqual(lines, [name], `${slug}: ${name} shows only its name: ${lines.join(' / ')}`)
      const described = []
      const walk = (/** @type {any} */ n) =>
        n.children.forEach(
          (c) => (
            /\.dish-description\.\d+$/.test(c.attrs?.metadata?.name ?? '') && described.push(c), walk(c)
          )
        )
      walk(item)
      assert.ok(described.length > 0, `${slug}: ${name} has a description block`)
      for (const d of described)
        assert.deepEqual(leavesOf(out, d), [], `${slug}: ${name} keeps its description block, empty`)
    }
    if (slug === 'menu') assert.ok(seenBadges > 0, 'the menu page has badges')
  }
})

test('the unlinked-button rule and the dish rule hide the same way: a hidden block the sweep meets again stays hidden', () => {
  const once = hideBlocks(HOME, [{ block: 'menu.root', nth: 2 }]).markup
  const again = linksOff(once, () => false, keep)
  assert.equal(again.markup, once)
})

test('the sweep hides the blocks named for a page, in the one write of that page, and counts them', async () => {
  const pages = [{ id: 97, slug: 'homepage', title: 'Home', status: 'publish', content: HOME }]
  /** @type {any[]} */
  const writes = []
  const call = async (/** @type {string} */ action, /** @type {any} */ params) => {
    if (action === 'content.update') {
      writes.push(params)
      return { ok: true }
    }
    if (action === 'content.get') return { ok: false, error: 'not_found', message: 'none' }
    const rows = params.post_type === 'page' ? pages : []
    return {
      ok: true,
      items: rows
        .slice(params.offset, params.offset + params.limit)
        .map((r) => ({ ...r, ...(params.include_body ? {} : { content: undefined }) }))
    }
  }
  const out = await sweepWordPress({
    call,
    applyId: 'residue-wo',
    written: writtenLines([]),
    entitySlugs: new Set(['homepage']),
    judged: { relabel: new Map() },
    hides: [
      { page: 'homepage', block: 'menu.root', nth: 2 },
      { page: 'homepage', block: 'menu.item.4', nth: 1 },
      { page: 'other', block: 'menu.item.5', nth: 1 }
    ],
    slotBlocks: slotBlocksByPage(contentMap),
    prune: false
  })
  assert.equal(out.blocksHidden, 2)
  const body = writes.find((w) => w.id === 97)?.fields.post_content
  assert.ok(body, 'the home page is written once')
  const root = parseBlocks(body)
  assert.equal(namedBlocks(root, 'menu.root')[1].attrs.metadata.blockVisibility, false)
  assert.equal(namedBlocks(root, 'menu.item.4')[0].attrs.metadata.blockVisibility, false)
  assert.equal(
    namedBlocks(root, 'menu.item.5')[0].attrs.metadata.blockVisibility,
    undefined,
    "another page's hide"
  )
  assert.equal(slotBlocksLost(HOME, body, keep), 0)
})

// Demo facts outside the slots (Sol review, 22/10/2026): the footer, the header's opening time, the hero's address link.
const FOOTER = readFileSync(
  new URL('./fixtures/ja-restaurant-wp7-1.0.1-footer.html', import.meta.url),
  'utf8'
)
const HEADER = readFileSync(
  new URL('./fixtures/ja-restaurant-wp7-1.0.1-header.html', import.meta.url),
  'utf8'
)

test("the restaurant's collected facts take the demo's place in the footer, the header and the hero; one not collected is hidden", async () => {
  const { contractCopyPins, slotRolesFor } = await websiteOpportunitiesDomain()
  const map = slotRolesFor('wordpress', 'ja-restaurant')
  const contact = {
    address: { value: '42 River Lane, Hoi An', source: 'business.address' },
    hours: { value: 'Mon–Sun 07:00–22:00', source: 'business.hours' },
    phone: { value: '+84 235 5550 188', source: 'business.phone' }
  }
  const { facts } = contractCopyPins({ map, contentMap, pinned: { contact } })
  const on = (/** @type {string} */ where) => facts.filter((f) => (f.part ?? f.page) === where)
  const footer = writeFacts(FOOTER, on('footer'))
  assert.equal(footer.written, 3)
  const seen = visible(footer.markup)
  for (const fact of ['42 River Lane, Hoi An', 'Mon–Sun 07:00–22:00', '+84 235 5550 188'])
    assert.ok(seen.includes(fact), fact)
  for (const demo of ['5th Avenue', '9 AM - 5 PM', '555-0110', '555-0111', 'res-restaurant'])
    assert.ok(!seen.includes(demo), demo)
  assert.ok(footer.markup.includes('href="tel:+842355550188"'))
  assert.ok(
    footer.markup.includes('query=42%20River%20Lane%2C%20Hoi%20An'),
    'the directions lead to the restaurant'
  )
  const header = writeFacts(HEADER, on('header'))
  assert.ok(visible(header.markup).includes('Mon–Sun 07:00–22:00'))
  assert.ok(!visible(header.markup).includes('7.00am'))
  const hero = writeFacts(HOME, on('homepage'))
  assert.equal(hero.written, 1)
  const address = (/** @type {string} */ m) => {
    const node = namedBlocks(parseBlocks(m), 'hero.hero-address')[0]
    return { text: leavesOf(m, node).join(' '), hidden: node.attrs.metadata.blockVisibility === false }
  }
  assert.deepEqual(address(hero.markup), { text: '42 River Lane, Hoi An', hidden: false })
  assert.equal(slotBlocksLost(HOME, hero.markup, keep), 0)
  // Nothing collected: every one of these blocks is hidden, none keeps the demo's.
  const { facts: none } = contractCopyPins({ map, contentMap, pinned: { contact: {} } })
  const bare = writeFacts(
    FOOTER,
    none.filter((f) => f.part === 'footer')
  )
  assert.equal(bare.hidden, 3)
  for (const demo of ['5th Avenue', '555-0110', 'res-restaurant'])
    assert.ok(!visible(bare.markup).includes(demo), demo)
  assert.equal(
    address(
      writeFacts(
        HOME,
        none.filter((f) => f.page === 'homepage')
      ).markup
    ).hidden,
    true
  )
})

test("the sweep writes the facts of a template part in that part's one write, and hides a block whose fact nobody collected", async () => {
  /** @type {any[]} */
  const writes = []
  const call = async (/** @type {string} */ action, /** @type {any} */ params) => {
    if (action === 'content.update') {
      writes.push(params)
      return { ok: true }
    }
    if (action === 'content.get' && params.kind === 'templatePart' && params.key === 'footer')
      return { ok: true, item: { content: FOOTER }, body_revision: 'r1' }
    if (action === 'content.get') return { ok: false, error: 'not_found', message: 'none' }
    return { ok: true, items: [] }
  }
  const out = await sweepWordPress({
    call,
    applyId: 'residue-wo',
    written: writtenLines([]),
    entitySlugs: new Set(),
    judged: { relabel: new Map() },
    facts: [
      {
        part: 'footer',
        block: 'footer.contact',
        nth: 1,
        lines: [{ label: 'Phone:', text: '+84 235 5550 188', href: 'tel:+842355550188' }]
      },
      { part: 'footer', block: 'footer.hours', nth: 1, lines: null },
      { page: 'homepage', block: 'footer.location', nth: 1, lines: null }
    ],
    prune: false
  })
  assert.equal(out.factsWritten, 1)
  assert.equal(out.blocksHidden, 1)
  const write = writes.find((w) => w.kind === 'templatePart' && w.key === 'footer')
  assert.equal(write.expected_body_revision, 'r1')
  const seen = visible(write.fields.content)
  assert.ok(seen.includes('+84 235 5550 188') && !seen.includes('555-0110') && !seen.includes('9 AM - 5 PM'))
  assert.ok(seen.includes('5th Avenue'), "a page's fact never reaches a part")
})

test("a paragraph's fact keeps every line it was given: the weekend's opening hours are not dropped", () => {
  const out = writeFacts(HEADER, [
    {
      block: 'header.open-time',
      nth: 1,
      lines: [{ text: 'Mon–Fri 07:00–22:00' }, { text: 'Sat–Sun 08:00–23:00' }]
    }
  ])
  assert.equal(out.written, 1)
  const seen = visible(out.markup)
  assert.ok(seen.includes('Mon–Fri 07:00–22:00') && seen.includes('Sat–Sun 08:00–23:00'), seen.slice(0, 200))
})

test("an opportunity's sweep marks each section and fills the dish items in the page's one write; another build's sweep does not", async () => {
  const run = async (/** @type {any} */ woFill) => {
    const pages = [{ id: 97, slug: 'homepage', title: 'Home', status: 'publish', content: HOME }]
    /** @type {any[]} */
    const writes = []
    const call = async (/** @type {string} */ action, /** @type {any} */ params) => {
      if (action === 'content.update') {
        writes.push(params)
        return { ok: true }
      }
      if (action === 'content.get') return { ok: false, error: 'not_found', message: 'none' }
      const rows = params.post_type === 'page' ? pages : []
      return {
        ok: true,
        items: rows
          .slice(params.offset, params.offset + params.limit)
          .map((r) => ({ ...r, ...(params.include_body ? {} : { content: undefined }) }))
      }
    }
    const out = await sweepWordPress({
      call,
      applyId: 'residue-wo',
      written: writtenLines([]),
      entitySlugs: new Set(['homepage']),
      judged: { relabel: new Map() },
      slotBlocks: slotBlocksByPage(contentMap),
      prune: false,
      woFill
    })
    return { out, body: writes.find((w) => w.id === 97)?.fields.post_content ?? null }
  }
  const wo = await run({
    dishes: [{ name: 'Cao lau', description: 'Noodles.', price: '' }],
    neutralPicture: null
  })
  assert.deepEqual(wo.out.sections, {
    homepage: [
      'slideshow',
      'opentable',
      'hero',
      'features-intro',
      'features-intro',
      'tabs',
      'menu',
      'menu',
      'menu',
      'home-news',
      'subscribe',
      'gallery-slide'
    ]
  })
  assert.ok(wo.body, 'the home page is written once')
  const root = parseBlocks(wo.body)
  assert.equal(root.children.length, parseBlocks(HOME).children.length)
  assert.match(namedBlocks(root, 'subscribe.root')[0].attrs.className, /\btracy-sec-subscribe\b/)
  assert.match(wo.body, /<section class="wp-block-group [^"]*\btracy-sec-menu\b/)
  assert.equal(slotBlocksLost(HOME, wo.body, keep), 0)
  assert.ok(wo.out.dishLines > 0)

  const other = await run(null)
  assert.deepEqual(other.out.sections, {})
  assert.equal(other.body, null, 'nothing of the home page changes on a build that is not an opportunity’s')
})

test('the sweep writes the domain’s neutral dish name and no filler', async () => {
  const domain = await websiteOpportunitiesDomain()
  assert.equal(NEUTRAL_ITEM, domain.neutralItemName())
  assert.equal(domain.forbiddenFillerText(NEUTRAL_ITEM), false)
  // test-quality: contract plan §7 (26/10/2026): a line with no source is empty
  assert.equal(UNSOURCED, '')
})

// 🔒 A dish item's picture is its own dish's (plan §7): "Phở bò" has a photo, "Bún chả" has none. "Bún chả" never shows "Phở bò"'s
// photo under its own name; it takes the neutral picture, whose alt names no dish.
test('the dish items no slot covers: each its own dish photo, a dish with none the neutral picture, never rotated', () => {
  const placed = dishItemPictures({
    receipts: {
      'a.jpg': { kind: 'photo', mediaId: 'p-pho', path: 'wp-content/uploads/tracy-content/pho.jpg' },
      'b.jpg': {
        kind: 'photo',
        mediaId: 'p-x',
        dish: 'Cơm tấm',
        path: 'wp-content/uploads/tracy-content/com.jpg'
      },
      'c.jpg': { kind: 'placeholder', path: 'wp-content/uploads/tracy-content/flat.png' }
    },
    dishes: [{ name: 'Phở bò', pictureId: 'p-pho' }, { name: 'Bún chả' }, { name: 'cơm  tấm' }]
  })
  assert.deepEqual(placed.dishes, [
    { name: 'Phở bò', picture: 'wp-content/uploads/tracy-content/pho.jpg' },
    { name: 'Bún chả' },
    { name: 'cơm  tấm', picture: 'wp-content/uploads/tracy-content/com.jpg' }
  ])
  assert.equal(placed.neutralPicture, 'wp-content/uploads/tracy-content/flat.png')
  const menu = readFileSync(new URL('./fixtures/ja-restaurant-wp7-1.0.1-menu.html', import.meta.url), 'utf8')
  // The menu page's first six dish items carry no picture; the seventh and eighth do.
  const text = ['Cha gio', 'Goi cuon', 'Banh xeo', 'Bo luc lac', 'Ca kho', 'Canh chua'].map((name) => ({
    name
  }))
  const out = fillDishItems(menu, {
    keep: new Set(),
    dishes: [...text, ...placed.dishes.slice(0, 2)],
    neutralPicture: placed.neutralPicture,
    neutralAlt: 'Quan Ngon',
    neutralName: 'Dịch vụ'
  }).markup
  const root = parseBlocks(out)
  assert.ok(root)
  const imgOf = (/** @type {any} */ item) => /<img\b[^>]*>/.exec(out.slice(item.start, item.end))?.[0] ?? ''
  const all = []
  const walk = (/** @type {any} */ n) =>
    n.children.forEach((c) => (/\.item\.\d+$/.test(c.attrs?.metadata?.name ?? '') && all.push(c), walk(c)))
  walk(root)
  const dishItems = all.filter((n) => out.slice(n.start, n.end).includes('dish-name'))
  const [pho, bun, spare] = dishItems.slice(6)
  assert.ok(spare && imgOf(pho) && imgOf(bun) && imgOf(spare))
  assert.match(imgOf(pho), /src="\/wp-content\/uploads\/tracy-content\/pho\.jpg"/)
  assert.match(imgOf(pho), /alt="Phở bò"/)
  for (const item of [bun, spare]) {
    assert.match(imgOf(item), /flat\.png/, 'no other dish’s photo')
    assert.match(imgOf(item), /alt="Quan Ngon"/)
  }
  assert.ok(leavesOf(out, bun).includes('Bún chả'))
  assert.ok(leavesOf(out, spare).includes('Dịch vụ'), 'the neutral name of the trade, in the site’s language')
})
