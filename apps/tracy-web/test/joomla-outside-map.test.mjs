// Ticket TracyHQ/tracy#196 (spec #189): a Joomla brief build writes what the content map does not reach, through the Apply
// door (a recording double here): the showcase entries go, the credit line goes, demo addresses follow the written titles,
// and one head block in the template style's own head-code param repaints demo backgrounds and hides demo play buttons and
// links to pages taken off. A kickboxing demo and a dental clinic demo, both made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  creditSteps,
  frameworkOf,
  ownerPictureOf,
  plannedSlotValues,
  showcaseOff,
  writeOutsideMap
} from '../src/sites/brief-engines/joomla-outside-map.js'
import { planOutsideMap } from 'website-opportunities/domain/outside-map.mjs'

const contentMap = {
  entities: [
    { key: 'article-14', kind: 'article', sourceId: 14, identity: { alias: 'beginner-kickboxing' } }
  ],
  slots: [
    {
      key: 'article-14.4',
      entity: 'article-14',
      column: 'title',
      type: 'text',
      role: 'offering.name',
      sample: 'Beginner Kickboxing'
    },
    {
      key: 'article-14.12',
      entity: 'article-14',
      type: 'text',
      role: 'business.video',
      sample: 'AbCdEfGhIjK'
    }
  ]
}
const brief = { business: { name: 'Copperleaf Bakery' } }
const OWNER = `images/tracy-content/${'a'.repeat(64)}.jpg`

/** A Joomla site behind the Apply door: lists rows by kind and records every write. */
function fakeSite({ styles }) {
  const rows = {
    module: [
      { id: 90, module: 'mod_footer', published: 1, content: '' },
      {
        id: 91,
        module: 'mod_custom',
        published: 1,
        position: 'footer',
        content: '<p>Fresh bread daily</p><p>Designed by JoomlArt.com</p>'
      },
      { id: 92, module: 'mod_custom', published: 1, content: '<p>Fresh bread daily</p>' }
    ],
    article: [
      { id: 14, alias: 'beginner-kickboxing', title: 'Sourdough workshop', catid: 9 },
      { id: 15, alias: 'about-us', title: 'About us', catid: 2 }
    ],
    menuItem: [
      { id: 101, path: 'home', published: 1, client_id: 0 },
      { id: 168, path: 'about-us/contact', published: 0, client_id: 0 }
    ],
    templateStyle: styles
  }
  const writes = []
  const apply = async ({ action, params }) => {
    // Like the real site: a style listing names the style only; its params come with `content.get`.
    if (action === 'content.list')
      return {
        ok: true,
        items:
          (params.offset ?? 0) === 0
            ? (rows[params.kind] ?? []).map((r) =>
                params.kind === 'templateStyle'
                  ? {
                      id: r.id,
                      title: `style ${r.id}`,
                      template: r.client_id === 1 ? 'atum' : 'site_template',
                      home: '0'
                    }
                  : r
              )
            : []
      }
    if (action === 'content.get' && params.kind === 'templateStyle')
      return { ok: true, item: (rows.templateStyle ?? []).find((r) => r.id === params.id) }
    if (action === 'content.get' && params.kind === 'moduleAssignment')
      return { ok: true, item: { menuids: params.id === 91 ? '[0]' : '[101]' } }
    if (action === 'content.batch') {
      writes.push(...params.operations)
      return { ok: true }
    }
    if (action === 'content.update') {
      writes.push({ kind: params.kind, id: params.id, fields: params.fields })
      return { ok: true, ...(params.id === undefined ? { id: 900 } : {}) }
    }
    return { ok: false, error: 'unknown' }
  }
  return { apply, writes }
}

const reader = {
  text: async (url) => {
    if (url === '/')
      return `<html><head><link rel="stylesheet" href="/media/t4/css/site.css"></head><body><img src="/${OWNER}"><div style="background-image:url(/images/demo/others/band.jpg)"></div></body></html>`
    if (url === '/media/t4/css/site.css')
      return '.t4-content{background-image:url(/images/demo/others/bg-cta.jpg)}'
    throw new Error('not served')
  }
}

