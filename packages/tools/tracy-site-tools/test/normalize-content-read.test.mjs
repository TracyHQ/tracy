/**
 * `normalize.mjs` on `content.read`: the four shapes of a wrong call whose intent is unambiguous
 * (measured 28/09/2026 on real agent sessions, dev + local stand, logs since 26/09) are corrected before
 * they leave, and said in `notes`; everything else — a timestamp in changedSince, an unknown name, a
 * wrong value — is relayed as asked, so the relay's worded refusal names what to fix.
 *
 * Round 7 (30/09/2026) added the keys of `fields` (`content-read-fields.mjs`): a key the relay always
 * returns, or one the record does not have, is taken off instead of refused, and `revision` is added
 * when the read shows slots.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  projectEnvelope,
  projectionOf,
  PROJECTION_PATHS
} from '../../../../apps/tracy-web/src/sites/content-fields.js'
import { ALWAYS_KEPT, FIELD_PATHS, normalizeFields } from '../src/host/content-read-fields.mjs'
import { CONTENT_READ_KEPT, normalizeCall } from '../src/host/normalize.mjs'
import { FIELDS_NEXT, refusalNext } from '../src/host/site.mjs'

const VERSION = `cv1.${'a'.repeat(32)}`

/** @param {Record<string, unknown>} params @param {string} [platform] */
const read = (params, platform = 'joomla') => normalizeCall('content.read', params, { platform })

/** @param {Record<string, unknown>} params */
const relayed = (params) => {
  const n = read(params)
  assert.equal(n.kind, 'relay', JSON.stringify(n))
  return /** @type {{ params: Record<string, unknown>, notes: string[] }} */ (/** @type {unknown} */ (n))
}

/** @param {Record<string, unknown>} params */
const untouched = (params) => {
  const n = relayed(params)
  assert.deepEqual(n.params, params)
  assert.deepEqual(n.notes, [])
}

test('1: an id names one content — the listing filters beside it are dropped, and said', () => {
  const n = relayed({ id: 'c-12', type: 'page', locale: 'en-GB', limit: 5, fields: 'title', maxBytes: 65536 })
  assert.deepEqual(n.params, { id: 'c-12', fields: 'title', maxBytes: 65536 })
  assert.ok(
    n.notes.some(
      (x) => /params\.type, params\.locale, params\.limit dropped/.test(x) && /id reads one content/.test(x)
    )
  )
  // What reads one content stays with it.
  const b = relayed({ id: 'c-12', blockId: 'b-1', blocksCursor: 'x', itemsCursor: 'y', cursor: 'z' })
  assert.deepEqual(b.params, { id: 'c-12', blockId: 'b-1', blocksCursor: 'x', itemsCursor: 'y' })
  assert.deepEqual(relayed({ id: 'c-12', view: 'pages', url: '/about' }).params, { id: 'c-12' })
})

test('2: changedSince takes only locale — the rest is dropped, and said', () => {
  const n = relayed({ changedSince: VERSION, type: 'page', limit: 20, locale: 'vi' })
  assert.deepEqual(n.params, { changedSince: VERSION, locale: 'vi' })
  assert.ok(n.notes.some((x) => /params\.type, params\.limit dropped/.test(x) && /changedSince/.test(x)))
})

test('3: view "pages" takes only locale, url, ifVersion, changedSince — the rest is dropped, and said', () => {
  const n = relayed({ view: 'pages', offset: 20, limit: 50, type: 'page', locale: 'en-GB' })
  assert.deepEqual(n.params, { view: 'pages', locale: 'en-GB' })
  assert.ok(
    n.notes.some(
      (x) => /params\.offset, params\.limit, params\.type dropped/.test(x) && /view "pages"/.test(x)
    )
  )
  const c = relayed({ view: 'pages', changedSince: VERSION, url: '/', ifVersion: VERSION, cursor: 'x' })
  assert.deepEqual(c.params, { view: 'pages', changedSince: VERSION, url: '/', ifVersion: VERSION })
})

