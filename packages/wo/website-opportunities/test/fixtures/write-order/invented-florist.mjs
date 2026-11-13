// The saved step values of an invented florist's build (ticket #597), each produced by the REAL module with scripted
// fake models: the needs profile (`needsProfileOf`), the answers (`composePlan` settles them), the plan (`composePlan`
// with a scripted composition), the copy (`writePages`, one call per page as the step chain runs it) and the pictures
// and icons (`picturesStep` with a scripted vision and a scripted ranker). Nothing here is a real business, person,
// review, link or picture: the phone numbers are 555 numbers and every link is on an `.example` host.
import { TRACY_LIBRARY } from '../../../domain/library.mjs'
import { needsProfileOf } from '../../../domain/needs-profile.mjs'
import { writePages } from '../../../domain/page-writer.mjs'
import { picturesStep } from '../../../domain/picture-step.mjs'
import { composePlan } from '../../../domain/plan-composer.mjs'
import { firstCandidate, iconLibrary, scriptedWriter } from '../icon-fields/invented-yoga.mjs'
import { scriptedModel } from '../plan-composer/invented-club.mjs'
import { visionReply } from '../picture-policy/invented-pictures.mjs'
import { FLORIST_TEMPLATE, floristBlockStore, floristPageRecipes } from './florist-store.mjs'
import { floristResearch } from './florist-research.mjs'

export { FLORIST_TEMPLATE, floristBlockStore, floristPageRecipes, floristResearch, scriptedModel }

/** The label the customer typed for the main button, and what the scripted writer writes there instead. */
export const ANSWERED_LABEL = 'Order a bouquet today'
export const WRITTEN_LABEL = 'Shop now'
export const SOCIAL = Object.freeze({
  instagram: 'https://www.instagram.com/larkspur_florist_example',
  facebook: 'https://www.facebook.com/larkspur.florist.example',
  tiktok: 'https://www.tiktok.com/@larkspur.florist.example'
})

export const floristProfile = () => {
  const { research, reading } = floristResearch()
  return needsProfileOf(research, reading)
}

const block = (id, label, data, reason) => ({ block: id, label, data, reason })
/** A composition the rules gate accepts: home, one bouquet page and a contact page. */
export const floristComposition = (services, photos) => ({
  pages: [
    {
      pageType: 'home',
      name: 'Home',
      blocks: [
        block(
          'header-main',
          'Top bar',
          ['contact-cta-url', 'contact-cta-label'],
          'Visitors can order from every page.'
        ),
        block('masthead', 'Page title', ['business-name'], 'Each page has its own title.'),
        block('hero-home', 'Top banner', ['business-name'], 'Your shop name comes first.'),
        block('bouquets', 'Bouquets', services, 'The bouquets you sell, with their prices.'),
        block('gallery-strip', 'Photos', photos, 'Your own photos of the shop.'),
        block(
          'contact-strip',
          'Contact',
          [
            'contact-phone',
            'contact-email',
            'contact-address',
            'contact-hours',
            'contact-social-url',
            'contact-social-url-2'
          ],
          'Visitors can call, write or find you.'
        ),
        block(
          'footer-main',
          'Footer',
          ['business-name', 'contact-social-url', 'contact-social-url-2', 'contact-social-url-3'],
          'Your links at the end of every page.'
        )
      ]
    },
    {
      pageType: 'bouquet',
      name: 'Wild meadow bouquet',
      blocks: [
        block(
          'header-main',
          'Top bar',
          ['contact-cta-url', 'contact-cta-label'],
          'Ordering stays one click away.'
        ),
        block('bouquet-detail', 'Bouquet', [services[0]], 'Your best seller has its own page.'),
        block('footer-main', 'Footer', ['business-name'], 'Your name at the end of every page.')
      ]
    },
    {
      pageType: 'contact',
      name: 'Visit us',
      blocks: [
        block(
          'header-main',
          'Top bar',
          ['contact-cta-url', 'contact-cta-label'],
          'Ordering stays one click away.'
        ),
        block(
          'contact-strip',
          'Contact',
          ['contact-phone', 'contact-email', 'contact-address'],
          'Visitors can find you.'
        ),
        block('footer-main', 'Footer', ['business-name'], 'Your name at the end of every page.')
      ]
    }
  ],
  assumptions: [],
  leftOut: []
})

/** What the scripted writer writes, by field kind; the main button gets another label than the customer's answer. */
const WRITES = {
  'contact.cta_label': WRITTEN_LABEL,
  'business.tagline': 'Flowers cut this morning',
  'business.copyright': 'Example Larkspur Florist',
  'editorial.heading': 'Our bouquets',
  'offering.description': 'Meadow flowers tied by hand.',
  'editorial.button_label': 'See all reviews'
}
export const floristWriter = () => scriptedWriter((_key, slot) => WRITES[slot.kind] ?? 'Fresh flowers')

/** The shared invented icon library with a flower mark, so a bouquet can be given an icon. */
export const floristIcons = () => {
  const library = iconLibrary()
  library.icons.push({ name: 'flower', tags: ['bouquet', 'flowers', 'posy', 'florist'], categories: [] })
  return library
}

const labelAll = () =>
  scriptedModel(
    ...Array.from(
      { length: 4 },
      () => (request) => visionReply(JSON.parse(request.user).pictures.map((p) => p.id))
    )
  )

/** Every saved step value of the florist's build, from the real modules. */
export async function floristBuild() {
  const blockStore = floristBlockStore()
  const pageRecipes = floristPageRecipes()
  const research = floristProfile()
  const services = research.items.service.map((s) => s.id)
  const photos = research.items.gallery.map((g) => g.id)
  const composed = await composePlan({
    profile: research,
    answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: ANSWERED_LABEL }],
    blockStore,
    pageRecipes,
    library: TRACY_LIBRARY,
    template: FLORIST_TEMPLATE,
    brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
    // A research brand, not the brand step's record (#616): read through the test-only fallback.
    allowTemplateLook: true,
    planId: 'plan-larkspur',
    model: scriptedModel(JSON.stringify(floristComposition(services, photos)))
  })
  const { plan, profile } = composed
  // One writer step per page, as the step chain runs it (`writer:<page>`).
  const writers = []
  for (const page of plan.pages) {
    const out = await writePages({
      plan: { ...plan, pages: [page] },
      profile,
      blockStore,
      library: TRACY_LIBRARY,
      model: floristWriter()
    })
    writers.push({ page: out.pages[0], prompt: out.prompt })
  }
  const pictures = await picturesStep({
    plan,
    profile,
    blockStore,
    library: TRACY_LIBRARY,
    vision: labelAll(),
    copy: { pages: writers.map((w) => w.page) },
    iconLibrary: floristIcons(),
    model: scriptedModel(firstCandidate(), firstCandidate())
  })
  return {
    run: { id: 'run-larkspur-1', kind: 'build' },
    aiq: {
      ref: 'example-petal/j6@1.0.0',
      blockStore,
      pageRecipes,
      library: TRACY_LIBRARY,
      template: FLORIST_TEMPLATE
    },
    approval: { plan, profile, edits: [] },
    look: {
      accent: plan.look.accent,
      accentFrom: 'brand',
      logo: { kind: 'text', text: 'Example Larkspur Florist' }
    },
    writers,
    pictures,
    icons: pictures
  }
}
