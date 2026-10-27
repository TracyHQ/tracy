import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  cleanCaption,
  countryOf,
  messageLanguage,
  postLanguage
} from 'website-opportunities/src/message-language.js'
import { outreachContacts, outreachMessage, withOutreach } from 'website-opportunities/src/outreach.js'
import { createTracyWoHost } from '../src/wo-host.js'
import { fileDb, writeAsHistory } from './_db.mjs'

const woHost = createTracyWoHost()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const posts = [
  {
    caption:
      'Homemade spaghetti with fresh tomatoes and basil, served daily in our restaurant. Come for lunch with your friends.'
  },
  {
    caption:
      'Join us for dinner this evening. Enjoy delicious food and a warm welcome from our friendly restaurant team.'
  },
  {
    caption:
      'Our kitchen is open for breakfast, lunch and dinner every day. Visit us for freshly prepared meals and coffee.'
  }
]

test('the library detects clear English posts before the restaurant’s Vietnamese phone fallback', () => {
  assert.equal(messageLanguage({ posts, candidate: { phone: '+84 300 000063' } }).language, 'en')
  assert.equal(messageLanguage({ posts, candidate: { phone: '+84 300 000063' } }).source, 'posts')
  assert.equal(countryOf({ phone: '+84 300 000063' }), 'VN')
})

test('insufficient captions use country; multilingual or unknown countries use English', () => {
  assert.deepEqual(messageLanguage({ posts: posts.slice(0, 2), candidate: { phone: '+84 300 000063' } }), {
    language: 'vi',
    source: 'country',
    country: 'VN'
  })
  for (const country of ['CA', 'CH', 'BE', 'SG', 'IN', 'PY'])
    assert.equal(messageLanguage({ candidate: { country } }).language, 'en')
  assert.equal(messageLanguage({}).language, 'en')
  assert.equal(
    countryOf(
      { phone: '+84 1' },
      { googlePlace: { addressComponents: [{ types: ['country'], shortText: 'TH' }] } }
    ),
    'TH'
  )
  assert.equal(countryOf({ phone: '0300000063' }), null, 'a national number has no country evidence')
})

test('confidence, margin and per-caption agreement must all pass; unsupported detected languages use English', () => {
  assert.equal(
    postLanguage(posts, () => [{ lang: 'vi', accuracy: 0.79 }]),
    null
  )
  assert.equal(
    postLanguage(posts, () => [
      { lang: 'vi', accuracy: 0.85 },
      { lang: 'th', accuracy: 0.7 }
    ]),
    null
  )
  let n = 0
  assert.equal(
    postLanguage(posts, () =>
      ++n === 1 ? [{ lang: 'vi', accuracy: 1 }] : [{ lang: n === 2 ? 'vi' : 'en', accuracy: 1 }]
    ),
    null
  )
  assert.deepEqual(
    messageLanguage({ posts, candidate: { country: 'VN' } }, () => [{ lang: 'ar', accuracy: 1 }]),
    { language: 'en', detectedLanguage: 'ar', source: 'posts', confidence: 1, agreement: 1, captions: 3 }
  )
  assert.match(cleanCaption('𝓒𝓪𝓯𝓮́ ở Hội An 🍜 https://example.test/x @someone #food'), /ở Hội An/)
  assert.doesNotMatch(
    cleanCaption('Welcome 🍜 https://example.test/x @someone #food'),
    /http|someone|food|🍜/
  )
})

test('all 12 message templates render; bilingual drafts sign once and never claim unsupported facts', () => {
  for (const language of ['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es', 'th', 'ja', 'ko', 'id']) {
    const m = outreachMessage({
      place: 'Pho Ba',
      url: 'https://demo.example',
      expiresAt: '2030-11-02T00:00:00Z',
      signature: 'Lee Nguyen',
      language
    })
    assert.match(m.auto, /https:\/\/demo.example/)
    assert.equal(m.auto.split('Lee Nguyen').length - 1, 1)
    assert.doesNotMatch(m.auto, /\{place\}|\{url\}|\{expires\}/)
    assert.equal(m.local === null, language === 'en')
    if (language !== 'en') assert.equal(m.auto.indexOf(m.local.replace(/\n\nLee Nguyen$/, '')), 0)
  }
})

test('only the place’s known contacts are offered and unsafe chat links are dropped', () => {
  const contacts = outreachContacts(
    {
      phone: '+84 1',
      contacts: {
        zalo: '+84901234567',
        whatsapp: 'https://wa.me/84901234567',
        messenger: 'https://m.me/phoba',
        line: 'javascript:alert(1)'
      },
      socials: { instagram: 'https://www.instagram.com/phoba' }
    },
    { emails: ['hello@phoba.example', 'hello@phoba.example', 'bad'] }
  )
  assert.deepEqual(
    contacts.map((c) => c.channel),
    ['phone', 'email', 'whatsapp', 'zalo', 'messenger', 'instagram']
  )
  assert.equal(contacts.find((c) => c.channel === 'instagram').value, '@phoba')
  assert.equal(outreachContacts({ contacts: { messenger: 'https://m.me.evil.example/hi' } }).length, 0)
})

