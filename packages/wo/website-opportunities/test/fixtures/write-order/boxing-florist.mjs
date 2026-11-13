// The invented florist built on the real JA Boxing block store (ticket #597 review): a home page with the header
// button (`block-176`: an editorial button label beside a main button link), the hero, the bouquets, the photos and the
// footer blocks; one detail page per bouquet (`class-detail`, a block whose name field reads the one bouquet it shows);
// a bouquet list page; a contact page. Every step value is made by the real module with scripted fake models.
import { readFileSync } from 'node:fs'
import { TRACY_LIBRARY } from '../../../domain/library.mjs'
import { writePages } from '../../../domain/page-writer.mjs'
import { picturesStep } from '../../../domain/picture-step.mjs'
import { composePlan } from '../../../domain/plan-composer.mjs'
import { firstCandidate, iconLibrary, scriptedWriter } from '../icon-fields/invented-yoga.mjs'
import { scriptedModel } from '../plan-composer/invented-club.mjs'
import { visionReply } from '../picture-policy/invented-pictures.mjs'
import { ANSWERED_LABEL, floristProfile } from './invented-florist.mjs'

const STORE = new URL(
  '../../../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/',
  import.meta.url
)
export const boxingStore = JSON.parse(readFileSync(new URL('block-store.json', STORE), 'utf8'))
export const boxingRecipes = JSON.parse(readFileSync(new URL('page-recipes.json', STORE), 'utf8'))

const block = (id, data) => ({ block: id, label: id, data, reason: 'Shown.' })
const SHARED = [
  block('header', ['business-name']),
  block('block-176', ['contact-cta-url', 'contact-cta-label'])
]
const FOOT = [
  block('block-170', ['business-name']),
  block('block-171', ['contact-social-url', 'contact-social-url-2', 'contact-social-url-3']),
  block('block-175', ['contact-phone', 'contact-email', 'contact-address']),
  block('block-174', ['business-name'])
]

/** The florist profile with an email short enough for the JA Boxing contact block (27 characters). */
export function boxingProfile() {
  const profile = floristProfile()
  profile.facts['contact.email'][0].value = 'hi@larkspur.example'
  return profile
}

/** The default composition: home, the bouquet list, a page per bouquet, contact. */
export function boxingComposition(profile) {
  const services = profile.items.service.map((s) => s.id)
  const photos = (profile.items.gallery ?? []).map((g) => g.id)
  return {
    pages: [
      {
        pageType: 'home',
        name: 'Home',
        blocks: [
          ...SHARED,
          block('block-156', ['business-name', 'contact-cta-url', 'contact-cta-label']),
          block('block-160', [services[0]]),
          block('block-166', photos),
          ...FOOT
        ]
      },
      {
        pageType: 'classes',
        name: 'All bouquets',
        blocks: [...SHARED, block('class-list', services.slice(0, 2))]
      },
      {
        pageType: 'class',
        name: 'Wild meadow bouquet',
        blocks: [...SHARED, block('class-detail', [services[0]])]
      },
      { pageType: 'class', name: 'Seasonal posy', blocks: [...SHARED, block('class-detail', [services[1]])] },
      {
        pageType: 'contact',
        name: 'Visit us',
        blocks: [
          ...SHARED,
          block('contact-details', ['contact-phone', 'contact-email', 'contact-address']),
          ...FOOT
        ]
      }
    ],
    assumptions: [],
    leftOut: []
  }
}

/**
 * The saved step values of the boxing florist build, ready for `buildWriteOrder`.
 * @param {{profile?: object, composition?: object, label?: string, write?: Function}} [options]
 */
export async function boxingFloristBuild(options = {}) {
  const research = options.profile ?? boxingProfile()
  const composition = options.composition ?? boxingComposition(research)
  const reply = JSON.stringify(composition)
  const { plan, profile } = await composePlan({
    profile: research,
    answers: [
      { schema: 'tracy-build-answer/v1', question: 'main-button', text: options.label ?? ANSWERED_LABEL }
    ],
    blockStore: boxingStore,
    pageRecipes: boxingRecipes,
    library: TRACY_LIBRARY,
    template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
    brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
    // A research brand, not the brand step's record (#616): read through the test-only fallback.
    allowTemplateLook: true,
    planId: 'plan-boxing-florist',
    model: scriptedModel(reply, reply)
  })
  const write = options.write ?? ((_key, slot) => `Written ${slot.kind}`)
  const writers = []
  for (const page of plan.pages) {
    const out = await writePages({
      plan: { ...plan, pages: [page] },
      profile,
      blockStore: boxingStore,
      library: TRACY_LIBRARY,
      model: scriptedWriter(write)
    })
    writers.push({ page: out.pages[0], prompt: out.prompt })
  }
  const label = (request) => visionReply(JSON.parse(request.user).pictures.map((p) => p.id))
  const pictures = await picturesStep({
    plan,
    profile,
    blockStore: boxingStore,
    library: TRACY_LIBRARY,
    vision: scriptedModel(...Array.from({ length: 6 }, () => label)),
    copy: { pages: writers.map((w) => w.page) },
    iconLibrary: iconLibrary(),
    model: scriptedModel(firstCandidate(), firstCandidate(), firstCandidate(), firstCandidate())
  })
  return {
    run: { id: 'run-boxing-florist', kind: 'build' },
    aiq: {
      ref: 'ja-boxing/j6@1.0.11',
      blockStore: boxingStore,
      pageRecipes: boxingRecipes,
      library: TRACY_LIBRARY,
      template: { slug: 'ja-boxing', version: '1.0.11' }
    },
    approval: { plan, profile },
    look: { accent: plan.look.accent, accentFrom: 'brand', logo: { kind: 'text' } },
    writers,
    pictures,
    icons: pictures
  }
}
