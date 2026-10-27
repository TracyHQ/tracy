// A button that leads to a page the demo trim hid is never left pointing at a 404 nor sent elsewhere: it is taken off.
//
// ja-kinetic's About page closes with a CTA whose second button reads "Read the blog" and links
// `index.php?Itemid=221` — the Blog menu item its demo-trim map hides. The route is the site's own,
// so the planner kept it as it was, and the model rewrote the label: a Vietnamese site showed
// "Đọc blog" pointing at a 404 (measured 23/09/2026 on j-2di9d7). Emptying the button was refused by
// the component then — an occupied slot is part of the sealed layout (j-l6pp7w) — so the link was
// moved to the contact page. Since TCH #1013 (08/10/2026; for a page the trim hid, 10/10/2026) a link
// is never sent elsewhere: the planner leaves it as it is and names it as dead, and it is taken off
// (`empty_links`) where the site's component reviewed its layout (Claude Cowork for Joomla 0.24.4).

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { deadLinks, planJoomlaContract } from '../src/plan-joomla-contract.mjs'

const ID = 'kinetic/j6/1.0.0'

function contractDir({ trimMap = true } = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'dead-links-'))
  const dir = path.join(dataDir, 'quickstart-contracts', ID)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'content-map.json'),
    JSON.stringify({
      entities: [
        { key: 'module-201', kind: 'module', identity: { language: '*' }, sourceId: 201 },
        { key: 'menuItem-221', kind: 'menuItem', identity: { language: '*' }, sourceId: 221 },
        { key: 'menuItem-226', kind: 'menuItem', identity: { language: '*' }, sourceId: 226 },
        { key: 'menuItem-230', kind: 'menuItem', identity: { language: '*' }, sourceId: 230 },
        { key: 'menuItem-227', kind: 'menuItem', identity: { language: '*' }, sourceId: 227 },
        { key: 'article-140', kind: 'article', identity: { language: '*' }, sourceId: 140 }
      ]
    })
  )
  writeFileSync(
    path.join(dir, 'presentation-lock.json'),
    JSON.stringify({
      entities: {
        'menuItem-221': { path: 'product/blog', published: '1' },
        'menuItem-226': { path: 'company/team', published: '1' },
        'menuItem-227': {
          path: 'company/contact',
          published: '1',
          link: 'index.php?option=com_contact&view=contact&id=1'
        },
        'menuItem-230': { path: 'pages/helixql', published: '1' }
      }
    })
  )
  if (trimMap)
    writeFileSync(
      path.join(dir, 'demo-trim-map.json'),
      JSON.stringify({
        contract: ID,
        hide: [
          { key: 'menuItem-221', kind: 'menuItem', field: 'published', from: '1', to: '0' },
          { key: 'menuItem-230', kind: 'menuItem', field: 'published', from: '1', to: '0' },
          { key: 'article-140', kind: 'article', field: 'state', from: '1', to: '0' }
        ]
      })
    )
  return dataDir
}

const slot = (n, name, type, sample) => ({
  key: `module-201.${n}`,
  entity: 'module-201',
  column: 'params',
  type,
  sample,
  current: sample,
  maxCharacters: 80,
  requiresEvidence: false,
  jsonPath: ['cta', `cta[${name}]`, 0],
  nestedJson: 'jatools-config'
})
const state = {
  contract: ID,
  slots: [
    slot(3, 'btn1-label', 'text', 'See open roles'),
    slot(4, 'btn1-link', 'url', 'index.php?Itemid=226'),
    slot(5, 'btn2-label', 'text', 'Read the blog'),
    slot(6, 'btn2-link', 'url', 'index.php?Itemid=221'),
    slot(7, 'chip-label', 'text', 'Read the launch post'),
    slot(8, 'chip-link', 'url', 'index.php?option=com_content&view=article&id=140'),
    // A SEF path to the hidden showcase page, the way ja-kinetic's HelixQL split writes it, with
    // the underscore spelling of the same pair.
    slot(9, 'cta_label', 'text', 'Read the HelixQL docs'),
    slot(10, 'cta_link', 'url', '/pages/helixql'),
    slot(11, 'more_label', 'text', 'Meet the team'),
    slot(12, 'more_link', 'url', '/company/team')
  ],
  pages: []
}
const site = { name: 'Tôn Việt', about: 'Tôn lợp', languages: ['vi-VN'], sourceLanguage: 'vi-VN' }

