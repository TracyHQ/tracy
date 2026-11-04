// Link targets through the write step's entry point (TracyHQ/tracy#371): a plan link resolves to a real address on the written
// site and goes through the door that holds it, or its line says why not. Every business, address and fact here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBackGroup } from '../src/site-check/read-back.js'
import { copy, KIT, plan, runStep } from './_write-step-run.mjs'
import { brief as baseBrief } from './_site-copy-check.mjs'

const HOME_ROW = { kind: 'menuItem', id: 101, path: 'home', home: 1, published: 1, type: 'component' }
const ABOUT_ROW = { kind: 'menuItem', id: 12, path: 'about', published: 1, type: 'component' }
const SPIN_ARTICLE = { kind: 'article', id: 7, state: 1, url: '/index.php/classes/spin' }
const RECORDS = [HOME_ROW, ABOUT_ROW, SPIN_ARTICLE]

const urlSlot = (key, over = {}) => ({
  key,
  entity: key.slice(0, key.lastIndexOf('.')),
  type: 'url',
  sample: '#',
  current: '#',
  ...over
})
const wordSlot = (key, over = {}) => ({
  key,
  entity: key.slice(0, key.lastIndexOf('.')),
  type: 'text',
  sample: 'Demo words',
  current: 'Demo words',
  ...over
})

/** The kit with the invented pages and with `links` on block-2, whose module is module-2. */
function linkKit(links, over = {}) {
  const kit = KIT()
  kit.doc.pages = [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-1', 'block-2'] } },
    { id: 'page-about', path: '/about', blocks: { 1440: ['block-5'] } },
    { id: 'page-spin', path: '/classes/spin', blocks: { 1440: ['body-spin'] } },
    { id: 'page-old', path: '/old', blocks: { 1440: [] } }
  ]
  kit.doc.blocks.push({
    id: 'body-spin',
    role: 'page-body',
    slots: [],
    lists: [],
    source: { entity: 'article-7', owner: 'article-7', ownerKind: 'article' }
  })
  const block = kit.doc.blocks.find((b) => b.id === 'block-2')
  block.source = { entity: 'module-2' }
  block.links = links
  Object.assign(block, over)
  return kit
}

/** The plan with `leads` as block-2's links, by link id, and a kept article page. */
function linkPlan(leads) {
  const p = plan()
  p.pages[0].blocks[0].links = Object.entries(leads).map(([link, leadsTo]) => ({
    link,
    leadsTo,
    labelSlot: null
  }))
  p.pages.push({ id: 'page-spin', decision: 'keep', blocks: [] })
  return p
}

/** A site that has the kit's own slots, as the fake door lists them, and `slots` beside them. */
const onSite = (slots) => {
  const byKey = new Map(slots.map((s) => [s.key, s]))
  return { extraKeys: slots.map((s) => s.key), overSlot: (slot) => byKey.get(slot.key) ?? {} }
}

/** One run: `links` on the kit, `leads` in the plan, `slots` on the site beside the kit's own. */
function run({ links, leads, slots = [], records = RECORDS, brief, kitOver, script = {}, files = {} }) {
  return runStep(
    {
      plan: linkPlan(leads),
      copy: copy(),
      brief: brief ?? baseBrief(),
      ...files
    },
    { records, ...onSite(slots), ...script },
    { kit: linkKit(links, kitOver) }
  )
}

/** The site check's read-back of a run, on what the fake door holds now. */
async function readBack({ report, site }) {
  const read = async (action, params) => {
    const answer = await site.door.apply({ siteKey: 's', action, params })
    if (action !== 'content.contract') return answer
    return {
      ...answer,
      slots: answer.slots.map((s) => ({ ...s, current: site.held[s.key] ?? s.current }))
    }
  }
  return readBackGroup.run({ report, read })
}

const sentChanges = (site) => site.applies().at(-1)?.params?.changes ?? {}

test('a link with its own link slot goes in the contract call, and read-back checks the line', async () => {
  const done = await run({
    links: [{ id: 'block-2.9', target: '/old', action: 'primary-cta' }],
    leads: { 'block-2.9': 'page-about' },
    slots: [urlSlot('module-2.9')]
  })
  const line = done.line('block-2.9')
  assert.equal(sentChanges(done.site)['module-2.9'], 'index.php?Itemid=12')
  assert.deepEqual(
    [line.status, line.key, line.ordered, line.owner],
    ['written', 'module-2.9', 'index.php?Itemid=12', 'plan']
  )
  const check = await readBack(done)
  assert.equal(check.lines['block-2.9'], 'match')
})

