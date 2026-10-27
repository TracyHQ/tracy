/**
 * What the relay adds to a content.read answer and what it says in `describe` — pure functions, no
 * database, no network. The Claude Cowork plugins do not know who is asking; the relay does, so `writable`,
 * `next` and the describe document's permissions are decided here from the seat and the contract
 * profile, never by the Claude Cowork plugin and never by the agent.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { validateContent, validateDescribe } from '../src/lib/content-api.js'
import {
  buildDescribe,
  describeBlockKinds,
  describeGuidance,
  emdashCollectionOf,
  emdashContentTypes,
  extendEnvelope,
  profileLocales,
  RELAY_EXTENSIONS,
  slotConstraints
} from '../src/sites/content-extend.js'

const repo = (rel) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url))
const readJson = (rel) => JSON.parse(readFileSync(repo(rel), 'utf8'))

const JOOMLA_MAP = readJson(
  'packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.0/content-map.json'
)
const WP_MAP = readJson(
  'packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.2.0/content-map.json'
)
const EMDASH_MODEL = readJson('packages/cms/tracy-emdash-theme-business/seed/site-model.json')
const EMDASH_TYPES = readJson('packages/cms/tracy-emdash-theme-business/seed/content-api-map.json')

/** The package's own Joomla fixture: one mapped field, one item field with no slot. */
const fixture = () => readJson('packages/cms/tracy-content-api/test/fixtures/joomla.json')

/** A v1 envelope with one mapped field, one unmapped field and one item field (shape only). */
function envelope() {
  return {
    schemaVersion: 'tracy-content/v1',
    site: { id: 's1', name: null, url: 'https://x.invalid', defaultLocale: 'en-GB', locales: ['en-GB'] },
    pagination: { limit: 30, nextCursor: null, total: 2 },
    completeness: { scope: 'mapped-content', status: 'complete', unresolved: [] },
    contents: [
      {
        id: 'c-page',
        type: 'page',
        fields: [
          {
            key: 'module-430.0',
            type: 'text',
            value: 'Request a quote',
            slotKey: 'module-430.0',
            semanticKey: null
          }
        ],
        blocks: [
          {
            id: 'b-list',
            fields: [],
            items: [
              {
                id: 'i1',
                position: 0,
                contentId: null,
                fields: [{ key: 'caption', type: 'text', value: 'Card', slotKey: null, semanticKey: null }]
              }
            ]
          }
        ]
      },
      { id: 'c-shared', type: 'shared', fields: [], blocks: [] }
    ]
  }
}

const slots = slotConstraints(JOOMLA_MAP)

test('extend: a mapped field is writable, carries its slot constraints and the apply call', () => {
  const out = extendEnvelope(envelope(), { apply: true, slots, kind: 'joomla' })
  const [page, shared] = out.contents
  const field = page.fields[0]
  assert.equal(field.writable, true)
  assert.deepEqual(field.constraints, { maxCharacters: 50, requiresEvidence: false, emptyAllowed: null })
  assert.deepEqual(field.next, {
    tool: 'tracy_site',
    action: 'content.contract',
    operation: 'apply',
    changes: { 'module-430.0': null }
  })
  // A field with no slot: nothing proves it can be written, and nothing proves it cannot.
  const caption = page.blocks[0].items[0].fields[0]
  assert.equal(caption.writable, null)
  assert.equal(caption.constraints, null)
  assert.equal(caption.next, null)
  assert.equal(page.writable, true)
  assert.equal(page.blocks[0].writable, null)
  assert.equal(shared.writable, null)
  assert.deepEqual(out.protocol, {
    selected: 'tracy-content/v1',
    relayExtensions: [...RELAY_EXTENSIONS],
    cowork: { kind: 'joomla', capability: 'v1' }
  })
})

test('extend: the package fixture, extended either way, passes the shared validator', () => {
  for (const apply of [true, false]) {
    const out = extendEnvelope(fixture(), { apply, slots, kind: 'joomla' })
    assert.deepEqual(validateContent(out), [], `apply=${apply}`)
  }
})

