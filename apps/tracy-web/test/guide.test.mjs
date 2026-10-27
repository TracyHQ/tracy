import assert from 'node:assert/strict'
import test from 'node:test'

import { UI_CATALOGUE } from '../src/lib/ui-setting.js'
import {
  available,
  articles,
  fold,
  parseArticle,
  roleNote,
  screenLink,
  search,
  topics
} from '../src/lib/guide.js'

const SWITCH_IDS = new Set(UI_CATALOGUE.switches.map((s) => s.id))

test('every article parses and names a real switch (or says why it has none)', () => {
  const list = articles()
  assert.ok(list.length >= 10)
  for (const a of list) {
    assert.match(a.id, /^[a-z0-9-]+$/)
    if (a.switchId !== '') assert.ok(SWITCH_IDS.has(a.switchId), `${a.id}: unknown switch ${a.switchId}`)
    else assert.ok(a.noSwitchReason, `${a.id}: no switch and no reason`)
    assert.match(a.checked, /^\d{4}-\d{2}-\d{2} @ [0-9a-f]{7,}$/, `${a.id}: checked`)
    assert.ok(a.keywords.length >= 3, `${a.id}: keywords`)
  }
})

test('a broken article stops the load instead of reaching a customer', () => {
  assert.throws(() => parseArticle('no frontmatter', 'x.md'), /no frontmatter/)
  assert.throws(() => parseArticle('---\nid: a\n---\nbody', 'x.md'), /missing "title"/)
  const head =
    "id: a\ntitle: T\nswitch: none:x\ntab: ''\nplatforms: [joomla]\nkeywords: [a]\nchecked: 2026-10-21 @ abcdef0"
  assert.throws(() => parseArticle(`---\n${head}\nroles: [boss]\n---\nbody`, 'x.md'), /unknown role/)
  assert.throws(() => parseArticle(`---\n${head}\nroles: [owner]\n---\n`, 'x.md'), /empty body/)
})

test('a customer asking about their own domain finds the domain article, in English or Vietnamese', () => {
  const list = available([])
  for (const q of [
    'how do I connect my own domain',
    'trỏ DNS sao',
    'tôi muốn dùng tên miền riêng',
    'what CNAME record do I add',
    'I added the TXT record but it is not working'
  ])
    assert.equal(search(q, list)[0]?.id, 'own-domain', q)
})

test('other everyday questions find their own article first', () => {
  const list = available([])
  const first = (q) => search(q, list)[0]?.id
  assert.equal(first('khôi phục bản hôm qua'), 'backup-restore')
  assert.equal(first('how do I restore a backup'), 'backup-restore')
  assert.equal(first('xuất site ra zip'), 'export-zip')
  assert.equal(first('mời đồng nghiệp vào site'), 'team-roles')
  assert.equal(first('giá bao nhiêu'), 'pricing')
  assert.equal(first('how do I publish my site'), 'publish')
})

test('a question the guide does not cover finds nothing (the model says it does not know)', () => {
  assert.deepEqual(search('what is the capital of France', available([])), [])
  assert.deepEqual(search('', available([])), [])
})

test('an article whose switch is off on this deployment is not offered', () => {
  const on = available([]).map((a) => a.id)
  const off = available(['site-connect-domain']).map((a) => a.id)
  assert.ok(on.includes('own-domain'))
  assert.ok(!off.includes('own-domain'))
  assert.ok(off.includes('publish'))
})

test('an article is offered only on the platforms it covers', () => {
  assert.ok(available([], 'joomla').some((a) => a.id === 'sync-from-live'))
  assert.ok(available([], 'wordpress').some((a) => a.id === 'sync-from-live'))
  assert.ok(!available([], 'emdash').some((a) => a.id === 'sync-from-live'))
})

test('the link opens the article tab on the site, and an article without a tab has no link', () => {
  const site = { workspaceUrl: 'https://x.tracy.test/w/shop', name: 'shop one' }
  const byId = (id) => articles().find((a) => a.id === id)
  assert.deepEqual(screenLink(byId('own-domain'), site), {
    label: byId('own-domain').title,
    href: 'https://x.tracy.test/w/shop?tab=tracy:site-publish&site=shop%20one'
  })
  assert.equal(screenLink(byId('pricing'), site), null)
  assert.equal(screenLink(byId('own-domain'), null), null)
})

test('a role that cannot do the thing is told who can', () => {
  const domain = articles().find((a) => a.id === 'own-domain')
  assert.match(roleNote(domain, 'editor'), /Owner/)
  assert.equal(roleNote(domain, 'owner'), null)
  assert.equal(roleNote(domain, null), null)
  const team = articles().find((a) => a.id === 'team-roles')
  assert.equal(roleNote(team, 'viewer'), null)
})

test('fold removes accents so Vietnamese keywords match without them', () => {
  assert.equal(fold('Tên miền Đẹp'), 'ten mien dep')
  assert.equal(topics(available([])).length, available([]).length)
})

test('the domain article says what a customer needs to act on it', () => {
  const body = articles().find((a) => a.id === 'own-domain').body
  for (const needle of [
    'Owner',
    'subdomain',
    'www.',
    'TXT',
    'CNAME',
    '_tracy.',
    'DNS only',
    'up to an hour',
    '72 hours',
    'Back to draft'
  ])
    assert.ok(body.includes(needle), `own-domain article lacks "${needle}"`)
})

test('the import guide distinguishes edits to the copy from connecting the original site', () => {
  const body = articles().find((a) => a.id === 'add-site').body
  assert.ok(
    body.includes(
      '**Import:** bring in an existing site. Tracy makes its own copy and your edits go to that copy, never back to your original server. To connect, Tracy may install or update its connector plugin on your existing site.'
    )
  )
  assert.match(
    body,
    /For an imported WordPress or Joomla site, Sync from live later brings in what changed on the live site\./
  )
  assert.doesNotMatch(body, /live site is not touched|nothing touches your live site/)
})
