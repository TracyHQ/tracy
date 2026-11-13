// Shared inputs of the child list tests (ticket #615): an invented pottery studio (research and the scripted reading a
// fake build model returns), the invented club template of the plan composer tests with child lists added (session
// rows and step rows with nested tips inside each service card, profile links inside each team card, opening lines in
// the footer), a composition that passes the gate, and a scripted page writer. Nothing here is a real business,
// person, address, phone number, link or template.
import { needsProfileOf } from '../../../domain/needs-profile.mjs'
import * as Club from '../plan-composer/invented-club.mjs'

const SITE_TEXT = [
  'Kilnmere Clay Studio, 14 Larchwick Lane, Example Town. Call +1 555 0142.',
  'Wheel basics: Tue and Thu, 18:00 to 20:00. Also Sat, 10:00 to 12:00. Also Sun, 14:00 to 16:00.',
  'How a pot starts: Wedge the clay, pressing out every air pocket. Center on the wheel.',
  'Hand building: Wed, 19:00 to 21:00.',
  'Glaze night is open to every member.',
  'Our teacher Odile Brannoch shares her work at https://social.example/kilnmere.odile and https://video.example/odile-throws.',
  'Studio open Tue to Fri 10:00 to 21:00. Sat 09:00 to 17:00. Sun 12:00 to 16:00.'
].join(' ')

export const pottery = () => ({
  research: {
    sources: [
      { id: 'site', origin: 'website', ref: 'https://kilnmere.example', language: 'en', text: SITE_TEXT }
    ]
  },
  reading: {
    languages: [{ source: 'site', language: 'en' }],
    facts: [
      {
        source: 'site',
        kind: 'business.name',
        value: 'Kilnmere Clay Studio',
        evidence: 'Kilnmere Clay Studio, 14'
      },
      { source: 'site', kind: 'contact.phone', value: '+1 555 0142', evidence: 'Call +1 555 0142.' },
      {
        source: 'site',
        kind: 'contact.address',
        value: '14 Larchwick Lane, Example Town',
        evidence: '14 Larchwick Lane, Example Town'
      }
    ],
    items: [
      {
        source: 'site',
        kind: 'service',
        fields: { 'offering.name': 'Wheel basics' },
        evidence: 'Wheel basics: Tue and Thu',
        rows: [
          {
            fields: { 'offering.schedule': ['Tue and Thu', '18:00 to 20:00'] },
            evidence: 'Tue and Thu, 18:00 to 20:00'
          },
          {
            fields: { 'offering.schedule': ['Sat', '10:00 to 12:00'] },
            evidence: 'Also Sat, 10:00 to 12:00'
          },
          {
            fields: { 'offering.schedule': ['Sun', '14:00 to 16:00'] },
            evidence: 'Also Sun, 14:00 to 16:00'
          },
          {
            fields: { 'step.title': 'Wedge the clay' },
            evidence: 'Wedge the clay, pressing out every air pocket',
            rows: [
              {
                fields: { 'step.description': 'pressing out every air pocket' },
                evidence: 'pressing out every air pocket'
              }
            ]
          },
          { fields: { 'step.title': 'Center on the wheel' }, evidence: 'Center on the wheel.' },
          // Not in its evidence: the grounding drops it with `value_not_in_evidence`.
          { fields: { 'step.title': 'Trim the foot ring' }, evidence: 'Center on the wheel.' }
        ]
      },
      {
        source: 'site',
        kind: 'service',
        fields: { 'offering.name': 'Hand building' },
        evidence: 'Hand building: Wed',
        rows: [
          { fields: { 'offering.schedule': ['Wed', '19:00 to 21:00'] }, evidence: 'Wed, 19:00 to 21:00' }
        ]
      },
      {
        source: 'site',
        kind: 'service',
        fields: { 'offering.name': 'Glaze night' },
        evidence: 'Glaze night is open to every member.'
      },
      {
        source: 'site',
        kind: 'person',
        fields: { 'person.name': 'Odile Brannoch', 'person.role': 'teacher' },
        evidence: 'Our teacher Odile Brannoch',
        rows: [
          {
            fields: { 'person.social_url': 'https://social.example/kilnmere.odile' },
            evidence: 'https://social.example/kilnmere.odile'
          },
          {
            fields: { 'person.social_url': 'https://video.example/odile-throws' },
            evidence: 'https://video.example/odile-throws'
          }
        ]
      }
    ],
    rows: [
      {
        source: 'site',
        fields: { 'offering.schedule': 'Tue to Fri 10:00 to 21:00' },
        evidence: 'open Tue to Fri 10:00 to 21:00'
      },
      {
        source: 'site',
        fields: { 'offering.schedule': 'Sat 09:00 to 17:00' },
        evidence: 'Sat 09:00 to 17:00.'
      },
      {
        source: 'site',
        fields: { 'offering.schedule': 'Sun 12:00 to 16:00' },
        evidence: 'Sun 12:00 to 16:00.'
      }
    ]
  }
})
export const potteryProfile = () => {
  const { research, reading } = pottery()
  return needsProfileOf(research, reading)
}

