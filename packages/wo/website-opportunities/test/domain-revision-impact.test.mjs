// Which pages a plan revision sends to the writer again (ticket #599, `revisionImpactOf`), on the invented florist built
// on the real JA Boxing kit (`fixtures/draft-write/boxing-site.mjs`): a renamed service reaches exactly the pages and
// blocks whose plan data shows it; a changed phone the blocks that show the phone; the site name every page; a held
// person every page whose kept words name them, in any form; nothing changed, nothing. Completeness: every page whose
// writer request changed is written again, whatever the edit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-revision-impact.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writerContextOf, writerRequestsOf } from '../domain/page-writer-context.mjs'
import { withoutWithheld, withWithheld } from '../domain/plan-withheld.mjs'
import { revisionImpactOf } from '../domain/revision-impact.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
const SERVICE = 'service-wild-meadow-bouquet'
const kit = { blockStore: site.aiq.blockStore, library: site.aiq.library, mapping: site.aiq.mapping }
const previous = () => ({
  plan: structuredClone(site.build.approval.plan),
  profile: structuredClone(site.build.approval.profile),
  copy: { pages: site.build.writers.map((w) => w.page), prompt: site.build.writers[0].prompt }
})
const revised = (edit) => {
  const next = {
    plan: structuredClone(site.build.approval.plan),
    profile: structuredClone(site.build.approval.profile)
  }
  edit(next)
  next.plan.revision += 1
  return next
}
const impactOf = (next, prev = previous()) => revisionImpactOf({ previous: prev, next, ...kit })
const pagesOf = (impact) => impact.write.map((w) => w.page)
/** The pages and blocks whose plan data names `id`, and hold a copy field. */
function showing(plan, id) {
  const requests = writerRequestsOf(plan, writerContextOf({ profile: site.build.approval.profile, ...kit }))
  const blocks = []
  for (const page of plan.pages)
    for (const block of page.blocks)
      if (block.data.includes(id) && requests.get(page.id)?.blocks.some((b) => b.id === block.id))
        blocks.push({ page: page.id, block: block.id })
  return blocks
}
const rename = ({ plan, profile }) => {
  plan.items.find((i) => i.id === SERVICE).label = 'Hedgerow bouquet'
  profile.items.service.find((s) => s.id === SERVICE).fields['offering.name'].value = 'Hedgerow bouquet'
}

test('a renamed service sends exactly the pages and blocks that show it to the writer, each block naming it', () => {
  const impact = impactOf(revised(rename))
  const shown = showing(site.build.approval.plan, SERVICE)
  assert.deepEqual(
    impact.blocks.map(({ page, block }) => ({ page, block })),
    shown
  )
  for (const block of impact.blocks) assert.ok(block.reasons.includes(`data:${SERVICE}`))
  assert.deepEqual(pagesOf(impact), [...new Set(shown.map((b) => b.page))])
  for (const page of impact.write) assert.deepEqual(page.reasons, ['blocks'])
  const all = writerRequestsOf(
    site.build.approval.plan,
    writerContextOf({ profile: site.build.approval.profile, ...kit })
  )
  assert.equal(impact.reuse.length + impact.write.length, all.size)
  assert.ok(impact.reuse.length > 0)
})

test('a changed fact reaches the blocks that show it; the site name every page; nothing changed, nothing', () => {
  const phone = impactOf(
    revised(({ plan, profile }) => {
      plan.facts.find((f) => f.id === 'contact-phone').value = '+1 555 0100 377'
      profile.facts['contact.phone'][0].value = '+1 555 0100 377'
    })
  )
  assert.ok(phone.blocks.length > 0)
  for (const block of phone.blocks)
    assert.ok(block.reasons.includes('data:contact-phone'), JSON.stringify(block))
  const named = impactOf(
    revised(({ plan }) => {
      plan.facts.find((f) => f.id === 'business-name').value = 'Larkspur Stems'
    })
  )
  assert.equal(named.reuse.length, 0)
  for (const page of named.write) assert.ok(page.reasons.includes('site:name'))
  const nothing = impactOf(revised(() => {}))
  assert.deepEqual(nothing.write, [])
  assert.deepEqual(nothing.blocks, [])
})

