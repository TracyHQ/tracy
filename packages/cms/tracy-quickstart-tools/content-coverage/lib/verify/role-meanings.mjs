// One-line meaning of a content role: the exact role when it needs its own words, else its family.
const EXACT = {
  'editorial.heading': 'Section heading, decorative text of the template',
  'editorial.paragraph': 'Descriptive paragraph of the template, states no fact',
  'editorial.button_label': 'Text on a button',
  'editorial.menu_label': 'Text in a menu',
  'editorial.decorative_image': 'Decorative image, says nothing about the business',
  'business.logo': 'Logo of the business',
  'business.hero_image': 'Large top-of-page image of the business',
  'business.name': 'Name of the business',
  'business.tagline': 'Tagline of the business',
  'person.image': 'Portrait of a real person of the business',
  'person.name': 'Name of a real person of the business',
  'person.role': 'Job title of that person',
  'person.bio': 'Short biography of that person',
  'stat.value': 'A real figure (for example a member count)',
  'quote.text': 'Praise or review from a real customer',
  'quote.author_image': 'Photo of the person who wrote the praise',
  'post.author': 'Author of a sample post'
}
const FAMILY = {
  business: 'Identity of the business',
  contact: 'Real contact details (phone, email, address, social links)',
  offering: 'A real service or product the business sells',
  package: 'A real price plan (name, price, benefits)',
  person: 'A real person of the business (coach, staff)',
  stat: 'A verified figure',
  step: 'A step in the business process',
  quote: 'Real praise from a customer',
  claim: 'A real certificate, award or partner',
  faq: 'A real frequently asked question',
  event: 'A real milestone or event',
  post: 'Sample post information',
  editorial: 'Editorial content of the template'
}
export function roleMeaning(role) {
  if (!role) return 'No role assigned'
  return EXACT[role] ?? FAMILY[String(role).split('.')[0]] ?? 'Unknown role, not in the dictionary'
}
