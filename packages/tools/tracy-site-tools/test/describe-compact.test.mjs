/**
 * The describe document, compacted for the model — and PROVED lossless (round 7 follow-up, 30/09/2026).
 * Neutral fixtures: no block, field or label of any bench site.
 *
 *   node --test packages/tools/tracy-site-tools/test/describe-compact.test.mjs
 *
 * Measured, before: a WordPress `content.read {describe:true}` answered 35,350 characters, 22,908 of them
 * `blockKinds` — 454 keys holding `null` (`translatable` on every field, `requiresEvidence` and
 * `emptyAllowed` on every constraint, `label`/`root`/`nestable` on every kind), which the content API
 * defines as "the relay did not determine it, implies nothing" — and the locale list twice (`site.locales`,
 * `i18n.locales`, 355 characters). The answer stays in every later step of the conversation.
 *
 * The proof is leaf by leaf: flatten the document before and after to `path → value`; every leaf that
 * is gone must be a `null` object key under `blockKinds`, or a leaf of `i18n.locales` when that list
 * equals `site.locales`; every other leaf must still be there, with an equal value, at the same path.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCallMemory } from '../src/host/call-memory.mjs'
import { compactDescribe as compact, DESCRIBE_SCHEMA } from '../src/host/describe-compact.mjs'
import { CONTENT_DESCRIBE, runSiteCall } from '../src/host/site-call.mjs'
import { planCall } from '../src/host/site.mjs'

/** @param {unknown} doc @returns {any} */
const compactDescribe = (doc) => compact(doc)

const isRecord = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Every leaf of a JSON value as `path → value`. A path is the keys and indices from the root, joined with
 * `/`; an empty object or list is a leaf of its own, so dropping one cannot hide.
 * @param {unknown} value
 * @param {string} [path]
 * @param {Map<string, unknown>} [out]
 */
function leaves(value, path = '', out = new Map()) {
  if (Array.isArray(value) && value.length > 0) value.forEach((v, i) => leaves(v, `${path}/${i}`, out))
  else if (isRecord(value) && Object.keys(value).length > 0)
    for (const [k, v] of Object.entries(value)) leaves(v, `${path}/${k}`, out)
  else out.set(path, value)
  return out
}