test('extend: without apply every level is false and nothing points at a write', () => {
  const out = extendEnvelope(envelope(), { apply: false, slots, kind: 'joomla' })
  const [page] = out.contents
  assert.equal(page.writable, false)
  assert.equal(page.blocks[0].writable, false)
  assert.equal(page.fields[0].writable, false)
  assert.equal(page.fields[0].next, null)
  assert.equal(page.blocks[0].items[0].fields[0].writable, false)
  // Constraints describe the slot, not the seat: they stay.
  assert.equal(page.fields[0].constraints.maxCharacters, 50)
})

test('extend: nothing else in the envelope moves, and an error answer is returned as it came', () => {
  const before = envelope()
  const out = extendEnvelope(structuredClone(before), { apply: true, slots, kind: 'joomla' })
  assert.equal(out.contents[0].fields[0].value, 'Request a quote')
  assert.deepEqual(out.site, before.site)
  assert.deepEqual(out.pagination, before.pagination)
  const error = { error: { code: 'CONTENT_NOT_FOUND', message: 'x' } }
  assert.deepEqual(extendEnvelope(structuredClone(error), { apply: true, slots, kind: 'joomla' }), error)
  // A bare envelope (no contents) is still an envelope.
  const bare = extendEnvelope({ schemaVersion: 'tracy-content/v1' }, { apply: true, slots, kind: 'joomla' })
  assert.equal(bare.protocol.selected, 'tracy-content/v1')
})

test('extend: a WordPress fixture slotKey finds its slot in the WordPress map', () => {
  const wp = slotConstraints(WP_MAP)
  assert.deepEqual(wp.get('home.hero.heading'), {
    maxCharacters: WP_MAP.slots.find((s) => s.key === 'home.hero.heading').maxCharacters,
    requiresEvidence: null,
    emptyAllowed: null
  })
})

test('describe: every slot of Tracy Business j6 1.2.0 lands in exactly one block kind field', () => {
  const kinds = describeBlockKinds({ platform: 'joomla', contentMap: JOOMLA_MAP, apply: true })
  const entityKind = new Map(JOOMLA_MAP.entities.map((e) => [e.key, e.kind]))
  for (const slot of JOOMLA_MAP.slots) {
    const holders = kinds
      .filter((k) => k.kind === entityKind.get(slot.entity))
      .flatMap((k) => k.fields.filter((f) => f.key === `${slot.column}:${slot.type}`))
    assert.equal(holders.length, 1, `slot ${slot.key}`)
  }
  assert.ok(kinds.every((k) => k.fields.every((f) => f.writable === true)))
  const readOnly = describeBlockKinds({ platform: 'joomla', contentMap: JOOMLA_MAP, apply: false })
  assert.ok(readOnly.every((k) => k.fields.every((f) => f.writable === false)))
})

test('describe: every WordPress slot lands in exactly one block kind field', () => {
  const kinds = describeBlockKinds({ platform: 'wordpress', contentMap: WP_MAP, apply: true })
  assert.equal(kinds.reduce((n, k) => n + k.fields.length, 0) > 0, true, 'the WordPress map yields fields')
  const entityKind = new Map(WP_MAP.entities.map((e) => [e.key, e.kind]))
  for (const slot of WP_MAP.slots) {
    const t = slot.target
    const key = t.block ?? (t.field ? `${t.option}.${t.field}` : t.option)
    const holders = kinds
      .filter((k) => k.kind === entityKind.get(slot.entity))
      .flatMap((k) => k.fields.filter((f) => f.key === key))
    assert.equal(holders.length, 1, `slot ${slot.key}`)
  }
})

