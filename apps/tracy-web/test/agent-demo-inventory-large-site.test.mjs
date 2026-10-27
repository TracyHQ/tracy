import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgentDemoInventory } from '../src/sites/agent-demo-inventory.js'

/**
 * A Joomla site the way its Claude Cowork component answers the Apply door (Engine.php / JoomlaSiteWriter.php /
 * JoomlaRelations.php, read on the reverb stand 24/10/2026; integer columns come back as numbers): `content.list` summaries, `include_body` pages of at most 25
 * holding `read() + summary`, `content.get` as `SELECT *`, relation kinds read one target at a time, and `db.dump`
 * chunks of `INSERT … VALUES ('…','…')`. `legacy`: a component that ignores `include_body` and has no relation tables
 * to dump, so only the per-record read works.
 */
function joomlaSite({ size = 60, legacy = false, delay = 0, refuse = null } = {}) {
  const kinds = { article: [], module: [], menuItem: [], category: [], contact: [] }
  for (let i = 1; i <= size; i++) {
    kinds.article.push({
      id: i,
      title: `Article ${i}`,
      introtext: `<p>Intro ${i}</p>`,
      fulltext: '',
      state: i % 3 ? 1 : 0,
      catid: 1 + (i % 4),
      language: i % 2 ? 'en-GB' : 'vi-VN',
      images: '{"image_intro":"images/a.jpg"}'
    })
    kinds.module.push({
      id: i,
      title: `Module ${i}`,
      content: `<div><img src="images/m${i}.jpg"><p>Copy</p></div>`,
      published: i % 2,
      client_id: 0,
      params: JSON.stringify({ cards: [{ _rowId: `r${i}`, heading: 'Heading' }] })
    })
    kinds.menuItem.push({
      id: 100 + i,
      title: `Menu ${i}`,
      menutype: 'mainmenu',
      published: 1,
      parent_id: 1,
      language: '*'
    })
  }
  for (let i = 1; i <= 7; i++)
    kinds.category.push({ id: i, title: `Category ${i}`, description: '', published: 1, parent_id: 1 })
  kinds.contact.push({ id: 1, name: 'Owner', misc: '', address: 'Street 1', telephone: '1', published: 1 })
  const modulesMenu = kinds.module.flatMap((m) =>
    m.id % 5
      ? [[m.id, 0]]
      : [
          [m.id, 101],
          [m.id, 102]
        ]
  )
  const associations = []
  for (let i = 1; i + 1 <= size; i += 2) {
    associations.push([i, 'com_content.item', `key-a${i}`], [i + 1, 'com_content.item', `key-a${i}`])
    associations.push([100 + i, 'com_menus.item', `key-m${i}`], [101 + i, 'com_menus.item', `key-m${i}`])
  }
  associations.push([3, 'com_categories.item', 'key-c3'])
  associations.sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0])
  const summary = (kind, row) => ({
    id: row.id,
    title: row.title ?? row.name,
    state: row.state ?? row.published,
    url: `https://site.test/${kind}/${row.id}`,
    category_title: 'Home',
    checksum: 'x'
  })
  const read = (kind, id) => {
    if (kind === 'moduleAssignment')
      return {
        menuids: JSON.stringify(
          modulesMenu
            .filter(([m]) => m === id)
            .map(([, menu]) => menu)
            .sort((a, b) => a - b)
        )
      }
    if (kind === 'articleAssociation' || kind === 'menuAssociation') {
      const context = kind === 'articleAssociation' ? 'com_content.item' : 'com_menus.item'
      const key = associations.find(([i, c]) => i === id && c === context)?.[2]
      const members = key
        ? associations
            .filter(([, c, k]) => c === context && k === key)
            .map(([i, c, k]) => ({ id: i, context: c, key: k }))
        : []
      return { members: JSON.stringify(members) }
    }
    const row = kinds[kind].find((r) => r.id === id)
    return row ? { ...row } : null
  }
  const dump = (name, rows, { cursor, limit }) => {
    const start = cursor ? Number(JSON.parse(Buffer.from(cursor, 'base64').toString()).k) : 0
    const chunk = rows.slice(start, start + limit)
    const sql =
      `-- table \`${name}\`\nDROP TABLE IF EXISTS \`${name}\`;\nCREATE TABLE \`${name}\` (x int);\n` +
      (chunk.length
        ? `INSERT INTO \`${name}\` VALUES ${chunk.map((r) => `(${r.map((v) => `'${v}'`).join(',')})`).join(',')};\n`
        : '')
    const done = start + limit >= rows.length
    return {
      sql_b64: Buffer.from(sql).toString('base64'),
      rows: chunk.length,
      total: rows.length,
      done,
      next_cursor: done ? null : Buffer.from(JSON.stringify({ k: start + limit })).toString('base64')
    }
  }
  const calls = []
  let inFlight = 0,
    mostInFlight = 0
  const answer = ({ action, params }) => {
    if (action === 'content.list') {
      const body = !legacy && params.include_body
      const limit = Math.min(body ? 25 : 200, params.limit ?? (body ? 25 : 100))
      const rows = (kinds[params.kind] ?? []).slice(params.offset ?? 0, (params.offset ?? 0) + limit)
      return {
        ok: true,
        kind: params.kind,
        items: rows.map((row) =>
          body ? { ...summary(params.kind, row), ...read(params.kind, row.id) } : summary(params.kind, row)
        )
      }
    }
    if (action === 'content.get') {
      if (params.kind === 'article' && params.id === refuse) return { ok: false, error: 'read_failed' }
      const item = read(params.kind, Number(params.id))
      return item ? { ok: true, item } : { ok: false, error: 'not_found' }
    }
    if (action === 'db.tables')
      return {
        ok: true,
        prefix: 'ng_',
        tables: legacy
          ? ['ng_content']
          : ['ng_content', 'ng_modules_menu', 'ng_associations', 'ng_workflow_associations']
      }
    if (action === 'db.dump' && !legacy) {
      if (params.table === 'ng_modules_menu') return dump(params.table, modulesMenu, params)
      if (params.table === 'ng_associations') return dump(params.table, associations, params)
    }
    return { ok: false, error: 'bad_params' }
  }
  const reader = createAgentDemoInventory({
    siteReader: async () => ({ base: 'https://site.test' }),
    checkGrant: async () => {},
    siteAccess: async () => {
      throw Error('not EmDash')
    },
    applyFor: () => async (call) => {
      calls.push(call)
      inFlight++
      mostInFlight = Math.max(mostInFlight, inFlight)
      try {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay * (1 + (calls.length % 3))))
        return structuredClone(answer(call))
      } finally {
        inFlight--
      }
    }
  })
  return {
    read: () => reader({ site: { site_key: 'site.test', platform: 'joomla' }, email: 'owner@test' }),
    calls,
    mostInFlight: () => mostInFlight
  }
}

