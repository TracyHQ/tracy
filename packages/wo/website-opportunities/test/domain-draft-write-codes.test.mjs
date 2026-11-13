// The stops, skip reasons and flags of the draft write plan (ticket #597) that no other test raises: a kit with no
// blank contract, a record kind the write cannot create, the accent and the identity field with no door, two entries
// with other words for one place, the category title, and words with an angle bracket caught by the order check where
// the writer can still redo them. Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-codes.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftWriteCoverage } from '../domain/draft-write-coverage.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { checkWriteOrder, placesOfOrder } from '../domain/write-order-check.mjs'
import { plan, site } from './fixtures/draft-write/guarded.mjs'

const planOf = (order = site.order, aiq = site.aiq) => writePlanOf(order, aiq, { stored: site.stored })
const codeOf = (run) => {
  try {
    run()
  } catch (error) {
    return [error.code, error.noRerun]
  }
  return ['passed']
}

test('kit_missing: a kit with no blank contract slots stops the plan instead of turning every slot guard off', () => {
  for (const blankContract of [undefined, { ...site.aiq.blankContract, slots: [] }])
    assert.deepEqual(
      codeOf(() => planOf(site.order, { ...site.aiq, blankContract })),
      ['kit_missing', true]
    )
})

test('record_kind_unsupported: a created record of a kind the write has no shape for stops the plan', () => {
  const aiq = structuredClone(site.aiq)
  for (const entity of Object.values(aiq.mapping.entities))
    if (entity.created && entity.kind === 'article') entity.kind = 'user'
  assert.deepEqual(
    codeOf(() => planOf(site.order, aiq)),
    ['record_kind_unsupported', true]
  )
})

test('the accent with no declared variables is skipped, not counted written, and flagged', () => {
  const look = plan.ops.find((op) => op.kind === 'look.accent')
  assert.deepEqual(look.entries, [])
  assert.ok(
    plan.skipped.some((s) => s.entry === 'look.accent' && s.reason === 'accent_variables_not_declared')
  )
  assert.ok(plan.unproven.some((u) => u.code === 'accent_variables_not_declared'))
})

test('an identity field with no door is not sent, and flagged identity_field_no_door', () => {
  const identity = plan.ops.find((op) => op.kind === 'site.identity')
  assert.ok(identity.values.every((v) => v.loc.column !== 'fromname'))
  assert.ok(plan.unproven.some((u) => u.code === 'identity_field_no_door' && u.column === 'fromname'))
})

test('two entries with other words for one place: the record own page wins, the loser is a listed conflict', () => {
  const own = plan.conflicts.filter((c) => c.kept === 'own_page')
  assert.ok(own.length > 0)
  const article = plan.ops.find((op) => op.key === 'article:service-wild-meadow-bouquet')
  const entries = article.values.map((v) => v.entry)
  assert.ok(entries.includes('class.class-b3.paragraph-2'), 'the service page own paragraph is written')
  assert.ok(
    !entries.includes('home.home-b5.service-wild-meadow-bouquet.paragraph-2'),
    'the home teaser is not'
  )
  for (const c of plan.conflicts)
    assert.deepEqual(Object.keys(c).sort(), ['by', 'entry', 'kept', 'record', 'written'])
  const coverage = draftWriteCoverage(site.order, plan)
  assert.equal(
    coverage.conflicted,
    new Set(plan.conflicts.filter((c) => !c.written).map((c) => c.entry)).size
  )
  assert.equal(coverage.in, coverage.written + coverage.skipped + coverage.conflicted)
})

test('the category is titled after the list page of its page type, never the home page', () => {
  const category = plan.ops.find((op) => op.kind === 'category.create')
  const list = site.order.pages.find((p) => p.id === 'classes')
  assert.equal(category.fields.title, list.name)
})

test('words with an angle bracket are refused by the order check, where the writer can still redo them', () => {
  for (const words of ['Stems 3 < 5 days', 'Fresh > frozen']) {
    const order = structuredClone(site.order)
    placesOfOrder(order)
      .flatMap(({ place }) => place.fields ?? [])
      .find((e) => e.place === 'home.home-b3.paragraph').value = words
    assert.ok(
      checkWriteOrder(order).some((p) => p.code === 'markup_forbidden'),
      words
    )
  }
})

test('the florist plan raises exactly these skip reasons, flags and operation kinds', () => {
  const set = (values) => [...new Set(values)].sort()
  assert.deepEqual(set(plan.skipped.map((s) => s.reason)), [
    'accent_variables_not_declared',
    'address_shared',
    'derived_drawn_by_template',
    'fact_fanned_out',
    'gallery_own_photos_only',
    'held_block_not_placed',
    'left_empty',
    'menu_item_is_page_item',
    'no_candidate_icon',
    'no_fitting_video',
    'no_generated_people',
    'place_fallback',
    'template_fallback',
    'text_logo_prints_site_name'
  ])
  assert.deepEqual(set(plan.unproven.map((u) => u.code)), [
    'accent_variables_not_declared',
    'created_record_frame',
    'featured_article_needed',
    'identity_field_no_door',
    'menu_item_link_not_declared'
  ])
  assert.deepEqual(set(plan.ops.map((op) => op.kind)), [
    'article.create',
    'category.create',
    'contact.create',
    'contract.apply',
    'library.create',
    'look.accent',
    'menuItem.create',
    'module.assign',
    'module.copy',
    'module.position',
    'picture.upload',
    'site.identity'
  ])
})