test('describe: a map the shared mapper refuses yields no kinds, not a guessed shape', () => {
  const refused = {
    entities: [{ key: 'm1', kind: 'module', identity: {} }],
    slots: [{ key: 'x.0', entity: 'nowhere', column: 'content', type: 'text' }]
  }
  assert.deepEqual(describeBlockKinds({ platform: 'joomla', contentMap: refused, apply: true }), [])
  assert.deepEqual(describeBlockKinds({ platform: 'joomla', contentMap: null, apply: true }), [])
})

test('describe: EmDash kinds come from the site model, never marked writable', () => {
  const kinds = describeBlockKinds({ platform: 'emdash', siteModel: EMDASH_MODEL, apply: false })
  assert.ok(kinds.some((k) => k.kind === 'site' && k.label === 'Site chrome'))
  assert.ok(kinds.every((k) => k.fields.every((f) => f.writable === null)))
  assert.deepEqual(describeBlockKinds({ platform: 'emdash', siteModel: null, apply: false }), [])
  assert.deepEqual(emdashContentTypes(EMDASH_TYPES), [
    'shared',
    'page',
    'service',
    'project',
    'article',
    'generic'
  ])
})

// ADR 0022 opened files and the shell on quickstart sites, so the guidance has to say why words
// still go through the content door (revisions, undo) — as a preference, never a refusal — and
// it has to fit the schema's cap, since `.slice(0, 600)` would cut it silently.
test('describe: with apply, the guidance prefers the content door for words and fits the cap whole', () => {
  for (const platform of ['joomla', 'wordpress', 'emdash']) {
    for (const designBaseline of [true, false]) {
      const guidance = describeGuidance({ platform, apply: true, designBaseline })
      assert.match(
        guidance,
        /content\.contract.*prefer this door to files or CLI.*revisions and undo/i,
        `${platform} ${designBaseline}`
      )
      assert.doesNotMatch(guidance, /never edit files|locked/i)
      assert.match(guidance, /types\[\]\.next/)
      assert.match(guidance, /types\[\]\.type, not blockKinds\.kind/)
      assert.ok(guidance.length <= 600 && guidance.endsWith('.'), `${platform}: ${guidance.length} chars`)
    }
    const readOnly = describeGuidance({ platform, apply: false, designBaseline: true })
    assert.doesNotMatch(readOnly, /prefer/i)
  }
})

test('describe: an unsupported reader does not recommend a null read call', () => {
  for (const platform of ['joomla', 'wordpress', 'emdash']) {
    const guidance = describeGuidance({ platform, apply: false, designBaseline: true, readSupported: false })
    assert.match(guidance, /no working Content API reader/)
    assert.doesNotMatch(guidance, /types\[\]\.next|read-only through this door/)
    assert.ok(guidance.length <= 600 && guidance.endsWith('.'))
  }
})

test('describe: the document built for a sealed Joomla site passes the shared validator', () => {
  const doc = buildDescribe({
    siteKey: 'lantern.localhost',
    site: { platform: 'joomla', quickstart_tag: 'tracy-business/j6', quickstart_version: '1.2.0' },
    probe: null,
    counts: {},
    contract: { id: 'tracy-business/j6/1.2.0' },
    contractHash: 'a'.repeat(64),
    presentation: {
      state: 'unlocked',
      reason: 'content recommendation: keep the design baseline in contract profile tracy-business/j6/1.2.0'
    },
    permissions: {
      role: 'owner',
      toolsets: { content: true, code: true, site: true, lifecycle: true },
      apply: true
    },
    blockKinds: describeBlockKinds({ platform: 'joomla', contentMap: JOOMLA_MAP, apply: true }),
    fallback: {
      url: 'http://lantern.localhost/',
      defaultLocale: null,
      locales: profileLocales(JOOMLA_MAP),
      types: []
    }
  })
  assert.deepEqual(validateDescribe(doc), [])
  assert.deepEqual(doc.site.locales, ['en-GB', 'ru-RU'])
  assert.equal(doc.site.defaultLocale, 'en-GB')
  assert.equal(doc.protocol.cowork.capability, 'unsupported')
  assert.ok(doc.types.every((t) => t.count === null))
  assert.ok(doc.types.every((t) => t.next === null))
  assert.ok(doc.capabilities.some((c) => c.name === 'ai.tracy.content.slot-write'))
})