test('a person held after the build: every page whose kept words name them is written again', () => {
  const prev = previous()
  const contact = prev.copy.pages.find((p) => p.id === 'contact')
  const paragraph = contact.fields.find((f) => f.from === 'writer')
  paragraph.value = `Ask Wenna Clout about ${paragraph.value}`
  const held = impactOf(
    revised((next) => {
      next.profile = withWithheld(next.profile, { withheld: { people: ['Wenna Clout'] } })
    }),
    prev
  )
  assert.ok(held.write.find((w) => w.page === 'contact').reasons.includes('held_text_in_copy'))
  // A slug of the held name in kept words is caught too.
  contact.fields.find((f) => f.from === 'writer').value = 'See wenna-clout on our page'
  assert.ok(
    impactOf(
      revised((next) => {
        next.profile = withWithheld(next.profile, { withheld: { people: ['Wenna Clout'] } })
      }),
      prev
    ).write.some((w) => w.page === 'contact')
  )
})

test('no kept copy writes every page; another prompt too; an added page is written, a removed one named', () => {
  const prev = previous()
  prev.copy = null
  const full = impactOf(
    revised(() => {}),
    prev
  )
  assert.deepEqual(full.full, { why: 'previous_copy_missing' })
  assert.equal(full.reuse.length, 0)
  const other = revisionImpactOf({
    previous: previous(),
    next: revised(() => {}),
    ...kit,
    promptSha256: 'f'.repeat(64)
  })
  assert.ok(other.write.every((w) => w.reasons.includes('prompt_changed')))
  const moved = impactOf(
    revised(({ plan }) => {
      const page = structuredClone(plan.pages.find((p) => p.id === 'class-2'))
      page.id = 'class-3'
      for (const b of page.blocks) b.id = b.id.replace('class-2-', 'class-3-')
      plan.pages.push(page)
      plan.pages = plan.pages.filter((p) => p.id !== 'plans')
    })
  )
  assert.ok(moved.write.find((w) => w.page === 'class-3').reasons.includes('page:added'))
  assert.deepEqual(moved.removed, ['plans'])
})

test('completeness: every page whose writer request changed is written again, for every edit', () => {
  const edits = [
    rename,
    ({ plan }) => {
      plan.pages.find((p) => p.id === 'contact').name = 'Find the shop'
    },
    ({ plan }) => {
      plan.pages
        .flatMap((p) => p.blocks)
        .find((b) => b.id === 'classes-b4')
        .data.reverse()
    },
    ({ plan, profile }) => {
      plan.language = 'en-GB'
      profile.language = 'en-GB'
    }
  ]
  for (const edit of edits) {
    const next = revised(edit)
    const ctx = (side) => writerContextOf({ profile: withoutWithheld(side.profile), ...kit })
    const before = writerRequestsOf(site.build.approval.plan, ctx(previous()))
    const after = writerRequestsOf(next.plan, ctx(next))
    const changed = [...after.keys()].filter(
      (id) => JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))
    )
    const impact = impactOf(next)
    assert.deepEqual(pagesOf(impact).sort(), changed.sort())
    assert.ok(changed.length > 0)
  }
})

test('an item id that is a slug of a held name is named data:held in the reasons, never as it is', () => {
  const slugged = (side) => {
    const quote = side.profile.items.quote.find((q) => q.fields['quote.author_name']?.value === 'Wenna Clout')
    const old = quote.id
    quote.id = 'quote-wenna-clout'
    side.plan.items.find((i) => i.id === old).id = quote.id
    for (const block of side.plan.pages.flatMap((p) => p.blocks))
      block.data = block.data.map((d) => (d === old ? quote.id : d))
    return side
  }
  const prev = slugged(previous())
  const next = slugged(revised(() => {}))
  next.profile = withWithheld(next.profile, { withheld: { people: ['Wenna Clout'] } })
  const impact = impactOf(next, prev)
  const reasons = impact.blocks.flatMap((b) => b.reasons)
  assert.ok(reasons.includes('data:held'))
  assert.ok(!JSON.stringify(impact).includes('wenna'))
})
