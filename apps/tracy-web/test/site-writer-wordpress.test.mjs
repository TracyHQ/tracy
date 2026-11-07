// The site writer on a WordPress kit (#463), on the committed JA Diner WP7 contract: the main menu is the navigation the
// theme's header part shows (navigation-source.json), the copy maps to the WordPress content contract door (slots
// found by block metadata.name, plain text), and the Joomla emphasis markup never reaches it. The assertions hold on
// the contract's shape and its menu, never on block ids or counts: the kit's page blocks may be split again.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportContractMapping } from '../src/lib/site-copy/contract-mapping.js'
import { storageOf } from '../src/lib/site-copy/emphasis-markup.js'
import { mainMenuOf } from '../src/lib/site-copy/main-menu.js'
import { CHECKER_VERSION, checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { writerInput } from '../src/site-writer/writer-input.js'
import { brief, DINER_REF, dinerContentMap, dinerKit, plan, writerAnswer } from './_site-writer-diner-wp7.mjs'

const kit = dinerKit()
const map = dinerContentMap()
const menu = () => mainMenuOf({ plan: plan(), kit: kit.doc, contentMap: map.doc })

/** The answer as the bench assembles it: the copy file with its version and fingerprint. */
const copyOf = (answer = writerAnswer()) => ({
  version: 'site-copy/1',
  fingerprint: {
    kit: `${kit.doc.kit} ${DINER_REF}`,
    planSha256: 'a'.repeat(64),
    briefSha256: 'b'.repeat(64),
    promptSha256: 'c'.repeat(64)
  },
  ...answer
})

const exportOf = (copy = copyOf()) =>
  exportContractMapping({
    copy,
    contract: DINER_REF,
    revision: 'test',
    kit: kit.doc,
    brief: brief(),
    plan: plan(),
    contentMap: map.doc,
    platform: 'wordpress'
  })

test('the Diner WP7 kit opens as a WordPress kit with its navigation beside the content map', () => {
  assert.equal(kit.platform, 'wordpress')
  assert.equal(map.doc.navigationSource?.contract, DINER_REF)
  assert.match(map.sha256, /^[0-9a-f]{64}$/)
})

test("the main menu is the header's navigation, in the theme's own order and tree", () => {
  const m = menu()
  assert.equal(m.menutype, 'mainmenu')
  assert.deepEqual(
    m.items.map((i) => [i.demo, i.path, i.parent === null ? 'top' : 'child']),
    [
      ['Home', '/', 'top'],
      ['Home - Red', '/home/home-red', 'child'],
      ['Home - Pink', '/home/home-pink', 'child'],
      ['Home - Green', '/home/home-green', 'child'],
      ['Home - Blue', '/home/home-blue', 'child'],
      ['About Us', '/about-us', 'top'],
      ['Reservation', '/reservation', 'top'],
      ['Offers', '/offers', 'top'],
      ['Our Blog', '/our-blog', 'top'],
      ['Contact Us', '/contact-us', 'top']
    ]
  )
  const home = m.items.find((i) => i.demo === 'Home')
  assert.ok(m.items.filter((i) => i.demo.startsWith('Home - ')).every((i) => i.parent === home.item))
})

test('the items the plan keeps are writer slots; every other item is hidden with its reason', () => {
  const m = menu()
  const state = Object.fromEntries(m.items.map((i) => [i.demo, i.state]))
  assert.deepEqual(state, {
    Home: 'top',
    'Home - Red': 'shown',
    'Home - Pink': 'hidden',
    'Home - Green': 'hidden',
    'Home - Blue': 'hidden',
    'About Us': 'top',
    Reservation: 'hidden',
    Offers: 'hidden',
    'Our Blog': 'hidden',
    'Contact Us': 'top'
  })
  const bySample = Object.fromEntries(m.slots.map((s) => [s.sample, s]))
  assert.deepEqual(Object.keys(bySample), ['Home', 'Home - Red', 'About Us', 'Contact Us'])
  const homeSlot = bySample.Home.slot
  assert.equal(bySample['Home - Red'].parentSlot, homeSlot)
  assert.equal(bySample['Home - Red'].page, 'page-home_home-red')
  assert.equal(bySample['Home - Red'].intent, 'The seasonal menu')
  assert.equal(bySample.Home.parentSlot, null)
  for (const s of m.slots) assert.ok(s.maxCharacters >= s.sample.length, s.slot)
  assert.match(m.hidden.find((h) => h.path === '/offers').why, /the plan's main menu does not keep \/offers/)
  assert.deepEqual(m.problems, [])
})

test('a plan page the WordPress menu does not open is a problem, never guessed', () => {
  const p = plan()
  p.mainMenu.push({ page: 'page-j-pages_login', intent: 'Sign in', children: [] })
  const m = mainMenuOf({ plan: p, kit: kit.doc, contentMap: map.doc })
  assert.equal(m.problems.length, 1)
  assert.match(m.problems[0].detail, /page-j-pages_login.*no main menu item/)
})

test("the writer is asked for the Diner menu labels, and the copy check reads the writer's answer", () => {
  const input = writerInput({ plan: plan(), brief: brief(), kit: kit.doc, contentMap: map.doc })
  const asked = input.mainMenu.flatMap((g) => g.dropdown.map((d) => d.sample))
  assert.deepEqual(asked.sort(), ['About Us', 'Contact Us', 'Home', 'Home - Red'])
  const result = checkCopy({
    copy: copyOf(),
    plan: plan(),
    kit: kit.doc,
    brief: brief(),
    contentMap: map.doc
  })
  assert.equal(result.meta.checker, CHECKER_VERSION)
  const failing = result.rules.filter((r) => r.status === 'fail')
  assert.deepEqual(
    failing.map((r) => [r.id, r.failures.map((f) => f.detail)]),
    []
  )
})

test('the mapping is in the WordPress contract door shape: content map slot keys, plain text, block targets', () => {
  const { mapping, extras, problems } = exportOf()
  assert.equal(mapping.platform, 'wordpress')
  assert.equal(mapping.contract, DINER_REF)
  const slots = new Map(map.doc.slots.map((s) => [s.key, s]))
  const keys = Object.keys(mapping.changes)
  assert.ok(keys.length >= 3)
  for (const key of keys) {
    const slot = slots.get(key)
    assert.ok(slot, `${key} is a content map slot`)
    assert.equal(slot.type, 'text')
    assert.deepEqual(mapping.targets[key], {
      entity: slot.entity,
      ...slot.target,
      type: slot.type,
      maxCharacters: slot.maxCharacters
    })
    assert.equal(typeof mapping.targets[key].block, 'string')
    const value = mapping.changes[key]
    assert.doesNotMatch(value, /\(\(|<|>|\n/, `${key} is plain text`)
    assert.ok(value.length <= slot.maxCharacters)
  }
  assert.match(mapping.evidence[keys[0]], /Brief facts: f-name: Lantern Kitchen/)
  // The menu labels are not content map slots: they go to step 9 with the menu, not to the door.
  assert.deepEqual(problems, [])
  const labels = Object.fromEntries(extras.mainMenu.items.map((i) => [i.demo, i.label]))
  assert.equal(labels.Home, 'Home')
  assert.equal(labels['Home - Red'], 'Seasonal menu')
  assert.equal(labels.Offers, null)
  assert.equal(extras.mainMenu.menutype, 'mainmenu')
  assert.deepEqual(extras.mainMenu.hide.map((h) => h.path).sort(), [
    '/home/home-blue',
    '/home/home-green',
    '/home/home-pink',
    '/offers',
    '/our-blog',
    '/reservation'
  ])
})

test('a writer slot the door cannot take is a problem, not a change', () => {
  const answer = writerAnswer()
  const image = map.doc.slots.find((s) => s.type === 'image')
  answer.slots.push({ slot: image.key, owner: 'writer', text: 'A plate', factIds: [] })
  answer.slots.push({ slot: 'no-such.slot', owner: 'writer', text: 'Words', factIds: [] })
  const { mapping, problems } = exportOf(copyOf(answer))
  assert.equal(image.key in mapping.changes, false)
  assert.equal('no-such.slot' in mapping.changes, false)
  assert.deepEqual(problems.map((p) => p.where).sort(), [image.key, 'no-such.slot'].sort())
})

test('emphasis degrades on WordPress: no slot is stored as Joomla markup, and the export writes plain words', () => {
  for (const s of map.doc.slots) assert.equal(storageOf(s), 'unknown', s.key)
  // A kit slot that marks accent words (a Joomla ACM habit) still exports plain text on WordPress.
  const answer = writerAnswer()
  const first = answer.slots[0]
  first.emphasis = first.text.split(' ')[0]
  const marked = structuredClone(kit.doc)
  for (const b of marked.blocks)
    for (const s of b.slots ?? [])
      if (s.id === first.slot) s.inline = [{ tag: 'span', attrs: '', text: 'Hey', at: 'start' }]
  const out = exportContractMapping({
    copy: copyOf(answer),
    contract: DINER_REF,
    revision: 'test',
    kit: marked,
    brief: brief(),
    plan: plan(),
    contentMap: map.doc,
    platform: 'wordpress'
  })
  assert.equal(out.mapping.changes[first.slot], first.text)
})
