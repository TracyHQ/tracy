// Copy outside the writer speaks the site's one voice (spec TracyHQ/tracy#189, R12 group B; COO criteria 1.3, 1.6, 1.8,
// 5.2), on the released JA Boxing 1.0.8 content map with two fictional businesses of other trades: a climbing wall that
// writes British English and a pottery studio that writes American English.
//   - a sibling group of offering cards falls back as one unit: every card from the business's words, or every card to
//     the writer; a fallback never carries an exclamation mark or a post's slogan;
//   - one style sheet, read once from the brief, is given to every writer, and lines two writers spell differently end
//     in the site's one spelling;
//   - every navigation button names the page it leads to; every contact or booking button leads to the Contact page or
//     the business's own channel, and says which;
//   - the final check reads every visible text node for a word spelt two ways.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { planSite } from 'website-opportunities/domain/site-plan.mjs'
import { declaredButtonSlots, pageNameOf } from 'website-opportunities/domain/declared-button-plan.mjs'
import { spellingVariants } from 'website-opportunities/domain/sibling-copy-shape.mjs'
import { inSiteVoice, siteStyleSheetOf } from 'website-opportunities/domain/site-style-sheet.mjs'
import { checkSiblingCopy } from '../src/opportunities-build/sibling-copy-check.js'
import { writeOfferingDescriptions } from '../src/sites/brief-engines/offering-description-writer.js'
import { nameOnlyOfferingLines } from '../src/sites/brief-engines/offering-name-only.js'
import { settleSiteSpelling } from '../src/sites/brief-engines/site-voice.js'

const map = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/content-map.json',
      import.meta.url
    ),
    'utf8'
  )
)

const TRADES = [
  {
    trade: 'climbing wall',
    locale: 'en-GB',
    brief: {
      business: {
        name: 'Ledgeway Climbing',
        description: 'An indoor climbing centre with colourful walls and personalised coaching.'
      },
      primaryAction: {
        label: 'Book a session',
        channel: 'contact',
        href: null,
        basis: 'sourced',
        evidence: []
      },
      reading: {
        services: [
          { id: 's0', label: 'Bouldering', quote: 'Short climbs on padded walls, set fresh every month.' },
          { id: 's1', label: 'Top rope', quote: 'Roped climbs with a belayer watching every move.' },
          { id: 's2', label: 'Lead climbing', quote: 'Join our lead climbing courses today!' },
          // No line of its own anywhere in the brief.
          { id: 's3', label: 'Kids club' }
        ]
      }
    },
    // What a drifting writer answers: the other English.
    drift: 'A friendly program in a colorful hall, organized around each climber.',
    want: 'A friendly program in a colourful hall, organised around each climber.'
  },
  {
    trade: 'pottery studio',
    locale: 'en-US',
    brief: {
      business: {
        name: 'Kilnside Pottery',
        description: 'A pottery studio with a colorful glaze bar and personalized lessons.'
      },
      primaryAction: {
        label: 'Book a class',
        channel: 'contact',
        href: null,
        basis: 'sourced',
        evidence: []
      },
      reading: {
        services: [
          { id: 's0', label: 'Wheel throwing', quote: 'Shape bowls and cups on the wheel at your own pace.' },
          { id: 's1', label: 'Hand building', quote: 'Coil And Slab Pottery For Everyone' },
          { id: 's2', label: 'Glazing', quote: 'Pick glazes and finish the pieces you made.' },
          { id: 's3', label: 'Kiln hire' }
        ]
      }
    },
    drift: 'A calm session in our centre, finished with your favourite colour.',
    want: 'A calm session in our center, finished with your favorite color.'
  }
]

const DESCRIBING = new Set(['offering.description', 'offering.summary'])
const plain = (v) => String(v ?? '').trim()

