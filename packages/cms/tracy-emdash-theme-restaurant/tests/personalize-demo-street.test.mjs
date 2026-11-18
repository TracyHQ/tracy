// tools/personalize.mjs: once the brief gives an address, nothing on the site still prints or links the demo's street
// (independent review of JA Restaurant 1.0.3, 17/11/2026: applied with a `contact` answer and no model key, every footer
// still linked "4 5th Avenue, Brooklyn" on a map, and the home welcome and Our History still printed the demo's street).
// With no address the demo's address stays (`unanswered: keep-demo`), and so do these words.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  customerSpansOf,
  demoContactsLeft,
  demoContactsOf,
  demoDomainsIn,
  demoPlaceWordsOf,
  demoPlacesBesides,
  factsFrom,
  rowsWithoutDemoPlace,
  withCustomerContacts,
  withoutDemoPlace
} from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const DEMO_ADDRESS = '4 5th Avenue at St. Marks Place, Cathedral District Brooklyn, NY 11217'
const DEMO_MAP = 'https://www.google.com/maps/search/?api=1&query=4+5th+Avenue%2C+Brooklyn%2C+NY+11217'
const DEMO = /5th Avenue|St\. Marks|Cathedral|Brooklyn|11217|4\+5th/
const span = (text, marks = []) => ({ _type: 'span', _key: `s${text.length}`, text, marks })

const seed = {
  defaultLocale: 'en',
  content: {
    chrome: [
      {
        slug: 'chrome',
        locale: 'en',
        data: {
          brand_name: 'RES',
          footer_address: DEMO_ADDRESS,
          footer_map_url: DEMO_MAP,
          footer_contact: [
            { label: 'Phone', value: '(084) 555-0110', href: '' },
            { label: 'Fax', value: '(084) 555-0111', href: '' },
            { label: 'Email', value: 'hello@res.example', href: 'mailto:hello@res.example' }
          ]
        }
      }
    ],
    hero: [
      {
        slug: 'welcome',
        locale: 'en',
        data: {
          hero_intro: [
            {
              _type: 'block',
              _key: 'b1',
              style: 'normal',
              markDefs: [],
              children: [
                span(
                  'Since 1982, RES has welcomed Brooklyn to one of the oldest buildings. Our kitchen cooks seasonal produce.'
                )
              ]
            },
            {
              _type: 'block',
              _key: 'b2',
              style: 'normal',
              markDefs: [{ _type: 'link', _key: 'm1', href: DEMO_MAP }],
              children: [span('Find us at '), span('4 5th Avenue at St. Marks Place', ['m1']), span('.')]
            }
          ]
        }
      }
    ],
    masthead: [
      { slug: 'about', locale: 'en', data: { description: 'Bar & restaurant in Brooklyn since 1982' } }
    ],
    offers: [
      { slug: 'happy', locale: 'en', data: { other_info: 'res.example\nRESERVATIONS (084)\u00a0555-0110' } }
    ],
    card: [
      {
        slug: 'contact',
        locale: 'en',
        data: {
          text: [
            {
              _type: 'block',
              _key: 'c',
              style: 'normal',
              markDefs: [{ _type: 'link', _key: 't', href: 'tel:+10845550110' }],
              children: [
                span('To book, call us at '),
                span('(084) 555-0110', ['t']),
                span(' between 9 and 5.')
              ]
            }
          ]
        }
      }
    ],
    pages: [
      {
        slug: 'our-history',
        locale: 'en',
        data: {
          title: 'History',
          lead_title: 'Four decades on 5th Avenue',
          lead_text: 'The room has grown, the welcome has not.',
          body: [
            { _type: 'block', _key: 'h', style: 'h1', markDefs: [], children: [span('5th Avenue')] },
            {
              _type: 'block',
              _key: 'p',
              style: 'normal',
              markDefs: [],
              children: [span('RES opened in 1982 on 5th Avenue as a small bar.')]
            }
          ]
        }
      }
    ],
    timeline: [
      {
        slug: 'history',
        locale: 'en',
        data: {
          items: [
            {
              date: '1982-05-14',
              title: 'Doors open on 5th Avenue',
              description: 'RES opened as a bar. The first menu hangs by the door.'
            },
            { date: '1990-01-01', title: '5th Avenue', description: 'A second room.' },
            { title: 'A longer bar', description: 'We took over the shop next door.' }
          ]
        }
      }
    ]
  }
}
const map = {
  identity: [
    {
      collection: 'chrome',
      slug: 'chrome',
      field: 'footer_address',
      value: '{address}',
      unanswered: 'keep-demo'
    },
    {
      collection: 'chrome',
      slug: 'chrome',
      field: 'footer_map_url',
      value: '{map}',
      unanswered: 'keep-demo'
    },
    {
      collection: 'chrome',
      slug: 'chrome',
      field: 'footer_contact',
      rows: {
        Phone: { value: '{phone}', href: '{tel}' },
        Fax: { dropWhen: ['phone'] },
        Email: { value: '{email}', href: 'mailto:{email}', dropWhen: ['phone', 'address'] }
      },
      unanswered: 'keep-demo'
    }
  ],
  replace: [],
  copy: [
    { collection: 'hero', slug: 'welcome', field: 'hero_intro', brief: 'the welcome of the home page' },
    { collection: 'masthead', slug: 'about', field: 'description', brief: 'one line under the About title' }
  ],
  rewrite: [
    {
      collection: 'pages',
      slugs: ['our-history'],
      fields: ['lead_title', 'lead_text', 'body'],
      brief: 'the history page'
    }
  ],
  facts: [{ collection: 'timeline', slug: 'history', field: 'items', why: 'the demo restaurant milestones' }],
  hide: []
}
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-street-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))
const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}
const entries = Object.entries(seed.content).flatMap(([collection, rows]) =>
  rows.map((e) => ({ collection, slug: e.slug, locale: e.locale, data: e.data }))
)

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      'node',
      [TOOL, ...args],
      { cwd: ROOT, env: { ...process.env, ...NO_MODEL, ...env }, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  })
}

