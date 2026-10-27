/**
 * What an opportunity's WordPress build takes off that a customer's build keeps: the demo kit's own dropdowns, a reservation
 * dropdown that leads nowhere, the template's sample pages its contract does not list, and the demo's logo picture.
 * Measured 22/10/2026 on a Website Opportunities build of ja-restaurant wp7 1.0.1.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseBlocks } from '../src/sites/brief-engines/wp-blocks.js'
import { demoKitOff, navWithout } from '../src/sites/brief-engines/wp-residue.js'
import { sampleAt } from '../src/sites/brief-engines/wo-copy-pins.js'
import { logosFallBackToName, woNameAsLogo } from '../src/sites/brief-engines/wp-wo-logo.js'

const link = (label, id, path) =>
  `<!-- wp:navigation-link {"label":"${label}","type":"page","id":${id},"url":"https://quickstart.invalid/${path}","kind":"post-type"} /-->`
const menu = (label, ...items) =>
  [`<!-- wp:navigation-submenu {"label":"${label}"} -->`, ...items, '<!-- /wp:navigation-submenu -->'].join(
    '\n'
  )

// The main menu of the ja-restaurant wp7 1.0.1 release (wp_navigation 133), cut to the items that matter here.
const RESTAURANT_NAV = [
  link('Home', 97, ''),
  '<!-- wp:navigation-submenu {"label":"About us","type":"page","id":99,"url":"https://quickstart.invalid/about-us/","kind":"post-type"} -->',
  link('Our History', 106, 'about-us/our-history/'),
  '<!-- /wp:navigation-submenu -->',
  link('Gallery', 105, 'gallery/'),
  menu(
    'Explore',
    menu(
      'J! Pages',
      link('Smart Search', 129, '?page_id=129'),
      link('Typography', 118, 'explore/j-pages/category-blog/')
    ),
    menu(
      'Bonus Pages',
      link('Error Page', 120, 'explore/bonus-pages/erro-page/'),
      link('About Us', 99, 'about-us/')
    ),
    menu('Themes', link('Default Color', 97, ''), link('Blue Color', 124, 'explore/themes/blue-color/'))
  ),
  menu(
    'Reservation',
    link('Phone Reservation', 107, 'contact/phone-reservation/'),
    link('Contact Us', 108, 'contact/contact-us/')
  )
].join('\n')

const labels = (markup) => [...markup.matchAll(/"label":"([^"]+)"/g)].map((m) => m[1])

test("an opportunity's menu loses the demo kit's dropdowns once their own pages are gone, and keeps the restaurant's", () => {
  const swept = navWithout(RESTAURANT_NAV, { slugs: new Set(), ids: new Set([118, 120, 124, 129]) })
  const out = demoKitOff(swept.markup)
  assert.deepEqual(out.cut, ['Explore'])
  assert.deepEqual(labels(out.markup), [
    'Home',
    'About us',
    'Our History',
    'Gallery',
    'Reservation',
    'Phone Reservation',
    'Contact Us'
  ])
  assert.ok(parseBlocks(out.markup))
})

test('a dropdown that still holds a page the menu links nowhere else stays; one whose page is not published goes', () => {
  const swept = navWithout(RESTAURANT_NAV, { slugs: new Set(), ids: new Set([118, 120, 124]) })
  assert.ok(labels(demoKitOff(swept.markup).markup).includes('Smart Search'), 'Smart Search is only here')
  const out = demoKitOff(swept.markup, new Set([129]))
  assert.deepEqual(
    out.cut,
    ['Explore'],
    'a link to a draft prints nothing, so the dropdown would open on nothing'
  )
})

test('a reservation dropdown that is only a label leads to the contact page it holds', () => {
  const out = demoKitOff(RESTAURANT_NAV)
  assert.deepEqual(out.led, ['Reservation'])
  const root = parseBlocks(out.markup)
  const reservation = root.children.find((b) => b.attrs?.label === 'Reservation')
  assert.equal(reservation.attrs.url, 'https://quickstart.invalid/contact/contact-us/')
  assert.equal(reservation.attrs.id, 108)
  assert.equal(reservation.attrs.kind, 'post-type')
  assert.equal(reservation.children.length, 2, 'its links stay under it')
})

test('a label-only dropdown that does not ask to get in touch keeps opening on its links, Contact among them', () => {
  const company = menu('Company', link('Team', 40, 'company/team/'), link('Contact', 41, 'company/contact/'))
  const out = demoKitOff(company)
  assert.deepEqual(out, { markup: company, cut: [], led: [] })
})

test('the sample pages of a template are judged by their whole path, so a sample under a kit branch is one', async () => {
  const sample = await sampleAt()
  assert.equal(sample('explore/j-pages/category-blog'), true)
  assert.equal(sample('explore/j-pages/smart-search'), true)
  assert.equal(sample('explore/themes/blue-color'), true)
  for (const at of [
    'blog',
    'about-us/our-history',
    'menu/2-column-menu',
    'contact/contact-us',
    'gallery',
    ''
  ])
    assert.equal(sample(at), false, at)
})

const HEADER = [
  '<!-- wp:site-logo {"width":180,"className":"jr-logo jr-logo--light"} /-->',
  '<!-- wp:site-logo {"width":180,"className":"jr-logo jr-logo--dark"} /-->'
].join('\n')

test('the name stands in for the logo only where every logo spot of the header and footer prints it', () => {
  assert.equal(
    logosFallBackToName([HEADER, '<!-- wp:paragraph -->\n<p>Footer</p>\n<!-- /wp:paragraph -->']),
    true
  )
  assert.equal(logosFallBackToName([HEADER, '<!-- wp:site-logo {"className":"footer-logo"} /-->']), false)
  assert.equal(
    logosFallBackToName([HEADER.replace('jr-logo--light', 'jr-logo--light tracy-logo-bare')]),
    false
  )
  assert.equal(logosFallBackToName(['<!-- wp:paragraph -->\n<p>No logo</p>\n<!-- /wp:paragraph -->']), false)
})

/** A site's door for the logo step: its parts and options, and every write it took. */
const logoSite = ({ header = HEADER, logo = 137 } = {}) => {
  const options = { site_logo: logo }
  const writes = []
  const call = async (action, params) => {
    if (action === 'content.get' && params.kind === 'templatePart')
      return params.key === 'header'
        ? { ok: true, item: { content: header } }
        : { ok: false, error: 'not_found' }
    if (action === 'content.get' && params.kind === 'option')
      return { ok: true, item: { value: options[params.key] } }
    if (action === 'content.update') {
      writes.push(params)
      // WordPress stores an option as a string; the apply log keeps the value as it was sent.
      log.push({ key: params.key, before: options[params.key], after: params.fields.value })
      options[params.key] = String(params.fields.value)
      return { ok: true }
    }
    return { ok: false, error: 'unknown' }
  }
  /** The plugin's `apply.revert`: CONFLICT unless the option still holds, strictly, what the write logged. */
  const revert = () => {
    const entry = log.pop()
    if (options[entry.key] !== entry.after) return { ok: false, code: 'CONFLICT' }
    options[entry.key] = entry.before
    return { ok: true }
  }
  const log = []
  return { call, options, writes, revert }
}

