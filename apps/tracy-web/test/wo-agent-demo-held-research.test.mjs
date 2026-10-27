// The agent demo's research bundle carries no held review and no held business name (#1791, 28/10/2026): the brief
// already leaves them out, but the bundle the demo agent pages through was the raw research, so a business reading quote
// of a held review, a raw source's review naming a held person and the Google name the brief holds could still reach
// the agent. Every name and text here is fictional (Harbour Sport Club style fixture).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AGENT_DEMO,
  agentDemoPrompt,
  bundlePart,
  checkedResearch,
  demoInstructions,
  freezeAgentResearch,
  ownSiteInstructions
} from '../src/opportunities-build/agent-demo.js'

const HELD_NAME = 'Lagoon Racquet Corner'
const NEUTRAL = 'Padel coaching club in Marina Bay'
const HELD_PERSON = 'Coach Tarik'
const HELD_TEXT = 'Coach Tarik is patient and kind with the kids'
const HELD_AUTHOR_TEXT = 'Booked a second block of lessons straight away'
const NAME_REVIEW_TEXT = 'Lagoon Racquet Corner has the best courts around'
const USABLE_TEXT = 'Lovely clean courts and friendly staff'
const OWNER_QUOTE = 'Padel lessons for every level, every evening'

const businessReading = {
  services: [
    { label: 'Kids lessons', quote: HELD_TEXT, source: { kind: 'review', author: 'Reviewer Mona' } },
    { label: 'Evening lessons', quote: OWNER_QUOTE, source: { kind: 'bio' } }
  ],
  audience: [
    { label: 'Families', quote: HELD_AUTHOR_TEXT, source: { kind: 'review', author: 'Reviewer Mona' } }
  ],
  team: [{ label: HELD_PERSON, quote: HELD_TEXT, source: { kind: 'review', author: 'Reviewer Mona' } }],
  story: [],
  keyMessages: [
    {
      message: 'Patient coaching',
      quotes: [{ quote: HELD_TEXT, source: { kind: 'review', author: 'Reviewer Mona' } }]
    },
    { message: 'Every level', quotes: [{ quote: OWNER_QUOTE, source: { kind: 'bio' } }] }
  ],
  subTrade: {
    id: 'padel',
    quotes: [{ quote: NAME_REVIEW_TEXT, source: { kind: 'review', author: 'Reviewer Sami' } }]
  }
}

function heldRevision() {
  const bundle = freezeAgentResearch({
    accountId: 'a',
    opportunityId: 'o',
    revisionId: 'r',
    at: '2026-10-28',
    read: {
      opportunity: { id: 'o', name: HELD_NAME },
      profile: {
        name: HELD_NAME,
        bio: OWNER_QUOTE,
        businessReading,
        reviewSources: {
          tripadvisor: {
            attribution: 'Tripadvisor',
            reviews: [
              { author: 'Reviewer Mona', text: HELD_AUTHOR_TEXT, url: 'https://trip.example/r/1' },
              { author: 'Reviewer Lee', text: USABLE_TEXT, url: 'https://trip.example/r/2' }
            ]
          }
        }
      },
      brand: { origin: 'social', logo: 'logo-1', social: { name: 'lagoon.racquet' } },
      rawSources: [
        {
          id: 'google',
          source: 'google',
          data: {
            displayName: { text: HELD_NAME },
            websiteUri: 'https://lagoon-racquet.example/',
            reviews: [
              { authorAttribution: { displayName: 'Reviewer Mona' }, text: { text: HELD_TEXT } },
              { author: 'Reviewer Sami', text: NAME_REVIEW_TEXT },
              { author: 'Reviewer Lee', text: USABLE_TEXT }
            ]
          }
        }
      ],
      posts: [{ id: 'p1', caption: `Summer camp at ${HELD_NAME} starts Monday` }],
      media: [{ id: 'logo-1', kind: 'image' }]
    }
  })
  return {
    id: 'r',
    account_id: 'a',
    cms: 'wordpress',
    template: { quickstart: 'wp-tracy-business' },
    brief: {
      quickstartWorkflow: AGENT_DEMO,
      agentDemoSnapshot: bundle,
      // A brief stored before the brief named the business by its neutral identity still carries the held name here.
      business: { name: HELD_NAME, phone: '+971 50 000 4321', trade: 'fitness' },
      facts: [
        {
          id: 'fact_name',
          field: 'name',
          value: HELD_NAME,
          onSite: false,
          reasons: ['name-differs-from-own-marks']
        }
      ],
      missing: [
        {
          field: 'team',
          why: 'Named only in guest reviews.',
          withheld: [{ source: 'reviews', values: [HELD_PERSON] }]
        }
      ],
      sitemap: [{ slug: 'home', title: 'Home', sections: [], seo: { title: NEUTRAL } }]
    }
  }
}

