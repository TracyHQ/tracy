import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EDITORIAL_SCHEMA,
  editorialHash,
  editorialInput,
  editorialMarkdown,
  editorialModelView,
  editorialPins,
  emdashEditorialTemplate,
  placeDossier,
  validateEditorialPlan
} from '../src/opportunities-build/editorial.js'
import { askEditorialModel } from '../src/opportunities-build/editorial-model.js'

const seed = {
  defaultLocale: 'en',
  collections: [
    { slug: 'home', fields: [{ slug: 'lead', type: 'text' }] },
    { slug: 'about', fields: [{ slug: 'story', type: 'text' }] }
  ],
  content: {
    home: [{ slug: 'home', data: { lead: 'Sample lead' } }],
    about: [{ slug: 'about', data: { story: 'Sample story' } }]
  }
}
const map = {
  roles: {
    'hero.lead': { collection: 'home', slug: 'home', fields: [{ field: 'lead', from: 'value' }] },
    'about.story': { collection: 'about', slug: 'about', fields: [{ field: 'story', from: 'text' }] }
  }
}
const revision = {
  id: 'revision-a',
  account_id: 'account-a',
  place_snapshot_id: 'snapshot-a',
  brief: {
    business: { name: 'Test cafe', phone: '+12345678' },
    sitemap: [
      {
        sections: [
          {
            evidence: [
              { source: 'profile.bio', quote: 'A neighbourhood cafe.\n\nCoffee and lunch on the terrace.' }
            ]
          }
        ]
      }
    ],
    content: {
      items: [
        {
          id: 'own-story',
          authorship: 'page',
          kinds: ['story'],
          title: 'Our story',
          body: 'We opened this cafe in an old house.'
        },
        {
          id: 'expired',
          authorship: 'page',
          kinds: ['story'],
          temporal: { status: 'past' },
          body: 'Tonight only.'
        },
        { id: 'review', authorship: 'review', kinds: ['story'], body: 'They have a wood-fired oven.' }
      ]
    },
    googlePlace: {
      reviews: [
        { text: 'They have a wood-fired oven.' },
        { text: 'Best flat white in town.', author: 'Lan', googleMapsUri: 'https://maps.test/r1' }
      ]
    }
  }
}
function inputOf() {
  return editorialInput({
    place: placeDossier({ revision, accountId: 'account-a' }),
    template: emdashEditorialTemplate({
      release: 'tracy-base/emdash-0.x',
      version: '0.5.6',
      archiveSha256: 'a'.repeat(64),
      seedSha256: 'b'.repeat(64),
      seed,
      map
    })
  })
}
function planOf(input) {
  return {
    schemaVersion: EDITORIAL_SCHEMA,
    inputHash: input.inputHash,
    understanding: 'The cafe has a terrace and a sourced story.',
    selections: [
      { role: 'hero.lead', passageId: 'profile.bio#p1', reason: 'Describe what a guest can find.' },
      { role: 'about.story', passageId: 'own-story#p0', reason: 'Keep the origin story on About.' }
    ],
    missing: ['No menu was supplied.']
  }
}

test('place input is account scoped, excludes temporal claims, and carries attributed reviews only as testimonials', () => {
  assert.throws(() => placeDossier({ revision, accountId: 'account-b' }), /ACCOUNT_MISMATCH/)
  const input = inputOf()
  assert.deepEqual(
    input.place.sources.map((s) => [s.id, s.roles]),
    [
      ['profile.bio', ['hero.lead', 'about.story']],
      ['own-story', ['about.story']],
      ['review:google:1', ['testimonial']]
    ]
  )
  const review = input.place.sources[2]
  assert.deepEqual(
    [review.body, review.author, review.provider],
    ['Best flat white in town.', 'Lan', 'Google']
  )
  // A review without its author, and a guest's post, are no source at all.
  assert.doesNotMatch(JSON.stringify(input), /wood-fired|Tonight only/)
  assert.equal(input.place.business.phone, '+12345678')
})

