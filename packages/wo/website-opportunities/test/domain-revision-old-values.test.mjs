// A kept block that quotes a value the revision changed is written again (ticket #599, `revision-old-values.mjs` in
// `revisionImpactOf`), on the invented florist built on the real JA Boxing kit: a writer once named a service in a
// block that does not show it; the service is renamed; that block is written again (`old_text_in_copy`), whatever form
// the old name took in the kept words. Search texts that quote it send the page whole. A short or common old value
// matches too, with a reason that says the match was weak. A kept model reply naming an old value is asked again. What
// the revision takes off the site is listed (`removals`). Invented data only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-revision-old-values.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { revisionImpactOf, removalsOf } from '../domain/revision-impact.mjs'
import { isWeakOldValue, oldTextHitsOf } from '../domain/revision-old-values.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
const SERVICE = 'service-wild-meadow-bouquet'
const OLD = 'Wild meadow bouquet'
const kit = { blockStore: site.aiq.blockStore, library: site.aiq.library, mapping: site.aiq.mapping }
const copyOf = () => ({ pages: structuredClone(site.build.writers.map((w) => w.page)), prompt: null })
const base = () => ({
  plan: structuredClone(site.build.approval.plan),
  profile: structuredClone(site.build.approval.profile)
})
const rename = (draft) => {
  draft.plan.items.find((i) => i.id === SERVICE).label = 'Hedgerow bouquet'
  draft.profile.items.service.find((s) => s.id === SERVICE).fields['offering.name'].value = 'Hedgerow bouquet'
  draft.plan.revision += 1
  return draft
}
/** A kept writer field on a page none of whose blocks shows the service: the writer quoted it from elsewhere. */
function quotingField(copy) {
  const showing = new Set(
    site.build.approval.plan.pages
      .filter((p) => p.blocks.some((b) => b.data.includes(SERVICE)))
      .map((p) => p.id)
  )
  const page = copy.pages.find((p) => !showing.has(p.id) && p.fields.some((f) => f.from === 'writer'))
  return { page, field: page.fields.find((f) => f.from === 'writer') }
}
const impactOf = (copy, next = rename(base()), replies = []) =>
  revisionImpactOf({ previous: { ...base(), copy, replies }, next, ...kit })

test('a kept block quoting the renamed service in any form is written again; the same words without it are kept', () => {
  const clean = impactOf(copyOf())
  for (const form of [
    OLD,
    'wild MEADOW bouquet',
    'Wild&nbsp;meadow bouquet',
    'wild-meadow-bouquet',
    'W&iacute;ld meadow bouquet'
  ]) {
    const copy = copyOf()
    const { page, field } = quotingField(copy)
    field.value = `Fresh stems daily. Ask for our ${form}.`
    const impact = impactOf(copy)
    const block = field.key.split('/')[0]
    assert.ok(!clean.blocks.some((b) => b.page === page.id && b.block === block), form)
    assert.deepEqual(
      impact.blocks.find((b) => b.page === page.id && b.block === block)?.reasons,
      ['old_text_in_copy'],
      form
    )
    assert.ok(
      impact.write.some((w) => w.page === page.id && w.reasons.includes('blocks')),
      form
    )
    assert.ok(!impact.reuse.includes(page.id), form)
    assert.ok(!impact.unaffected.some((u) => u.page === page.id && u.block === block), form)
  }
})

test('search texts quoting an old value send the page whole', () => {
  const copy = copyOf()
  const { page } = quotingField(copy)
  page.seo = { title: `${OLD} and more`, description: 'Flowers.' }
  const impact = impactOf(copy)
  assert.ok(impact.write.find((w) => w.page === page.id).reasons.includes('old_text_in_copy'))
})

test('a short or common old value is matched all the same, its reason says the match was weak', () => {
  assert.ok(isWeakOldValue('$5'))
  assert.ok(isWeakOldValue('Posy'))
  assert.ok(!isWeakOldValue(OLD))
  assert.ok(!isWeakOldValue('+1 555 0100 214'))
  const kept = new Map([
    ['plans', { fields: [{ key: 'plans-b3/paragraph', from: 'writer', value: 'From $5 a stem.' }] }]
  ])
  const [hit] = oldTextHitsOf(kept, ['$5'])
  assert.equal(hit.blocks.get('plans-b3'), 'old_text_in_copy:short')
  assert.deepEqual(oldTextHitsOf(kept, ['$50']), [])
})

test('a kept model reply that names an old value is asked again; the others are replayed', () => {
  const replies = [
    { key: 'a'.repeat(64), reply: JSON.stringify({ labels: [`${OLD} on the counter`] }) },
    { key: 'b'.repeat(64), reply: JSON.stringify({ labels: ['Buckets of stems'] }) }
  ]
  assert.deepEqual(impactOf(copyOf(), rename(base()), replies).staleReplies, ['a'.repeat(64)])
  assert.deepEqual(
    impactOf(
      copyOf(),
      (() => {
        const d = base()
        d.plan.revision += 1
        return d
      })(),
      replies
    ).staleReplies,
    []
  )
})

test('what the revision takes off the site: a page, a block, an emptied block list, an item the build made a record for', () => {
  const before = base().plan
  const after = structuredClone(before)
  after.pages = after.pages.filter((p) => p.id !== 'class-2')
  after.pages[0].blocks = after.pages[0].blocks.filter((b) => b.id !== 'home-b6')
  after.pages[0].blocks.find((b) => b.id === 'home-b4').data = []
  after.items = after.items.filter((i) => i.id !== 'service-wedding-table-set')
  const ops = [{ key: 'article:service-wedding-table-set', kind: 'article.create' }]
  const removals = removalsOf(before, after, ops)
  assert.deepEqual(removals.pages, ['class-2'])
  assert.deepEqual(
    removals.blocks.map((b) => `${b.block}:${b.why}`),
    ['home-b4:data:emptied', 'home-b6:block:removed']
  )
  assert.deepEqual(removals.items, ['service-wedding-table-set'])
  // An item the build made no record for (a review quote) leaves the plan with nothing to take off the site.
  assert.deepEqual(removalsOf(before, after, []).items, [])
})
