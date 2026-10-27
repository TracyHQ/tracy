/**
 * The place profile filling a template through its REAL `slot-roles.json` sidecar (ADR 0037): Tracy Base on Joomla, JA
 * Restaurant on WordPress, Tracy Base on EmDash, for a cafe with a read menu and dish photos and for a gym with nothing
 * but its name and phone. Then the three doors that read the plan: the Joomla/WordPress pins, the EmDash writes and the
 * agent demo's read; and a release with no sidecar, which keeps the hand-made map exactly.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import * as domain from 'website-opportunities/domain'
import { slotRolesOf } from '../src/lib/slot-roles.js'
import { emdashReadySidecar, sidecarForTemplate } from '../src/lib/slot-roles-for.js'
import { agentSlotFillOf } from '../src/opportunities-build/agent-slot-fill.js'
import { placeProfileOfRevision } from '../src/opportunities-build/place-profile-of-revision.js'
import { emdashSlotFillWrites } from '../src/sites/brief-engines/emdash-wo-copy.js'
import { copyPinsOf } from '../src/sites/brief-engines/wo-copy-pins.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CMS = path.resolve(HERE, '../../../packages/cms')
const DIRS = {
  joomla: path.join(CMS, 'tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.5'),
  wordpress: path.join(CMS, 'tracy-wordpress-quickstart/contracts/ja-restaurant/wp7/1.0.1'),
  emdash: path.join(CMS, 'tracy-emdash-theme-base/contracts/0.5.6')
}
const NO_SIDECAR = path.join(CMS, 'tracy-wordpress-quickstart/contracts/tracy-base/wp7/1.1.6')
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))
const AT = '2026-10-26T10:00:00.000Z'

/** The research a brief froze (`agentDemoSnapshot`) for a cafe whose menu was read, two dishes with a photo each. */
function cafeRevision() {
  const menu = 'https://phin.test/menu'
  const dishes = [
    { name: 'Egg coffee', price: '45', priceScale: 1000, section: 'Coffee', photo: 'media-egg' },
    { name: 'Coconut coffee', price: '50', priceScale: 1000, section: 'Coffee', photo: 'media-coconut' },
    { name: 'Banh mi', price: '35', priceScale: 1000, section: 'Food' }
  ]
  return {
    cms: 'wordpress',
    template: { quickstart: 'quickstart/ja-restaurant/wp7', version: '1.0.1' },
    brief: {
      sitemap: [
        {
          slug: 'menu',
          sections: [
            {
              kind: 'menu',
              menuItems: dishes.map((d) => ({
                name: d.name,
                price: d.price,
                priceScale: d.priceScale,
                section: d.section,
                source: { url: menu, kind: 'page' },
                ...(d.photo ? { photo: { assetId: d.photo, status: 'accepted', how: 'menu-card' } } : {})
              }))
            }
          ]
        }
      ],
      agentDemoSnapshot: {
        at: AT,
        opportunity: { provider: 'google', provider_id: 'phin-coffee', name: 'Brewlet Coffee' },
        profile: {
          name: 'Brewlet Coffee',
          phone: '+84 90 123 4567',
          googlePlace: { placeId: 'phin-coffee', primaryType: 'cafe', types: ['cafe', 'food'] }
        },
        menu: { items: [] },
        brand: {},
        sources: [{ id: 's1', data: { source: 'menu-file', ref: menu, status: 'complete' } }],
        media: ['media-egg', 'media-coconut'].map((id) => ({
          id,
          status: 'stored',
          kind: 'image',
          source: 'website',
          source_url: `https://phin.test/${id}.jpg`,
          sha256: id
        })),
        posts: []
      }
    }
  }
}

/** A gym the research found on Google: its name, its phone, its category; no menu, no team, no prices. */
function gymRevision() {
  return {
    cms: 'joomla',
    template: { quickstart: 'tracy-base/j6', version: '1.0.5' },
    brief: {
      sitemap: [],
      agentDemoSnapshot: {
        at: AT,
        opportunity: { provider: 'google', provider_id: 'iron-gym', name: 'Iron Gym' },
        profile: {
          name: 'Iron Gym',
          phone: '+84 28 5555 0134',
          googlePlace: { placeId: 'iron-gym', primaryType: 'gym', types: ['gym', 'health'] }
        },
        menu: { items: [] },
        brand: {},
        sources: [],
        media: [],
        posts: []
      }
    }
  }
}