test("an opportunity's build with no logo shows the name as text: site_logo is emptied under the step's apply id", async () => {
  const site = logoSite()
  const notes = []
  assert.equal(
    await woNameAsLogo({ call: site.call, applyId: 'wo-logo-t', note: (n) => notes.push(n) }),
    true
  )
  assert.equal(site.options.site_logo, '0')
  assert.deepEqual(site.writes, [
    { apply_id: 'wo-logo-t', kind: 'option', id: 0, key: 'site_logo', fields: { value: '0' } }
  ])
  assert.deepEqual(notes, [])
  // Sent as the string WordPress stores, the step reverts: the template's logo comes back.
  assert.deepEqual(site.revert(), { ok: true })
  assert.equal(site.options.site_logo, 137)
})

test('a design with a logo spot that would show nothing keeps the picture, and says so; an empty logo is not written', async () => {
  const bare = logoSite({ header: '<!-- wp:site-logo {"className":"logo"} /-->' })
  const notes = []
  assert.equal(await woNameAsLogo({ call: bare.call, applyId: 'a', note: (n) => notes.push(n) }), false)
  assert.equal(bare.options.site_logo, 137)
  assert.equal(notes.length, 1)
  const empty = logoSite({ logo: 0 })
  assert.equal(await woNameAsLogo({ call: empty.call, applyId: 'a', note: () => {} }), false)
  assert.deepEqual(empty.writes, [])
})