for (const { trade, locale, brief, drift, want } of TRADES) {
  const plan = planSite(brief, { questions: [] }, { contentMap: map })
  const kept = plan.honesty.records.filter((r) => r.decision === 'keep' && r.collection && r.assigned)

  test(`${trade}: the style sheet is read once from the brief's own words (${locale})`, () => {
    assert.equal(plan.styleSheet?.locale, locale)
    assert.equal(plan.styleSheet.basis, 'brief-text')
    assert.deepEqual(siteStyleSheetOf(brief), plan.styleSheet)
  })

  test(`${trade}: the offering cards of one list fall back as one unit, never with a post's slogan`, () => {
    const byCollection = new Map()
    for (const r of kept) byCollection.set(r.collection, [...(byCollection.get(r.collection) ?? []), r.group])
    let lists = 0
    for (const [collection, groups] of byCollection) {
      const slotsOf = (g) =>
        map.slots.filter((s) => s.group?.id === g && DESCRIBING.has(s.role) && s.type === 'text')
      const first = groups.map((g) => slotsOf(g)[0]).filter(Boolean)
      if (first.length < 2) continue
      lists += 1
      const own = first.map((s) => s.key in plan.honesty.fallbacks)
      assert.ok(
        own.every(Boolean) || own.every((o) => !o),
        `${collection}: cards mix the business's words and none (${first.map((s) => s.key).join(', ')})`
      )
      if (!own[0])
        for (const s of first) assert.ok(plan.honesty.nameOnly.includes(s.key), `${s.key} goes to the writer`)
    }
    assert.ok(lists > 0, 'the map holds a list of offering cards')
    for (const [key, f] of Object.entries(plan.honesty.fallbacks))
      assert.ok(inSiteVoice(f.value), `${key}: "${f.value}" is no card line`)
  })

  test(`${trade}: a writer drifting into the other English is brought back to the site's spelling`, async () => {
    const asked = []
    const model = {
      chat: async ({ messages }) => {
        asked.push(messages[0].content)
        const input = JSON.parse(messages[1].content)
        return JSON.stringify({ lines: Object.fromEntries(input.lines.map((l) => [l.key, drift])) })
      }
    }
    const slots = map.slots.filter((s) => plan.honesty.nameOnly.includes(s.key))
    const lines = await writeOfferingDescriptions({
      slots,
      honesty: plan.honesty,
      written: {},
      about: { business: brief.business.name, styleSheet: plan.styleSheet },
      model
    })
    assert.ok(Object.keys(lines).length > 0)
    assert.ok(asked[0].includes(locale), 'the writer is told the site spelling')
    for (const line of Object.values(lines)) assert.equal(line, want)
    // A second writer (the page pass) wrote in the site's spelling; once settled, the site spells each word one way.
    const pagePass = { 'module-160.1': want, 'module-157.3': drift }
    const all = { ...pagePass, ...lines }
    const settled = { ...all, ...settleSiteSpelling(all, plan.styleSheet, { slots: map.slots }).values }
    assert.deepEqual(spellingVariants(Object.values(settled)), [])
  })

  test(`${trade}: siblings of one list are taken off as one unit when the writer leaves one`, () => {
    const keys = plan.honesty.nameOnly
    const written = Object.fromEntries(keys.map((k) => [k, 'A calm session for climbers and makers alike.']))
    written[keys[0]] = ''
    const off = nameOnlyOfferingLines({ slots: map.slots, honesty: plan.honesty, written }).map((s) => s.key)
    const first = (k) => map.slots.find((s) => s.key === k)
    const rankOf = (k) => {
      const s = first(k)
      return map.slots.filter((o) => o.group?.id === s.group?.id && o.role === s.role).indexOf(s)
    }
    const collectionOf = (k) => kept.find((r) => r.group === first(k).group?.id)?.collection
    const sameRank = keys.filter(
      (k) =>
        collectionOf(k) === collectionOf(keys[0]) &&
        rankOf(k) === rankOf(keys[0]) &&
        first(k).role === first(keys[0]).role
    )
    assert.ok(sameRank.length > 1, 'the emptied line has siblings')
    for (const k of sameRank) assert.ok(off.includes(k), `${k} goes with its sibling`)
  })

  test(`${trade}: every navigation button names the page it leads to`, () => {
    const decided = new Map(
      plan.slots.filter((s) => s.reason === 'button-action').map((s) => [s.key, s.value])
    )
    const urlOf = (s) => map.slots.find((u) => u.key === s.action.urlKey)?.sample
    // A navigation button with a destination page (a hero's empty second button has none to name).
    const navigation = map.slots.filter(
      (s) =>
        s.type === 'text' &&
        s.action?.kind === 'navigation' &&
        new Set((s.action.uses ?? []).map((u) => u.kind)).size <= 1 &&
        /Itemid=\d+/.test(String(urlOf(s)))
    )
    assert.ok(navigation.length > 0)
    for (const slot of navigation) {
      const words = decided.get(slot.key)
      assert.ok(words, `${slot.key} has words decided from its destination`)
      if (words === brief.primaryAction.label) continue // its section already sits on that page
      const id = /Itemid=(\d+)/.exec(String(urlOf(slot)))?.[1]
      const page = map.pages.find((p) => p.entity === `menuItem-${id}`)
      assert.equal(words, pageNameOf(page), `${slot.key} names ${page?.route}`)
      assert.ok(
        !/^contact/i.test(words) || /contact/.test(page.route),
        `${slot.key}: "${words}" is no contact link`
      )
    }
  })

  test(`${trade}: every booking or contact button reaches the Contact page and says the action`, () => {
    const decided = new Map(
      plan.slots.filter((s) => s.reason === 'button-action').map((s) => [s.key, s.value])
    )
    for (const slot of map.slots.filter((s) => s.type === 'text' && s.action?.kind === 'contact')) {
      assert.equal(decided.get(slot.key), brief.primaryAction.label, `${slot.key} says the booking action`)
      assert.equal(decided.get(slot.action.urlKey), 'index.php?Itemid=168', `${slot.key} leads to Contact`)
    }
    assert.ok(![...decided.values()].includes('How to reach us'))
  })
}

test('with no Contact page kept, a contact button calls or mails the business and says so', () => {
  const brief = TRADES[0].brief
  for (const [href, label] of [
    ['tel:+442079460123', 'Call us'],
    ['mailto:hello@ledgeway.example', 'Email us'],
    ['https://wa.me/442079460123', 'Message us on WhatsApp']
  ]) {
    const out = declaredButtonSlots(brief, map, {
      pages: [{ id: 'about-us/contact', role: 'contact', decision: 'drop' }],
      channels: [{ kind: 'channel', href }]
    })
    const by = Object.fromEntries(out.map((d) => [d.key, d.value]))
    assert.equal(by['module-181.20'], label)
    assert.equal(by['module-181.21'], href)
  }
})

test('the final check reads every visible text node for a word spelt two ways', () => {
  const html = (nav, body) =>
    `<html><body><nav><a href="/plans">${nav}</a></nav><main><p>${body}</p></main></body></html>`
  const found = checkSiblingCopy({
    pages: [
      { path: '/', status: 200, html: html('Personalised plans', 'Personalized coaching for every climber.') }
    ]
  }).filter((f) => f.kind === 'spelling-variant')
  assert.equal(found.length, 1)
  assert.equal(plain(found[0].found), 'personalised / personalized')
})
