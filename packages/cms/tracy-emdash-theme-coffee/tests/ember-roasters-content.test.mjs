// The demo this template ships is a coffee shop, Ember Roasters, written in English: its name on the site, an About page
// with the shop's story, a Contact page with address / opening hours / phone / a directions button, the same address and
// hours as one footer line on every page, and a News list of six posts in the shop's own groups. When Tracy builds a site
// for another shop the personalisation rules swap the name and the three contact lines, and empty the invented facts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { factsFrom, planFrom } from '../tools/personalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const seed = JSON.parse(read('seed/seed.json'))
const map = JSON.parse(read('seed/personalize.json'))
const fieldMap = JSON.parse(read('seed/field-map.json'))
const data = (collection, slug = collection) =>
  seed.content[collection].find((e) => e.slug === slug && (e.locale ?? 'en') === 'en').data

test('the seed names the shop and carries no word of the Base studio demo', () => {
  assert.equal(data('site').brand_name, 'Ember Roasters')
  assert.equal(data('site').title, 'Ember Roasters')
  assert.equal(seed.settings.title, 'Ember Roasters')
  assert.doesNotMatch(JSON.stringify(seed), /Tracy Base|tracybasedemo/)
})

test('the shop has one phone, one address and one set of opening hours, shared by every page', () => {
  const site = data('site')
  assert.match(site.phone, /555 01\d\d/, 'a number from the range kept for fiction')
  assert.ok(site.address.trim() !== '')
  assert.ok(site.hours.trim() !== '')
  const contact = data('contact')
  for (const f of ['phone_label', 'address_label', 'hours_label', 'directions_label'])
    assert.ok(contact[f]?.trim(), `contact.${f} is written`)
  assert.equal(contact.directions_label, 'Get directions')
})

test('Contact draws the directions button as a Google Maps link opening in a new tab; the footer draws address + hours', () => {
  const contact = read('src/views/Contact.astro')
  assert.match(contact, /href=\{mapsUrl\}[^>]*target="_blank"/)
  assert.match(contact, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/)
  const footer = read('src/components/site/Footer.astro')
  assert.match(footer, /site\.address/)
  assert.match(footer, /site\.hours/)
})

test('the menus say News where Base said Blog, and every menu link stays on a page the shop keeps', () => {
  const labels = seed.menus.flatMap((m) => m.items.map((i) => i.label))
  assert.ok(labels.includes('News'))
  assert.ok(!labels.includes('Blog'))
  const terms = new Set(seed.taxonomies[0].terms.map((t) => t.slug))
  for (const item of seed.menus.flatMap((m) => m.items)) {
    const cat = item.url.match(/^\/blog\/category\/(.+)$/)?.[1]
    if (cat) assert.ok(terms.has(cat), `${item.url} names a group of the shop`)
  }
  assert.equal(
    seed.menus.find((m) => m.name === 'primary').items.find((i) => i.label === 'News').url,
    '/blog'
  )
})

test('News holds six posts, each in one of the shop’s groups, none of them left over from Base', () => {
  const terms = seed.taxonomies[0].terms.map((t) => t.slug)
  assert.ok(terms.length >= 3 && terms.length <= 5)
  assert.equal(seed.content.posts.length, 6)
  for (const post of seed.content.posts) {
    assert.ok(terms.includes(post.taxonomies.category[0]), post.slug)
    assert.ok(post.data.content.length >= 3, `${post.slug} has a body`)
  }
  for (const term of terms)
    assert.ok(
      seed.content.posts.some((p) => p.taxonomies.category[0] === term),
      `${term} has a post`
    )
})

test('the new fields carry a content role of the shared vocabulary', () => {
  const roleOf = (collection, slug) =>
    fieldMap.collections.find((c) => c.collection === collection).fields.find((f) => f.slug === slug)?.role
  assert.equal(roleOf('site', 'phone'), 'contact.phone')
  assert.equal(roleOf('site', 'address'), 'contact.address')
  assert.equal(roleOf('site', 'hours'), 'contact.hours')
  for (const f of ['phone_label', 'address_label', 'hours_label', 'directions_label'])
    assert.equal(roleOf('contact', f), 'editorial.button_label', f)
})

test('a customer’s name replaces the shop’s; a phone and address typed in the contact answer replace the demo’s', () => {
  const plan = planFrom(
    map,
    seed,
    factsFrom({ name: 'Tamarind Bakery', contact: '12 Lime Street, Hanoi · +84 24 3939 0000' })
  )
  const site = plan.patches.get('site/site/en').fields
  assert.equal(site.brand_name, 'Tamarind Bakery')
  assert.equal(site.phone, '+84 24 3939 0000')
  assert.equal(site.address, '12 Lime Street, Hanoi')
  assert.doesNotMatch(JSON.stringify([...plan.patches.values()]), /Ember Roasters/)
})

test('a customer who gave only a name keeps the demo’s phone, address and hours as placeholders', () => {
  const plan = planFrom(map, seed, factsFrom({ name: 'Tamarind Bakery' }))
  const site = plan.patches.get('site/site/en').fields
  const demo = data('site')
  for (const f of ['phone', 'address', 'hours']) assert.equal(site[f] ?? demo[f], demo[f], f)
})

test('the invented numbers and named people of the About page are claims: emptied for a described shop', () => {
  const claims = new Set(map.facts.filter((r) => r.collection === 'about').map((r) => r.field))
  assert.ok(claims.has('stats_figures') && claims.has('team_members'))
  const plan = planFrom(map, seed, factsFrom({ name: 'Tamarind Bakery', about: 'We bake bread in Hanoi.' }), {
    rewrite: false,
    cut: false,
    claims: true
  })
  const about = plan.patches.get('about/about/en').fields
  assert.deepEqual(about.stats_figures, [])
  assert.deepEqual(about.team_members, [])
})

test('the shop’s social links keep the shape the personalisation rules write: {platform, url} on the site, {label, url} on Contact', () => {
  for (const s of data('site').social) assert.deepEqual(Object.keys(s).sort(), ['platform', 'url'])
  for (const s of data('contact').social) assert.deepEqual(Object.keys(s).sort(), ['label', 'url'])
  const networks = map.identity.find((r) => r.collection === 'site' && r.field === 'social').networks
  for (const s of data('site').social) assert.ok(networks.includes(s.platform), s.platform)
})

test("the header button and the home page's last button order from the menu; the Contact menu item keeps the Contact page", () => {
  assert.deepEqual([data('site').contact_label, data('site').contact_url], ['Order', '/menu'])
  assert.deepEqual([data('home').contact_label, data('home').contact_url], ['Order now', '/menu'])
  const primary = seed.menus.find((m) => m.name === 'primary').items
  assert.equal(
    primary.find((i) => i.label === 'Contact')?.url,
    '/contact',
    'the menu item still opens the Contact page'
  )
  assert.ok(seed.content.contact.length > 0, 'the Contact page and its form stay')
  // an untouched header button reads "Order" in the site's language, an empty address opens the menu
  assert.match(read('src/lib/chrome-labels.ts'), /contact_label: 'order'/)
  assert.match(read('src/components/site/Header.astro'), /site\.contact_url \|\| href\(locale, '\/menu'\)/)
})
