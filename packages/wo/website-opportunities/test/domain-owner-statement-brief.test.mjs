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
import { copiesOwner, ownerEchoOf } from '../domain/owner-echo.mjs'
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

test('the brief names the service the owner stated and copies no run of four words of the statement', () => {
  const made = brief()
  assert.deepEqual(validateBrief(made).errors ?? [], [])
  assert.ok(made.reading.services.some((s) => s.label === 'Beach fitness bootcamps'))
  assert.ok(made.reading.story.every((i) => i.source.kind !== 'owner-statement'))
  const echo = ownerEchoOf([STATEMENT])
  assert.equal(echo.sentences.length, 3)
  // The owner's facts arrive (D46): the story line and the fact read from the statement are facts to write from.
  assert.deepEqual(
    made.reading.ownerFacts.map((f) => [f.kind, f.group, f.text]),
    [
      ['owner-fact', 'story', 'three friends who coach'],
      ['owner-fact', 'facts', 'free racket fitting for juniors'],
      ['owner-fact', 'keyMessages', 'free racket fitting']
    ]
  )
  // Everything the brief says outside its evidence: the facts' evidence and the owner's facts (research, never copy).
  const {
    facts: _facts,
    reading: { ownerFacts: _ownerFacts, ...reading },
    ...rest
  } = made
  rest.reading = reading
  const texts = []
  const walk = (v) => {
    if (typeof v === 'string') texts.push(v)
    else if (v && typeof v === 'object') for (const inner of Object.values(v)) walk(inner)
  }
  walk(rest)
  assert.deepEqual(
    texts.filter((t) => copiesOwner(t, echo)),
    []
  )
  // The whole markdown is too long for the in-order rule (any long text holds most small words in order): runs only.
  // The owner's facts are listed apart, marked never to be quoted; everything else holds no run of the owner's words.
  const markdown = renderBriefMarkdown(made)
  const [copy, owned] = markdown.split(/^- What the owner states in the build chat.*$/mu)
  assert.match(markdown, /never these words, never as a quote/)
  assert.ok(owned.includes('"three friends who coach"'))
  const after = owned
    .split('\n')
    .filter((l) => !l.startsWith('  - '))
    .join('\n')
  assert.notEqual(copiesOwner(`${copy}\n${after}`, echo).rule, 'run')
})