test('a big Joomla site is inventoried from body pages and relation tables, the same as one read per record', async () => {
  const perRecord = joomlaSite({ size: 60, legacy: true })
  const bulk = joomlaSite({ size: 60 })
  const expected = await perRecord.read()
  const inventory = await bulk.read()
  assert.equal(inventory.complete, true)
  assert.equal(inventory.records.length, 60 * 3 + 7 + 1)
  assert.deepEqual(inventory.records, expected.records)
  assert.equal(inventory.invariantHash, expected.invariantHash)
  assert.equal(inventory.hash, expected.hash)
  // the per-record read made a get for every record and every relation; the bulk read pages
  assert.ok(perRecord.calls.length > 300, `${perRecord.calls.length}`)
  assert.ok(bulk.calls.length < 30, `${bulk.calls.length} calls`)
  assert.equal(
    bulk.calls.filter((c) => c.action === 'content.get' && /Assoc|Assign/.test(c.params.kind)).length,
    0
  )
  // what a relation reads as is the component's own read() of it
  const module5 = inventory.records.find((r) => r.key === 'module/5')
  assert.deepEqual(module5.relations.moduleAssignment, { menuids: '[101,102]' })
  const article1 = inventory.records.find((r) => r.key === 'article/1')
  assert.deepEqual(
    JSON.parse(article1.relations.articleAssociation.members).map((m) => m.id),
    [1, 2]
  )
  // the summary's own columns (category title, checksum) are not record data: a renamed category moves no article
  assert.equal('category_title' in article1.data, false)
  assert.equal(article1.data.introtext, '<p>Intro 1</p>')
})

test('the reader keeps several Apply calls in flight, never more than eight, and answers in the same order', async () => {
  const calm = await joomlaSite({ size: 200 }).read()
  const jittery = joomlaSite({ size: 200, delay: 2 })
  const inventory = await jittery.read()
  assert.ok(jittery.mostInFlight() > 1, `${jittery.mostInFlight()} in flight`)
  assert.ok(jittery.mostInFlight() <= 8, `${jittery.mostInFlight()} in flight`)
  assert.deepEqual(
    inventory.records.map((r) => r.key),
    calm.records.map((r) => r.key)
  )
  assert.deepEqual(inventory.coverage, calm.coverage)
  assert.equal(inventory.hash, calm.hash)
})

test('a component without bodies or relation dumps is still read in parallel, one record at a time', async () => {
  const legacy = joomlaSite({ size: 40, legacy: true, delay: 1 })
  const inventory = await legacy.read()
  assert.equal(inventory.complete, true)
  assert.ok(legacy.mostInFlight() > 1)
  assert.ok(legacy.mostInFlight() <= 8)
})

test('one refused call stops the reader: the calls still waiting for a slot are never sent', async () => {
  const site = joomlaSite({ size: 300, legacy: true, delay: 1, refuse: 5 })
  await assert.rejects(site.read(), /AGENT_DEMO_INVENTORY_UNAVAILABLE/)
  const sent = site.calls.length
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.ok(site.calls.length - sent <= 8, `${site.calls.length - sent} calls after the refusal`)
})
