// The review parts of the plan card (#575, the card the owner reviewed): key messages with the sections that carry
// them, how customers reach the business, what every page shares, each page's intent and what the owner can take off
// by the kit's locks, the standard pages, what is not on the site in groups (what the owner removed apart, with Bring
// back), what came from each source, and what can be sent later. Every business here is invented.
//
//   node --test --test-concurrency=1 packages/core/tracy-core/test/build-chat-plan-review-parts.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planCardOf } from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

function reviewPlan() {
  const plan = stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
  plan.keyMessages = [
    { id: 'km-coaching', label: 'Coaching for every level' },
    { id: 'km-courts', label: 'Courts to hire by the hour' }
  ]
  const home = plan.pages[0]
  home.keyMessage = 'Find a class and book a first lesson.'
  home.visitorQuestion = 'Is there a class for my level?'
  home.seo = {
    searchTerms: ['tennis lessons', 'court hire'],
    titleIntent: 'Tennis club with classes',
    ownerAdded: ['court hire']
  }
  home.blocks[0].carries = ['km-coaching']
  home.blocks[1].carries = ['km-coaching', 'km-courts']
  home.blocks[1].message = 'Lead with the classes.'
  home.blocks.push({
    id: 'h5',
    type: 'footer',
    block: 'footer-main',
    source: 'template',
    label: 'Footer',
    data: ['name', 'phone'],
    reason: 'Every page ends here.'
  })
  home.endAction = { block: 'h4', factIds: ['phone'] }
  plan.primaryAction = { factIds: ['phone'] }
  plan.later = [
    {
      code: 'later_prices',
      what: 'Your prices',
      reason: 'Send your prices and they can be shown with what you offer.'
    }
  ]
  plan.leftOut.push(
    {
      what: '3 videos',
      kind: 'feature',
      reason: 'Your design has no place for it.',
      code: 'no_place_in_design',
      params: { count: 3, known: 4 }
    },
    {
      what: '2 picture spots of people',
      kind: 'feature',
      reason: 'No people pictures are created.',
      code: 'no_generated_people',
      params: { count: 2 }
    },
    {
      what: 'Coaches',
      kind: 'page',
      reason: 'You took this off the plan.',
      code: 'owner_removed',
      params: { removal: 'removal-5' }
    }
  )
  return plan
}

const LOCKS = {
  pages: { contact: 'privacy_page' },
  blocks: { h1: 'main_block', h4: 'end_action' },
  facts: { phone: 'main_button' },
  minItems: { h2: 3 }
}

test('key messages say the sections that carry them, page by page', () => {
  const card = planCardOf(reviewPlan())
  assert.deepEqual(
    card.keyMessages.map((m) => [m.id, m.field, m.carriedBy.map((c) => [c.page, c.blocks.map((b) => b.id)])]),
    [
      ['km-coaching', 'keyMessages[km-coaching].label', [['home', ['h1', 'h2']]]],
      ['km-courts', 'keyMessages[km-courts].label', [['home', ['h2']]]]
    ]
  )
})

test('reach: the main button and where it shows, the end of a page, the footer channels', () => {
  const card = planCardOf(reviewPlan(), {
    review: { count: 0, canRevert: false, removals: [], locks: LOCKS }
  })
  assert.deepEqual(
    card.reach.primary.map((f) => [f.id, f.places.map((p) => p.section.id)]),
    [['phone', ['h4', 'h5']]]
  )
  assert.deepEqual(
    card.reach.ends.map((e) => [e.page, e.section.id, e.facts.map((f) => f.id)]),
    [['home', 'h4', ['phone']]]
  )
  const phone = card.reach.channels.find((c) => c.id === 'phone')
  assert.equal(phone.footerPages, 1)
  // The main button uses the phone: no trash, the gate would refuse it.
  assert.equal(phone.removable, false)
})

test('what every page shares is said once; the footer is no section of any page', () => {
  const card = planCardOf(reviewPlan())
  assert.deepEqual(
    card.site.footer.map((f) => f.id),
    ['name', 'phone']
  )
  assert.equal(
    card.sitePages[0].sections.some((s) => s.id === 'h5'),
    false
  )
  assert.equal(
    card.pages[0].blocks.some((b) => b.id === 'h5'),
    true
  )
})

test('trash follows the locks: first page, privacy page, main and end sections, items down to the kit minimum', () => {
  const review = {
    count: 1,
    canRevert: true,
    removals: [{ id: 'removal-5', op: 'remove-page', target: { page: 'coaches' } }],
    locks: LOCKS
  }
  const card = planCardOf(reviewPlan(), { review })
  const page = (id) => card.sitePages.find((p) => p.id === id)
  assert.equal(page('home').removable, false)
  assert.equal(page('contact').removable, false)
  assert.equal(page('about').removable, true)
  const home = page('home')
  const section = (id) => home.sections.find((s) => s.id === id)
  assert.equal(section('h1').removable, false)
  assert.equal(section('h4').removable, false)
  assert.equal(section('h2').removable, true)
  // Four services and a minimum of three: one more can come off.
  assert.deepEqual(
    section('h2').items.map((i) => [i.id, i.removable]),
    [
      ['s1', true],
      ['s2', true],
      ['s3', true],
      ['s4', true]
    ]
  )
  assert.deepEqual(
    section('h2').carries.map((c) => c.id),
    ['km-coaching', 'km-courts']
  )
  assert.equal(section('h2').message, 'Lead with the classes.')
  assert.equal(home.keyMessage, 'Find a class and book a first lesson.')
  assert.deepEqual(home.seo, {
    searchTerms: ['tennis lessons', 'court hire'],
    titleIntent: 'Tennis club with classes',
    ownerAdded: ['court hire']
  })
  // Without locks (an older server) nothing is offered.
  const bare = planCardOf(reviewPlan())
  assert.equal(bare.locked, true)
  assert.equal(
    bare.sitePages.some((p) => p.removable || p.sections.some((s) => s.removable)),
    false
  )
})

