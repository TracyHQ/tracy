import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import {
  FILLER_SOURCE,
  baselineOf,
  checkFactsFromBrief,
  checkNoDemoWords,
  residueOf
} from '../../tracy-host/src/demo-qa.js'
import { readResidueInPage } from '../../tracy-host/src/demo-residue-page.js'
import { LR_BRIEF, ORIGIN, lrRead } from '../../tracy-host/test/fixtures/residue/lr.mjs'
import { visionKey } from '../src/lib/picture-vision.js'
import { editorialLeads, postDraftsOf, templatePostsLeft } from '../src/opportunities-build/agent-demo.js'
import {
  LINKED_TITLE_WHY,
  planSweep,
  siteLocaleOf,
  slotOf,
  SWEEP_MAX_CALLS,
  sweepOf
} from '../src/opportunities-build/residue-sweep.js'
import { composePost } from 'website-opportunities/domain/editorial-guide.mjs'
import { neutralItemName } from 'website-opportunities/domain/section-fills.mjs'
import { forbiddenFillerText } from 'website-opportunities/domain/slot-fill-manifest.mjs'
import { neutralWords } from 'website-opportunities/domain/neutral-copy.mjs'

// Research posts the sweep writes into the template posts the agent left (`agent-demo.js` `postDraftsOf`).
const reservations = composePost({
  topic: 'page',
  head: 'Reservations',
  lines: ['Groups of 5–20 people can send an online reservation request.']
})
const hours = composePost({ topic: 'hours', head: 'Monday 09:00-22:00', lines: ['Monday 09:00-22:00'] })

const baseline = baselineOf([lrRead('lr-before.html')])
const inventory = [
  {
    identity: { kind: 'post', id: 11 },
    routes: ['/cocktail-bar-alchemist-set-to-open-at-mediacity-in-salford-quays/']
  },
  { identity: { kind: 'post', id: 12 }, routes: ['/three-broomsticks-s-autumn-menu-unveiled/'] }
]
const options = { buildDate: '2026-10-24', platform: 'wordpress', inventory, contactPath: '/contact-us/' }
const plan = planSweep(residueOf([lrRead('lr-now.html')], { baseline, briefText: LR_BRIEF }), options)
const replaces = plan.calls
  .filter((c) => c.action === 'content.replace' && !c.params.href)
  .map((c) => c.params)
const to = (find) => replaces.filter((p) => p.find === find).map((p) => p.replace)

test('lr-now: every template dish takes its neutral item name, its price and its description are left empty', () => {
  for (const name of ['Smoked Venison', 'Crisped Duck']) assert.deepEqual(to(name), [neutralItemName()], name)
  for (const price of ['$147', '$156']) assert.deepEqual(to(price), [''], price)
  for (const desc of ['w/ pork, oysters, veggie, ginger', 'w/ shaved beans, wild flowers'])
    assert.deepEqual(to(desc), [''], desc)
  // Words the agent wrote are facts-from-brief's to judge, never the sweep's to rewrite…
  assert.deepEqual(to('Sandwich Suggestion'), [])
  // …except filler (product owner, 27/10/2026: no filler on a demo): "Ask" or "Sample" in a price, and any other
  // filler line, are left empty.
  for (const filler of ['Ask', 'Sample']) assert.deepEqual(to(filler), [''], filler)
  assert.deepEqual(to('Menu idea for owner review, not a confirmed dish.'), [''])
  assert.deepEqual(to('Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.'), [''])
  // A sourced dish keeps its name.
  assert.deepEqual(to('Brunch'), [])
  // Longest words first: a passage before the short label it may hold.
  const lengths = replaces.map((p) => p.find.length)
  assert.deepEqual(
    lengths,
    [...lengths].sort((a, b) => b - a)
  )
  assert.ok(replaces.every((p) => p.all === 'page' && p.path === '/'))
  // A whole template passage goes under the job's confirm-count rule; every other words keep their count.
  const whole = 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.'
  assert.equal(replaces.find((p) => p.find === whole).expect, undefined)
  assert.ok(replaces.filter((p) => p.find !== whole).every((p) => Number.isInteger(p.expect)))
})

test('a sweep of a dish with no price and a line with no fact writes no filler: every replacement is empty or neutral', () => {
  // 🔒 Product owner, 27/10/2026: a slot with no collected fact stays empty or takes its neutral wording; nothing in
  // `neutral-copy/forbidden.json` is ever written. lr-now holds both: template prices the research does not hold, and
  // template lines with no fact behind them.
  assert.ok(to('$147').length && to('Menu idea for owner review, not a confirmed dish.').length)
  for (const p of replaces) {
    assert.equal(forbiddenFillerText(p.replace), false, `${p.find} → ${p.replace}`)
    assert.ok(p.replace === '' || neutralWords('en').includes(p.replace), `${p.find} → ${p.replace}`)
  }
  // A gym's item takes the service word, not the dish one.
  const gym = planSweep(residueOf([lrRead('lr-now.html')], { baseline, briefText: LR_BRIEF }), {
    ...options,
    itemKind: 'service'
  })
  const names = gym.calls.filter((c) => c.params.find === 'Smoked Venison').map((c) => c.params.replace)
  assert.deepEqual(names, [neutralItemName({ kind: 'service' })])
})

// 🔒 Product owner, 27/10/2026: the neutral wording is the site's language, read where the build recorded it
// (`content.writes['slot-fill'].locale`, as the agent's prompt reads it); a language the set lacks falls back to English.
test("the sweep's neutral wording is in the site's language: Vietnamese words on a Vietnamese site, English for Danish", () => {
  const residue = residueOf([lrRead('lr-now.html')], { baseline, briefText: LR_BRIEF })
  const named = (locale) =>
    planSweep(residue, { ...options, locale })
      .calls.filter((c) => c.params.find === 'Smoked Venison')
      .map((c) => c.params.replace)
  assert.deepEqual(named('vi'), ['Món trong thực đơn'])
  assert.deepEqual(named('da'), ['Menu item'])
  assert.equal(siteLocaleOf({ content: { writes: { 'slot-fill': { locale: 'vi' } } } }), 'vi')
  assert.equal(siteLocaleOf({ content: {} }), 'en')
  assert.equal(siteLocaleOf(null), 'en')
})

// 🔒 Product owner, 27/10/2026: a slot the replace job refuses to empty (a heading, a button or a link: `cannot-empty`
// on WordPress, Joomla and EmDash alike) takes the neutral wording of its role in the site's language, never filler.
test('a heading or a link the sweep would empty takes the neutral wording of its role; a list item, with no role, is named unresolved', () => {
  const items = [
    {
      field: 'text',
      page: '/',
      text: 'Lorem ipsum dolor',
      selector: 'div.item-inner > h3.item-title',
      short: true
    },
    { field: 'text', page: '/', text: 'Reserve with OpenTable today', selector: 'p.partner > a' },
    { field: 'text', page: '/', text: 'Aenean massa cum', selector: 'span.label > button.btn' },
    { field: 'text', page: '/', text: 'Donec quam felis', selector: 'ul.features > li' }
  ]
  const replaced = (opts) =>
    Object.fromEntries(
      planSweep({ items }, { ...options, platform: 'joomla', ...opts })
        .calls.filter((c) => c.action === 'content.replace')
        .map((c) => [c.params.find, c.params.replace])
    )
  assert.deepEqual(replaced({}), {
    'Lorem ipsum dolor': 'Overview',
    'Reserve with OpenTable today': 'Contact',
    'Aenean massa cum': 'Contact'
  })
  assert.deepEqual(replaced({ locale: 'vi' }), {
    'Lorem ipsum dolor': 'Tổng quan',
    'Reserve with OpenTable today': 'Liên hệ',
    'Aenean massa cum': 'Liên hệ'
  })
  const left = (opts) =>
    planSweep({ items }, { ...options, platform: 'joomla', ...opts }).unresolved.map((u) => [
      u.text,
      u.refused
    ])
  assert.deepEqual(left({}), [['Donec quam felis', 'li']])
  // A contact label promises a way to get in touch: with no Contact page, the link is no call, named unresolved.
  assert.equal(replaced({ contactPath: null })['Reserve with OpenTable today'], undefined)
  assert.deepEqual(left({ contactPath: null }), [
    ['Reserve with OpenTable today', 'a'],
    ['Aenean massa cum', 'button'],
    ['Donec quam felis', 'li']
  ])
  for (const locale of ['en', 'vi', 'da'])
    for (const value of Object.values(replaced({ locale })))
      assert.equal(forbiddenFillerText(value), false, value)
})

// The same three slots as each CMS prints them: a word set inside a heading, a heading's link (a post's title) and
// a list item, a tag link, a button with no Contact page behind it. `holder` is the page reader's tag chain, from the
// words' own element up to their block (`demo-residue-page.js`); an older read has the selector alone.
const SHAPES = {
  wordpress: {
    inHeading: { selector: 'h2.wp-block-heading > span', text: 'Lorem ipsum dolor sit' },
    deepHeading: {
      selector: 'strong > em',
      holder: ['em', 'strong', 'h2'],
      text: 'Aenean commodo ligula eget'
    },
    linkedTitle: { selector: 'h3.entry-title > a', text: 'Nullam dictum felis eu' },
    item: { selector: 'ul.wp-block-list > li', text: 'Donec quam felis ultricies' },
    tag: { selector: 'div.taxonomy-post_tag > a', text: 'Cras dapibus vivamus elementum' },
    button: {
      selector: 'div.wp-block-button > a.wp-block-button__link',
      text: 'Reserve with OpenTable today'
    }
  },
  joomla: {
    inHeading: { selector: 'h2.item-title > span.accent', text: 'Lorem ipsum dolor sit' },
    deepHeading: {
      selector: 'strong > em',
      holder: ['em', 'strong', 'h3'],
      text: 'Aenean commodo ligula eget'
    },
    linkedTitle: { selector: 'h2.item-title > a', text: 'Nullam dictum felis eu' },
    item: { selector: 'ul.features > li', text: 'Donec quam felis ultricies' },
    tag: { selector: 'li.tag-1 > a.label', holder: ['a', 'li'], text: 'Cras dapibus vivamus elementum' },
    button: { selector: 'p.readmore > a.btn', text: 'Reserve with OpenTable today' }
  },
  emdash: {
    inHeading: { selector: 'h2.text-3xl > span.text-primary', text: 'Lorem ipsum dolor sit' },
    deepHeading: {
      selector: 'strong > em',
      holder: ['em', 'strong', 'h2'],
      text: 'Aenean commodo ligula eget'
    },
    linkedTitle: {
      selector: 'a.group > h3.font-semibold',
      holder: ['h3', 'a'],
      text: 'Nullam dictum felis eu'
    },
    item: { selector: 'ul.space-y-2 > li', text: 'Donec quam felis ultricies' },
    tag: { selector: 'div.tags > a.rounded-full', text: 'Cras dapibus vivamus elementum' },
    button: { selector: 'div.cta > button.btn', text: 'Reserve with OpenTable today' }
  }
}
const shaped = (platform, keys, extra = {}) =>
  keys.map((k) => ({
    field: 'text',
    page: '/',
    block: SHAPES[platform][k].text,
    ...SHAPES[platform][k],
    ...extra
  }))
const replacesOf = (sweep) =>
  Object.fromEntries(
    sweep.calls.filter((c) => c.action === 'content.replace').map((c) => [c.params.find, c.params.replace])
  )

test("a word inside a heading is the heading's: `h2 > span` and `h3 > strong > em` take the neutral heading on WordPress, Joomla and EmDash", () => {
  for (const platform of Object.keys(SHAPES)) {
    const sweep = planSweep(
      { items: shaped(platform, ['inHeading', 'deepHeading']) },
      { ...options, platform }
    )
    assert.deepEqual(
      replacesOf(sweep),
      { 'Lorem ipsum dolor sit': 'Overview', 'Aenean commodo ligula eget': 'Overview' },
      platform
    )
  }
})

test('a linked title is a title, never a contact label nor the neutral heading: with no sourced title it is unresolved, no call planned', () => {
  for (const platform of Object.keys(SHAPES))
    for (const contactPath of ['/contact-us/', null]) {
      const items = [
        ...shaped(platform, ['linkedTitle']),
        // A card's title linking a post the inventory lacks: words like any other, still its post's title.
        {
          field: 'title',
          page: '/blog',
          text: 'Pellentesque habitant morbi',
          selector: 'h3 > a',
          post: '/gone/'
        }
      ]
      const sweep = planSweep({ items }, { ...options, platform, contactPath })
      assert.deepEqual(replacesOf(sweep), {}, platform)
      assert.deepEqual(
        sweep.unresolved.map((u) => [u.text, u.why]),
        [
          ['Nullam dictum felis eu', LINKED_TITLE_WHY],
          ['Pellentesque habitant morbi', LINKED_TITLE_WHY]
        ],
        platform
      )
    }
})

test('a slot the replace job refuses to empty is never sent empty: a list item, a tag link and a button with no Contact page are unresolved with the reason', () => {
  for (const platform of Object.keys(SHAPES)) {
    const sweep = planSweep(
      { items: shaped(platform, ['item', 'tag', 'button']) },
      { ...options, platform, contactPath: null }
    )
    assert.deepEqual(replacesOf(sweep), {}, platform)
    assert.deepEqual(
      sweep.unresolved.map((u) => [u.text, u.refused]),
      [
        ['Donec quam felis ultricies', 'li'],
        ['Cras dapibus vivamus elementum', 'a'],
        ['Reserve with OpenTable today', platform === 'emdash' ? 'button' : 'a']
      ],
      platform
    )
    for (const u of sweep.unresolved) assert.match(u.why, /refuses to empty/, platform)
    // With a Contact page, the link and the button take its label; the list item and the tag still have no role.
    const withContact = planSweep(
      { items: shaped(platform, ['item', 'tag', 'button']) },
      { ...options, platform }
    )
    assert.deepEqual(replacesOf(withContact), { 'Reserve with OpenTable today': 'Contact' }, platform)
    assert.deepEqual(
      withContact.unresolved.map((u) => u.text),
      ['Donec quam felis ultricies', 'Cras dapibus vivamus elementum'],
      platform
    )
  }
})

test("the page reader names the tags holding a text past the selector's two, so a deep heading and a card's linked heading read as such", () => {
  const { document } = parseHTML(`<html><body><main>
<h3 class="t"><strong><em>Aenean commodo ligula eget dolor</em></strong></h3>
<a class="card" href="/post-1/"><div class="body"><h3>Nullam dictum felis eu pede</h3></div></a>
<p class="x">Plain words of a template paragraph here</p></main></body></html>`)
  const units = readResidueInPage({ origin: ORIGIN }, document).units
  assert.deepEqual(
    units.map((u) => [u.text, u.selector, u.holder ?? null]),
    [
      ['Aenean commodo ligula eget dolor', 'strong > em', ['em', 'strong', 'h3']],
      ['Nullam dictum felis eu pede', 'div.body > h3', ['h3', 'a']],
      ['Plain words of a template paragraph here', 'main > p.x', null]
    ]
  )
  assert.deepEqual(
    units.map((u) => slotOf({ field: 'text', ...u }, u.text)),
    [
      { role: 'heading', refused: 'h3' },
      { role: 'title', refused: 'a' },
      { role: null, refused: null }
    ]
  )
})

// One page of each CMS's own markup around the same template words, read by the host's page reader as the build's
// check reads it (`demo-qa-browser.js`: `readResidueInPage` with `FILLER_SOURCE`), before and after the agent's turn.
const CMS_PAGES = {
  wordpress: (inner) =>
    `<main class="wp-site-blocks"><div class="entry-content wp-block-post-content">${inner}</div></main>`,
  joomla: (inner) =>
    `<div class="t4-section"><div class="t4-row"><div class="moduletable"><div class="custom">${inner}</div></div></div></div>`,
  emdash: (inner) =>
    `<main data-astro-cid-x><section class="prose" data-astro-cid-x>${inner}</section></main>`
}
const cmsRead = (platform, inner) => {
  const { document } = parseHTML(`<html><body>${CMS_PAGES[platform](inner)}</body></html>`)
  document.body.normalize()
  return {
    path: '/',
    url: `${ORIGIN}/`,
    status: 200,
    navLinks: ['/', '/contact-us/'],
    blocks: [],
    ctas: [],
    residue: readResidueInPage({ origin: ORIGIN, filler: FILLER_SOURCE }, document)
  }
}
const sweepThroughReader = (platform, inner, extra = {}) =>
  planSweep(residueOf([cmsRead(platform, inner)], { baseline: baselineOf([cmsRead(platform, inner)]) }), {
    ...options,
    platform,
    inventory: [],
    ...extra
  })

test('read by the page reader, filler inside a heading or a list item knows its slot: `<h2><span>Coming soon</span></h2>` takes the neutral heading, `<li><span>Sample</span></li>` is unresolved, on WordPress, Joomla and EmDash', () => {
  for (const platform of Object.keys(CMS_PAGES)) {
    const sweep = sweepThroughReader(
      platform,
      '<h2><span>Coming soon</span></h2><ul><li><span>Sample</span></li></ul>'
    )
    assert.deepEqual(replacesOf(sweep), { 'Coming soon': 'Overview' }, platform)
    assert.deepEqual(
      sweep.unresolved.map((u) => [u.text, u.refused]),
      [['Sample', 'li']],
      platform
    )
    assert.match(sweep.unresolved[0].why, /refuses to empty a li/, platform)
  }
})

test('every residue kind reaches the sweep with the block its words sit in: filler, a dish, a price and a date carry it as the template text does', () => {
  const inner =
    '<h2><span>Coming soon</span></h2><div class="dish-item"><h3 class="dish-name">Smoked Venison <span class="price">$147</span></h3></div><p><time>June 3, 2021</time></p><p>Some paragraph text of the template here now</p>'
  for (const platform of Object.keys(CMS_PAGES)) {
    const { items } = residueOf([cmsRead(platform, inner)], {
      baseline: baselineOf([cmsRead(platform, inner)])
    })
    const blockOf = Object.fromEntries(items.map((i) => [i.text, i.block ?? null]))
    assert.deepEqual(
      blockOf,
      {
        'Coming soon': 'coming soon',
        'Smoked Venison': 'smoked venison $147',
        $147: 'smoked venison $147',
        'June 3, 2021': 'june 3, 2021',
        'Some paragraph text of the template here now': 'some paragraph text of the template here now'
      },
      platform
    )
  }
})

test('a contact fact with no sourced value is never given neutral wording: `+1 555 123 4567` in `h2 > span` is unresolved, and in a paragraph it is left empty', () => {
  for (const platform of Object.keys(CMS_PAGES)) {
    const inHeading = sweepThroughReader(platform, '<h2><span>+1 555 123 4567</span></h2>')
    assert.deepEqual(replacesOf(inHeading), {}, platform)
    assert.deepEqual(
      inHeading.unresolved.map((u) => [u.text, u.refused]),
      [['+1 555 123 4567', 'h2']],
      platform
    )
    assert.match(inHeading.unresolved[0].why, /contact fact/, platform)
    // With no Contact page either: never the contact label over a fact.
    const noContact = sweepThroughReader(platform, '<h2><span>+1 555 123 4567</span></h2>', {
      contactPath: null
    })
    assert.deepEqual(replacesOf(noContact), {}, platform)
    // A slot the replace job may empty: the fact is left empty, never worded.
    const inLine = sweepThroughReader(platform, '<p class="phone"><span>+1 555 123 4567</span></p>')
    assert.deepEqual(replacesOf(inLine), { '+1 555 123 4567': '' }, platform)
    // With a sourced phone, the business's own number.
    const sourced = sweepThroughReader(platform, '<h2><span>+1 555 123 4567</span></h2>', {
      contact: { phone: '+45 33 12 34 56' }
    })
    assert.deepEqual(replacesOf(sourced), { '+1 555 123 4567': '+45 33 12 34 56' }, platform)
  }
})