// TCH #1013 (product owner, 08/10/2026; decided for a page the trim hid 10/10/2026): a link into a hidden page is taken
// off, never sent to the contact page. Until then this test held the opposite: the three buttons into the trimmed Blog,
// launch post and HelixQL page were moved to `index.php?Itemid=227` and their labels told "the contact page".
test('a button to a page the demo trim hid is never sent to Contact: it keeps its link, and is taken off where its layout was reviewed', async (t) => {
  const dataDir = contractDir()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const asked = []
  const generate = async ({ input }) => {
    asked.push(...input.slots.map((s) => ({ key: s.key, leadsTo: s.leadsTo })))
    return { values: Object.fromEntries(input.slots.map((s) => [s.key, 'Liên hệ ngay'])), pending: [] }
  }
  // The site's component reviewed the layouts of the Blog button and the HelixQL split, not the launch-post chip.
  const reviewed = new Set(['module-201.6', 'module-201.10'])
  const marked = {
    ...state,
    slots: state.slots.map((s) => (reviewed.has(s.key) ? { ...s, emptyLink: 'hidden' } : s))
  }
  const plan = await planJoomlaContract({ state: marked, site, generate, dataDir, trimmed: true })
  for (const link of ['module-201.6', 'module-201.8', 'module-201.10'])
    assert.equal(plan.changes[link], undefined, `${link} is neither moved nor rewritten`)
  assert.deepEqual(plan.emptyLinks, ['module-201.6', 'module-201.10'], 'the reviewed ones are taken off')
  for (const label of ['module-201.5', 'module-201.7', 'module-201.9']) {
    assert.equal(asked.find((a) => a.key === label)?.leadsTo, undefined, `${label} is told no destination`)
    assert.equal(plan.changes[label], 'Liên hệ ngay', 'the label is still written, never emptied')
  }
  assert.ok(
    asked.every((a) => a.leadsTo === undefined),
    'no slot is told it leads to the contact page'
  )
  assert.ok(
    !Object.values(plan.changes).includes('index.php?Itemid=227'),
    'nothing is sent to the contact page'
  )
  assert.equal(plan.changes['module-201.4'], undefined, 'a live route is left as it is')
  assert.equal(
    plan.changes['module-201.12'],
    'index.php?Itemid=226',
    'a SEF path to a live page keeps its page, by id'
  )
  // A reading with no reviewed layout (a release's profile before the site exists, an older component) takes none off.
  const unmarked = await planJoomlaContract({ state, site, generate, dataDir, trimmed: true })
  assert.equal(unmarked.emptyLinks, undefined)
  assert.equal(unmarked.changes['module-201.6'], undefined)
})

