/**
 * Which toolset a `content.contract` call needs (decision 27/09/2026, `tasks/todo-comment-to-edit.md`
 * "Decisions on the RAISE items", item 1): reads are `content` like every other content read, and an
 * `apply` whose changes name only text, image or link slots is `content` too — the content-only rule,
 * words change and layout does not. Everything else the contract writes stays `code`.
 *
 * No database, no network: one real profile this repository ships, plus literal maps for the types
 * no shipped profile carries yet.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contractFor, readContracts } from '../src/lib/contracts.js'
import {
  contractProfile,
  contractToolset,
  DERIVED_PROFILE,
  siteAuthority,
  slotToolset
} from '../src/sites/content-profile.js'

const profile = contractProfile(contractFor(readContracts(), 'tracy-business/wp7', '1.2.0'))
/** A literal profile: `slotTypes` is the only part these rules read. */
const literal = (slots) => ({ slotTypes: new Map(Object.entries(slots).map(([k, v]) => [k, new Set(v)])) })

test('slotToolset: text, image and link slots are content; anything else, or an unknown key, is code', () => {
  assert.ok(profile, 'the shipped tracy-business/wp7 1.2.0 profile is readable')
  assert.equal(slotToolset(profile, 'home.hero.eyebrow'), 'content', 'a text slot')
  const image = profile.contentMap.slots.find((slot) => slot.type === 'image').key
  const link = profile.contentMap.slots.find((slot) => slot.type === 'url').key
  assert.equal(slotToolset(profile, image), 'content', 'an image slot')
  assert.equal(slotToolset(profile, link), 'content', 'a link slot')
  assert.equal(slotToolset(profile, 'home.hero.layout'), 'code', 'a key the contract does not name')
  assert.equal(slotToolset(literal({ 'home.grid': ['columns'] }), 'home.grid'), 'code', 'a layout type')
  assert.equal(
    slotToolset(literal({ 'home.x': ['text', 'columns'] }), 'home.x'),
    'code',
    'one listing of another type is enough to keep the key at code'
  )
  assert.equal(slotToolset(null, 'home.hero.eyebrow'), 'code', 'no contract: no slot')
})

test('contractToolset: reads are content; apply on content slots only is content; every other write is code', () => {
  assert.deepEqual(contractToolset({ operation: 'inspect' }, profile, false), {
    toolset: 'content',
    outside: []
  })
  assert.deepEqual(contractToolset({}, null, false), { toolset: 'content', outside: [] })
  assert.deepEqual(
    contractToolset({ operation: 'apply', changes: { 'home.hero.eyebrow': 'Since 1999' } }, profile, true),
    { toolset: 'content', outside: [] }
  )
  assert.deepEqual(
    contractToolset(
      { operation: 'apply', changes: { 'home.hero.eyebrow': 'Since 1999', 'home.hero.layout': 'split' } },
      profile,
      true
    ),
    { toolset: 'code', outside: ['home.hero.layout'] },
    'one key outside the content slots keeps the whole apply at code, and is named'
  )
  assert.deepEqual(contractToolset({ operation: 'apply', changes: {} }, profile, true), {
    toolset: 'code',
    outside: []
  })
  assert.deepEqual(contractToolset({ operation: 'apply', changes: ['home.hero.eyebrow'] }, profile, true), {
    toolset: 'code',
    outside: []
  })
  assert.deepEqual(
    contractToolset({ operation: 'apply', changes: { 'home.hero.eyebrow': 'x' } }, null, true),
    { toolset: 'code', outside: ['home.hero.eyebrow'] },
    'a site with no contract has no content slots'
  )
  assert.deepEqual(
    contractToolset(
      { operation: 'multilingual.apply', changes: { 'home.hero.eyebrow': 'x' } },
      profile,
      true
    ),
    { toolset: 'code', outside: [] },
    'a structural operation is code whatever it carries'
  )
})

// ── An imported site: bound to a contract the plugin derives from its own database (29/09/2026,
// `tasks/todo-import-site-contract.md`). No quickstart tag, so no shipped profile: the plugin makes
// only text, image and link slots (`DerivedMap::build`), which is what `DERIVED_PROFILE` says.

const IMPORTED = { platform: 'wordpress', origin: 'migrated', quickstart_tag: null, quickstart_version: null }
const EDITOR = { content: true, code: false, site: false }
const VIEWER = { content: false, code: false, site: false }

test('siteAuthority: an imported WordPress or Joomla site is derived, and an editor writes its slots', () => {
  const editor = siteAuthority(IMPORTED, null, EDITOR)
  assert.equal(editor.profile, DERIVED_PROFILE)
  assert.equal(editor.apply, true)
  assert.equal(editor.slotOpen('post-12.post_content.abc'), true)
  assert.equal(slotToolset(DERIVED_PROFILE, 'post-12.post_content.abc'), 'content')
  const viewer = siteAuthority(IMPORTED, null, VIEWER)
  assert.equal(viewer.apply, false)
  assert.equal(viewer.slotOpen('post-12.post_content.abc'), false)
  assert.equal(siteAuthority({ ...IMPORTED, platform: 'joomla' }, null, EDITOR).profile, DERIVED_PROFILE)
})

test('siteAuthority: a fleet-born site with no quickstart, and an imported EmDash site, stay without a contract', () => {
  const born = siteAuthority({ ...IMPORTED, origin: 'fleet_born' }, null, EDITOR)
  assert.equal(born.apply, false)
  assert.equal(born.profile, null)
  assert.equal(born.slotOpen('post-12.post_content.abc'), false)
  assert.equal(siteAuthority({ ...IMPORTED, origin: null }, null, EDITOR).apply, false)
  assert.equal(siteAuthority({ ...IMPORTED, platform: 'emdash' }, null, EDITOR).apply, false)
})

test('siteAuthority: a sealed quickstart keeps its shipped profile', () => {
  const contract = contractFor(readContracts(), 'tracy-business/wp7', '1.2.0')
  const sealed = siteAuthority(
    { platform: 'wordpress', origin: 'fleet_born', quickstart_tag: 'tracy-business/wp7' },
    contract,
    EDITOR
  )
  assert.equal(sealed.profile, profile)
  assert.equal(sealed.apply, true)
  assert.equal(sealed.slotOpen('home.hero.eyebrow'), true)
  assert.equal(sealed.slotOpen('home.hero.layout'), false, 'an editor writes content slots only')
})

test('contractToolset: a derived apply is content; a WordPress string override is content on any site; derive is never content', () => {
  assert.deepEqual(
    contractToolset(
      { operation: 'apply', changes: { 'post-12.post_content.abc': 'Hi' } },
      DERIVED_PROFILE,
      true
    ),
    { toolset: 'content', outside: [] }
  )
  const string = {
    operation: 'string',
    domain: 'twentytwentyfive',
    msgid: 'Designed with WordPress',
    locale: 'en_US',
    value: 'Designed by Northwind',
    apply_id: 'a1'
  }
  assert.deepEqual(contractToolset(string, null, true), { toolset: 'content', outside: [] })
  assert.deepEqual(contractToolset(string, profile, true), { toolset: 'content', outside: [] })
  assert.deepEqual(contractToolset({ operation: 'derive' }, DERIVED_PROFILE, true), {
    toolset: 'code',
    outside: []
  })
})
