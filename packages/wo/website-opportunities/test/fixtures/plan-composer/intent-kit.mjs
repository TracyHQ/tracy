// The plan stage intent scenario (#575): the invented club with a content brief, and the invented template with a call
// to action band on the home page, a social links row and a second phone field. Invented data only.
import { blockStore, brand, clubProfile, library, pageRecipes, template } from './invented-club.mjs'

export const brief = (extra = {}) => ({
  keyMessages: [
    { id: 'km-1', label: 'Coaching for every age', factRefs: ['f1'], quotes: [{ text: 'every age' }] },
    { id: 'km-2', label: 'Courts kept in top shape', factRefs: ['f2'], quotes: [{ text: 'always swept' }] }
  ],
  missing: [{ field: 'prices', why: 'No supported price.' }],
  ...extra
})
export const inputs = (model, overrides = {}) => ({
  profile: clubProfile(),
  blockStore: blockStore(),
  pageRecipes: pageRecipes(),
  library: library(),
  template: template(),
  brand: brand(),
  planId: 'plan-club',
  model,
  brief: brief(),
  ...overrides
})
export const reply = (c) => JSON.stringify(c)
export const page = (plan, type) => plan.pages.find((p) => p.pageType === type)

/** The invented template with a call to action band on the home page, a social row and a second phone field. */
export function richerKit() {
  const store = blockStore()
  store.blocks.push(
    {
      id: 'cta-band',
      type: 'call_to_action',
      source: 'template',
      positions: ['content'],
      items: { min: 1, max: 1 },
      noData: { rule: 'hide' },
      fields: [
        { name: 'heading', kind: 'editorial.heading', type: 'text', limit: 40 },
        { name: 'cta_label', kind: 'contact.cta_label', type: 'text', limit: 30 },
        { name: 'cta_link', kind: 'contact.cta_url', type: 'link' }
      ],
      itemFields: []
    },
    {
      id: 'social-row',
      itemsLabel: 'Social links',
      type: 'footer',
      source: 'template',
      positions: ['footer'],
      items: { min: 1, max: 4 },
      noData: { rule: 'hide' },
      fields: [],
      itemFields: [
        {
          name: 'social',
          kind: 'contact.social_url',
          type: 'link',
          slots: [1, 2, 3, 4].map((n) => `social-row.item${n}.link`)
        }
      ]
    }
  )
  const contact = store.blocks.find((b) => b.id === 'contact-strip')
  contact.fields.push({ name: 'phone-2', kind: 'contact.phone', type: 'link' })
  const recipes = pageRecipes()
  const home = recipes.recipes.find((r) => r.pageType === 'home')
  home.blocks.splice(home.blocks.indexOf('footer-main'), 0, 'cta-band')
  for (const r of recipes.recipes) r.blocks.push('social-row')
  return { blockStore: store, pageRecipes: recipes }
}