/** The tool applied on an in-memory site seeded with `seed`; answers the site's entries afterwards. */
async function applied(answers, { extra = ['--no-model'], env = {} } = {}) {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(collection, e.slug, e.locale, e.data)
  const site = await mock.listen()
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-street-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  try {
    const r = await run(
      [
        '--seed',
        SEED_DIR,
        '--site',
        site,
        '--token-file',
        path.join(dir, 'token'),
        '--receipts',
        path.join(dir, 'receipts.json'),
        '--answers-json',
        JSON.stringify(answers),
        ...extra,
        '--json'
      ],
      env
    )
    const data = (collection) => {
      const e = [...mock.state.entries.values()].find((x) => x.collection === collection && x.locale === 'en')
      return { ...e.live, ...e.draft }
    }
    return { report: JSON.parse(r.stdout), data, stderr: r.stderr }
  } finally {
    await mock.close()
  }
}

test("the demo place is its proper names and its numbered street; a word the customer's own address holds is theirs", () => {
  const places = demoPlaceWordsOf(map, entries)
  assert.deepEqual([...places].sort(), ['5th Avenue', 'Brooklyn', 'Cathedral', 'Marks'])
  assert.deepEqual([...demoPlacesBesides(places, { address: '90 Smith St, Brooklyn, NY 11201' })].sort(), [
    '5th Avenue',
    'Cathedral',
    'Marks'
  ])
})