test('the home page resolves to the item the site calls home', async () => {
  const { site } = await run({
    links: [{ id: 'block-2.9', target: null, action: 'navigation' }],
    leads: { 'block-2.9': 'page-home' },
    slots: [urlSlot('module-2.9')]
  })
  assert.equal(sentChanges(site)['module-2.9'], 'index.php?Itemid=101')
})

test('an article page with no menu item resolves to the address the site routes it at', async () => {
  const { site, line } = await run({
    links: [{ id: 'block-2.9', target: null, action: 'navigation' }],
    leads: { 'block-2.9': 'page-spin' },
    slots: [urlSlot('module-2.9')]
  })
  assert.equal(sentChanges(site)['module-2.9'], '/index.php/classes/spin')
  assert.equal(line('block-2.9').status, 'written')
})

test('contact facts resolve to their address', async () => {
  const brief = baseBrief()
  brief.facts.push(
    { id: 'f-insta', field: 'socials', value: { url: 'https://social.example/quay', kind: 'instagram' } },
    { id: 'f-wa', field: 'whatsapp', value: '+000 555 0199' }
  )
  const { site } = await run({
    brief,
    links: [1, 2, 3, 4, 5].map((n) => ({ id: `block-2.${n + 10}`, target: null, action: 'contact' })),
    leads: {
      'block-2.11': 'social:f-insta',
      'block-2.12': 'phone:f-phone',
      'block-2.13': 'email:f-email',
      'block-2.14': 'whatsapp:f-wa',
      'block-2.15': 'https://book.example/quay'
    },
    slots: [11, 12, 13, 14, 15].map((n) => urlSlot(`module-2.${n}`))
  })
  const sent = sentChanges(site)
  assert.equal(sent['module-2.11'], 'https://social.example/quay')
  assert.equal(sent['module-2.12'], 'tel:+0005550100')
  assert.equal(sent['module-2.13'], 'mailto:hello@quay-fitness.example')
  assert.equal(sent['module-2.14'], 'https://wa.me/0005550199')
  assert.equal(sent['module-2.15'], 'https://book.example/quay')
})

for (const [name, leadsTo, reason, facts] of [
  ['a dropped page', 'page-old', /drops/],
  ['a page the kit does not have', 'page-gone', /neither|no page/],
  ['a fact the brief does not have', 'social:f-gone', /no fact/],
  [
    'a fact the brief keeps off the site',
    'social:f-off',
    /off the site/,
    [{ id: 'f-off', field: 'socials', value: { url: 'https://social.example/off' }, onSite: false }]
  ],
  [
    'a social fact with no https address',
    'social:f-bare',
    /https/,
    [{ id: 'f-bare', field: 'socials', value: 'just a handle' }]
  ],
  ['a created legal page no door creates', 'legal:privacy', /creates/],
  ['nothing the write step knows', 'somewhere nice', /neither/]
])
  test(`a link to ${name} is failed with the reason, sends nothing, and turns read-back red`, async () => {
    const brief = baseBrief()
    brief.facts.push(...(facts ?? []))
    const done = await run({
      brief,
      links: [{ id: 'block-2.9', target: '/demo', action: 'navigation' }],
      leads: { 'block-2.9': leadsTo },
      slots: [urlSlot('module-2.9')]
    })
    const line = done.line('block-2.9')
    assert.equal(line.status, 'failed')
    assert.match(line.reason, reason)
    assert.equal(sentChanges(done.site)['module-2.9'], undefined)
    const check = await readBack(done)
    assert.equal(check.lines['block-2.9'], 'failed')
    assert.ok(check.failures.some((f) => f.slot === 'block-2.9'))
  })

test('a link the kit does not list is failed, not guessed', async () => {
  const { line } = await run({ links: [], leads: { 'block-2.link-1': 'page-about' } })
  assert.equal(line('block-2.link-1').status, 'failed')
  assert.match(line('block-2.link-1').reason, /kit/)
})

