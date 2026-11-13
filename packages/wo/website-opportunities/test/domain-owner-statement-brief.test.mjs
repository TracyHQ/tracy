// A whole brief made from a reading that read the owner's chat statement (decision D46): its services name what the
// owner said they offer, and no sentence of the statement stands word for word in the brief or the brief the writer
// reads. Harbour Sport Club fixture (fictional) plus an invented statement; no model call.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-statement-brief.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as domain from '../domain/index.mjs'
import { renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { echoSentencesOf, echoesOwner } from '../domain/owner-statement.mjs'
import { makeSiteBrief } from '../src/brief-research.js'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const STATEMENT =
  'We started the club as three friends who coach on weekends. Every junior gets a free racket fitting before the first lesson. ' +
  'We also run beach fitness bootcamps at sunrise for adults.'
const ANSWER = {
  services: [
    { name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' },
    {
      name: 'Beach fitness bootcamps',
      quote: 'run beach fitness bootcamps at sunrise for adults',
      ref: 'owner'
    }
  ],
  audience: [{ label: 'adults', quote: 'bootcamps at sunrise for adults', ref: 'owner' }],
  story: [
    {
      text: 'three friends who coach',
      quote: 'started the club as three friends who coach on weekends',
      ref: 'owner'
    }
  ],
  facts: [
    {
      text: 'free racket fitting for juniors',
      quote: 'Every junior gets a free racket fitting',
      ref: 'owner'
    }
  ],
  keyMessages: [
    {
      label: 'free racket fitting',
      quotes: [{ quote: 'Every junior gets a free racket fitting before the first lesson.', ref: 'owner' }]
    }
  ]
}

function brief() {
  const sources = readingSourcesOf({
    bio: HSC.profile.bio,
    posts: HSC.posts,
    reviews: HSC.profile.googlePlace.reviews.map((r) => ({ ...r, source: 'google' })),
    ownerStatement: STATEMENT
  })
  const reading = { method: 'model', ...checkBusinessReading(ANSWER, sources, { trade: 'fitness' }) }
  return makeSiteBrief(
    domain,
    {
      profile: { ...HSC.profile, businessReading: reading },
      brand: HSC.brand,
      sources: [
        { source: 'instagram', ref: 'https://www.instagram.com/harbour.sportclub/', status: 'complete' }
      ],
      media: HSC.media,
      posts: HSC.posts
    },
    { opportunity: HSC.opportunity, madeAt: HSC.madeAt }
  )
}

test('the brief names the service the owner stated and holds none of the statement word for word', () => {
  const made = brief()
  assert.deepEqual(validateBrief(made).errors ?? [], [])
  assert.ok(made.reading.services.some((s) => s.label === 'Beach fitness bootcamps'))
  assert.ok(made.reading.story.every((i) => i.source.kind !== 'owner-statement'))
  const sentences = echoSentencesOf(STATEMENT)
  assert.equal(sentences.length, 3)
  // Everything the brief says outside its facts' evidence (research records, never shown).
  const { facts: _facts, ...rest } = made
  const texts = []
  const walk = (v) => {
    if (typeof v === 'string') texts.push(v)
    else if (v && typeof v === 'object') for (const inner of Object.values(v)) walk(inner)
  }
  walk(rest)
  assert.deepEqual(
    texts.filter((t) => echoesOwner(t, sentences)),
    []
  )
  const markdown = renderBriefMarkdown(made)
  assert.equal(echoesOwner(markdown, sentences), false)
})
