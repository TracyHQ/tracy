import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildBrief, validateBrief, renderBriefMarkdown } from '../domain/brief.mjs'

const AT = '2026-10-25T10:00:00.000Z'
const PDF = { url: 'https://quan.test/menu.pdf', sha256: null, kind: 'pdf', page: 1 }
const dish = (name, extra = {}) => ({
  name,
  price: '55',
  currency: 'VND',
  priceScale: 1000,
  section: 'MÓN NƯỚC',
  source: PDF,
  collectedAt: AT,
  verified: true,
  ...extra
})
const pic = (id, extra = {}) => ({
  id,
  kind: 'image',
  category: 'food',
  sha256: Buffer.from(id).toString('hex').padEnd(64, '0'),
  source: 'website',
  width: 1200,
  height: 900,
  caption: null,
  alt: null,
  ...extra
})
const food = { vision: { key: 'k', labels: { subject: 'food' } } }
const input = (menuItems, media, posts = []) => ({
  opportunity: { id: 'opp-1', name: 'Quán Huế', candidate: { kind: 'restaurants' } },
  profile: { name: 'Quán Huế', menus: [{ url: PDF.url, source: 'website' }], menuItems },
  sources: [],
  media,
  posts,
  brand: null,
  madeAt: AT
})
const menuOf = (b) => b.sitemap.find((p) => p.slug === 'menu').sections.find((s) => s.kind === 'menu')

test('a dish photo vision confirmed reaches the brief as an accepted photo with its evidence', () => {
  const b = buildBrief(
    input([dish('Bún bò Huế'), dish('Cơm hến')], [pic('m1', { alt: 'Bún bò Huế đặc biệt', labels: food })])
  )
  assert.deepEqual(validateBrief(b), { ok: true, errors: [] })
  const [bun, com] = menuOf(b).menuItems
  assert.deepEqual(bun.photo, {
    assetId: 'm1',
    status: 'accepted',
    how: 'caption',
    evidence: { quote: 'Bún bò Huế đặc biệt' },
    matcher: 'dish-photos/1'
  })
  assert.equal(com.photo, undefined)
  assert.match(renderBriefMarkdown(b), /"Bún bò Huế": "55".* · photo of this dish: m1/)
})

test('a candidate travels in the brief but the Markdown never offers it as the dish photo', () => {
  const b = buildBrief(input([dish('Bún bò Huế')], [pic('m1', { alt: 'Bún bò Huế' })]))
  assert.equal(validateBrief(b).ok, true)
  assert.equal(menuOf(b).menuItems[0].photo.status, 'candidate')
  assert.doesNotMatch(renderBriefMarkdown(b), /photo of this dish/)
})

test('a post of the place names the dish of its only photo', () => {
  const posts = [{ source: 'facebook', id: 'p1', url: 'https://fb.test/p1', caption: 'Cơm hến nóng hổi đây' }]
  const b = buildBrief(
    input(
      [dish('Bún bò Huế'), dish('Cơm hến')],
      [pic('m1', { source: 'facebook', postId: 'p1', caption: posts[0].caption, labels: food })],
      posts
    )
  )
  assert.deepEqual(menuOf(b).menuItems[1].photo, {
    assetId: 'm1',
    status: 'accepted',
    how: 'post-text',
    evidence: { quote: 'Cơm hến nóng hổi đây', sourceUrl: 'https://fb.test/p1', postId: 'p1' },
    matcher: 'dish-photos/1'
  })
})

test('a photo research linked to the dish (profile.menuItems[].photo) keeps the link, as an asset id', () => {
  const linked = dish('Bún bò Huế', {
    photo: {
      mediaId: 'm2',
      status: 'accepted',
      how: 'menu-card',
      evidence: { sourceUrl: 'https://quan.test/menu' }
    }
  })
  const b = buildBrief(input([linked], [pic('m2')]))
  assert.equal(validateBrief(b).ok, true)
  assert.deepEqual(menuOf(b).menuItems[0].photo, {
    assetId: 'm2',
    status: 'accepted',
    how: 'menu-card',
    evidence: { sourceUrl: 'https://quan.test/menu' },
    matcher: 'dish-photos/1'
  })
  // A link to a picture the brief does not hold is dropped, not carried as a dangling id.
  const gone = buildBrief(input([linked], [pic('m9')]))
  assert.equal(menuOf(gone).menuItems[0].photo, undefined)
})

test('the validator refuses a dish photo outside assets or of an unknown status', () => {
  const b = buildBrief(input([dish('Bún bò Huế')], [pic('m1', { alt: 'Bún bò Huế', labels: food })]))
  menuOf(b).menuItems[0].photo.assetId = 'nowhere'
  assert.equal(validateBrief(b).ok, false)
  assert.match(JSON.stringify(validateBrief(b).errors), /photo/)
  const c = buildBrief(input([dish('Bún bò Huế')], [pic('m1', { alt: 'Bún bò Huế', labels: food })]))
  menuOf(c).menuItems[0].photo.status = 'verified'
  assert.equal(validateBrief(c).ok, false)
})

test('brief-schema.json describes the dish photo', () => {
  const schema = JSON.parse(readFileSync(new URL('../domain/brief-schema.json', import.meta.url), 'utf8'))
  const photo = schema.$defs.menuItem.properties.photo
  assert.deepEqual(photo.required, ['assetId', 'status', 'how', 'matcher'])
  assert.deepEqual(photo.properties.status.enum, ['candidate', 'accepted'])
  assert.deepEqual(photo.properties.how.enum, ['menu-card', 'post-text', 'caption', 'sender'])
})

test('photos posted together under one text reach the brief as a candidate naming its siblings', () => {
  const caption = 'Bún bò Huế hôm nay, kèm chả cua và rau sống'
  const b = buildBrief(
    input(
      [dish('Bún bò Huế')],
      [pic('m1', { caption, labels: food }), pic('m2', { caption, labels: food, width: 2000 })]
    )
  )
  assert.deepEqual(validateBrief(b), { ok: true, errors: [] })
  const [bun] = menuOf(b).menuItems
  assert.equal(bun.photo.status, 'candidate')
  assert.deepEqual(bun.photo.evidence.siblings, ['m1', 'm2'])
  assert.doesNotMatch(renderBriefMarkdown(b), /photo of this dish/)
})
