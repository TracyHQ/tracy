// Review fixtures only. Capabilities below are proposals, not a runtime capability inventory.
import type { SitePreview } from '../../../../design/tracy-design-inspiration/src/client/api'
export const buildProfiles = {
  wordpress: {
    name: 'WordPress',
    designLabel: 'Theme',
    designs: ['Apple', 'Airbnb'],
    settingsLabel: 'Reading',
    setting: 'Posts page',
    options: ['Blog', 'None'],
    admin: ['Pages', 'Posts', 'Appearance', 'Plugins']
  },
  joomla: {
    name: 'Joomla',
    designLabel: 'Template',
    designs: ['Apple', 'Airbnb'],
    settingsLabel: 'Languages & menus',
    setting: 'Default menu',
    options: ['Main menu', 'French menu'],
    admin: ['Articles', 'Menus', 'Modules', 'Extensions']
  },
  emdash: {
    name: 'EmDash',
    designLabel: 'Template',
    designs: ['Apple', 'Airbnb'],
    settingsLabel: 'Content',
    setting: 'Primary collection',
    options: ['Pages', 'Posts'],
    admin: ['Content', 'Media', 'Collections', 'Plugins']
  }
} as const
export type BuildProfile = keyof typeof buildProfiles
export const buildSite: SitePreview & { siteKey: string } = {
  siteKey: 'build-review.example',
  site: {
    name: 'Example site',
    url: 'https://build-review.example/',
    headline: 'Example site',
    sub: 'Website preview',
    nav: ['Home', 'About', 'Contact'],
    eyebrow: null,
    cta: null,
    cta2: null,
    image: null
  },
  pages: [
    { path: '/', type: 'home', label: 'Home', data: {} },
    { path: '/about/', type: 'article', label: 'About', data: {} },
    { path: '/contact/', type: 'article', label: 'Contact', data: {} }
  ]
}
export const buildAnswers = {
  name: 'Example site',
  about: '',
  contact: '',
  pages: ['home', 'article', 'contact'],
  tone: 'plain',
  languages: ['en']
}
// Northgate documentation snapshot, used only by the Build parent prototype.
export const northgatePages = {
  Home: ['Hero', 'Selected projects', 'Services', 'Statistics'],
  About: ['Introduction', 'Leadership', 'History'],
  Services: ['Introduction', 'Services list'],
  Projects: ['Projects grid', 'Elektra'],
  News: ['News feed'],
  Contact: ['Head office', 'Social profiles', 'Contact form'],
  Shared: ['Header', 'Navigation', 'Footer', 'Contact details']
}
export const northgateDecisions = [
  ['Elektra figures', 'Home: 24 days / 14 months. Projects: 19 days / 19 months.', 'Conflicting facts'],
  ['Missing downloads', 'Brand ZIP, 4 IR PDFs and 2 Downloads files.', 'Missing assets'],
  ['Social profiles', 'No destination URLs supplied.', 'Missing URLs'],
  ['Terms & Privacy', 'EN and RU articles have no supplied text.', 'Missing copy'],
  ['Contact mail', 'Mail sending is disabled.', 'Configuration'],
  ['Copyright', 'Source says Joomla 5; this site uses Joomla 6.', 'Owner decision'],
  ['Russian labels', 'Seven source labels remain in English.', 'Translation']
]

export const commentTargets: Record<string, { reason: string; location: string; kind: string }> = {
  'Elektra figures': {
    reason: 'Which figures are correct: 24 days / 14 months or 19 days / 19 months?',
    location: 'Home / Selected projects + Projects / Elektra / EN + RU',
    kind: 'Project content'
  },
  'Missing downloads': {
    reason: 'Attach the missing files or name the downloads to remove.',
    location: 'Resources / Downloads + Investor relations / EN + RU',
    kind: 'Download fields'
  },
  'Social profiles': {
    reason: 'Add profile URLs or name the social links to hide.',
    location: 'Contact / Social profiles / EN + RU',
    kind: 'Module links'
  },
  'Terms & Privacy': {
    reason: 'Paste approved text or attach your Terms and Privacy documents.',
    location: 'Terms + Privacy / EN + RU',
    kind: 'Articles'
  },
  'Contact mail': {
    reason: 'Which email address should receive enquiries?',
    location: 'Site settings / Mail delivery',
    kind: 'Setting'
  },
  Copyright: {
    reason: 'Keep Joomla 5, change to Joomla 6, or use different footer text?',
    location: 'Shared / Copyright / EN + RU',
    kind: 'Module content'
  },
  'Russian labels': {
    reason: 'Provide Russian labels or confirm they should stay in English.',
    location: 'Russian / Resources + Marketing kit',
    kind: 'Menu and page labels'
  }
}