test('a slot of words is never given an address; the link it labels is the one that moves', async () => {
  const labelled = await run({
    links: [{ id: 'block-2.link-1', target: '/demo', action: 'navigation', labelId: 'block-2.8' }],
    leads: { 'block-2.8': 'page-about' },
    slots: [
      wordSlot('module-2.8', { group: { id: 'module-2.card.0' } }),
      urlSlot('module-2.9', { group: { id: 'module-2.card.0' } })
    ]
  })
  assert.equal(sentChanges(labelled.site)['module-2.9'], 'index.php?Itemid=12')
  assert.equal(sentChanges(labelled.site)['module-2.8'], undefined)
  assert.equal(labelled.line('block-2.8').status, 'written')

  const plain = await run({
    links: [],
    leads: { 'block-2.8': 'page-about' },
    slots: [wordSlot('module-2.8')]
  })
  assert.equal(plain.line('block-2.8').status, 'failed')
  assert.equal(sentChanges(plain.site)['module-2.8'], undefined)
})

test('a link finds its slot by its label: the same row, or the same anchor of an HTML field', async () => {
  const { site, line } = await run({
    links: [
      { id: 'block-2.link-1', target: '/demo', action: 'navigation', labelId: 'block-2.21' },
      { id: 'block-2.link-2', target: null, action: 'contact', labelId: 'block-2.31' }
    ],
    leads: { 'block-2.link-1': 'page-about', 'block-2.link-2': 'phone:f-phone' },
    slots: [
      wordSlot('module-2.21', { group: { id: 'module-2.card.0' } }),
      urlSlot('module-2.22', { group: { id: 'module-2.card.0' } }),
      urlSlot('module-2.23', { group: { id: 'module-2.card.1' } }),
      wordSlot('module-2.31', { column: 'content', xpath: '/html/body/div/a[2]/text()' }),
      urlSlot('module-2.32', { column: 'content', xpath: '/html/body/div/a[1]/@href' }),
      urlSlot('module-2.33', { column: 'content', xpath: '/html/body/div/a[2]/@href' })
    ]
  })
  const sent = sentChanges(site)
  assert.equal(sent['module-2.22'], 'index.php?Itemid=12')
  assert.equal(sent['module-2.33'], 'tel:+0005550100')
  assert.equal(sent['module-2.23'], undefined)
  assert.equal(sent['module-2.32'], undefined)
  assert.equal(line('block-2.link-2').key, 'module-2.33')
})

test('a link with no slot of its own moves the slot of its block that holds its address', async () => {
  const { site, line } = await run({
    links: [{ id: 'block-2.link-1', target: '/about', action: 'navigation' }],
    leads: { 'block-2.link-1': 'page-home' },
    slots: [
      urlSlot('module-2.40', { sample: 'index.php?Itemid=12' }),
      urlSlot('module-2.41', { sample: 'index.php?Itemid=101' })
    ]
  })
  assert.equal(sentChanges(site)['module-2.40'], 'index.php?Itemid=101')
  assert.equal(sentChanges(site)['module-2.41'], undefined)
  assert.equal(line('block-2.link-1').key, 'module-2.40')
})

test('links that share one address move together when the plan agrees, and fail when it does not', async () => {
  const shared = [
    { id: 'block-2.link-1', target: '/about', action: 'navigation' },
    { id: 'block-2.link-2', target: '/about', action: 'navigation' }
  ]
  const slots = [
    urlSlot('module-2.40', { sample: 'index.php?Itemid=12' }),
    urlSlot('module-2.41', { sample: 'index.php?Itemid=12' })
  ]
  const agree = await run({
    links: shared,
    leads: { 'block-2.link-1': 'page-home', 'block-2.link-2': 'page-home' },
    slots
  })
  assert.equal(sentChanges(agree.site)['module-2.40'], 'index.php?Itemid=101')
  assert.equal(sentChanges(agree.site)['module-2.41'], 'index.php?Itemid=101')
  assert.equal(agree.line('block-2.link-2').status, 'written')

  const differ = await run({
    links: shared,
    leads: { 'block-2.link-1': 'page-home', 'block-2.link-2': 'page-spin' },
    slots
  })
  for (const link of ['block-2.link-1', 'block-2.link-2']) {
    assert.equal(differ.line(link).status, 'failed')
    assert.match(differ.line(link).reason, /share/)
  }
  assert.equal(sentChanges(differ.site)['module-2.40'], undefined)
})

