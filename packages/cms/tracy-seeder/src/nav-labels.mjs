/**
 * Generic navigation labels: what a menu item says on almost any site of its kind.
 *
 * A label qualifies when any business of that kind could use it as is. A product, programme or brand name
 * ("Pound it", "Boxing Circuit", "Try Free Intro") never does. The planner keeps a generic English label as the
 * template has it and asks for a translation only where the site's language is not English.
 */
const GENERIC_NAV_LABELS = [
  'Home',
  'About',
  'About Us',
  'Who We Are',
  'Contact',
  'Contact Us',
  'Get in Touch',
  'Plans',
  'Pricing',
  'Price',
  'Prices',
  'Schedule',
  'Timetable',
  'Classes',
  'Class',
  'Courses',
  'Services',
  'Our Services',
  'Team',
  'Our Team',
  'Trainers',
  'Our Trainers',
  'Coaches',
  'Blog',
  'News',
  'Articles',
  'Events',
  'Gallery',
  'Portfolio',
  'Projects',
  'Work',
  'Shop',
  'Store',
  'Products',
  'FAQ',
  'FAQs',
  'Testimonials',
  'Reviews',
  'Careers',
  'Jobs',
  'Location',
  'Locations',
  'Booking',
  'Book Now',
  'Login',
  'Register',
  'Search',
  'Privacy Policy',
  'Terms',
  'Site Map',
  'Sitemap',
  'Menu',
  'Resources',
  'Support',
  'Help',
  'Pages'
]

/** Lower-case, punctuation to spaces, spaces collapsed. */
const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const GENERIC = new Set(GENERIC_NAV_LABELS.map(normalize))

/** @param {unknown} text */
export function isGenericNavLabel(text) {
  const key = normalize(text)
  return key !== '' && GENERIC.has(key)
}
