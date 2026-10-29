// Every real contact channel a brief holds is shown and clickable (spec TracyHQ/tracy#189, COO rule 29/10/2026): each phone,
// WhatsApp only on a number with evidence, the official DM link of each social network the brief really has. The plan puts
// them on the slots a contact block has, and the check names any channel no page shows. All businesses are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactChannelsOf } from '../domain/contact-reading.mjs'
import { checkContactFacts } from '../domain/contact-fact-check.mjs'
import { planSite } from '../domain/site-plan.mjs'

// A dental clinic: two numbers, WhatsApp evidence on the second one only.
const clinic = {
  business: {
    name: 'Brightsmile Dental Studio',
    phone: '+44 20 7946 0101',
    otherPhones: [{ phone: '+44 7700 900 202', whatsapp: true }],
    address: '8 Molar Row, Toothbury',
    socials: { instagram: 'https://www.instagram.com/brightsmile.studio/' }
  }
}
// A bakery: no phone, Instagram and Facebook only.
const bakery = {
  business: {
    name: 'Crumb and Crust',
    socials: {
      instagram: 'https://instagram.com/crumb_and_crust',
      facebook: 'https://www.facebook.com/crumbandcrust/'
    }
  }
}
// A florist with nothing to reach it by.
const florist = { business: { name: 'Petal Lane' } }

test('the channels of a brief, in the contact order: each phone, WhatsApp where evidence ties it, then each DM', () => {
  assert.deepEqual(
    contactChannelsOf(clinic).map((c) => [c.kind, c.value, c.href]),
    [
      ['phone', '+44 20 7946 0101', 'tel:+442079460101'],
      ['phone', '+44 7700 900 202', 'tel:+447700900202'],
      ['whatsapp', '+44 7700 900 202', 'https://wa.me/447700900202'],
      ['message', 'instagram', 'https://ig.me/m/brightsmile.studio']
    ]
  )
  assert.equal(contactChannelsOf(clinic)[3].label, 'Message us on Instagram')
  assert.deepEqual(
    contactChannelsOf(bakery).map((c) => [c.kind, c.href, c.label]),
    [
      ['message', 'https://ig.me/m/crumb_and_crust', 'Message us on Instagram'],
      ['message', 'https://m.me/crumbandcrust', 'Message us on Facebook']
    ]
  )
  assert.deepEqual(contactChannelsOf(florist), [])
})

test('WhatsApp is never guessed: a number with no evidence gets none, the contact.whatsapp number gets its own', () => {
  const noEvidence = { business: { phone: '+44 20 7946 0101', otherPhones: [{ phone: '+44 7700 900 202' }] } }
  assert.equal(
    contactChannelsOf(noEvidence).some((c) => c.kind === 'whatsapp'),
    false
  )
  const first = { ...noEvidence, contact: { whatsapp: { number: '+44 20 7946 0101' } } }
  assert.deepEqual(
    contactChannelsOf(first)
      .filter((c) => c.kind === 'whatsapp')
      .map((c) => c.href),
    ['https://wa.me/442079460101']
  )
})

test('a TikTok profile is linked only when no network gives a DM link; a post or share link is no handle', () => {
  const tiktokOnly = { business: { socials: { tiktok: 'https://www.tiktok.com/@petal.lane' } } }
  assert.deepEqual(
    contactChannelsOf(tiktokOnly).map((c) => [c.href, c.label]),
    [['https://www.tiktok.com/@petal.lane', 'Find us on TikTok']]
  )
  const both = { business: { socials: { ...tiktokOnly.business.socials, ...bakery.business.socials } } }
  assert.equal(
    contactChannelsOf(both).some((c) => c.network === 'tiktok'),
    false
  )
  const post = { business: { socials: { instagram: 'https://www.instagram.com/p/AbC123/' } } }
  assert.deepEqual(contactChannelsOf(post), [])
})

test('the check names each channel no page shows: the second phone, the WhatsApp link, the DM link', () => {
  const footer =
    '<a href="tel:+442079460101">+44 20 7946 0101</a> <p>8 Molar Row, Toothbury</p> <a href="#">Call or message us</a>'
  const missing = checkContactFacts({ pages: [{ path: '/', html: footer }], brief: clinic })
  assert.deepEqual(
    missing.map((m) => [m.kind, m.value]),
    [
      ['phone', '+44 7700 900 202'],
      ['whatsapp', '+44 7700 900 202'],
      ['message', 'https://ig.me/m/brightsmile.studio']
    ]
  )
  const all = `${footer}<a href="tel:+447700900202">+44 7700 900 202</a><a href="https://wa.me/447700900202">WhatsApp us</a><a href="https://ig.me/m/brightsmile.studio">Message us on Instagram</a>`
  assert.deepEqual(checkContactFacts({ pages: [{ path: '/', html: all }], brief: clinic }), [])
  // A bakery with DMs only: the profile link is not the DM.
  const bakeryPage = '<a href="https://instagram.com/crumb_and_crust">Instagram</a>'
  assert.deepEqual(
    checkContactFacts({ pages: [{ path: '/', html: bakeryPage }], brief: bakery }).map((m) => m.value),
    ['https://ig.me/m/crumb_and_crust', 'https://m.me/crumbandcrust']
  )
  assert.deepEqual(checkContactFacts({ pages: [{ path: '/', html: '<p>Hi</p>' }], brief: florist }), [])
})