const planFor = (cms, revision, locale = 'en') => {
  const placed = placeProfileOfRevision(domain, revision)
  assert.ok(placed, 'the profile is made from the frozen research')
  assert.equal(domain.validatePlaceProfile(placed.profile).ok, true)
  const slotRoles = slotRolesOf(DIRS[cms]).doc
  return {
    slotRoles,
    plan: domain.planSlotFill({
      slotRoles,
      profile: placed.profile,
      assessment: placed.assessment,
      locale,
      neutralFor: domain.neutralFor
    })
  }
}

/** What every plan owes the template: one write per binding, a valid manifest, no banned filler. */
function holdsTheLayout(slotRoles, plan) {
  assert.equal(plan.writes.length, slotRoles.bindings.length)
  const check = domain.validateSlotFillManifest(plan.manifest)
  assert.equal(check.ok, true, check.errors.slice(0, 3).join('; '))
  for (const w of plan.writes)
    if (typeof w.value === 'string') assert.equal(domain.forbiddenFillerText(w.value), false, w.slotKey)
}

test('the three committed sidecars are ready, and each door finds its own', () => {
  // The EmDash sidecar is stale beside the theme's current seed: its roles come from the field map (ticket 1804).
  for (const [name, dir] of Object.entries(DIRS))
    assert.equal(slotRolesOf(dir).state, name === 'emdash' ? 'stale' : 'ready', dir)
  assert.equal(emdashReadySidecar('tracy-base')?.state, 'ready')
  assert.equal(
    sidecarForTemplate({ cms: 'wordpress', quickstart: 'quickstart/ja-restaurant/wp7', version: '1.0.1' })
      .state,
    'ready'
  )
  assert.equal(
    sidecarForTemplate({ cms: 'joomla', quickstart: 'tracy-base/j6', version: '1.0.5' }).state,
    'ready'
  )
})

test('JA Restaurant, a café: each dish card holds one dish with its own price and photo; spare cards stay neutral', () => {
  const { slotRoles, plan } = planFor('wordpress', cafeRevision(), 'vi')
  holdsTheLayout(slotRoles, plan)
  const group = (id) =>
    Object.fromEntries(plan.writes.filter((w) => w.groupId === id).map((w) => [w.role, w]))
  const first = group('menu.menu.dish.0')
  assert.equal(first['offering.name'].value, 'Egg coffee')
  assert.equal(first['offering.price'].value, '45.000')
  assert.equal(first['offering.price'].entityId, first['offering.name'].entityId)
  const second = group('menu.menu.dish.1')
  assert.equal(second['offering.name'].value, 'Coconut coffee')
  assert.equal(second['offering.price'].value, '50.000')
  const third = group('menu.menu.dish.2')
  assert.equal(third['offering.name'].value, 'Banh mi')
  // Each dish's photo is its own: the egg coffee's never sits on the banh mi.
  const photos = plan.writes.filter((w) => w.role === 'offering.image' && w.state === 'sourced')
  for (const w of photos) {
    const name = plan.writes.find((x) => x.groupId === w.groupId && x.role === 'offering.name')
    assert.equal(w.entityId, name.entityId)
    assert.ok(w.value.url.includes(name.value === 'Egg coffee' ? 'media-egg' : 'media-coconut'))
  }
  const spare = group('menu.menu.dish.5')
  assert.equal(spare['offering.name'].state, 'neutral')
  assert.equal(spare['offering.name'].neutralKey, 'neutral.offering.menu_item')
  assert.equal(
    spare['offering.name'].value,
    domain.neutralFor({ role: 'offering.name', kind: 'dish', locale: 'vi' }).text
  )
  assert.equal(spare['offering.price'].state, 'empty')
})

