#!/usr/bin/env node
// Writes the slot roles (ADR 0038, place-content-roles/3) into seed/field-map.json: a role for every copy field and every
// repeater sub-field, the group of each fact, the settings and the taxonomy. compile-seed regenerates the map from the seed's
// sources, which know nothing about roles (it carries the roles of the file it replaces); run this after it to add the roles
// of a new field. Safe to run again.
//   node ingest/assign-field-roles.mjs <seed/field-map.json>
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const map = JSON.parse(readFileSync(file, 'utf8'))
const C = { kind: 'contact', name: 'contact' }
const B = { kind: 'business', name: 'identity' }
const AUTHOR = { kind: 'person', name: 'author' }
// explicit roles: `collection.field` -> [role, group?]; an empty list is a field that is no copy (a view name, a path)
const EXACT = {
  'pages.title': ['editorial.heading'],
  'pages.body': ['editorial.paragraph'],
  'pages.summary': ['editorial.paragraph'],
  'pages.sub_title': ['editorial.heading'],
  'pages.tags': ['editorial.menu_label'],
  'pages.banner': ['editorial.illustration'],
  'pages.view': [],
  'pages.path': [],
  'posts.title': ['article.title'],
  'posts.excerpt': ['article.lead'],
  'posts.body': ['editorial.paragraph'],
  'posts.date': ['article.date'],
  'posts.created': ['article.date'],
  'posts.cover': ['article.image'],
  'posts.banner': ['editorial.illustration'],
  'posts.author': ['person.name', AUTHOR],
  'posts.author_avatar': ['person.image', AUTHOR],
  'posts.tags': ['editorial.menu_label'],
  'posts.hits': ['editorial.design_element'],
  'posts.kind': ['editorial.design_element'],
  'posts.sort': ['editorial.design_element'],
  'posts.path': [],
  'posts.project_client': ['editorial.paragraph'],
  // a budget range ("$29 - $140") is a price the project states, not a price of an offering of the business
  'posts.project_budget': ['offering.price_note', { kind: 'claim', name: 'project' }],
  'posts.project_client_name': ['editorial.paragraph'],
  'posts.project_services': ['editorial.paragraph'],
  'posts.project_date': ['editorial.paragraph'],
  'posts.project_link': ['editorial.navigation_url'],
  'hero.image_decor': ['editorial.illustration'],
  'hero.btn_type': ['editorial.design_element'],
  'hero.btn_type_2': ['editorial.design_element'],
  'features_intro.id_video': ['editorial.design_element'],
  'features_intro.image_type': ['editorial.design_element'],
  'features_intro.content_featured': ['editorial.paragraph'],
  'features_intro.ft_title': ['editorial.heading'],
  'features_intro.info_cta': ['editorial.button_label'],
  'features_intro.bottom_btn_link': ['editorial.navigation_url'],
  'cta.cta_desc': ['editorial.paragraph'],
  'cta.cta_link': ['editorial.navigation_url'],
  'teams.team_desc': ['editorial.paragraph'],
  'clients.col_lg': ['editorial.design_element'],
  'clients.col_md': ['editorial.design_element'],
  'clients.col_xs': ['editorial.design_element'],
  'chrome.title': ['editorial.heading'],
  'chrome.brand_name': ['business.name', B],
  'chrome.copyright': ['business.copyright', B],
  'chrome.logo_dark': ['business.logo', B],
  'chrome.header_phone': ['contact.phone', C],
  'chrome.header_email': ['contact.email', C],
  'chrome.not_found_code': [],
  'chrome.social_items': ['editorial.menu_label'],
  'chrome.footer_about': ['editorial.paragraph'],
  'contact.address': ['contact.address', C],
  'contact.phone': ['contact.phone', C],
  'contact.email': ['contact.email', C],
  'contact.socials': ['editorial.menu_label'],
  'contact.intro': ['editorial.paragraph'],
  'contact.banner': ['editorial.illustration'],
  'contact.form_id': []
}
// configuration of a block (columns, direction, timing, button style): layout, not words
const NONE =
  /^(columns|align|align_media|image_type|btn_type\d*|btn_type_2|bottom_btn_type|autoplay|auto_time|slide_direct|social_style|col_(lg|md|xs))$/