test('the neutral heading stands only for template words: a price filling a whole heading is unresolved, never "Overview", on WordPress, Joomla and EmDash', () => {
  for (const platform of Object.keys(CMS_PAGES)) {
    const sweep = sweepThroughReader(platform, '<h4 class="amount"><span>$25</span></h4>')
    assert.deepEqual(replacesOf(sweep), {}, platform)
    assert.deepEqual(
      sweep.unresolved.map((u) => [u.text, u.refused]),
      [['$25', 'h4']],
      platform
    )
  }
})

test("the sweep reads the replace job's own cannot-empty list: the Dockerfile ships site-tools' leaf where the sweep looks, and it imports alone", async () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
  assert.ok(
    dockerfile
      .split('\n')
      .includes(
        'COPY packages/tools/tracy-site-tools/src/host/empty-rules.mjs ./src/site-tools/empty-rules.mjs'
      )
  )
  const sweepSource = readFileSync(
    new URL('../src/opportunities-build/residue-sweep.js', import.meta.url),
    'utf8'
  )
  assert.match(sweepSource, /new URL\('\.\.\/site-tools\/empty-rules\.mjs', import\.meta\.url\)/)
  const replaceSource = readFileSync(
    new URL('../../../packages/tools/tracy-site-tools/src/host/replace.mjs', import.meta.url),
    'utf8'
  )
  assert.match(replaceSource, /import \{ CANNOT_EMPTY \} from '\.\/empty-rules\.mjs'/)
  assert.doesNotMatch(replaceSource, /const CANNOT_EMPTY = /)
  const dir = await mkdtemp(path.join(tmpdir(), 'web-empty-rules-'))
  try {
    const leaf = path.join(dir, 'src/site-tools/empty-rules.mjs')
    await cp(
      new URL('../../../packages/tools/tracy-site-tools/src/host/empty-rules.mjs', import.meta.url),
      leaf
    )
    const { CANNOT_EMPTY, TEXT_BLOCK } = await import(pathToFileURL(leaf).href)
    assert.deepEqual([...CANNOT_EMPTY].sort(), ['a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'])
    assert.ok(TEXT_BLOCK.has('li') && !TEXT_BLOCK.has('span'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('lr-now: a template post date becomes the build day on the post itself', () => {
  const dates = plan.calls.filter((c) => c.action === 'content.update')
  assert.deepEqual(
    dates.map((c) => c.params),
    [
      { kind: 'post', id: 11, fields: { post_date: '2026-10-24 00:00:00' } },
      { kind: 'post', id: 12, fields: { post_date: '2026-10-24 00:00:00' } }
    ]
  )
  assert.deepEqual(to('10.09.2021'), [])
})

test('lr-now: "View full menu" goes back to /menu, booking and template links to Contact', () => {
  const links = plan.calls.filter((c) => c.action === 'link').map((c) => [c.params.href, c.params.to])
  assert.deepEqual(links, [
    ['/about-us', '/contact-us/'],
    ['/reservation', '/menu'],
    ['https://www.opentable.com/r/ja-diner', '/contact-us/']
  ])
  assert.deepEqual(plan.unresolved, [])
})

test('nothing is removed: no call deletes, hides or unpublishes', () => {
  for (const c of plan.calls) {
    assert.ok(['content.replace', 'content.update', 'link'].includes(c.action))
    assert.ok(!('post_status' in (c.params.fields ?? {})))
  }
})

test('a site already swept plans nothing', () => {
  const none = { calls: [], unresolved: [], renamed: [], thinLeads: 0, left: 0, shown: [] }
  assert.deepEqual(planSweep({ items: [] }, options), none)
  assert.deepEqual(planSweep(null, options), none)
})

test("a Joomla post is dated by publish_up and an EmDash one by its collection's own date field", () => {
  const residue = residueOf([lrRead('lr-now.html')], { baseline, briefText: LR_BRIEF })
  const route = '/cocktail-bar-alchemist-set-to-open-at-mediacity-in-salford-quays/'
  const joomla = planSweep(residue, {
    ...options,
    platform: 'joomla',
    inventory: [{ identity: { kind: 'article', id: 7 }, routes: [route] }]
  })
  assert.deepEqual(
    joomla.calls.filter((c) => c.action === 'content.update').map((c) => c.params),
    [{ kind: 'article', id: 7, fields: { publish_up: '2026-10-24 00:00:00' } }]
  )
  const emdash = planSweep(residue, {
    ...options,
    platform: 'emdash',
    inventory: [
      {
        identity: { collection: 'posts', id: 'p1', slug: 'x', locale: 'en' },
        routes: [{ pattern: route, locale: 'en' }],
        dateField: 'date'
      }
    ]
  })
  assert.deepEqual(
    emdash.calls.filter((c) => c.action === 'content_update').map((c) => c.params),
    [{ collection: 'posts', id: 'p1', locale: 'en', data: { date: '2026-10-24' } }]
  )
  // lrsweep rig, Tracy Base EmDash 0.5.6 (25/10/2026): a field that keeps a full ISO time refused a bare day
  // (`[VALIDATION_ERROR] date: Invalid input`, 38 posts): the build date goes in the shape the field keeps.
  const iso = planSweep(residue, {
    ...options,
    platform: 'emdash',
    inventory: [
      {
        identity: { collection: 'posts', id: 'p1', slug: 'x', locale: 'en' },
        routes: [{ pattern: route, locale: 'en' }],
        dateField: 'date',
        data: { date: '2021-09-14T00:00:00.000Z' }
      }
    ]
  })
  assert.deepEqual(
    iso.calls.filter((c) => c.action === 'content_update').map((c) => c.params.data),
    [{ date: '2026-10-24T00:00:00.000Z' }]
  )
  // lrsweep rig (25/10/2026): without `status:"published"` EmDash only staged a draft (`live:false`), so the page
  // kept the template's words and every later replace on that entry was refused PENDING_DRAFT. A live entry is
  // written live; one not known to be live is never put live by the sweep.
  const live = planSweep(residue, {
    ...options,
    platform: 'emdash',
    inventory: [
      {
        identity: { collection: 'posts', id: 'p1', slug: 'x', locale: 'en' },
        publication: { status: 'published' },
        routes: [{ pattern: route, locale: 'en' }],
        dateField: 'date'
      }
    ]
  })
  assert.deepEqual(
    live.calls.filter((c) => c.action === 'content_update').map((c) => c.params),
    [{ collection: 'posts', id: 'p1', locale: 'en', data: { date: '2026-10-24' }, status: 'published' }]
  )
  // A collection that names no date field: reported, never guessed.
  const none = planSweep(residue, {
    ...options,
    platform: 'emdash',
    inventory: [{ identity: { collection: 'posts', id: 'p1' }, routes: [{ pattern: route }] }]
  })
  assert.ok(none.calls.every((c) => c.action !== 'content_update'))
  assert.ok(
    none.unresolved.some((u) => u.field === 'date' && /no post date field is known on emdash/.test(u.why))
  )
})

test('off WordPress, a link is written in the record that keeps it, else reported', () => {
  const residue = residueOf([lrRead('lr-now.html')], { baseline, briefText: LR_BRIEF })
  const joomla = planSweep(residue, {
    ...options,
    platform: 'joomla',
    inventory: [
      { identity: { kind: 'article', id: 3 }, routes: ['/'] },
      { identity: { kind: 'menuItem', id: 9 }, routes: ['/about-us'], data: { link: 'index.php?a=1' } },
      { identity: { kind: 'menuItem', id: 10 }, routes: ['/contact-us/'], data: { link: 'index.php?c=1' } }
    ]
  })
  const about = joomla.calls.find((c) => c.action === 'link' && c.params.href === '/about-us')
  assert.deepEqual(about.params.records, [
    { kind: 'article', id: 3 },
    // The item's link as the plan saw it: the resolver writes it only while the item still holds it.
    { kind: 'menuItem', id: 9, link: 'index.php?a=1' }
  ])
  assert.equal(about.params.targetLink, 'index.php?c=1')
  assert.equal(about.params.rendered, undefined)
  const bare = planSweep(residue, { ...options, platform: 'joomla', inventory: [] })
  assert.ok(bare.calls.every((c) => c.action !== 'link'))
  assert.ok(bare.unresolved.some((u) => u.field === 'link'))
})

test('sweepOf: the sweep runs whenever it has a call, and only then', () => {
  assert.equal(sweepOf(plan), plan)
  assert.equal(sweepOf({ calls: [], unresolved: [] }), null)
})

/** lr-now as `readDemoPage` hands it over, with its text. */
function nowRead() {
  const { document } = parseHTML(lrHtml('lr-now.html'))
  document.body.normalize()
  return { ...lrRead('lr-now.html'), text: document.body.textContent }
}
const lrHtml = (name) =>
  readFileSync(new URL(`../../tracy-host/test/fixtures/residue/${name}`, import.meta.url), 'utf8')

test('lr-now: the template prices fail facts-from-brief too, and the sweep still runs', () => {
  const reads = [nowRead()]
  const residue = residueOf(reads, { baseline, briefText: LR_BRIEF })
  const checks = [
    checkNoDemoWords(reads, { baseline, briefText: LR_BRIEF, residue }),
    checkFactsFromBrief(reads, { briefText: LR_BRIEF, residue })
  ]
  assert.deepEqual(
    checks.map((c) => [c.id, c.pass, c.sweepable]),
    [
      ['no-demo-words', false, true],
      ['facts-from-brief', false, true]
    ]
  )
  // Whatever else is red, the sweep has its calls: the rest of the repair stays the agent's.
  assert.ok(sweepOf(planSweep(residue, options)).calls.length > 0)
})

test('the same template words on two pages: each call counts its own page, as the replace job does', () => {
  const page = (path) => ({ ...lrRead('lr-now.html'), path, url: `${ORIGIN}${path}` })
  const reads = [page('/'), page('/menu/')]
  const shown = Object.fromEntries(
    reads.map((r) => [r.path, r.residue.units.filter((u) => u.text === 'Smoked Venison').length])
  )
  const twoPages = baselineOf([
    { ...lrRead('lr-before.html'), path: '/' },
    { ...lrRead('lr-before.html'), path: '/menu/' }
  ])
  const calls = planSweep(
    residueOf(reads, { baseline: twoPages, briefText: LR_BRIEF }),
    options
  ).calls.filter((c) => c.params.find === 'Smoked Venison')
  assert.equal(calls.length, 2)
  // `replace.mjs`: `all:true` counts every page of the site, `all:"page"` the page at `path`.
  const places = ({ all, path }) =>
    all === true ? Object.values(shown).reduce((a, b) => a + b, 0) : shown[path]
  for (const c of calls) assert.equal(places(c.params), c.params.expect, c.params.path)
})

test('a date on a single post page becomes the build day of that post, never "Coming soon"', () => {
  const html = `<html><body><article class="post-12 post"><h1 class="entry-title">Three Broomsticks's autumn menu unveiled</h1>
<div class="entry-meta"><time datetime="2021-09-10T01:36:00+00:00">10.09.2021</time></div></article></body></html>`
  const read = (path) => {
    const { document } = parseHTML(html)
    return {
      path,
      url: `${ORIGIN}${path}`,
      status: 200,
      blocks: [],
      ctas: [],
      residue: readResidueInPage({ origin: ORIGIN }, document)
    }
  }
  const at = '/three-broomsticks-s-autumn-menu-unveiled/'
  const single = planSweep(
    residueOf([read(at)], { baseline: baselineOf([read(at)]), briefText: LR_BRIEF }),
    options
  )
  assert.deepEqual(
    single.calls.filter((c) => c.action === 'content.update'),
    [
      {
        action: 'content.update',
        params: { kind: 'post', id: 12, fields: { post_date: '2026-10-24 00:00:00' } }
      }
    ]
  )
  assert.ok(!single.calls.some((c) => c.params.find === '10.09.2021'))
  // A date on no post of the site is reported, not worded over.
  const elsewhere = planSweep(
    residueOf([read('/events/')], { baseline: baselineOf([read('/events/')]), briefText: LR_BRIEF }),
    options
  )
  assert.ok(!elsewhere.calls.some((c) => c.action === 'content.update' || c.params.find === '10.09.2021'))
  assert.deepEqual(
    elsewhere.unresolved.map((u) => [u.field, u.text]),
    [['date', '10.09.2021']]
  )
})

test("a post page's header date dates its own post; a card dated for a post the inventory lacks is reported", () => {
  const html = `<html><body><main><article class="post-12 post"><h1 class="entry-title">Three Broomsticks's autumn menu unveiled</h1>
<div class="entry-meta"><time datetime="2021-09-10T01:36:00+00:00">10.09.2021</time></div></article>
<aside><ul><li class="wp-block-post"><time datetime="2021-09-11T01:36:00+00:00">11.09.2021</time>
<h3 class="wp-block-post-title"><a href="/an-old-template-post/">An old template post</a></h3></li></ul></aside></main></body></html>`
  const at = '/three-broomsticks-s-autumn-menu-unveiled/'
  const read = () => {
    const { document } = parseHTML(html)
    return {
      path: at,
      url: `${ORIGIN}${at}`,
      status: 200,
      blocks: [],
      ctas: [],
      residue: readResidueInPage({ origin: ORIGIN }, document)
    }
  }
  const residue = residueOf([read()], { baseline: baselineOf([read()]), briefText: LR_BRIEF })
  const plan = planSweep(residue, options)
  assert.deepEqual(
    plan.calls.filter((c) => c.action === 'content.update'),
    [
      {
        action: 'content.update',
        params: { kind: 'post', id: 12, fields: { post_date: '2026-10-24 00:00:00' } }
      }
    ]
  )
  assert.deepEqual(
    plan.unresolved.map((u) => [u.text, u.post, u.why]),
    [
      ['11.09.2021', '/an-old-template-post/', 'no post of the site has this address'],
      // The card's linked title names a post the inventory lacks: no neutral word over it, no call (review 26/10/2026).
      ['An old template post', '/an-old-template-post/', LINKED_TITLE_WHY]
    ]
  )
  assert.ok(!plan.calls.some((c) => c.params?.find === 'An old template post'))
})

test('a plan over the cap still dates posts and fixes links: each kind of call takes its share', () => {
  const page = '/'
  const items = [
    ...Array.from({ length: SWEEP_MAX_CALLS + 80 }, (_, i) => ({
      page,
      field: 'text',
      text: `Template passage number ${i} of many`
    })),
    {
      page,
      field: 'date',
      text: '10.09.2021',
      post: '/cocktail-bar-alchemist-set-to-open-at-mediacity-in-salford-quays/'
    },
    { page, field: 'link', href: 'https://vendor.example', text: 'Join now', to: 'contact' }
  ]
  const { calls } = planSweep({ items }, options)
  assert.equal(calls.length, SWEEP_MAX_CALLS)
  assert.ok(
    calls.some((c) => c.action === 'content.update' && c.params.fields.post_date === '2026-10-24 00:00:00')
  )
  assert.ok(calls.some((c) => c.action === 'link' && c.params.href === 'https://vendor.example'))
})

test("a template picture becomes an imported photo of the frame's shape, a different one per frame of a page", () => {
  const pictures = [
    {
      page: '/',
      file: 'wp-content/uploads/2026/10/item-1-1536x864.jpg',
      kind: 'img',
      size: '1440×840',
      selector: 'figure.wp-block-image > img.wp-image-25'
    },
    {
      page: '/',
      file: 'wp-content/uploads/2026/10/item-2-1536x864.jpg',
      kind: 'img',
      size: '1440×840',
      selector: 'figure.wp-block-image > img.wp-image-26'
    },
    {
      page: '/',
      file: 'wp-content/uploads/2026/10/jd-site-logo.png',
      kind: 'img',
      size: '128×80',
      selector: 'a.custom-logo-link > img.custom-logo'
    },
    // A card picture the theme prints from a post meta key: the page's record does not hold it.
    {
      page: '/',
      file: 'wp-content/uploads/2026/10/business-1.jpg',
      kind: 'img',
      size: '360×240',
      selector: 'div.jd-blog-item > img'
    }
  ]
  const media = [
    { url: '/wp-content/uploads/2026/10/lr-square.jpg', id: 301, width: 800, height: 800 },
    { url: '/wp-content/uploads/2026/10/lr-wide.jpg', id: 302, width: 1600, height: 900 }
  ]
  const body =
    '<img class="wp-image-25" src="/wp-content/uploads/2026/10/item-1.jpg"/><img src="item-2.jpg"/>'
  const home = [
    { identity: { kind: 'post', id: 63 }, routes: ['/'], data: { post_content: body } },
    ...inventory
  ]
  const { calls, unresolved } = planSweep({ items: [] }, { ...options, inventory: home, pictures, media })
  const images = calls.filter((c) => c.action === 'image').map((c) => c.params)
  assert.deepEqual(
    images.map((p) => [p.find, p.attachment, p.media.id]),
    [
      ['item-1-1536x864.jpg', 25, 302],
      ['item-2-1536x864.jpg', 26, 301]
    ]
  )
  assert.ok(images.every((p) => p.records.length === 1 && p.records[0].id === 63))
  assert.deepEqual(
    unresolved.map((u) => [u.file, /logo/.test(u.why) ? 'logo' : u.record?.id]),
    [['wp-content/uploads/2026/10/jd-site-logo.png', 'logo']]
  )
  // The card picture no record holds is the theme's own data: the site's media.usage is asked where it is kept,
  // never a guessed meta key.
  assert.deepEqual(
    calls.filter((c) => c.action === 'usage').map((c) => [c.params.find, c.params.media.id]),
    [['business-1.jpg', 302]]
  )
  // No photo imported: reported, never a picture from elsewhere.
  const none = planSweep({ items: [] }, { ...options, inventory: home, pictures })
  assert.equal(none.calls.length, 0)
  assert.ok(none.unresolved.every((u) => u.field === 'picture'))
})

test('a frame takes the best photo first: food, a room or the building before a video frame, a blurry one or a face; none is dropped', async () => {
  const { importedMedia } = await import('../src/opportunities-build/client-demo.js')
  const vision = (subject, quality = 'good') => ({
    vision: { model: 'v', key: visionKey({ model: 'v' }), labels: { subject, quality } }
  })
  const post = 'https://www.instagram.com/p/abc/'
  const bundle = {
    media: [
      { id: 'm-frame', kind: 'image', width: 1600, height: 900, sourceUrl: post, labels: vision('food') },
      { id: 'm-video', kind: 'video', sourceUrl: post },
      {
        id: 'm-tiktok',
        kind: 'image',
        width: 1600,
        height: 900,
        sourceUrl: 'https://www.tiktok.com/@lr/video/9'
      },
      { id: 'm-blurry', kind: 'image', width: 1600, height: 900, labels: vision('interior', 'blurry') },
      { id: 'm-face', kind: 'image', width: 1600, height: 900, labels: vision('people') },
      { id: 'm-room', kind: 'image', width: 800, height: 800, labels: vision('interior') },
      { id: 'm-dish', kind: 'image', width: 800, height: 800, labels: vision('food') }
    ]
  }
  const imports = Object.fromEntries(
    bundle.media
      .filter((m) => m.kind === 'image')
      .map((m, i) => [m.id, { state: 'written', assetId: m.id, path: `/u/${m.id}.jpg`, mediaId: 400 + i }])
  )
  const media = importedMedia({ content: { agentDemo: { imports } } }, bundle)
  assert.deepEqual(
    media.map((m) => [m.url, m.poor]),
    [
      ['/u/m-frame.jpg', true],
      ['/u/m-tiktok.jpg', true],
      ['/u/m-blurry.jpg', true],
      ['/u/m-face.jpg', true],
      ['/u/m-room.jpg', false],
      ['/u/m-dish.jpg', false]
    ]
  )
  // Six wide frames on one page: the two good photos first though square, the dish (food) before the room; a poor one
  // counts as shown once, so it waits until each good one is on the page, then the best of them goes first.
  const pictures = [1, 2, 3, 4, 5, 6].map((n) => ({
    page: '/',
    file: `wp-content/uploads/2026/10/item-${n}.jpg`,
    kind: 'img',
    size: '1440×810',
    selector: `figure.wp-block-image > img.wp-image-${n + 20}`
  }))
  const body = pictures
    .map((p) => `<img class="wp-image-${p.selector.slice(-2)}" src="/${p.file}"/>`)
    .join('')
  const home = [
    { identity: { kind: 'post', id: 63 }, routes: ['/'], data: { post_content: body } },
    ...inventory
  ]
  const { calls } = planSweep({ items: [] }, { ...options, inventory: home, pictures, media })
  const chosen = calls.filter((c) => c.action === 'image').map((c) => c.params.media.url)
  assert.deepEqual(chosen, [
    '/u/m-dish.jpg',
    '/u/m-room.jpg',
    '/u/m-dish.jpg',
    '/u/m-room.jpg',
    '/u/m-frame.jpg',
    '/u/m-face.jpg'
  ])
})

test("a picture the theme prints from its own data is found by the site's media.usage, once per file; a term's meta is reported", () => {
  const inventory = [
    { identity: { kind: 'post', id: 63 }, routes: ['/'], data: { post_content: '' } },
    { identity: { kind: 'post', id: 41 }, routes: ['/cocktail-bar/'], data: { post_content: '' } },
    { identity: { kind: 'term', id: 5 }, routes: ['/category/news/'], data: {} }
  ]
  const card = (file, link) => ({
    page: '/',
    file: `wp-content/uploads/2026/10/${file}`,
    kind: 'img',
    size: '279×279',
    selector: 'a > img.attachment-post-thumbnail',
    ...(link ? { link } : {})
  })
  const pictures = [
    card('marketing-1.jpg', 'https://diner.test/cocktail-bar/'),
    // The same template file on a second card: media.usage finds every row holding it, so one call.
    card('marketing-1.jpg', 'https://diner.test/elsewhere/'),
    card('news-detail-3.jpg', 'https://diner.test/category/news/'),
    card('business-1.jpg')
  ]
  const media = [
    { url: '/u/sq.jpg', id: 301, width: 800, height: 800 },
    { url: '/u/wide.jpg', width: 1600, height: 900 }
  ]
  const { calls, unresolved } = planSweep(
    { items: [] },
    { ...options, origin: 'https://diner.test', inventory, pictures, media }
  )
  assert.deepEqual(
    calls.map((c) => [c.action, c.params.find, c.params.url, c.params.media]),
    [
      [
        'usage',
        'marketing-1.jpg',
        'https://diner.test/wp-content/uploads/2026/10/marketing-1.jpg',
        { url: '/u/sq.jpg', id: 301 }
      ],
      [
        'usage',
        'business-1.jpg',
        'https://diner.test/wp-content/uploads/2026/10/business-1.jpg',
        { url: '/u/sq.jpg', id: 301 }
      ]
    ]
  )
  assert.deepEqual(
    unresolved.map((u) => [u.file.split('/').at(-1), u.record ?? null]),
    [['news-detail-3.jpg', { kind: 'term', id: 5 }]]
  )
  assert.match(unresolved[0].why, /term's meta/)
  // Joomla has no such list: reported, never written.
  const joomla = planSweep(
    { items: [] },
    { ...options, platform: 'joomla', origin: 'https://diner.test', inventory, pictures, media }
  )
  assert.equal(joomla.calls.filter((c) => c.action === 'usage').length, 0)
  // No imported picture with a media id: nothing to put in an id-shaped value, reported.
  const noId = planSweep(
    { items: [] },
    { ...options, origin: 'https://diner.test', inventory, pictures, media: [media[1]] }
  )
  assert.equal(noId.calls.filter((c) => c.action === 'usage').length, 0)
  assert.ok(noId.unresolved.some((u) => /no imported picture has a media id/.test(u.why)))
})

test("a card picture the theme prints from a post's meta, beside a featured picture the agent already set, is found by media.usage — build 13", () => {
  // The Willow Nook local, build 13: post 54's `_thumbnail_id` was the research's photo, but JA Diner prints a card
  // from `jd_intro_image` first, which still held news-1.jpg. The QA now reports it (a library upload, `unshown`).
  const inventory = [
    { identity: { kind: 'post', id: 63 }, routes: ['/'], data: { post_content: '' } },
    {
      identity: { kind: 'post', id: 54 },
      routes: ['/a-quiet-evening/'],
      data: { post_content: '' },
      featured: { id: 401, url: 'https://diner.test/wp-content/uploads/tracy-content/ab12.jpg' }
    }
  ]
  const pictures = [
    {
      page: '/',
      file: 'wp-content/uploads/2026/10/news-1.jpg',
      kind: 'img',
      size: '288×288',
      selector: 'div.post-thumb > img.attachment-post-thumbnail.size-post-thumbnail',
      link: 'https://diner.test/a-quiet-evening/',
      unshown: true
    }
  ]
  const { calls } = planSweep(
    { items: [] },
    {
      ...options,
      origin: 'https://diner.test',
      inventory,
      pictures,
      media: [{ url: '/u/sq.jpg', id: 301, width: 800, height: 800 }]
    }
  )
  assert.deepEqual(
    calls.map((c) => [c.action, c.params.find, c.params.url, c.params.media]),
    [
      [
        'usage',
        'news-1.jpg',
        'https://diner.test/wp-content/uploads/2026/10/news-1.jpg',
        { url: '/u/sq.jpg', id: 301 }
      ]
    ]
  )
})

test("a post's featured picture is set on the post itself, once per post, to an imported photo with a media id (WordPress: its _thumbnail_id meta)", () => {
  const pictures = [
    {
      page: '/our-blog/',
      file: 'wp-content/uploads/2026/10/news-1-768x432.jpg',
      size: '360×203',
      selector: 'a > img.attachment-post-thumbnail.size-post-thumbnail'
    },
    {
      page: '/',
      file: 'wp-content/uploads/2026/10/news-1-768x432.jpg',
      size: '360×203',
      selector: 'a > img.attachment-post-thumbnail.size-post-thumbnail'
    }
  ]
  const posts = [41, 50].map((id) => ({
    identity: { kind: 'post', id },
    routes: [`/p${id}/`],
    featured: { id: 5, url: 'http://x.test/wp-content/uploads/2026/10/news-1.jpg' }
  }))
  const media = [
    { url: '/u/a.jpg', id: 301, width: 1600, height: 900 },
    { url: '/u/b.jpg', id: 302, width: 1600, height: 900 }
  ]
  const { calls } = planSweep(
    { items: [] },
    { ...options, inventory: [...posts, ...inventory], pictures, media }
  )
  assert.deepEqual(
    calls.map((c) => [c.action, c.params.kind, c.params.id, c.params.key, c.params.fields?.value]),
    [
      ['content.update', 'postmeta', 41, '_thumbnail_id', 301],
      ['content.update', 'postmeta', 50, '_thumbnail_id', 302]
    ]
  )
})

test('every template post the plan left unwritten takes a research post, the build day and a photo, even one the check never opened', () => {
  const template = (id, extra = {}) => ({
    identity: { kind: 'post', id },
    routes: [`/p${id}/`],
    data: {
      post_type: 'post',
      post_name: 'burger-king-takes-a-stand',
      post_title: 'Burger King takes a stand',
      post_excerpt: 'Convallis nulla mauris.',
      post_content:
        '<!-- wp:paragraph --><p>Convallis nulla mauris.</p><!-- /wp:paragraph --><!-- wp:quote --><blockquote><!-- wp:paragraph --><p>Q</p><!-- /wp:paragraph --></blockquote><!-- /wp:quote -->',
      post_date: '2021-09-10 01:38:00',
      ...extra
    },
    featured: { id: 9, url: 'http://x.test/wp-content/uploads/2026/10/news-detail-1.jpg' }
  })
  const frozen = [template(58), template(59)]
  const media = [{ url: '/u/a.jpg', id: 301, width: 1600, height: 900 }]
  const live = [template(58), template(59, { post_title: 'Board game night' })]
  const postDrafts = [reservations, hours]
  const { calls } = planSweep(
    { items: [] },
    { ...options, inventory: live, templatePosts: frozen, media, postDrafts }
  )
  assert.deepEqual(calls, [
    {
      action: 'post',
      params: {
        platform: 'wordpress',
        kind: 'post',
        id: 58,
        fields: {
          post_date: '2026-10-24 00:00:00',
          featured_image_id: 301,
          post_excerpt: 'Groups of 5–20 people can send an online reservation request.',
          post_title: 'Reservations',
          // The slug from the title the sweep writes, in the same write (product owner, 26/10/2026).
          post_name: 'reservations'
        },
        was: {
          post_date: '2021-09-10 01:38:00',
          post_excerpt: 'Convallis nulla mauris.',
          post_title: 'Burger King takes a stand',
          post_name: 'burger-king-takes-a-stand'
        },
        // The slug goes with the title it was made of (`sweep-resolve.mjs` `slugWithTitle`).
        slugFrom: 'post_title',
        body: 'Groups of 5–20 people can send an online reservation request.'
      }
    },
    {
      action: 'post',
      params: {
        platform: 'wordpress',
        kind: 'post',
        id: 59,
        fields: {
          post_date: '2026-10-24 00:00:00',
          featured_image_id: 301,
          post_excerpt: 'Monday 09:00-22:00.'
        },
        was: { post_date: '2021-09-10 01:38:00', post_excerpt: 'Convallis nulla mauris.' },
        body: 'Monday 09:00-22:00.'
      }
    }
  ])
  // A body of one block is sent too: the resolver writes it on a read made for it, which BODY_SHRINK passes.
  const one = template(60, { post_content: '<!-- wp:paragraph --><p>Lorem ipsum.</p><!-- /wp:paragraph -->' })
  const single = planSweep(
    { items: [] },
    { ...options, inventory: [one], templatePosts: [one], media, postDrafts }
  )
  assert.deepEqual(
    single.calls.map((c) => [c.action, c.params.id, c.params.body]),
    [['post', 60, reservations.body]]
  )
  assert.equal(single.unresolved.length, 0)
  // 🔒 With no research left, nothing says "Coming soon": the post keeps the template's and is reported.
  const none = planSweep({ items: [] }, { ...options, inventory: [one], templatePosts: [one], media })
  assert.ok(none.calls.every((c) => !JSON.stringify(c).includes('Coming soon')))
  assert.deepEqual(
    none.unresolved.map((u) => [u.page, u.field]),
    [
      ['/p60/', 'post_content'],
      ['/p60/', 'title']
    ]
  )
  // Swept: no field still holds the template's, so nothing is planned again.
  const swept = live.map((r) => ({
    ...r,
    data: {
      ...r.data,
      post_title: r.data.post_title === 'Board game night' ? r.data.post_title : 'Reservations',
      post_excerpt: 'Groups of 5–20 people can send an online reservation request.',
      post_content: '<p>Groups of 5–20 people can send an online reservation request.</p>',
      post_date: '2026-10-24 00:00:00'
    },
    featured: { id: 301, url: '/u/a.jpg' }
  }))
  assert.deepEqual(
    planSweep({ items: [] }, { ...options, inventory: swept, templatePosts: frozen, media, postDrafts })
      .calls,
    []
  )
})

test("a template post is swept only in the fields the agent's plan did not write", () => {
  const frozen = {
    identity: { kind: 'post', id: 58 },
    routes: ['/p58/'],
    data: {
      post_type: 'post',
      post_title: 'Burger King takes a stand',
      post_excerpt: 'Convallis nulla mauris.',
      post_content: '<!-- wp:paragraph --><p>Convallis nulla mauris.</p><!-- /wp:paragraph -->',
      post_date: '2021-09-10 01:38:00'
    },
    featured: { id: 9, url: 'http://x.test/wp-content/uploads/2026/10/news-detail-1.jpg' }
  }
  const media = [{ url: '/u/a.jpg', id: 301, width: 1600, height: 900 }]
  const row = (path, extra = {}) => ({
    operation: 'rewrite',
    target: { kind: 'native', type: 'post', id: 58, path },
    ...extra
  })
  const planOf = (rows) => ({ structure: { inventory: { records: [frozen] } }, rows })
  const sweep = (rows, live) =>
    planSweep(
      { items: [] },
      {
        ...options,
        inventory: [live],
        templatePosts: templatePostsLeft(planOf(rows)),
        media,
        postDrafts: [reservations]
      }
    )
  // A row that wrote only the title: the title is the agent's, the body, excerpt, date and photo are still swept.
  const titled = { ...frozen, data: { ...frozen.data, post_title: 'Our new terrace' } }
  const titleOnly = sweep([row('post_title', { post: { topic: 'terrace' } })], titled)
  assert.deepEqual(titleOnly.calls, [
    {
      action: 'post',
      params: {
        platform: 'wordpress',
        kind: 'post',
        id: 58,
        fields: {
          post_date: '2026-10-24 00:00:00',
          featured_image_id: 301,
          post_excerpt: reservations.excerpt
        },
        was: { post_date: '2021-09-10 01:38:00', post_excerpt: 'Convallis nulla mauris.' },
        body: reservations.body
      }
    }
  ])
  // While counted checks remain, the field the agent wrote is left alone even where its value reads as the template's.
  const early = (rows, live) =>
    planSweep(
      { items: [] },
      { ...options, inventory: [live], templatePosts: templatePostsLeft(planOf(rows)), media, checksLeft: 1 }
    )
  assert.equal(early([row('post_title')], frozen).calls[0].params.fields.post_title, undefined)
  // A full rewrite: every field is the agent's, nothing is swept.
  const full = ['post_title', 'post_content', 'post_excerpt', 'post_date', 'featured_image_id'].map((path) =>
    row(path)
  )
  assert.deepEqual(early(full, frozen).calls, [])
  // 🔒 After the agent, whatever still shows the template's is swept, written in the plan or not (build 13, 25/10/2026):
  // the plan wrote all 22 bodies and every post page kept the lorem. A post with no material of its own takes the
  // next research post, never the research's lead line copied into every post (round 10) nor "Coming soon".
  const last = planSweep(
    { items: [] },
    {
      ...options,
      inventory: [frozen],
      templatePosts: templatePostsLeft(planOf(full)),
      media,
      leadLine: 'A cafe and cocktail bar in the Latin Quarter.',
      postDrafts: [hours]
    }
  )
  assert.deepEqual(
    last.calls.map((c) => [c.action, c.params.id, c.params.fields?.post_title, c.params.body]),
    [['post', 58, 'Monday 09:00-22:00', 'Monday 09:00-22:00.']]
  )
  // Early, the agent is told which written post still shows the template's body.
  assert.ok(early(full, frozen).unresolved.some((u) => u.page === '/p58/' && /template's body/.test(u.why)))
  // A second run over the swept site plans nothing.
  const swept = {
    ...titled,
    data: {
      ...titled.data,
      post_excerpt: reservations.excerpt,
      post_content: `<p>${reservations.body}</p>`,
      post_date: '2026-10-24 00:00:00'
    },
    featured: { id: 301, url: '/u/a.jpg' }
  }
  assert.deepEqual(sweep([row('post_title', { post: { topic: 'terrace' } })], swept).calls, [])
})

test("an image row on a post's body writes the picture only: the template's prose is still swept, once", () => {
  const prose = '<!-- wp:paragraph --><p>Convallis nulla mauris.</p><!-- /wp:paragraph -->'
  const frozen = {
    identity: { kind: 'post', id: 58 },
    routes: ['/p58/'],
    data: {
      post_type: 'post',
      post_title: 'Burger King takes a stand',
      post_content: `<!-- wp:image {"id":9} --><figure><img src="/t/news-1.jpg"/></figure><!-- /wp:image -->${prose}`,
      post_date: '2021-09-10 01:38:00'
    }
  }
  const plan = {
    structure: { inventory: { records: [frozen] } },
    rows: [
      { operation: 'replace-image', target: { kind: 'native', type: 'post', id: 58, path: 'post_content' } }
    ]
  }
  const pictured = `<!-- wp:image {"id":301} --><figure><img src="/u/a.jpg"/></figure><!-- /wp:image -->${prose}`
  const live = { ...frozen, data: { ...frozen.data, post_content: pictured } }
  const sweep = (record) =>
    planSweep(
      { items: [] },
      { ...options, inventory: [record], templatePosts: templatePostsLeft(plan), postDrafts: [reservations] }
    )
  assert.deepEqual(templatePostsLeft(plan)[0].written, [])
  assert.deepEqual(sweep(live).calls, [
    {
      action: 'post',
      params: {
        platform: 'wordpress',
        kind: 'post',
        id: 58,
        fields: { post_date: '2026-10-24 00:00:00', post_title: 'Reservations' },
        was: { post_date: '2021-09-10 01:38:00', post_title: 'Burger King takes a stand' },
        body: reservations.body,
        template: frozen.data.post_content
      }
    }
  ])
  // Swept: the agent's picture stays beside the research's words, and nothing is planned again.
  const swept = {
    ...live,
    data: {
      ...live.data,
      post_title: 'Reservations',
      post_date: '2026-10-24 00:00:00',
      post_content: `<!-- wp:image {"id":301} --><figure><img src="/u/a.jpg"/></figure><!-- /wp:image --><!-- wp:paragraph --><p>${reservations.body}</p><!-- /wp:paragraph -->`
    }
  }
  assert.deepEqual(sweep(swept).calls, [])
})

test("a page's buttons sharing one address and one destination go as one call naming each, counting them all", () => {
  const items = ['facebook', 'twitter'].map((text) => ({
    field: 'link',
    page: '/contact-us/',
    href: 'http://joomlart.com',
    text,
    to: 'contact'
  }))
  const { calls } = planSweep({ items }, { ...options, inventory, contactPath: '/contact-us/' })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].params.texts, ['facebook', 'twitter'])
  assert.equal(calls[0].params.text, undefined)
  assert.equal(calls[0].params.rendered.expect, 2)
})

test("a picture that is a file of the theme's own is reported, never sent to a record", () => {
  const pictures = [
    {
      page: '/about-us/',
      file: 'wp-content/themes/wp-ja-diner/assets/img/bg-masthead.jpg',
      kind: 'background',
      size: '1440×389',
      selector: 'div.ja-masthead'
    }
  ]
  const media = [{ url: '/u/a.jpg', id: 301, width: 1600, height: 900 }]
  const { calls, unresolved } = planSweep({ items: [] }, { ...options, pictures, media })
  assert.deepEqual(calls, [])
  assert.match(unresolved[0].why, /theme's own/)
})

test('a template picture the QA passed as design is reported unresolved by its file, never written', () => {
  const design = [
    {
      page: '/',
      file: 'wp-content/themes/wp-ja-diner/assets/img/decor_orange.png',
      kind: 'background',
      selector: 'div.masthead::after',
      why: "the template picture decor_orange.png passes as the theme's design; it stays until the owner decides"
    }
  ]
  const { calls, unresolved } = planSweep({ items: [] }, { ...options, design })
  assert.deepEqual(calls, [])
  assert.deepEqual(
    unresolved.map((u) => [u.field, u.file]),
    [['picture', 'wp-content/themes/wp-ja-diner/assets/img/decor_orange.png']]
  )
  assert.match(unresolved[0].why, /decor_orange\.png/)
})

test("a theme file the page's record holds (a pattern's placeholder.svg) takes an imported picture in that record", () => {
  const placeholder = 'http://site.test/wp-content/themes/wp-ja-diner/assets/img/placeholder.svg'
  const held = [
    {
      identity: { kind: 'post', id: 21 },
      routes: ['/contact-us/'],
      data: {
        post_content: `<!-- wp:image --><figure><img src="${placeholder}"/></figure><!-- /wp:image -->`
      }
    }
  ]
  const pictures = [
    {
      page: '/contact-us/',
      file: 'wp-content/themes/wp-ja-diner/assets/img/placeholder.svg',
      kind: 'img',
      size: '600×400'
    }
  ]
  const media = [{ url: '/u/a.jpg', id: 301, width: 1600, height: 900 }]
  const { calls, unresolved } = planSweep({ items: [] }, { ...options, inventory: held, pictures, media })
  assert.deepEqual(unresolved, [])
  assert.deepEqual(
    calls.map((c) => [c.action, c.params.find, c.params.media.url, c.params.records.map((r) => r.id)]),
    [['image', 'placeholder.svg', '/u/a.jpg', [21]]]
  )
})

test("a design photo the page's record holds takes an imported picture; a stamp and a stylesheet's photo stay named", () => {
  const held = [
    {
      identity: { kind: 'post', id: 5 },
      routes: ['/'],
      data: {
        post_content:
          '<!-- wp:cover {"url":"/wp-content/uploads/2024/01/bg-booking.jpg"} --><!-- /wp:cover -->'
      }
    }
  ]
  const design = [
    { page: '/', file: 'wp-content/uploads/2024/01/bg-booking.jpg', kind: 'background', size: '1440×600' },
    {
      page: '/',
      file: 'wp-content/themes/wp-ja-diner/assets/img/bg-masthead.jpg',
      kind: 'background',
      size: '1440×389'
    },
    {
      page: '/',
      file: 'wp-content/themes/wp-ja-diner/assets/img/stamp.png',
      kind: 'background',
      size: '200×200'
    }
  ]
  const media = [{ url: '/u/a.jpg', id: 301, width: 1600, height: 900 }]
  const { calls, unresolved } = planSweep({ items: [] }, { ...options, inventory: held, design, media })
  assert.deepEqual(
    calls.map((c) => [c.action, c.params.find]),
    [['image', 'bg-booking.jpg']]
  )
  assert.deepEqual(
    unresolved.map((u) => u.file.split('/').at(-1)),
    ['bg-masthead.jpg', 'stamp.png']
  )
})

test("a template category takes a name from the written posts' topics, once per name; one past the last topic is reported", () => {
  // The QA's `words` are its case-blind key; `name` is the label as the page writes it.
  const categories = ['Breakfast', 'Lunch', 'Dinner', 'Breakfast', 'Drinks'].map((name) => ({
    page: '/our-blog/',
    words: name.toLowerCase(),
    name,
    category: `/category/${name.toLowerCase()}/`
  }))
  const { calls, unresolved } = planSweep(
    { items: [] },
    { ...options, categories, topicNames: ['News', 'Food', 'Food', 'Drinks'] }
  )
  // "Drinks" is already a topic's name; "Breakfast" twice is one rename; "Dinner" has no topic left. Each rename is
  // written on the category's own archive, where the replace job reads the term (`replace-wordpress.mjs` `archiveOf`).
  assert.deepEqual(
    calls.map((c) => [c.action, c.params.find, c.params.replace, c.params.path]),
    [
      ['content.replace', 'Breakfast', 'News', '/category/breakfast/'],
      ['content.replace', 'Lunch', 'Food', '/category/lunch/']
    ]
  )
  assert.deepEqual(
    unresolved.map((u) => [u.field, u.name]),
    [['category', 'Dinner']]
  )
})

test('dev 27/10/2026: a template category shown on posts is renamed once, on its own archive, never per post page', () => {
  // ja-diner: "Restaurant Marketing" planned on each post page that showed it, six rounds, and still shown.
  const categories = ['/would-you-throw-a-glass-at-your-boss/', '/vi-soger-nye-bartendere-baristaer/'].map(
    (page) => ({
      page,
      words: 'restaurant marketing',
      name: 'Restaurant Marketing',
      category: '/category/restaurant-marketing/'
    })
  )
  const plan = planSweep({ items: [] }, { ...options, categories, topicNames: ['Seasonal menus'] })
  assert.deepEqual(
    plan.calls.map((c) => [c.params.find, c.params.replace, c.params.path]),
    [['Restaurant Marketing', 'Seasonal menus', '/category/restaurant-marketing/']]
  )
  assert.deepEqual(plan.renamed, ['Restaurant Marketing'])
  assert.equal(plan.left, 1)
})

test('a template category no text replace can rename is reported on the first check that sees it, never planned, never in `left`', () => {
  const category = {
    page: '/blog/a-post/',
    words: 'restaurant news',
    name: 'Restaurant News',
    category: '/category/restaurant-news/'
  }
  const left = (o) => planSweep({ items: [] }, { ...options, topicNames: ['Seasonal menus'], ...o })
  // Joomla keeps a category title in no content slot, EmDash's taxonomy labels are not a replace's to write.
  for (const platform of ['joomla', 'emdash']) {
    const plan = left({ platform, categories: [category] })
    assert.deepEqual(plan.calls, [], platform)
    assert.equal(plan.left, 0, platform)
    assert.deepEqual(
      plan.unresolved.map((u) => [u.field, u.name]),
      [['category', 'Restaurant News']]
    )
    assert.match(plan.unresolved[0].why, /not words a text replace can write/)
  }
  // A link to no page of the site: no archive to rename it on.
  const offSite = left({ categories: [{ ...category, category: 'https://elsewhere.example/c/news' }] })
  assert.deepEqual([offSite.calls.length, offSite.left, offSite.unresolved.length], [0, 0, 1])
  // On WordPress, a rename an earlier round of this counted check sent whose name still shows did not take: reported
  // at once, never planned a second time, and out of `left`, so it keeps no round going.
  const again = left({ categories: [category], renamedBefore: ['Restaurant News'] })
  assert.deepEqual([again.calls.length, again.left, again.renamed], [0, 0, []])
  assert.match(again.unresolved[0].why, /earlier round/)
})

test("the template's logo becomes the business's: its imported logo, else its drawn wordmark, once per site", () => {
  const logoOn = (page) => ({
    page,
    file: 'wp-content/uploads/2026/10/jd-site-logo.png',
    kind: 'img',
    size: '128×80',
    selector: 'a.custom-logo-link > img.custom-logo'
  })
  const pictures = [logoOn('/'), logoOn('/blog/')]
  const wordmark = { png: 'iVBOR', name: 'Ramen Bar' }
  const drawn = planSweep({ items: [] }, { ...options, pictures, wordmark })
  assert.deepEqual(
    drawn.calls.map((c) => [c.action, c.params.find, c.params.png, c.params.name]),
    [['logo', 'jd-site-logo.png', 'iVBOR', 'Ramen Bar']]
  )
  assert.equal(drawn.unresolved.length, 0)
  // The research's logo wins over a wordmark.
  const own = planSweep({ items: [] }, { ...options, pictures, wordmark, logo: { url: '/u/l.png', id: 41 } })
  assert.deepEqual(
    own.calls.map((c) => [c.action, c.params.media, c.params.png]),
    [['logo', { url: '/u/l.png', id: 41 }, undefined]]
  )
  // Laid in the template logo's box by the page reader, it is set as that picture, uploaded or worn as a png.
  const fitted = planSweep(
    { items: [] },
    { ...options, pictures, wordmark, logo: { url: '/u/l.png', id: 41 }, fittedLogo: { png: 'iVBORfit' } }
  )
  assert.deepEqual(
    fitted.calls.map((c) => [c.action, c.params.media, c.params.png]),
    [['logo', { url: '/u/l.png' }, 'iVBORfit']]
  )
})

test('the fitted business logo wins over a logo the agent set itself, and a second run plans nothing', () => {
  const logo = { url: '/u/l.png', id: 41 }
  // No template logo left on the page: the agent set the business's badge, unfitted.
  const agentSet = { png: 'iVBORfit', logo: 'https://diner.test/wp-content/uploads/2026/10/badge.png?v=2' }
  const over = planSweep({ items: [] }, { ...options, logo, fittedLogo: agentSet })
  assert.deepEqual(
    over.calls.map((c) => [c.action, c.params.path, c.params.find, c.params.png, c.params.media]),
    [['logo', '/', 'badge.png', 'iVBORfit', { url: '/u/l.png' }]]
  )
  // The page already shows the fitted copy: nothing.
  const again = planSweep({ items: [] }, { ...options, logo, fittedLogo: { ...agentSet, matches: true } })
  assert.deepEqual(again.calls, [])
  // No research logo, or none fitted: the agent's logo is left alone.
  assert.deepEqual(planSweep({ items: [] }, { ...options, fittedLogo: agentSet }).calls, [])
  assert.deepEqual(planSweep({ items: [] }, { ...options, logo }).calls, [])
})

test("the business's logo is the brief's chosen one, as the build imported it; none when it was not written", async () => {
  const { importedLogo } = await import('../src/opportunities-build/client-demo.js')
  const build = {
    content: {
      agentDemo: {
        imports: {
          a: { state: 'written', assetId: 'm-photo', path: '/u/p.jpg', mediaId: 7 },
          b: { state: 'written', assetId: 'm-logo', path: '/u/l.png', mediaId: 41 },
          c: { state: 'failed', assetId: 'm-other', path: '/u/o.png' }
        }
      }
    }
  }
  assert.deepEqual(importedLogo(build, { logo: 'm-logo' }), { url: '/u/l.png', id: 41 })
  assert.equal(importedLogo(build, { logo: 'm-other' }), null)
  assert.equal(importedLogo(build, {}), null)
})

test("a wordmark dsh has no logo writer for is worn by tracy-web's brand writer; one it did not take stays unresolved", async () => {
  const plan = {
    calls: [
      { action: 'content.replace', params: { find: 'x' } },
      {
        action: 'logo',
        params: { platform: 'joomla', path: '/', find: 'logo.png', png: 'iVBOR', name: 'Mai Bistro' }
      }
    ],
    unresolved: []
  }
  const { wornLogo } = await import('../src/opportunities-build/client-demo.js')
  const seen = []
  const worn = await wornLogo(plan, {
    platform: 'joomla',
    wear: async (input) => (seen.push(input), { written: ['logo'], skipped: [] }),
    now: () => 1000
  })
  assert.deepEqual(seen, [{ png: 'iVBOR', applyId: `sweep-logo-${(1000).toString(36)}` }])
  assert.deepEqual(
    worn.calls.map((c) => c.action),
    ['content.replace']
  )
  assert.deepEqual(worn.unresolved, [])
  const refused = await wornLogo(plan, {
    platform: 'emdash',
    wear: async () => ({ written: [], skipped: [{ where: 'logo', reason: 'the site keeps no logo spot' }] }),
    now: () => 1000
  })
  assert.deepEqual(refused.calls.length, 1)
  assert.match(refused.unresolved[0].why, /did not wear the wordmark: the site keeps no logo spot/)
  assert.equal(refused.unresolved[0].file, 'logo.png')
  // WordPress keeps the call for dsh's own writer; no writer handed in keeps it too.
  assert.equal(await wornLogo(plan, { platform: 'wordpress', wear: async () => ({}), now: () => 1 }), plan)
  assert.equal(await wornLogo(plan, { platform: 'joomla', wear: null, now: () => 1 }), plan)
})

test('the sweep plans from every template picture the check found; the agent reads the twenty of its detail', async () => {
  const { sweepPicturesOf, checksForAgent } = await import('../src/opportunities-build/client-demo.js')
  // lrsweep rig round 6: 42 still shown, 20 in `detail`; the blog sidebar's banner was past the twentieth.
  const all = Array.from({ length: 42 }, (_, i) => ({ page: '/our-blog/', file: `demo-${i}.jpg` }))
  const checks = [
    { id: 'no-demo-words', pass: true, detail: [] },
    { id: 'no-demo-pictures', pass: false, detail: all.slice(0, 20), pictures: all }
  ]
  assert.equal(sweepPicturesOf(checks).length, 42)
  const agent = checksForAgent(checks)
  assert.equal('pictures' in agent[1], false)
  assert.equal(agent[1].detail.length, 20)
  // A host from before `pictures`: its detail, as before.
  assert.equal(
    sweepPicturesOf([{ id: 'no-demo-pictures', pass: false, detail: all.slice(0, 20) }]).length,
    20
  )
  assert.deepEqual(sweepPicturesOf([{ id: 'no-demo-pictures', pass: true }]), [])
})

test('a sweep goes on while each round plans fewer calls, and stops on no progress or at its bound, reported', async () => {
  const { sweepDecision, sweepStopped, SWEEP_ROUNDS_MAX } = await import(
    '../src/opportunities-build/client-demo.js'
  )
  // The first sweep of a counted check always runs; a new attempt starts again from zero.
  assert.deepEqual(sweepDecision(null, 0, { left: 260 }), { go: true, rounds: 0 })
  assert.deepEqual(sweepDecision({ attempt: 0, n: 3, left: 40 }, 1, { left: 40 }), { go: true, rounds: 0 })
  // Progress: fewer calls than the round before.
  assert.deepEqual(sweepDecision({ attempt: 0, n: 2, left: 140 }, 0, { left: 14 }), { go: true, rounds: 2 })
  // No progress: the same calls planned again.
  assert.deepEqual(sweepDecision({ attempt: 0, n: 2, left: 14 }, 0, { left: 14 }), {
    go: false,
    rounds: 2,
    stopped: 'no-progress'
  })
  // The bound, still progressing.
  assert.equal(SWEEP_ROUNDS_MAX, 6)
  assert.deepEqual(sweepDecision({ attempt: 0, n: 6, left: 9 }, 0, { left: 3 }), {
    go: false,
    rounds: 6,
    stopped: 'bound'
  })
  // Nothing left to sweep: counted, no stop to report.
  assert.deepEqual(sweepDecision({ attempt: 0, n: 2, left: 14 }, 0, null), { go: false, rounds: 2 })
  // A stopped sweep runs no calls, says why and what is left, and keeps `shown` for dsh's re-read.
  const sweep = {
    calls: [{ action: 'content.replace', params: {} }],
    unresolved: [{ field: 'picture' }],
    left: 3
  }
  const stopped = sweepStopped({ ...sweep, shown: ['/a/\u0000x'] }, 'bound', 6)
  assert.deepEqual(stopped.calls, [])
  assert.deepEqual(stopped.stopped, { why: 'bound', rounds: 6, left: 3 })
  assert.equal(stopped.unresolved.length, 2)
  assert.match(stopped.unresolved[1].why, /bound of 6 rounds with 3 changes/)
  assert.deepEqual(stopped.shown, ['/a/\u0000x'])
  assert.match(sweepStopped(sweep, 'no-progress', 2).unresolved[1].why, /round 2 cleared nothing/)
})

test("dev 27/10/2026: the check after a sweep round keeps every page the sweep left unchanged; a new build's first check reads all", async () => {
  const { checkIsIncremental, renamedBeforeOf } = await import('../src/opportunities-build/client-demo.js')
  // The agent's first check reads every page: nothing was read before it.
  assert.equal(checkIsIncremental(null), false)
  assert.equal(checkIsIncremental({ clientCheckAttempts: 0 }), false)
  // Its sweep rounds' checks read again only the pages whose document changed (`demo-qa-browser.js` `previous`).
  assert.equal(checkIsIncremental({ clientCheckAttempts: 0, residueSweeps: { attempt: 0, n: 1 } }), true)
  // A sweep of an earlier counted check says nothing; a counted check before does.
  assert.equal(checkIsIncremental({ clientCheckAttempts: 1, residueSweeps: { attempt: 0, n: 6 } }), true)
  assert.equal(checkIsIncremental({ clientCheckAttempts: 0, residueSweeps: { attempt: 0, n: 0 } }), false)
  // The renames sent stay with the counted check whose rounds sent them.
  assert.deepEqual(
    renamedBeforeOf({ clientCheckAttempts: 0, residueSweeps: { attempt: 0, renamed: ['Restaurant News'] } }),
    ['Restaurant News']
  )
  assert.deepEqual(
    renamedBeforeOf({ clientCheckAttempts: 1, residueSweeps: { attempt: 0, renamed: ['Restaurant News'] } }),
    []
  )
})

test("the plan says how many calls it holds before the cap, and every page's words a replace would clear", () => {
  const asked = SWEEP_MAX_CALLS + 30
  const many = Array.from({ length: asked }, (_, i) => ({
    page: '/about-us/',
    text: `Template sentence number ${i} of the demo`,
    field: 'passage'
  }))
  const plan = planSweep({ items: many }, options)
  assert.equal(plan.calls.length, SWEEP_MAX_CALLS)
  assert.equal(plan.left, asked)
  assert.equal(plan.shown.length, asked)
  assert.ok(plan.shown.includes(`/about-us/\u0000Template sentence number ${asked - 1} of the demo`))
})

/** A page with a banner (a heading and its lead), a card and a long passage under a section heading. */
function bannerRead(lead, path = '/our-blog/') {
  const { document } = parseHTML(`<html><body>
    <div class="wrap t3-masthead"><div class="ja-masthead-detail">
      <h1 class="ja-masthead-title">Our Blog</h1>
      <p class="ja-masthead-description">${lead}</p>
    </div></div>
    <article class="post"><h2><a href="/a-post/">A post of the template</a></h2><p>Short card words under its title</p></article>
    <section><h2>Our story</h2><p>${'Lorem ipsum dolor sit amet consectetur '.repeat(8)}</p></section>
  </body></html>`)
  return {
    path,
    url: `${ORIGIN}${path}`,
    status: 200,
    navLinks: [path],
    blocks: [],
    ctas: [],
    residue: readResidueInPage({ origin: ORIGIN }, document)
  }
}
const TEMPLATE_LEAD = 'Responsive WordPress theme for restaurant'

test("a page's lead is the short line under its heading, named to the agent by page, place and words", () => {
  const units = bannerRead(TEMPLATE_LEAD).residue.units.filter((u) => u.lead)
  // Only the banner's line: a card's words and a long passage under a section heading are not leads.
  assert.deepEqual(
    units.map((u) => u.text),
    [TEMPLATE_LEAD]
  )
  const handed = baselineOf([bannerRead(TEMPLATE_LEAD)])
  assert.deepEqual(editorialLeads(handed), [
    { page: '/our-blog/', at: 'div.ja-masthead-detail > p.ja-masthead-description', text: TEMPLATE_LEAD }
  ])
})

test("a slideshow's slide is an item, and its line under the page's h1 is the hero's lead; a card's line under its h3 is not", () => {
  const { document } = parseHTML(`<html><body>
    <div class="slideshow"><div class="wp-block-group item"><div class="slider-content-inner">
      <h1 class="slide-title">Hey Harry!!! Are you ready for restaurant week?</h1>
      <p class="lead">Nonimperdiet pellentesque habitant morbi ristique senectus et netus et malesuada.</p>
    </div></div></div>
    <div class="features"><div class="feature-item"><h3>Location</h3><p>Our dining room sits by the old harbour wall.</p></div></div>
  </body></html>`)
  const leads = readResidueInPage({ origin: ORIGIN }, document).units.filter((u) => u.lead)
  assert.deepEqual(
    leads.map((u) => u.text),
    ['Nonimperdiet pellentesque habitant morbi ristique senectus et netus et malesuada.']
  )
})

const leadsOf = (html) =>
  readResidueInPage({ origin: ORIGIN }, parseHTML(`<html><body>${html}</body></html>`).document)
    .units.filter((u) => u.lead)
    .map((u) => u.text)

test("a card's line under its title is the card's, never a page lead: a card class, or a grid of same-shaped boxes", () => {
  const line = 'Our dining room sits by the old harbour wall.'
  assert.deepEqual(
    leadsOf(`<div class="cards"><div class="card"><h3>Location</h3><p>${line}</p></div></div>`),
    []
  )
  assert.deepEqual(
    leadsOf(`<div class="row"><div class="col feature-card"><h2>Location</h2><p>${line}</p></div></div>`),
    []
  )
  assert.deepEqual(
    leadsOf(`<div class="grid">
      <div class="col"><h3>Location</h3><p>${line}</p></div>
      <div class="col"><h3>Hours</h3><p>Open from breakfast until the last train home.</p></div>
    </div>`),
    []
  )
  // A team's members named by their h2s, and a footer's columns several wrappers above the line (lrsweep rig,
  // JA Diner WP): each line belongs to its box.
  const member = (
    name,
    role
  ) => `<div class="col-sm-3"><div class="member-ele"><div class="name"><h2>${name}</h2></div>
    <div class="office"><p>${role}</p></div></div></div>`
  assert.deepEqual(
    leadsOf(
      `<section class="t3-section"><div class="row">${member('Darren Klein', 'Head Sommelier')}${member('Ana Holm', 'Chef Patron')}</div></section>`
    ),
    []
  )
  const column = (
    title,
    line
  ) => `<div class="col-md-4 col"><div class="t3-module module"><div class="module-inner">
    <h3 class="module-title"><span>${title}</span></h3><div class="module-ct"><div class="custom"><p><span>${line}</span></p></div></div></div></div></div>`
  assert.deepEqual(
    leadsOf(
      `<footer><div class="row">${column('Location.', '398 North 23th Dumbledore Street,')}${column('Open hours.', 'Sunday: 10a.m - Close.')}</div></footer>`
    ),
    []
  )
  // 🔒 A grid is known by its boxes' shape, not their class list (review 24/10/2026): `col first` beside `col
  // last`, numbered items, boxes with no class at all, each a heading of one level and its line.
  for (const [a, b] of [
    ['class="col first"', 'class="col last"'],
    ['class="item item-1"', 'class="item item-2 is-active"'],
    ['', '']
  ])
    assert.deepEqual(
      leadsOf(`<div class="grid"><div ${a}><h3>Location</h3><p>${line}</p></div>
        <div ${b}><h3>Hours</h3><p>Open from breakfast until the last train home.</p></div></div>`),
      [],
      a
    )
  // Sections of a page shaped alike are no cards: each one's intro under its h2 is still its lead.
  assert.deepEqual(
    leadsOf(`<section class="block"><h2>Our story</h2><p>${line}</p></section>
      <section class="block"><h2>Our menu</h2><p>Seasonal plates from the farms around the city.</p></section>`),
    [line, 'Seasonal plates from the farms around the city.']
  )
})

test('boxes shaped alike are a grid when the page lays them out on one row; stacked one under the other, each keeps its intro', () => {
  const html = `<html><body><main><div class="wrap">
    <div class="block-1"><h5>For lunch</h5><h2>We take reservations for lunch</h2><div class="description"><p>Plates from the farms around the city, served from noon.</p></div></div>
    <div class="block-2"><h5>For dinner</h5><h2>Evenings at the bar</h2><div class="description"><p>Cocktails and small plates until the last train home.</p></div></div>
  </div></main></body></html>`
  const read = (rows) => {
    const { document } = parseHTML(html)
    const boxes = [...document.querySelectorAll('.wrap > div')]
    boxes.forEach((box, i) => {
      const top = rows === 'one' ? 0 : i * 500
      box.getBoundingClientRect = () => ({
        top,
        bottom: top + 400,
        left: i * 700,
        right: i * 700 + 600,
        width: 600,
        height: 400
      })
    })
    return readResidueInPage({ origin: ORIGIN }, document)
      .units.filter((u) => u.lead)
      .map((u) => u.text)
  }
  assert.deepEqual(read('one'), [])
  assert.deepEqual(read('stacked'), [
    'Plates from the farms around the city, served from noon.',
    'Cocktails and small plates until the last train home.'
  ])
})

test('boxes shaped alike under a higher heading that introduces them are cards, stacked or not; sections that each own the top heading keep their intros', () => {
  const lay = (document, rows) => {
    const boxes = [...document.querySelectorAll('.grid > div, .wrap > div')]
    boxes.forEach((box, i) => {
      const top = rows === 'one' ? 0 : i * 500
      box.getBoundingClientRect = () => ({
        top,
        bottom: top + 400,
        left: 0,
        right: 600,
        width: 600,
        height: 400
      })
    })
    return readResidueInPage({ origin: ORIGIN }, document)
      .units.filter((u) => u.lead)
      .map((u) => u.text)
  }
  // 🔒 A responsive grid a narrow screen stacks (review 24/10/2026): its `h2` introduces the `h3` boxes, so each
  // box's line is the box's, laid out in one row or stacked.
  const grid = `<html><body><main><div class="page-masthead"><h1>Services</h1></div>
    <section><h2>What we do</h2><div class="grid">
      <div class="col first"><h3>Catering</h3><p>Plates for your party from the kitchen.</p></div>
      <div class="col last"><h3>Private room</h3><p>A room upstairs for up to forty guests.</p></div>
    </div></section></main></body></html>`
  for (const rows of ['one', 'stacked']) assert.deepEqual(lay(parseHTML(grid).document, rows), [], rows)
  // However many wrappers lie between the section's `h2` and its boxes; the section's own intro stays its lead.
  const deep = `<html><body><main><h1>Services</h1><section><div class="head"><h2>What we do</h2><p>All we offer our guests, all year round.</p></div>
    <div class="container"><div class="wp-block-group"><div class="grid">
      <div class="col-md-4"><div class="inner"><h3>Catering</h3><p>Plates for your party from the kitchen.</p></div></div>
      <div class="col-md-4"><div class="inner"><h3>Private room</h3><p>A room upstairs for up to forty guests.</p></div></div>
    </div></div></div></section></main></body></html>`
  for (const rows of ['one', 'stacked'])
    assert.deepEqual(lay(parseHTML(deep).document, rows), ['All we offer our guests, all year round.'], rows)
  // Sections stacked under the page's title, each with its own top heading (`h2`) and its intro: leads, whatever
  // the page's `h1` above them (JA Diner's Reservation page).
  const sections = `<html><body><main><div class="page-masthead"><h1>Reservation</h1><p>Book a table with us tonight.</p></div>
    <div class="wrap">
      <div class="section-a"><h5>For lunch</h5><h2>We take reservations</h2><div class="description"><p>Plates from the farms around the city, served from noon.</p></div></div>
      <div class="section-b"><h5>For dinner</h5><h2>Evenings at the bar</h2><div class="description"><p>Cocktails and small plates until the last train home.</p></div></div>
    </div></main></body></html>`
  assert.deepEqual(lay(parseHTML(sections).document, 'stacked'), [
    'Book a table with us tonight.',
    'Plates from the farms around the city, served from noon.',
    'Cocktails and small plates until the last train home.'
  ])
})

test('a page wrapped in its <article> keeps its lead, and a short line right under the title is one; a label, a button or a meta line is not', () => {
  assert.deepEqual(
    leadsOf(
      '<article class="page type-page hentry"><h1>About us</h1><p>Since 1998, Copenhagen</p></article>'
    ),
    ['Since 1998, Copenhagen']
  )
  // A short line that reads as words stays a lead, separators and all, and a sentence holding a date or a time.
  for (const line of [
    'Open Friday, October 24, 2026 for a tasting evening with the chef',
    'Board game night is back every Wednesday from 19:00.',
    'Since 1998, Copenhagen',
    'Coffee by day, cocktails by night',
    'Eat well / live well today'
  ])
    assert.deepEqual(leadsOf(`<article class="page"><h1>About us</h1><p>${line}</p></article>`), [line], line)
  assert.deepEqual(
    leadsOf(`<article class="post-12 post type-post hentry"><header class="entry-header"><h1 class="entry-title">Our Blog</h1></header>
      <div class="entry-content"><p>Stories from the kitchen and the bar</p><p>${'A longer passage of the template. '.repeat(12)}</p></div></article>`),
    ['Stories from the kitchen and the bar']
  )
  // A post card in a list stays a card: its title links the post.
  assert.deepEqual(
    leadsOf(
      '<article class="post"><h2><a href="/a-post/">A post</a></h2><p>Short card words under it</p></article>'
    ),
    []
  )
  for (const line of [
    '<p class="post-meta">By Admin</p>',
    '<p class="entry-categories">Recipes, Drinks</p>',
    '<p><a href="/menu/" class="btn">Order now</a></p>',
    '<p>Recipes</p>',
    '<p><span class="badge">New today</span></p>',
    '<p><time datetime="2026-10-24">Oct 24</time> news</p>',
    // 🔒 Metadata with no class to say so (review 24/10/2026): a byline, a list of categories, a count, a date,
    // a line inside the post's meta box, or one naming its author by rel.
    '<p>By Admin</p>',
    '<p>Posted by Admin on October 24, 2026</p>',
    '<p>Recipes, Drinks</p>',
    '<p>Recipes | Drinks | Brunch</p>',
    '<p>Recipes / Drinks</p>',
    '<p>3 comments</p>',
    '<p>October 24, 2026</p>',
    '<div class="entry-meta"><div><p>Admin Kitchen</p></div><p>Other words here</p></div>',
    '<p><span rel="author">Ana Holm</span></p>',
    '<p><span itemprop="author">Ana Holm</span></p>',
    // 🔒 At every length (review 24/10/2026): a dated line, a count, a byline past four words.
    '<p>Friday, October 24, 2026</p>',
    '<p>Posted on 24/10/2026</p>',
    '<p>3 comments so far today</p>',
    '<p>Published in Recipes by the kitchen team</p>',
    '<p><time datetime="2026-10-24T19:00">Friday 24 October</time> from 19:00</p>',
    '<p><a href="/news/#comments">Leave a word for the kitchen</a></p>',
    // A post's stamps run together: a date and a count, a date and its author and categories, a time, a count
    // named before its number, a reading time.
    '<p>Friday, October 24, 2026 — 3 Comments</p>',
    '<p>October 24, 2026 by Admin in Recipes</p>',
    '<p>Oct 24, 2026 / Admin / Recipes / Drinks</p>',
    '<p>Oct 24, 2026 at 7:00 pm</p>',
    '<p>Comments (3)</p>',
    '<p>No comments yet on this post</p>',
    '<p>3 min read</p>'
  ])
    assert.deepEqual(leadsOf(`<article class="page"><h1>News</h1>${line}</article>`), [], line)
})

test("a lead the agent's write missed takes the research's own line, never invented words, and a second run plans nothing", () => {
  const handed = baselineOf([bannerRead(TEMPLATE_LEAD)])
  const residue = residueOf([bannerRead(TEMPLATE_LEAD)], { baseline: handed })
  const lead = residue.items.find((i) => i.lead)
  assert.equal(lead.text, TEMPLATE_LEAD)
  const line = 'Coffee, cocktails and cosy corners in Copenhagen.'
  const swept = planSweep(residue, { ...options, leadLine: line })
  const call = swept.calls.find((c) => c.params?.find === TEMPLATE_LEAD)
  assert.equal(call.params.replace, line)
  assert.equal(call.params.path, '/our-blog/')
  assert.equal(swept.thinLeads, 0)
  // The lorem passage under "Our story" is no lead: it is left empty.
  assert.ok(swept.calls.some((c) => c.params?.replace === '' && /Lorem ipsum/.test(c.params.find)))
  // The line written, the page shows no template lead, so nothing is planned for it again.
  const again = residueOf([bannerRead(line)], { baseline: handed })
  assert.equal(
    again.items.some((i) => i.lead),
    false
  )
  assert.equal(
    planSweep(again, { ...options, leadLine: line }).calls.some((c) => c.params?.replace === line),
    false
  )
  // A lead the agent wrote is no residue either: the sweep never rewrites it.
  const written = residueOf([bannerRead('Fresh stories from our kitchen in Copenhagen')], {
    baseline: handed
  })
  assert.equal(
    written.items.some((i) => i.lead),
    false
  )
})

test('with no sourced line in the research, a missed lead is left empty and the plan counts it as thin', () => {
  const handed = baselineOf([bannerRead(TEMPLATE_LEAD)])
  const swept = planSweep(residueOf([bannerRead(TEMPLATE_LEAD)], { baseline: handed }), options)
  assert.equal(swept.calls.find((c) => c.params?.find === TEMPLATE_LEAD).params.replace, '')
  assert.equal(swept.thinLeads, 1)
})

// lrsweep rig (24/10/2026): the Contact page is read off every record's routes, a Joomla path or an EmDash `{pattern}`.
test('contactPathOf finds the Contact page in a Joomla path and in an EmDash route pattern', async () => {
  const { contactPathOf } = await import('../src/opportunities-build/client-demo.js')
  assert.equal(
    contactPathOf([
      { identity: { kind: 'article', id: 1 }, routes: ['/index.php'] },
      { identity: { kind: 'menuItem', id: 112 }, routes: ['/index.php/contact'] }
    ]),
    '/index.php/contact'
  )
  assert.equal(
    contactPathOf([
      { identity: { collection: 'pages', id: 'a' }, routes: [{ pattern: '/about', locale: 'en' }] },
      { identity: { collection: 'pages', id: 'b' }, routes: [{ pattern: '/contact-us', locale: 'en' }] }
    ]),
    '/contact-us'
  )
})

// lrsweep rig, JA Spa j6 (24/10/2026): the T4 header's `span.logo-wrap > img.logo-img` went to the photo lane.
test("the template's logo is known on any CMS: a logo class or id on it or its wrapper, or a picture linking home", () => {
  const wordmark = { png: 'iVBOR', name: 'Mai Spa' }
  const at = (selector, link, file = 'images/joomlart/logo/logo-color.png', page = '/') => ({
    page,
    file,
    kind: 'img',
    size: '80×84',
    selector,
    ...(link ? { link } : {})
  })
  const site = 'http://spa.test'
  const logoOf = (pictures, platform) =>
    planSweep({ items: [] }, { ...options, platform, origin: site, pictures, wordmark }).calls.map((c) => [
      c.action,
      c.params.find,
      c.params.png
    ])
  // Joomla T4: the class is the img's and its wrapper's, the link the site's home through index.php.
  assert.deepEqual(
    logoOf([at('span.logo-wrap.has-logo-2 > img.logo-nav-close.logo-img', `${site}/index.php`)], 'joomla'),
    [['logo', 'logo-color.png', 'iVBOR']]
  )
  // A header picture with no class at all, linking home.
  assert.deepEqual(logoOf([at('a > img', `${site}/`, 'media/brand.png')], 'emdash'), [
    ['logo', 'brand.png', 'iVBOR']
  ])
  assert.deepEqual(logoOf([at('div#site-logo > img', null, 'media/brand.png')], 'emdash'), [
    ['logo', 'brand.png', 'iVBOR']
  ])
  // Partners' logos and a picture linking to another page are pictures, never the site's logo.
  const photos = planSweep(
    { items: [] },
    {
      ...options,
      platform: 'joomla',
      origin: site,
      wordmark,
      pictures: [
        at('div.client-logos > img', null, 'images/c1.png'),
        at('a > img', `${site}/index.php/services`, 'images/s.jpg'),
        // lrsweep rig (25/10/2026): `.ja-masthead`'s background "links" home only through the breadcrumb's Home
        // inside the box; a banner, never the logo.
        {
          ...at('div.ja-masthead', `${site}/index.php`, 'images/joomlart/others/bg-masthead4.jpg'),
          kind: 'background'
        },
        // The Willow Nook local (25/10/2026): a page's banner and a photo linking home are no logo by their size.
        {
          ...at('figure > img', `${site}/`, 'images/banner-reservation.jpg', '/reservation'),
          size: '1440×389'
        },
        {
          ...at('div.picture > img', `${site}/`, 'images/business-detail-3.jpg', '/reservation'),
          size: '570×371'
        }
      ]
    }
  )
  assert.deepEqual(photos.calls, [])
  assert.deepEqual(
    photos.unresolved.map((u) => [u.file, u.why]),
    [
      ['images/c1.png', 'no picture of the business was imported'],
      ['images/s.jpg', 'no picture of the business was imported'],
      ['images/joomlart/others/bg-masthead4.jpg', 'no picture of the business was imported'],
      ['images/banner-reservation.jpg', 'no picture of the business was imported'],
      ['images/business-detail-3.jpg', 'no picture of the business was imported']
    ]
  )
})

// lrsweep rig, JA Spa j6 (24/10/2026): one article's opening is its page's lead and the blog list's intro.
test('a text that is a lead on one page takes the lead line on every page that shows it, in any order', () => {
  const shared = 'It will him natus error sit voluptatem accusantium doloremque laudantium.'
  const intro = { field: 'text', text: shared, page: '/index.php/our-blog' }
  const lead = { field: 'text', text: shared, page: '/index.php/our-blog/2-article', lead: true }
  const line = 'Massage and quiet rooms in the heart of Ennis.'
  for (const items of [
    [intro, lead],
    [lead, intro]
  ]) {
    const swept = planSweep({ items }, { ...options, leadLine: line })
    assert.deepEqual(
      swept.calls
        .filter((c) => c.params?.find === shared)
        .map((c) => [c.params.path, c.params.replace])
        .sort(),
      [
        ['/index.php/our-blog', line],
        ['/index.php/our-blog/2-article', line]
      ]
    )
    assert.equal(swept.thinLeads, 0)
  }
  // With no line, both say the placeholder, and only the lead counts as thin research.
  assert.equal(planSweep({ items: [intro, lead] }, options).thinLeads, 1)
})

// lrsweep rig, JA Spa j6 (25/10/2026): the footer's "Joomla!" link on an article's page was sent to that article,
// which keeps no such link, and came back NOT_FOUND on every round.
test("a page's record whose stored content keeps neither a link's address nor its words is not named as its holder", () => {
  const site = 'http://localhost:51796'
  const path = '/index.php/page/2-article'
  const records = (data) => [{ identity: { kind: 'article', id: 2 }, routes: [path], data }]
  const footer = { field: 'link', page: path, href: 'https://www.joomla.org', text: 'Joomla!', to: 'contact' }
  const sweep = (data, item = footer) =>
    planSweep(
      { items: [item] },
      {
        buildDate: '2026-10-24',
        platform: 'joomla',
        inventory: records(data),
        contactPath: '/index.php/contact',
        origin: site
      }
    )
  const refused = sweep({ introtext: '<p>It will him natus.</p>', fulltext: '' })
  assert.deepEqual(refused.calls, [])
  assert.deepEqual(
    refused.unresolved.map((u) => u.why),
    ['no record of the site is known to hold this link']
  )
  // Kept by its address (an encoded `&amp;` read as `&`), by its words (a stored non-SEF address), or with no
  // stored content read at all.
  const vendor = { ...footer, href: 'https://example.com/?a=1&b=2', text: 'Book' }
  for (const [data, item] of [
    [{ introtext: '<a href="https://example.com/?a=1&amp;b=2">here</a>' }, vendor],
    [{ introtext: '<a href="index.php?option=com_content&amp;id=9">Joomla!</a>' }, footer],
    [undefined, footer]
  ])
    assert.deepEqual(
      sweep(data, item).calls.map((c) => [c.action, c.params.records]),
      [['link', [{ kind: 'article', id: 2 }]]]
    )
})

// lrsweep rig, Tracy Base EmDash 0.5.6 (25/10/2026): the footer's four social links on all eight pages are kept in the
// site-wide `site` entry (`social[].url`), which no page is routed to, so 32 links came back "no record holds it".
test('on EmDash a link every page shows is written once, in the site-wide entry that keeps its address', () => {
  const site = 'http://127.0.0.1:51831'
  const chrome = {
    identity: { collection: 'site', id: 's1', slug: 'site', locale: 'en' },
    routes: [],
    data: {
      social: [{ platform: 'instagram', url: 'https://www.instagram.com/' }],
      footer_note: 'Contact us'
    }
  }
  const page = (path) => ({
    identity: { collection: 'pages', id: path, locale: 'en' },
    routes: [{ pattern: path, locale: 'en' }],
    data: { title: 'Home', body: 'No links here' }
  })
  const link = (path, href) => ({ field: 'link', page: path, href, text: null, to: 'contact' })
  const plan = planSweep(
    {
      items: [
        link('/', 'https://www.instagram.com/'),
        link('/blog', 'https://www.instagram.com/'),
        link('/', 'https://www.youtube.com/')
      ]
    },
    {
      buildDate: '2026-10-24',
      platform: 'emdash',
      inventory: [chrome, page('/'), page('/blog')],
      contactPath: '/contact',
      origin: site
    }
  )
  assert.deepEqual(
    plan.calls.map((c) => [c.action, c.params.href, c.params.records]),
    [['link', 'https://www.instagram.com/', [{ collection: 'site', id: 's1', locale: 'en' }]]]
  )
  // An address the site-wide entry does not keep stays reported, never sent to it.
  assert.deepEqual(
    plan.unresolved.map((u) => [u.href, u.why]),
    [['https://www.youtube.com/', 'no record of the site is known to hold this link']]
  )
})

// lrsweep rig, Tracy Base EmDash 0.5.6 (25/10/2026): an article's own `h2#putting-it-into-practice` was taken for
// its post's title, so every round wrote the entry's title again and the heading stayed.
test("a heading is a post's title only when the post's stored title is those words", () => {
  const path = '/services/brand-and-interface-design'
  const record = {
    identity: { collection: 'services', id: 's1', locale: 'en' },
    publication: { status: 'published' },
    routes: [{ pattern: path, locale: 'en' }],
    titleField: 'title',
    data: { title: 'Brand and interface design', body: [] }
  }
  const planned = (text, postDrafts = [reservations]) =>
    planSweep(
      { items: [{ field: 'title', page: path, post: path, text }] },
      {
        buildDate: '2026-10-24',
        platform: 'emdash',
        inventory: [record],
        contactPath: '/contact',
        origin: 'http://e.test',
        postDrafts
      }
    )
  const sweep = (text) => planned(text).calls.map((c) => [c.action, c.params.data ?? c.params.find])
  assert.deepEqual(sweep('Putting it into practice'), [['content.replace', 'Putting it into practice']])
  // The title as a theme shows it, upper-cased by its CSS, is still the stored one, and takes a research post's.
  assert.deepEqual(sweep('BRAND AND INTERFACE DESIGN'), [['content_update', { title: 'Reservations' }]])
  // 🔒 Never "Coming soon": with no research left, the title is reported and left.
  const none = planned('BRAND AND INTERFACE DESIGN', [])
  assert.deepEqual(none.calls, [])
  assert.deepEqual(
    none.unresolved.map((u) => [u.page, u.field]),
    [[path, 'title']]
  )
})

test('a long template paragraph is replaced whole: its head, then each next part joined to the stand-in, in order', () => {
  const path = '/index.php/blog/2-hotel'
  const text = `So. ${'Through weakness of will, which is the same as saying. '.repeat(25)}These cases are perfectly simple.`
  assert.ok(text.length > 1000)
  const options = {
    buildDate: '2026-10-25',
    platform: 'joomla',
    inventory: [],
    contactPath: '/index.php/contact',
    origin: 'http://j.test'
  }
  const plan = planSweep(
    {
      items: [
        { field: 'text', page: path, text },
        { field: 'dish-name', page: path, text: 'Smoked Venison', n: 0 }
      ]
    },
    options
  )
  const chain = plan.calls.filter((c) => c.params.find !== 'Smoked Venison')
  assert.ok(chain.length >= 3, `${chain.length} calls`)
  // One run of calls, in order, never cut apart by another.
  assert.equal(
    plan.calls.findIndex((c) => c.params.find === 'Smoked Venison'),
    plan.calls.length - 1
  )
  for (const c of chain) {
    assert.equal(c.action, 'content.replace')
    assert.equal(c.params.replace, '')
    assert.ok(c.params.find.length <= 500, `${c.params.find.length}`)
    assert.equal(c.params.expect, 1)
  }
  // Every word of the paragraph is in one call: the head, then each next part, each one emptied in turn.
  assert.equal(chain.map((c) => c.params.find).join(' '), text)
  // A text the read cut at its limit is looked for up to its last whole word, as the replace job matches words.
  const cut = `${text.repeat(3)}`.slice(0, 2000)
  const last = planSweep({ items: [{ field: 'text', page: path, text: cut }] }, options).calls.at(-1).params
    .find
  assert.ok(cut.includes(last))
  assert.ok(cut.slice(0, cut.lastIndexOf(' ')).trimEnd().endsWith(last))
})

test('/ops QA row lists what the sweep left unresolved: field, page and reason, capped with the rest counted', async () => {
  const { buildCollectorItems, sweepUnresolvedOf, SWEEP_UNRESOLVED_SHOWN } = await import(
    '../src/lib/wo-ops.js'
  )
  const { sweepStopped } = await import('../src/opportunities-build/client-demo.js')
  const qaRow = (qa) =>
    buildCollectorItems({ provider_id: null, candidate: {} }, [], { totalCount: 0 }, null, {
      state: 'live',
      site_key: 's',
      qa
    }).find((item) => item.name === '8. Demo QA Gate')

  const stopped = sweepStopped(
    {
      calls: [{ action: 'content.replace' }],
      left: 3,
      unresolved: [
        { page: '/menu', field: 'picture', file: 'hero.jpg', why: 'no picture of the business was imported' },
        { page: '/', field: 'link', href: '/contact', why: 'x'.repeat(400) }
      ]
    },
    'bound',
    6
  )
  const row = qaRow({
    state: 'failed',
    rounds: [{}],
    repairs: 0,
    clientCheck: { result: { sweep: stopped } }
  })
  // The one-line detail stays as it was.
  assert.equal(row.detail, 'failed · 1 round, 0 repairs')
  assert.deepEqual(row.unresolved[0], {
    field: 'picture',
    page: '/menu',
    why: 'no picture of the business was imported'
  })
  assert.equal(row.unresolved[1].why.length, 140)
  assert.ok(row.unresolved[1].why.endsWith('…'))
  assert.equal(row.unresolved[2].field, 'sweep')
  assert.equal(row.unresolved[2].page, null)
  assert.match(row.unresolved[2].why, /bound of \d+ rounds with 3 changes still planned/)
  assert.equal(row.unresolvedMore, undefined)

  const many = Array.from({ length: SWEEP_UNRESOLVED_SHOWN + 3 }, (_, i) => ({
    field: 'text',
    page: `/p${i}`,
    why: 'w'
  }))
  const capped = sweepUnresolvedOf({ clientCheck: { result: { sweep: { unresolved: many } } } })
  assert.equal(capped.unresolved.length, SWEEP_UNRESOLVED_SHOWN)
  assert.equal(capped.unresolvedMore, 3)

  // Nothing unresolved, or no client check yet: the row is exactly what it was.
  assert.deepEqual(Object.keys(qaRow({ state: 'passed', rounds: [], repairs: 0 })).sort(), [
    'detail',
    'durationSec',
    'name',
    'provider',
    'status'
  ])
  assert.deepEqual(sweepUnresolvedOf({ clientCheck: { result: { sweep: { unresolved: [] } } } }), {})
})

test("a template's own address, phone, email and website take the business's from the research, never filler", () => {
  const page = '/contact-us/'
  const options = { buildDate: '2026-10-25', platform: 'wordpress', inventory: [], contactPath: page }
  const items = [
    {
      field: 'text',
      page,
      text: '1600 Amphitheatre Parkway, Mountain View 5692',
      selector: 'dd > span.contact-street'
    },
    { field: 'text', page, text: '(084) 555-0110', selector: 'dd > span.contact-telephone' },
    { field: 'text', page, text: 'http://joomlart.com', selector: 'span.contact-webpage > a' },
    { field: 'text', page, text: 'hello@joomlart.com', selector: 'p' },
    { field: 'text', page, text: 'Aenean vulputate eleifend tellus.', selector: 'span.contact-misc > p' }
  ]
  const contact = {
    address: 'Søbjørnsstræde 17, 1454 København K',
    phone: '+45 33 55 55 10',
    email: 'henrik@thewillownook.example',
    website: 'https://www.thewillownook.example/'
  }
  const replaced = (plan) =>
    Object.fromEntries(
      plan.calls.filter((c) => c.action === 'content.replace').map((c) => [c.params.find, c.params.replace])
    )
  assert.deepEqual(replaced(planSweep({ items }, { ...options, contact })), {
    '1600 Amphitheatre Parkway, Mountain View 5692': contact.address,
    '(084) 555-0110': contact.phone,
    'http://joomlart.com': contact.website,
    'hello@joomlart.com': contact.email,
    'Aenean vulputate eleifend tellus.': ''
  })
  // A fact the research lacks is left empty, never filler (product owner, 27/10/2026).
  const none = replaced(planSweep({ items }, { ...options, contact: { phone: contact.phone } }))
  assert.equal(none['(084) 555-0110'], contact.phone)
  assert.equal(none['1600 Amphitheatre Parkway, Mountain View 5692'], '')
  // A link the replace job refuses to empty is no call: named unresolved, with why.
  assert.equal(none['http://joomlart.com'], undefined)
  assert.deepEqual(
    planSweep({ items }, { ...options, contact: { phone: contact.phone } })
      .unresolved.filter((u) => u.text === 'http://joomlart.com')
      .map((u) => u.refused),
    ['a']
  )
})

// 🔒 Product owner, 26/10/2026: a rewritten template post takes a slug from its new title. The agent owns the slug of a
// post it rewrote; the sweep sets the slug of a post whose title it writes, in the same write.
test("a template post the agent retitled keeps the agent's slug: the sweep writes neither its title nor its slug", () => {
  const frozen = {
    identity: { kind: 'post', id: 43 },
    routes: ['/three-broomsticks-welcomes-new-chef-caleb-nunez/'],
    data: {
      post_type: 'post',
      post_name: 'three-broomsticks-welcomes-new-chef-caleb-nunez',
      post_title: 'Three Broomsticks welcomes new chef Caleb Nunez',
      post_date: '2021-09-10 01:38:00'
    }
  }
  const live = {
    ...frozen,
    routes: ['/the-chocolate-mocha-the-coffee-cave/'],
    data: {
      ...frozen.data,
      post_name: 'the-chocolate-mocha-the-coffee-cave',
      post_title: 'The Chocolate Mocha & the coffee cave — downstairs',
      post_date: '2026-10-24 00:00:00'
    }
  }
  const calls = planSweep(
    { items: [] },
    { ...options, inventory: [live], templatePosts: [{ ...frozen, written: ['post_title', 'post_date'] }] }
  ).calls
  assert.deepEqual(calls, [])
  // On the last check the agent's title is not the template's, so nothing of it is the sweep's.
  const last = planSweep(
    { items: [] },
    { ...options, checksLeft: 0, inventory: [live], templatePosts: [frozen] }
  ).calls
  assert.deepEqual(last, [])
})

test('a post whose title the sweep writes takes its slug from that title, in the same write, on WordPress, Joomla and EmDash', () => {
  // WordPress makes the slug unique itself (`wp_unique_post_slug`): the title's slug is sent as it is.
  const post = {
    identity: { kind: 'post', id: 58 },
    routes: ['/burger-king-takes-a-stand/'],
    data: {
      post_type: 'post',
      post_name: 'burger-king-takes-a-stand',
      post_title: 'Burger King takes a stand',
      post_content: '<!-- wp:paragraph --><p>Convallis nulla mauris.</p><!-- /wp:paragraph -->'
    }
  }
  const taken = {
    identity: { kind: 'post', id: 99 },
    routes: ['/reservations/'],
    data: { post_type: 'post', post_name: 'reservations' }
  }
  const wp = planSweep(
    { items: [] },
    { ...options, inventory: [post, taken], templatePosts: [post], postDrafts: [reservations] }
  )
  const wpPost = wp.calls.find((c) => c.params.id === 58)
  assert.equal(wpPost.params.fields.post_title, 'Reservations')
  assert.equal(wpPost.params.fields.post_name, 'reservations')
  assert.equal(wpPost.params.was.post_name, 'burger-king-takes-a-stand')
  // The title the slug was made of: the resolver drops the slug with it once the agent changed the title.
  assert.equal(wpPost.params.slugFrom, 'post_title')
  assert.deepEqual(wp.unresolved, [])
  // Joomla refuses an alias another article of the category holds: made unique there, never across categories.
  const article = (id, alias, catid, title = 'Sample') => ({
    identity: { kind: 'article', id },
    routes: [`/index.php/blog/${id}-${alias}`],
    data: { title, alias, catid, introtext: '<p>Lorem ipsum dolor sit amet of the template.</p>' }
  })
  const a7 = article(7, 'sample-7', 8)
  const joomla = planSweep(
    { items: [] },
    {
      ...options,
      platform: 'joomla',
      inventory: [a7, article(9, 'reservations', 8, 'Reservations'), article(10, 'reservations-2', 3)],
      templatePosts: [a7],
      postDrafts: [reservations]
    }
  )
  const j7 = joomla.calls.find((c) => c.params.id === 7)
  assert.equal(j7.params.fields.title, 'Reservations')
  assert.equal(j7.params.fields.alias, 'reservations-2')
  assert.equal(j7.params.was.alias, 'sample-7')
  assert.equal(j7.params.slugFrom, 'title')
  // An alias the agent's plan writes is the agent's, while checks remain.
  const owned = planSweep(
    { items: [] },
    {
      ...options,
      platform: 'joomla',
      checksLeft: 1,
      inventory: [a7],
      templatePosts: [{ ...a7, written: ['alias'] }],
      postDrafts: [reservations]
    }
  )
  assert.equal(owned.calls[0].params.fields.title, 'Reservations')
  assert.ok(!('alias' in owned.calls[0].params.fields))
  // EmDash: the entry's slug beside its data, unique in its collection and locale, a trashed entry's included.
  const entry = (id, slug, locale = 'en', extra = {}) => ({
    identity: { collection: 'posts', id, slug, locale },
    publication: { status: 'published', ...extra },
    routes: [{ pattern: `/posts/${slug}`, locale }],
    titleField: 'title',
    data: { title: 'Sample' }
  })
  const p1 = entry('p1', 'sample')
  const emdash = planSweep(
    { items: [] },
    {
      ...options,
      platform: 'emdash',
      inventory: [
        p1,
        entry('p2', 'reservations', 'en', { deletedAt: '2026-10-01' }),
        entry('p3', 'reservations-2', 'fr')
      ],
      templatePosts: [p1],
      postDrafts: [reservations]
    }
  )
  const e1 = emdash.calls.find((c) => c.params.id === 'p1')
  assert.equal(e1.action, 'content_update')
  assert.deepEqual(e1.params.data, { title: 'Reservations' })
  assert.equal(e1.params.slug, 'reservations-2')
  assert.deepEqual(e1.params.was, { title: 'Sample', slug: 'sample' })
  assert.equal(e1.params.slugFrom, 'title')
})

test("a post whose slug the agent changed keeps it, even where the sweep still writes the template's title", () => {
  const frozen = {
    identity: { kind: 'article', id: 7 },
    routes: ['/index.php/blog/7-sample-7'],
    data: { title: 'Sample 7', alias: 'sample-7', catid: 8, introtext: '<p>Lorem ipsum dolor sit amet.</p>' }
  }
  const live = {
    ...frozen,
    routes: ['/index.php/blog/7-our-story'],
    data: { ...frozen.data, alias: 'our-story' }
  }
  const { calls } = planSweep(
    { items: [] },
    {
      ...options,
      platform: 'joomla',
      checksLeft: 0,
      inventory: [live],
      templatePosts: [frozen],
      postDrafts: [reservations]
    }
  )
  const call = calls.find((c) => c.params.id === 7)
  assert.equal(call.params.fields.title, 'Reservations')
  assert.ok(!('alias' in call.params.fields), "the agent's alias is never overwritten")
})

test("links to a moved post's old route follow it: one counted write per record and address, never a page-wide replace", () => {
  const origin = 'https://site.invalid'
  // WordPress: the agent gave post 43 a slug from its new title; a page's body and a navigation block still lead to
  // the old route, written with the site's address and without it.
  const frozen = {
    identity: { kind: 'post', id: 43 },
    routes: ['/three-broomsticks/'],
    data: { post_type: 'post', post_name: 'three-broomsticks', post_title: 'Three Broomsticks' }
  }
  const live = {
    ...frozen,
    routes: ['/the-coffee-cave/'],
    data: { ...frozen.data, post_name: 'the-coffee-cave', post_title: 'The coffee cave' }
  }
  const home = {
    identity: { kind: 'post', id: 2 },
    routes: ['/'],
    data: {
      post_type: 'page',
      post_content:
        '<p><a href="https://site.invalid/three-broomsticks/">Read more</a> <a href="https://site.invalid/three-broomsticks/">More</a> <a href="/three-broomsticks/#comments">Talk</a> <a href="/menu/">Menu</a></p>'
    }
  }
  const nav = {
    identity: { kind: 'post', id: 5 },
    routes: [],
    data: {
      post_type: 'wp_navigation',
      post_content:
        '<!-- wp:navigation-link {"label":"News","url":"/three-broomsticks/","kind":"custom"} /-->'
    }
  }
  const wp = planSweep(
    { items: [] },
    {
      ...options,
      origin,
      inventory: [live, home, nav],
      templatePosts: [{ ...frozen, written: ['post_title', 'post_name'] }]
    }
  )
  const links = wp.calls.filter((c) => c.action === 'link')
  assert.deepEqual(
    links.map((c) => c.params),
    [
      {
        platform: 'wordpress',
        path: '/',
        href: 'https://site.invalid/three-broomsticks/',
        to: 'https://site.invalid/the-coffee-cave/',
        records: [{ kind: 'post', id: 2 }],
        expect: 2
      },
      {
        platform: 'wordpress',
        path: '/',
        href: '/three-broomsticks/#comments',
        to: '/the-coffee-cave/#comments',
        records: [{ kind: 'post', id: 2 }],
        expect: 1
      },
      {
        platform: 'wordpress',
        path: null,
        href: '/three-broomsticks/',
        to: '/the-coffee-cave/',
        records: [{ kind: 'post', id: 5 }],
        expect: 1
      }
    ]
  )
  assert.ok(links.every((c) => !('all' in c.params) && !c.params.rendered))
  // Joomla: a module's and another article's anchors, a URL menu item; an item opening the article by its id
  // follows on its own and is left alone.
  const jFrozen = {
    identity: { kind: 'article', id: 12 },
    routes: ['/index.php/blog/12-sample-12'],
    data: { title: 'Sample 12', alias: 'sample-12', catid: 8 }
  }
  const jLive = {
    ...jFrozen,
    routes: ['/index.php/blog/12-our-story'],
    data: { ...jFrozen.data, alias: 'our-story' }
  }
  const module = {
    identity: { kind: 'module', id: 90 },
    routes: [],
    data: { content: '<a href="/index.php/blog/12-sample-12">Our story</a>' }
  }
  const other = {
    identity: { kind: 'article', id: 3 },
    routes: ['/index.php/about'],
    data: { introtext: '<p><a href="/index.php/blog/12-sample-12">read</a></p>', fulltext: '' }
  }
  const urlItem = {
    identity: { kind: 'menuItem', id: 31 },
    routes: [],
    data: { type: 'url', link: 'https://site.invalid/index.php/blog/12-sample-12' }
  }
  const idItem = {
    identity: { kind: 'menuItem', id: 32 },
    routes: ['/index.php/blog'],
    data: { type: 'component', link: 'index.php?option=com_content&view=article&id=12' }
  }
  const joomla = planSweep(
    { items: [] },
    {
      ...options,
      origin,
      platform: 'joomla',
      inventory: [jLive, module, other, urlItem, idItem],
      templatePosts: [{ ...jFrozen, written: ['title', 'alias'] }]
    }
  )
  assert.deepEqual(
    joomla.calls.filter((c) => c.action === 'link').map((c) => c.params),
    [
      {
        platform: 'joomla',
        path: null,
        href: '/index.php/blog/12-sample-12',
        to: '/index.php/blog/12-our-story',
        records: [{ kind: 'module', id: 90 }],
        expect: 1
      },
      {
        platform: 'joomla',
        path: '/index.php/about',
        href: '/index.php/blog/12-sample-12',
        to: '/index.php/blog/12-our-story',
        records: [{ kind: 'article', id: 3 }],
        expect: 1
      },
      {
        platform: 'joomla',
        path: null,
        href: 'https://site.invalid/index.php/blog/12-sample-12',
        to: 'https://site.invalid/index.php/blog/12-our-story',
        // The link the plan saw: the resolver writes the item only while it still holds it.
        records: [{ kind: 'menuItem', id: 31, link: 'https://site.invalid/index.php/blog/12-sample-12' }],
        targetLink: 'https://site.invalid/index.php/blog/12-our-story'
      }
    ]
  )
  // EmDash: an entry's link field and a menu item, by the menu's name.
  const eFrozen = {
    identity: { collection: 'posts', id: 'p1', slug: 'sample', locale: 'en' },
    routes: [{ pattern: '/posts/sample', locale: 'en' }],
    data: { title: 'Sample' }
  }
  const eLive = {
    ...eFrozen,
    identity: { ...eFrozen.identity, slug: 'our-story' },
    routes: [{ pattern: '/posts/our-story', locale: 'en' }],
    data: { title: 'Our story' }
  }
  const page = {
    identity: { collection: 'pages', id: 'home', slug: 'home', locale: 'en' },
    routes: [{ pattern: '/', locale: 'en' }],
    data: { hero: { cta_url: '/posts/sample' } }
  }
  const menu = {
    identity: { kind: 'menu', id: 'm1', locale: 'en' },
    routes: [],
    data: { name: 'primary', items: [{ id: 'i1', label: 'Story', url: '/posts/sample' }] }
  }
  const emdash = planSweep(
    { items: [] },
    {
      ...options,
      origin,
      platform: 'emdash',
      inventory: [eLive, page, menu],
      templatePosts: [{ ...eFrozen, written: ['title'] }]
    }
  )
  assert.deepEqual(
    emdash.calls.filter((c) => c.action === 'link').map((c) => c.params),
    [
      {
        platform: 'emdash',
        path: '/',
        href: '/posts/sample',
        to: '/posts/our-story',
        records: [{ collection: 'pages', id: 'home', locale: 'en' }],
        expect: 1
      },
      {
        platform: 'emdash',
        path: null,
        href: '/posts/sample',
        to: '/posts/our-story',
        menu: 'primary',
        expect: 1
      }
    ]
  )
  // A post that did not move plans no link.
  assert.deepEqual(
    planSweep(
      { items: [] },
      { ...options, origin, inventory: [frozen, home], templatePosts: [frozen] }
    ).calls.filter((c) => c.action === 'link'),
    []
  )
})

// The Willow Nook local, build 8c (25/10/2026): the sweep before the first check wrote "Coming soon" over the home's
// feature descriptions; the agent's later write aimed at the template's words found nothing on that post, and the
// home kept the placeholder. Prose the agent writes from its research is the agent's while checks remain.
test('while checks remain, a template description or lead is left for the agent, named; the last check sweeps it', () => {
  const page = '/'
  const description = 'We source our ingredients from local farms and cook everything fresh every single day.'
  const items = [
    { field: 'text', page, text: description },
    { field: 'text', page, text: 'A short lead under the title of the page.', lead: true },
    { field: 'text', page, text: 'Menu idea for owner review, not a confirmed dish.', filler: true },
    { field: 'dish-name', page, text: 'Smoked Venison', n: 0 },
    { field: 'text', page, text: 'Fresh Food' }
  ]
  const options = { buildDate: '2026-10-25', platform: 'wordpress', inventory: [], contactPath: '/contact/' }
  const during = planSweep({ items }, { ...options, checksLeft: 2 })
  const finds = during.calls.flat().map((c) => c.params.find)
  assert.ok(!finds.includes(description))
  assert.ok(!finds.includes('A short lead under the title of the page.'))
  // Filler, dishes and a short label still take their stand-ins.
  for (const f of ['Menu idea for owner review, not a confirmed dish.', 'Smoked Venison', 'Fresh Food'])
    assert.ok(finds.includes(f), f)
  const left = during.unresolved.filter((u) => /writes it from its research/.test(u.why))
  assert.deepEqual(
    left.map((u) => u.text).sort(),
    [description, 'A short lead under the title of the page.'].sort()
  )
  // No check left: the safety net writes the stand-in.
  const last = planSweep({ items }, { ...options, checksLeft: 0 })
  assert.ok(last.calls.flat().some((c) => c.params.find === description))
})

// The Willow Nook local, build 8c (25/10/2026): every written post's only field left was its template featured
// picture, sent alone as `featured_image_id`; the plugin refuses that ("no writable field for kind post"), so 20 of
// 21 post pages kept the template's picture through every sweep round.
test('a written post whose template featured picture is all that is left is featured by its post meta, never by a lone field', () => {
  const post = (id, data = {}) => ({
    identity: { kind: 'post', id },
    routes: [`/p${id}/`],
    data: {
      post_type: 'post',
      post_title: 'Our autumn menu',
      post_excerpt: 'Our own words.',
      post_content: '<!-- wp:paragraph --><p>Our own words.</p><!-- /wp:paragraph -->',
      post_date: '2026-10-24 00:00:00',
      ...data
    },
    featured: { id: 9, url: 'http://x.test/wp-content/uploads/2026/10/news-detail-1.jpg' }
  })
  const frozen = [
    {
      ...post(41, {
        post_title: 'Burger King takes a stand',
        post_excerpt: 'Convallis.',
        post_content: '<p>Lorem.</p>',
        post_date: '2021-09-10 01:38:00'
      }),
      written: ['post_title', 'post_content', 'post_excerpt', 'post_date']
    }
  ]
  const media = [{ url: '/u/a.jpg', id: 301, width: 1600, height: 900 }]
  const { calls } = planSweep(
    { items: [] },
    { ...options, inventory: [post(41)], templatePosts: frozen, media }
  )
  assert.deepEqual(calls, [
    {
      action: 'content.update',
      params: { kind: 'postmeta', id: 41, key: '_thumbnail_id', fields: { value: 301 } }
    }
  ])
})

test('posts-written names the written posts whose picture is still the template’s, so the agent features one', async () => {
  const { postsWritten } = await import('../src/opportunities-build/client-demo.js')
  const records = [41, 42].map((id) => ({
    identity: { kind: 'post', id },
    data: { post_type: 'post', post_title: `T${id}` }
  }))
  const row = (id, path, operation = 'rewrite') => ({
    operation,
    target: { kind: 'native', type: 'post', id, path }
  })
  const plan = {
    structure: { inventory: { records } },
    rows: [row(41, 'post_content'), row(42, 'post_content'), row(42, 'featured_image_id', 'replace-image')]
  }
  const check = postsWritten(plan, { posts: [], media: [], profile: {}, sources: [], menu: [] })
  assert.equal(check.pass, true)
  assert.deepEqual(check.unpictured, ['post/41'])
  assert.match(check.warning ?? '', /post\/41.*no picture of its own/)
})

test("a short heading naming the template's business takes the business's name in its place, its other words kept", () => {
  // The Willow Nook build 13 (25/10/2026): About's "Meet Three BroomSticks" (an h5) stayed through every sweep.
  const item = {
    page: '/about-us/',
    text: 'Meet Three BroomSticks',
    selector: 'h5',
    field: 'text',
    block: 'meet three broomsticks',
    short: true,
    templateName: 'three broomsticks'
  }
  const named = planSweep({ items: [item] }, { ...options, name: 'The Willow Nook', checksLeft: 2 })
  assert.deepEqual(
    named.calls.filter((c) => c.action === 'content.replace').map((c) => [c.params.find, c.params.replace]),
    [['Meet Three BroomSticks', 'Meet The Willow Nook']]
  )
  // Without the business's name, the neutral block heading (a heading cannot be emptied): never the template's, never
  // filler.
  const unnamed = planSweep({ items: [item] }, options)
  assert.deepEqual(
    unnamed.calls.filter((c) => c.action === 'content.replace').map((c) => c.params.replace),
    ['Overview']
  )
})

test('posts-written counts a post by what its page shows: build 13 planned 22 bodies and every page kept the lorem', async () => {
  // The Willow Nook build 13 (25/10/2026): posts-written said "22 of 22" from the plan's rows while each of the 22
  // post pages still showed the template's lorem body.
  const { postsWritten } = await import('../src/opportunities-build/client-demo.js')
  const slugs = Array.from({ length: 22 }, (_, i) => `/post-${40 + i}/`)
  slugs[0] = '/lorem-ipsum/'
  slugs[6] = '/burger-king-takes-a-stand-on-the-pink-tax/'
  const records = slugs.map((route, i) => ({
    identity: { kind: 'post', id: 40 + i },
    routes: [route],
    data: { post_type: 'post', post_title: `T${40 + i}` }
  }))
  const plan = {
    structure: { inventory: { records } },
    rows: records.map((r) => ({
      operation: 'rewrite',
      target: { kind: 'native', type: 'post', id: r.identity.id, path: 'post_content' }
    }))
  }
  const research = { posts: [], media: [], profile: {}, sources: [], menu: [] }
  const footer = { words: '327 p. +201 166 993 7763 info@joomlart.com', pages: ['/', '/about-us/', ...slugs] }
  const lorem = [
    { words: 'in enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo.', pages: slugs },
    { words: 'aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim.', pages: slugs }
  ]
  const read = ['/', '/about-us/', ...slugs]
  const words = { id: 'no-demo-words', pass: false, routes: read, passages: [footer, ...lorem] }
  const shown = postsWritten(plan, research, { checks: [words], read })
  assert.match(shown.measured, /^0 of 22 template posts show the business's own text/)
  assert.match(shown.measured, /22 written in the plan/)
  assert.match(shown.warning ?? '', /post\/40.*still show the template's text/)
  // The footer every page shares is not a post's body: once the lorem is gone, all 22 count.
  const clean = postsWritten(plan, research, { checks: [{ ...words, passages: [footer] }], read })
  assert.match(clean.measured, /^22 of 22 template posts show/)
  // A post whose page QA never read is not counted as written.
  const unread = postsWritten(plan, research, {
    checks: [{ ...words, passages: [footer] }],
    read: read.slice(0, 12)
  })
  assert.match(unread.measured, /^10 of 22/)
  // A check from a host that lists no passages keeps the plan's count.
  assert.match(postsWritten(plan, research).measured, /^22 of 22 template posts written/)
})

test("a Joomla or EmDash template post's own pictures are swept like a WordPress featured picture: once per file, the list card's copy with them", () => {
  const images = JSON.stringify({
    image_intro:
      'images/joomlart/blog/blog-1.jpg#joomlaImage://local-images/joomlart/blog/blog-1.jpg?width=800&height=600',
    image_fulltext: 'images/joomlart/blog/blog-1-full.jpg'
  })
  const article = (id, extra = {}) => ({
    identity: { kind: 'article', id },
    routes: [`/blog/a${id}`],
    data: { title: `Sample ${id}`, introtext: '<p>Lorem.</p>', images, ...extra }
  })
  const media = [
    { url: 'images/tracy/a.jpg', width: 1600, height: 900 },
    { url: 'images/tracy/b.jpg', width: 1600, height: 900 }
  ]
  const pictures = [
    { page: '/blog', file: 'images/joomlart/blog/blog-1.jpg', size: '360×203', selector: 'a > img' }
  ]
  const joomla = planSweep(
    { items: [] },
    {
      ...options,
      platform: 'joomla',
      inventory: [article(7), article(8)],
      templatePosts: [article(7), { ...article(8), written: ['images'] }],
      pictures,
      media,
      // While counted checks remain, the article whose pictures the plan wrote is the agent's.
      checksLeft: 1
    }
  )
  assert.deepEqual(
    joomla.calls
      .filter((c) => c.action === 'image')
      .map((c) => [c.params.find, c.params.media.url, c.params.records]),
    [
      ['images/joomlart/blog/blog-1.jpg', 'images/tracy/a.jpg', [{ kind: 'article', id: 7 }]],
      ['images/joomlart/blog/blog-1-full.jpg', 'images/tracy/b.jpg', [{ kind: 'article', id: 7 }]]
    ]
  )
  assert.ok(!joomla.unresolved.some((u) => u.file === 'images/joomlart/blog/blog-1.jpg'))
  const entry = {
    identity: { collection: 'posts', id: 'p1', locale: 'en' },
    routes: [{ pattern: '/posts/p1', locale: 'en' }],
    data: { title: 'Sample', featured_image: { src: '/_emdash/api/media/file/sample-post.webp', alt: '' } }
  }
  const emdash = planSweep(
    { items: [] },
    { ...options, platform: 'emdash', inventory: [entry], templatePosts: [entry], media }
  )
  assert.deepEqual(
    emdash.calls
      .filter((c) => c.action === 'image')
      .map((c) => [c.params.platform, c.params.find, c.params.records]),
    [
      [
        'emdash',
        '/_emdash/api/media/file/sample-post.webp',
        [{ collection: 'posts', id: 'p1', locale: 'en' }]
      ]
    ]
  )
  const none = planSweep(
    { items: [] },
    { ...options, platform: 'emdash', inventory: [entry], templatePosts: [entry], media: [] }
  )
  assert.ok(
    none.unresolved.some(
      (u) => u.file === '/_emdash/api/media/file/sample-post.webp' && u.page === '/posts/p1'
    )
  )
})

// 🔒 Round 10 (25/10/2026): build 13's fallback would have written the research's hero lead into all 22 post bodies.
test("a swept post body is that post's own material: its written excerpt and related research facts, never one sentence in several posts", () => {
  const lorem = '<!-- wp:paragraph --><p>Lorem ipsum dolor sit amet.</p><!-- /wp:paragraph -->'
  const post = (id, data = {}) => ({
    identity: { kind: 'post', id },
    routes: [`/p${id}/`],
    data: {
      post_type: 'post',
      post_title: `Template title ${id}`,
      post_excerpt: 'Convallis nulla mauris.',
      post_content: lorem,
      post_date: '2026-10-24 00:00:00',
      ...data
    }
  })
  const frozen = [41, 42, 43, 44].map((id) => ({ ...post(id), written: ['post_title', 'post_excerpt'] }))
  const live = [
    post(41, { post_title: 'Our brunch on the terrace', post_excerpt: 'Weekend brunch from ten until two' }),
    post(42, {
      post_title: 'Brunch for the whole family',
      post_excerpt: 'Children eat brunch at half price'
    }),
    post(43, { post_title: 'Cocktails after dark', post_excerpt: 'Cocktails after dark' }),
    post(44)
  ]
  const postFacts = [
    'Brunch plate: eggs, bacon, sourdough and fresh juice',
    'Espresso martini: vodka, coffee liqueur and espresso',
    'Our cocktails are mixed by the bar team every evening.'
  ]
  const { calls } = planSweep(
    { items: [] },
    {
      ...options,
      inventory: live,
      templatePosts: frozen,
      postFacts,
      // The next research post, and one whose facts post 41's body already took, which is passed by.
      postDrafts: [
        composePost({
          topic: 'dish',
          head: 'Brunch plate',
          lines: ['Brunch plate: eggs, bacon, sourdough and fresh juice.']
        }),
        reservations
      ],
      leadLine: 'A cafe and cocktail bar in the Latin Quarter.'
    }
  )
  const bodies = new Map(calls.filter((c) => c.action === 'post').map((c) => [c.params.id, c.params.body]))
  assert.deepEqual(Object.fromEntries(bodies), {
    41: 'Weekend brunch from ten until two. Brunch plate: eggs, bacon, sourdough and fresh juice.',
    // The brunch plate went to post 41; post 42 says its excerpt alone.
    42: 'Children eat brunch at half price.',
    43: 'Cocktails after dark. Our cocktails are mixed by the bar team every evening.',
    // Nothing of its own: the next research post whose facts no other body took, never the hero lead.
    44: reservations.body
  })
  const sentences = [...bodies.values()].flatMap((b) => b.split(/(?<=\.)\s/))
  assert.equal(new Set(sentences).size, sentences.length, 'no sentence is written into two posts')
  assert.ok(![...bodies.values()].some((b) => b.includes('Latin Quarter')))
})

test('the term descriptions are swept once, on the last counted check, on WordPress, Joomla and EmDash', () => {
  const terms = (o) =>
    planSweep({ items: [] }, { ...options, ...o }).calls.filter((c) => c.action === 'terms')
  for (const platform of ['wordpress', 'joomla', 'emdash'])
    assert.deepEqual(terms({ platform, sweepTerms: true, checksLeft: 0 }), [
      { action: 'terms', params: { platform } }
    ])
  // While the agent still has checks, or once asked, or with no term door: nothing.
  assert.deepEqual(terms({ platform: 'wordpress', sweepTerms: true, checksLeft: 1 }), [])
  assert.deepEqual(terms({ platform: 'wordpress', sweepTerms: false, checksLeft: 0 }), [])
  assert.deepEqual(terms({ platform: 'drupal', sweepTerms: true, checksLeft: 0 }), [])
  // It counts in what is left, so the round after it, which no longer asks, is progress.
  assert.equal(planSweep({ items: [] }, { ...options, sweepTerms: true }).left, 1)
})

test('a stamp drawn into a theme picture is reported unresolved with its reason', () => {
  const { unresolved } = planSweep(
    { items: [] },
    {
      ...options,
      design: [{ page: '/about-us/', file: 'https://site.invalid/wp-content/themes/t/since-1852.png' }]
    }
  )
  assert.equal(unresolved.length, 1)
  assert.equal(unresolved[0].field, 'picture')
  assert.match(unresolved[0].why, /stamp, mask or texture/)
})

test('posts-written fails while a post shows only "Coming soon": build 15 wrote it into 17 posts and the check passed', async () => {
  // The Willow Nook local build 15 (25/10/2026): the agent wrote "Coming soon" as the title and body of 17 template
  // posts with content.update and posts-written passed "5 of 22".
  const { postsWritten } = await import('../src/opportunities-build/client-demo.js')
  const records = [41, 42, 43].map((id) => ({
    identity: { kind: 'post', id },
    routes: [`/post-${id}/`],
    data: { post_type: 'post', post_title: `T${id}`, post_content: '<p>Lorem ipsum</p>' }
  }))
  const plan = {
    structure: { inventory: { records } },
    rows: [41].map((id) => ({
      operation: 'rewrite',
      target: { kind: 'native', type: 'post', id, path: 'post_content' }
    }))
  }
  const research = { posts: [], media: [], profile: {}, sources: [], menu: [] }
  const read = ['/', '/post-41/', '/post-42/', '/post-43/']
  const words = { id: 'no-demo-words', pass: true, routes: read, passages: [] }
  const live = [
    {
      ...records[0],
      data: { ...records[0].data, post_title: 'Our lobster roll', post_content: '<p>Maine lobster.</p>' }
    },
    {
      ...records[1],
      data: { ...records[1].data, post_title: 'Coming soon', post_content: '<p>Coming soon</p>' }
    },
    {
      ...records[2],
      data: { ...records[2].data, post_title: 'Brunch at noon', post_content: '<p>Coming soon.</p>' }
    }
  ]
  const check = postsWritten(plan, research, { checks: [words], read, records: live })
  assert.equal(check.pass, false)
  assert.deepEqual(check.placeholders, ['post/42', 'post/43'])
  assert.match(
    check.warning ?? '',
    /post\/42, post\/43 show only filler.*compose each one from a research topic/
  )
  assert.match(check.measured, /^1 of 3 template posts show/)
  // The thin research note is told as its sentence (build 16 showed "[object Object]").
  assert.match(check.warning, /2 of the template's 3 posts are left unwritten/)
  assert.doesNotMatch(check.warning, /object Object/)
  // Once each is composed, the check passes.
  const composed = live.map((r) => ({
    ...r,
    data: { ...r.data, post_title: 'Brunch', post_content: '<p>Eggs at noon.</p>' }
  }))
  assert.equal(postsWritten(plan, research, { checks: [words], read, records: composed }).pass, true)
})

test("a blog card still showing its template post's excerpt takes that post's own excerpt, never the shared research lead", () => {
  // Product owner, round 11 (25/10/2026): every card the sweep filled took the one sourced lead, so the blog list
  // repeated the same line under each post.
  const frozenOf = (id, excerpt) => ({
    identity: { kind: 'post', id },
    routes: [`/post-${id}/`],
    data: {
      post_type: 'post',
      post_title: `T${id}`,
      post_excerpt: excerpt,
      post_content: `<p>${excerpt} More lorem.</p>`
    }
  })
  const a = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do.'
  const b = 'Ut enim ad minim veniam, quis nostrud exercitation ullamco.'
  const templatePosts = [
    frozenOf(41, a),
    frozenOf(42, b),
    frozenOf(43, 'Duis aute irure dolor in reprehenderit in voluptate.')
  ]
  const live = [
    {
      ...templatePosts[0],
      data: { ...templatePosts[0].data, post_excerpt: 'Our lobster roll comes on brioche.' }
    },
    {
      ...templatePosts[1],
      data: {
        ...templatePosts[1].data,
        post_excerpt: '',
        post_content: '<p>Brunch runs until noon. Eggs every way.</p>'
      }
    },
    // A post the agent left with only "Coming soon" lends no lead.
    { ...templatePosts[2], data: { ...templatePosts[2].data, post_excerpt: 'Coming soon' } }
  ]
  const card = (text) => ({
    page: '/our-blog/',
    text,
    selector: 'p',
    field: 'text',
    block: text.toLowerCase(),
    lead: true
  })
  const swept = planSweep(
    {
      items: [
        card(a),
        card(`${b.slice(0, 40)}…`),
        card('Duis aute irure dolor in reprehenderit in voluptate.')
      ]
    },
    {
      ...options,
      inventory: live,
      templatePosts,
      leadLine: 'Coffee or tea, however you take it.',
      checksLeft: 2
    }
  )
  const replaced = swept.calls.filter((c) => c.action === 'content.replace').map((c) => c.params.replace)
  assert.ok(replaced.includes('Our lobster roll comes on brioche.'), replaced.join(' | '))
  assert.ok(replaced.includes('Brunch runs until noon.'), replaced.join(' | '))
  assert.equal(
    replaced.filter((r) => r === 'Coffee or tea, however you take it.').length,
    1,
    replaced.join(' | ')
  )
})

test('build 16: research of 2 old topics for 22 template posts gives 22 written posts, none "Coming soon"', async () => {
  // The Willow Nook local build 16 (25/10/2026): the research held 2 topics (story, visiting) for 22 template posts;
  // the sweep wrote "Coming soon" into the 20 the agent left and posts-written failed on exactly those. Research of
  // the same shape: no menu, no review, no social post, a bio, the hours, the address and the business's own website.
  const { postsWritten } = await import('../src/opportunities-build/client-demo.js')
  const page = (title, text) => ({
    url: `https://www.thewillownook.example/${title}`,
    title: `${title} | The Willow Nook Copenhagen`,
    text
  })
  const research = {
    posts: [],
    media: [],
    menu: { items: [] },
    profile: {
      name: 'The Willow Nook',
      bio: "The Willow Nook – Cafe and cocktail bar in Copenhagen's Latin Quarter. A collection of rooms, sofas, vintage furniture and cosy corners.",
      hours: [
        'Monday 09:00-22:00',
        'Tuesday,Wednesday,Thursday 09:00-23:00',
        'Friday,Saturday 09:00-01:00',
        'Sunday 09:00-19:00'
      ],
      address: 'Søbjørnsstræde 17, Copenhagen, 1454, DK'
    },
    sources: [
      {
        id: 'source:website:0',
        data: {
          source: 'website',
          collected: {
            pages: [
              page(
                'Food Menu',
                'The Willow Nook Food Menu Good food. Full of flavour. Breakfast, lunch and something sweet — mostly organic, with a twist that’s never too serious.'
              ),
              page(
                'Drinks Menu',
                'The Willow Nook Drinks Menu Coffee or tea, however you take it. Smoothies, milkshakes and everything in between when you’re behaving. Cocktails when you’re not.'
              ),
              page(
                'Reservations',
                'The Willow Nook Reservations Bringing 5–20 people? Send us a request. We’ll check the calendar and get back to you. Who can reserve? Groups of 5–20 people can send an online reservation request. For fewer than 5, drop in and we’ll do our best to find you a spot. When is the Moroccan Room used? Groups of 6–20 people are assigned to the Moroccan Room. How long is a reservation? The normal reservation duration is two hours, unless we agree something different.'
              ),
              page(
                'About',
                'The Willow Nook About The Willow Nook was created by Henrik and Signe. Henrik grew up in New York, while Signe comes from Stavanger on Norway’s west coast. Together, they mixed their love of retro, slightly grungy city cafés with the calmer side of Scandinavian hygge.'
              )
            ]
          }
        }
      },
      { id: 'source:instagram:2', data: { source: 'instagram', status: 'empty' } }
    ]
  }
  const lorem = (id) =>
    `<!-- wp:paragraph --><p>Convallis nulla mauris ${id}.</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>Aenean leo ligula ${id}.</p><!-- /wp:paragraph -->`
  const records = Array.from({ length: 22 }, (_, i) => ({
    identity: { kind: 'post', id: 40 + i },
    routes: [`/post-${40 + i}/`],
    data: {
      post_type: 'post',
      post_name: `burger-king-takes-a-stand-${i}`,
      post_title: `Burger King takes a stand ${i}`,
      post_excerpt: `Convallis nulla mauris ${40 + i}.`,
      post_content: lorem(40 + i),
      post_date: '2021-09-10 01:38:00'
    }
  }))
  // The agent wrote two posts: the story and the visit.
  const plan = {
    structure: { inventory: { records } },
    rows: [40, 41].flatMap((id) =>
      ['post_title', 'post_content', 'post_excerpt'].map((path) => ({
        operation: 'rewrite',
        target: { kind: 'native', type: 'post', id, path }
      }))
    )
  }
  const agentWrote = {
    40: {
      post_title: 'A cafe in the Latin Quarter',
      post_excerpt: 'A cafe and cocktail bar.',
      post_content: '<p>A cafe and cocktail bar.</p>'
    },
    41: {
      post_title: 'Come and visit',
      post_excerpt: 'Open from nine.',
      post_content: '<p>Open from nine.</p>'
    }
  }
  const live = records.map((r) => ({ ...r, data: { ...r.data, ...agentWrote[r.identity.id] } }))
  const postDrafts = postDraftsOf(plan, research)
  assert.ok(postDrafts.length >= 20, `${postDrafts.length} research posts`)
  const { calls, unresolved } = planSweep(
    { items: [] },
    { ...options, inventory: live, templatePosts: templatePostsLeft(plan), postDrafts, checksLeft: 0 }
  )
  assert.ok(!JSON.stringify(calls).includes('Coming soon'))
  assert.deepEqual(unresolved, [])
  const swept = calls.filter((c) => c.action === 'post')
  assert.equal(swept.length, 20)
  const titles = swept.map((c) => c.params.fields.post_title)
  assert.equal(new Set(titles).size, 20, 'every swept post has a title of its own')
  for (const c of swept) {
    assert.ok(typeof c.params.fields.post_title === 'string' && c.params.fields.post_title.length > 0)
    assert.ok(
      c.params.body.startsWith(c.params.fields.post_excerpt),
      'the excerpt is the post’s opening words'
    )
  }
  // The site after the sweep: every one of the 22 posts is written and posts-written passes, strict as it is.
  const after = live.map((r) => {
    const call = swept.find((c) => c.params.id === r.identity.id)
    return call
      ? { ...r, data: { ...r.data, ...call.params.fields, post_content: `<p>${call.params.body}</p>` } }
      : r
  })
  const read = ['/', ...records.map((r) => r.routes[0])]
  const words = { id: 'no-demo-words', pass: true, routes: read, passages: [] }
  const check = postsWritten(plan, research, { checks: [words], read, records: after })
  assert.equal(check.pass, true)
  assert.equal(check.placeholders, undefined)
  assert.match(check.measured, /^22 of 22 template posts show/)
  assert.doesNotMatch(check.warning ?? '', /left unwritten/)
})

// 🔒 Review of round 12 (26/10/2026): a Joomla article or an EmDash entry the agent left kept the template's body,
// only its pictures and title were swept. The body is written from the research as on WordPress, else reported.
test("a Joomla or EmDash template post's body is written from the research like WordPress's, else reported", () => {
  const introtext = '<p>Lorem ipsum dolor sit amet of the template.</p>'
  const fulltext = '<p>Sed ut perspiciatis unde omnis iste natus.</p>'
  const article = {
    identity: { kind: 'article', id: 7 },
    routes: ['/blog/a7'],
    data: { title: 'Sample 7', alias: 'sample-7', catid: 8, introtext, fulltext }
  }
  const joomla = planSweep(
    { items: [] },
    {
      ...options,
      platform: 'joomla',
      inventory: [article],
      templatePosts: [article],
      postDrafts: [reservations]
    }
  )
  assert.deepEqual(joomla.calls, [
    {
      action: 'post',
      params: {
        platform: 'joomla',
        kind: 'article',
        id: 7,
        fields: { title: 'Reservations', alias: 'reservations' },
        was: { title: 'Sample 7', alias: 'sample-7' },
        slugFrom: 'title',
        bodyFields: { introtext: `<p>${reservations.body}</p>`, fulltext: '' },
        template: { introtext, fulltext }
      }
    }
  ])
  assert.deepEqual(joomla.unresolved, [])
  // An article the agent wrote the intro of keeps it; its full text, still the template's, is emptied on its own
  // (review 26/10/2026, second pass: it was neither swept nor reported).
  const own = { ...article, data: { ...article.data, introtext: '<p>Our own story.</p>' } }
  const kept = planSweep(
    { items: [] },
    { ...options, platform: 'joomla', inventory: [own], templatePosts: [article], postDrafts: [reservations] }
  )
  assert.deepEqual(kept.calls, [
    {
      action: 'post',
      params: {
        platform: 'joomla',
        kind: 'article',
        id: 7,
        fields: { title: 'Our own story', alias: 'our-own-story' },
        was: { title: 'Sample 7', alias: 'sample-7' },
        slugFrom: 'title',
        bodyFields: { fulltext: '' },
        template: { fulltext }
      }
    }
  ])
  assert.deepEqual(kept.unresolved, [])
  // A full text the plan wrote and the page still shows as the template's is reported, never emptied.
  const owed = planSweep(
    { items: [] },
    {
      ...options,
      platform: 'joomla',
      checksLeft: 1,
      inventory: [own],
      templatePosts: [{ ...article, written: ['introtext', 'fulltext'] }],
      postDrafts: [reservations]
    }
  )
  assert.ok(owed.calls.every((c) => c.params?.bodyFields?.fulltext === undefined))
  assert.ok(
    owed.unresolved.some((u) => u.field === 'post_content' && u.page === '/blog/a7' && /fulltext/.test(u.why))
  )
  // With no research left, the body is reported on the post's page, never left silently.
  const thin = planSweep(
    { items: [] },
    { ...options, platform: 'joomla', inventory: [article], templatePosts: [article], postDrafts: [] }
  )
  assert.ok(thin.unresolved.some((u) => u.field === 'post_content' && u.page === '/blog/a7'))
  const lorem = [
    {
      _type: 'block',
      _key: 'k1',
      style: 'normal',
      markDefs: [],
      children: [
        { _type: 'span', _key: 'k1s', text: 'Lorem ipsum dolor sit amet of the template.', marks: [] }
      ]
    }
  ]
  const entry = {
    identity: { collection: 'posts', id: 'p1', slug: 'sample', locale: 'en' },
    publication: { status: 'published' },
    routes: [{ pattern: '/posts/sample', locale: 'en' }],
    data: { title: 'Sample', content: lorem }
  }
  const emdash = planSweep(
    { items: [] },
    { ...options, platform: 'emdash', inventory: [entry], templatePosts: [entry], postDrafts: [hours] }
  )
  assert.equal(emdash.calls.length, 1)
  const { params } = emdash.calls[0]
  assert.equal(emdash.calls[0].action, 'post')
  assert.deepEqual(
    { ...params, bodyFields: undefined },
    {
      platform: 'emdash',
      collection: 'posts',
      id: 'p1',
      locale: 'en',
      status: 'published',
      fields: { title: 'Monday 09:00-22:00' },
      // An EmDash slug is the entry's own parameter, beside its data, with what it held when planned.
      slug: 'monday-09-00-22-00',
      was: { title: 'Sample', slug: 'sample' },
      slugFrom: 'title',
      bodyFields: undefined,
      template: { content: lorem }
    }
  )
  assert.deepEqual(
    params.bodyFields.content.map((b) => [b._type, b.children.map((s) => s.text).join('')]),
    [['block', hours.body]]
  )
  const none = planSweep(
    { items: [] },
    { ...options, platform: 'emdash', inventory: [entry], templatePosts: [entry], postDrafts: [] }
  )
  assert.ok(none.unresolved.some((u) => u.field === 'post_content' && u.page === '/posts/sample'))
})

test("a WordPress button's address in its block comment and its <a> is one link a visitor sees: counted once", () => {
  const frozen = {
    identity: { kind: 'post', id: 43 },
    routes: ['/three-broomsticks/'],
    data: { post_type: 'post', post_name: 'three-broomsticks', post_title: 'Three Broomsticks' }
  }
  const live = {
    ...frozen,
    routes: ['/the-coffee-cave/'],
    data: { ...frozen.data, post_name: 'the-coffee-cave' }
  }
  const home = {
    identity: { kind: 'post', id: 2 },
    routes: ['/'],
    data: {
      post_type: 'page',
      post_content: [
        '<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button {"url":"/three-broomsticks/"} -->',
        '<div class="wp-block-button"><a class="wp-block-button__link" href="/three-broomsticks/">Read</a></div>',
        '<!-- /wp:button --></div><!-- /wp:buttons -->',
        '<!-- wp:image {"id":5,"href":"/three-broomsticks/"} --><figure class="wp-block-image"><a href="/three-broomsticks/"><img src="/a.jpg"/></a></figure><!-- /wp:image -->',
        '<!-- wp:navigation-link {"label":"News","url":"/three-broomsticks/"} /-->'
      ].join('\n')
    }
  }
  const { calls } = planSweep(
    { items: [] },
    { ...options, inventory: [live, home], templatePosts: [{ ...frozen, written: ['post_title'] }] }
  )
  const links = calls.filter((c) => c.action === 'link')
  assert.equal(links.length, 1)
  // The button's anchor, the image's anchor and the navigation link: three links shown, three counted.
  assert.equal(links[0].params.expect, 3)
})

// Local measure 28/10/2026: a Joomla T4 build kept the template's logo in all seven headers through every check.
test("the sweep wears the business's own logo where a header shows none, once a build, never on WordPress", async () => {
  const { businessLogoDue } = await import('../src/opportunities-build/client-demo.js')
  const logo = { url: 'images/tracy-content/abc.jpg' }
  const missing = [{ id: 'header-brand', pass: false, detail: [{ code: 'LOGO_NOT_IN_HEADER' }] }]
  assert.equal(businessLogoDue(missing, { platform: 'joomla', logo }), true)
  assert.equal(businessLogoDue(missing, { platform: 'emdash', logo }), true)
  assert.equal(businessLogoDue(missing, { platform: 'wordpress', logo }), false)
  assert.equal(businessLogoDue(missing, { platform: 'joomla', logo, worn: logo.url }), false)
  assert.equal(businessLogoDue(missing, { platform: 'joomla', logo: null }), false)
  // A header failing for another reason (the name only) is not a missing logo.
  assert.equal(
    businessLogoDue([{ id: 'header-brand', pass: false, detail: [{ code: 'NAME_NOT_IN_HEADER' }] }], {
      platform: 'joomla',
      logo
    }),
    false
  )
  assert.equal(
    businessLogoDue([{ id: 'header-brand', pass: true, detail: [] }], { platform: 'joomla', logo }),
    false
  )
})

// ── One page's words, one call (dev ja-diner WordPress, 27/10/2026: 58 saves of each colour copy of Home) ──────────

const COLOUR_PAGES = ['/', '/home-red/', '/home-pink/', '/home-green/', '/home-blue/']
const onePage = { buildDate: '2026-10-28', platform: 'wordpress', inventory: [], contactPath: '/contact/' }
/** A call's pairs, whatever its shape: `changes`, or the one pair it always carried. */
const pairsOf = (c) =>
  Array.isArray(c.params.changes)
    ? c.params.changes
    : [
        {
          find: c.params.find,
          replace: c.params.replace,
          ...('expect' in c.params ? { expect: c.params.expect } : {})
        }
      ]

test('the same three words on five pages are five calls, one per page, each pair counted on its own', () => {
  const items = COLOUR_PAGES.flatMap((page) => [
    { field: 'dish-name', page, text: 'Grilled Salmon Fillet' },
    { field: 'dish-price', page, text: '$24.00' },
    { field: 'dish-desc', page, text: 'Slow cooked with juniper' },
    { field: 'dish-desc', page, text: 'Slow cooked with juniper' }
  ])
  const pairwise = planSweep({ items }, onePage)
  const batched = planSweep({ items }, { ...onePage, batches: true })
  assert.equal(pairwise.calls.length, 15)
  assert.deepEqual(
    batched.calls.map((c) => c.params.path),
    COLOUR_PAGES
  )
  for (const c of batched.calls) {
    assert.equal(c.action, 'content.replace')
    assert.equal(c.params.all, 'page')
    assert.equal(c.params.find, undefined)
    assert.deepEqual(
      c.params.changes.map((p) => [p.find, p.expect]),
      [
        ['Slow cooked with juniper', 2],
        ['Grilled Salmon Fillet', 1],
        ['$24.00', 1]
      ]
    )
  }
  // Every pair the pairwise plan sent is in the batched plan, on its page, with the same new words and count.
  const key = (path, p) => JSON.stringify([path, p.find, p.replace, p.expect ?? null])
  assert.deepEqual(
    batched.calls.flatMap((c) => pairsOf(c).map((p) => key(c.params.path, p))).sort(),
    pairwise.calls.flatMap((c) => pairsOf(c).map((p) => key(c.params.path, p))).sort()
  )
  // `left` and `shown` count pairs, however few calls carry them: a round is measured as before.
  assert.equal(batched.left, pairwise.left)
  assert.deepEqual(batched.shown, pairwise.shown)
  // An older dsh is given one pair per call: the planner batches only when asked.
  assert.ok(pairwise.calls.every((c) => c.params.changes === undefined))
})

test('a longer phrase is replaced before a shorter one it holds: the shorter waits for a later call of its page', () => {
  const items = ['/', '/home-red/'].flatMap((page) => [
    { field: 'dish-name', page, text: 'Smoked Venison' },
    { field: 'dish-name', page, text: 'Smoked Venison Burger' },
    { field: 'dish-price', page, text: '$18.00' }
  ])
  const { calls } = planSweep({ items }, { ...onePage, batches: true })
  assert.deepEqual(
    calls.map((c) => [c.params.path, pairsOf(c).map((p) => p.find)]),
    [
      ['/', ['Smoked Venison Burger', '$18.00']],
      ['/home-red/', ['Smoked Venison Burger', '$18.00']],
      ['/', ['Smoked Venison']],
      ['/home-red/', ['Smoked Venison']]
    ]
  )
  // A long text's next part waits for the part before it: it looks for words the part before wrote.
  const text = Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ')
  const long = planSweep(
    {
      items: [
        { field: 'dish-desc', page: '/', text },
        { field: 'dish-price', page: '/', text: '$9.00' }
      ]
    },
    { ...onePage, batches: true }
  ).calls
  assert.ok(long.length >= 2)
  assert.deepEqual(long.flatMap((c) => pairsOf(c).map((p) => p.find.split(' ')[0])).slice(0, 2), [
    'word0',
    '$9.00'
  ])
  for (const c of long.slice(1)) assert.equal(pairsOf(c).length, 1)
})

test('a page past what one call writes takes more calls: 20 pairs, 40 counted places, 5 places no expect counts', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    field: 'dish-name',
    page: '/',
    text: `Dish ${String.fromCharCode(65 + i)} of the house`
  }))
  const split = planSweep({ items: many }, { ...onePage, batches: true }).calls
  // "Dish A of the house" holds no other dish's words, so no pair waits for another: only the cap splits them.
  assert.deepEqual(
    split.map((c) => pairsOf(c).length),
    [20, 5]
  )
  // Places: a price shown 30 times and another 15 times are 45 places, over the job's 40 for one call.
  const shown = (text, n) => Array.from({ length: n }, () => ({ field: 'dish-price', page: '/', text }))
  const places = planSweep(
    { items: [...shown('$30.00', 30), ...shown('$15.00', 15)] },
    { ...onePage, batches: true }
  )
  assert.deepEqual(
    places.calls.map((c) => pairsOf(c).map((p) => [p.find, p.expect])),
    [[['$30.00', 30]], [['$15.00', 15]]]
  )
  // Whole passages go without `expect`, under the job's confirm-count: their places at most five a call.
  const passage = (n) => ({
    field: 'text',
    page: '/',
    whole: true,
    filler: true,
    text: `Lorem ipsum passage ${n}`,
    passage: `Lorem ipsum dolor sit amet passage number ${n}`
  })
  const loose = planSweep(
    { items: [passage(1), passage(1), passage(2), passage(2), passage(3), passage(3)] },
    { ...onePage, batches: true }
  ).calls
  assert.deepEqual(
    loose.map((c) => pairsOf(c).map((p) => p.expect ?? null)),
    [[null, null], [null]]
  )
})