test('describe: a Claude Cowork plugin that paged the probe by its byte budget gets the budget capability; one that ignored it does not', () => {
  const build = (pagination) =>
    buildDescribe({
      siteKey: 'lantern.localhost',
      site: { platform: 'joomla', quickstart_tag: 'tracy-business/j6', quickstart_version: '1.2.0' },
      probe: {
        schemaVersion: 'tracy-content/v1',
        site: { locales: ['en-GB'], defaultLocale: 'en-GB' },
        pagination,
        contents: []
      },
      counts: {},
      contract: null,
      contractHash: null,
      presentation: { state: 'unknown', reason: null },
      permissions: {
        role: 'owner',
        toolsets: { content: true, code: false, site: true, lifecycle: true },
        apply: false
      },
      blockKinds: [],
      fallback: { url: 'http://lantern.localhost/', defaultLocale: null, locales: [], types: [] }
    })
  const paged = build({ limit: 1, nextCursor: null, total: 0, budget: 8192 })
  assert.ok(paged.capabilities.some((c) => c.name === 'ai.tracy.content.budget'))
  assert.deepEqual(validateDescribe(paged), [])
  const ignored = build({ limit: 1, nextCursor: null, total: 0 })
  assert.ok(!ignored.capabilities.some((c) => c.name === 'ai.tracy.content.budget'))
})

// ── EmDash: entries written through tracy_emdash, not a contract (v6 #2, 28/09/2026) ─────────────

/** The EmDash Business reader's own envelope, over entries shaped as a Business site stores them. */
async function emdashRead(rows, query) {
  const { envelope: read } = await import(
    '../../../packages/cms/tracy-emdash-theme-business/tools/content-api/reader.mjs'
  )
  const config = readJson('packages/cms/tracy-emdash-theme-business/template.config.json')
  const options = {
    mapping: EMDASH_TYPES,
    types: EMDASH_MODEL.types,
    locales: config.locales,
    defaultLocale: config.defaultLocale,
    identifiedFields: EMDASH_MODEL.types.flatMap((t) =>
      t.fields.filter((f) => f.type === 'group').map((f) => `${t.name}.${f.name}`)
    )
  }
  const identity = { user: 'u', role: 50, scopes: ['content:read'] }
  return read(rows, query, options, identity, 'fixture-only-key', 'https://site.example.test', 'seed')
}

const emdashRow = (collection, slug, data) => ({
  collection,
  item: {
    id: `${collection}-${slug}`,
    createdAt: '2026-09-25T00:00:00Z',
    updatedAt: '2026-09-25T00:00:00Z',
    locale: 'en',
    slug,
    status: 'published',
    translationGroup: `${collection}-${slug}`,
    data
  }
})
const ROW = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const EMDASH_ROWS = [
  emdashRow('home', 'home', {
    title: 'Home',
    hero_title_a: 'Built to last',
    stats: [
      { _rowId: ROW(1), value: '25', label: 'years' },
      { _rowId: ROW(2), value: '400', label: 'projects' }
    ]
  }),
  emdashRow('services', 'general-contracting', { title: 'General contracting', description: 'Turnkey.' }),
  emdashRow('posts', 'tender', {
    title: 'We won the tender',
    content: [
      { _type: 'block', _key: 'p1', children: [{ _type: 'span', text: 'First paragraph.' }] },
      { _type: 'block', _key: 'p2', children: [{ _type: 'span', text: 'Second paragraph.' }] }
    ]
  })
]