// TCH #1013 (08/10/2026): a page is hidden only when the customer unticked it, and links are never moved to Contact. Apply
// publishes a ticked page the demo trim hid again (`tickedMenuItems`, tracy-web) — after the words are written. Planned as
// gone, Tracy Business j6's About and Services CTAs sent their "alt" buttons into a ticked Projects (602) to Contact and
// wrote their labels for it: the page came back and its buttons led elsewhere (found 10/10/2026, traced on the release).
test('a button to a page the trim hid that Apply publishes again (the customer ticked it) keeps its page', async (t) => {
  const dataDir = contractDir()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const asked = []
  // A grid link the template leaves as `#`, which the model fills with the ticked page's path.
  const grid = {
    ...slot(20, 'item-url', 'url', '#'),
    key: 'module-201.20',
    jsonPath: ['logos', 'logos[item-url]', 0]
  }
  const generate = async ({ input }) => {
    asked.push(...input.slots.map((s) => ({ key: s.key, leadsTo: s.leadsTo })))
    return {
      values: Object.fromEntries(
        input.slots.map((s) => [s.key, s.type === 'url' ? '/product/blog' : 'Đọc blog'])
      ),
      pending: []
    }
  }
  const withGrid = { ...state, slots: [...state.slots, grid] }
  const plan = await planJoomlaContract({
    state: withGrid,
    site,
    generate,
    dataDir,
    trimmed: true,
    republished: new Set(['221'])
  })
  assert.equal(
    plan.changes['module-201.6'],
    undefined,
    'the Blog button still leads to the Blog, never to Contact'
  )
  assert.equal(
    asked.find((a) => a.key === 'module-201.5')?.leadsTo,
    undefined,
    'its label is written for the Blog'
  )
  assert.equal(plan.changes['module-201.5'], 'Đọc blog')
  assert.equal(
    plan.changes['module-201.20'],
    'index.php?Itemid=221',
    'a live page a link may name, by its id'
  )
  // The page nobody ticked that the trim hid: its button is dead, left as it is for the take-off, never sent to Contact.
  assert.equal(plan.changes['module-201.10'], undefined)
  assert.equal(asked.find((a) => a.key === 'module-201.9')?.leadsTo, undefined)
  // Without the tick, the Blog is gone: a link the model writes into it is refused, and the button is dead too.
  const before = await planJoomlaContract({ state: withGrid, site, generate, dataDir, trimmed: true })
  assert.equal(before.changes['module-201.6'], undefined)
  assert.equal(before.reasons['module-201.20'], 'invented-route')
  assert.deepEqual(
    deadLinks(withGrid, dataDir, { back: new Set(['221']) }).includes('module-201.6'),
    false,
    'a button into a ticked page is not dead'
  )
  assert.ok(deadLinks(withGrid, dataDir).includes('module-201.6'), 'one into a page nobody ticked is')
})

test('without a trim the same button is left alone', async (t) => {
  const dataDir = contractDir()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const generate = async ({ input }) => ({
    values: Object.fromEntries(input.slots.map((s) => [s.key, 'Đọc thêm'])),
    pending: []
  })
  const plan = await planJoomlaContract({ state, site, generate, dataDir })
  assert.equal(plan.changes['module-201.6'], undefined)
  assert.equal(plan.changes['module-201.5'], 'Đọc thêm')
})

// ja-kinetic 1.0.0 ships `sef_rewrite = false` and no .htaccess, yet its hero buttons link bare
// SEF paths (`/pages/register`, `/pages/login`) that only a rewriting server answers: 404 on every
// site built from the release as published (23/09/2026, j-2di9d7). The same menu item by id works
// with rewriting on or off, so the link is written that way.
test('a bare SEF path to a live menu item is written as index.php?Itemid=N, trimmed or not', async (t) => {
  const dataDir = contractDir()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const generate = async ({ input }) => ({
    values: Object.fromEntries(input.slots.map((s) => [s.key, 'Xem đội ngũ'])),
    pending: []
  })
  for (const trimmed of [false, true]) {
    const plan = await planJoomlaContract({ state, site, generate, dataDir, trimmed })
    assert.equal(plan.changes['module-201.12'], 'index.php?Itemid=226')
    assert.equal(plan.changes['module-201.11'], 'Xem đội ngũ', 'its label is still written')
    assert.equal(plan.changes['module-201.4'], undefined, 'an Itemid link is already right')
  }
})

// Measured 23/09/2026 on j-l6pp7w (ja-kinetic): the Integrations grid's links were `#`, and the
// model filled 19 of them with paths it made up in Vietnamese — `/lien-he`, `/san-pham/ton-lop` —
// none of them a page: 19 links to 404 on a finished site. A link the model writes to this site
// must be one of its live pages; one that is becomes its menu id, one that is not keeps `#`.
test('a site link the model makes up is refused; one to a live page is written by its id', async (t) => {
  const dataDir = contractDir()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const grid = (n, sample) => ({
    key: `module-209.${n}`,
    entity: 'module-201',
    column: 'params',
    type: 'url',
    sample,
    current: sample,
    maxCharacters: 2048,
    requiresEvidence: false,
    jsonPath: ['logos', 'logos[item-url]', n],
    nestedJson: 'jatools-config'
  })
  const gridState = {
    contract: ID,
    slots: [grid(0, '#'), grid(1, '#'), grid(2, '#'), grid(3, '#')],
    pages: []
  }
  const generate = async () => ({
    values: {
      'module-209.0': '/lien-he',
      'module-209.1': '/company/team',
      'module-209.2': 'index.php?Itemid=999',
      'module-209.3': 'https://example.com/partner'
    },
    pending: []
  })
  const plan = await planJoomlaContract({ state: gridState, site, generate, dataDir })
  assert.equal(plan.changes['module-209.0'], undefined)
  assert.equal(plan.reasons['module-209.0'], 'invented-route')
  assert.equal(plan.changes['module-209.1'], 'index.php?Itemid=226')
  assert.equal(plan.reasons['module-209.2'], 'invented-route', 'an id the site does not have is made up too')
  assert.equal(
    plan.changes['module-209.3'],
    'https://example.com/partner',
    'an outside address is not this rule'
  )
})

