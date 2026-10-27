/**
 * The 128 site surfaces: what each page must say, and where to read it back from.
 *
 * Site pages are Joomla views and modules, not documents this repo renders, so they carry no
 * build-time field markers. The map below is the substitute the content contract asks for — one
 * CSS selector per field — and it is what makes an observation a reading of the page rather than a
 * copy of the plan.
 *
 * The captured copy lives in `content/tracy-editorial/site-copy.json`, with every business fact written
 * back as a `{{reference}}`. A heading that states a person, a service or an amount therefore
 * resolves through the contract, and changing that fact changes the page the audit expects.
 */
import { readFileSync } from 'node:fs'

const copy = JSON.parse(
  readFileSync(new URL('./content/tracy-editorial/site-copy.json', import.meta.url), 'utf8')
)

export const SITE_SURFACES = Object.keys(copy)

/** Read on every page: the tab title, the page heading where the view renders one, the disclosure. */
const BASE_SELECTORS = {
  'page.title': 'head title',
  'page.heading': '#t4-main-body h1',
  disclosure: '.tracy-site-notice'
}

/**
 * Six surfaces state a fact the contract requires them to state. Each gets its own reading: a
 * selector that names the element, an index when the page repeats the same shape, and an attribute
 * when the fact is a destination rather than a sentence.
 */
const EXTRA = {
  '/': {
    fields: {
      'brand.name': { ref: 'company.name' },
      'hero.cta.href': { ref: 'cta.primary.href' }
    },
    selectors: {
      'brand.name': 'svg title',
      'hero.cta.href': { selector: '[data-od-block="hero"] a', attribute: 'href' }
    }
  },
  '/services': {
    fields: Object.fromEntries(
      ['strategy', 'design', 'development', 'content', 'care', 'campaign'].map((key, i) => [
        `service${i + 1}.name`,
        { ref: `services.${key}.name` }
      ])
    ),
    selectors: Object.fromEntries(
      [
        ['strategy', '/services/website-strategy'],
        ['design', '/services/brand-and-interface-design'],
        ['development', '/services/website-development'],
        ['content', '/services/content-and-photography'],
        ['care', '/services/10-event-invitation-emails-best-practices-and-examples-you-can-steal'],
        ['campaign', '/services/43-22-sure-fire-headline-formulas-that-work']
      ].map(([, href], i) => [
        `service${i + 1}.name`,
        // Anchored on the service's own route, not on card order: a reordered grid must not turn
        // into a passing audit of the wrong service.
        `#t4-main-body .tracy-postcard__body h2 a[href$="${href}"]`
      ])
    )
  },
  '/pricing': {
    fields: {
      'plan1.name': { ref: 'pricing.starter.name' },
      'plan1.amount': { ref: 'pricing.starter.amount' },
      'plan1.period': { ref: 'pricing.starter.period' },
      'plan2.name': { ref: 'pricing.studio.name' },
      'plan2.amount': { ref: 'pricing.studio.amount' },
      'plan2.period': { ref: 'pricing.studio.period' },
      'plan3.name': { ref: 'pricing.foundry.name' },
      'plan3.amount': { ref: 'pricing.foundry.amount' },
      'plan3.period': { ref: 'pricing.foundry.period' },
      'pricing.notice': { ref: 'pricing.notice' }
    },
    selectors: {
      'plan1.name': '.tracy-pricing__grid article:nth-of-type(1) .tracy-plan__name',
      'plan1.amount': '.tracy-pricing__grid article:nth-of-type(1) .tracy-plan__amount',
      'plan1.period': '.tracy-pricing__grid article:nth-of-type(1) .tracy-plan__period',
      'plan2.name': '.tracy-pricing__grid article:nth-of-type(2) .tracy-plan__name',
      'plan2.amount': '.tracy-pricing__grid article:nth-of-type(2) .tracy-plan__amount',
      'plan2.period': '.tracy-pricing__grid article:nth-of-type(2) .tracy-plan__period',
      'plan3.name': '.tracy-pricing__grid article:nth-of-type(3) .tracy-plan__name',
      'plan3.amount': '.tracy-pricing__grid article:nth-of-type(3) .tracy-plan__amount',
      'plan3.period': '.tracy-pricing__grid article:nth-of-type(3) .tracy-plan__period',
      'pricing.notice': '.tracy-pricing__intro'
    }
  },
  '/resources/contact': {
    fields: {
      'contact.title': { ref: 'contact.title' },
      'contact.notice': { ref: 'contact.notice' }
    },
    selectors: {
      'contact.title': '.tracy-view-head__title span',
      'contact.notice': '.tracy-contact__aside .tracy-contact-info__notice'
    }
  },
  '/resources/home-onepage': {
    fields: {
      'brand.name': { ref: 'company.name' },
      'member1.name': { ref: 'team.hale.name' },
      'member2.name': { ref: 'team.lang.name' },
      'member3.name': { ref: 'team.lindqvist.name' },
      'member4.name': { ref: 'team.meyer.name' }
    },
    selectors: {
      'brand.name': 'svg title',
      'member1.name': { selector: '[data-od-block="team"] article h3', index: 0 },
      'member2.name': { selector: '[data-od-block="team"] article h3', index: 1 },
      'member3.name': { selector: '[data-od-block="team"] article h3', index: 2 },
      'member4.name': { selector: '[data-od-block="team"] article h3', index: 3 }
    }
  },
  '/company/team': {
    fields: {
      member1: { template: '{{team.hale.name}} — {{team.hale.role}}' },
      member2: { template: '{{team.lang.name}} — {{team.lang.role}}' },
      member3: { template: '{{team.lindqvist.name}} — {{team.lindqvist.role}}' },
      member4: { template: '{{team.meyer.name}} — {{team.meyer.role}}' }
    },
    selectors: {
      // The cards state name and role as one headline, so the field is one string too — splitting
      // it in the plan would claim a structure the page does not have.
      member1: { selector: '#t4-main-body h2[itemprop="headline"]', index: 0 },
      member2: { selector: '#t4-main-body h2[itemprop="headline"]', index: 1 },
      member3: { selector: '#t4-main-body h2[itemprop="headline"]', index: 2 },
      member4: { selector: '#t4-main-body h2[itemprop="headline"]', index: 3 }
    }
  }
}