/** One content, read in detail by the reader and extended by the relay. */
async function emdashDetail(slug, write) {
  const list = await emdashRead(EMDASH_ROWS, { limit: 30 })
  const id = list.contents.find((c) => c.slug === slug).id
  const out = extendEnvelope(await emdashRead(EMDASH_ROWS, { id, limit: 30 }), {
    apply: false,
    slots: new Map(),
    kind: 'emdash',
    emdash: { write, contentApiMap: EMDASH_TYPES }
  })
  assert.deepEqual(validateContent(out), [], `${slug} write=${write}`)
  return out.contents[0]
}
const fieldOf = (content, key) => content.fields.find((f) => f.key === key)

test('extend EmDash: a content seat gets writable fields with the tracy_emdash call that writes each', async () => {
  const home = await emdashDetail('home', true)
  assert.deepEqual(fieldOf(home, 'hero_title_a').next, {
    tool: 'tracy_emdash',
    action: 'content_update',
    // Every singleton page of Business is a collection of type page: nothing names which one.
    arguments: {
      collection: null,
      id: 'home',
      locale: 'en',
      data: { hero_title_a: null },
      status: 'published'
    }
  })
  assert.equal(fieldOf(home, 'hero_title_a').writable, true)
  assert.equal(fieldOf(home, 'hero_title_a').constraints, null)
  // A repeater row's field: its row, in the list shape the words road takes.
  const stats = home.blocks.find((b) => b.key === 'stats')
  const label = stats.items[1].fields.find((f) => f.key === 'label')
  assert.deepEqual(label.next.arguments.data, { stats: { 1: { label: null } } })
  assert.equal(stats.writable, true)
  assert.equal(home.writable, true)

  // One collection maps the type: it is named.
  const service = await emdashDetail('general-contracting', true)
  assert.equal(fieldOf(service, 'title').next.arguments.collection, 'services')

  // A text block of a rich-text field has no one-key write: nothing proves a call, none is given.
  const post = await emdashDetail('tender', true)
  assert.equal(fieldOf(post, 'title').next.arguments.collection, 'posts')
  for (const key of ['content.p1', 'content.p2']) {
    assert.equal(fieldOf(post, key).writable, null, key)
    assert.equal(fieldOf(post, key).next, null, key)
  }
})

test('extend EmDash: without the content toolset every level is false and nothing points at a write', async () => {
  const home = await emdashDetail('home', false)
  assert.equal(home.writable, false)
  assert.ok(home.fields.every((f) => f.writable === false && f.next === null))
  assert.ok(home.blocks.every((b) => b.writable === false))
})

test('extend EmDash: the shared validator refuses a next that names another field or a value', async () => {
  const home = await emdashDetail('home', true)
  const envelopeOf = (content) => ({
    schemaVersion: 'tracy-content/v1',
    view: 'authenticated',
    site: { id: 's', name: null, url: 'https://site.example.test', defaultLocale: 'en', locales: ['en'] },
    provenance: null,
    snapshot: { revision: 'r', readAt: '2026-09-25T00:00:00Z' },
    pagination: { limit: 30, nextCursor: null, total: 1 },
    completeness: { scope: 'mapped-content', status: 'complete', unresolved: [] },
    contents: [content]
  })
  const other = structuredClone(home)
  fieldOf(other, 'hero_title_a').next.arguments.data = { hero_title_b: null }
  assert.ok(validateContent(envelopeOf(other)).some((e) => e.code === 'NEXT_FIELD_MISMATCH'))
  const valued = structuredClone(home)
  fieldOf(valued, 'hero_title_a').next.arguments.data = { hero_title_a: 'typed by the relay' }
  assert.ok(validateContent(envelopeOf(valued)).some((e) => e.code === 'NEXT_FIELD_MISMATCH'))
})

test('emdashCollectionOf: a collection only when exactly one maps the type', () => {
  assert.equal(emdashCollectionOf(EMDASH_TYPES, 'service'), 'services')
  assert.equal(emdashCollectionOf(EMDASH_TYPES, 'article'), 'posts')
  assert.equal(emdashCollectionOf(EMDASH_TYPES, 'shared'), 'site')
  assert.equal(emdashCollectionOf(EMDASH_TYPES, 'page'), null)
  assert.equal(emdashCollectionOf(null, 'service'), null)
})

