// The write step's site check sends the host the off-site links the brief gives a button (site-check/host-pages.js
// `briefLinks`): the brief's WhatsApp and the business's own social profiles. Before, the check sent none, so the
// brief's own WhatsApp button failed `cta-real` on every build that placed one (dev, 16/11/2026, JA Diner: "ORDER ON
// WHATSAPP" on the home page, WHATSAPP, FACEBOOK and INSTAGRAM on the contact page) while a finished build's demo QA
// (opportunities-build/demo-qa.js) let the same WhatsApp button pass.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCtaReal } from '../../tracy-host/src/demo-qa.js'
import { siteSocialLinksOf } from '../src/opportunities-build/brand-on-site.js'
import { briefLinks, pagesRead } from '../src/site-check/host-pages.js'

const brief = {
  contact: { whatsapp: { number: '+971549946302', href: 'https://wa.me/971549946302' } },
  business: {
    socials: {
      facebook: 'https://www.facebook.com/ArabianTeaHouse',
      instagram: 'https://www.instagram.com/arabianteahouse/',
      tiktok: 'javascript:alert(1)'
    }
  }
}

test('the brief gives its WhatsApp and its social profiles, nothing that is not an address; no brief gives none', () => {
  assert.deepEqual(briefLinks(brief), {
    whatsappLinks: ['https://wa.me/971549946302'],
    socialLinks: ['https://www.facebook.com/ArabianTeaHouse', 'https://www.instagram.com/arabianteahouse/']
  })
  assert.deepEqual(briefLinks(null), {})
  assert.deepEqual(siteSocialLinksOf({ business: {} }), [])
})

test("the site check's page read sends the brief's links with every call to the host", async () => {
  const sent = []
  const context = {
    report: {
      keptPages: [
        { path: '/', id: 'page-home' },
        { path: '/contact-us', id: 'page-contact-us' }
      ],
      slots: []
    },
    pages: null,
    brief,
    read: async () => ({ pages: [] }),
    host: async (payload) => {
      sent.push(payload)
      return { checks: [], pageMeasures: [] }
    }
  }
  await pagesRead(context)
  assert.ok(sent.length >= 1)
  for (const payload of sent) {
    assert.deepEqual(payload.whatsappLinks, ['https://wa.me/971549946302'])
    assert.deepEqual(payload.socialLinks, [
      'https://www.facebook.com/ArabianTeaHouse',
      'https://www.instagram.com/arabianteahouse/'
    ])
  }
})

test("with them, the contact page's network buttons and the WhatsApp button pass cta-real; another profile does not", () => {
  const read = (ctas) => [
    {
      path: '/index.php/contact',
      url: 'http://arabian-tea.tracy.test/index.php/contact',
      status: 200,
      ctas
    }
  ]
  const own = [
    { href: 'https://www.facebook.com/ArabianTeaHouse', text: 'FACEBOOK', button: true },
    { href: 'https://instagram.com/arabianteahouse', text: 'INSTAGRAM', button: true },
    { href: 'https://wa.me/971549946302', text: 'WHATSAPP', button: true }
  ]
  assert.equal(checkCtaReal(read(own)).pass, false, 'what the check said before')
  assert.equal(checkCtaReal(read(own), briefLinks(brief)).pass, true)
  for (const href of [
    'https://www.facebook.com/joomlart',
    'https://www.facebook.com/sharer.php?u=https://arabianteahouse.com',
    'https://www.facebook.com/',
    'https://arabianteahouse.com/our-menu/'
  ])
    assert.equal(
      checkCtaReal(read([{ href, text: 'GO', button: true }]), briefLinks(brief)).pass,
      false,
      href
    )
})