test('not on the site: what the owner removed apart with Bring back, the other lines by group, people spots counted', () => {
  const review = {
    count: 1,
    canRevert: true,
    removals: [{ id: 'removal-5', op: 'remove-page', target: { page: 'coaches' } }],
    locks: LOCKS
  }
  const card = planCardOf(reviewPlan(), { review })
  assert.deepEqual(card.notOnSite.removed, [
    { removal: 'removal-5', what: 'Coaches', kind: 'page', details: 0, restorable: true }
  ])
  assert.equal(
    card.leftOut.some((l) => l.code === 'owner_removed'),
    false
  )
  assert.equal(card.notOnSite.peopleSpots, 2)
  const video = card.leftOut.findIndex((l) => l.code === 'no_place_in_design')
  assert.deepEqual(card.leftOut[video].params, { count: 3, known: 4 })
  assert.ok(card.notOnSite.groups.find((g) => g.group === 'no_place').lines.includes(video))
  // Every line is in exactly one group.
  const listed = card.notOnSite.groups.flatMap((g) => g.lines).sort()
  assert.deepEqual(
    listed,
    card.leftOut.map((_, i) => i)
  )
})

test('sources: what each kind of source gave and what of it is on the site; later entries by code', () => {
  const card = planCardOf(reviewPlan())
  const google = card.sources.find((s) => s.kind === 'google')
  assert.deepEqual(google.items, [{ kind: 'quote', got: 6, shown: 6 }])
  assert.deepEqual(
    google.facts.map((f) => f.id),
    ['address']
  )
  assert.deepEqual(
    card.later.map((e) => e.code),
    ['later_prices']
  )
})

test('a fact kept on the card that no page shows is marked as not on the site (#575 C3)', () => {
  const plan = reviewPlan()
  for (const page of plan.pages) for (const b of page.blocks) b.data = b.data.filter((id) => id !== 'hours')
  plan.leftOut.push({
    what: 'Opening hours',
    kind: 'item',
    item: 'hours',
    reason: 'Your design has no place for it.',
    code: 'no_place_in_design'
  })
  const card = planCardOf(plan)
  // Opening hours are a kind the card always keeps: the row stays, marked as not on the site.
  assert.equal(card.facts.find((f) => f.id === 'hours')?.offSite, true)
  assert.equal(card.facts.find((f) => f.id === 'phone')?.offSite, undefined)
})

test('every removal the draft can bring back has its line, and each line carries the codes the card translates by', () => {
  const plan = reviewPlan()
  // A section and a "send later" entry the owner removed: their left out entries carry their codes.
  plan.leftOut.push(
    {
      what: 'Services',
      kind: 'block',
      reason: 'You took this off the plan.',
      code: 'owner_removed',
      params: { section: 'services', removal: 'removal-6' }
    },
    {
      what: 'Your booking link',
      kind: 'feature',
      reason: 'You took this off the plan.',
      code: 'owner_removed',
      params: { later: 'later_booking_link', removal: 'removal-7' }
    }
  )
  const review = {
    count: 5,
    canRevert: true,
    removals: [
      { id: 'removal-5', op: 'remove-page', target: { page: 'coaches' } },
      { id: 'removal-6', op: 'remove-block', target: { block: 'h2', page: 'home' } },
      { id: 'removal-7', op: 'remove-later', target: { later: 'later_booking_link' } },
      // A service another page still shows, and a phone the contact section still shows: no left out entry.
      { id: 'removal-8', op: 'remove-item', target: { item: 's1', page: 'home', block: 'h2' } },
      { id: 'removal-9', op: 'remove-channel', target: { fact: 'phone' } }
    ],
    locks: LOCKS
  }
  const removed = planCardOf(plan, { review }).notOnSite.removed
  assert.deepEqual(
    removed.map((l) => l.removal),
    ['removal-5', 'removal-6', 'removal-7', 'removal-8', 'removal-9']
  )
  assert.ok(removed.every((l) => l.restorable))
  const by = Object.fromEntries(removed.map((l) => [l.removal, l]))
  assert.equal(by['removal-6'].section, 'services')
  assert.equal(by['removal-7'].later, 'later_booking_link')
  assert.deepEqual([by['removal-8'].what, by['removal-8'].dataKind], ['Adult coaching', 'service'])
  assert.deepEqual([by['removal-9'].what, by['removal-9'].factKind], ['Phone', 'contact.phone'])
})

test('a "send later" removal stored before its entry carried the code takes it from its record (#575 stand)', () => {
  const plan = reviewPlan()
  plan.leftOut.push({
    what: 'Your prices',
    kind: 'feature',
    reason: 'You took this off the plan.',
    code: 'owner_removed',
    params: { removal: 'removal-6' }
  })
  const review = {
    count: 1,
    canRevert: true,
    removals: [{ id: 'removal-6', op: 'remove-later', target: { later: 'later_prices' } }],
    locks: LOCKS
  }
  const [line] = planCardOf(plan, { review }).notOnSite.removed
  assert.deepEqual([line.removal, line.what, line.later], ['removal-6', 'Your prices', 'later_prices'])
})