test('4: fields naming id or native — ids are always kept, so the names are dropped, and said', () => {
  const s = relayed({ type: 'page', fields: 'id, title,native' })
  assert.deepEqual(s.params, { type: 'page', fields: 'title' })
  assert.ok(s.notes.some((x) => /fields id, native dropped/.test(x)))
  // A read of slots also asks for `revision` (see the revision test below).
  assert.deepEqual(relayed({ id: 'c-1', fields: ['id', 'blocks.fields.value'] }).params, {
    id: 'c-1',
    fields: ['blocks.fields.value', 'revision']
  })
  // Nothing left to name: `fields` itself goes, and the read answers everything.
  const e = relayed({ id: 'c-1', fields: ['id', 'native'] })
  assert.deepEqual(e.params, { id: 'c-1' })
  assert.ok(e.notes.some((x) => /params\.fields dropped/.test(x)))
})

test('the same correction on every platform that has the door', () => {
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    const n = read({ id: 'c-12', type: 'page' }, platform)
    assert.equal(n.kind, 'relay')
    assert.deepEqual(/** @type {any} */ (n).params, { id: 'c-12' })
  }
})

test('unsafe: a timestamp, an unknown name, a wrong value — relayed as asked, for the relay to word', () => {
  untouched({ changedSince: '2026-09-27T10:00:00Z', type: 'page' })
  untouched({ id: 'c-12', match: 'Contact', type: 'page' })
  untouched({ view: 'pages', match: 'about', limit: 5 })
  untouched({ id: 'c-12', type: 'news' })
  untouched({ view: 'list', limit: 5 })
  untouched({ id: 'c-12', limit: 500 })
  untouched({ view: 'pages', ifVersion: 'yesterday', limit: 5 })
  untouched({ fields: 42, id: 'c-12', type: 'page' })
  untouched({ describe: true, type: 'page' })
  untouched({ ids: ['a', 'b'], type: 'page' })
  // An id beside changedSince asks two things; neither is guessed.
  untouched({ id: 'c-12', changedSince: VERSION })
})

// 🔒 09/10/2026 (bench hb): `type:"post"` — WordPress's word for its posts — was refused CONTENT_BAD_QUERY on every
// such read, and the refusal hid a `fields` key the normaliser would have dropped. A word with one reading is the
// Content API's type, said; a word with two ("news", "blog": a page or the posts it lists) stays for the relay.
test('a CMS word for a type is read as the Content API type, and said; a word with two readings is relayed as asked', () => {
  for (const [word, type] of /** @type {[string, string][]} */ ([
    ['post', 'article'],
    ['posts', 'article'],
    ['articles', 'article'],
    ['Article', 'article'],
    ['pages', 'page'],
    ['menuItem', 'page'],
    ['module', 'shared'],
    ['modules', 'shared'],
    ['projects', 'project'],
    ['services', 'service']
  ])) {
    for (const platform of ['wordpress', 'joomla', 'emdash']) {
      const n = read({ type: word, locale: 'en-GB', fields: 'title,slug' }, platform)
      assert.equal(n.kind, 'relay', `${platform} ${word}`)
      assert.deepEqual(n.params, { type, locale: 'en-GB', fields: 'title,slug' }, `${platform} ${word}`)
      assert.deepEqual(
        n.notes,
        [`type "${word}" → "${type}" (content.read's word for it)`],
        `${platform} ${word}`
      )
    }
  }
  // the type read, the rest of the call is shaped as for any listing: a key the record lacks is dropped
  const status = relayed({ type: 'post', fields: 'title,slug,status', limit: 100 })
  assert.deepEqual(status.params, { type: 'article', fields: 'title,slug', limit: 100 })
  assert.equal(status.notes[0], 'type "post" → "article" (content.read\'s word for it)')
  for (const word of ['news', 'blog', 'banner', '']) untouched({ type: word, locale: 'en-GB' })
})

test('a correct call is relayed untouched', () => {
  untouched({ describe: true })
  untouched({ type: 'page', locale: 'en-GB', limit: 20 })
  untouched({ id: 'c-12', blockId: 'b-1', fields: 'title,revision,blocks.fields.value' })
  untouched({ type: 'page', locale: 'en-GB', fields: 'title,slug,url' })
  untouched({ view: 'pages', locale: 'vi', url: '/lien-he' })
  untouched({ changedSince: VERSION, locale: 'vi' })
  untouched({ ids: ['a', 'b'], maxBytes: 65536 })
})