// Shared contact facts are observed at both placements, not only seeded into the module.
for (const [id, root] of [
  ['/', '#t4-footnav'],
  ['/resources/contact', '.tracy-contact__aside']
]) {
  EXTRA[id].fields['contact.email'] = { ref: 'contact.info.email' }
  EXTRA[id].selectors['contact.email'] = `${root} .tracy-contact-info__email`
}

/** The selector map for one surface, in the same key order as its plan fields. */
export function selectorsFor(id) {
  const entry = copy[id]
  if (!entry) throw new Error(`Surface outside the captured site copy: ${id}`)
  const selectors = { 'page.title': BASE_SELECTORS['page.title'] }
  if (entry.heading !== undefined) selectors['page.heading'] = BASE_SELECTORS['page.heading']
  selectors.disclosure = BASE_SELECTORS.disclosure
  return { ...selectors, ...EXTRA[id]?.selectors }
}

/** The plan fields for one surface. Captured copy carries references; the disclosure is a ref. */
export function fieldsFor(id) {
  const entry = copy[id]
  if (!entry) throw new Error(`Surface outside the captured site copy: ${id}`)
  const fields = { 'page.title': { template: entry.title } }
  if (entry.heading !== undefined) fields['page.heading'] = { template: entry.heading }
  fields.disclosure = { ref: 'demo.disclosure' }
  return { ...fields, ...EXTRA[id]?.fields }
}

export function sitePlanSurfaces() {
  return SITE_SURFACES.map((id) => ({ id, fields: fieldsFor(id) }))
}