/** The locales both lists of a fixture carry: long enough to be worth dropping once. */
const LOCALES = ['en-US', 'ru-RU', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-BR', 'ja', 'cs-CZ', 'pl-PL']

/**
 * A describe document shaped like the relay's (`content-extend.js` `buildDescribe`): null where the relay
 * did not determine a thing, `i18n` repeating the site's locales, and `kinds` block kinds of `fields` fields.
 * @param {{ kinds?: number, fields?: number, i18nLocales?: string[] }} [opts]
 */
function describeDoc({ kinds = 3, fields = 12, i18nLocales = LOCALES } = {}) {
  const fieldAt = (/** @type {number} */ k, /** @type {number} */ i) => ({
    key: `kind_${k}.field_${i}`,
    type: i % 3 === 0 ? 'html' : 'text',
    translatable: null,
    writable: i % 4 === 0 ? null : true,
    constraints: {
      maxCharacters: i % 5 === 0 ? null : 40 + i,
      requiresEvidence: i % 7 === 0 ? false : null,
      emptyAllowed: i % 6 === 0 ? true : null
    }
  })
  return {
    schemaVersion: 'tracy-content-describe/v1',
    view: 'authenticated',
    site: { id: 's1', name: null, url: 'http://site.test', defaultLocale: 'en-US', locales: [...LOCALES] },
    provenance: null,
    protocol: { selected: 'tracy-content/v1', relayExtensions: ['writable'], cowork: { kind: 'wordpress' } },
    scope: 'published',
    i18n: { mode: 'entity', defaultLocale: 'en-US', locales: [...i18nLocales], fallback: null },
    presentation: { state: 'unknown', reason: null },
    permissions: { role: 'editor', toolsets: { content: true }, read: true, apply: true, note: 'x' },
    types: [
      {
        type: 'page',
        count: 7,
        next: { tool: 'tracy_site', action: 'content.read', params: { type: 'page' } }
      },
      { type: 'article', count: null, next: null }
    ],
    blockKinds: Array.from({ length: kinds }, (_, k) => ({
      kind: `kind_${k}`,
      label: k === 0 ? 'The first kind' : null,
      root: null,
      nestable: k === 1 ? true : null,
      fields: Array.from({ length: fields }, (_, i) => fieldAt(k, i))
    })),
    capabilities: [{ name: 'ai.tracy.content.read', version: '1' }],
    guidance: 'Read via types[].next.',
    links: { read: '/content.json', schema: 'urn:tracy:content:v1' },
    where: { pages: { note: null, call: { action: 'content.read', params: { view: 'pages' } } } }
  }
}

/** The proof: what is gone is null under blockKinds or the duplicate locale list; everything else is equal. */
function assertLossless(/** @type {any} */ before, /** @type {any} */ after) {
  const was = leaves(before)
  const now = leaves(after)
  const listDuplicated =
    Array.isArray(before.i18n?.locales) &&
    JSON.stringify(before.i18n.locales) === JSON.stringify(before.site?.locales) &&
    !isRecord(after.i18n?.locales) &&
    !Array.isArray(after.i18n?.locales)
  for (const [path, value] of now) {
    if (was.has(path)) {
      assert.deepEqual(value, was.get(path), `a leaf changed: ${path}`)
      continue
    }
    // The only leaf that may appear is an object emptied of its null keys (`constraints: {}`): the residue of
    // leaves that are gone, so every leaf that stood under it must have been a null, and be gone.
    assert.ok(isRecord(value) && Object.keys(value).length === 0, `a leaf appeared: ${path}`)
    const under = [...was].filter(([p]) => p.startsWith(`${path}/`))
    assert.ok(
      under.length > 0 && under.every(([p, v]) => v === null && !now.has(p)),
      `an emptied object held more than nulls: ${path}`
    )
  }
  for (const [path, value] of was) {
    if (now.has(path)) continue
    const underKinds = path.startsWith('/blockKinds/')
    const isObjectKey = !/\/\d+$/.test(path)
    const duplicate = listDuplicated && path.startsWith('/i18n/locales')
    assert.ok(
      (underKinds && isObjectKey && value === null) || duplicate,
      `a leaf was lost that is neither a null blockKinds key nor the duplicate locale list: ${path} = ${JSON.stringify(value)}`
    )
    if (duplicate) {
      const at = Number(path.split('/').pop())
      assert.equal(value, before.site.locales[at], `the dropped i18n.locales entry ${at} is site.locales'`)
    }
  }
}

test('🔒 every leaf removed is a null blockKinds key or the duplicated locale list, every other leaf is equal at its path', () => {
  const doc = describeDoc()
  const before = structuredClone(doc)
  const after = compactDescribe(doc)
  assertLossless(before, after)
  // …and something was actually removed: the proof is not vacuous.
  const gone = [...leaves(before).keys()].filter((p) => !leaves(after).has(p))
  assert.ok(
    gone.some((p) => p.startsWith('/blockKinds/') && p.endsWith('/translatable')),
    'null translatable'
  )
  assert.ok(
    gone.some((p) => p.endsWith('/requiresEvidence')),
    'null requiresEvidence'
  )
  assert.ok(
    gone.some((p) => p.startsWith('/i18n/locales')),
    'the duplicate list'
  )
  assert.equal(after.i18n.locales, undefined)
})

test('the proof is not vacuous: a compactor that loses a real leaf, a null the relay meant, or a different list is caught', () => {
  const doc = describeDoc()
  const cheat = (/** @type {(after: any) => void} */ edit) => {
    // the honest part first: what the real function does, so each cheat is one step beyond it
    const honest = compactDescribe(structuredClone(doc))
    edit(honest)
    return honest
  }
  const cheats = /** @type {[string, (after: any) => void][]} */ ([
    ['a number the relay gave', (a) => delete a.blockKinds[0].fields[1].constraints.maxCharacters],
    ['a writable:true', (a) => delete a.blockKinds[0].fields[1].writable],
    ['a false the relay gave', (a) => delete a.blockKinds[0].fields[0].constraints.requiresEvidence],
    ['a null outside blockKinds', (a) => delete a.site.name],
    ['a type’s unknown count', (a) => delete a.types[1].count],
    ['a value changed', (a) => (a.types[0].count = 8)],
    ['a key added', (a) => (a.blockKinds[0].extra = 1)],
    ['a kind dropped', (a) => a.blockKinds.pop()]
  ])
  for (const [name, edit] of cheats)
    assert.throws(() => assertLossless(structuredClone(doc), cheat(edit)), undefined, name)
  // a locale list dropped although it differs from the site's
  const other = describeDoc({ i18nLocales: [...LOCALES].reverse() })
  const wrong = structuredClone(other)
  delete wrong.i18n.locales
  assert.throws(() => assertLossless(structuredClone(other), wrong), undefined, 'a different list')
  // and the honest result passes the same check
  assertLossless(structuredClone(doc), compactDescribe(structuredClone(doc)))
})

test('the proof holds for documents of every size, a kind with no field, and a site with one language', () => {
  for (const opts of [
    { kinds: 0, fields: 0 },
    { kinds: 1, fields: 0 },
    { kinds: 1, fields: 1 },
    { kinds: 5, fields: 30 },
    { kinds: 2, fields: 3, i18nLocales: [LOCALES[0]] }
  ]) {
    const doc = describeDoc(opts)
    if (opts.i18nLocales) doc.site.locales = [...opts.i18nLocales]
    const before = structuredClone(doc)
    assertLossless(before, compactDescribe(doc))
  }
})

test('what is not null is never touched: false, 0, empty text, empty lists and objects, and null list items stay', () => {
  const doc = describeDoc({ kinds: 1, fields: 1 })
  doc.blockKinds[0].fields[0].constraints = {
    maxCharacters: 0,
    requiresEvidence: false,
    emptyAllowed: true,
    note: '',
    tags: [],
    extra: {},
    mixed: [null, 1, null]
  }
  doc.blockKinds[0].fields[0].writable = false
  const after = compactDescribe(doc)
  const c = after.blockKinds[0].fields[0].constraints
  assert.deepEqual(c, {
    maxCharacters: 0,
    requiresEvidence: false,
    emptyAllowed: true,
    note: '',
    tags: [],
    extra: {},
    mixed: [null, 1, null]
  })
  assert.equal(after.blockKinds[0].fields[0].writable, false)
})

test('a constraints object whose every member was null stays as {} — nothing is promoted to "absent"', () => {
  const doc = describeDoc({ kinds: 1, fields: 1 })
  doc.blockKinds[0].fields[0].constraints = {
    maxCharacters: null,
    requiresEvidence: null,
    emptyAllowed: null
  }
  const after = compactDescribe(doc)
  assert.deepEqual(after.blockKinds[0].fields[0].constraints, {})
})

test('null outside blockKinds is the relay’s own statement and stays: site.name, provenance, a type’s count and next, i18n.fallback', () => {
  const after = compactDescribe(describeDoc())
  assert.equal(after.site.name, null)
  assert.equal(after.provenance, null)
  assert.equal(after.types[1].count, null)
  assert.equal(after.types[1].next, null)
  assert.equal(after.i18n.fallback, null)
  assert.equal(after.where.pages.note, null)
  assert.deepEqual(after.presentation, { state: 'unknown', reason: null })
})

test('i18n.locales is dropped only when it is exactly site.locales — same entries, same order', () => {
  const same = compactDescribe(describeDoc())
  assert.equal(Object.hasOwn(same.i18n, 'locales'), false)
  assert.deepEqual(same.i18n, { mode: 'entity', defaultLocale: 'en-US', fallback: null })
  for (const [name, list] of /** @type {[string, string[]][]} */ ([
    ['a different order', [...LOCALES].reverse()],
    ['one more', [...LOCALES, 'nl-NL']],
    ['one fewer', LOCALES.slice(1)],
    ['one different', [...LOCALES.slice(0, -1), 'xx']],
    ['none', []]
  ])) {
    const doc = describeDoc({ i18nLocales: list })
    const after = compactDescribe(doc)
    assert.deepEqual(after.i18n.locales, list, name)
  }
  // no site locales to equal: kept
  const noSite = describeDoc()
  delete (/** @type {any} */ (noSite).site.locales)
  assert.deepEqual(compactDescribe(noSite).i18n.locales, LOCALES)
})

test('it saves what was measured on a document of the real shape, and only that document’s size changes', () => {
  // The real WordPress describe: 145 fields over two kinds — every field with translatable:null and a
  // constraints object holding two nulls, most with a number. blockKinds 22,908 → 13,286 characters.
  const doc = describeDoc({ kinds: 2, fields: 72 })
  const size = (/** @type {unknown} */ v) => JSON.stringify(v).length
  const after = compactDescribe(doc)
  assert.ok(
    size(after.blockKinds) < 0.75 * size(doc.blockKinds),
    `${size(after.blockKinds)} / ${size(doc.blockKinds)}`
  )
  assert.ok(size(after) < size(doc), 'the whole document is smaller')
  assert.ok(size(doc.i18n) - size(after.i18n) >= LOCALES.join('","').length, 'the locale list is gone')
  // the parts it does not touch are the same objects' worth of text
  for (const key of ['site', 'types', 'capabilities', 'guidance', 'links', 'where', 'permissions'])
    assert.equal(JSON.stringify(after[key]), JSON.stringify(doc[key]), key)
})

test('it does not mutate its input, is idempotent, and leaves anything that is not a describe document alone', () => {
  const doc = describeDoc()
  const frozen = structuredClone(doc)
  const deepFreeze = (/** @type {any} */ v) => {
    if (v && typeof v === 'object') {
      Object.values(v).forEach(deepFreeze)
      Object.freeze(v)
    }
    return v
  }
  deepFreeze(doc)
  const once = compactDescribe(doc)
  assert.deepEqual(doc, frozen, 'the input is as it was')
  assert.deepEqual(compactDescribe(once), once, 'compacting twice is compacting once')
  // another document kind, a refusal, and non-objects pass through untouched
  const listing = { schemaVersion: 'tracy-content/v1', contents: [], blockKinds: [{ label: null }] }
  assert.equal(compactDescribe(listing), listing)
  const refusal = { ok: false, code: 'BAD_PARAMS', blockKinds: [{ label: null }] }
  assert.equal(compactDescribe(refusal), refusal)
  for (const v of [null, undefined, 'x', 7, [], [doc]]) assert.equal(compactDescribe(v), v)
  // a hostile key is data, not a prototype
  /** @type {any} */
  const hostile = describeDoc({ kinds: 1, fields: 0 })
  hostile.blockKinds[0] = JSON.parse('{"kind":"k","__proto__":{"polluted":true},"root":null}')
  const out = compactDescribe(hostile)
  assert.equal(/** @type {any} */ ({}).polluted, undefined)
  assert.equal(Object.hasOwn(out.blockKinds[0], 'root'), false)
})

test('the door pins its constant to the one the host compares with', () => {
  // test-quality: contract the schema id the Claude Cowork plugin's describe answer carries; changing it is a protocol change
  assert.equal(CONTENT_DESCRIBE, 'tracy-content-describe/v1')
  assert.equal(DESCRIBE_SCHEMA, CONTENT_DESCRIBE)
})

// ── through the door: the model reads the compact document, the relay's own answer is not touched ─────────

/** @param {Record<string, any>} [over] */
const wordpress = (over = {}) => ({
  memory: createCallMemory({ now: () => 1_000 }),
  sessionId: 'session-w',
  label: 'wp-neutral',
  actorKey: 'ana@example.com',
  facts: { platform: 'wordpress', sealed: false },
  sleep: async () => {},
  ...over
})

test('🔒 content.read {describe:true} reaches the model compact — same facts, its next still built from them, the relay’s document untouched', async () => {
  const relayed = describeDoc()
  const before = structuredClone(relayed)
  const sent = /** @type {Array<[string, unknown]>} */ ([])
  // `blockKinds:true` (05/10/2026): without it the model is shown the document without its block kinds
  // (`read-compact.mjs`, `test/read-compact.test.mjs`); asked, they are the lossless compact form proved here.
  const p = planCall({ action: 'content.read', params: { describe: true, blockKinds: true } })
  assert.ok(p.ok, JSON.stringify(p))
  const ctx = wordpress({
    send: async (/** @type {string} */ action, /** @type {unknown} */ params) => {
      sent.push([action, params])
      return relayed
    }
  })
  const out = /** @type {any} */ (await runSiteCall({ ...ctx, plan: p }))
  assert.deepEqual(sent, [['content.read', { describe: true }]], 'blockKinds is never relayed')
  assert.deepEqual(relayed, before, 'what the relay answered is not changed in place')
  assert.equal(out.schemaVersion, CONTENT_DESCRIBE)
  // the next, from site.defaultLocale and types, is what it always was
  assert.equal(out.next.params.type, 'page')
  assert.equal(out.next.params.locale, 'en-US')
  // everything but `next` (which the door adds) is the compact form of the relay's document
  const { next: _next, ...rest } = out
  assert.deepEqual(rest, compactDescribe(before))
  assertLossless(before, rest)
  assert.ok(JSON.stringify(out).length < 0.8 * JSON.stringify(before).length, 'and it is smaller')
  assert.equal(
    ctx.memory.describeSeen('session-w', 'wp-neutral'),
    true,
    'the conversation has read the describe'
  )
})
