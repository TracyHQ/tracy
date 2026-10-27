// Provenance stamps for Tracy's comment picker (`src/lib/stamps.ts`): the mark format the resolver
// in TCH (`apps/tracy-web/src/sites/content-locate.js` `markOwner`) reads, and the promise that an
// ordinary request gets no stamp at all.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BLOCK_SRC,
  isPicking,
  islandMarks,
  keepPickPrivate,
  ownerMark,
  stampBlocks,
  stampFor,
  stampsFor
} from '../src/lib/stamps.ts'

const picked = new Request('http://site.test/about', { headers: { 'x-tracy-preview': 'pick' } })
const plain = new Request('http://site.test/about')
// A live entry as EmDash 0.37 hands it to a view: its own `id` is the slug, the ULID is `data.id`.
const about = { id: 'about', slug: 'about', data: { id: '01M3ATZE72Z9ZEKSWWP3F664D6', title: 'About' } }

test('only the header Tracy’s site proxy sets asks for stamps', () => {
  assert.equal(isPicking(picked), true)
  assert.equal(isPicking(plain), false)
  assert.equal(isPicking(new Request('http://site.test/', { headers: { 'x-tracy-preview': '1' } })), false)
})

test('an owner mark names collection, entry id and slug', () => {
  assert.equal(ownerMark('about', about), 'emdash:about:01M3ATZE72Z9ZEKSWWP3F664D6:about')
  // A getEmDashEntry result may carry no `slug`: its `id` is the slug.
  assert.equal(ownerMark('services', { id: 'design', data: { id: '01ABC' } }), 'emdash:services:01ABC:design')
  // The chrome passes an entry's `data` alone: `id` is the ULID, `slug` the slug.
  assert.equal(ownerMark('site', { id: '01SITE', slug: 'site', title: 'x' }), 'emdash:site:01SITE:site')
  // loadPosts() rows: { id: ULID, slug, data }.
  assert.equal(
    ownerMark('posts', { id: '01P', slug: 'tender', data: { id: '01P' } }),
    'emdash:posts:01P:tender'
  )
})

test('nothing to name, no mark — never a half-filled one', () => {
  assert.equal(ownerMark('about', null), null)
  assert.equal(ownerMark('about', { data: { title: 'no id' } }), null)
  assert.equal(ownerMark('Bad Collection', about), null)
  assert.equal(
    ownerMark('about', { slug: 'a b', data: { id: '01X' } }),
    null,
    'a slug with a space would split the mark'
  )
})

test('stamps: a field, a repeater row, a subfield and the whole entry', () => {
  const s = stampFor(picked, 'about', about)
  const owner = 'emdash:about:01M3ATZE72Z9ZEKSWWP3F664D6:about'
  assert.equal(s.owner, owner)
  assert.deepEqual(s('title'), { 'data-tracy-src': `${owner} field:title` })
  assert.deepEqual(s('history.year'), { 'data-tracy-src': `${owner} field:history.year` })
  assert.deepEqual(s.block('history'), { 'data-tracy-src': `${owner} block:history` })
  assert.deepEqual(s(), { 'data-tracy-src': owner })
  assert.deepEqual(
    s('bad key"'),
    { 'data-tracy-src': owner },
    'a key that cannot be a field names the entry only'
  )
  assert.deepEqual(stampsFor(picked)('about', about)('lede'), { 'data-tracy-src': `${owner} field:lede` })
})

test('an ordinary request: every helper returns an empty object, so Astro spreads nothing', () => {
  const s = stampFor(plain, 'about', about)
  assert.equal(s.owner, null)
  assert.deepEqual(s('title'), {})
  assert.deepEqual(s.block('history'), {})
  assert.deepEqual(s(), {})
  assert.deepEqual(stampFor(picked, 'about', null)('title'), {}, 'no entry, no stamp')
})

test('island marks: only the stamps that exist, and no key at all on an ordinary request', () => {
  const owner = 'emdash:about:01M3ATZE72Z9ZEKSWWP3F664D6:about'
  const s = stampFor(picked, 'about', about)
  assert.deepEqual(islandMarks({ title: s('title'), meta: {} }), {
    marks: { title: { 'data-tracy-src': `${owner} field:title` } }
  })
  // Astro serializes every island prop into the page: an empty `marks` would change its HTML.
  const p = stampFor(plain, 'about', about)
  assert.deepEqual(islandMarks({ title: p('title'), item: p() }), {})
  assert.equal(Object.keys({ title: 'x', ...islandMarks({ title: p('title') }) }).join(), 'title')
})

test('Portable Text: each text block carries field:<field>.<_key>, the id the Content API gives it', () => {
  const owner = 'emdash:about:01M3ATZE72Z9ZEKSWWP3F664D6:about'
  const span = (text) => ({ _type: 'span', text })
  const body = [
    { _type: 'block', _key: 'k1', style: 'normal', children: [span('One')] },
    { _type: 'image', _key: 'k2', asset: {} },
    { _type: 'block', _key: 'k3', style: 'h2', children: [span('Two')] },
    { _type: 'block', _key: 'dup', children: [span('a')] },
    { _type: 'block', _key: 'dup', children: [span('b')] },
    { _type: 'block', _key: 'a.b', children: [span('c')] },
    { _type: 'block', children: [span('d')] }
  ]
  const out = stampBlocks(stampFor(picked, 'about', about), 'content', body)
  assert.equal(out[0][BLOCK_SRC], `${owner} field:content.k1`)
  assert.equal(out[2][BLOCK_SRC], `${owner} field:content.k3`)
  for (const i of [1, 3, 4, 5, 6])
    assert.equal(out[i][BLOCK_SRC], undefined, 'no key the Content API would give, no block stamp')
  assert.equal(body[0][BLOCK_SRC], undefined, 'the stored value is not mutated')
  assert.equal(out[0].children, body[0].children)
})

test('Portable Text on an ordinary request: the very same array, untouched', () => {
  const body = [{ _type: 'block', _key: 'k1', children: [] }]
  assert.equal(stampBlocks(stampFor(plain, 'about', about), 'content', body), body)
  assert.deepEqual(stampBlocks(stampFor(picked, 'about', about), 'content', undefined), [])
})

test('a stamped answer stays out of shared caches; an ordinary one and the admin are left alone', () => {
  const picked = new Headers({ 'cache-control': 'public, max-age=60', vary: 'Accept-Encoding' })
  keepPickPrivate(
    new Request('http://site.test/about', { headers: { 'x-tracy-preview': 'pick' } }),
    '/about',
    picked
  )
  assert.equal(picked.get('cache-control'), 'private, no-store')
  assert.equal(picked.get('vary'), 'Accept-Encoding, x-tracy-preview')

  const ordinary = new Headers({ 'cache-control': 'public, max-age=60' })
  keepPickPrivate(plain, '/about', ordinary)
  assert.equal(ordinary.get('cache-control'), 'public, max-age=60')
  assert.equal(ordinary.get('vary'), null)

  const admin = new Headers()
  keepPickPrivate(
    new Request('http://site.test/_emdash/admin', { headers: { 'x-tracy-preview': 'pick' } }),
    '/_emdash/admin',
    admin
  )
  assert.equal(admin.get('cache-control'), null)
})
