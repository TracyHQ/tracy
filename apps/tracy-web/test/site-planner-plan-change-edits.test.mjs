// Field edits at a path, and the size guard, of a fix round's change list (ADR 0041, #301 cost cuts): every place a
// checker failure names (a page's story, a page group, a footer menu heading, a main menu entry, a slot inside a list
// row) is reached without replacing what holds it, and a large replacement that is mostly unchanged is flagged. Pure:
// the plan is the invented Harbour Sport Club plan of the checker tests.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LARGE_REPLACEMENT_BYTES,
  oversizedReplacements,
  smallEditsMessage
} from '../src/site-planner/plan-change-size.js'
import { applyChanges } from '../src/site-planner/plan-changes.js'
import { plan } from './_site-plan-check.mjs'

const page = (p, id) => p.pages.find((x) => x.id === id)
const apply = (changes) => {
  const out = applyChanges(plan(), { changes })
  assert.equal(out.ok, true, out.reason)
  return out
}

test('a field edit reaches the places a checker failure names, and keeps everything around it', () => {
  const before = plan()
  const out = apply([
    { page: 'page-home', field: 'story.0.step', with: 'who the club is for' },
    { page: 'page-about-us', field: 'slug', with: 'our-club' },
    { pageGroup: 'group-home', field: 'why', with: 'every site needs a start page' },
    { section: 'site', field: 'footerMenu[1].heading.says', with: 'The club' },
    { section: 'site', field: 'notFound.leadsTo', with: ['page-home', 'page-classes'] },
    { section: 'mainMenu', field: '2.page', with: 'page-about-us' },
    { list: 'block-190.item', field: 'items.0.copy.1.says', with: 'what a first tennis lesson is like' },
    { slot: 'block-190.0', field: 'maxCharacters', with: 40 },
    { form: 'block-169', field: 'why', with: 'no newsletter in the brief' }
  ])
  const p = out.plan
  assert.equal(page(p, 'page-home').story[0].step, 'who the club is for')
  assert.equal(page(p, 'page-about-us').slug, 'our-club')
  assert.equal(p.pageGroups[0].why, 'every site needs a start page')
  assert.equal(p.site.footerMenu[1].heading.says, 'The club')
  assert.deepEqual(p.site.footerMenu[1].pages, before.site.footerMenu[1].pages)
  assert.deepEqual(p.site.notFound.leadsTo, ['page-home', 'page-classes'])
  assert.equal(p.mainMenu[2].page, 'page-about-us')
  const row = page(p, 'page-about-us').blocks.find((b) => b.block === 'block-190').lists[0].items[0]
  assert.equal(row.copy[1].says, 'what a first tennis lesson is like')
  assert.equal(row.copy[0].maxCharacters, 40)
  assert.equal(p.site.forms[0].why, 'no newsletter in the brief')
  assert.deepEqual(
    page(p, 'page-about-us').blocks,
    page(before, 'page-about-us').blocks.map((b) => {
      if (b.block !== 'block-190') return b
      const c = structuredClone(b)
      c.lists[0].items[0].copy[1].says = 'what a first tennis lesson is like'
      c.lists[0].items[0].copy[0].maxCharacters = 40
      return c
    })
  )
  assert.equal(out.replacements.length, 9)
  assert.ok(out.replacements.every((r) => r.bytes < 200))
})

test('an entry is added to or removed from a list at a path, or to a section that is a list', () => {
  const before = plan()
  const p = apply([
    { section: 'mainMenu', add: true, with: { page: 'page-classes_advanced-boxing' } },
    { section: 'site', add: 'footerMenu.0.pages', with: 'page-classes' },
    { section: 'mainMenu', remove: '0' },
    { section: 'site', remove: 'notFound.leadsTo' },
    { page: 'page-home', remove: 'story.0' }
  ]).plan
  assert.deepEqual(p.mainMenu, [...before.mainMenu.slice(1), { page: 'page-classes_advanced-boxing' }])
  assert.deepEqual(p.site.footerMenu[0].pages, [...before.site.footerMenu[0].pages, 'page-classes'])
  assert.equal(Object.hasOwn(p.site.notFound, 'leadsTo'), false)
  assert.deepEqual(page(p, 'page-home').story, [])
})

test('an edit at a path that is not there, or at an id, is refused and nothing is applied', () => {
  const cases = [
    [{ section: 'site', field: 'footerMenu.9.heading', with: {} }, /footerMenu.9 is not a position/],
    [{ section: 'site', field: 'nowhere.says', with: 'x' }, /nowhere does not exist/],
    [{ section: 'site', field: 'language.code', with: 'x' }, /language is not an object or list/],
    [{ section: 'site', field: '', with: 'x' }, /no path/],
    [{ section: 'site', field: '__proto__.x', with: 'x' }, /no path/],
    [{ page: 'page-home', field: 'id', with: 'page-x' }, /cannot replace the page id/],
    [{ slot: 'block-190.0', remove: 'slot' }, /cannot remove the slot id/],
    [{ section: 'site', add: true, with: {} }, /section site, which is not a list/],
    [{ section: 'site', add: 'footerMenu', with: [{}] }, /not a list/],
    [{ section: 'site', remove: true }, /a section cannot be removed/],
    [{ section: 'mainMenu', field: '0', with: [] }, /another type/]
  ]
  for (const [change, reason] of cases) {
    const out = applyChanges(plan(), { changes: [change] })
    assert.equal(out.ok, false, JSON.stringify(change))
    assert.match(out.reason, reason, JSON.stringify(change))
  }
})

test('a large replacement that is mostly unchanged is flagged; a small one, or new content, is not', () => {
  const pages = plan().pages
  pages[0].why = 'the start page every visitor sees'
  const wasteful = apply([{ section: 'pages', with: pages }])
  const [only] = wasteful.replacements
  assert.ok(only.bytes > LARGE_REPLACEMENT_BYTES, `${only.bytes}`)
  assert.ok(only.unchangedBytes > only.bytes * 0.9, `${only.unchangedBytes} of ${only.bytes}`)
  assert.deepEqual(oversizedReplacements(wasteful.replacements), [only])
  const message = smallEditsMessage(oversizedReplacements(wasteful.replacements))
  assert.match(message, /change 0 replaces section pages: \d+\.\d KB, of which \d+\.\d KB is unchanged/)
  assert.match(message, /"field", "add" or "remove"/)
  assert.doesNotMatch(message, /[\u2014\u2013]/)

  const block = page(plan(), 'page-about-us').blocks.find((b) => b.block === 'block-190')
  const small = apply([{ block: 'block-190', with: { ...block, why: 'changed' } }])
  assert.deepEqual(oversizedReplacements(small.replacements), [])

  const fresh = plan()
  const empty = { ...plan(), pages: [] }
  const out = applyChanges(empty, { changes: [{ section: 'pages', with: fresh.pages }] })
  assert.equal(out.ok, true, out.reason)
  assert.equal(out.replacements[0].unchangedBytes, 0)
  assert.deepEqual(oversizedReplacements(out.replacements), [])
})
