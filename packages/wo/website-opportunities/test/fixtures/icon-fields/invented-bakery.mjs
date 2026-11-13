// An invented bakery on an invented template shaped as Contract A declares JA Boxing's blocks since #583 (ticket #595):
// a bakers block whose cards hold a child list of network links (`itemLists.social`, each row a `link` of kind
// `person.social_url` and its `network-icon`, `iconOf: "network"`, `storage: "class-name"`), a block level list of the
// bakery's own links (`lists.social`, `contact.social_url`), a specialties block with a light and dark icon pair
// (`variantOf`, `theme`, `for`), a header logo pair and an illustration pair. Nothing here is a real business, person,
// template, link or model.
import { writePages } from '../../../domain/page-writer.mjs'
import { scriptedWriter } from './invented-yoga.mjs'

const sources = ['site']
const text = (name, kind, limit) => ({ name, kind, type: 'text', limit })
const network = { kind: 'editorial.item_icon', type: 'icon', storage: 'class-name', iconOf: 'network' }
const pair = (name, kind, type, extra) => [
  { name, kind, type, frame: { width: 64, height: 64 }, theme: 'dark', ...extra },
  {
    name: `${name}-2`,
    kind,
    type,
    frame: { width: 64, height: 64 },
    theme: 'light',
    variantOf: name,
    ...extra
  }
]

/** The invented template's block store. */
export const bakeryStore = () => ({
  blocks: [
    {
      id: 'header',
      type: 'header',
      items: { min: 1, max: 1 },
      noData: { rule: 'hide' },
      fields: pair('logo', 'business.logo', 'image')
    },
    {
      id: 'bakers',
      type: 'team',
      items: { min: 1, max: 2 },
      noData: { rule: 'hide' },
      fields: [text('heading', 'editorial.heading', 30)],
      itemFields: [text('name', 'person.name', 30)],
      itemLists: [
        {
          name: 'social',
          items: { min: 0, max: 3 },
          fields: [
            { name: 'link', kind: 'person.social_url', type: 'link' },
            { name: 'network-icon', ...network, frame: { width: 18, height: 18 } }
          ]
        }
      ]
    },
    {
      id: 'bakery-links',
      type: 'contact',
      items: { min: 1, max: 1 },
      noData: { rule: 'hide' },
      fields: [text('heading', 'editorial.heading', 30)],
      lists: [
        {
          name: 'social',
          items: { min: 0, max: 2 },
          fields: [
            text('label', 'contact.social_label', 30),
            { name: 'link', kind: 'contact.social_url', type: 'link' },
            { name: 'network-icon', ...network, frame: { width: 18, height: 18 } }
          ]
        }
      ]
    },
    {
      id: 'specialties',
      type: 'services',
      items: { min: 1, max: 2 },
      noData: { rule: 'hide' },
      fields: [...pair('art', 'editorial.illustration', 'image')],
      itemFields: [
        text('heading-2', 'editorial.heading', 36),
        text('note', 'editorial.paragraph', 80),
        ...pair('item-icon', 'editorial.item_icon', 'icon', { storage: 'image-file', for: ['heading-2'] })
      ]
    }
  ]
})

export const BAKER_LINKS = [
  'https://www.instagram.com/example.baker.one',
  'https://www.tiktok.com/@example.baker'
]
export const BAKERY_LINK = 'https://www.pinterest.com/example.bakery'
const person = (id, name, links) => ({
  id,
  kind: 'person',
  fields: { 'person.name': { value: name, sources }, 'person.social_url': { value: links, sources } },
  sources
})
const service = (id, name) => ({
  id,
  kind: 'service',
  fields: { 'offering.name': { value: name, sources } },
  sources
})

/** The bakery's needs profile: one baker with two network links, one with one, and the bakery's own link. */
export const bakeryProfile = () => ({
  sources: [{ id: 'site', origin: 'website' }],
  facts: {
    'business.name': [{ value: 'Saffron Lane Bakehouse', sources }],
    'contact.social_url': [{ value: BAKERY_LINK, sources }]
  },
  items: {
    person: [
      person('person-wren', 'Wren Alder', BAKER_LINKS),
      person('person-oskar', 'Oskar Fenn', 'facebook.com/example.oskar')
    ],
    service: [service('rye', 'Rye loaf'), service('buns', 'Cardamom buns')]
  }
})

const block = (id, type, blockId, data) => ({
  id,
  type,
  block: blockId,
  source: 'template',
  label: type,
  data
})
/** An approved plan placing every block of the bakery's store on the home page. */
export const bakeryPlan = () => ({
  language: 'en',
  pages: [
    {
      id: 'home',
      blocks: [
        block('b0', 'header', 'header', []),
        block('b1', 'team', 'bakers', ['person-wren', 'person-oskar']),
        block('b2', 'contact', 'bakery-links', ['contact-social-url']),
        block('b3', 'services', 'specialties', ['rye', 'buns'])
      ]
    }
  ],
  pictures: { own: { frames: 0, from: [] }, generated: { frames: 6 } }
})

/** The written copy, from the REAL page writer with a scripted writer: a heading and a note per specialty. */
export function bakeryCopy() {
  const write = (key, slot) => {
    if (key.endsWith('/heading-2')) return key.includes('/rye/') ? 'Rye loaf' : 'Cardamom buns'
    if (key.endsWith('/note')) return 'Coffee corner and tea'
    return /heading|name/.test(slot.kind ?? '') ? 'Fresh every morning' : 'Baked before dawn.'
  }
  return writePages({
    plan: bakeryPlan(),
    profile: bakeryProfile(),
    blockStore: bakeryStore(),
    model: scriptedWriter(write)
  })
}
