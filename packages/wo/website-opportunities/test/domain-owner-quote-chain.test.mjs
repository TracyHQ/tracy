// The whole chain for a fact only the owner typed (decision D46, #609): the statement in, the reading's first quote
// reworded (the recorded run's shape), its one owner quote retry quoting exactly, then the service in the reading, the
// brief, the needs profile research, the profile and the plan data, with source "Your answer", and no owner sentence
// word for word in any name field. An invented climbing hall and scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-quote-chain.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as domain from '../domain/index.mjs'
import { validateBrief } from '../domain/brief.mjs'
import { comparable } from '../domain/business-reading.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { researchOf } from '../domain/needs-research.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { makeSiteBrief } from '../src/brief-research.js'
import { readBusiness } from '../src/business-reading.js'
import {
  CLUB_LABEL,
  FIRST_ANSWER,
  HALL_NAME,
  HALL_PAGES,
  HALL_STATEMENT,
  RETRY_ANSWER
} from './fixtures/owner-statement/climbing-hall.mjs'

const DOOR = {
  state: 'ready',
  door: { url: 'https://model.example.test/chat/completions', key: 'k', model: 'fake-model', effort: 'off' }
}

async function reading(answers) {
  let n = 0
  const fetchImpl = async () => {
    const answer = answers[Math.min(n, answers.length - 1)]
    n += 1
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 }
      })
    }
  }
  return readBusiness({
    name: HALL_NAME,
    websitePages: HALL_PAGES,
    ownerStatement: HALL_STATEMENT,
    door: DOOR,
    charge: (_spec, call) => call(),
    fetchImpl,
    log: { warn() {} }
  })
}

const briefOf = (read) =>
  makeSiteBrief(
    domain,
    {
      profile: { name: HALL_NAME, businessReading: read },
      brand: {},
      sources: [{ source: 'website', ref: HALL_PAGES[0].url, status: 'complete' }],
      media: [],
      posts: []
    },
    {
      opportunity: { id: 'opp-hall', name: HALL_NAME, trade: 'fitness' },
      madeAt: '2026-11-15T10:00:00.000Z'
    }
  )

/** The owner's sentences, folded as a quote is compared. */
const SENTENCES = HALL_STATEMENT.split(/(?<=\.)\s+/).map((s) => comparable(s.replace(/\.$/, '')))
const holdsSentence = (value) =>
  typeof value === 'string' && SENTENCES.some((s) => comparable(value).includes(s))

test('a fact only the owner typed reaches the plan data as "Your answer", never as the owner sentence', async () => {
  const read = await reading([FIRST_ANSWER, RETRY_ANSWER])
  const fromOwner = read.services.filter((s) => s.source.kind === 'owner-statement')
  assert.deepEqual(
    fromOwner.map((s) => s.label),
    [CLUB_LABEL],
    'in the reading'
  )

  const brief = briefOf(read)
  assert.deepEqual(validateBrief(brief).errors ?? [], [])
  const inBrief = brief.reading.services.filter((s) => s.source?.kind === 'owner-statement')
  assert.deepEqual(
    inBrief.map((s) => s.label),
    [CLUB_LABEL],
    'in the brief'
  )
  assert.deepEqual(
    brief.reading.ownerItemsDropped.map((d) => [d.group, d.why, d.retry]),
    [
      ['services', 'quote_not_found', 'kept'],
      ['uspThemes', 'quote_not_found', 'kept']
    ],
    'the first drop is on the record, with no label'
  )
  assert.equal(brief.reading.ownerQuoteRetry, 'done')

  const research = researchOf(brief)
  const owner = research.sources.find((s) => s.id === 'owner-statement')
  assert.equal(owner.origin, 'answer')
  assert.deepEqual(
    owner.items.map((i) => i.fields['offering.name']),
    [CLUB_LABEL],
    'in the needs profile research'
  )

  const profile = needsProfileOf(research, { items: [] })
  const club = (profile.items.service ?? []).find((i) => i.fields['offering.name']?.value === CLUB_LABEL)
  assert.ok(club, 'in the profile')
  assert.deepEqual(club.fields['offering.name'].sources, ['owner-statement'])

  const data = planDataOf(profile)
  const item = data.items.find((i) => i.label === CLUB_LABEL)
  assert.ok(item, 'in the plan data')
  assert.deepEqual(item.sources, [{ kind: 'answer', name: 'Your answer' }])

  const names = [
    ...read.services.map((s) => s.label),
    ...brief.reading.services.map((s) => s.label),
    ...research.sources.flatMap((s) => (s.items ?? []).map((i) => i.fields['offering.name'])),
    ...Object.values(profile.items).flatMap((group) =>
      group.flatMap((i) =>
        Object.entries(i.fields)
          .filter(([k]) => k.endsWith('.name'))
          .map(([, f]) => f.value)
      )
    ),
    ...data.items.map((i) => i.label)
  ]
  assert.deepEqual(names.filter(holdsSentence), [], 'no owner sentence word for word in a name field')
})

test('without the retry the fact is still on the record with why, in the reading and the brief', async () => {
  const read = await reading([FIRST_ANSWER, { services: [] }])
  assert.deepEqual(
    read.services.filter((s) => s.source.kind === 'owner-statement'),
    []
  )
  const brief = briefOf(read)
  assert.deepEqual(validateBrief(brief).errors ?? [], [])
  assert.deepEqual(
    brief.reading.ownerItemsDropped.map((d) => [d.group, d.why, d.retry]),
    [
      ['services', 'quote_not_found', 'rejected'],
      ['uspThemes', 'quote_not_found', 'rejected']
    ]
  )
  assert.equal(JSON.stringify(brief.reading.ownerItemsDropped).includes(CLUB_LABEL), false)
})
