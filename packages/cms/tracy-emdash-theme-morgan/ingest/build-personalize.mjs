#!/usr/bin/env node
// Writes seed/personalize.json: which field of the seed each questionnaire answer lands in (the kinds are described in the
// file's own `note`). Run from the package root after rebuild-seed.sh; tests/road-precheck.test.mjs derives, from the components,
// the fields a page prints and fails when a rule stops covering one.
//   node ingest/build-personalize.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const seed = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'))
const has = (collection, slug) => (seed.content[collection] ?? []).some((e) => e.slug === slug)

const SECTOR = 'this business'
const copy = []
const text = (collection, slug, field, brief, maxWords) => {
  if (has(collection, slug)) copy.push({ collection, slug, field, brief, maxWords })
}
const rows = (collection, slug, itemFields, brief) => {
  if (has(collection, slug)) copy.push({ collection, slug, field: 'items', itemFields, brief })
}

// ---- prose: the headings and paragraphs of the bands (the demo text is the length-and-register reference)
const HEAD = `a section heading of the website of ${SECTOR}, in the register of its example, no year, number or name of a person`
const PARA = `one or two sentences about what ${SECTOR} offers its clients, no year, number, price or name of a person`
for (const slug of ['home-intro', 'about-intro']) {
  text('features_intro', slug, 'title', HEAD, 12)
  text('features_intro', slug, 'block_intro', PARA, 36)
}
for (const slug of ['home-services', 'home-missions', 'home-philosophy', 'home-consult', 'about-careers', 'about-people', 'services-cta'])
  text('features_intro', slug, 'title', HEAD, 14)
for (const slug of ['home-missions', 'home-philosophy', 'home-consult', 'about-careers', 'about-people', 'services-cta'])
  text('features_intro', slug, 'description', PARA, 40)
text('features_intro', 'services-tiles', 'ft_desc', `one or two sentences introducing the services of ${SECTOR}, no number`, 30)
text('features_intro', 'services-tiles', 'title', 'the short name of the services section', 3)
text('testimonials', 'home-cases', 'title', HEAD, 12)
text('testimonials', 'services-cases', 'title', HEAD, 14)
text('testimonials', 'services-praise', 'title', 'the heading above the praise of clients', 5)
text('teams', 'home-team', 'title', 'the heading above the people of the team', 5)
text('teams', 'home-team', 'more_title', 'one sentence inviting people to join the team, no number', 18)
text('teams', 'about-team', 'title', 'the heading above the people of the team', 5)
for (const slug of ['services', 'about-us']) text('masthead', slug, 'description', `one line under the page title about ${SECTOR}`, 18)
for (const slug of ['blog', 'post', 'search']) text('masthead', slug, 'description', `one line under the title about ${SECTOR}`, 18)

// ---- rows of a band
rows('slideshow', 'home-slideshow', ['title_dot', 'title', 'desc', 'btn_title'], `one slide of the home page of ${SECTOR}: a short topic, a two-line headline, one sentence and the words of its button`)
rows('features_intro', 'home-intro', ['title', 'description'], `one service of ${SECTOR}: its name and one sentence`)
rows('features_intro', 'about-intro', ['title', 'description'], `one strength of ${SECTOR}: its name and one sentence`)
rows('features_intro', 'home-services', ['title', 'description'], `one strength of ${SECTOR}: its name and one sentence`)
rows('features_intro', 'services-tiles', ['title', 'description', 'ft_link_title'], `one service of ${SECTOR}: its name, one sentence and the words of its link`)
rows('accordion', 'home-missions-list', ['accordion_name', 'accordion_desc'], `one value or mission of ${SECTOR}: its name and one sentence`)
rows('testimonials', 'home-cases', ['label', 'title', 'desc'], `one case study of ${SECTOR}: its field, its title and one sentence`)
rows('testimonials', 'services-cases', ['title'], `one case study of ${SECTOR}: its title`)
rows('teams', 'home-team', ['position'], `the job title of a member of the team of ${SECTOR}`)
rows('teams', 'about-team', ['position'], `the job title of a member of the team of ${SECTOR}`)

// ---- chrome: the footer's own sentences
const facts = []
const fact = (collection, slug, field, why) => {
  if (has(collection, slug)) facts.push({ collection, slug, field, why })
}
// claims about a real business are removed, never written (the people, their words, the demo's own addresses and networks)
fact('teams', 'home-team', 'items', 'named members of the demo team and their pictures')
fact('teams', 'about-team', 'items', 'named members of the demo team and their pictures')
fact('testimonials', 'services-praise', 'items', 'named clients of the demo business and what they said')
fact('testimonials', 'footer-quote', 'items', 'a named client of the demo business and what they said')
fact('clients', 'clients', 'items', 'the demo business’s client logos')
fact('contact', 'contact-info', 'website_url', 'the demo business’s own website address')
fact('chrome', 'chrome', 'footer_social_facebook_url', 'the demo business’s social address')
fact('chrome', 'chrome', 'footer_social_twitter_url', 'the demo business’s social address')
fact('chrome', 'chrome', 'footer_social_instagram_url', 'the demo business’s social address')