test('two links on one slot with different targets: the first is written, the second says so', async () => {
  const { site, line } = await run({
    links: [
      { id: 'block-2.link-1', target: null, action: 'navigation', labelId: 'block-2.21' },
      { id: 'block-2.9', target: null, action: 'navigation' }
    ],
    leads: { 'block-2.9': 'page-about', 'block-2.link-1': 'page-home' },
    slots: [
      wordSlot('module-2.21', { group: { id: 'module-2.card.0' } }),
      urlSlot('module-2.9', { group: { id: 'module-2.card.0' } })
    ]
  })
  assert.equal(Object.keys(sentChanges(site)).filter((k) => k === 'module-2.9').length, 1)
  assert.deepEqual([line('block-2.9').status, line('block-2.link-1').status].sort(), ['failed', 'written'])
})

test('a refused link slot is failed in the plugin words and the rest still lands', async () => {
  const { line } = await run({
    links: [
      { id: 'block-2.9', target: null, action: 'navigation' },
      { id: 'block-2.10', target: null, action: 'navigation' }
    ],
    leads: { 'block-2.9': 'page-about', 'block-2.10': 'page-home' },
    slots: [urlSlot('module-2.9'), urlSlot('module-2.10')],
    script: {
      refuse: { 'module-2.9': { code: 'SLOT_LINK_UNSUPPORTED', message: 'Unsupported CTA URL' } }
    }
  })
  assert.equal(line('block-2.9').status, 'failed')
  assert.match(line('block-2.9').reason, /SLOT_LINK_UNSUPPORTED/)
  assert.equal(line('block-2.9').ordered, 'index.php?Itemid=12')
  assert.equal(line('block-2.10').status, 'written')
})

const footerItem = (over = {}) => ({
  kind: 'menuItem',
  id: 40,
  path: 'try',
  published: 1,
  type: 'url',
  link: '#',
  menutype: 'footer',
  ...over
})

test('a menu item that is a plain link takes the target on its row, and read-back reads the row', async () => {
  const done = await run({
    links: [
      {
        id: 'block-2.link-1',
        target: '/demo',
        action: 'navigation',
        menuItem: 'menuItem-40',
        menu: 'module-2'
      }
    ],
    leads: { 'block-2.link-1': 'page-about' },
    records: [...RECORDS, footerItem()]
  })
  const update = done.site.updates().find((c) => c.params.id === 40)
  assert.deepEqual(update.params.fields, { link: 'index.php?Itemid=12' })
  assert.ok(update.params.apply_id, 'the door requires an apply id')
  const line = done.line('block-2.link-1')
  assert.deepEqual([line.status, line.key, line.ordered], ['written', null, 'index.php?Itemid=12'])
  assert.deepEqual(line.readFrom.path, ['item', 'link'])
  const check = await readBack(done)
  assert.equal(check.lines['block-2.link-1'], 'match')
})

test('a menu row the door refuses is failed in the plugin words', async () => {
  const { line } = await run({
    links: [
      {
        id: 'block-2.link-1',
        target: '/demo',
        action: 'navigation',
        menuItem: 'menuItem-40',
        menu: 'module-2'
      }
    ],
    leads: { 'block-2.link-1': 'page-about' },
    records: [...RECORDS, footerItem()],
    script: {
      refuseUpdate: () => ({ ok: false, error: 'bad_params', message: 'the row is locked' })
    }
  })
  assert.equal(line('block-2.link-1').status, 'failed')
  assert.match(line('block-2.link-1').reason, /the row is locked/)
})

test('a menu item that is a page of its own: opening the target already needs no write, another target fails', async () => {
  const already = await run({
    links: [
      {
        id: 'block-2.link-1',
        target: '/about',
        action: 'navigation',
        menuItem: 'menuItem-12',
        menu: 'module-2'
      }
    ],
    leads: { 'block-2.link-1': 'page-about' }
  })
  assert.equal(already.site.updates().filter((c) => c.params.fields?.link).length, 0)
  const line = already.line('block-2.link-1')
  assert.equal(line.status, 'written')
  assert.match(line.reason, /already/)
  assert.deepEqual([line.ordered, line.readFrom.path], ['1', ['item', 'published']])
  const check = await readBack(already)
  assert.equal(check.lines['block-2.link-1'], 'match')

  const other = await run({
    links: [
      {
        id: 'block-2.link-1',
        target: '/about',
        action: 'navigation',
        menuItem: 'menuItem-12',
        menu: 'module-2'
      }
    ],
    leads: { 'block-2.link-1': 'page-home' }
  })
  assert.equal(other.site.updates().filter((c) => c.params.fields?.link).length, 0)
  assert.equal(other.line('block-2.link-1').status, 'failed')
  assert.match(other.line('block-2.link-1').reason, /page of its own/)
})