test(
  'outreach is read-only, scoped to the owner, and unavailable before QA or after freezing',
  opts,
  async () => {
    const pool = db.pool
    const a = (
      await pool.query(
        "insert into account(email,display_name) values ('outreach@test.example','Lee Nguyen') returning id"
      )
    ).rows[0].id
    const b = (
      await pool.query(
        "insert into account(email,display_name) values ('foreign@test.example','Someone Else') returning id"
      )
    ).rows[0].id
    const id = (
      await pool.query(
        "insert into wo_opportunity(account_id,name,provider,provider_id) values ($1,'Pho Ba','url','phoba') returning id",
        [a]
      )
    ).rows[0].id
    await pool.query(
      "insert into wo_source(opportunity_id,source,status,collected) values ($1,'facebook','complete',$2)",
      [id, JSON.stringify({ posts })]
    )
    const row = {
      id,
      name: 'Pho Ba',
      candidate: { phone: '+84 1' },
      demo: { qa: 'passed', url: 'https://demo.example', expiresAt: null }
    }
    const before = (await pool.query('select count(*)::int as n from wo_demo_action')).rows[0].n
    const draft = (await withOutreach(pool, a, [row], woHost))[0].outreach
    assert.equal(draft.messageLanguage.language, 'en')
    assert.match(draft.message.auto, /Lee Nguyen$/)
    assert.equal(
      (await withOutreach(pool, a, [{ ...row, demo: { ...row.demo, qa: 'pending' } }], woHost))[0].outreach,
      null
    )
    assert.equal(
      (
        await withOutreach(
          pool,
          a,
          [{ ...row, demo: { ...row.demo, frozenAt: new Date().toISOString() } }],
          woHost
        )
      )[0].outreach,
      null
    )
    const other = (await withOutreach(pool, b, [row], woHost))[0].outreach
    assert.equal(other, null, 'foreign opportunities and their research are never read')
    assert.equal((await pool.query('select count(*)::int as n from wo_demo_action')).rows[0].n, before)
  }
)

test(
  'outreach uses the published shared snapshot with the caller’s overlay, including its country facts',
  opts,
  async () => {
    const { pool } = db
    const account = (
      await pool.query(
        "insert into account(email,display_name) values('snapshot@test.example','Mai') returning id"
      )
    ).rows[0].id
    const place = (await pool.query("insert into wo_place(display_name) values('Shared cafe') returning id"))
      .rows[0].id
    const snapshot = (
      await pool.query(
        "insert into wo_place_snapshot(place_id,state,published_at) values($1,'preparing',now()) returning id",
        [place]
      )
    ).rows[0].id
    await pool.query('update wo_place set current_snapshot_id=$2 where id=$1', [place, snapshot])
    const opp = (
      await pool.query(
        "insert into wo_opportunity(account_id,place_id,name,provider,provider_id,candidate) values($1,$2,'My cafe','osm','snapshot','{}') returning id",
        [account, place]
      )
    ).rows[0].id
    await pool.query('insert into wo_place_snapshot_profile(snapshot_id,profile) values($1,$2::jsonb)', [
      snapshot,
      JSON.stringify({ googlePlace: { addressComponents: [{ types: ['country'], shortText: 'TH' }] } })
    ])
    await pool.query(
      "insert into wo_place_snapshot_source(snapshot_id,source,ref,status,collected) values($1,'instagram','https://instagram.com/shared','complete',$2::jsonb)",
      [snapshot, JSON.stringify({ posts })]
    )
    await pool.query("update wo_place_snapshot set state='published' where id=$1", [snapshot])
    const row = {
      id: opp,
      name: 'My cafe',
      candidate: { phone: '+84 1234' },
      demo: { qa: 'passed', url: 'https://demo.example/', expiresAt: null }
    }
    const [result] = await withOutreach(pool, account, [row], woHost)
    assert.equal(result.outreach.messageLanguage.language, 'en')
    assert.equal(result.outreach.messageLanguage.source, 'posts')
    // Stands in for a place whose posts were never collected (published sources are immutable, schema 0004).
    await writeAsHistory(pool, "update wo_place_snapshot_source set collected='{}' where snapshot_id=$1", [
      snapshot
    ])
    const [fallback] = await withOutreach(pool, account, [row], woHost)
    assert.equal(
      fallback.outreach.messageLanguage.language,
      'th',
      'Google country beats the private phone fallback'
    )
    assert.equal(fallback.outreach.message.auto.split('Mai').length - 1, 1)
  }
)