test('withoutDemoPlace takes only the place phrase, keeps the words around it, and never empties a heading', () => {
  const places = new Set(['Brooklyn', '5th Avenue', 'Marks', 'Cathedral'])
  const facts = { address: '1 Main St, Springfield' }
  assert.equal(withoutDemoPlace('Opened in 1982 at 4 5th Avenue', places, facts), 'Opened in 1982')
  assert.equal(
    withoutDemoPlace('Cooking for Brooklyn since 1982. Come in.', places, facts),
    'Cooking since 1982. Come in.'
  )
  assert.equal(withoutDemoPlace('Four decades on 5th Avenue', places, facts), 'Four decades')
  assert.equal(
    withoutDemoPlace(
      'Local beer to the people of Brooklyn. The first menu still hangs by the door.',
      places,
      facts
    ),
    'Local beer to the people. The first menu still hangs by the door.'
  )
  assert.equal(
    withoutDemoPlace('After four decades on 5th Avenue, these are our habits.', places, facts),
    'After four decades, these are our habits.'
  )
  assert.equal(
    withoutDemoPlace(
      'Open daily\n4 5th Avenue at St. Marks Place, Cathedral District Brooklyn, NY 11217\nNo booking',
      places,
      facts
    ),
    'Open daily\nNo booking',
    'a line that is nothing but the address goes'
  )
  assert.equal(withoutDemoPlace('Fifth avenue of flavour', places, facts), null, 'a common word is no place')
  assert.equal(
    withoutDemoPlace('Our 15th Avenue', places, facts),
    null,
    'another numbered street is not the demo one'
  )
  assert.equal(
    withoutDemoPlace('5th Avenue', places, facts, { fallback: 'History' }),
    'History',
    "the caller's neutral value"
  )
  assert.deepEqual(
    withoutDemoPlace([{ date: '1982-05-14', title: 'Doors open on 5th Avenue', n: 1 }], places, facts),
    [{ date: '1982-05-14', title: 'Doors open', n: 1 }]
  )
  assert.deepEqual(
    withoutDemoPlace([{ date: '1982-05-14', title: 'Brooklyn', caption: '5th Avenue' }], places, facts),
    [{ date: '1982-05-14', title: '1982', caption: '1982' }],
    "a row heading or caption left empty takes the row's year"
  )
  const h1 = withoutDemoPlace(
    [{ _type: 'block', _key: 'h', style: 'h1', markDefs: [], children: [span('5th Avenue')] }],
    places,
    facts,
    { fallback: 'History' }
  )
  assert.equal(h1[0].children[0].text, 'History', 'an h1 left empty takes the page title')
  assert.equal(withoutDemoPlace('Nothing to see', places, facts), null)
})

test('a place that is a core argument takes its whole sentence; a detachable one goes alone (third review round)', () => {
  const places = new Set(['Brooklyn', '5th Avenue', 'Marks', 'Cathedral'])
  const facts = { address: '1 Main St, Springfield' }
  // the home welcome of JA Restaurant: "Brooklyn" is the object of "welcomed"; cutting it read "has welcomed to one of …"
  assert.equal(
    withoutDemoPlace(
      'Since 1982, RES has welcomed Brooklyn to one of the neighborhood’s oldest buildings, at 4 5th Avenue at St. Marks Place, Cathedral District. Our kitchen cooks seasonal market produce over a wood fire.',
      places,
      facts
    ),
    'Our kitchen cooks seasonal market produce over a wood fire.'
  )
  // the subject of a verb, and a word inside a phrase: the sentence goes
  assert.equal(withoutDemoPlace('Brooklyn loves our burgers. Come in.', places, facts), 'Come in.')
  assert.equal(
    withoutDemoPlace(
      'From a bar to a Brooklyn favourite: the milestones since 1982. Read on.',
      places,
      facts
    ),
    'Read on.'
  )
  // detachable: a preposition and the place, or the place set off by commas
  assert.equal(
    withoutDemoPlace('Our home, Brooklyn, is a lively one.', places, facts),
    'Our home is a lively one.'
  )
  assert.equal(
    withoutDemoPlace('Local beer for the people of Brooklyn.', places, facts),
    'Local beer for the people.'
  )
  // nothing else readable: the field is empty, and a heading takes its neutral value
  assert.equal(withoutDemoPlace('Brooklyn loves us.', places, facts), '')
  assert.equal(withoutDemoPlace('Brooklyn loves us.', places, facts, { fallback: 'History' }), 'History')
  // rich text: the sentence goes with the demo address link it carries, the paragraph keeps its other sentence
  const rich = withoutDemoPlace(
    [
      {
        _type: 'block',
        _key: 'w',
        style: 'normal',
        markDefs: [{ _type: 'link', _key: 'm', href: DEMO_MAP }],
        children: [
          span('Since 1982, RES has welcomed Brooklyn to its building, at '),
          span('4 5th Avenue', ['m']),
          span('. Our kitchen cooks seasonal produce.')
        ]
      }
    ],
    places,
    facts
  )
  assert.equal(rich[0].children.map((c) => c.text).join(''), 'Our kitchen cooks seasonal produce.')
  assert.deepEqual(rich[0].markDefs, [], 'the demo address link went with its sentence')
})

