// Shared inputs of the picture policy tests (ticket #595): the invented tennis club of the plan composer tests with a
// few more invented pictures (a free terrace photo, a club crest, a stock photo, a coach photo, a video), an invented
// template with a hero video frame and service cards with a photo per item, and a plan placing them. Nothing here is a
// real business, person, template or supplier picture.
import { blockStore, clubProfile, COACH, PHOTOS, SERVICES } from '../plan-composer/invented-club.mjs'

export { COACH, PHOTOS, SERVICES }
export { scriptedModel } from '../plan-composer/invented-club.mjs'

const image = (name, kind, extra = {}) => ({ name, kind, type: 'image', ...extra })

/** The invented template's blocks: the composer fixture's, a hero with a video frame and service cards with photos. */
export function pictureBlocks() {
  const blocks = new Map(blockStore().blocks.map((b) => [b.id, b]))
  blocks.set('hero-video', {
    id: 'hero-video',
    type: 'hero',
    items: { min: 1, max: 1 },
    fields: [
      { name: 'heading', kind: 'business.tagline', type: 'text', limit: 60 },
      image('photo', 'business.hero_image'),
      image('clip', 'business.hero_image', { media: 'video' })
    ],
    itemFields: []
  })
  blocks.set('service-cards', {
    id: 'service-cards',
    type: 'services',
    items: { min: 2, max: 4 },
    fields: [{ name: 'heading', kind: 'editorial.heading', type: 'text', limit: 30 }],
    itemFields: [
      { name: 'name', kind: 'offering.name', type: 'text', limit: 40 },
      image('photo', 'offering.image')
    ]
  })
  return blocks
}

const gallery = (id, label, extra = {}) => ({
  id,
  kind: 'gallery',
  fields: {
    'business.gallery_image': { value: `https://brindlewick-tennis.example/img/${id}.jpg`, sources: ['site'] }
  },
  sources: ['site'],
  label,
  ...extra
})

/** The club's needs profile with the extra invented pictures. */
export function pictureProfile({ unlabelCourts = false } = {}) {
  const profile = clubProfile()
  const photos = profile.items.gallery
  if (unlabelCourts) delete photos.find((p) => p.id === PHOTOS[0]).label
  photos.push(
    gallery('gallery-terrace', 'Courts seen from the terrace', {
      width: 1920,
      height: 1080,
      content: 'venue-exterior'
    }),
    gallery('gallery-crest', 'Club crest', { content: 'logo', width: 1200, height: 800 }),
    gallery('gallery-stock-racket', 'Racket on a court', { stock: true, width: 1920, height: 1080 })
  )
  const coach = profile.items.person.find((p) => p.id === COACH)
  coach.fields['person.image'] = {
    value: 'https://brindlewick-tennis.example/img/coach.jpg',
    sources: ['site']
  }
  const hire = profile.items.service.find((s) => s.id === SERVICES[2])
  hire.fields['offering.image'] = {
    value: 'https://brindlewick-tennis.example/img/hire.jpg',
    sources: ['site']
  }
  return profile
}

/** An own video record of the club's channel, as research hands it to the pictures step. */
export const clubVideo = (over = {}) => ({
  id: 'video-rally',
  ref: 'https://brindlewick-tennis.example/media/rally.mp4',
  media: 'video',
  item: null,
  itemKind: 'video',
  label: null,
  width: 1920,
  height: 1080,
  stock: false,
  from: ['Website'],
  ...over
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

/** An approved plan placing the hero, the service cards, the gallery and the coach. */
export function picturePlan(over = {}) {
  return {
    pages: [
      {
        id: 'home',
        name: 'Home',
        pageType: 'home',
        blocks: [
          block('home-b1', 'hero', 'hero-video', ['business-name']),
          block('home-b2', 'services', 'service-cards', [...SERVICES]),
          block('home-b3', 'gallery', 'gallery-strip', [...PHOTOS])
        ]
      },
      {
        id: 'team',
        name: 'Coaches',
        pageType: 'team',
        blocks: [block('team-b1', 'team', 'team-cards', [COACH])]
      }
    ],
    pictures: { own: { frames: 0, from: [] }, generated: { frames: 6, reason: 'Some spots.' } },
    ...over
  }
}

/** A scripted vision reply labelling the given ids. */
export const visionReply = (ids, over = {}) => ({
  pictures: ids.map((id) => ({
    id,
    label: `Invented label of ${id}`,
    content: 'venue-exterior',
    people: false,
    burnedInText: false,
    orientation: 'landscape',
    ...over[id]
  }))
})