test('a T4 site: credit line, addresses and the head block (as a custom module on every page) are written', async () => {
  const t4 = {
    id: 12,
    client_id: 0,
    params: JSON.stringify({
      'typelist-site': 'default',
      system_advancedCodeAfterHead: '<meta name="owner">'
    })
  }
  const site = fakeSite({ styles: [t4, { id: 1, client_id: 1, params: '{}' }] })
  const plan = {
    brand: { name: { value: 'Copperleaf Bakery' } },
    pages: [],
    outside: planOutsideMap({ brief, contentMap })
  }
  const done = await writeOutsideMap({
    apply: site.apply,
    siteKey: 's',
    plan,
    reader,
    contentMap,
    note: () => {},
    applyId: 'outside-1'
  })
  assert.deepEqual(done, { credit: 2, aliases: 1, head: 1, links: 0 })
  const byId = (kind, id) => site.writes.find((w) => w.kind === kind && w.id === id)?.fields
  assert.equal(byId('module', 90).module, 'mod_custom')
  assert.match(String(byId('module', 90).content), /Copyright © Copperleaf Bakery\./)
  assert.equal(byId('module', 91).content, '<p>Fresh bread daily</p>')
  assert.equal(byId('module', 92), undefined)
  assert.deepEqual(byId('article', 14), { alias: 'sourdough-workshop' })
  // T4 drops the style's system_* params (it reads them from a template file), so nothing is written to the style row.
  assert.equal(byId('templateStyle', 12), undefined)
  const made = site.writes.find((w) => w.kind === 'module' && w.id === undefined)
  assert.equal(made.fields.module, 'mod_custom')
  assert.equal(made.fields.position, 'footer')
  assert.equal(made.fields.note, 'tracy-leftovers')
  const head = String(made.fields.content)
  assert.deepEqual(site.writes.find((w) => w.kind === 'moduleAssignment').fields, { menuids: '[0]' })
  assert.match(
    head,
    /\[style\*="images\/demo\/others\/band\.jpg"\]\{background-image:url\("\/images\/tracy-content\/a+\.jpg"\) !important\}/
  )
  // The page-wide background goes plain, never one picture over the whole page.
  assert.match(head, /\.t4-content\{background-image:none !important\}/)
  assert.match(head, /\[data-src\*="AbCdEfGhIjK"\]/)
  assert.match(head, /a\[href\$="Itemid=168"\]/)
  assert.equal(byId('templateStyle', 1), undefined)
})

test('a T3 site of another trade gets the same block in its own head-code param, backgrounds taken off without an owner picture', async () => {
  const t3 = { id: 9, client_id: 0, params: { t3_template: '1', snippet_close_head: '' } }
  const site = fakeSite({ styles: [t3] })
  const clinicMap = { entities: [], slots: [] }
  const plan = {
    brand: {},
    pages: [],
    outside: planOutsideMap({ brief: { business: { name: 'Smile Studio' } }, contentMap: clinicMap })
  }
  const plainReader = {
    text: async (url) =>
      url === '/'
        ? '<html><head><link rel="stylesheet" href="/t3-assets/a.css"></head><body></body></html>'
        : 'header{background:url(/images/clinic/band.webp)}'
  }
  await writeOutsideMap({
    apply: site.apply,
    siteKey: 's',
    plan,
    reader: plainReader,
    contentMap: clinicMap,
    note: () => {},
    applyId: 'o'
  })
  const head = JSON.parse(
    String(site.writes.find((w) => w.kind === 'templateStyle').fields.params)
  ).snippet_close_head
  assert.match(head, /header\{background-image:none !important\}/)
  // No name in the plan: the footer module goes rather than say anyone's copyright.
  assert.deepEqual(site.writes.find((w) => w.kind === 'module' && w.id === 90).fields, { published: 0 })
})