test('hash binds the source, overlay, model-visible template and exact archive identity', () => {
  const a = inputOf()
  const b = inputOf()
  b.place.business.phone = '+99999999'
  delete b.inputHash
  assert.notEqual(a.inputHash, editorialHash(b))
  assert.equal(editorialHash({ a: 1, b: 2 }), editorialHash({ b: 2, a: 1 }))
})

test('a map pointing outside the exact seed is refused before a model call', () => {
  const wrong = structuredClone(map)
  wrong.roles['hero.lead'].fields[0].field = 'missing'
  assert.throws(
    () =>
      emdashEditorialTemplate({
        release: 'x',
        version: '1',
        archiveSha256: 'a'.repeat(64),
        seedSha256: 'b'.repeat(64),
        seed,
        map: wrong
      }),
    /GROUP_MISMATCH/
  )
  assert.throws(() => emdashEditorialTemplate({ release: 'x', version: '1', seed, map }), /IDENTITY_MISSING/)
})

test('accepted choices compile exact source spans without changing phone, title or CTA', () => {
  const input = inputOf()
  const checked = validateEditorialPlan(planOf(input), input)
  assert.equal(checked.ok, true)
  const pinned = {
    'hero.title': { value: 'Test cafe', source: 'business.name' },
    'hero.cta': { value: { label: 'Call', href: 'tel:+12345678' }, source: 'business.phone' }
  }
  const result = editorialPins({ accepted: checked.plan, input, pinned })
  assert.equal(result['hero.lead'].value, 'Coffee and lunch on the terrace.')
  assert.deepEqual(result['about.story'].value, {
    title: 'Our story',
    text: 'We opened this cafe in an old house.'
  })
  assert.deepEqual(result['hero.cta'], pinned['hero.cta'])
  assert.deepEqual(result['hero.title'], pinned['hero.title'])
  assert.equal(pinned['hero.lead'], undefined)
  assert.match(editorialMarkdown(checked.plan), /Unplanned: pages, cards, images, navigation/)
})

test('invented, repeated, missing, unsupported and oversized selections fail closed', () => {
  for (const mutate of [
    (p) => {
      p.inputHash = 'other'
    },
    (p) => {
      p.selections[0].passageId = 'invented'
    },
    (p) => {
      p.selections[0].role = 'contact.phone'
    },
    (p) => {
      p.selections.pop()
    },
    (p) => {
      p.selections.push(p.selections[0])
    },
    (p) => {
      p.selections[0].passageId = 'own-story#p0'
    }
  ]) {
    const input = inputOf()
    const plan = planOf(input)
    mutate(plan)
    assert.equal(validateEditorialPlan(plan, input).ok, false)
  }
  const input = inputOf()
  input.template.roles[0].maxCharacters = 3
  const { inputHash: _hash, ...frozen } = input
  input.inputHash = editorialHash(frozen)
  assert.equal(validateEditorialPlan(planOf(input), input).ok, false)
})

test('compiler rederives the text and refuses template changes after planning', () => {
  const input = inputOf()
  const accepted = validateEditorialPlan(planOf(input), input).plan
  accepted.selections[0].value = 'An invented claim.'
  assert.equal(
    editorialPins({ accepted, input, pinned: {} })['hero.lead'].value,
    'Coffee and lunch on the terrace.'
  )
  accepted.template.version = 'new-version'
  assert.throws(() => editorialPins({ accepted, input, pinned: {} }), /INPUT_MISMATCH/)
})