test("the demo contacts come from the rules; a phone, a tel link and an e-mail take the brief's by value; the check names what is left", () => {
  const demo = demoContactsOf(map, entries)
  assert.deepEqual([...demo.phones], ['0845550110'])
  assert.deepEqual([...demo.emails], ['hello@res.example'])
  assert.deepEqual([...demo.domains], ['res.example'])
  const facts = { phone: '+1 555 0100', tel: 'tel:+15550100', email: 'hi@bistro.test' }
  assert.equal(
    withCustomerContacts('Call 084 555 0110 or (084)\u00a0555-0110.', demo, facts),
    'Call +1 555 0100 or +1 555 0100.'
  )
  assert.equal(withCustomerContacts('tel:+10845550110', demo, facts), 'tel:+15550100')
  assert.equal(withCustomerContacts('mailto:hello@res.example', demo, facts), 'mailto:hi@bistro.test')
  assert.equal(withCustomerContacts('Visit res.example. Open daily.', demo, facts), 'Open daily.')
  assert.equal(withCustomerContacts('Our year 1982 and 555-0199', demo, facts), null, 'another number stays')
  assert.equal(
    withCustomerContacts('Call (084) 555-0110', demo, {}),
    null,
    'no phone in the brief: the demo phone stays'
  )
  assert.deepEqual(demoContactsLeft({ a: 'Call (084) 555-0110', b: 'mail@res.example' }, demo, facts), [
    '(084) 555-0110',
    'res.example'
  ])
  assert.deepEqual(
    demoContactsLeft({ a: 'Call (084) 555-0110' }, demo, {}),
    [],
    'no phone in the brief: nothing to check'
  )
})

test("code review 1: a place word inside the customer's own values is never the demo's place, as a whole span", () => {
  const facts = { name: 'Brooklyn Bistro', address: '1 Main St, Springfield', phone: '+1 555 0100' }
  const places = demoPlacesBesides(new Set(['Brooklyn', '5th Avenue']), facts)
  assert.deepEqual(
    [...places],
    ['Brooklyn', '5th Avenue'],
    'the address holds no demo place: both stay demo places'
  )
  assert.ok(customerSpansOf(facts).includes('Brooklyn Bistro'))
  // the review's inputs: the renamed copy stays whole
  assert.equal(withoutDemoPlace('Welcome to Brooklyn Bistro', places, facts), null)
  assert.equal(
    withoutDemoPlace('Come to Brooklyn Bistro for dinner. Our kitchen cooks daily.', places, facts),
    null
  )
  // the demo's own place outside the name still goes
  assert.equal(
    withoutDemoPlace('Visit us in Brooklyn. Come to Brooklyn Bistro for dinner.', places, facts),
    'Visit us. Come to Brooklyn Bistro for dinner.'
  )
  // a sentence whose own demo place is a core argument goes whole, as for any name (D85); the name is never cut through
  assert.equal(
    withoutDemoPlace('Brooklyn Bistro has welcomed Brooklyn since 1982. Our kitchen cooks.', places, facts),
    'Our kitchen cooks.'
  )
  assert.equal(
    withoutDemoPlace('Brooklyn Bistro opened in 1982 in Brooklyn.', places, facts),
    'Brooklyn Bistro opened in 1982.'
  )
  // the same in rich text and in card rows kept as the demo's
  const rich = [
    {
      _type: 'block',
      _key: 'b',
      style: 'normal',
      markDefs: [],
      children: [span('Welcome to Brooklyn Bistro.')]
    }
  ]
  assert.equal(withoutDemoPlace(rich, places, facts), null)
  const rows = rowsWithoutDemoPlace({
    rule: { itemFields: ['title'] },
    rows: [{ title: 'Dinner at Brooklyn Bistro' }],
    left: [0],
    places,
    facts
  })
  assert.deepEqual(rows.emptied, [])
  assert.equal(rows.rows[0].title, 'Dinner at Brooklyn Bistro')
})

