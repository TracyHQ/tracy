import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBrief, validateBrief } from '../domain/brief.mjs'
import { readBusiness } from '../src/business-reading.js'

const bakery = {
  name: 'Willow Bakery',
  trade: 'food',
  bio: 'Order a cake through WhatsApp. Cakes for celebrations.',
  label: 'Order a cake',
  channel: 'whatsapp',
  quote: 'Order a cake through WhatsApp.',
  profile: {
    phone: '+44 7700 900123',
    phoneWhatsapp: true,
    provenance: { phone: { source: 'website' } }
  },
  href: 'https://wa.me/447700900123'
}
const dental = {
  name: 'Meadow Dental',
  trade: 'health',
  bio: 'Book an appointment through our contact page. Dental examinations.',
  label: 'Book an appointment',
  channel: 'contact',
  quote: 'Book an appointment through our contact page.',
  profile: {},
  href: null
}

async function research(c, action) {
  let request
  const reading = await readBusiness({
    bio: c.bio,
    name: c.name,
    trade: c.trade,
    door: {
      state: 'ready',
      door: { url: 'https://model.test/chat', key: 'fictional-key', model: 'fictional-model' }
    },
    charge: (_spec, call) => call(),
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body)
      return Response.json({ choices: [{ message: { content: JSON.stringify({ primaryAction: action }) } }] })
    }
  })
  const brief = buildBrief({
    opportunity: { id: 'fictional-action', name: c.name, candidate: { trade: c.trade } },
    profile: { name: c.name, bio: c.bio, ...c.profile, businessReading: reading },
    madeAt: '2026-10-29T10:00:00Z'
  })
  return { reading, brief, request }
}

for (const c of [bakery, dental]) {
  test(`${c.trade}: the business reading supplies one conversion action with its real channel to the brief`, async () => {
    const { brief, request } = await research(c, {
      label: c.label,
      channel: c.channel,
      basis: 'sourced',
      quotes: [{ quote: c.quote, ref: 'bio' }],
      href: 'https://invented-destination.test/book'
    })
    assert.deepEqual(brief.primaryAction, {
      label: c.label,
      channel: c.channel,
      href: c.href,
      basis: 'sourced',
      evidence: [{ quote: c.quote, source: { kind: 'bio', ref: 'bio' } }]
    })
    assert.match(request.messages[0].content, /primaryAction/)
    assert.equal(validateBrief(brief).ok, true)
  })
}

test('a neutral action inferred by the same model is marked for the build notes', async () => {
  const c = { ...dental, bio: 'Dental examinations and hygiene treatments.' }
  const { brief } = await research(c, {
    label: 'Request an appointment',
    channel: 'contact',
    basis: 'inferred',
    quotes: []
  })
  assert.deepEqual(brief.primaryAction, {
    label: 'Request an appointment',
    channel: 'contact',
    href: null,
    basis: 'inferred',
    evidence: []
  })
  assert.equal(validateBrief(brief).ok, true)
})

test('a model cannot invent a booking destination or use an unverified WhatsApp channel', async () => {
  for (const channel of ['booking', 'whatsapp']) {
    const { brief } = await research(dental, {
      label: dental.label,
      channel,
      basis: 'sourced',
      quotes: [{ quote: dental.quote, ref: 'bio' }],
      href: 'https://invented-destination.test/book'
    })
    assert.equal(brief.primaryAction.channel, 'contact')
    assert.equal(brief.primaryAction.href, null)
    assert.equal(brief.primaryAction.label, dental.label)
  }
})

test('invented evidence, review-only purchase claims and generic primary words are refused', async () => {
  for (const action of [
    {
      label: dental.label,
      channel: 'contact',
      basis: 'sourced',
      quotes: [{ quote: 'Free surgery today', ref: 'bio' }]
    },
    {
      label: dental.label,
      channel: 'contact',
      basis: 'sourced',
      quotes: [{ quote: dental.quote, ref: 'review:1' }]
    },
    { label: 'Learn more', channel: 'contact', basis: 'inferred', quotes: [] },
    { label: 'Contact', channel: 'contact', basis: 'inferred', quotes: [] },
    { label: 'Contact!', channel: 'contact', basis: 'inferred', quotes: [] },
    { label: 'Learn more.', channel: 'contact', basis: 'inferred', quotes: [] },
    {
      label: 'Book free surgery',
      channel: 'contact',
      basis: 'sourced',
      quotes: [{ quote: dental.quote, ref: 'bio' }]
    }
  ]) {
    const { brief } = await research(dental, action)
    assert.equal(brief.primaryAction, undefined)
  }
})

test('a persisted action cannot redirect the visitor to an endpoint absent from the brief', async () => {
  const { brief } = await research(dental, {
    label: dental.label,
    channel: 'contact',
    basis: 'sourced',
    quotes: [{ quote: dental.quote, ref: 'bio' }]
  })
  for (const action of [
    { ...brief.primaryAction, href: 'https://invented-destination.test/book' },
    { ...brief.primaryAction, channel: 'booking', href: 'https://invented-destination.test/book' },
    { ...brief.primaryAction, channel: 'phone', href: 'tel:+447700900999' }
  ])
    assert.equal(validateBrief({ ...brief, primaryAction: action }).ok, false)
})

test('an omitted conversion label is explicit incomplete research, with no generic replacement', async () => {
  const { brief } = await research(dental, undefined)
  assert.equal(brief.primaryAction, undefined)
  assert.equal(brief.primaryActionReason, 'not_proposed')
  assert.ok(brief.missing.some((m) => m.field === 'primaryAction' && /research/i.test(m.why)))
})

for (const [reason, firstAction] of [
  ['not_proposed', undefined],
  ['rejected', { label: 'Contact!', channel: 'contact', basis: 'inferred', quotes: [] }]
]) {
  test(`research again recovers a ${reason} primary action instead of reusing incomplete reading`, async () => {
    let calls = 0
    const valid = { label: 'Request an appointment', channel: 'contact', basis: 'inferred', quotes: [] }
    const input = {
      bio: dental.bio,
      trade: dental.trade,
      door: {
        state: 'ready',
        door: { url: 'https://model.test/chat', key: 'fictional-key', model: 'fictional-model' }
      },
      charge: (_spec, call) => call(),
      fetchImpl: async () => {
        const action = calls++ === 0 ? firstAction : valid
        return Response.json({
          choices: [{ message: { content: JSON.stringify({ primaryAction: action }) } }]
        })
      }
    }
    const incomplete = await readBusiness(input)
    assert.equal(incomplete.primaryActionReason, reason)
    assert.equal(calls, 1, 'one research invocation makes at most one model call')
    const recovered = await readBusiness({ ...input, held: incomplete })
    assert.equal(calls, 2, 'an explicit research request reads the incomplete selection again')
    assert.equal(recovered.primaryAction.label, valid.label)
    const cached = await readBusiness({ ...input, held: recovered })
    assert.equal(calls, 2, 'a valid selection keeps the successful reading cache')
    assert.deepEqual(cached.primaryAction, recovered.primaryAction)
  })
}
