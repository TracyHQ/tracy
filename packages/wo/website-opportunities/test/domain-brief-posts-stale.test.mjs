// What a page's posts become in the brief: each post is its own fact, kept off the site only when it is more than a
// year older than the research (`fact-assessment.mjs`, `STALE_AFTER_MS`). One old post (a pinned one, say) lists the
// field `posts` in `missing` with that post alone as its withheld value; the recent posts stay on the site.
// An invented bakery; every caption is invented.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBrief } from '../domain/brief.mjs'

const AT = '2026-11-12T08:00:00.000Z'
const DAY = 86_400_000
const CAPTIONS = [
  'Rye week starts Monday with a dark caraway loaf.',
  'Meet the night shift, who shape every croissant by hand before dawn.',
  'Pistachio buns are back on the counter for the weekend.',
  'Our new stone oven arrived and the crust has never been better.',
  'Saturday workshop: learn to feed a starter and bake a country loaf.',
  'Fig and walnut bread, baked only on Thursdays.',
  'Cardamom knots sold out by nine, thank you all.',
  'We now open at seven on weekdays for early coffee.',
  'Banana bread without gluten joins the shelf this month.',
  'Twelve hour fermented focaccia with olives and thyme.',
  'Holiday orders for stollen open next week.',
  'The bakery turns three this autumn, thank you for every visit.'
]

/** Twelve captioned Instagram posts, the first `old` of them (pinned ones) posted 800 days before the research. */
const posts = (old) =>
  CAPTIONS.map((caption, i) => ({
    source: 'instagram',
    id: `90${i}`,
    url: `https://www.instagram.com/p/LB${i}/`,
    caption,
    postedAt: new Date(Date.parse(AT) - (i < old ? 800 : i * 6 + 1) * DAY).toISOString(),
    provider: 'scrapecreators'
  }))

const brief = (old) =>
  buildBrief({
    opportunity: { id: 'o-bakery', name: 'Lantern Bakery', candidate: { trade: 'bakery' } },
    profile: { name: 'Lantern Bakery', socials: { instagram: 'https://www.instagram.com/lantern.bakery/' } },
    sources: [
      {
        source: 'instagram',
        ref: 'https://www.instagram.com/lantern.bakery/',
        status: 'complete',
        collected_at: AT
      }
    ],
    media: [],
    posts: posts(old),
    brand: null,
    madeAt: AT
  })

const postFacts = (b) => b.facts.filter((f) => f.field === 'posts')

test('twelve recent captioned posts: every one is a fact on the site, and posts are not missing', () => {
  const b = brief(0)
  assert.equal(postFacts(b).length, 12)
  assert.ok(postFacts(b).every((f) => f.onSite === true))
  assert.equal(
    b.missing.find((m) => m.field === 'posts'),
    undefined
  )
})

test('three pinned posts older than a year: those three are held as stale, the nine recent ones stay on the site', () => {
  const b = brief(3)
  const facts = postFacts(b)
  assert.deepEqual(
    facts.filter((f) => !f.onSite).map((f) => f.value.text),
    CAPTIONS.slice(0, 3)
  )
  assert.ok(facts.filter((f) => !f.onSite).every((f) => f.reasons.includes('stale')))
  assert.equal(facts.filter((f) => f.onSite).length, 9)
  // The field-level entry the builder reads names the field once; its withheld values are the old posts only.
  const entry = b.missing.find((m) => m.field === 'posts')
  assert.match(entry.why, /\(stale\)/)
  assert.deepEqual(entry.withheld, [{ source: 'instagram', values: CAPTIONS.slice(0, 3) }])
})