test('code review 2: a heading, caption or alt text is never left empty; with no fallback it keeps its words and is reported', () => {
  const places = new Set(['Brooklyn'])
  const row = [{ title: 'Brooklyn', caption: 'Brooklyn', alt: 'Brooklyn' }]
  // the review's input: no year, no title, no name in the brief: nothing changes
  assert.equal(withoutDemoPlace(row, places, { address: 'Elsewhere' }), null)
  const left = []
  withoutDemoPlace(row, places, { address: 'Elsewhere' }, { unresolved: left })
  assert.deepEqual(left, ['Brooklyn', 'Brooklyn', 'Brooklyn'])
  // the chain: the row's year, then the caller's fallback, then the site's name
  assert.deepEqual(
    withoutDemoPlace([{ date: '1982-05-14', title: 'Brooklyn' }], places, { address: 'Elsewhere' }),
    [{ date: '1982-05-14', title: '1982' }]
  )
  assert.deepEqual(withoutDemoPlace(row, places, { address: 'Elsewhere' }, { fallback: 'Our History' }), [
    { title: 'Our History', caption: 'Our History', alt: 'Our History' }
  ])
  assert.deepEqual(withoutDemoPlace(row, places, { address: 'Elsewhere', name: 'Test Bistro' }), [
    { title: 'Test Bistro', caption: 'Test Bistro', alt: 'Test Bistro' }
  ])
  // a required text on its own, and a rich-text heading with no fallback, keep their words
  assert.equal(withoutDemoPlace('Brooklyn', places, { address: 'Elsewhere' }, { required: true }), null)
  const h = [{ _type: 'block', _key: 'h', style: 'h2', markDefs: [], children: [span('Brooklyn')] }]
  assert.equal(withoutDemoPlace(h, places, { address: 'Elsewhere' }), null)
  // a card row kept as the demo's: its heading takes the site's name, else keeps its words
  const kept = rowsWithoutDemoPlace({
    rule: { itemFields: ['title'] },
    rows: [{ title: 'Brooklyn' }],
    left: [0],
    places,
    facts: { address: 'Elsewhere' }
  })
  assert.equal(kept.rows[0].title, 'Brooklyn')
  const named = rowsWithoutDemoPlace({
    rule: { itemFields: ['title'] },
    rows: [{ title: 'Brooklyn' }],
    left: [0],
    places,
    facts: { address: 'Elsewhere', name: 'Test Bistro' }
  })
  assert.equal(named.rows[0].title, 'Test Bistro')
  // a body that is not a heading may still be emptied (documented)
  assert.equal(withoutDemoPlace('Brooklyn', places, { address: 'Elsewhere' }), '')
})

test('code review 3: the demo domain is a whole host or a subdomain of it, never a substring', () => {
  const demo = {
    phones: new Set(['0845550110']),
    emails: new Set(['hello@res.example']),
    domains: new Set(['res.example'])
  }
  const facts = { phone: '+1 555 0100', tel: 'tel:+15550100' }
  // the review's input: another host that ends in the same letters stays, with its sentence
  assert.equal(withCustomerContacts('Read our partner at https://notres.example today.', demo, facts), null)
  assert.deepEqual(
    demoContactsLeft('Read our partner at https://notres.example today.', demo, {
      ...facts,
      email: 'a@b.test'
    }),
    []
  )
  assert.deepEqual(
    demoDomainsIn('https://notres.example res.example.com res-example.org', ['res.example']),
    []
  )
  assert.deepEqual(
    demoDomainsIn('www.res.example, hello@res.example and sub.res.example/path. See RES.EXAMPLE.', [
      'res.example'
    ]),
    ['www.res.example', 'res.example', 'sub.res.example', 'RES.EXAMPLE']
  )
  // the demo's own host still takes its sentence
  assert.equal(
    withCustomerContacts(
      'Visit res.example today. Read our partner at https://notres.example today.',
      demo,
      facts
    ),
    'Read our partner at https://notres.example today.'
  )
})

test('the address is a map link a template field can take ({map})', () => {
  assert.equal(
    factsFrom({ contact: '1 Main St, Springfield · +1 555 0100' }).map,
    'https://www.google.com/maps/search/?api=1&query=1%20Main%20St%2C%20Springfield'
  )
  assert.equal(factsFrom({ contact: '+1 555 0100' }).map, undefined, 'no address, no map')
})

