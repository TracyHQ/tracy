// The brief reaches the host's QA twice: `briefText` with the frozen research (facts a build copied from the
// business's own pages are held), `briefProse` without it (template text is judged against the brief alone: with
// the research's vocabulary, 25 of 30 agency blocks read as the brief's — QuillHaus, 24/10/2026).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGENT_DEMO, freezeAgentResearch } from '../src/opportunities-build/agent-demo.js'
import { briefOf } from '../src/opportunities-build/demo-qa.js'

test('briefOf: an agent demo sends the research with its facts and leaves it out of its prose', () => {
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    at: '2026-10-24T00:00:00Z',
    read: {
      profile: { name: 'QuillHaus', bio: 'We may send you updates about this website.' },
      media: [],
      rawSources: [],
      posts: []
    }
  })
  const brief = briefOf({
    id: 'revision',
    account_id: 'account',
    brief_md: '# QuillHaus Al Barari',
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: bundle, business: { name: 'QuillHaus' } }
  })
  assert.match(brief.briefText, /send you updates about this website/)
  assert.match(brief.briefProse, /# QuillHaus Al Barari/)
  assert.doesNotMatch(brief.briefProse, /send you updates/)
})

test('briefOf: a brief with no research sends the same text twice', () => {
  const brief = briefOf({ brief_md: '# Pho Ba', brief: { business: { name: 'Pho Ba' } } })
  assert.equal(brief.briefProse, brief.briefText)
})

// 🔒 No filler (plan §7, 26/10/2026): the host is told every site language's fillers and approved neutral words.
test('briefOf: sends the domain fillers and neutral words of every site language to the host', async () => {
  const { forbiddenFillers, neutralWords } = await import('website-opportunities/domain')
  const sent = briefOf({ brief: { business: { name: 'Pho Hanoi' } }, brief_md: '' })
  assert.deepEqual(sent.fillers, forbiddenFillers())
  assert.deepEqual(sent.neutralWords, neutralWords())
  assert.ok(sent.fillers.includes('Coming soon'))
  assert.ok(sent.neutralWords.includes('Menu item'))
  assert.ok(sent.fillers.length > forbiddenFillers('en').length, 'other languages travel too')
})

test('briefOf keeps sourced hours after a large media catalogue through the host request boundary', async () => {
  const { demoQaBody, checkFactsFromBrief } = await import('../../tracy-host/src/demo-qa.js')
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    at: '2026-10-26T00:00:00Z',
    read: {
      profile: { name: 'Bakery' },
      media: [],
      posts: [],
      rawSources: [
        {
          source: 'website',
          collected: {
            media: [{ url: 'https://images.example.test/' + 'x'.repeat(410000) }],
            pages: [{ title: 'Visit us', text: 'We open at 8:00AM and close at 8:00PM.' }]
          }
        }
      ]
    }
  })
  const brief = briefOf({
    id: 'revision',
    account_id: 'account',
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: bundle }
  })
  const asked = demoQaBody({ label: 'bakery', platform: 'wordpress', ...brief })
  const result = checkFactsFromBrief([{ path: '/', text: 'Open 8:00AM to 8:00PM.' }], asked)
  assert.equal(result.pass, true)
  assert.equal(checkFactsFromBrief([{ path: '/', text: 'Open until 11PM.' }], asked).pass, false)
  assert.ok(brief.briefText.length < 400000)
})

test('content evidence excludes URLs, provider timestamps and review claims while retaining menu numbers and captions', async () => {
  const { demoFactEvidence, checkedFactText } = await import(
    '../src/opportunities-build/demo-fact-evidence.js'
  )
  const { checkFactsFromBrief } = await import('../../tracy-host/src/demo-qa.js')
  const bundle = {
    hash: 'bundle-hash',
    profile: {
      name: 'Bakery',
      reviews: [{ text: 'Open until 11PM. Only $777.' }],
      rating: 5,
      updatedAt: '2026-10-26T23:00:00Z'
    },
    menu: {
      items: [{ name: 'Cookie', price: 4.75, currency: 'USD', source: { url: 'https://x.test/$999' } }]
    },
    posts: [{ caption: 'Pickup until 8PM.', timestamp: '2026-10-26T22:00:00Z' }],
    sources: [
      {
        id: 'source-21',
        hash: 'source-hash',
        data: {
          collected: {
            pages: [
              {
                url: 'https://x.test/11PM/$888',
                title: 'Bakery',
                text: 'See [our hours](https://x.test/10PM). <a href="https://x.test/9PM">Visit us</a> https://x.test/7PM'
              }
            ],
            reviews: [{ text: 'Open until 6PM.' }],
            media: [{ caption: 'Open until 5PM.' }]
          }
        }
      }
    ]
  }
  const segments = demoFactEvidence(bundle)
  const briefText = checkedFactText('', segments)
  assert.match(briefText, /4\.75/)
  assert.match(briefText, /our hours/)
  assert.match(briefText, /Visit us/)
  assert.doesNotMatch(briefText, /https?:|11PM|10PM|9PM|7PM|6PM|5PM|777|999|888|2026-10/)
  assert.equal(
    checkFactsFromBrief([{ path: '/', text: 'Pickup until 8PM. Cookie $4.75.' }], { briefText }).pass,
    true
  )
  assert.equal(
    checkFactsFromBrief([{ path: '/', text: 'Open until 11PM. Cookie $777.' }], { briefText }).pass,
    false
  )
})

