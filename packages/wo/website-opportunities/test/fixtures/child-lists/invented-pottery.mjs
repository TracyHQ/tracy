// Shared inputs of the child list tests (ticket #615): an invented pottery studio (research and the scripted reading a
// fake build model returns), the invented club template with child lists added (`invented-pottery-store.mjs`) and a
// composition that passes the gate. Nothing here is a real business, person, address or phone number; the profile links
// use real network hosts (the icon step knows networks by host) with invented handles.
import { needsProfileOf } from '../../../domain/needs-profile.mjs'
import * as Club from '../plan-composer/invented-club.mjs'
import { potteryStore } from './invented-pottery-store.mjs'

export { potteryStore }

const SITE_TEXT = [
  'Kilnmere Clay Studio, 14 Larchwick Lane, Example Town. Call +1 555 0142.',
  'Wheel basics: Tue and Thu, 18:00 to 20:00. Also Sat, 10:00 to 12:00. Also Sun, 14:00 to 16:00.',
  'How a pot starts: Wedge the clay, pressing out every air pocket. Center on the wheel.',
  'Hand building: Wed, 19:00 to 21:00.',
  'Glaze night is open to every member.',
  'Our teacher Odile Brannoch shares her work at https://instagram.com/kilnmere.odile and https://youtube.com/@odile-throws.',
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
            fields: { 'person.social_url': 'https://instagram.com/kilnmere.odile' },
            evidence: 'https://instagram.com/kilnmere.odile'
          },
          {
            fields: { 'person.social_url': 'https://youtube.com/@odile-throws' },
            evidence: 'https://youtube.com/@odile-throws'
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
