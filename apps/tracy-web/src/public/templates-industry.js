/**
 * The industry of a template, derived from its own words (blurb and label): the published card has
 * a style category ("Professional & Corporate") but no industry field, and a new template must get an
 * industry with no manual input. Pure: an ordered keyword match, word boundaries, first match wins.
 * The order matters: a specific industry is listed before a general one ("travel agency" is Travel,
 * not Business; "design studio" is Portfolio, not Technology).
 */

/** Ordered: [industry name, regular expression over the lower-cased "label blurb" text]. */
const RULES = [
  ['Restaurant & Food', /\b(restaurants?|diner|cafe|bistro|food menu|catering)\b/],
  ['Music & Media', /\b(band|podcasts?|radio|album|music)\b/],
  ['Blog & Magazine', /\b(blog and magazine|magazine|editorial)\b/],
  ['Travel & Hospitality', /\b(travel|tours?|hotels?|resorts?|boutique stays|trips?)\b/],
  ['Health & Medical', /\b(hospitals?|clinics?|medical|doctors?)\b/],
  ['Beauty & Wellness', /\b(spa|salon|barbershop|massage)\b/],
  ['Sports & Fitness', /\b(boxing|gym|fitness|workout|yoga)\b/],
  ['Education', /\b(education site|online learning|courses?|schools?|university)\b/],
  ['Nonprofit & Charity', /\b(charity|non-?profit|donations?|donors?)\b/],
  ['Community & Social', /\b(social networking|community)\b/],
  ['Automotive', /\b(car rental|vehicles?|automotive)\b/],
  ['Technology', /\b(developer|it services|it and software|software|observability|saas)\b/],
  ['Portfolio & Agency', /\b(portfolio|design studio|creative studio|agency|resume)\b/]
]

export const FALLBACK_INDUSTRY = 'Business'

/** One industry name for a published template (`{ label, card: { blurb } }`). */
export function industryOf(template) {
  const text = `${template?.label ?? ''} ${template?.card?.blurb ?? ''}`.toLowerCase()
  for (const [name, pattern] of RULES) if (pattern.test(text)) return name
  return FALLBACK_INDUSTRY
}