test('exact content segment dedup preserves matcher values, order and every source occurrence', async () => {
  const { demoFactEvidence, checkedFactText } = await import(
    '../src/opportunities-build/demo-fact-evidence.js'
  )
  const { factsIn } = await import('../../tracy-host/src/demo-qa.js')
  const lines = [
    'Open 8 a.m. Monday. Cookie $4.75. Since 1995.',
    'Open 8 a.m. Monday. Cookie $4.95. Since 1995.'
  ]
  const bundle = {
    hash: 'bundle-hash',
    sources: lines.map((text, i) => ({
      id: `source-${i}`,
      hash: `hash-${i}`,
      data: { collected: { pages: [{ text }] } }
    }))
  }
  const segments = demoFactEvidence(bundle)
  const facts = (text) => [...new Set(factsIn(text).map((f) => `${f.kind}:${f.value}`))].sort()
  assert.deepEqual(facts(checkedFactText('', segments)), facts(lines.join('\n')))
  assert.equal(segments[0].text, 'Open 8 a.m.')
  assert.equal(segments[0].occurrences.length, 2)
  assert.deepEqual(
    segments[0].occurrences.map((o) => [o.path, o.part, o.sourceId, o.sourceHash]),
    [
      ['sources[0].data.collected.pages[0].text', 0, 'source-0', 'hash-0'],
      ['sources[1].data.collected.pages[0].text', 0, 'source-1', 'hash-1']
    ]
  )
  assert.ok(segments.some((s) => s.text === 'Cookie $4.75.'))
  assert.ok(segments.some((s) => s.text === 'Cookie $4.95.'))
})

test('oversized complete evidence is refused by web and host instead of silently truncated', async () => {
  const { checkedFactText, QA_EVIDENCE_MAX } = await import(
    '../src/opportunities-build/demo-fact-evidence.js'
  )
  const { demoQaBody } = await import('../../tracy-host/src/demo-qa.js')
  assert.throws(() => checkedFactText('x'.repeat(QA_EVIDENCE_MAX), [{ text: '8PM' }]), {
    code: 'DEMO_QA_EVIDENCE_TOO_LARGE'
  })
  assert.match(
    demoQaBody({
      label: 'bakery',
      platform: 'wordpress',
      workflow: AGENT_DEMO,
      briefText: 'x'.repeat(QA_EVIDENCE_MAX + 1)
    }).error,
    /complete evidence/
  )
})

test('copy and collected-used share complete content evidence beyond the former 100k cutoff', async () => {
  const { copySourced, agentDemoCollected } = await import('../src/opportunities-build/agent-demo.js')
  const { unsourcedFacts } = await import('../src/opportunities-build/demo-copy.js')
  const { demoQaBody, checkCollectedUsed, collectedOf } = await import('../../tracy-host/src/demo-qa.js')
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    at: '2026-10-26T00:00:00Z',
    read: {
      profile: { name: 'Bakery' },
      media: [],
      posts: [],
      rawSources: [
        {
          source: 'website',
          collected: {
            media: [{ url: 'https://x.test/11PM/999' }],
            reviews: [{ text: 'Open 11PM. Email fake@bakery.test.' }],
            pages: [
              {
                text:
                  'x'.repeat(120000) +
                  ' At 245 California Street. Call +14154401234. Open 8AM to 8PM. Email hello@bakery.test.'
              }
            ]
          }
        }
      ]
    }
  })
  const revision = {
    id: 'revision',
    account_id: 'account',
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: bundle }
  }
  const sourced = copySourced(revision)
  assert.ok(sourced.indexOf('8AM') > 100000)
  assert.deepEqual(unsourcedFacts('Open 8AM to 8PM. Email hello@bakery.test.', sourced), [])
  assert.ok(unsourcedFacts('Open 11PM. Email fake@bakery.test.', sourced).length)
  const collected = agentDemoCollected(revision, {})
  assert.equal(collected.collected.sourced, sourced)
  const asked = demoQaBody({ label: 'bakery', platform: 'wordpress', workflow: AGENT_DEMO, ...collected })
  assert.equal(asked.collected.sourced.length, sourced.trim().length)
  assert.deepEqual(
    checkCollectedUsed(
      [
        {
          path: '/',
          text: 'Bakery at 245 California Street. Call +14154401234. Email hello@bakery.test.',
          images: []
        }
      ],
      asked
    ).detail.filter((f) => f.code === 'COLLECTED_UNSOURCED'),
    []
  )
  assert.ok(
    checkCollectedUsed(
      [{ path: '/', text: 'Bakery. Email fake@bakery.test.', images: [] }],
      asked
    ).detail.some(
      (f) => f.code === 'COLLECTED_UNSOURCED' && f.what === 'email' && f.value === 'fake@bakery.test'
    )
  )
  assert.throws(() => collectedOf({ sourced: 'x'.repeat(400001) }), { code: 'DEMO_QA_EVIDENCE_TOO_LARGE' })
  assert.match(
    demoQaBody({
      label: 'bakery',
      platform: 'wordpress',
      workflow: AGENT_DEMO,
      collected: { sourced: 'x'.repeat(400001) }
    }).error,
    /complete evidence/
  )
})