test('reasoning client makes one bounded call and never sends the seed writer disabled-thinking setting', async () => {
  const input = inputOf()
  let calls = 0
  const fetchImpl = async (url, request) => {
    calls++
    assert.equal(url.hostname, 'api.deepseek.com')
    const body = JSON.parse(request.body)
    assert.deepEqual(body.thinking, { type: 'enabled' })
    assert.equal(body.max_tokens, 12000)
    assert.ok(request.signal)
    return Response.json({
      id: 'call-a',
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(planOf(input)) } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 200,
        completion_tokens_details: { reasoning_tokens: 150 }
      }
    })
  }
  const result = await askEditorialModel({
    model: { apiKey: 'test-key', baseUrl: 'https://api.deepseek.com', words: 'test-model' },
    input,
    fetchImpl
  })
  assert.equal(calls, 1)
  assert.equal(result.receipt.usage.completion_tokens_details.reasoning_tokens, 150)
  assert.doesNotMatch(JSON.stringify(result), /test-key/)
})

test('provider errors, truncated reasoning and malformed JSON never become an accepted empty plan', async () => {
  const model = { apiKey: 'test-key', baseUrl: 'https://api.deepseek.com', words: 'test-model' }
  await assert.rejects(askEditorialModel({ model: null, input: {} }), /UNCONFIGURED/)
  for (const [body, expected] of [
    [{ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }, /TRUNCATED/],
    [{ choices: [{ message: { content: '' } }] }, /EMPTY/],
    [{ choices: [{ message: { content: 'not JSON' } }] }, /INVALID_JSON/]
  ])
    await assert.rejects(
      askEditorialModel({ model, input: inputOf(), fetchImpl: async () => Response.json(body) }),
      expected
    )
  await assert.rejects(
    askEditorialModel({
      model,
      input: inputOf(),
      fetchImpl: async () => new Response('secret-key', { status: 401 })
    }),
    /HTTP_401/
  )
})

test('compact model view preserves all candidate paragraphs and constraints without duplicating evidence bodies', () => {
  const input = inputOf()
  const view = editorialModelView(input)
  assert.equal(view.inputHash, input.inputHash)
  assert.deepEqual(view.passages, input.passages)
  assert.deepEqual(view.template.roles, input.template.roles)
  assert.ok(view.place.sources.every((s) => !Object.hasOwn(s, 'body')))
  assert.equal(view.place.assets.count, input.place.assets.length)
  assert.ok(input.place.sources[0].body)
})

test('official website sentences have exact snapshot provenance; promotional pages stay out', () => {
  const place = placeDossier({
    revision,
    accountId: 'account-a',
    websitePages: [
      { url: 'https://cafe.test/menu', title: 'Menu', text: 'We serve lunch. Finish it off with coffee.' },
      { url: 'https://cafe.test/offer', title: 'Offer', text: 'Lunch delivered. 10% off until October.' }
    ]
  })
  const input = editorialInput({ place, template: inputOf().template })
  const website = input.passages.filter((p) => p.sourceId.startsWith('website:'))
  assert.deepEqual(
    website.map((p) => p.text),
    ['We serve lunch.', 'Finish it off with coffee.']
  )
  assert.ok(
    website.every((p) => place.sources.find((s) => s.id === p.sourceId).evidence.snapshotId === 'snapshot-a')
  )
  for (const passage of website) {
    const source = place.sources.find((s) => s.id === passage.sourceId)
    assert.equal(source.body.slice(passage.start, passage.start + passage.text.length), passage.text)
  }
})