const guess = (name, source) => {
  if (NONE.test(name)) return ['editorial.design_element']
  if (source === 'image') return ['editorial.illustration']
  if (source === 'url') return ['editorial.navigation_url']
  if (
    /(^|_)(button|btn|label|placeholder|submit|more|read|back|search)(_|$)/.test(name) &&
    !/_(title|desc)$/.test(name)
  )
    return ['editorial.button_label']
  if (/(desc|description|text|intro|body|note|line)/.test(name)) return ['editorial.paragraph']
  if (/(title|heading|subtitle|sub_title|name|badge)/.test(name)) return ['editorial.heading']
  return ['editorial.paragraph']
}
const SUB = {
  'features_intro.items': {
    intro: 'editorial.illustration',
    img_icon: 'editorial.illustration',
    title: 'editorial.heading',
    desc: 'editorial.paragraph',
    highlight: 'editorial.design_element',
    description: 'editorial.paragraph',
    link: 'editorial.navigation_url',
    stt_color: 'editorial.design_element',
    number: 'editorial.heading',
    background_type: 'editorial.design_element',
    columns: 'editorial.design_element',
    dot_color: 'editorial.design_element',
    sub_title: 'editorial.heading',
    list_features: 'editorial.paragraph',
    full_desc: 'editorial.paragraph',
    apply_position: 'editorial.paragraph',
    apply_time: 'editorial.paragraph',
    btn_title: 'editorial.button_label',
    btn_link: 'editorial.navigation_url',
    btn_type: 'editorial.design_element'
  },
  'text_slider.items': { logo: 'editorial.illustration', title: 'editorial.heading' },
  'cta.items': {
    btn_title: 'editorial.button_label',
    btn_link: 'editorial.navigation_url',
    btn_type: 'editorial.design_element'
  },
  'clients.items': {
    logo: 'editorial.illustration',
    title: 'editorial.paragraph',
    link: 'editorial.navigation_url'
  },
  'teams.items': {
    img: 'person.image',
    title: 'person.name',
    team_position: 'person.role',
    link: 'person.social_url'
  },
  'pricing.items': {
    title: 'package.name',
    desc: 'package.summary',
    plan_list: 'package.features_list',
    price: 'package.price',
    btn_title: 'package.cta_label',
    btn_link: 'package.cta_url',
    btn_type: 'editorial.design_element'
  },
  'accordion.items': { accordion_name: 'faq.question', accordion_desc: 'faq.answer' },
  'social.items': {
    font_icon: 'editorial.item_icon',
    title: 'editorial.menu_label',
    link: 'editorial.navigation_url'
  }
}
const GROUP = {
  'teams.items': { kind: 'person' },
  'pricing.items': { kind: 'package' },
  'accordion.items': { kind: 'faq' }
}
// every sub-field of a repeater carries a role, those the seed leaves empty too (the model's types list them)
const model = JSON.parse(readFileSync(new URL('../seed/site-model.json', import.meta.url), 'utf8'))
const subFieldsOf = (key) => {
  const [col, name] = key.split('.')
  return model.types.find((t) => t.name === col)?.fields.find((f) => f.name === name)?.fields ?? []
}
for (const [key, f] of Object.entries(map.fields)) {
  for (const k of ['role', 'group', 'subRoles']) delete f[k]
  if (f.target === 'repeater') {
    f.subRoles = { ...SUB[key] }
    for (const sf of subFieldsOf(key))
      if (!(sf.name in f.subRoles)) {
        const [r] = guess(sf.name, sf.type === 'image' ? 'image' : sf.type === 'url' ? 'url' : 'text')
        if (r) f.subRoles[sf.name] = r
      }
    if (GROUP[key]) f.group = GROUP[key]
    continue
  }
  const name = key.split('.')[1]
  const [role, group] = EXACT[key] ?? guess(name, f.source)
  if (role) f.role = role
  if (group) f.group = group
}
map.roleVocabularyVersion = 'place-content-roles/3'
map.settings = { title: { role: 'business.name', group: B }, tagline: { role: 'business.tagline', group: B } }
map.taxonomyRoles = { category: { role: 'editorial.heading' } }
// four intro paragraphs state a result ("helped raise over $500 million"): each is a single slot that plays a notice, as its
// words do (label rule R2); the field's other entries stay paragraphs
const seed = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'))
map.slotRoles = {}
for (const [collection, field] of [
  ['hero', 'desc'],
  ['features_intro', 'info_desc']
])
  for (const e of seed.content[collection] ?? [])
    if (/\$\s?\d/.test(String(e.data[field] ?? '')))
      map.slotRoles[`${collection}.${e.slug}.${field}`] = {
        role: 'claim.notice',
        group: { kind: 'claim', name: 'result' }
      }
writeFileSync(file, JSON.stringify(map, null, '\t') + '\n')
console.log(
  `assign-field-roles: ${Object.values(map.fields).filter((f) => f.role || f.subRoles).length} of ${Object.keys(map.fields).length} fields carry a role`
)