test('a menu item the site does not have is failed', async () => {
  const { line } = await run({
    links: [
      {
        id: 'block-2.link-1',
        target: '/demo',
        action: 'navigation',
        menuItem: 'menuItem-99',
        menu: 'module-2'
      }
    ],
    leads: { 'block-2.link-1': 'page-about' }
  })
  assert.equal(line('block-2.link-1').status, 'failed')
  assert.match(line('block-2.link-1').reason, /menuItem-99/)
})

test('a link with no door that already opens the plan page is written with a read of what it opens', async () => {
  const done = await run({
    links: [
      { id: 'block-2.link-1', target: '/classes/spin', action: 'go-to-item' },
      { id: 'block-2.link-2', target: '/about', action: 'go-to-item', menuItem: 'menuItem-12' }
    ],
    leads: { 'block-2.link-1': 'page-spin', 'block-2.link-2': 'page-about' }
  })
  const article = done.line('block-2.link-1')
  assert.equal(article.status, 'written')
  assert.match(article.reason, /already/)
  assert.deepEqual(article.readFrom.params, { kind: 'article', id: 7 })
  assert.deepEqual(done.line('block-2.link-2').readFrom.params, { kind: 'menuItem', id: 12 })
  const check = await readBack(done)
  assert.equal(check.lines['block-2.link-1'], 'match')
  assert.equal(check.lines['block-2.link-2'], 'match')
})

test('a link no door holds and that opens something else is failed, naming the demo address it keeps', async () => {
  const done = await run({
    links: [{ id: 'block-2.link-1', target: 'mailto:demo@template.example', action: 'contact' }],
    leads: { 'block-2.link-1': 'page-about' }
  })
  const line = done.line('block-2.link-1')
  assert.equal(line.status, 'failed')
  assert.match(line.reason, /no door/)
  assert.match(line.reason, /mailto:demo@template\.example/)
})

test('a control acting inside the page has no address: skipped with the reason, not failed', async () => {
  const { line } = await run({
    links: [
      { id: 'block-2.button-1', target: null, action: 'page-control', opens: { kind: 'panel' } },
      { id: 'block-2.link-1', target: null, action: 'page-control', icon: { mechanism: 'image-file' } },
      { id: 'block-2.link-2', target: null, action: 'page-control' }
    ],
    leads: {
      'block-2.button-1': 'page-about',
      'block-2.link-1': 'page-about',
      'block-2.link-2': 'page-about'
    }
  })
  for (const link of ['block-2.button-1', 'block-2.link-1']) {
    assert.equal(line(link).status, 'skipped')
    assert.match(line(link).reason, /inside the page/)
  }
  assert.equal(
    line('block-2.link-2').status,
    'failed',
    'a dead anchor with words is a link that goes nowhere'
  )
})

test('a map link is the page settings stage: it follows that line, and says so when there is none', async () => {
  const brief = baseBrief()
  const { line } = await run({
    brief,
    links: [
      {
        id: 'block-2.button-1',
        target: null,
        action: 'page-control',
        opens: { kind: 'modal', slotId: 'block-2.map', writable: true }
      }
    ],
    leads: { 'block-2.button-1': 'map:f-address' }
  })
  assert.equal(line('block-2.button-1').status, 'skipped')
  assert.match(line('block-2.button-1').reason, /map setting/)
})

/** Team cards: each card keeps its social icons inside one slot of words. */
const iconWords = '((div))((a href="#"))((i))((/i))((/a))((a href="#"))((i))((/i))((/a))((/div))'
const iconLinks = [1, 2, 3, 4].map((n) => ({
  id: `block-2.link-${n}`,
  position: n,
  target: null,
  action: 'external-profile',
  icon: { mechanism: 'font-icon' }
}))
const iconLeads = Object.fromEntries(iconLinks.map((l) => [l.id, 'page-about']))
const iconSlots = [
  wordSlot('module-2.50', { sample: iconWords, jsonPath: ['team', 'info', 0] }),
  wordSlot('module-2.51', { sample: iconWords, jsonPath: ['team', 'info', 1] })
]

