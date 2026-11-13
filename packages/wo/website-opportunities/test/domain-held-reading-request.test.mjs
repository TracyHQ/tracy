// No held person reaches the business reading's model in a script written without spaces or by first name alone, and
// a common word stays a word (#609, decision D46): the exact request bodies of both reading calls are read back from a
// scripted fake model. The held business name's stand-in drops copy that writes it and nothing a real service is
// called. Invented studios and people only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-held-reading-request.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HELD_NAME_STAND_IN, withoutStandIn } from '../domain/reading-held-passages.mjs'
import { readBusiness, readingInputOf } from '../src/business-reading.js'

const DOOR = {
  state: 'ready',
  door: { url: 'https://model.example.test/x', key: 'k', model: 'fake', effort: 'off' }
}

/** Both calls of a reading (the reading, then the one USP retry), each request body as sent. */
async function bodiesOf(input) {
  const bodies = []
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 }
      })
    }
  }
  await readBusiness({ ...input, door: DOOR, charge: (_s, call) => call(), fetchImpl, log: { warn() {} } })
  return bodies.map((b) => b.messages.map((m) => m.content).join('\n'))
}

const input = (profile, captions, ownerStatement, people) =>
  readingInputOf({
    profile,
    google: null,
    collected: [
      { source: 'instagram', collected: { posts: captions.map((caption, n) => ({ id: `p${n}`, caption })) } }
    ],
    ownerStatement,
    withheld: { people }
  })

test('a held person written in Han, Japanese, Thai or Korean with no space reaches neither call (B1)', async () => {
  for (const [name, bio, caption, statement, kept] of [
    [
      '山田花子',
      '陶芸教室。講師は山田花子です。',
      '山田花子先生の教室は毎週土曜日',
      '山田花子が教えます。2009年から営業しています。',
      '2009年から営業しています'
    ],
    [
      '王芳',
      '陶艺课。王芳老师每天上课。',
      '王芳老师的课很好',
      '王芳老师每天上课。我们周末营业。',
      '我们周末营业'
    ],
    ['สมชาย', 'สอนปั้นดินเผา', 'ครูสมชายสอนทุกวัน', 'ครูสมชายสอนทุกวัน\nเปิดทุกวันเสาร์', 'เปิดทุกวันเสาร์'],
    [
      '김민지',
      '도자기 수업',
      '김민지가 가르칩니다.',
      '김민지가 가르칩니다. 토요일에 엽니다.',
      '토요일에 엽니다'
    ]
  ]) {
    const bodies = await bodiesOf(input({ name: 'Invented Kiln', bio }, [caption], statement, [name]))
    assert.equal(bodies.length, 2, name)
    for (const body of bodies) assert.equal(body.includes(name), false, `${name} in a request`)
    assert.ok(bodies[0].includes(kept), `${name}: the rest of the statement still reaches the model`)
  }
})

test("a held person's first name alone reaches neither call; a common word stays a word", async () => {
  const bodies = await bodiesOf(
    input(
      { name: 'Invented Kiln', bio: 'Pottery classes. Ask Brannoch about raku nights.' },
      ['Rose bouquets for the open day! Our rose glaze is back.'],
      'Brannoch leads the evening raku firings. We fire twice a week.',
      ['Brannoch Vey', 'Rose Tan']
    )
  )
  for (const body of bodies) assert.doesNotMatch(body, /brannoch/i)
  assert.match(bodies[0], /We fire twice a week/)
  assert.match(bodies[0], /Rose bouquets for the open day! Our rose glaze is back/)
})

test('the stand-in is a token no real copy writes: a service called "Business name registration" stays (B6)', () => {
  assert.equal(HELD_NAME_STAND_IN, '[business-name-held]')
  const read = {
    services: [
      { label: 'Business name registration' },
      { label: 'Signs printed with your business name' },
      { label: 'Logo design for [business-name-held]' },
      { label: 'Signs for business-name-held vans' }
    ],
    keyMessages: [{ label: 'We register business names fast' }],
    uspThemes: [{ label: 'vans', line: 'Your business name on every van' }]
  }
  const out = withoutStandIn(read)
  assert.deepEqual(
    out.services.map((s) => s.label),
    ['Business name registration', 'Signs printed with your business name']
  )
  assert.equal(out.keyMessages.length, 1)
  assert.equal(out.uspThemes.length, 1)
  assert.deepEqual(out.standInDropped, [
    { group: 'services', field: 'label', why: 'writes_held_name_stand_in' },
    { group: 'services', field: 'label', why: 'writes_held_name_stand_in' }
  ])
})
