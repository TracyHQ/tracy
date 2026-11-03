// The main menu dropdowns of the site writer (ADR 0042): the content map's main menu tree matched with the plan's
// mainMenu gives the dropdown slots the writer writes and the menu items step 9 hides. Invented fixtures only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportContractMapping } from '../src/site-writer/contract-mapping.js'
import { CHECKER_VERSION, checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { mainMenuOf } from '../src/site-writer/main-menu.js'
import { writerInput } from '../src/site-writer/writer-input.js'
import { fixedPart } from '../src/site-writer/writer-turns.js'
import { brief, contentMap, copy, kit, plan } from './_site-writer-main-menu.mjs'

const menu = () => mainMenuOf({ plan: plan(), kit: kit(), contentMap: contentMap() })
const hiddenItems = (m) => m.hidden.map((h) => h.item).sort()

test('a child the plan keeps under a kept top-level item becomes a writer slot', () => {
  const m = menu()
  assert.equal(m.menutype, 'mainmenu')
  const yoga = m.slots.find((s) => s.slot === 'menuItem-21.0')
  assert.deepEqual(
    { ...yoga },
    {
      slot: 'menuItem-21.0',
      item: 'menuItem-21',
      parentSlot: 'menuItem-20.0',
      page: 'page-classes_yoga',
      intent: 'Slow morning yoga',
      maxCharacters: 24,
      sample: 'Yoga Flow'
    }
  )
})

test("a dropdown slot takes the kit's own limit for the item over the parent's", () => {
  const team = menu().slots.find((s) => s.slot === 'menuItem-31.0')
  assert.equal(team.maxCharacters, 16)
  assert.equal(team.intent, 'Meet the coaches')
})

test('an item already labelled by a kept block is not asked again', () => {
  const m = menu()
  assert.equal(
    m.slots.some((s) => s.slot === 'menuItem-34.0'),
    false
  )
  const contact = m.items.find((i) => i.item === 'menuItem-34')
  assert.equal(contact.state, 'shown')
  assert.deepEqual(contact.labelFrom, { block: 'block-6', owner: 'plan-label', text: 'Contact' })
})

test('every other main menu item is hidden: dropped children, grandchildren of dropped pages, hidden branches', () => {
  const m = menu()
  assert.deepEqual(hiddenItems(m), [
    'menuItem-22',
    'menuItem-32',
    'menuItem-33',
    'menuItem-40',
    'menuItem-41'
  ])
  const why = Object.fromEntries(m.hidden.map((h) => [h.item, h.why]))
  assert.match(why['menuItem-22'], /does not keep \/classes\/spin under \/classes/)
  assert.match(why['menuItem-32'], /does not keep \/about\/team\/nia/)
  assert.match(why['menuItem-41'], /under the hidden top-level item \/prices/)
  assert.ok(m.hidden.every((h) => h.slot === `${h.item}.0`))
})

test('a plan child that maps to no main menu item is reported, never guessed', () => {
  const m = menu()
  assert.deepEqual(m.problems, [
    {
      page: 'page-about_faq',
      parent: 'page-about',
      detail: 'page-about_faq (/about/faq): no main menu item under /about opens this page'
    }
  ])
})

test('a plan child the kit does not know is reported', () => {
  const p = plan()
  p.mainMenu[1].children.push({ page: 'page-nowhere', intent: 'x' })
  const m = mainMenuOf({ plan: p, kit: kit(), contentMap: contentMap() })
  assert.ok(m.problems.some((x) => x.page === 'page-nowhere' && /the kit has no page/.test(x.detail)))
})

test('without a content map nothing is derived and a plan with dropdown children is reported', () => {
  const m = mainMenuOf({ plan: plan(), kit: kit(), contentMap: null })
  assert.deepEqual(m.slots, [])
  assert.deepEqual(m.hidden, [])
  assert.equal(m.menutype, null)
  assert.match(m.problems[0].detail, /no content map/)
})

const checked = (c, p = plan()) =>
  checkCopy({ copy: c, plan: p, kit: kit(), brief: brief(), contentMap: contentMap() })
const rule = (result, id) => result.rules.find((r) => r.id === id)

test('the copy check passes a copy that writes the dropdown slots, under the new checker version', () => {
  const r = checked(copy())
  assert.deepEqual(
    r.rules.filter((x) => x.status === 'fail').map((x) => [x.id, x.failures]),
    []
  )
  assert.equal(r.meta.checker, 'site-copy-check/3')
  assert.equal(CHECKER_VERSION, 'site-copy-check/3')
})

test('W02 requires every dropdown slot the writer owns', () => {
  const c = copy()
  c.slots = c.slots.filter((s) => s.slot !== 'menuItem-21.0')
  const w02 = rule(checked(c), 'W02')
  assert.equal(w02.status, 'fail')
  assert.deepEqual(
    w02.failures.map((f) => f.detail),
    ['menuItem-21.0: slot is missing']
  )
})

test('W03 holds a dropdown label to its limit', () => {
  const c = copy()
  c.slots.find((s) => s.slot === 'menuItem-31.0').text = 'All of our friendly coaches'
  const w03 = rule(checked(c), 'W03')
  assert.deepEqual(
    w03.failures.map((f) => f.detail),
    ['menuItem-31.0: 27 characters, limit 16']
  )
})

test('W02 fails when two places of the plan give the same menu item different text', () => {
  const p = plan()
  p.sharedBlocks[0].copy.push({
    slot: 'menuItem-34.0',
    says: 'contact',
    text: 'Get in touch',
    basis: 'trade'
  })
  const w02 = rule(checked(copy(), p), 'W02')
  assert.equal(w02.status, 'fail')
  assert.ok(
    w02.failures.some(
      (f) =>
        f.where === 'menuItem-34.0' &&
        f.detail ===
          'menuItem-34.0: the plan gives this slot different text in two places: block-1 "Get in touch", block-6 "Contact"'
    ),
    w02.failures.map((f) => f.detail).join('\n')
  )
})

test('a plan child matched to no menu item is a note on W02, not a writer failure', () => {
  const w02 = rule(checked(copy()), 'W02')
  assert.ok(w02.notes.some((n) => /page-about_faq \(\/about\/faq\): no main menu item under \/about/.test(n)))
})

test('without a content map the check is unchanged for the dropdowns', () => {
  const r = checkCopy({ copy: copy(), plan: plan(), kit: kit(), brief: brief() })
  assert.ok(rule(r, 'W02').failures.some((f) => /menuItem-21\.0: unknown slot/.test(f.detail)))
})

test("the writer's input lists the dropdown slots under their parent, and the fixed part names them", () => {
  const input = writerInput({ plan: plan(), brief: brief(), kit: kit(), contentMap: contentMap() })
  assert.deepEqual(input.mainMenu, [
    {
      parent: 'menuItem-20.0',
      dropdown: [
        {
          slot: 'menuItem-21.0',
          page: 'page-classes_yoga',
          intent: 'Slow morning yoga',
          maxCharacters: 24,
          sample: 'Yoga Flow'
        }
      ]
    },
    {
      parent: 'menuItem-30.0',
      dropdown: [
        {
          slot: 'menuItem-31.0',
          page: 'page-about_team',
          intent: 'Meet the coaches',
          maxCharacters: 16,
          sample: 'Our team'
        }
      ]
    }
  ])
  const text = fixedPart(input)
  assert.match(text, /## Main menu: the dropdown slots to write in the shared turn, under their parent\n\n\[/)
  const without = fixedPart(writerInput({ plan: plan(), brief: brief(), kit: kit() }))
  assert.doesNotMatch(without, /Main menu/)
})

test('the mapping export carries the dropdown labels and the menu items to hide for step 9', () => {
  const { mapping, extras } = exportContractMapping({
    copy: copy(),
    contract: 'demo-gym/j6/1.0.0',
    revision: 'rev-1',
    kit: kit(),
    brief: brief(),
    plan: plan(),
    contentMap: contentMap()
  })
  assert.equal(mapping.changes['menuItem-21.0'], 'Yoga')
  assert.equal(mapping.changes['menuItem-31.0'], 'Coaches')
  assert.equal(mapping.changes['menuItem-34.0'], 'Contact')
  assert.deepEqual(
    extras.mainMenu.hide.map((h) => [h.item, h.path]),
    [
      ['menuItem-22', '/classes/spin'],
      ['menuItem-32', '/about/team/nia'],
      ['menuItem-33', '/about/history'],
      ['menuItem-40', '/prices'],
      ['menuItem-41', '/prices/monthly']
    ]
  )
  const shown = extras.mainMenu.items.filter((i) => i.state !== 'hidden').map((i) => [i.item, i.label])
  assert.deepEqual(shown, [
    ['menuItem-10', 'Home'],
    ['menuItem-20', 'Classes'],
    ['menuItem-21', 'Yoga'],
    ['menuItem-30', 'About'],
    ['menuItem-31', 'Coaches'],
    ['menuItem-34', 'Contact']
  ])
  assert.equal(extras.mainMenu.problems.length, 1)
  const plain = exportContractMapping({
    copy: copy(),
    contract: 'c',
    revision: 'r',
    kit: kit(),
    brief: brief()
  })
  assert.equal(plain.extras.mainMenu, undefined)
})
