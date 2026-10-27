/**
 * The demo Super User's display name on a new Joomla site (brand step, `brand-joomla-author.js`).
 *
 * A quickstart carries the Super User its stand was installed with ("Tracy Agent"); the bootstrap only resets its password,
 * and the customer signs in through a separate account Tracy Access creates (named by email). Every article that user wrote
 * printed "Written by Tracy Agent" on the customer's blog. The brand step now names that user after the business: the name
 * the customer gave, else the site's own name. Held against a fake site that answers the way the Claude Cowork plugin does
 * (shapes measured 25/10/2026 on the DDEV copy of JA Boxing, plugin 0.24.61) and takes an `apply.revert` back.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { setSiteBrand } from '../src/sites/brief-engines/brand.js'
import { throughDoor } from './_apply-door.mjs'

const MAP = 'tr_user_usergroup_map'

/** A Joomla site: users, their groups, the site name. */
function fakeJoomla({ sitename = 'JA Boxing', component = '0.24.61' } = {}) {
  const users = new Map(
    [
      { id: 42, name: 'Tracy Agent', username: 'tracyagent', groups: [8] },
      { id: 44, name: 'Drew Stokes ', username: 'Drew_Stokes', groups: [2] },
      { id: 53, name: 'owner@example.com', username: 'owner@example.com', groups: [6, 8] }
    ].map((u) => [u.id, u])
  )
  const state = { sitename, users }
  const log = new Map()
  const calls = []
  const door = async (/** @type {any} */ call) => {
    calls.push(call)
    const { action, params = {} } = call
    if (action === 'info') return { ok: true, info: { component } }
    if (action === 'site.identity') {
      if ((params.operation ?? 'read') === 'read') return { ok: true, fields: { sitename: state.sitename } }
      const before = state.sitename
      if (typeof params.fields.sitename === 'string') state.sitename = params.fields.sitename
      log.set(params.apply_id, [...(log.get(params.apply_id) ?? []), () => void (state.sitename = before)])
      return { ok: true }
    }
    if (action === 'db.tables') return { ok: true, tables: ['tr_content', 'tr_users', MAP], details: [] }
    if (action === 'db.dump' && params.table === MAP) {
      const pairs = [...users.values()].flatMap((u) => u.groups.map((g) => `('${u.id}','${g}')`))
      const sql = `-- table \`${MAP}\`\nINSERT INTO \`${MAP}\` VALUES ${pairs.join(',')};\n`
      return {
        ok: true,
        table: MAP,
        sql_b64: Buffer.from(sql).toString('base64'),
        rows: pairs.length,
        done: true
      }
    }
    if (action === 'content.list' && params.kind === 'user')
      return {
        ok: true,
        kind: 'user',
        offset: 0,
        items: [...users.values()].map(({ id, name, username }) => ({ id, name, username, block: 0 }))
      }
    if (action === 'content.update' && params.kind === 'user') {
      const user = users.get(params.id)
      const before = user.name
      user.name = params.fields.name
      log.set(params.apply_id, [...(log.get(params.apply_id) ?? []), () => void (user.name = before)])
      return { ok: true, kind: 'user', id: params.id, created: false }
    }
    if (action === 'apply.revert') {
      for (const undo of (log.get(params.apply_id) ?? []).reverse()) undo()
      return { ok: true }
    }
    return { ok: false, error: 'bad_action', message: `unknown action: ${action}` }
  }
  return { state, calls, door: throughDoor(door) }
}

const brand = (site, pack) =>
  setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: { tag: 'quickstart/ja-boxing/j6', version: '1.0.3' },
    pack,
    call: site.door,
    applyId: 'brand-1',
    note: () => {}
  })

test('a name the customer gave becomes the demo Super User display name, and only that', async () => {
  const site = fakeJoomla()
  const result = await brand(site, { name: 'Akemi Boxing Club', nameGiven: true })
  assert.equal(site.state.users.get(42).name, 'Akemi Boxing Club')
  // The demo authors stay the template's people; the customer's own account keeps its name.
  assert.equal(site.state.users.get(44).name, 'Drew Stokes ')
  assert.equal(site.state.users.get(53).name, 'owner@example.com')
  assert.ok(result.written.includes('author-name'))
  // Only the name column is written, under the brand apply id.
  const writes = site.calls.filter((c) => c.action === 'content.update' && c.params.kind === 'user')
  assert.deepEqual(
    writes.map((c) => c.params),
    [{ apply_id: 'brand-1', kind: 'user', id: 42, fields: { name: 'Akemi Boxing Club' } }]
  )
})

test('no name given: the demo Super User takes the site name as it stands', async () => {
  const site = fakeJoomla({ sitename: 'JA Boxing' })
  await brand(site, {})
  assert.equal(site.state.users.get(42).name, 'JA Boxing')
  assert.equal(site.state.sitename, 'JA Boxing')
})

test('the rename goes back with the brand apply id', async () => {
  const site = fakeJoomla()
  await brand(site, { name: 'Akemi Boxing Club', nameGiven: true })
  await site.door({ siteKey: 's', action: 'apply.revert', params: { apply_id: 'brand-1' } })
  assert.equal(site.state.users.get(42).name, 'Tracy Agent')
})

test('a site that will not say who its Super Users are is left as it is, and the brand is not failed for it', async () => {
  const site = fakeJoomla()
  const inner = site.door
  site.door = async (call) =>
    call.action === 'db.dump' ? { ok: false, error: 'forbidden', message: 'no' } : inner(call)
  const result = await brand(site, { name: 'Akemi Boxing Club', nameGiven: true })
  assert.equal(site.state.users.get(42).name, 'Tracy Agent')
  // Nothing the customer can act on: no skip, so a build that needs a complete brand is not failed by it.
  assert.deepEqual(
    result.skipped.filter((s) => s.where === 'author-name'),
    []
  )
  // The site name itself is still written.
  assert.equal(site.state.sitename, 'Akemi Boxing Club')
})

test('a refused rename is said', async () => {
  const site = fakeJoomla()
  const inner = site.door
  site.door = async (call) =>
    call.action === 'content.update' && call.params.kind === 'user'
      ? { ok: false, error: 'forbidden', message: 'no' }
      : inner(call)
  const result = await brand(site, { name: 'Akemi Boxing Club', nameGiven: true })
  assert.equal(site.state.users.get(42).name, 'Tracy Agent')
  assert.equal(result.skipped.filter((s) => s.where === 'author-name').length, 1)
})
