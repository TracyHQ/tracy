// The EmDash Business reader's own output, built from the template's real site model and content
// map, must pass the shared validator: images with usages that resolve, and repeater items.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { validateContent, validateContentGraph } from '../validate.mjs'
import { envelope } from '../../tracy-emdash-theme-business/tools/content-api/reader.mjs'

const read = (file) =>
  JSON.parse(readFileSync(new URL(`../../tracy-emdash-theme-business/${file}`, import.meta.url), 'utf8'))
const model = read('seed/site-model.json')
const config = read('template.config.json')
const options = {
  mapping: read('seed/content-api-map.json'),
  types: model.types,
  locales: config.locales,
  defaultLocale: config.defaultLocale,
  identifiedFields: model.types.flatMap((t) =>
    t.fields.filter((f) => f.type === 'group').map((f) => `${t.name}.${f.name}`)
  )
}
let n = 0
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
// The stored shape of a local EmDash image, as a Business site holds it.
const media = (name, extra = {}) => ({
  id: `01M3${name.toUpperCase()}`,
  provider: 'local',
  filename: `${name}.png`,
  mimeType: 'image/png',
  width: 520,
  height: 200,
  meta: { storageKey: `${name}.stored.png`, caption: null },
  ...extra
})
const entry = (collection, slug, data) => ({
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
const rows = [
  entry('home', 'home', {
    title: 'Home',
    hero_title_a: 'Built to last',
    hero_image: media('hero', { alt: 'Drop a site photo here' }),
    about_image: media('about', { width: undefined, height: undefined }),
    stats: [
      { _rowId: uuid(), value: '25', label: 'years' },
      { _rowId: uuid(), value: '400', label: 'projects' }
    ],
    client_logos: [
      { _rowId: uuid(), name: 'Logo 1', logo: media('logo-1', { alt: 'Logo' }) },
      { _rowId: uuid(), name: 'Logo 2', logo: media('logo-2') }
    ]
  }),
  entry('site', 'site', {
    title: 'Site chrome (EN)',
    social: [{ _rowId: uuid(), name: 'Telegram', handle: '@x', url: 'https://t.me/x', text: 'News' }]
  })
]
const key = 'fixture-only-not-a-production-secret'
const identity = { user: 'u', role: 50, scopes: ['content:read'] }
const run = (q) => envelope(rows, q, options, identity, key, 'https://site.example.test', 'seed')

test('EmDash Business: home detail with images and repeater items conforms to tracy-content/v1', () => {
  const list = run({ limit: 30 })
  assert.deepEqual(validateContent(list), [])
  const home = list.contents.find((c) => c.slug === 'home')
  const detail = run({ id: home.id, limit: 30 })
  assert.deepEqual(validateContent(detail), [])
  const c = detail.contents[0]
  assert.deepEqual(validateContentGraph([c, ...list.contents.filter((x) => x.id !== c.id)]), [])
  const logos = c.blocks.find((b) => b.key === 'client_logos')
  assert.equal(logos.items.length, 2)
  const withBlock = c.images.filter((m) => m.usages.some((u) => u.blockId === logos.id))
  assert.equal(withBlock.length, 2)
  const field = c.fields.find((f) => f.key === 'hero_image')
  assert.equal(field.type, 'image')
  const hero = c.images.find((m) => m.src === field.value)
  assert.equal(hero.alt, 'Drop a site photo here')
  assert.deepEqual(hero.usages, [{ contentId: c.id, blockId: null, itemId: null }])
  assert.equal(c.images.find((m) => m.src.endsWith('/about.stored.png')).width, null)
  assert.ok(
    !detail.completeness.unresolved.some((u) => /media/i.test(u.message) && /unsupported/.test(u.message))
  )
})

test('EmDash Business: an item page keeps image usages resolvable', () => {
  const list = run({ limit: 30 }).contents
  const home = list.find((c) => c.slug === 'home')
  const page = run({ id: home.id, limit: 1 })
  assert.deepEqual(validateContent(page), [])
  assert.equal(page.contents[0].detailState, 'partial')
  assert.deepEqual(validateContentGraph([page.contents[0], ...list.filter((c) => c.id !== home.id)]), [])
})

test('EmDash Business: a budgeted page and a cut detail still conform to tracy-content/v1', () => {
  const long = structuredClone(rows)
  long[0].item.data.hero_title_a = 'Built to last. '.repeat(3000)
  const budgeted = (q) => envelope(long, q, options, identity, key, 'https://site.example.test', 'seed')
  const list = budgeted({ limit: 30, maxBytes: 8192 })
  assert.deepEqual(validateContent(list), [])
  assert.equal(list.pagination.budget, 8192)
  const home = list.contents.find((c) => c.slug === 'home')
  const detail = budgeted({ id: home.id, limit: 30, maxBytes: 8192 })
  assert.deepEqual(validateContent(detail), [])
  assert.ok(Buffer.byteLength(JSON.stringify(detail)) <= 8192)
  assert.equal(detail.contents[0].truncated, true)
  assert.equal(detail.contents[0].fields.find((f) => f.key === 'hero_title_a').truncated, true)
})

test('EmDash Business: long text — a post body per Portable Text block, textareas whole — conforms', () => {
  const seed = read('seed/seed.json')
  const post = seed.content.posts.find((p) => p.locale === 'en' && p.data.content?.length)
  const withProse = [
    ...rows,
    entry('posts', post.slug, { ...post.data, featured_image: null }),
    entry('about', 'about', {
      title: 'About',
      lede: 'A company\nthat builds.',
      history: [{ _rowId: uuid(), year: '1999', text: 'Founded in Kaluga.' }]
    })
  ]
  const r = (q) => envelope(withProse, q, options, identity, key, 'https://site.example.test', 'seed')
  const list = r({ limit: 30 }).contents
  const detailOf = (slug) => r({ id: list.find((c) => c.slug === slug).id, limit: 30 })
  const article = detailOf(post.slug)
  assert.deepEqual(validateContent(article), [])
  const text = post.data.content.filter((b) => b._type === 'block')
  const body = article.contents[0].fields.filter((f) => f.key.startsWith('content.'))
  assert.equal(body.length, text.length)
  assert.deepEqual(
    body.map((f) => f.key),
    text.map((b) => `content.${b._key}`)
  )
  assert.equal(body[0].value, text[0].children.map((c) => c.text).join(''))
  const about = detailOf('about')
  assert.deepEqual(validateContent(about), [])
  assert.equal(about.contents[0].fields.find((f) => f.key === 'lede').value, 'A company\nthat builds.')
  const history = about.contents[0].blocks.find((b) => b.key === 'history')
  assert.equal(history.items[0].fields.find((f) => f.key === 'text').value, 'Founded in Kaluga.')
})