test('a reservation dropdown with a placeholder address takes the contact page address instead of keeping "#"', () => {
  for (const placeholder of ['"url":"#",', '"url":"",', '"url":"#top",']) {
    const markup = [
      `<!-- wp:navigation-submenu {"label":"Reservation",${placeholder}"kind":"custom"} -->`,
      link('Contact Us', 108, 'contact/contact-us/'),
      '<!-- /wp:navigation-submenu -->'
    ].join('\n')
    const out = demoKitOff(markup)
    assert.deepEqual(out.led, ['Reservation'], placeholder)
    const reservation = parseBlocks(out.markup).children[0]
    assert.equal(reservation.attrs.url, 'https://quickstart.invalid/contact/contact-us/', placeholder)
    assert.equal(reservation.attrs.id, 108)
    assert.equal(reservation.attrs.kind, 'post-type')
    assert.equal(reservation.children.length, 1)
  }
})

test('a link by page id and a link by address lead to one place, and an address on another site is not this one', () => {
  const nav = (inner) =>
    [
      '<!-- wp:navigation-link {"label":"Home","type":"page","id":1,"kind":"post-type"} /-->',
      menu('Themes', inner)
    ].join('\n')
  const site = { pathOf: new Map([[1, '/']]), host: 'https://site.test' }
  for (const inner of [
    '<!-- wp:navigation-link {"label":"Default Color","url":"/","kind":"custom"} /-->',
    '<!-- wp:navigation-link {"label":"Default Color","url":"https://site.test","kind":"custom"} /-->'
  ])
    assert.deepEqual(demoKitOff(nav(inner), new Set(), site).cut, ['Themes'], inner)
  for (const inner of [
    '<!-- wp:navigation-link {"label":"Facebook","url":"https://facebook.com/","kind":"custom"} /-->',
    '<!-- wp:navigation-link {"label":"Page 7","url":"/?page_id=7","kind":"custom"} /-->'
  ])
    assert.deepEqual(demoKitOff(nav(inner), new Set(), site).cut, [], inner)
})

test('a header or footer that could not be read leaves the logo alone; only a part the site does not have is left out', async () => {
  const failing = (footer) => {
    const site = logoSite()
    const call = async (action, params) =>
      action === 'content.get' && params.key === 'footer' ? footer() : site.call(action, params)
    return { site, call }
  }
  for (const footer of [
    async () => ({ ok: false, error: 'timeout', message: 'the site did not answer' }),
    async () => {
      throw new Error('socket hang up')
    },
    async () => ({ ok: true })
  ]) {
    const { site, call } = failing(footer)
    const notes = []
    assert.equal(await woNameAsLogo({ call, applyId: 'a', note: (n) => notes.push(n) }), false)
    assert.equal(site.options.site_logo, 137)
    assert.deepEqual(site.writes, [])
    assert.match(notes[0], /footer could not be read/)
  }
  // The double answers `not_found` for the footer: that part is not there, and the header alone decides.
  const site = logoSite()
  assert.equal(await woNameAsLogo({ call: site.call, applyId: 'a', note: () => {} }), true)
})

test('when the site host is not known, an absolute link to another host is never the home page, and its dropdown stays', () => {
  const markup = [
    '<!-- wp:navigation-link {"label":"Home","url":"/","kind":"custom"} /-->',
    menu(
      'Partners',
      '<!-- wp:navigation-link {"label":"Partner","url":"https://partner.example/","kind":"custom"} /-->'
    )
  ].join('\n')
  for (const site of [undefined, { pathOf: new Map(), host: null }]) {
    const out = demoKitOff(markup, new Set(), site)
    assert.deepEqual(out.cut, [])
    assert.equal(out.markup, markup)
  }
  // A link by page id still compares by its id, whatever host its address carries.
  const byId = [link('Home', 1, ''), menu('Themes', link('Default Color', 1, ''))].join('\n')
  assert.deepEqual(demoKitOff(byId).cut, ['Themes'])
})