export const WHEEL = 'service-wheel-basics'
export const HAND = 'service-hand-building'
export const GLAZE = 'service-glaze-night'
export const ODILE = 'person-odile-brannoch'

/** Stored places per parent place, each on its parent's record (`<record>.<name>-<row>`). */
const places = (records, name, counts) =>
  counts.map((n, p) => Array.from({ length: n }, (_, r) => `${records[p]}.${name}-${r + 1}`))
const items = (block, n) => Array.from({ length: n }, (_, i) => `${block}.item${i + 1}`)
const SERVICES = items('services-grid', 4)
const TEAM = items('team-cards', 4)
/** The parent records of the nested tips: one per step row, place after place (3, 2, 1 and 0 rows). */
const STEP_ROWS = [0, 0, 0, 1, 1, 2].map((i) => SERVICES[i])
const text = (name, kind, limit, slots) => ({ name, kind, type: 'text', limit, slots })

/** The invented club template with child lists added. */
export function potteryStore() {
  const store = Club.blockStore()
  const block = (id) => store.blocks.find((b) => b.id === id)
  block('services-grid').itemLists = [
    {
      name: 'sessions',
      items: { min: 0, max: 2 },
      itemsFrom: {
        min: 'invented: a card without a session row',
        max: 'invented: the most rows a card stores'
      },
      fields: [
        text('days', 'offering.schedule', 20, places(SERVICES, 'days', [2, 1, 2, 0])),
        text('times', 'offering.schedule', 16, places(SERVICES, 'times', [2, 1, 2, 0]))
      ]
    },
    {
      name: 'steps',
      items: { min: 0, max: 3 },
      itemsFrom: { min: 'invented: a card without steps', max: 'invented: the most steps a card stores' },
      fields: [
        {
          name: 'icon',
          kind: 'editorial.item_icon',
          type: 'icon',
          storage: 'image-file',
          frame: { width: 48, height: 48 },
          for: ['step'],
          slots: places(SERVICES, 'step-icon', [3, 2, 1, 0])
        },
        text('step', 'step.title', 24, places(SERVICES, 'step', [3, 2, 1, 0]))
      ],
      lists: [
        {
          name: 'tips',
          items: { min: 0, max: 1 },
          itemsFrom: { min: 'invented: a step without a tip', max: 'invented: one tip per step' },
          fields: [
            text(
              'tip',
              'step.description',
              60,
              places(STEP_ROWS, 'tip', [1, 1, 1, 1, 1, 1]).map((p, i) => [`${p[0]}-${i + 1}`])
            )
          ]
        }
      ]
    }
  ]
  block('team-cards').itemLists = [
    {
      name: 'links',
      items: { min: 0, max: 2 },
      itemsFrom: { min: 'invented: a card without links', max: 'invented: two links per card' },
      fields: [
        { name: 'link', kind: 'person.social_url', type: 'link', slots: places(TEAM, 'link', [2, 2, 2, 2]) },
        {
          name: 'network-icon',
          kind: 'editorial.item_icon',
          type: 'icon',
          storage: 'class-name',
          iconOf: 'network',
          frame: { width: 18, height: 18 },
          slots: places(TEAM, 'link-icon', [2, 2, 2, 2])
        }
      ]
    }
  ]
  block('footer-main').lists = [
    {
      name: 'hours',
      items: { min: 0, max: 2 },
      itemsFrom: { min: 'invented: the footer without lines', max: 'invented: two stored lines' },
      fields: [text('line', 'offering.schedule', 32, places(['footer-main.block'], 'line', [2]))]
    }
  ]
  return store
}

const b = (block, label, data, reason) => ({ block, label, data, reason })
/** A composition of the pottery studio that passes the gate. */
export const potteryComposition = () => ({
  pages: [
    {
      pageType: 'home',
      name: 'Home',
      blocks: [
        b('hero-home', 'Top banner', ['business-name'], 'Your studio name comes first.'),
        b('services-grid', 'Classes', [WHEEL, HAND, GLAZE], 'Your three classes with their times.'),
        b('contact-strip', 'Contact', ['contact-phone', 'contact-address'], 'Visitors can call or find you.'),
        b('footer-main', 'Footer', ['business-name'], 'Your name at the end of every page.')
      ]
    },
    {
      pageType: 'team',
      name: 'Teacher',
      blocks: [b('team-cards', 'Teacher', [ODILE], 'Your teacher and where she shares her work.')]
    }
  ],
  assumptions: [],
  leftOut: []
})

export const composeInputs = (profile = potteryProfile()) => ({
  profile,
  blockStore: potteryStore(),
  pageRecipes: Club.pageRecipes(),
  library: Club.library(),
  template: Club.template(),
  brand: Club.brand(),
  planId: 'plan-kilnmere',
  model: Club.scriptedModel(JSON.stringify(potteryComposition()))
})
export const { scriptedModel } = Club