test('Tracy Base on Joomla, a gym: no person, price or number is made up, every card stays', () => {
  const { slotRoles, plan } = planFor('joomla', gymRevision())
  holdsTheLayout(slotRoles, plan)
  const sourced = plan.writes.filter((w) => w.state === 'sourced')
  for (const w of plan.writes.filter((x) => x.role.startsWith('person.') || x.role === 'package.price'))
    assert.equal(w.state, 'empty', w.slotKey)
  for (const w of plan.writes.filter((x) => x.role === 'stat.value')) assert.equal(w.value, '—')
  for (const w of plan.writes.filter((x) => x.role === 'offering.name')) assert.equal(w.value, 'Service')
  // A call to action is real: it calls the gym's number.
  const ctas = sourced.filter((w) => w.role.endsWith('.cta_url'))
  assert.ok(ctas.length > 0)
  for (const w of ctas) assert.equal(w.value, 'tel:+842855550134')
})

test('Tracy Base on EmDash, a gym and a café: the plan holds the layout, and its writes name the seed’s own fields', () => {
  const seed = json(path.join(CMS, 'tracy-emdash-theme-base/seed/seed.json'))
  for (const revision of [gymRevision(), cafeRevision()]) {
    const { slotRoles, plan } = planFor('emdash', revision)
    holdsTheLayout(slotRoles, plan)
    const { writes, skipped } = emdashSlotFillWrites({ plan, seed })
    assert.deepEqual(skipped, [])
    assert.ok(writes.length > 0)
    for (const w of writes) {
      const data = seed.content[w.collection].find((e) => e.slug === w.slug)?.data
      for (const f of [...Object.keys(w.fields), ...Object.keys(w.items)])
        assert.ok(f in data, `${w.slug}.${f}`)
    }
    // A team member's name the research never found is written empty, in place.
    const people = writes.flatMap((w) => Object.values(w.items).flat()).filter((p) => p.sub === 'name')
    assert.ok(people.some((p) => p.value === ''))
  }
})

/** A stand-in for `woContent.copyFor`: the build's pinned words and its place profile. */
const contentOf = (revision, pinned = {}) => ({
  copyFor: async () => ({
    buildId: 'build-1',
    pinned,
    placeProfile: placeProfileOfRevision(domain, revision)
  })
})
const ctxOf = (id, dir) => ({ siteKey: 's', email: 'e', contract: { id, dir }, note: () => {} })

test('WordPress pins from the sidecar: the café’s dishes, never "Coming soon", a manifest beside them', async () => {
  const contentMap = json(path.join(DIRS.wordpress, 'content-map.json'))
  const out = await copyPinsOf(contentOf(cafeRevision()), ctxOf('ja-restaurant/wp7/1.0.1', DIRS.wordpress), {
    cms: 'wordpress',
    contentMap,
    lang: 'en'
  })
  assert.ok(out?.slotFill, 'the sidecar path ran')
  const values = Object.values(out.pins)
  assert.ok(values.includes('Egg coffee'))
  assert.ok(values.includes('45,000'))
  assert.ok(!values.some((v) => domain.forbiddenFillerText(v)))
  assert.ok(out.dishes.some((d) => d.name === 'Banh mi'))
  assert.equal(domain.validateSlotFillManifest(out.slotFill.manifest).ok, true)
  assert.equal(out.slotFill.provisional, true)
})

test('a release with no sidecar keeps the hand-made map exactly: no plan, the same pins', async () => {
  const contentMap = json(path.join(NO_SIDECAR, 'content-map.json'))
  const pinned = {
    'hero.title': { value: 'Iron Gym', source: 'business.name' },
    cards: [],
    dishes: [],
    contact: {}
  }
  const out = await copyPinsOf(contentOf(gymRevision(), pinned), ctxOf('tracy-base/wp7/1.1.6', NO_SIDECAR), {
    cms: 'wordpress',
    contentMap,
    lang: 'en'
  })
  const map = domain.slotRolesFor('wordpress', 'tracy-base')
  const before = domain.contractCopyPins({ map, contentMap, pinned })
  assert.equal(out.slotFill, undefined)
  assert.deepEqual(out.pins, before.pins)
  assert.deepEqual(out.placeholders, before.placeholders)
})