test('#189 head only (the overlap safety net): the head block hides the pictures, no record is written again', async () => {
  const t3 = { id: 9, client_id: 0, params: { t3_template: '1', snippet_close_head: '' } }
  const site = fakeSite({ styles: [t3] })
  const plan = {
    brand: { name: { value: 'Copperleaf Bakery' } },
    pages: [],
    outside: planOutsideMap({ brief, contentMap })
  }
  const covering = `images/tracy-content/${'b'.repeat(64)}.png`
  const done = await writeOutsideMap({
    apply: site.apply,
    siteKey: 's',
    plan,
    reader,
    contentMap,
    note: () => {},
    applyId: 'outside-2',
    pictures: [covering],
    headOnly: true
  })
  assert.deepEqual(
    { credit: done.credit, aliases: done.aliases, links: done.links },
    { credit: 0, aliases: 0, links: 0 }
  )
  assert.deepEqual(
    site.writes.map((w) => w.kind),
    ['templateStyle']
  )
  const head = JSON.parse(String(site.writes[0].fields.params)).snippet_close_head
  assert.match(head, new RegExp(`img\\[src\\*="${covering}"\\]\\{display:none !important\\}`))
})

test('a site with no site plan (not a brief build) is not touched', async () => {
  const site = fakeSite({ styles: [] })
  const done = await writeOutsideMap({
    apply: site.apply,
    siteKey: 's',
    plan: null,
    reader,
    contentMap,
    note: () => {},
    applyId: 'o'
  })
  assert.deepEqual(done, { credit: 0, aliases: 0, head: 0, links: 0 })
  assert.deepEqual(site.writes, [])
})

test('showcaseOff takes the showcase map’s entries, sample addresses and everything under them, never home', () => {
  const rows = [
    { id: 101, path: 'home', parent_id: 1, published: 1, menutype: 'mainmenu-x', home: 1 },
    { id: 152, path: 'pages', parent_id: 1, published: 1, menutype: 'pages-menu' },
    { id: 160, path: 'pages/j-pages/typography', parent_id: 152, published: 1, menutype: 'pages-menu' },
    { id: 170, path: 'pound-it', parent_id: 1, published: 1, menutype: 'hidden' },
    { id: 171, path: 'pound-it/round-two', parent_id: 170, published: 1, menutype: 'hidden' },
    { id: 180, path: 'services', parent_id: 1, published: 1, menutype: 'mainmenu-x' }
  ]
  assert.deepEqual(
    showcaseOff({ rows, showcase: new Set([170]), visible: new Set(['en-GB']) }).sort(),
    [160, 170, 171]
  )
})

test('the small pieces: framework by params, owner picture, credit steps, planned video values', () => {
  assert.equal(frameworkOf({ 'typelist-theme': 'default' }), 't4')
  assert.equal(frameworkOf({ t3_template: '1' }), 't3')
  assert.equal(frameworkOf({ logo: 'x' }), null)
  assert.equal(ownerPictureOf(`<img src="/${OWNER}">`), OWNER)
  assert.equal(ownerPictureOf('<img src="/images/demo/a.jpg">'), null)
  assert.deepEqual(
    creditSteps({
      modules: [{ id: 3, module: 'mod_custom', published: 1, content: '<p>Powered by Joomla</p>' }],
      name: 'X'
    }),
    [{ kind: 'module', id: 3, fields: { published: 0 } }]
  )
  const plan = {
    outside: {
      videos: [
        { key: 'k1', decision: 'video', value: 'OwnVideo001' },
        { key: 'k2', decision: 'still' }
      ]
    }
  }
  assert.deepEqual(plannedSlotValues(plan), { k1: 'OwnVideo001' })
  assert.deepEqual(plannedSlotValues(null), {})
})

test('the footer that replaces the credit line speaks the site language', () => {
  const [step] = creditSteps({
    modules: [{ id: 90, module: 'mod_footer', published: 1 }],
    name: 'Smile Studio',
    locale: 'fr-FR'
  })
  assert.equal(step.fields.module, 'mod_custom')
  assert.match(String(step.fields.content), /Copyright © Smile Studio\. Tous droits r\u00e9serv\u00e9s\./)
})