// Measured 05/10/2026 on a Tracy Business j6 site made with Apply: the page a link leads to can be hidden AFTER the words
// are written (the Apply tidy's judge takes "Careers" and the marketing kit off), and the 404 page's "you may be looking
// for" rows still led there. The ids of the pages taken off are handed to the same rule that knows the trim map's, so a
// link into a page the tidy hid is dead the way one into a page the trim hid is — whether or not the release ships a trim
// map — and Apply takes both off (TCH #1013).
test('a page hidden after the trim is named to the same rule, and a link into it is dead the same way', async (t) => {
  const dataDir = contractDir()
  const bare = contractDir({ trimMap: false })
  t.after(() => {
    rmSync(dataDir, { recursive: true, force: true })
    rmSync(bare, { recursive: true, force: true })
  })
  const dead = deadLinks(state, dataDir, { also: new Set(['226']) })
  assert.ok(dead.includes('module-201.4'), 'by id')
  assert.ok(dead.includes('module-201.12'), 'by its SEF path')
  assert.ok(dead.includes('module-201.6'), 'what the trim hid is dead too')
  assert.ok(!dead.includes('module-201.11'), 'a label is not a link')

  assert.deepEqual(
    deadLinks(state, bare, { also: new Set(['226']) }).sort(),
    ['module-201.12', 'module-201.4'],
    'with no trim map, only what was named is gone'
  )
  assert.deepEqual(deadLinks(state, bare), [], 'and with nothing named, nothing is')
  assert.deepEqual(
    deadLinks(state, dataDir, { also: new Set(['226']), trim: false }).sort(),
    ['module-201.12', 'module-201.4'],
    'a trim that did not run on the site hides nothing'
  )
})

// A menu item the contract's showcase-navigation map hides (`menu_show` 0) is put away from navigation only: its page stays
// published and its route answers. A link into it is not dead, and its route stays a live page the planner may write.
test('a menu item the showcase-navigation map hides from navigation is not a dead link and stays a live route', async (t) => {
  const dataDir = contractDir()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const dir = path.join(dataDir, 'quickstart-contracts', ID)
  const before = deadLinks(state, dataDir)
  writeFileSync(
    path.join(dir, 'showcase-nav-map.json'),
    JSON.stringify({
      schemaVersion: 'tracy-quickstart-showcase-nav/joomla/v1',
      status: 'checked',
      operations: [
        {
          op: 'menuItem.param',
          key: 'menuItem-226',
          identity: { path: 'company/team', menutype: 'mainmenu', language: '*' },
          path: 'menu_show',
          from: '1',
          to: '0'
        }
      ]
    })
  )
  assert.ok(before.includes('module-201.6'), 'what the trim hid is still dead')
  assert.deepEqual(deadLinks(state, dataDir), before)
  for (const key of ['module-201.4', 'module-201.12'])
    assert.equal(deadLinks(state, dataDir).includes(key), false, key)
  const generate = async ({ input }) => ({
    values: Object.fromEntries(input.slots.map((s) => [s.key, 'Xem đội ngũ'])),
    pending: []
  })
  const plan = await planJoomlaContract({ state, site, generate, dataDir, trimmed: true })
  assert.equal(plan.changes['module-201.12'], 'index.php?Itemid=226')
  assert.equal(plan.changes['module-201.4'], undefined)
})
