// The invented florist on the real JA Boxing store, as the plan gate review tests compose it (#593 review): the
// composer input, a home page, a contact page and the people the tests hold. Nothing here is a real business.
import { TRACY_LIBRARY } from '../../../domain/library.mjs'
import { composerContextOf } from '../../../domain/plan-composer.mjs'
import { boxingRecipes, boxingStore } from './boxing-florist.mjs'

export const src = ['site']
export const INPUT = {
  answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: 'Order a bouquet today' }],
  blockStore: boxingStore,
  pageRecipes: boxingRecipes,
  library: TRACY_LIBRARY,
  template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
  brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
  allowTemplateLook: true,
  planId: 'p'
}
export const contextOf = (profile) => composerContextOf({ ...INPUT, profile })
export const b = (id, data) => ({ block: id, label: id, data, reason: 'Shown.' })
export const SHARED = () => [
  b('header', ['business-name']),
  b('block-176', ['contact-cta-url', 'contact-cta-label'])
]
export const person = (n, name) => ({
  id: `person-p${n}`,
  kind: 'person',
  fields: {
    'person.name': { value: name, sources: src, confidence: 'single-source' },
    'person.role': { value: 'florist', sources: src, confidence: 'single-source' }
  },
  sources: src,
  confidence: 'single-source'
})

export function homeOf(profile, extra = []) {
  const services = profile.items.service.map((s) => s.id)
  return {
    pageType: 'home',
    name: 'Home',
    blocks: [
      ...SHARED(),
      b('block-156', ['business-name', 'contact-cta-url', 'contact-cta-label']),
      b('block-160', [services[0]]),
      ...extra,
      b(
        'block-166',
        profile.items.gallery.map((g) => g.id)
      )
    ]
  }
}
export const SOCIAL = ['contact-social-url', 'contact-social-url-2', 'contact-social-url-3']
export const contactPage = (social = SOCIAL) => ({
  pageType: 'contact',
  name: 'Contact',
  blocks: [
    ...SHARED(),
    b('contact-details', ['contact-phone', 'contact-email', 'contact-address']),
    b('block-171', social)
  ]
})
export const composition = (pages, assumptions = []) => ({ pages, assumptions, leftOut: [] })