/** Everything the demo agent can read: the bundle, every part it pages through, and the prompts it is given. */
function agentReadable(revision) {
  const research = checkedResearch(revision)
  const parts = [
    'catalogue',
    'profile',
    'menu',
    'brand',
    'sources',
    'posts',
    'media',
    'reviews',
    'ratings'
  ].map((part) => bundlePart(research, part, 0, 50))
  const pages = (research.sources ?? []).map((_, i) => bundlePart(research, 'sources', i, 20, 0))
  return [
    JSON.stringify(research),
    JSON.stringify(parts),
    JSON.stringify(pages),
    agentDemoPrompt(revision),
    demoInstructions(revision),
    ownSiteInstructions(revision)
  ].join('\n')
}

test('no held review text and no held reviewer quote reach the demo agent', () => {
  const readable = agentReadable(heldRevision())
  assert.ok(!readable.includes(HELD_TEXT), 'a review naming a held person is in the agent research')
  assert.ok(!readable.includes(HELD_AUTHOR_TEXT), "a held review's author is quoted in the agent research")
  // The held person stays named only where the bundle marks them held.
  const research = checkedResearch(heldRevision())
  assert.deepEqual(research.heldPeople, [HELD_PERSON])
  const { heldPeople: _held, ...rest } = research
  const reading = JSON.stringify(rest.profile.businessReading)
  assert.ok(!reading.includes(HELD_TEXT), reading)
})

test('the held business name reaches the demo agent nowhere but where it is marked held', () => {
  const revision = heldRevision()
  const readable = agentReadable(revision)
  assert.ok(!readable.includes(HELD_NAME), 'the held business name is in the agent research or prompt')
  assert.ok(!readable.includes(NAME_REVIEW_TEXT), 'a review printing the held name is offered verbatim')
  const research = checkedResearch(revision)
  assert.deepEqual(research.nameHeld, { missing: 'name', reasons: ['name-differs-from-own-marks'] })
  // Owner words and a usable review stay as collected; the neutral identity stands where the held name was.
  const reviews = bundlePart(research, 'reviews', 0, 50).items.map((r) => r.review.text)
  assert.ok(reviews.includes(USABLE_TEXT), JSON.stringify(reviews))
  assert.equal(research.profile.bio, OWNER_QUOTE)
  assert.equal(research.profile.name, NEUTRAL)
  assert.equal(research.posts[0].caption, `Summer camp at ${NEUTRAL} starts Monday`)
  assert.equal(research.counts.reviews, reviews.length)
  assert.equal(
    research.hash,
    revision.brief.agentDemoSnapshot.hash,
    'the bundle still traces to what was frozen'
  )
})

test('counter-case: nothing held, the bundle the agent reads is the research as frozen', () => {
  const revision = heldRevision()
  revision.brief.facts = [{ ...revision.brief.facts[0], onSite: true, reasons: ['research-evidence'] }]
  revision.brief.missing = []
  const research = checkedResearch(revision)
  const { hash: _h, ...frozen } = revision.brief.agentDemoSnapshot
  const { hash: _h2, ...read } = research
  assert.deepEqual(read, frozen)
  assert.ok(JSON.stringify(research).includes(HELD_TEXT))
})
