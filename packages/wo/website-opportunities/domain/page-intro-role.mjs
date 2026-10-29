// Page introductions follow the page plan's declared role, independently of its route or CMS.
const topics = {
  team: /\b(team|people|staff|coaches|trainers|instructors|specialists|professionals)\b/i,
  services: /\b(services|offerings)\b/i,
  offerings: /\b(services|offerings)\b/i,
  about: /\b(about|business|approach|work|story|based|located)\b/i,
  history: /\b(story|history|began|journey)\b/i,
  contact: /\b(contact|reach|visit|enquir\w*|based|located|address|locations)\b/i,
  place: /\b(visit|based|located|address|locations)\b/i,
  gallery: /\b(gallery|photos|pictures|work)\b/i,
  pricing: /\b(pric\w*|cost|plans|options)\b/i,
  faq: /\b(questions|answers|help)\b/i,
  careers: /\b(careers|jobs|opportunities|team)\b/i,
  blog: /\b(news|articles|updates|stories)\b/i,
  events: /\b(events|happening|activities)\b/i,
  offers: /\b(offers|promotions|specials)\b/i,
  menu: /\b(menu|products|food|dishes|drinks)\b/i,
  booking: /\b(booking|reserv\w*|appointment)\b/i,
  donations: /\b(donat\w*|causes|support)\b/i
}
const copy = {
  team: 'Meet the people behind our work.',
  services: 'Explore our services.',
  offerings: 'Explore our offerings.',
  about: 'Learn about our business and approach.',
  history: 'Discover our story.',
  contact: 'Contact us with your questions.',
  place: 'Find out where to visit us.',
  gallery: 'Explore our work in pictures.',
  pricing: 'Explore the available pricing options.',
  faq: 'Find answers to your questions.',
  careers: 'Explore career opportunities.',
  blog: 'Read our latest articles and updates.',
  events: 'Explore our events.',
  offers: 'Explore our offers.',
  menu: 'Explore our menu and products.',
  booking: 'Explore booking options.',
  donations: 'Learn how to support our causes.'
}
export const placeIntroRole = (role) => ['about', 'contact', 'place'].includes(role)

/** Editorial fallback contains no claim about people, years, qualifications, prices or availability. */
export function roleIntro(role) {
  return copy[role] ?? null
}

/** Reject a place/contact pitch on any other role, and generic greetings with no page topic. */
export function introRoleProblem(value, role, offerings = []) {
  const line = String(value ?? '')
    .replace(/<[^>]*>|\[\[|\]\]/g, ' ')
    .trim()
  if (!line) return 'missing-intro'
  if (
    !placeIntroRole(role) &&
    /\b(?:based in|located (?:at|in)|locations across|our address|visit us|call us|contact us|reach us|get in touch)\b|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\+\d[\d ()-]{7,}|\b\d+[a-z]?\s+(?:[\p{L}]+\s+){0,4}(?:street|road|avenue|lane|drive|boulevard)\b/iu.test(
      line
    )
  )
    return 'place-contact-intro-on-wrong-role'
  if (!topics[role]) return null
  if (topics[role].test(line)) return null
  if (
    ['services', 'offerings', 'menu'].includes(role) &&
    offerings.some((s) => line.toLowerCase().includes(String(s).toLowerCase()))
  )
    return null
  return 'intro-does-not-name-page-role'
}