const identity = [
  { collection: 'chrome', slug: 'chrome', field: 'brand_name', value: '{name}' },
  {
    collection: 'chrome',
    slug: 'chrome',
    field: 'copyright',
    value: {
      en: 'Copyright © {year} {name}. All Rights Reserved.',
      vi: 'Bản quyền © {year} {name}. Bảo lưu mọi quyền.',
      de: 'Copyright © {year} {name}. Alle Rechte vorbehalten.',
      fr: 'Copyright © {year} {name}. Tous droits réservés.',
      it: 'Copyright © {year} {name}. Tutti i diritti riservati.',
      nl: 'Copyright © {year} {name}. Alle rechten voorbehouden.',
      es: 'Copyright © {year} {name}. Todos los derechos reservados.',
      zh: '版权所有 © {year} {name}。保留所有权利。'
    }
  },
  { collection: 'chrome', slug: 'chrome', field: 'topbar_address', value: '{address}', unanswered: 'keep-demo' },
  { collection: 'chrome', slug: 'chrome', field: 'topbar_phone', value: '{phone}', unanswered: 'keep-demo' },
  { collection: 'contact', slug: 'contact-info', field: 'address', value: '{address}', unanswered: 'keep-demo' },
  { collection: 'contact', slug: 'contact-info', field: 'phone', value: '{phone}', unanswered: 'keep-demo' },
  { collection: 'contact', slug: 'contact-info', field: 'email', value: '{email}', unanswered: 'keep-demo' },
  { collection: 'contact', slug: 'contact-info', field: 'heading', value: '{name}' }
]

// ---- words the template prints itself: translated to the site's language, never rewritten
const labels = [
  { collection: 'features_intro', fields: ['btn_title', 'title_more', 'section_label'] },
  { collection: 'testimonials', fields: ['btn_title', 'section_label', 'title'] },
  { collection: 'teams', fields: ['more_cta', 'section_label'] },
  { collection: 'accordion', fields: ['title'] },
  { collection: 'slideshow', fields: ['title'] },
  { collection: 'clients', fields: ['title'] },
  { collection: 'footer_links', fields: ['column', 'label', 'title'] },
  { collection: 'chrome' },
  { collection: 'contact' },
  { collection: 'masthead', fields: ['title'] },
  { collection: 'pages', fields: ['title'] }
]

const keptText = [
  'chrome/chrome.copyright_credit',
  'chrome/chrome.not_found_code',
  'chrome/chrome.not_found_text'
].filter((id) => {
  const [c, rest] = id.split('/')
  const [slug, field] = rest.split('.')
  return (seed.content[c] ?? []).some((e) => e.slug === slug && field in e.data)
})

const map = {
  schemaVersion: 'tracy-personalize/v1',
  note: "What tools/personalize.mjs changes on a customer's copy of THIS template from their questionnaire answers (seed/questions.json). Five kinds, and the difference between them is what may be INVENTED: `identity` is the customer's own words, written exactly (an answer they did not give keeps the template's value as a placeholder, named in the report under `unanswered`); `replace` rewrites the demo brand everywhere it appears; `copy` is prose a model writes for their sector, with the demo text as the length-and-register reference; `rewrite` does the same for whole demo entries; `facts` are CLAIMS about a real business (named people, named clients, addresses of the demo) and those are REMOVED, never written, because a made-up name is a lie in the customer's name. `labels` are the words the template prints itself, translated into the site's language. Values use {name} {NAME} {initials} {phone} {address} {year} {sector}; a rule whose value needs an answer the customer did not give is skipped and reported, never guessed.",
  settings: { title: '{name}' },
  brand: {
    note: "Where the customer's brand pictures go: the light or only logo to core settings.logo, the favicon to core settings.favicon, and the dark-background logo to the image field below.",
    logoDark: { collection: 'chrome', slug: 'chrome', field: 'logo_dark', label: 'Logo for dark backgrounds' }
  },
  identity,
  replace: [
    { find: 'JA Morgan', with: '{name}' },
    { find: 'Morgan', with: '{name}' }
  ],
  copy,
  rewrite: [
    {
      collection: 'posts',
      brief: `one news article ${SECTOR} would publish for its clients: a market insight, advice or news from the firm`,
      fields: ['title', 'excerpt', 'body'],
      body: 'body',
      bodyWords: 160,
      batch: 3,
      decides: ['title']
    }
  ],
  facts,
  hide: [],
  demoCompanyNames: ['JA Morgan', 'Morgan'],
  labels,
  trim: [
    {
      collection: 'posts',
      slug: 'blog',
      keep: (seed.content.posts ?? []).length,
      list: { collection: 'pages', slug: 'blog' },
      why: 'the Blog page is a header link; this rule declares it for PAGE-8. The tool trims demo rows only for a customer who described the business, with a model to rewrite what stays, and keep is every demo post, so it cuts nothing today'
    }
  ],
  keptText,
  forms: [{ slug: 'contact', fields: {}, brief: `the contact form of ${SECTOR}` }],
  terms: [
    {
      taxonomy: 'category',
      collections: ['posts'],
      brief: `a group of articles ${SECTOR} publishes (market insight, advice, news, planning)`
    }
  ]
}
writeFileSync(new URL('../seed/personalize.json', import.meta.url), JSON.stringify(map, null, 2) + '\n')
console.log(`build-personalize: ${copy.length} copy, ${facts.length} facts, ${labels.length} labels, ${keptText.length} kept`)
