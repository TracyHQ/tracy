// Shared inputs of the icon field tests (ticket #595): an invented yoga studio built on an invented template whose
// features block is shaped like JA Boxing's (four items, each with a heading, a text and two icon fields of a 100 by
// 100 frame, the template's two theme files of one icon, a `variantOf` pair) and whose demo icons are a boxing glove, a ring, a heavy bag
// and a target. A footer row of social links and a trainer block with block level social icons, as JA Boxing declares
// them, and a small icon library in the shape of the picture step's (names, tags, categories). Nothing here is a real
// business, person, template, link or model.
import { writePages } from '../../../domain/page-writer.mjs'
import { scriptedModel } from '../plan-composer/invented-club.mjs'

export { scriptedModel }

/** The template's demo icon files and the library names that copy them: none may be left on a built site. */
export const DEMO_ICONS = Object.freeze({
  refs: [
    'images/demo/icons/glove.png',
    'images/demo/icons/ring.png',
    'images/demo/icons/heavy-bag.png',
    'images/demo/icons/target.png'
  ],
  names: ['boxing-glove', 'target']
})

const icon = (name, tags, categories = []) => ({ name, tags, categories })
/** An icon library in the picture step's shape: real Phosphor names with invented, trimmed tag lists. */
export const iconLibrary = () => ({
  set: '@phosphor-icons/core@2.1.1',
  icons: [
    icon('boxing-glove', ['boxing', 'fight', 'glove', 'sport']),
    icon('target', ['goal', 'aim', 'bullseye', 'focus']),
    icon('barbell', ['gym', 'weights', 'strength']),
    icon('sun', ['sunrise', 'morning', 'day']),
    icon('moon', ['evening', 'night', 'sleep']),
    icon('wind', ['breath', 'breathing', 'breathwork', 'air']),
    icon('flower-lotus', ['meditation', 'spirituality', 'calm']),
    icon('leaf', ['tea', 'herbal', 'plants']),
    icon('person-simple-tai-chi', ['yoga', 'stretch', 'balance']),
    // Phosphor's own tags of these five, for the scoring cases of the review (#595): a number word or a body verb must
    // not outrank the heading.
    icon('tooth', ['teeth', 'dentistry', 'medical', 'medicine', 'doctor', 'cavity']),
    icon('dice-six', ['die', 'rolling', 'gamble', 'gambling', 'casino', 'gaming', '6']),
    icon('number-one', ['1', 'numbers', 'numerals']),
    icon('train', ['vehicles', 'subway', 'light rail', 'public transit', 'transportation', 'commuter']),
    icon('users-three', ['user', 'group', 'team', 'community', 'people', 'profiles', 'accounts', 'contacts']),
    icon('coffee', ['tea', 'java', 'beverages', 'drinks', 'cafe', 'cup', 'mug', 'espresso']),
    icon('instagram-logo', ['social', 'photos'], ['brands']),
    icon('facebook-logo', ['social'], ['brands'])
  ]
})

const text = (name, kind, limit) => ({ name, kind, type: 'text', limit })
const iconField = (name, extra = {}) => ({
  name,
  kind: 'editorial.item_icon',
  type: 'icon',
  frame: { width: 100, height: 100 },
  storage: 'image-file',
  ...extra
})

/** The invented template's block store. */
export const blockStore = () => ({
  blocks: [
    {
      id: 'features-row',
      type: 'services',
      items: { min: 1, max: 4 },
      noData: { rule: 'hide' },
      fields: [text('heading', 'editorial.heading', 30)],
      itemFields: [
        text('heading-2', 'editorial.heading', 36),
        text('paragraph-2', 'editorial.paragraph', 106),
        iconField('item-icon', { theme: 'dark' }),
        iconField('item-icon-2', { theme: 'light', variantOf: 'item-icon' })
      ]
    },
    {
      id: 'footer-social',
      type: 'footer',
      items: { min: 1, max: 4 },
      noData: { rule: 'hide' },
      fields: [],
      itemFields: [
        text('social-label', 'contact.social_label', 40),
        { name: 'social-url', kind: 'contact.social_url', type: 'link' },
        {
          name: 'item-icon',
          kind: 'editorial.item_icon',
          type: 'icon',
          storage: 'class-name',
          iconOf: 'network'
        }
      ]
    },
    {
      id: 'trainer',
      type: 'team',
      items: { min: 1, max: 1 },
      noData: { rule: 'hide' },
      fields: [
        text('person-name', 'person.name', 36),
        { name: 'social-1-social-url', kind: 'contact.social_url', type: 'link' },
        { name: 'social-2-social-url', kind: 'contact.social_url', type: 'link', optional: true },
        {
          name: 'social-1-item-icon',
          kind: 'editorial.item_icon',
          type: 'icon',
          storage: 'class-name',
          iconOf: 'network'
        },
        {
          name: 'social-2-item-icon',
          kind: 'editorial.item_icon',
          type: 'icon',
          storage: 'class-name',
          iconOf: 'network'
        }
      ]
    },
    {
      id: 'class-detail',
      type: 'services',
      items: { min: 1, max: 1 },
      noData: { rule: 'hide' },
      fields: [
        text('heading-3', 'editorial.heading', 40),
        iconField('item-icon', { for: ['heading-3'] }),
        iconField('item-icon-2')
      ]
    }
  ]
})