test('an icon link inside words the plan hides leaves with those words', async () => {
  const p = linkPlan(iconLeads)
  const kit = linkKit(iconLinks)
  kit.doc.blocks
    .find((b) => b.id === 'block-2')
    .slots.push(
      {
        id: 'block-2.50',
        role: 'editorial.paragraph',
        type: 'text',
        maxCharacters: 900,
        sample: iconWords,
        paragraphs: 1,
        bullets: 0
      },
      {
        id: 'block-2.51',
        role: 'editorial.paragraph',
        type: 'text',
        maxCharacters: 900,
        sample: iconWords,
        paragraphs: 1,
        bullets: 0
      }
    )
  p.pages[0].blocks[0].hiddenSlots = [
    ...(p.pages[0].blocks[0].hiddenSlots ?? []),
    { slot: 'block-2.50', why: 'no biography' },
    { slot: 'block-2.51', why: 'no biography' }
  ]
  const done = await runStep(
    { plan: p, copy: copy(), brief: baseBrief() },
    { records: RECORDS, ...onSite(iconSlots) },
    { kit }
  )
  const line = done.line('block-2.link-1')
  assert.equal(done.line('block-2.50').status, 'hidden')
  assert.deepEqual([line.status, line.key], ['hidden', 'module-2.50'])
  assert.match(line.reason, /module-2\.50/)
  assert.equal(done.line('block-2.link-4').key, 'module-2.51')
  const check = await readBack(done)
  assert.equal(check.lines['block-2.link-1'], 'match')
})

test('an icon link inside words the plan keeps is failed: nothing rewrites one address in them', async () => {
  const { line } = await run({ links: iconLinks, leads: iconLeads, slots: iconSlots })
  assert.equal(line('block-2.link-1').status, 'failed')
  assert.match(line('block-2.link-1').reason, /inside the words of module-2\.50/)
})

test('a slot another file writes keeps its owner: the link line fails and names it', async () => {
  const c = copy()
  c.slots.push({ slot: 'block-2.9', owner: 'writer', text: 'https://book.example/quay', factIds: [] })
  const kit = linkKit([{ id: 'block-2.link-1', target: null, action: 'navigation', labelId: 'block-2.21' }])
  const block = kit.doc.blocks.find((b) => b.id === 'block-2')
  block.slots.push({
    id: 'block-2.9',
    role: 'editorial.navigation_url',
    type: 'text',
    maxCharacters: 90,
    sample: '#',
    paragraphs: 1,
    bullets: 0
  })
  const { line, site } = await runStep(
    { plan: linkPlan({ 'block-2.link-1': 'page-about' }), copy: c, brief: baseBrief() },
    {
      records: RECORDS,
      ...onSite([
        wordSlot('module-2.21', { group: { id: 'module-2.card.0' } }),
        urlSlot('module-2.9', { group: { id: 'module-2.card.0' } })
      ])
    },
    { kit }
  )
  assert.equal(sentChanges(site)['module-2.9'], 'https://book.example/quay')
  assert.equal(line('block-2.link-1').status, 'failed')
  assert.match(line('block-2.link-1').reason, /another file/)
})

test('a run with no plan link asks the site nothing extra', async () => {
  const { site, report } = await runStep()
  assert.equal(report.status, 'done')
  assert.equal(site.calls.filter((c) => c.params?.kind === 'article').length, 0)
})

test('a run that ends before the write says so on the link line', async () => {
  const { line, report } = await run({
    links: [{ id: 'block-2.9', target: null, action: 'navigation' }],
    leads: { 'block-2.9': 'page-about' },
    slots: [urlSlot('module-2.9')],
    script: { answers: [{ ok: false, error: 'contract_failed', message: 'the whole call failed' }] }
  })
  assert.equal(report.status, 'stopped')
  assert.equal(line('block-2.9').status, 'skipped')
  assert.match(line('block-2.9').reason, /run ended/)
})

test('a link whose kit menu is printed elsewhere does not move that menu: its own address decides', async () => {
  const done = await run({
    links: [
      {
        id: 'block-2.link-1',
        target: '/about',
        action: 'go-to-item',
        menuItem: 'menuItem-40',
        menu: 'module-9'
      }
    ],
    leads: { 'block-2.link-1': 'page-about' },
    records: [...RECORDS, footerItem()]
  })
  assert.equal(done.site.updates().filter((c) => c.params.fields?.link).length, 0)
  assert.match(done.line('block-2.link-1').reason, /already/)
})

