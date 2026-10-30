// The SEO stage's plan (spec TracyHQ/tracy#189, criteria 8.1 and 8.5, R12 group G): every kept record page has a search
// result of its own, written from its own copy, and the site has one LocalBusiness record from brief facts only. Real JA
// Boxing 1.0.8 content map; every business is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  businessSchemaOf,
  openingHoursOf,
  schemaScript,
  schemaTypeOf,
  withSiteUrl
} from '../domain/business-schema.mjs'
import { recordSeoOf, recordSeoPlanOf } from '../domain/record-seo.mjs'
import { placeSeoOf } from '../domain/place-seo.mjs'

const boxing = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        '../../../cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/content-map.json',
        import.meta.url
      )
    ),
    'utf8'
  )
)

/** A made-up dental clinic with hours and two profiles. */
const dentalBrief = () => ({
  business: {
    name: 'Brightsmile Dental Studio',
    trade: 'health',
    subTrade: { id: 'dentist', method: 'table', quotes: [] },
    phone: '+44 20 7946 0123',
    address: '12 Willow Lane - Eastbrook - Port Marlow - Exampleland',
    hours: ['Monday: 9:00 AM – 5:30 PM', 'Saturday: 9:00 – 1:00 PM', 'Sunday: Closed', 'Friday: by the moon'],
    socials: { instagram: 'https://instagram.example/brightsmile', facebook: 'not a link' },
    website: 'https://brightsmile.example'
  },
  reading: { services: [{ label: 'Teeth Whitening', quote: 'teeth whitening' }] }
})

/** A made-up bakery with no hours and no profiles. */
const bakeryBrief = () => ({
  business: { name: 'Copperleaf Bakery', trade: 'food', phone: '+44 20 7946 0555' },
  reading: { services: [{ label: 'Sourdough', quote: 'sourdough' }] }
})

/** The honesty plan's records for the four lesson pages the template declares, as a brief build keeps them. */
const lessons = (labels) =>
  ['article-2', 'article-14', 'article-15', 'article-16'].map((entity, i) => ({
    kind: 'service',
    group: `${entity}.offering`,
    decision: labels[i] ? 'keep' : 'hide',
    assigned: labels[i] ? { id: `s${i}`, label: labels[i] } : null,
    collection: 'article:service'
  }))

test('every kept record page the template declares gets a search result; a hidden or undeclared one gets none', () => {
  const records = [
    ...lessons(['Teeth Whitening', 'Dental Implants', 'Braces', null]),
    // A card on the home page is no record page: its entity is not declared in `recordPages`.
    {
      kind: 'service',
      group: 'module-177.item.0',
      decision: 'keep',
      assigned: { id: 's0', label: 'Teeth Whitening' }
    }
  ]
  const plan = recordSeoPlanOf(
    boxing,
    { records },
    { name: 'Brightsmile Dental Studio', city: 'Port Marlow' }
  )
  assert.deepEqual(
    plan.map((r) => [r.entity, r.label]),
    [
      ['article-2', 'Teeth Whitening'],
      ['article-14', 'Dental Implants'],
      ['article-15', 'Braces']
    ]
  )
})

test("a record page's title carries the business name and its description is its own copy, whole sentences", () => {
  const [row] = recordSeoPlanOf(
    boxing,
    { records: lessons(['Sourdough Classes']) },
    { name: 'Copperleaf Bakery' }
  )
  const seo = recordSeoOf(row, [
    'Learn to bake a crusty sourdough loaf from your own starter in a small morning class.',
    'Every class ends with a loaf to take home and a jar of starter to keep it going for weeks. Aprons are provided.'
  ])
  assert.equal(seo.title, 'Sourdough Classes | Copperleaf Bakery')
  assert.ok(seo.description.startsWith('Learn to bake a crusty sourdough loaf'))
  assert.ok([...seo.description].length <= 155, seo.description)
  assert.match(seo.description, /[.!?]$/)
  // With no copy of its own, a sentence of facts, never a demo line.
  assert.equal(
    recordSeoOf({ ...row, city: 'Port Marlow' }, []).description,
    'Sourdough Classes at Copperleaf Bakery in Port Marlow.'
  )
})

test("the business record takes the trade's type, the hours it can read and the owner's own links only", () => {
  const brief = dentalBrief()
  const schema = businessSchemaOf(
    brief,
    placeSeoOf(brief, { name: 'Brightsmile Dental Studio', phone: brief.business.phone }).schema
  )
  assert.equal(schema['@type'], 'Dentist')
  assert.equal(schema.name, 'Brightsmile Dental Studio')
  assert.equal(schema.telephone, '+44 20 7946 0123')
  assert.equal(schema.address.addressLocality, 'Port Marlow')
  // The unreadable Friday line and the closed Sunday are left out, never guessed.
  assert.deepEqual(schema.openingHours, ['Mo 09:00-17:30', 'Sa 09:00-13:00'])
  assert.deepEqual(schema.sameAs, ['https://instagram.example/brightsmile', 'https://brightsmile.example'])
  assert.equal(withSiteUrl(schema, 'https://brightsmile.example/').url, 'https://brightsmile.example/')
  assert.match(schemaScript({ name: '</script>' }), /\\u003c\/script>/)
})

test('a business with no hours or profiles gets no such fields, and its trade type', () => {
  const brief = bakeryBrief()
  const schema = businessSchemaOf(
    brief,
    placeSeoOf(brief, { name: 'Copperleaf Bakery', phone: brief.business.phone }).schema
  )
  assert.equal(schema['@type'], 'Restaurant')
  assert.equal(schema.openingHours, undefined)
  assert.equal(schema.sameAs, undefined)
  assert.equal(schemaTypeOf({ trade: 'fitness', subTrade: { id: 'gym' } }), 'ExerciseGym')
  assert.equal(schemaTypeOf({ trade: 'unknown' }), 'LocalBusiness')
  assert.deepEqual(openingHoursOf('Tuesday: Open 24 hours'), ['Tu 00:00-23:59'])
})