export const CLASSES = ['class-sunrise', 'class-breath', 'class-lotus', 'class-passes']
const sources = ['site']
const service = (id, name) => ({
  id,
  kind: 'service',
  fields: { 'offering.name': { value: name, sources } },
  sources
})

/** The invented studio's needs profile: four classes (plan labels on purpose unlike the written headings) and links. */
export const yogaProfile = () => ({
  sources: [{ id: 'site', origin: 'website' }],
  facts: {
    'business.name': [{ value: 'Juniper Hollow Yoga', sources }],
    'contact.social_url': [
      { value: 'https://www.instagram.com/example.juniper.yoga', sources },
      { value: 'https://forum.example/juniper-hollow', sources }
    ]
  },
  items: {
    service: CLASSES.map((id, n) => service(id, `Class ${n + 1}`)),
    person: [
      {
        id: 'person-ada',
        kind: 'person',
        fields: { 'person.name': { value: 'Ada Quill', sources } },
        sources
      }
    ]
  }
})

const block = (id, type, blockId, data) => ({
  id,
  type,
  block: blockId,
  source: 'template',
  label: type,
  data,
  reason: 'x'
})
/** An approved plan placing the features row, the footer, the trainer and a class page. */
export const yogaPlan = () => ({
  language: 'en',
  pages: [
    {
      id: 'home',
      name: 'Home',
      pageType: 'home',
      blocks: [
        block('home-b1', 'services', 'features-row', [...CLASSES]),
        block('home-b2', 'team', 'trainer', ['person-ada', 'contact-social-url']),
        block('home-b3', 'footer', 'footer-social', ['contact-social-url', 'contact-social-url-2'])
      ]
    },
    {
      id: 'class',
      name: 'Class',
      pageType: 'class',
      blocks: [block('class-b1', 'services', 'class-detail', [CLASSES[0]])]
    }
  ],
  pictures: { own: { frames: 0, from: [] }, generated: { frames: 0 } }
})

/** The headings and texts the scripted writer writes for each class. */
export const HEADINGS = {
  'class-sunrise': ['Sunrise flow', 'A slow practice as the day begins.'],
  'class-breath': ['Breathwork circle', 'Learn to slow down and steady each breath.'],
  'class-lotus': ['Lotus meditation', 'Sit still and settle the mind.'],
  'class-passes': ['Studio passes', 'Ten visits, shared with a friend.']
}

/** A scripted page writer: each slot key it is asked gets the text `write(key, slot)` gives, cut to its limit. */
export const scriptedWriter = (write) => {
  const calls = []
  const model = async (request) => {
    calls.push(request)
    const user = JSON.parse(request.user)
    const fields = {}
    for (const block of user.blocks)
      for (const slot of block.fields) {
        const text = write(slot.key, slot) ?? 'Calm practice'
        fields[slot.key] = text.slice(0, slot.limit ?? text.length)
      }
    return JSON.stringify({ fields })
  }
  return Object.assign(model, { calls })
}

/** The written copy of a plan, from the REAL page writer (`writePages`) with a scripted writer of these headings. */
export function yogaCopy(
  headings = HEADINGS,
  { plan = yogaPlan(), profile = yogaProfile(), store = blockStore() } = {}
) {
  const write = (key) => {
    const [, item, field] = key.split('/')
    if (headings[item] && field === 'heading-2') return headings[item][0]
    if (headings[item] && field === 'paragraph-2') return headings[item][1]
    if (key === 'class-b1/heading-3') return 'Evening wind down'
    return 'Calm practice'
  }
  return writePages({ plan, profile, blockStore: store, model: scriptedWriter(write) })
}

/** A fake build model ranking each item's first candidate, with per item overrides (a list, or a function of it). */
export const firstCandidate =
  (over = {}) =>
  (request) => ({
    icons: Object.fromEntries(
      JSON.parse(request.user).items.map((i) => [i.id, i.id in over ? over[i.id] : i.candidates.slice(0, 1)])
    )
  })