test('a link slot the plan hides leaves with its row; the others of a shared address are written', async () => {
  const kit = linkKit([{ id: 'block-2.link-1', target: '/about', action: 'navigation' }])
  const block = kit.doc.blocks.find((b) => b.id === 'block-2')
  block.slots.push({
    id: 'block-2.40',
    role: 'editorial.navigation_url',
    type: 'text',
    maxCharacters: 90,
    sample: '#',
    paragraphs: 1,
    bullets: 0
  })
  const p = linkPlan({ 'block-2.link-1': 'page-home' })
  p.pages[0].blocks[0].hiddenSlots = [
    ...(p.pages[0].blocks[0].hiddenSlots ?? []),
    { slot: 'block-2.40', why: 'one coach only' }
  ]
  const slots = [
    urlSlot('module-2.40', { sample: 'index.php?Itemid=12', canHide: 'withRow' }),
    urlSlot('module-2.41', { sample: 'index.php?Itemid=12' })
  ]
  const both = await runStep(
    { plan: p, copy: copy(), brief: baseBrief() },
    { records: RECORDS, ...onSite(slots) },
    { kit }
  )
  assert.equal(sentChanges(both.site)['module-2.41'], 'index.php?Itemid=101')
  assert.equal(sentChanges(both.site)['module-2.40'], undefined)
  assert.equal(both.line('block-2.40').status, 'hidden', 'the hide is not lost to the link')
  assert.deepEqual(
    [both.line('block-2.link-1').status, both.line('block-2.link-1').key],
    ['written', 'module-2.41']
  )

  const alone = await runStep(
    { plan: p, copy: copy(), brief: baseBrief() },
    { records: RECORDS, ...onSite(slots.slice(0, 1)) },
    { kit }
  )
  const line = alone.line('block-2.link-1')
  assert.deepEqual([line.status, line.key], ['hidden', 'module-2.40'])
})

test('a menu item the plan takes off the site takes its link with it and is not retargeted', async () => {
  const kit = linkKit([])
  kit.doc.blocks[0].slots.push({
    id: 'menuItem-102.0',
    role: 'editorial.button_label',
    type: 'text',
    maxCharacters: 20,
    sample: 'Demo',
    paragraphs: 1,
    bullets: 0
  })
  kit.doc.blocks[0].links = [
    {
      id: 'block-1.link-1',
      target: '/old-offer',
      action: 'navigation',
      menuItem: 'menuItem-102',
      menu: 'module-1'
    }
  ]
  const p = linkPlan({})
  const headerDecision = p.sharedBlocks[0]
  headerDecision.links = [{ link: 'block-1.link-1', leadsTo: 'page-home', labelSlot: 'menuItem-102.0' }]
  const entity = (n, path) => ({
    key: `menuItem-${n}`,
    kind: 'menuItem',
    identity: { menutype: 'mainmenu', path }
  })
  kit.doc.blocks[0].slots.push({
    id: 'menuItem-101.0',
    role: 'editorial.button_label',
    type: 'text',
    maxCharacters: 20,
    sample: 'Home',
    paragraphs: 1,
    bullets: 0
  })
  headerDecision.copy.push({
    slot: 'menuItem-101.0',
    says: 'home',
    text: 'Home',
    basis: 'trade',
    maxCharacters: 20
  })
  const c = copy()
  c.slots.push({ slot: 'menuItem-101.0', owner: 'plan-label', text: 'Home', factIds: [] })
  const row = (id, path) => ({
    kind: 'menuItem',
    id,
    path,
    published: 1,
    type: 'component',
    menutype: 'mainmenu'
  })
  const { line, site } = await runStep(
    { plan: p, copy: c, brief: baseBrief() },
    {
      records: [{ ...row(101, 'home'), home: 1 }, row(12, 'about'), row(102, 'home/old-offer'), SPIN_ARTICLE],
      extraKeys: ['menuItem-101.0', 'menuItem-102.0']
    },
    { kit, contentMap: { entities: [entity(101, 'home'), entity(102, 'home/old-offer')], slots: [] } }
  )
  const done = line('block-1.link-1')
  assert.deepEqual([done.status, done.ordered], ['hidden', '0'])
  assert.deepEqual(done.readFrom.params, { kind: 'menuItem', id: 102 })
  assert.equal(site.updates().filter((u) => u.params.fields?.link).length, 0)
})