test('the agent demo reads the group plan: a summary in the catalogue, the profile and groups in part "profile"', async () => {
  const revision = cafeRevision()
  const catalogue = await agentSlotFillOf(revision, 'catalogue')
  assert.equal(catalogue.slotFill.state, 'ready')
  assert.equal(catalogue.slotFill.provisional, true)
  assert.equal(catalogue.placeProfile, undefined)
  const profile = await agentSlotFillOf(revision, 'profile')
  const dish = profile.slotFill.groups.find((g) => g.groupId === 'menu.menu.dish.0')
  assert.ok(dish.entityId)
  assert.equal(dish.slots.find((s) => s.role === 'offering.name').value, 'Egg coffee')
  assert.ok(profile.placeProfile.assessment.length > 0)
  assert.deepEqual(await agentSlotFillOf(revision, 'media'), {})
  const none = await agentSlotFillOf(
    { ...revision, template: { quickstart: 'tracy-base/wp7', version: '1.1.6' } },
    'catalogue'
  )
  assert.equal(none.slotFill.state, 'sidecar-missing')
})

test('EmDash: a list item is patched where it stands, so the tool’s words in its other fields stay', async () => {
  const seed = json(path.join(CMS, 'tracy-emdash-theme-base/seed/seed.json'))
  const live = new Map()
  for (const [collection, list] of Object.entries(seed.content))
    for (const e of list)
      if ((e.locale ?? seed.defaultLocale) === seed.defaultLocale)
        live.set(`${collection}/${e.slug}`, { id: `${collection}:${e.slug}`, data: structuredClone(e.data) })
  // The tool already wrote the team quotes' initials, which no slot binds: the plan empties the name, never those back.
  const teamKey = 'home/home'
  const field = 'team_quotes'
  live.get(teamKey).data[field][0].initials = 'TT'
  const api = async (method, route, body) => {
    const [, collection, ref] = /content\/([^/]+)\/([^/?]+)/.exec(route)
    const key =
      [...live.keys()].find((k) => k === `${collection}/${decodeURIComponent(ref)}`) ??
      [...live.entries()].find(([, e]) => e.id === decodeURIComponent(ref))?.[0]
    const e = live.get(key)
    if (method === 'GET')
      return { item: { id: e.id, status: 'published', data: structuredClone(e.data) }, _rev: 'r' }
    if (method === 'PUT') e.data = body.data
    return {}
  }
  const writes = {}
  const { writeWoCopy } = await import('../src/sites/brief-engines/emdash-wo-copy.js')
  const done = await writeWoCopy({
    api,
    copy: { buildId: 'b1', pinned: {}, placeProfile: placeProfileOfRevision(domain, gymRevision()) },
    map: null,
    seed,
    slotRoles: slotRolesOf(DIRS.emdash).doc,
    locale: 'en',
    woContent: { recordBefore: async (_b, _k, f) => f, recordWrite: async (_b, k, r) => (writes[k] = r) },
    note: () => {}
  })
  assert.equal(done.failed, 0)
  assert.ok(done.written > 0)
  assert.equal(live.get(teamKey).data[field][0].name, '')
  assert.equal(live.get(teamKey).data[field][0].initials, 'TT')
  assert.equal(domain.validateSlotFillManifest(writes['slot-fill'].manifest).ok, true)
})

test('WordPress café: each card picture is bound to its own dish’s photo of this build; one the build lacks says empty', async () => {
  const contentMap = json(path.join(DIRS.wordpress, 'content-map.json'))
  const revision = cafeRevision()
  // The build holds the egg coffee's photo only (same bytes as the research's media-egg).
  const pictures = [{ id: 'p-egg', sha256: 'media-egg', vision: { subject: 'food' } }]
  const content = {
    copyFor: async () => ({
      buildId: 'build-1',
      pinned: {},
      placeProfile: placeProfileOfRevision(domain, revision, { pictures }),
      itemKind: 'dish'
    })
  }
  const out = await copyPinsOf(content, ctxOf('ja-restaurant/wp7/1.0.1', DIRS.wordpress), {
    cms: 'wordpress',
    contentMap,
    lang: 'en',
    pictures
  })
  assert.ok(out?.pictures, 'the card pictures are bound')
  const { plan } = planFor('wordpress', revision)
  const nameOf = (slotKey) => {
    const w = plan.writes.find((x) => x.slotKey === slotKey)
    return plan.writes.find((x) => x.groupId === w.groupId && x.role === 'offering.name')?.value
  }
  const bound = Object.entries(out.pictures)
  assert.ok(bound.length > 0)
  for (const [slotKey, id] of bound)
    assert.equal(id, nameOf(slotKey) === 'Egg coffee' ? 'p-egg' : null, slotKey)
  const state = (slotKey) => out.slotFill.manifest.find((e) => e.slotKey === slotKey).state
  for (const [slotKey, id] of bound) assert.equal(state(slotKey), id ? 'sourced' : 'empty', slotKey)
  assert.equal(domain.validateSlotFillManifest(out.slotFill.manifest).ok, true)
  assert.equal(out.dishes.find((d) => d.name === 'Egg coffee')?.pictureId, 'p-egg')
})