/** An EmDash describe as the relay builds it, with or without a reader in the site's image. */
function emdashDescribe({ reader, entryWrite }) {
  return buildDescribe({
    siteKey: 'lantern.localhost',
    site: { platform: 'emdash', quickstart_tag: 'tracy-business/emdash-0.x', quickstart_version: '1.4.5' },
    probe: reader
      ? {
          schemaVersion: 'tracy-content/v1',
          site: { locales: ['en', 'ru'], defaultLocale: 'en' },
          contents: []
        }
      : null,
    counts: {},
    contract: null,
    contractHash: null,
    presentation: {
      state: 'unlocked',
      reason: 'content recommendation: keep the design of template tracy-business'
    },
    permissions: {
      role: entryWrite ? 'editor' : 'owner',
      toolsets: { content: entryWrite, code: false, site: false, lifecycle: false },
      apply: false,
      entryWrite
    },
    blockKinds: describeBlockKinds({ platform: 'emdash', siteModel: EMDASH_MODEL, apply: false }),
    fallback: {
      url: 'http://lantern.localhost/',
      defaultLocale: 'en',
      locales: ['en', 'ru'],
      types: emdashContentTypes(EMDASH_TYPES)
    }
  })
}

// Measured before this (v6 stand, benchemdash02): the note said "reading only" and the guidance
// "content.contract has no apply", while the same seat's agent wrote the entries with tracy_emdash.
test('describe EmDash: a content seat is told its write road, never "reading only"', () => {
  for (const reader of [true, false]) {
    const doc = emdashDescribe({ reader, entryWrite: true })
    assert.deepEqual(validateDescribe(doc), [], `reader=${reader}`)
    assert.ok(doc.capabilities.some((c) => c.name === 'ai.tracy.content.entry-write'))
    assert.ok(!doc.capabilities.some((c) => c.name === 'ai.tracy.content.slot-write'))
    assert.match(doc.permissions.note, /tracy_emdash content_update/)
    assert.doesNotMatch(doc.permissions.note, /reading only/)
    assert.match(doc.guidance, /tracy_emdash content_update/)
    assert.doesNotMatch(doc.guidance, /content\.contract has no apply/)
  }
  const reader = emdashDescribe({ reader: false, entryWrite: false })
  assert.match(reader.permissions.note, /does not hold the content toolset/)
  assert.ok(!reader.capabilities.some((c) => c.name === 'ai.tracy.content.entry-write'))
})

// With no reader (a Business image built without the switch), a describe used to be followed by
// the listing every describe leads to — a read that can only refuse. It names the road that answers.
test('describe EmDash with no reader: the read road is tracy_emdash content_get, never content.read again', () => {
  const doc = emdashDescribe({ reader: false, entryWrite: true })
  assert.equal(doc.protocol.cowork.capability, 'unsupported')
  assert.ok(doc.types.every((t) => t.next === null))
  assert.match(doc.guidance, /tracy_emdash content_get \{collection, id:<slug>\}/)
  assert.match(doc.next, /tracy_emdash content_get/)
  assert.match(doc.next, /do not call content\.read again/)
  // With a reader the ordinary listing stays the next step (tracy-site-tools adds it).
  assert.equal('next' in emdashDescribe({ reader: true, entryWrite: true }), false)
})

test('describe EmDash: every guidance variant fits the cap whole', () => {
  for (const readSupported of [true, false])
    for (const entryWrite of [true, false])
      for (const designBaseline of [true, false]) {
        const line = describeGuidance({
          platform: 'emdash',
          apply: false,
          readSupported,
          entryWrite,
          designBaseline
        })
        assert.ok(line.length <= 600 && line.endsWith('.'), `${readSupported} ${entryWrite}: ${line.length}`)
      }
})
