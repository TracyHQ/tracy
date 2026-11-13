// Shared inputs of the plan composer tests (ticket #593): the invented tennis club of the needs profile tests, an
// invented template's block store, page recipes and Tracy library, an invented brand record, a composition that passes
// the gate, and a scripted fake build model. Nothing here is a real business, template or model.
import { readFileSync } from 'node:fs'
import { needsProfileOf } from '../../../domain/needs-profile.mjs'

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const CLUB = json('../needs-profile/tennis-club.json')

export const clubResearch = () => structuredClone(CLUB)
export const clubProfile = () => needsProfileOf(CLUB.research, CLUB.reading)
export const blockStore = () => json('./block-store.json')
export const pageRecipes = () => json('./page-recipes.json')
export const library = () => json('./library.json').blocks
export const template = () => ({
  slug: 'example-court',
  name: 'Example Court',
  version: '1.0.0',
  accent: '#225588'
})
export const brand = () => ({
  website: { origin: 'website', colors: [{ hex: '#1F7A4D', role: 'primary' }] },
  logoResearch: { status: 'found', chosen: { mediaId: 'm1', source: 'instagram' } }
})

export const SERVICES = [
  'service-junior-coaching',
  'service-adult-group-lessons',
  'service-court-hire',
  'service-cardio-tennis'
]
export const PHOTOS = [
  'gallery-https-brindlewick-tennis-example-img-courts-jpg',
  'gallery-https-images-example-brindlewick-clubhouse-jpg',
  'gallery-https-images-example-brindlewick-cardio-jpg'
]
export const REVIEWS = [
  'quote-friendly-coaches-and-the-courts-are-always-swept',
  'quote-my-two-kids-love-the-junior-coaching'
]
export const COACH = 'person-ilse-varrow'

const block = (id, label, data, reason, extra = {}) => ({ block: id, label, data, reason, ...extra })

/** A composition that passes the gate: the reviews are left for the gate to place. */
export const goodComposition = () => ({
  pages: [
    {
      pageType: 'home',
      name: 'Home',
      blocks: [
        block('header-main', 'Top bar', ['contact-cta-url'], 'Visitors can book a court from every page.'),
        block('hero-home', 'Top banner', ['business-name'], 'Your club name comes first.', {
          targets: ['heading', 'photo']
        }),
        block('services-grid', 'Services', [...SERVICES], 'All four things you offer, coaching first.'),
        block('gallery-strip', 'Photos', [...PHOTOS], 'Your own photos of the courts and the clubhouse.'),
        block(
          'contact-strip',
          'Contact',
          ['contact-phone', 'contact-address', 'contact-hours'],
          'Visitors can call or find you.'
        ),
        block('footer-main', 'Footer', ['business-name'], 'Your name at the end of every page.')
      ]
    },
    {
      pageType: 'team',
      name: 'Coaches',
      blocks: [block('team-cards', 'Coach', [COACH], 'Your head coach has taught here for nine years.')]
    },
    {
      pageType: 'contact',
      name: 'Contact',
      blocks: [
        block('contact-strip', 'Contact', ['contact-email', 'contact-phone'], 'Messages reach your email.')
      ]
    }
  ],
  assumptions: [
    { field: 'pages[team].name', said: 'Your website calls them coaches, so the page is named Coaches.' }
  ],
  leftOut: [{ what: 'Prices page', kind: 'page', reason: 'Only two of your services show a price.' }]
})

/** A scripted fake build model: answers each call with the next reply, records every request. */
export function scriptedModel(...replies) {
  const calls = []
  const model = async (request) => {
    calls.push(request)
    if (calls.length > replies.length) throw new Error('the fake model was called more times than scripted')
    const reply = replies[calls.length - 1]
    return typeof reply === 'function' ? reply(request) : reply
  }
  return Object.assign(model, { calls })
}