test('a gym on a release with no sidecar: the item with no source is a Service; a Vietnamese spa’s a Dịch vụ', async () => {
  const contentMap = json(path.join(DIRS.wordpress, 'content-map.json'))
  const content = (itemKind) => ({
    copyFor: async () => ({ buildId: 'build-1', pinned: { dishes: [] }, placeProfile: null, itemKind })
  })
  const gym = await copyPinsOf(
    content('service'),
    ctxOf('ja-restaurant/wp7/1.0.1', path.join(HERE, 'none')),
    {
      cms: 'wordpress',
      contentMap,
      lang: 'en'
    }
  )
  assert.equal(gym.neutralItem, 'Service')
  assert.ok(Object.values(gym.pins).includes('Service'))
  assert.ok(!Object.values(gym.pins).includes('Menu item'))
  const spa = await copyPinsOf(
    content('service'),
    ctxOf('ja-restaurant/wp7/1.0.1', path.join(HERE, 'none')),
    {
      cms: 'wordpress',
      contentMap,
      lang: 'vi'
    }
  )
  assert.equal(spa.neutralItem, 'Dịch vụ')
  assert.ok(Object.values(spa.pins).includes('Dịch vụ'))
})

test('EmDash Tracy Base: a team member with no photo shows the place’s own space; no team portrait of the demo stays', async () => {
  const { emdashPictureInventory, planEmdashPictures } = await import(
    '../src/sites/brief-engines/emdash-real-pictures.js'
  )
  const { emdashCardPictureSlots } = await import('../src/sites/brief-engines/emdash-wo-copy.js')
  const seedDir = path.join(CMS, 'tracy-emdash-theme-base/seed')
  const slotRoles = slotRolesOf(DIRS.emdash).doc
  const admit = emdashCardPictureSlots(slotRoles)
  const before = await emdashPictureInventory({ seedDir, locales: ['en'] })
  const inventory = await emdashPictureInventory({ seedDir, locales: ['en'], admit })
  const team = inventory.slots.filter((s) => admit.has(`${s.collection}.${s.slug}.${s.path}`))
  assert.ok(team.length > 0, 'the team portraits are pictures this stage fills')
  assert.ok(!before.slots.some((s) => admit.has(`${s.collection}.${s.slug}.${s.path}`)))
  const bound = Object.fromEntries(team.map((s) => [`${s.collection}.${s.slug}.${s.path}`, { space: true }]))
  const real = {
    buildId: 'b',
    pictures: [
      {
        id: 'room',
        width: 2400,
        height: 2400,
        sha256: 'r',
        vision: { subject: 'interior', quality: 'good', textPresence: 'absent' }
      },
      {
        id: 'pho',
        width: 2400,
        height: 2400,
        sha256: 'p',
        vision: { subject: 'food', quality: 'good', textPresence: 'absent' }
      }
    ]
  }
  const plan = await planEmdashPictures({ inventory, real, bound })
  const teamIds = new Set(team.map((s) => s.id))
  const placed = plan.placements.filter((p) => teamIds.has(p.groupId))
  const held = plan.unfilled.filter((u) => teamIds.has(u.groupId))
  assert.equal(placed.length + held.length, team.length, 'every team portrait is replaced')
  assert.ok(placed.length > 0)
  for (const p of placed) assert.equal(p.mediaId, 'room', 'never a dish, never a stranger')
})
