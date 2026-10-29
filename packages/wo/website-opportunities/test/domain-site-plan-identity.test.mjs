// Ticket #193 of spec #189: the identity half of the site plan (logo, posts, social profiles, map), by role, on two made-up
// businesses of different trades: a bakery that gave everything and a dental clinic that gave almost nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSite } from '../domain/site-plan.mjs'

const served = { set: { contentHash: 'c'.repeat(64) }, questions: [{ id: 'name', kind: 'text' }] }

const contentMap = {
  entities: [
    { key: 'article-5', kind: 'article' },
    { key: 'article-6', kind: 'article' },
    { key: 'article-9', kind: 'article' }
  ],
  slots: [
    { key: 'article-5.0', entity: 'article-5', type: 'text', role: 'article.title', sample: 'Demo post one' },
    { key: 'article-6.0', entity: 'article-6', type: 'text', role: 'article.lead', sample: 'Demo lead' },
    { key: 'article-9.0', entity: 'article-9', type: 'text', role: 'offering.name', sample: 'A class' },
    {
      key: 'siteSetting-1.0',
      entity: 'siteSetting-1',
      type: 'image',
      role: 'business.logo',
      sample: 'images/demo/logo/a.png'
    },
    {
      key: 'module-2.1',
      entity: 'module-2',
      type: 'image',
      role: 'business.logo',
      sample: 'images/demo/logo/b.png'
    }
  ]
}

const bakery = () => ({
  madeAt: '2026-10-20T08:00:00.000Z',
  business: {
    name: 'Copperleaf Bakery',
    address: '14 Mill Lane, Ashby Vale',
    socials: {
      instagram: 'https://instagram.com/copperleaf.example',
      facebook: 'https://facebook.com/copperleaf.example'
    }
  },
  brand: { logo: 'asset-logo-1' },
  content: { items: [{ id: 'n1', kinds: ['news'], title: 'New rye loaf' }] },
  sitemap: []
})

const clinic = () => ({
  madeAt: '2026-10-20T08:00:00.000Z',
  business: { name: 'Northgate Dental' },
  content: { items: [] },
  sitemap: []
})

test('a brief with a logo, posts, socials and an address keeps them and replaces the demo', () => {
  const plan = planSite(bakery(), served, { contentMap })
  assert.equal(plan.logo.decision, 'brief-logo')
  assert.deepEqual(plan.logo.demoFiles.sort(), ['images/demo/logo/a.png', 'images/demo/logo/b.png'])
  assert.equal(plan.posts.decision, 'replace')
  assert.deepEqual(
    plan.posts.demoArticles.map((a) => a.id),
    [5, 6],
    'only articles with post roles are demo posts'
  )
  assert.deepEqual(Object.keys(plan.socials.keep).sort(), ['facebook', 'instagram'])
  assert.equal(plan.map.decision, 'address')
  assert.match(plan.map.embed, /Mill%20Lane/)
})

test('a brief with only a name shows the name as text, hides demo posts, socials and the map', () => {
  const plan = planSite(clinic(), served, { contentMap })
  assert.equal(plan.logo.decision, 'name-as-text')
  assert.equal(plan.logo.name, 'Northgate Dental')
  assert.equal(plan.posts.decision, 'hide')
  assert.equal(plan.posts.reason, 'no-posts')
  assert.equal(plan.socials.decision, 'hide')
  assert.deepEqual(plan.socials.keep, {})
  assert.equal(plan.map.decision, 'hide')
})

test('a brief with neither logo nor name leaves the template logo alone', () => {
  const plan = planSite(
    { madeAt: '2026-10-20T08:00:00.000Z', business: {}, content: { items: [] }, sitemap: [] },
    served
  )
  assert.equal(plan.logo.decision, 'keep')
})

test('the map embeds the brief Google place first (by id, or by the cid of its maps link), then the address', () => {
  const byId = planSite({ ...bakery(), googlePlace: { placeId: 'ChIJexample123' } }, served, { contentMap })
  assert.equal(byId.map.decision, 'place')
  assert.match(byId.map.embed, /place_id%3AChIJexample123/)
  const byCid = planSite(
    { ...bakery(), googlePlace: { googleMapsUri: 'https://maps.google.com/?cid=12345678901234567' } },
    served,
    { contentMap }
  )
  assert.match(byCid.map.embed, /cid=12345678901234567/)
  assert.equal(planSite(bakery(), served, { contentMap }).map.decision, 'address')
})

test('socials: a WhatsApp contact channel of the brief rides with the social plan; none without one', () => {
  const withWa = planSite(
    { ...bakery(), contact: { whatsapp: { href: 'https://wa.me/15550100222', number: '+1 555 0100 222' } } },
    served,
    { contentMap }
  )
  assert.equal(withWa.socials.whatsapp, 'https://wa.me/15550100222')
  assert.equal(planSite(clinic(), served, { contentMap }).socials.whatsapp, null)
})