// A footer contact block as a content map declares it: phone, address and a mailbox in the anchors of one group.
const footerMap = {
  entities: [{ key: 'module-9', kind: 'module', identity: { module: 'mod_custom', position: 'footer-2' } }],
  pages: [],
  slots: [
    ['module-9.1', 'contact.phone', '(555) 010-0000', '/html/body/div/a[1]/text()'],
    ['module-9.2', 'contact.address', '1 Demo Way, Sampleton', '/html/body/div/p'],
    ['module-9.4', 'contact.email', 'hello@demo.example', '/html/body/div/a[2]/text()'],
    ['module-9.6', 'contact.phone', '(555) 010-0001', '/html/body/div/span/text()']
  ].map(([key, role, sample, xpath]) => ({
    key,
    entity: 'module-9',
    column: 'content',
    type: 'text',
    role,
    sample,
    xpath,
    group: { id: 'module-9.contact', item: 0, kind: 'contact' }
  }))
}

test('a contact block shows each phone on its own phone slot, and a link slot the brief has no mailbox for takes a DM', () => {
  const plan = planSite(clinic, { questions: [] }, { contentMap: footerMap })
  const value = (key) => plan.slots.find((s) => s.key === key)
  assert.equal(value('module-9.1').value, '+44 20 7946 0101')
  assert.equal(value('module-9.6').value, '+44 7700 900 202')
  assert.equal(value('module-9.4').value, 'Message us on Instagram')
  assert.equal(value('module-9.4').reason, 'contact-channel')
  assert.equal(value('module-9.4').href, 'https://ig.me/m/brightsmile.studio')
  assert.deepEqual(
    plan.channels.map((c) => c.kind),
    ['phone', 'phone', 'whatsapp', 'message']
  )
  // A florist with nothing: no slot is decided from a channel, and no channel is planned.
  const none = planSite(florist, { questions: [] }, { contentMap: footerMap })
  assert.equal(
    none.slots.some((s) => s.reason === 'contact-channel'),
    false
  )
  assert.deepEqual(none.channels, [])
})

// A home page hero with a main button and a second button the template ships empty.
const heroMap = {
  entities: [{ key: 'module-3', kind: 'module', identity: { module: 'mod_custom', position: 'hero' } }],
  pages: [{ route: 'home', assignedModules: [{ entity: 'module-3', position: 'hero' }] }],
  slots: [
    ['module-3.1', 'text', 'claim.heading', 'Best smiles in town', ['hero', 'title'], null],
    ['module-3.2', 'text', 'contact.cta_label', 'Book a visit', ['hero', 'button'], 'module-3.cta.1'],
    ['module-3.3', 'url', 'contact.cta_url', 'index.php?Itemid=9', ['hero', 'link'], 'module-3.cta.1'],
    ['module-3.4', 'text', 'contact.cta_label', '', ['hero', 'button-2'], 'module-3.cta.2'],
    ['module-3.5', 'url', 'contact.cta_url', '', ['hero', 'link-2'], 'module-3.cta.2']
  ].map(([key, type, role, sample, jsonPath, group]) => ({
    key,
    entity: 'module-3',
    column: 'params',
    type,
    role,
    sample,
    jsonPath,
    ...(group ? { group: { id: group, item: 0, kind: 'contact' } } : {})
  }))
}

test('the hero main button calls the first phone; a second button slot takes the next channel, outside the contract slots', () => {
  const plan = planSite(clinic, { questions: [] }, { contentMap: heroMap })
  assert.equal(plan.slots.find((s) => s.key === 'module-3.2').value, 'Call +44 20 7946 0101')
  assert.deepEqual(plan.hero.second, {
    label: { key: 'module-3.4', value: 'WhatsApp us' },
    href: { key: 'module-3.5', value: 'https://wa.me/447700900202' },
    kind: 'whatsapp',
    source: 'business.otherPhones'
  })
  // The empty slot is never a contract write: the contract cannot activate it.
  assert.equal(
    plan.slots.some((s) => s.key === 'module-3.4' && s.decision === 'value'),
    false
  )
  // A bakery with DMs only: the main button messages on Instagram, the second one on Facebook.
  const bakeryPlan = planSite(bakery, { questions: [] }, { contentMap: heroMap })
  assert.equal(bakeryPlan.hero.second?.href.value, 'https://m.me/crumbandcrust')
  // Nothing to reach the florist by: no second button.
  assert.equal(planSite(florist, { questions: [] }, { contentMap: heroMap }).hero.second, undefined)
})