test('with an address and no model: the footer map follows the brief and no field names the demo place', async () => {
  const { report, data } = await applied({
    name: 'Test Bistro',
    contact: '1 Main St, Springfield · +1 555 0100'
  })
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors))
  assert.equal(data('chrome').footer_address, '1 Main St, Springfield')
  assert.equal(
    data('chrome').footer_map_url,
    'https://www.google.com/maps/search/?api=1&query=1%20Main%20St%2C%20Springfield'
  )
  for (const c of ['hero', 'masthead', 'pages', 'timeline'])
    assert.doesNotMatch(JSON.stringify(data(c)), DEMO, `${c} still names the demo place`)
  const hero = JSON.stringify(data('hero').hero_intro)
  assert.match(hero, /Our kitchen cooks seasonal produce\./, 'the sentences that do not name it stay')
  // field level: the 1982 card keeps its title and its founding sentence; a heading that was only the street takes the year
  assert.deepEqual(data('timeline').items[0], {
    date: '1982-05-14',
    title: 'Doors open',
    description: 'RES opened as a bar. The first menu hangs by the door.'
  })
  assert.equal(data('timeline').items[1].title, '1990')
  assert.equal(data('timeline').items[2].title, 'A longer bar')
  // the band keeps its words; the page's h1 that was only the street takes the page title, its body keeps the opening
  assert.equal(data('pages').lead_title, 'Four decades')
  assert.equal(data('pages').lead_text, 'The room has grown, the welcome has not.')
  assert.equal(data('pages').body[0].children[0].text, 'History')
  assert.equal(
    data('pages')
      .body[1].children.map((c) => c.text)
      .join(''),
    'RES opened in 1982 as a small bar.'
  )
  // the footer contact lines follow the contact card: the brief's phone, no demo fax or e-mail beside it
  assert.deepEqual(data('chrome').footer_contact, [
    { label: 'Phone', value: '+1 555 0100', href: 'tel:+15550100' }
  ])
  assert.ok(
    report.skipped.some((s) => s.rule === 'places'),
    'the report says which fields lost the demo place'
  )
  // the report names only the fields that held the demo's place (the contact card held a phone, no place), each with its
  // words before and after
  const placesLine = report.skipped.find((x) => x.rule === 'places')
  assert.doesNotMatch(placesLine.why, /card\/contact/)
  assert.ok(
    placesLine.changes.some((c) => /timeline/.test(c.field) && /Doors open on 5th Avenue/.test(c.before))
  )
  assert.equal(data('offers').other_info, 'RESERVATIONS +1 555 0100')
})

test("with no address: the demo address, its map and the words stay (keep-demo); the phone is the brief's", async () => {
  const { report, data } = await applied({ name: 'Test Bistro', contact: '+1 555 0100' })
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors))
  // the hard rule: a phone in the brief replaces the demo's everywhere, by value: a line no rule names (/offers) and a
  // linked phone in rich text (the contact card), with an address or without; the demo's web address goes beside it
  assert.equal(data('offers').other_info, 'RESERVATIONS +1 555 0100')
  assert.deepEqual(data('card').text[0].markDefs, [{ _type: 'link', _key: 't', href: 'tel:+15550100' }])
  assert.equal(
    data('card')
      .text[0].children.map((c) => c.text)
      .join(''),
    'To book, call us at +1 555 0100 between 9 and 5.'
  )
  assert.ok(report.skipped.some((x) => x.rule === 'contacts'))
  assert.equal(data('chrome').footer_address, DEMO_ADDRESS)
  assert.equal(data('chrome').footer_map_url, DEMO_MAP)
  assert.match(JSON.stringify(data('pages')), /5th Avenue/)
  assert.ok(!report.skipped.some((s) => s.rule === 'places'))
  // the brief's phone replaces the demo's (owner, 16/11/2026); no demo fax or e-mail stands beside a customer's phone
  assert.deepEqual(
    data('chrome').footer_contact.map((r) => [r.label, r.value]),
    [['Phone', '+1 555 0100']]
  )
  assert.ok(
    report.unanswered.some(
      (u) => /footer_address/.test(u.rule) && /no address in the contact answer/.test(u.why)
    ),
    JSON.stringify(report.unanswered)
  )
  assert.ok(!JSON.stringify(report.unanswered).includes('no contact in the answers'))
})

test('with a model that gives nothing usable: the demo place still leaves every field', async () => {
  const stub = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }))
    })
  })
  await new Promise((r) => stub.listen(0, '127.0.0.1', r))
  try {
    const { data } = await applied(
      {
        name: 'Test Bistro',
        about: 'A small bistro in Springfield that cooks local produce.',
        contact: '1 Main St, Springfield · +1 555 0100'
      },
      {
        extra: [],
        env: {
          TRACY_MODEL_URL: `http://127.0.0.1:${stub.address().port}/v1/chat/completions`,
          TRACY_MODEL_KEY: 'k',
          TRACY_MODEL_NAME: 'm'
        }
      }
    )
    assert.equal(
      data('chrome').footer_map_url,
      'https://www.google.com/maps/search/?api=1&query=1%20Main%20St%2C%20Springfield'
    )
    for (const c of ['hero', 'masthead', 'pages', 'timeline'])
      assert.doesNotMatch(JSON.stringify(data(c)), DEMO, `${c} still names the demo place`)
  } finally {
    stub.close()
  }
})