test('a template with a testimonial block quotes one collected review whole, with its author and platform (product owner, 26/10/2026)', () => {
  const withQuote = structuredClone(seed)
  withQuote.collections.push({
    slug: 'quote',
    fields: [
      { slug: 'text', type: 'text' },
      { slug: 'name', type: 'string' },
      { slug: 'via', type: 'string' }
    ]
  })
  withQuote.content.quote = [
    { slug: 'quote', data: { text: 'Sample quote', name: 'Jane Demo', via: 'Yelp' } }
  ]
  const quoteMap = structuredClone(map)
  quoteMap.roles.testimonial = {
    collection: 'quote',
    slug: 'quote',
    fields: [
      { field: 'text', from: 'text' },
      { field: 'name', from: 'author' },
      { field: 'via', from: 'provider' }
    ]
  }
  const longReview = structuredClone(revision)
  longReview.brief.googlePlace.reviews[1].text = 'Best flat white in town.\n\nThe terrace is lovely too.'
  const input = editorialInput({
    place: placeDossier({ revision: longReview, accountId: 'account-a' }),
    template: emdashEditorialTemplate({
      release: 'tracy-base/emdash-0.x',
      version: '0.5.6',
      archiveSha256: 'a'.repeat(64),
      seedSha256: 'b'.repeat(64),
      seed: withQuote,
      map: quoteMap
    })
  })
  assert.ok(input.template.roles.some((r) => r.role === 'testimonial'))
  // A review is one passage: its paragraphs are never split from each other or from its author.
  const passages = input.passages.filter((p) => p.sourceId === 'review:google:1')
  assert.deepEqual(
    passages.map((p) => p.text),
    ['Best flat white in town.\n\nThe terrace is lovely too.']
  )
  const plan = planOf(input)
  plan.selections.push({ role: 'testimonial', passageId: passages[0].id, reason: 'A guest’s own words.' })
  const checked = validateEditorialPlan(plan, input)
  assert.equal(checked.ok, true, JSON.stringify(checked.errors))
  const pins = editorialPins({ accepted: checked.plan, input, pinned: {} })
  assert.deepEqual(pins.testimonial.value, {
    text: 'Best flat white in town.\n\nThe terrace is lovely too.',
    author: 'Lan',
    provider: 'Google'
  })
  // A guest's words never lead the home page or tell the business's story.
  const misuse = planOf(input)
  misuse.selections[0].passageId = passages[0].id
  misuse.selections.push({ role: 'testimonial', passageId: null, reason: 'none' })
  assert.equal(validateEditorialPlan(misuse, input).ok, false)
})

test('Tracy Base EmDash: the real seed and map offer the landing page’s quote cards for one review', async () => {
  const { readFileSync } = await import('node:fs')
  const root = new URL('../../../', import.meta.url)
  const realSeed = JSON.parse(
    readFileSync(new URL('packages/cms/tracy-emdash-theme-base/seed/seed.json', root), 'utf8')
  )
  const realMap = JSON.parse(
    readFileSync(new URL('packages/wo/website-opportunities/domain/slot-roles/emdash.json', root), 'utf8')
  ).themes['tracy-base']
  const template = emdashEditorialTemplate({
    release: 'tracy-base/emdash-0.x',
    version: '0.5.6',
    archiveSha256: 'a'.repeat(64),
    seedSha256: realMap.checked.seedSha256,
    seed: realSeed,
    map: realMap
  })
  const role = template.roles.find((r) => r.role === 'testimonial')
  assert.ok(role, 'the testimonial role is offered')
  // The model sees the card as the template has it: a quote, a name and a role line.
  assert.deepEqual(Object.keys(role.sample), ['quote', 'name', 'role'])
  assert.equal(role.sample.name, 'Alex Morgan')
  assert.deepEqual(template.coverage.mappedRoles, ['hero.lead', 'about.story', 'testimonial'])
  // A list the seed no longer has is refused before any model call.
  const renamed = structuredClone(realSeed)
  const landing = renamed.content.landing.find((e) => e.slug === 'landing' && (e.locale ?? 'en') === 'en')
  delete landing.data.testimonials_quotes
  assert.throws(
    () =>
      emdashEditorialTemplate({
        release: 'tracy-base/emdash-0.x',
        version: '0.5.6',
        archiveSha256: 'a'.repeat(64),
        seedSha256: realMap.checked.seedSha256,
        seed: renamed,
        map: realMap
      }),
    /EDITORIAL_TEMPLATE_GROUP_MISMATCH:testimonial/
  )
})
