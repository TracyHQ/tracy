// Where the owner's chat statement goes after the reading (decision D46, #609): its brief field is routed as never
// shown, the brief names it as a source of facts only, the needs profile drops a summary copying it, and it never
// decides the site language. Fictional Harbour Sport Club fixture and invented texts; no model call.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-statement-routes.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as domain from '../domain/index.mjs'
import { renderBriefMarkdown } from '../domain/brief.mjs'
import { BRIEF_ITEM_ROUTES, routeTableErrors, routesOfBrief } from '../domain/brief-item-routes.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { siteLanguageOf } from '../domain/needs-profile-questions.mjs'
import { makeSiteBrief } from '../src/brief-research.js'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const STATEMENT = 'We also run beach fitness bootcamps at sunrise for adults on the north beach.'

function brief() {
  const sources = readingSourcesOf({ bio: HSC.profile.bio, posts: HSC.posts, ownerStatement: STATEMENT })
  const answer = {
    services: [
      { name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' },
      { name: 'Beach bootcamps', quote: 'run beach fitness bootcamps at sunrise', ref: 'owner' }
    ],
    audience: [{ label: 'adults at sunrise', quote: 'at sunrise for adults', ref: 'owner' }]
  }
  const reading = { method: 'model', ...checkBusinessReading(answer, sources, { trade: 'fitness' }) }
  return makeSiteBrief(
    domain,
    {
      profile: { ...HSC.profile, businessReading: reading },
      brand: HSC.brand,
      sources: [],
      media: HSC.media,
      posts: HSC.posts
    },
    { opportunity: HSC.opportunity, madeAt: HSC.madeAt }
  )
}

test('the brief field of the statement is routed as never shown, with why', () => {
  assert.deepEqual(routeTableErrors(), [])
  assert.match(BRIEF_ITEM_ROUTES['fact.ownerStatement'].notShown, /never copy/)
  const made = brief()
  assert.ok(made.facts.some((f) => f.field === 'ownerStatement'))
  const routes = routesOfBrief(made)
  assert.deepEqual(routes.unrouted, [])
  assert.ok(routes.notShown.some((r) => r.kind === 'fact.ownerStatement'))
})

test("the brief names the owner's chat statement as a source of facts only, never as a post", () => {
  const md = renderBriefMarkdown(brief())
  const line = md.split('\n').find((l) => l.trim().startsWith('- "Beach bootcamps", '))
  assert.match(line, /owner's chat statement \(facts only, never copy\)/)
  assert.doesNotMatch(line, /, post/)
  assert.match(
    md,
    /How: read from the owner's chat statement \(facts only, never copy\), the bio, posts and reviews/
  )
})

test('a summary copying the statement goes, however little it changed; a summary in its own words stays', () => {
  const text = 'We run relaxed beach fitness bootcamps at sunrise for adults who want a gentle start.'
  const research = { sources: [{ id: 'owner-statement', origin: 'answer', text }] }
  const description = (d) => {
    const profile = needsProfileOf(research, {
      items: [
        {
          source: 'owner-statement',
          kind: 'service',
          fields: { 'offering.name': 'beach fitness bootcamps', 'offering.description': d },
          evidence: text
        }
      ]
    })
    return profile.items.service[0].fields['offering.description']?.value ?? null
  }
  // 14 of its 15 words, a clause of it, a sentence with only its first word gone: all copies.
  assert.equal(
    description('run relaxed beach fitness bootcamps at sunrise for adults who want a gentle start'),
    null
  )
  assert.equal(description('relaxed beach fitness bootcamps at sunrise for adults'), null)
  assert.equal(
    description('Gentle early morning workouts on the sand for grown ups.'),
    'Gentle early morning workouts on the sand for grown ups.'
  )
})

test('the statement never decides the site language, and alone it leaves none', () => {
  const sources = [
    { id: 'owner-statement', origin: 'answer', language: 'de' },
    { id: 'instagram', origin: 'social', language: 'en' }
  ]
  const both = siteLanguageOf(sources)
  assert.deepEqual([both.value, both.mixed, both.options], ['en', false, ['en']])
  const read = siteLanguageOf(
    [
      { id: 'owner-statement', origin: 'answer' },
      { id: 'google', origin: 'google' }
    ],
    {
      'owner-statement': 'fr',
      google: 'it'
    }
  )
  assert.equal(read.value, 'it')
  const alone = needsProfileOf(
    {
      sources: [
        { id: 'owner-statement', origin: 'answer', language: 'de', text: 'Wir brennen zweimal pro Woche.' }
      ]
    },
    { languages: [{ source: 'owner-statement', language: 'de' }] }
  )
  assert.equal(alone.language.value, null)
})
