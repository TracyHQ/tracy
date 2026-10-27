/**
 * The site name in every page title of a Joomla site the customer named (TCH #1013, D1; `joomla-page-titles.js`), held against a
 * fake site that answers `site.identity` the way Claude Cowork for Joomla 0.24.5 does and refuses the key the way an older one does.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { writeJoomlaBrand } from '../src/sites/brief-engines/brand-joomla.js'

/** A home entry and an inner page, `params` as stored (a JSON string). */
const MENU = [
  {
    id: 101,
    home: 1,
    language: '*',
    params: JSON.stringify({ page_title: 'Golden Crust', show_page_heading: '0' })
  },
  { id: 102, home: 0, language: '*', params: JSON.stringify({ page_title: 'Golden Crust' }) },
  { id: 103, home: 1, language: 'vi-VN', params: JSON.stringify({ page_title: 'Trang chủ' }) }
]

function fakeSite({ component = '0.24.5', refuseMenu = false } = {}) {
  const site = {
    config: { sitename: 'JA Demo', MetaDesc: '', sitename_pagetitles: 0 },
    menu: structuredClone(MENU),
    calls: /** @type {any[]} */ ([]),
    door: async (/** @type {any} */ call) => {
      site.calls.push(call)
      const { action, params } = call
      if (action === 'info') return { ok: true, info: { component } }
      if (action === 'site.identity') {
        const keys = Object.keys(params.fields ?? {})
        // An older plugin refuses the whole set naming a key it does not know, and writes nothing.
        if (component < '0.24.5' && keys.includes('sitename_pagetitles'))
          return { ok: false, error: 'unsupported', message: 'Only sitename and MetaDesc are written here' }
        Object.assign(site.config, params.fields)
        return { ok: true, fields: site.config }
      }
      if (action === 'content.list' && params.kind === 'menuItem')
        return { ok: true, items: site.menu.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit) }
      if (action === 'content.update' && params.kind === 'menuItem') {
        if (refuseMenu) return { ok: false, message: 'locked' }
        const row = site.menu.find((r) => r.id === params.id)
        Object.assign(row, params.fields)
        return { ok: true }
      }
      return { ok: false, error: 'bad_action', message: `unknown action ${action}` }
    }
  }
  return site
}

async function brand(site, prepared = { name: 'Golden Crust' }) {
  const written = []
  const skipped = []
  await writeJoomlaBrand({
    prepared,
    profile: null,
    stamp: 's',
    tag: null,
    siteKey: 'jm',
    applyId: 'brand-1',
    read: (action, params) => site.door({ action, params }),
    write: async (action, params) => {
      const answer = await site.door({ action, params: { apply_id: 'brand-1', ...params } })
      if (answer?.ok === false) throw Object.assign(new Error(answer.message), { answer })
      return answer
    },
    wrote: (where) => written.push(where),
    skip: (where, reason) => skipped.push({ where, reason })
  })
  return { written, skipped }
}

const paramsOf = (site, id) => JSON.parse(site.menu.find((r) => r.id === id).params)

test('a named site shows its name after every page title, and the home tab does not name it twice', async () => {
  const site = fakeSite()
  const { written, skipped } = await brand(site)
  assert.equal(site.config.sitename, 'Golden Crust')
  assert.equal(site.config.sitename_pagetitles, 2)
  // The key goes in a call of its own, after the name: an older plugin refuses a whole set that names it.
  const sets = site.calls.filter((c) => c.action === 'site.identity').map((c) => Object.keys(c.params.fields))
  assert.deepEqual(sets, [['sitename'], ['sitename_pagetitles']])
  assert.equal(paramsOf(site, 101).page_title, '', 'the home entry titled by the name alone is emptied')
  assert.equal(paramsOf(site, 101).show_page_heading, '0', 'every other setting of the entry is kept')
  assert.equal(paramsOf(site, 102).page_title, 'Golden Crust', 'an inner page is not a home entry')
  assert.equal(paramsOf(site, 103).page_title, 'Trang chủ', 'a home title that is not the name stays')
  assert.ok(
    site.calls
      .filter((c) => !['info', 'content.list', 'db.tables', 'db.dump'].includes(c.action))
      .every((c) => c.params.apply_id === 'brand-1'),
    'every write is under the brand apply id, so apply.revert takes it back'
  )
  assert.deepEqual(written, ['sitename', 'page-titles', 'home-title'])
  assert.deepEqual(skipped, [])
})

test('a plugin older than the key is not asked, and nothing is said: the template keeps its own setting', async () => {
  const site = fakeSite({ component: '0.24.4' })
  const { written, skipped } = await brand(site)
  assert.equal(site.config.sitename, 'Golden Crust')
  assert.equal(site.config.sitename_pagetitles, 0)
  assert.equal(paramsOf(site, 101).page_title, 'Golden Crust', 'the home title is left with the switch off')
  assert.deepEqual(written, ['sitename'])
  assert.deepEqual(skipped, [])
})

test('a plugin that claims the key but refuses it is said, and the home title is left', async () => {
  const site = fakeSite()
  const door = site.door
  site.door = async (call) =>
    call.action === 'site.identity' && 'sitename_pagetitles' in (call.params.fields ?? {})
      ? { ok: false, error: 'unsupported', message: 'unsupported key' }
      : door(call)
  const { skipped } = await brand(site)
  assert.deepEqual(skipped, [{ where: 'page-titles', reason: 'plugin too old' }])
  assert.equal(paramsOf(site, 101).page_title, 'Golden Crust')
})

test('a name the site address stands in for leaves the page titles as the template has them', async () => {
  const site = fakeSite()
  await brand(site, { name: 'Golden Crust', nameGiven: false })
  assert.equal(site.config.sitename, 'Golden Crust')
  assert.equal(site.config.sitename_pagetitles, 0)
})

test('a home entry the site will not change is said: its tab names the site twice', async () => {
  const site = fakeSite({ refuseMenu: true })
  const { skipped } = await brand(site)
  assert.equal(site.config.sitename_pagetitles, 2)
  assert.equal(skipped.length, 1)
  assert.equal(skipped[0].where, 'home-title')
  assert.match(skipped[0].reason, /names the site twice/)
})