test('🔒 every name the normaliser keeps is a name content.read takes (apps/tracy-web content-query.js)', () => {
  const source = readFileSync(
    new URL('../../../../apps/tracy-web/src/lib/content-query.js', import.meta.url),
    'utf8'
  )
  const names = [...source.matchAll(/\{\s*name:\s*'([A-Za-z]+)'/g)].map((m) => m[1])
  assert.ok(names.length >= 15, `read ${names.length} names from content-query.js`)
  for (const [shape, kept] of Object.entries(CONTENT_READ_KEPT))
    for (const name of kept)
      assert.ok(names.includes(name), `${shape} keeps "${name}", not in CONTENT_QUERY_NAMES`)
})

// ── Round 7 (30/09/2026): the keys of `fields` ─────────────────────────────────────────────────────
// 12 of the 15 refused reads on the bench were a `fields` key that does not exist, five of them
// `blocks.fields.key` — a key the relay returns whether asked or not.

test('5: a block id or a field key — what the relay always returns — is taken off `fields`, and said', () => {
  const n = relayed({
    id: 'c-1',
    fields: 'title,blocks.role,blocks.id,blocks.fields.key,blocks.fields.slotKey,blocks.fields.value'
  })
  assert.equal(n.params.fields, 'title,blocks.role,blocks.fields.slotKey,blocks.fields.value,revision')
  assert.ok(
    n.notes.some((x) => /fields blocks\.id, blocks\.fields\.key dropped: ids are always kept/.test(x))
  )
  // The same for a record's own fields, in a list, on a listing.
  const own = relayed({ type: 'page', fields: ['title', 'fields.key', 'fields.value', 'native'] })
  assert.deepEqual(own.params.fields, ['title', 'fields.value', 'revision'])
  assert.ok(own.notes.some((x) => /fields fields\.key, native dropped/.test(x)))
})

test('6: a key that names nothing is taken off and said; the rest is read in the same call', () => {
  const n = relayed({
    id: 'c-1',
    fields: 'title,blocks.role,blocks.kind,blocks.name,blocks.title,blocks.slotName,blocks.fields.value'
  })
  assert.equal(n.params.fields, 'title,blocks.role,blocks.fields.value,revision')
  assert.ok(
    n.notes.some(
      (x) => x === 'fields blocks.kind, blocks.name, blocks.title, blocks.slotName dropped: no such key'
    )
  )
  // What a block has is said once, for a block key that was wrong — never for a content key.
  assert.ok(n.notes.some((x) => x.startsWith('a block has key, role, position') && x.length <= 90))
  const wrongContent = relayed({ type: 'page', fields: 'title,heading' })
  assert.equal(wrongContent.params.fields, 'title')
  assert.deepEqual(wrongContent.notes, ['fields heading dropped: no such key'])
  // Nothing valid left: relayed as asked, so the relay's refusal (and its `next`) names the keys.
  untouched({ id: 'c-1', fields: 'blocks.kind,blocks.label' })
  untouched({ id: 'c-1', fields: 'id,blocks.kind' })
  untouched({ id: 'c-1', fields: ['blocks.fields.shown'] })
})

test('7: `path` — what the pages view calls a row’s address — is `url` on a content, and said', () => {
  const n = relayed({ type: 'page', locale: 'en-GB', fields: 'title,slug,path' })
  assert.equal(n.params.fields, 'title,slug,url')
  assert.deepEqual(n.notes, ['fields path is url'])
  // Already asked for: not twice.
  assert.equal(relayed({ type: 'page', fields: 'path,url,title' }).params.fields, 'url,title')
})

test('8: a read that shows slots also asks for `revision`, so the apply after it needs no inspect', () => {
  const add = (fields) => relayed({ id: 'c-1', fields }).params.fields
  assert.equal(
    add('title,blocks.fields.value,blocks.fields.slotKey'),
    'title,blocks.fields.value,blocks.fields.slotKey,revision'
  )
  assert.deepEqual(add(['blocks']), ['blocks', 'revision'])
  assert.equal(add('fields'), 'fields,revision')
  assert.equal(add('blocks.items'), 'blocks.items,revision')
  const n = relayed({ id: 'c-1', fields: 'blocks.fields.value' })
  assert.ok(n.notes.some((x) => /^fields revision added: an apply after this read is based on it$/.test(x)))
  // Not where no slot is shown, and not twice.
  untouched({ id: 'c-1', fields: 'title,slug,url,bodyHtml,images' })
  untouched({ type: 'page', fields: 'title,blocks.role' })
  untouched({ id: 'c-1', fields: 'blocks.fields.value,revision' })
  // A listing that names slots gets it too: each content teaches the revision of its own slots.
  assert.equal(
    relayed({ type: 'page', fields: 'blocks.fields.slotKey' }).params.fields,
    'blocks.fields.slotKey,revision'
  )
})

test('🔒 the host’s list of `fields` paths is the relay’s own, both ways; the always-kept ones are kept', () => {
  assert.deepEqual([...FIELD_PATHS].sort(), [...PROJECTION_PATHS].sort())
  // What the relay keeps whatever `fields` says: a content's id and native, a block's id, a field's key.
  const field = { key: 'hero.title', type: 'text', value: 'A', slotKey: 'home.hero.title' }
  const envelope = {
    contents: [
      {
        id: 'c-1',
        native: [{ kind: 'post', id: 42 }],
        title: 'Home',
        blocks: [{ id: 'b-1', key: 'hero', fields: [field] }],
        fields: [field]
      }
    ]
  }
  const kept = projectEnvelope(envelope, ['title']).contents[0]
  assert.equal(kept.id, 'c-1')
  assert.deepEqual(kept.native, [{ kind: 'post', id: 42 }])
  const shown = projectEnvelope(envelope, ['title', 'blocks.fields.value', 'fields.value']).contents[0]
  assert.equal(shown.blocks[0].id, 'b-1')
  assert.equal(shown.blocks[0].fields[0].key, 'hero.title')
  assert.equal(shown.fields[0].key, 'hero.title')
  // And each of them is refused when NAMED — the reason the host takes them off.
  for (const path of ALWAYS_KEPT.filter((p) => !['id', 'native'].includes(p)))
    assert.match(projectionOf(path).problem, /^fields has no key/, path)
})

test('🔒 FIELDS_NEXT names only keys the relay takes, its example is accepted, and it fits T10', () => {
  assert.ok(FIELDS_NEXT.length <= 200, `${FIELDS_NEXT.length}`)
  const listed = /^fields takes: (.+) \(ids always come\)\./.exec(FIELDS_NEXT)?.[1].split(', ') ?? []
  assert.ok(listed.length >= 8, listed.join('|'))
  for (const path of listed) assert.ok(PROJECTION_PATHS.includes(path), `${path} is not a key`)
  const example = /E\.g\. fields:"([^"]+)"/.exec(FIELDS_NEXT)?.[1]
  assert.ok(example, 'an example call')
  assert.ok(Array.isArray(projectionOf(example).paths), 'the relay takes the example')
  // The refusal the relay really words for a wrong key gets it — and only that one.
  const wrong = projectionOf('blocks.kind').problem
  assert.equal(refusalNext({ ok: false, error: { code: 'CONTENT_BAD_QUERY', message: wrong } }), FIELDS_NEXT)
})

test('8b: every `fields` call the normaliser sends is one the relay accepts', () => {
  const asks = [
    'title,blocks.role,blocks.kind,blocks.id,blocks.fields.key,blocks.fields.slotKey,blocks.fields.value',
    'title,native,blocks.role,blocks.title,blocks.native,blocks.fields.maxCharacters',
    'title,slug,path',
    'blocks',
    'title,,slug,slug'
  ]
  for (const asked of asks) {
    const shaped = normalizeFields(asked)
    if (shaped === null) continue
    assert.ok(Array.isArray(projectionOf(shaped.fields).paths), `${asked} → ${shaped.fields}`)
  }
})
