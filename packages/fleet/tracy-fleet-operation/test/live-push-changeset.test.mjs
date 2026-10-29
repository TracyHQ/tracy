/**
 * "Sync to live", the changeset (`scripts/lib/live_push.py changeset`, plan tasks/ke-hoach-sync-to-live.md
 * §2.2): what Tracy changed on the copy (copy − base), as writes the live site's Claude Cowork engine
 * takes — in the live site's numbers and address, each with the base values the writer checks first —
 * and what it cannot take, named.
 *
 * No database: the rows are handed over as the SQL reader would have read them (`--from-json`), the
 * same shapes as the live-sync tests' Joomla site (jos_ prefix) and WordPress site (wp_ prefix, the
 * copy at https://shop-com.tracy.ai, the live site at https://shop.example).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-push-changeset.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PUSH = join(here, '..', 'scripts', 'lib', 'live_push.py')
const root = mkdtempSync(join(tmpdir(), 'live-push-changeset-'))
after(() => rmSync(root, { recursive: true, force: true }))

let n = 0
/** The changeset of `data` (`{kinds, entities, files, idMap, homes}`) on `platform`; `kept`: sync/kept.json. */
function changeset(platform, data, kept) {
  const file = join(root, `data-${++n}.json`)
  writeFileSync(file, JSON.stringify({ prefix: platform === 'joomla' ? 'jos_' : 'wp_', ...data }))
  const extra = []
  if (kept) {
    writeFileSync(`${file}.kept`, JSON.stringify(kept))
    extra.push('--kept', `${file}.kept`)
  }
  const r = spawnSync('python3', [PUSH, 'changeset', '--platform', platform, '--from-json', file, ...extra], {
    encoding: 'utf8'
  })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  return JSON.parse(r.stdout.trim().split('\n').at(-1))
}

/** One kind's data: every row on both sides (the reader would hand over only the ones that differ). */
function kind(base, copy, key = ['id'], tree) {
  const keyOf = (r) => key.map((k) => String(r[k]))
  return {
    keys: { base: base.map(keyOf), copy: copy.map(keyOf) },
    rows: { base, copy },
    ...(tree ? { tree } : {})
  }
}

const article = (id, fields = {}) => ({
  id: String(id),
  title: `Article ${id}`,
  alias: `article-${id}`,
  introtext: `text ${id}`,
  fulltext: '',
  state: '1',
  catid: '2',
  created_by_alias: '',
  modified: '2026-01-01 00:00:00',
  asset_id: String(100 + id),
  tags: null,
  ...fields
})
const category = (id, fields = {}) => ({
  id: String(id),
  title: `Category ${id}`,
  alias: `category-${id}`,
  extension: 'com_content',
  parent_id: '1',
  published: '1',
  lft: String(id * 2),
  rgt: String(id * 2 + 1),
  level: '1',
  path: `category-${id}`,
  ...fields
})

const byId = (answer) => Object.fromEntries(answer.items.map((i) => [i.id, i]))

test('Joomla: an edited title is an update in the live site’s number, checked against the base value', () => {
  const answer = changeset('joomla', {
    entities: { content: { base: [1, 2, 7], copy: [1, 2, 8] }, categories: { base: [2], copy: [2] } },
    // The customer's article 7 met one of the copy's: the copy holds it as 8 (`sync/id-map.json`).
    idMap: { content: { 7: 8 } },
    kinds: {
      article: kind(
        [article(1), article(2), article(7, { title: 'Live seven' })],
        [
          article(1, { title: 'Article 1, by Tracy', modified: '2026-10-24 10:00:00' }),
          // Links to the renumbered article in the copy's number: the live site's is 7, nothing changed.
          article(2, { introtext: '<a href="index.php?option=com_content&view=article&id=8">x</a>' }),
          // The customer's article 7, as the copy holds it: under 8.
          { ...article(7), id: '8', title: 'Live seven, by Tracy' }
        ]
      )
    }
  })
  // Tracy edited 1 and 8 and put a link into 2.
  const items = byId(answer)
  assert.deepEqual(Object.keys(items).sort(), ['article:1', 'article:2', 'article:8'])
  const one = items['article:1']
  assert.equal(one.op, 'update')
  assert.equal(one.liveId, 1)
  assert.deepEqual(one.write, { title: 'Article 1, by Tracy' })
  assert.deepEqual(one.expect, { title: 'Article 1' })
  assert.deepEqual(one.seed, [{ table: 'content', match: { id: 1 }, columns: ['title'] }])
  // `modified` is the CMS's own stamp: never offered, never named.
  assert.ok(!('modified' in one.write))
  // The renumbered article is written under its live number.
  assert.equal(items['article:8'].liveId, 7)
  assert.deepEqual(items['article:8'].write, { title: 'Live seven, by Tracy' })
  assert.deepEqual(items['article:8'].seed[0].match, { id: 8 })
  // Article 2's link: the copy's 8 is the live site's 7 — what goes to the live site names 7.
  assert.equal(
    items['article:2'].write.introtext,
    '<a href="index.php?option=com_content&view=article&id=7">x</a>'
  )
})

test('Joomla: a link to a renumbered article that the base already holds in the live number is no change', () => {
  const answer = changeset('joomla', {
    entities: { content: { base: [2, 7], copy: [2, 8] } },
    idMap: { content: { 7: 8 } },
    kinds: {
      article: kind(
        [article(2, { introtext: 'see id=7: option=com_content&view=article&id=7' }), article(7)],
        [
          article(2, { introtext: 'see id=7: option=com_content&view=article&id=8' }),
          { ...article(7), id: '8' }
        ]
      )
    }
  })
  assert.deepEqual(answer.items, [])
})

test('Joomla: a new article in a new category is two creates, the category first, the article naming it by placeholder', () => {
  const answer = changeset('joomla', {
    entities: { content: { base: [1], copy: [1, 3] }, categories: { base: [1, 2], copy: [1, 2, 9] } },
    kinds: {
      category: kind([category(2)], [category(2), category(9, { title: 'News' })], ['id'], {
        base: [{ id: '2', parent_id: '1', lft: '1', extension: 'com_content' }],
        copy: [
          { id: '2', parent_id: '1', lft: '1', extension: 'com_content' },
          { id: '9', parent_id: '1', lft: '3', extension: 'com_content' }
        ]
      }),
      article: kind([article(1)], [article(1), article(3, { title: 'Spring sale', catid: '9' })])
    }
  })
  const items = byId(answer)
  const cat = items['category:new:9']
  const art = items['article:new:3']
  assert.equal(cat.op, 'create')
  assert.equal(art.op, 'create')
  assert.deepEqual(art.write.catid, { $new: 'categories:9' })
  assert.deepEqual(art.dependsOn, ['category:new:9'])
  assert.equal(art.write.title, 'Spring sale')
  assert.equal(art.creates, 'content:3')
  assert.deepEqual(art.seed, [
    {
      table: 'content',
      match: { id: 3 },
      columns: art.seed[0].columns,
      create: true,
      entity: 'content',
      id: 3
    }
  ])
  // The category goes where the copy has it: under the root (parent placed on create), and last of its
  // siblings already, so no move is needed.
  assert.equal(cat.write.parent_id, '1')
  assert.ok(!Object.keys(items).some((id) => id.endsWith(':move')))
  assert.ok(answer.items.indexOf(cat) < answer.items.indexOf(art), 'the category is written first')
})

test('Joomla: a trashed article is a delete (checked against every field of the base); a removed one too', () => {
  const answer = changeset('joomla', {
    entities: { content: { base: [1, 2, 4], copy: [1, 2] } },
    kinds: {
      article: kind([article(1), article(2), article(4)], [article(1), article(2, { state: '-2' })])
    }
  })
  const items = byId(answer)
  assert.equal(items['article:2'].op, 'delete')
  assert.equal(items['article:2'].liveId, 2)
  assert.equal(items['article:2'].expect.title, 'Article 2')
  assert.equal(items['article:2'].expect.state, '1')
  assert.deepEqual(items['article:2'].seed, [{ table: 'content', match: { id: 2 }, columns: ['state'] }])
  // Gone from the copy: the live site's goes to its trash, and the next sync keeps the live row as base.
  assert.equal(items['article:4'].op, 'delete')
  assert.deepEqual(items['article:4'].seed, [{ table: 'content', match: { id: 4 }, rows: 'theirs' }])
  assert.equal(answer.hasDeletes, true)
})

test('Joomla: what the engine cannot write is named — a field outside its list, an article’s tags, a menu with no trash', () => {
  const answer = changeset('joomla', {
    entities: { content: { base: [1], copy: [1] }, tags: { base: [1, 5], copy: [1, 5] } },
    kinds: {
      article: kind(
        [article(1, { tags: '5' })],
        [article(1, { created_by_alias: 'Lee', tags: null, title: 'New title' })]
      ),
      menutype: kind(
        [{ id: '3', menutype: 'footer', title: 'Footer', description: '', client_id: '0' }],
        [],
        ['menutype']
      )
    }
  })
  const fields = answer.unsupported.filter((u) => u.what === 'field').map((u) => u.field)
  assert.deepEqual(fields.sort(), ['created_by_alias', 'tags'])
  assert.deepEqual(byId(answer)['article:1'].write, { title: 'New title' })
  assert.deepEqual(
    answer.unsupported.find((u) => u.what === 'record'),
    { what: 'record', kind: 'menutype', title: 'Footer', op: 'delete', reason: 'no-trash' }
  )
})

test('Joomla: menu items the copy reordered are moves, each after the sibling it follows on the copy', () => {
  const menu = (id, title) => ({
    id: String(id),
    title,
    menutype: 'mainmenu',
    parent_id: '1',
    published: '1',
    link: 'index.php?option=com_content&view=featured',
    lft: '0',
    rgt: '0',
    level: '1',
    path: title.toLowerCase(),
    client_id: '0'
  })
  const rows = [menu(101, 'Home'), menu(102, 'About'), menu(103, 'Contact')]
  const tree = (order) =>
    order.map((id, i) => ({ id: String(id), parent_id: '1', lft: String(i * 2 + 1), menutype: 'mainmenu' }))
  const answer = changeset('joomla', {
    entities: { menu: { base: [1, 101, 102, 103], copy: [1, 101, 102, 103] } },
    kinds: {
      menuItem: kind(rows, rows, ['id'], { base: tree([101, 102, 103]), copy: tree([101, 103, 102]) })
    }
  })
  const moves = answer.items.filter((i) => i.op === 'move')
  assert.deepEqual(
    moves.map((m) => [m.liveId, m.write]),
    [
      [103, { parent_id: 1, move_after: 101 }],
      [102, { parent_id: 1, move_after: 103 }]
    ]
  )
  assert.deepEqual(moves[0].expect, { parent_id: '1' })
})

test('Joomla: a new module and the pages it shows on — the assignment waits for the module', () => {
  const module = (id, fields = {}) => ({
    id: String(id),
    title: `Module ${id}`,
    note: '',
    content: '',
    position: 'sidebar-right',
    module: 'mod_custom',
    access: '1',
    showtitle: '1',
    params: '{}',
    published: '1',
    language: '*',
    ordering: '1',
    client_id: '0',
    asset_id: '0',
    ...fields
  })
  const answer = changeset('joomla', {
    entities: { modules: { base: [90], copy: [90, 91] }, menu: { base: [1, 101], copy: [1, 101] } },
    kinds: {
      module: kind([module(90)], [module(90), module(91, { title: 'Opening hours' })]),
      moduleAssignment: kind(
        [{ id: '90', title: 'Module 90', menuids: '[0]' }],
        [
          { id: '90', title: 'Module 90', menuids: '[101]' },
          { id: '91', title: 'Opening hours', menuids: '[101]' }
        ]
      )
    }
  })
  const items = byId(answer)
  assert.equal(items['module:new:91'].op, 'create')
  assert.deepEqual(items['moduleAssignment:90'].write, { menuids: [101] })
  assert.deepEqual(items['moduleAssignment:90'].expect, { menuids: '[0]' })
  const pages = items['moduleAssignment:new:91']
  assert.deepEqual(pages.ident, { $new: 'modules:91' })
  assert.deepEqual(pages.dependsOn, ['module:new:91'])
  assert.deepEqual(pages.seed, [{ table: 'modules_menu', match: { moduleid: 91 }, rows: 'ours' }])
})

test('Joomla: files — a new picture is an upload, the site name goes through site.identity, a template’s CSS is named, the environment is not', () => {
  const config = (settings) =>
    `<?php\nclass JConfig {\n${Object.entries(settings)
      .map(([k, v]) => `\tpublic $${k} = ${v};`)
      .join('\n')}\n}\n`
  const answer = changeset('joomla', {
    entities: {},
    kinds: {},
    files: {
      changes: [
        { path: 'images/banner.jpg', change: 'added', blob: 'a'.repeat(40), baseBlob: null, size: 1200 },
        {
          path: 'images/huge.png',
          change: 'added',
          blob: 'b'.repeat(40),
          baseBlob: null,
          size: 9 * 1024 * 1024
        },
        {
          path: 'templates/t4/css/custom.css',
          change: 'modified',
          blob: 'c'.repeat(40),
          baseBlob: 'd'.repeat(40),
          size: 10
        },
        {
          path: 'plugins/system/tracyaccess/tracyaccess.php',
          change: 'added',
          blob: 'e'.repeat(40),
          size: 10
        },
        {
          path: 'configuration.php',
          change: 'modified',
          blob: 'f'.repeat(40),
          baseBlob: '0'.repeat(40),
          size: 10
        }
      ],
      config: {
        base: config({ host: "'localhost'", password: "'live'", sitename: "'Shop'" }),
        copy: config({ host: "'db'", password: "'copy'", sitename: "'Shop & Co'" })
      }
    },
    tables: [{ what: 'table', table: 'extensions', rows: 1, names: ['mod_menu'] }]
  })
  assert.deepEqual(
    answer.items.map((i) => [i.op, i.group, i.path]),
    [
      ['upload', 'files', 'images/banner.jpg'],
      ['update', 'settings', 'configuration.php']
    ]
  )
  const identity = byId(answer)['setting:siteIdentity']
  assert.deepEqual(
    [identity.kind, identity.write, identity.expect],
    ['siteIdentity', { sitename: 'Shop & Co' }, { sitename: 'Shop' }]
  )
  const named = Object.fromEntries(
    answer.unsupported.map((u) => [u.path ?? u.name ?? u.table, u.reason ?? null])
  )
  assert.deepEqual(named, {
    extensions: null,
    'images/huge.png': 'too-large',
    'templates/t4/css/custom.css': 'engine-has-no-file-write'
  })
})

const fileChange = (path, change, extra = {}) => ({
  path,
  change,
  blob: change === 'deleted' ? null : `${path.length}`.padStart(40, 'a'),
  baseBlob: change === 'added' ? null : `${path.length}`.padStart(40, 'b'),
  size: 120,
  baseSize: 100,
  mode: change === 'deleted' ? null : '100644',
  baseMode: change === 'added' ? null : '100644',
  ...extra
})

test('Joomla phase 2: a template’s files under media/ go by their bytes, a PHP file waits for its own OK, what has no file door is named with why', () => {
  const answer = changeset('joomla', {
    entities: {},
    kinds: {},
    files: {
      changes: [
        fileChange('media/templates/site/cassiopeia/css/user.css', 'modified'),
        fileChange('media/templates/site/cassiopeia/js/user.js', 'added'),
        fileChange('media/templates/site/cassiopeia/php/helper.php', 'added'),
        fileChange('media/mod_custom/js/custom.js', 'added'),
        fileChange('images/old.png', 'deleted'),
        fileChange('media/templates/site/cassiopeia/css/gone.css', 'deleted'),
        fileChange('templates/ja_vega/html/com_content/article/default.php', 'modified'),
        fileChange('templates/ja_vega/css/custom.css', 'modified'),
        fileChange('media/t4/optimize/css/a.css', 'modified'),
        fileChange('.htaccess', 'modified'),
        fileChange('images/link.png', 'added', { mode: '120000' }),
        fileChange('media/com_claudecowork/x.js', 'modified')
      ],
      config: null
    }
  })
  const items = byId(answer)
  assert.deepEqual(
    answer.items.map((i) => [i.id, i.op, i.group]),
    [
      ['file:media/templates/site/cassiopeia/css/user.css', 'upload', 'files'],
      ['file:media/templates/site/cassiopeia/js/user.js', 'upload', 'files'],
      ['file:media/templates/site/cassiopeia/php/helper.php', 'upload', 'php'],
      ['file:images/old.png', 'delete', 'remove']
    ]
  )
  // Compared by the bytes: the live file must still be the base's one (none for a new file).
  assert.equal(items['file:media/templates/site/cassiopeia/css/user.css'].baseBlob.length, 40)
  assert.equal(items['file:media/templates/site/cassiopeia/js/user.js'].baseBlob, null)
  assert.equal(answer.hasPhp, true)
  assert.equal(answer.hasDeletes, true)
  assert.deepEqual([answer.counts.files, answer.counts.php, answer.counts.settings], [2, 1, 0])
  assert.deepEqual(Object.fromEntries(answer.unsupported.map((u) => [u.path, u.reason])), {
    'media/templates/site/cassiopeia/css/gone.css': 'engine-cannot-delete-file',
    'templates/ja_vega/html/com_content/article/default.php': 'engine-has-no-file-write',
    'templates/ja_vega/css/custom.css': 'engine-has-no-file-write',
    'media/t4/optimize/css/a.css': 'excluded',
    '.htaccess': 'server-config',
    'images/link.png': 'symlink',
    // An extension's own media goes with its extension, never alone.
    'media/mod_custom/js/custom.js': 'extension-file'
  })
  // The preview's answer: names and sizes of files, never their bytes.
  const file = join(root, `cs-${++n}.json`)
  writeFileSync(file, JSON.stringify(answer))
  const r = spawnSync('python3', [PUSH, 'answer', '--changeset', file, '--preview-id', 'p1'], {
    encoding: 'utf8'
  })
  const shown = JSON.parse(r.stdout.trim().split('\n').at(-1))
  const css = shown.items.find((i) => i.id === 'file:media/templates/site/cassiopeia/css/user.css')
  assert.deepEqual([css.group, css.path, css.size, css.change], ['files', css.path, 120, 'modified'])
  assert.equal(shown.hasPhp, true)
  assert.ok(!JSON.stringify(shown).includes('blob'), 'no blob in the answer')
})

test('Joomla phase 2: settings — site.identity, a template style’s params, a T4 site profile after the logo it names', () => {
  const config = (settings) =>
    `<?php\nclass JConfig {\n${Object.entries(settings)
      .map(([k, v]) => `\tpublic $${k} = ${v};`)
      .join('\n')}\n}\n`
  const style = (params, home = '1') => ({
    id: '9',
    template: 'ja_vega',
    client_id: '0',
    home,
    title: 'Vega - Default',
    params
  })
  const answer = changeset('joomla', {
    entities: {},
    kinds: {
      templateStyle: kind(
        [style('{"color":"#111","logo":"images/a.png"}')],
        [style('{"color":"#c33","logo":"images/a.png"}', '0')]
      )
    },
    files: {
      changes: [
        fileChange('images/logo-new.png', 'added'),
        fileChange('templates/ja_vega/local/etc/site/default.json', 'modified', {
          text: JSON.stringify({
            site_logo: 'images/logo-new.png',
            site_name: 'Shop & Co',
            custom: 'x',
            site_slogan: 'Fresh'
          }),
          baseText: JSON.stringify({
            site_logo: 'images/logo.png',
            site_name: 'Shop',
            custom: 'y',
            site_slogan: 'Fresh'
          }),
          framework: 't4'
        }),
        fileChange('templates/ja_vega/local/etc/site/tracy-favicon.json', 'added', {
          text: JSON.stringify({ other_shareImage: 'images/logo-new.png' }),
          framework: 't4'
        })
      ],
      config: {
        base: config({
          host: "'localhost'",
          sitename: "'Shop'",
          MetaDesc: "'Old words'",
          list_limit: '20',
          sitename_pagetitles: '0'
        }),
        copy: config({
          host: "'db'",
          sitename: "'Shop\\'s'",
          MetaDesc: "'New words'",
          list_limit: '30',
          sitename_pagetitles: '2'
        })
      }
    }
  })
  const items = byId(answer)
  const identity = items['setting:siteIdentity']
  assert.deepEqual(identity.write, { MetaDesc: 'New words', sitename: "Shop's", sitename_pagetitles: 2 })
  assert.deepEqual(identity.expect, { MetaDesc: 'Old words', sitename: 'Shop', sitename_pagetitles: 0 })
  assert.equal(identity.group, 'settings')
  const styleItem = items['templateStyle:9']
  assert.deepEqual([styleItem.kind, styleItem.group, styleItem.liveId], ['templateStyle', 'settings', 9])
  assert.deepEqual(styleItem.write, { params: '{"color":"#c33","logo":"images/a.png"}' })
  assert.deepEqual(styleItem.expect, { params: '{"color":"#111","logo":"images/a.png"}' })
  const profile = items['templateSettings:ja_vega:default']
  assert.deepEqual(profile.write, {
    template: 'ja_vega',
    profiles: { default: { site_logo: 'images/logo-new.png', site_name: 'Shop & Co' } }
  })
  assert.deepEqual(profile.expect, { site_logo: 'images/logo.png', site_name: 'Shop' })
  // The logo it names is uploaded first, in the same push.
  assert.deepEqual(profile.dependsOn, ['file:images/logo-new.png'])
  const share = items['templateSettings:ja_vega:tracy-favicon']
  assert.deepEqual(share.write, { template: 'ja_vega', fields: { other_shareImage: 'images/logo-new.png' } })
  assert.deepEqual(share.expect, { other_shareImage: '' })
  assert.ok(
    answer.items.findIndex((i) => i.id === 'file:images/logo-new.png') <
      answer.items.findIndex((i) => i.id === 'templateSettings:ja_vega:default')
  )
  const named = answer.unsupported.map((u) => [u.what, u.name ?? u.field ?? u.path, u.reason ?? null])
  assert.deepEqual(named.sort(), [
    ['field', 'home', null],
    ['setting', 'custom', 'no-safe-action'],
    ['setting', 'list_limit', 'no-safe-action']
  ])
})

test('Joomla phase 2: a file or a setting a sync kept as the copy’s while the customer changed it too is never sent', () => {
  const config = (name) => `<?php\nclass JConfig {\n\tpublic $sitename = '${name}';\n}\n`
  const answer = changeset(
    'joomla',
    {
      entities: {},
      kinds: {},
      files: {
        changes: [fileChange('media/templates/site/cassiopeia/css/user.css', 'modified')],
        config: { base: config('Shop'), copy: config('Shop & Co') }
      }
    },
    [
      {
        id: 'file:media/templates/site/cassiopeia/css/user.css',
        kind: 'file',
        path: 'media/templates/site/cassiopeia/css/user.css',
        reason: 'both-changed'
      },
      {
        id: 'file:configuration.php#sitename',
        kind: 'setting',
        path: 'configuration.php',
        setting: 'sitename'
      }
    ]
  )
  assert.deepEqual(
    answer.items.map((i) => [i.id, i.conflict]),
    [
      ['file:media/templates/site/cassiopeia/css/user.css', { reason: 'changed-on-both', fields: ['file'] }],
      ['setting:siteIdentity', { reason: 'changed-on-both', fields: ['Site Name'] }]
    ]
  )
})

test('Joomla: a menu both sides renamed since the last sync is a conflict — the sync names it by number, the push by its menutype', () => {
  const menu = (id, menutype, title) => ({ id: String(id), menutype, title, description: '', client_id: '0' })
  const answer = changeset(
    'joomla',
    {
      entities: {},
      kinds: {
        menutype: kind(
          [menu(3, 'footer', 'Footer'), menu(4, 'mainmenu', 'Main Menu')],
          [menu(3, 'footer', 'Footer links'), menu(4, 'mainmenu', 'Main')],
          ['menutype']
        )
      },
      // What the copy holds under each number the kept places name (the reader's `kept_names`).
      keptNames: { menu_types: [{ id: '3', menutype: 'footer', client_id: '0' }] }
    },
    [
      {
        id: 'db:jos_menu_types:["3"]:title',
        kind: 'column',
        table: 'jos_menu_types',
        column: 'title',
        key: { id: '3' }
      },
      // A number the copy no longer holds names nothing.
      {
        id: 'db:jos_menu_types:["9"]:title',
        kind: 'column',
        table: 'jos_menu_types',
        column: 'title',
        key: { id: '9' }
      }
    ]
  )
  assert.deepEqual(
    answer.items.map((i) => [i.id, i.conflict ?? null]),
    [
      ['menutype:footer', { reason: 'changed-on-both', fields: ['title'] }],
      ['menutype:mainmenu', null]
    ]
  )
})

// ── WordPress ────────────────────────────────────────────────────────────────────────────────
const HOMES = ['https://shop.example', 'https://shop-com.tracy.ai']
const post = (id, fields = {}) => ({
  ID: String(id),
  post_type: 'page',
  post_title: `Page ${id}`,
  post_name: `page-${id}`,
  post_content: `<p>Page ${id}</p>`,
  post_excerpt: '',
  post_status: 'publish',
  post_parent: '0',
  menu_order: '0',
  post_date: '2026-01-01 00:00:00',
  post_modified: '2026-01-01 00:00:00',
  guid: `https://shop.example/?page_id=${id}`,
  categories: null,
  tags: null,
  category_slugs: null,
  tag_slugs: null,
  tag_names: null,
  ...fields
})

test('WordPress: an edited page is written with the live address; the address alone is no change', () => {
  const answer = changeset('wordpress', {
    homes: HOMES,
    entities: { posts: { base: [10, 11], copy: [10, 11] } },
    kinds: {
      post: kind(
        [
          post(10, { post_content: '<img src="https://shop.example/wp-content/uploads/a.jpg">' }),
          post(11, { post_content: '<a href="https://shop.example/menu">Menu</a>' })
        ],
        [
          post(10, {
            post_title: 'About our bakery',
            post_content: '<img src="https://shop-com.tracy.ai/wp-content/uploads/a.jpg"><p>New</p>',
            guid: 'https://shop-com.tracy.ai/?page_id=10'
          }),
          post(11, { post_content: '<a href="https://shop-com.tracy.ai/menu">Menu</a>' })
        ],
        ['ID']
      )
    }
  })
  assert.deepEqual(
    answer.items.map((i) => i.id),
    ['post:10']
  )
  const item = answer.items[0]
  assert.deepEqual(item.write, {
    post_title: 'About our bakery',
    post_content: '<img src="https://shop.example/wp-content/uploads/a.jpg"><p>New</p>'
  })
  assert.equal(item.expect.post_content, '<img src="https://shop.example/wp-content/uploads/a.jpg">')
  assert.equal(item.bodyRevision, true)
})

test('WordPress: the site title is an option write; a theme’s serialized settings are named, not written', () => {
  const opt = (name, value) => ({ option_name: name, value })
  const answer = changeset('wordpress', {
    homes: HOMES,
    entities: {},
    kinds: {
      option: kind([opt('blogname', 'Shop')], [opt('blogname', 'Shop & Bakery')], ['option_name']),
      optionOther: kind(
        [opt('theme_mods_astra', 'a:1:{s:4:"logo";i:5;}')],
        [opt('theme_mods_astra', 'a:1:{s:4:"logo";i:6;}')],
        ['option_name']
      )
    }
  })
  assert.deepEqual(
    answer.items.map((i) => [i.id, i.title, i.key, i.write]),
    [['option:blogname', 'Site title', 'blogname', { value: 'Shop & Bakery' }]]
  )
  assert.deepEqual(answer.unsupported, [
    {
      what: 'setting',
      table: 'options',
      name: 'theme_mods_astra',
      change: 'modified',
      reason: 'no-safe-action'
    }
  ])
})

test('WordPress: wp-config.php that differs is read past its environment; a changed setting is named, never written (wp-tracy-ai, 24/10)', () => {
  const wpConfig = (host, debug, extra = '') =>
    `<?php\n// a comment with define('NOT_ME', 1);\ndefine( 'DB_NAME', 'wp' );\ndefine( 'DB_HOST', '${host}' );\ndefine( 'WP_DEBUG', ${debug} );\n${extra}$table_prefix = 'wp_';\nrequire_once ABSPATH . 'wp-settings.php';\n`
  const answer = changeset('wordpress', {
    homes: HOMES,
    entities: {},
    kinds: {},
    files: {
      changes: [],
      config: {
        base: wpConfig('localhost', 'false'),
        copy: wpConfig('db', 'true', "define( 'DISALLOW_FILE_EDIT', true );\n")
      }
    }
  })
  assert.deepEqual(answer.items, [])
  assert.deepEqual(
    answer.unsupported.filter((u) => u.what === 'setting').map((u) => [u.file, u.name, u.reason]),
    [
      ['wp-config.php', 'DISALLOW_FILE_EDIT', 'no-safe-action'],
      ['wp-config.php', 'WP_DEBUG', 'no-safe-action']
    ]
  )
})

test('WordPress phase 2: the active theme’s mods key by key, compared whole; Additional CSS; the site icon; permalinks never', () => {
  const opt = (name, value) => ({ option_name: name, value })
  const mods = (logo, color, menu) =>
    `a:4:{i:0;b:0;s:11:"custom_logo";i:${logo};s:16:"header_textcolor";s:${color.length}:"${color}";s:18:"nav_menu_locations";a:1:{s:7:"primary";i:${menu};}}`
  const answer = changeset('wordpress', {
    homes: HOMES,
    // The copy numbered the live site's menu 2 as 9 in a sync; the new logo (70) is the copy's alone.
    idMap: { terms: { 2: 9 } },
    entities: { posts: { base: [10, 50], copy: [10, 50, 70] }, terms: { base: [2], copy: [9] } },
    files: { changes: [fileChange('wp-content/uploads/2026/10/logo.png', 'added')], config: null },
    kinds: {
      attachment: kind([], [{ ID: '70', post_title: 'logo', file: '2026/10/logo.png' }], ['ID']),
      themeMods: kind(
        [opt('theme_mods_astra', mods(50, 'ffffff', 2))],
        [opt('theme_mods_astra', mods(70, '222222', 9))],
        ['option_name']
      ),
      customCss: kind(
        [
          {
            ID: '30',
            post_name: 'astra',
            post_title: 'astra',
            post_status: 'publish',
            post_type: 'custom_css',
            post_content: '.a{}'
          }
        ],
        [
          {
            ID: '30',
            post_name: 'astra',
            post_title: 'astra',
            post_status: 'publish',
            post_type: 'custom_css',
            post_content: '.a{color:red;background:url(https://shop-com.tracy.ai/x.png)}'
          }
        ],
        ['ID']
      ),
      option: kind([opt('site_icon', '50')], [opt('site_icon', '70')], ['option_name']),
      optionOther: kind(
        [opt('permalink_structure', '/%postname%/')],
        [opt('permalink_structure', '/%year%/%postname%/')],
        ['option_name']
      )
    }
  })
  const items = byId(answer)
  const theme = items['option:theme_mods_astra']
  assert.equal(theme.group, 'settings')
  // The live site's value with Tracy's keys set: the new logo by the number the upload gives it, the menu by the live site's.
  assert.deepEqual(theme.write, {
    value: {
      0: false,
      custom_logo: { $new: 'posts:70' },
      header_textcolor: '222222',
      nav_menu_locations: { primary: 2 }
    }
  })
  assert.deepEqual(theme.expect, {
    value: { 0: false, custom_logo: 50, header_textcolor: 'ffffff', nav_menu_locations: { primary: 2 } }
  })
  assert.deepEqual(Object.keys(theme.fields).sort(), ['custom_logo', 'header_textcolor'])
  assert.deepEqual(theme.dependsOn, ['media:new:70'])
  const css = items['customCss:30']
  assert.deepEqual([css.kind, css.group, css.bodyRevision], ['post', 'settings', true])
  assert.deepEqual(css.write, { post_content: '.a{color:red;background:url(https://shop.example/x.png)}' })
  assert.deepEqual(css.expect, { post_content: '.a{}' })
  assert.deepEqual(items['option:site_icon'].write, { value: { $new: 'posts:70' } })
  assert.equal(items['media:new:70'].group, 'files')
  assert.deepEqual(answer.unsupported, [
    {
      what: 'setting',
      table: 'options',
      name: 'Permalink structure',
      change: 'modified',
      reason: 'permalink',
      // The dialog says it in the Owner's language by this name (`push.label.permalink_structure`).
      label: 'permalink_structure'
    }
  ])
})

test('WordPress phase 2: a picture the Media Library has is replaced by its bytes; a theme file and a loose upload are named', () => {
  const answer = changeset('wordpress', {
    homes: HOMES,
    entities: {},
    kinds: {},
    attached: ['2026/10/cake.jpg'],
    files: {
      changes: [
        fileChange('wp-content/uploads/2026/10/cake.jpg', 'modified'),
        fileChange('wp-content/uploads/2026/10/cake-300x200.jpg', 'modified'),
        fileChange('wp-content/uploads/notes.txt', 'modified'),
        fileChange('wp-content/themes/astra-child/style.css', 'modified'),
        fileChange('wp-content/themes/astra-child/functions.php', 'modified')
      ],
      config: null
    }
  })
  assert.deepEqual(
    answer.items.map((i) => [i.id, i.op, i.group]),
    [['file:wp-content/uploads/2026/10/cake.jpg', 'upload', 'files']]
  )
  assert.deepEqual(Object.fromEntries(answer.unsupported.map((u) => [u.path, u.reason])), {
    'wp-content/uploads/notes.txt': 'not-a-media-item',
    'wp-content/themes/astra-child/style.css': 'engine-has-no-file-write',
    'wp-content/themes/astra-child/functions.php': 'engine-has-no-file-write'
  })
})

test('PHP files: linted on the live site’s PHP from the copy’s bytes; one that does not pass is named, not offered', () => {
  const answer = changeset('joomla', {
    entities: {},
    kinds: {},
    files: {
      changes: [
        fileChange('media/templates/site/a/ok.php', 'added'),
        fileChange('media/templates/site/a/broken.php', 'added')
      ],
      config: null
    }
  })
  const file = join(root, `lint-${++n}.json`)
  writeFileSync(file, JSON.stringify(answer))
  // A stand-in lint that reads nothing from a repo: the blob is resolved through git, so give it one.
  const repo = join(root, `repo-${n}`)
  spawnSync('git', ['init', '-q', '--bare', repo])
  const blob = (text) =>
    spawnSync('git', ['--git-dir', repo, 'hash-object', '-w', '--stdin'], {
      input: text,
      encoding: 'utf8'
    }).stdout.trim()
  answer.items[0].blob = blob('<?php echo 1;\n')
  answer.items[1].blob = blob('<?php echo (;\n')
  writeFileSync(file, JSON.stringify(answer))
  const lintCmd = JSON.stringify(['sh', '-c', 'grep -q "(;" && exit 255 || exit 0'])
  const r = spawnSync('python3', [PUSH, 'lint', '--changeset', file, '--repo', repo, '--php', '8.2'], {
    encoding: 'utf8',
    env: { ...process.env, TRACY_PHP_LINT: lintCmd }
  })
  assert.equal(r.status, 0, r.stderr)
  const linted = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(
    linted.items.map((i) => [i.path, i.lint]),
    [['media/templates/site/a/ok.php', { ok: true, php: '8.2' }]]
  )
  assert.deepEqual(
    linted.unsupported.map((u) => [u.path, u.reason, u.php]),
    [['media/templates/site/a/broken.php', 'php-lint-failed', '8.2']]
  )
  // No PHP image for the live site's version: nothing is offered, each is named.
  writeFileSync(file, JSON.stringify(answer))
  const env = { ...process.env }
  delete env.TRACY_PHP_LINT
  spawnSync('python3', [PUSH, 'lint', '--changeset', file, '--repo', repo, '--php', '5.6'], {
    encoding: 'utf8',
    env
  })
  assert.deepEqual(
    JSON.parse(readFileSync(file, 'utf8')).unsupported.map((u) => u.reason),
    ['php-lint-unavailable', 'php-lint-unavailable']
  )
})

/** The live engine with its template door (`live-write.mjs info` → `templateFiles`). */
const templateDoor = (roots, extra = {}) => ({
  version: '0.24.60',
  php: '8.2.20',
  templateFiles: {
    enabled: true,
    php: false,
    maxFileBytes: 2097152,
    maxBytes: 8388608,
    maxFiles: 100,
    roots,
    ...extra
  }
})
const JOOMLA_ROOTS = [
  { path: 'templates/ja_vega', kind: 'template', name: 'ja_vega', php: true },
  { path: 'media/templates/site/ja_vega', kind: 'template-media', name: 'ja_vega', php: false },
  { path: 'templates/cassiopeia', kind: 'template', name: 'cassiopeia', php: true }
]
const reasons = (answer) => Object.fromEntries(answer.unsupported.map((u) => [u.path, u.reason]))

test('template files, Joomla T4: the template’s CSS, JSON and removals go through the template door; PHP waits for the site’s switch; what the door does not take is named', () => {
  const changes = [
    fileChange('templates/ja_vega/css/custom.css', 'modified'),
    fileChange('templates/ja_vega/local/etc/theme/default.json', 'added'),
    fileChange('templates/ja_vega/css/old.css', 'deleted'),
    fileChange('templates/ja_vega/html/com_content/article/default.php', 'modified'),
    fileChange('templates/ja_vega/templateDetails.xml', 'modified'),
    fileChange('templates/ja_vega/.cache/a.css', 'modified'),
    fileChange('templates/ja_vega/css/big.css', 'modified', { size: 3 * 1024 * 1024 }),
    fileChange('templates/ja_purity/css/a.css', 'modified'),
    fileChange('media/templates/site/ja_vega/css/user.css', 'modified'),
    // A template's media folder never takes PHP through the template door: phase 2's media.upload.
    fileChange('media/templates/site/ja_vega/php/helper.php', 'added'),
    // A template the live site has as no root (not installed there): phase 2's media.upload still.
    fileChange('media/templates/site/t4_blank/css/a.css', 'modified'),
    fileChange('administrator/templates/atum/css/a.css', 'modified')
  ]
  const answer = changeset('joomla', {
    entities: {},
    kinds: {},
    engine: templateDoor(JOOMLA_ROOTS),
    files: { changes, config: null }
  })
  const items = byId(answer)
  assert.deepEqual(
    answer.items.map((i) => [i.id, i.op, i.group, i.door ?? null]),
    [
      ['file:templates/ja_vega/css/custom.css', 'upload', 'files', 'template'],
      ['file:templates/ja_vega/local/etc/theme/default.json', 'upload', 'files', 'template'],
      ['file:media/templates/site/ja_vega/css/user.css', 'upload', 'files', 'template'],
      ['file:media/templates/site/ja_vega/php/helper.php', 'upload', 'php', null],
      ['file:media/templates/site/t4_blank/css/a.css', 'upload', 'files', null],
      ['file:templates/ja_vega/css/old.css', 'delete', 'remove', 'template']
    ]
  )
  // Checked by the base's blob: the live file must still be the one the last sync read (none for a new one).
  assert.equal(items['file:templates/ja_vega/css/custom.css'].baseBlob.length, 40)
  assert.equal(items['file:templates/ja_vega/local/etc/theme/default.json'].baseBlob, null)
  assert.equal(items['file:templates/ja_vega/css/custom.css'].root, 'templates/ja_vega')
  assert.deepEqual(reasons(answer), {
    'templates/ja_vega/html/com_content/article/default.php': 'php-disabled',
    'templates/ja_vega/templateDetails.xml': 'not-a-template-file',
    'templates/ja_vega/.cache/a.css': 'not-a-template-file',
    'templates/ja_vega/css/big.css': 'too-large',
    'templates/ja_purity/css/a.css': 'not-a-live-template',
    'administrator/templates/atum/css/a.css': 'engine-has-no-file-write'
  })
  const big = answer.unsupported.find((u) => u.path === 'templates/ja_vega/css/big.css')
  assert.deepEqual([big.size, big.limit], [3 * 1024 * 1024, 2097152])
  // The writer's batches keep to the door's limits.
  assert.deepEqual(answer.templateFiles, { maxFileBytes: 2097152, maxBytes: 8388608, maxFiles: 100 })
  assert.equal(answer.hasDeletes, true)
  assert.deepEqual([answer.counts.files, answer.counts.php], [4, 1])

  // The owner allowed PHP in template files: the override goes, in the PHP group (linted, its own OK).
  const allowed = changeset('joomla', {
    entities: {},
    kinds: {},
    engine: templateDoor(JOOMLA_ROOTS, { php: true }),
    files: { changes, config: null }
  })
  const override = byId(allowed)['file:templates/ja_vega/html/com_content/article/default.php']
  assert.deepEqual(
    [override.op, override.group, override.door, override.php],
    ['upload', 'php', 'template', true]
  )
  assert.equal(allowed.hasPhp, true)
  assert.ok(!('templates/ja_vega/html/com_content/article/default.php' in reasons(allowed)))
})

test('template files: no door on the live engine keeps phase 2’s listing; the door switched off says so', () => {
  const changes = [
    fileChange('templates/ja_vega/css/custom.css', 'modified'),
    fileChange('media/templates/site/ja_vega/css/user.css', 'modified')
  ]
  const older = changeset('joomla', {
    entities: {},
    kinds: {},
    engine: { version: '0.24.54', php: '8.2.20', templateFiles: null },
    files: { changes, config: null }
  })
  assert.deepEqual(reasons(older), { 'templates/ja_vega/css/custom.css': 'engine-has-no-file-write' })
  assert.deepEqual(
    older.items.map((i) => [i.id, i.door ?? null]),
    [['file:media/templates/site/ja_vega/css/user.css', null]]
  )
  assert.equal(older.templateFiles, undefined)
  const off = changeset('joomla', {
    entities: {},
    kinds: {},
    engine: { version: '0.24.60', templateFiles: { enabled: false } },
    files: { changes, config: null }
  })
  assert.deepEqual(reasons(off), { 'templates/ja_vega/css/custom.css': 'template-files-off' })
  // `media/templates/` still goes the way phase 2 sends it (media.upload).
  assert.deepEqual(
    off.items.map((i) => [i.id, i.door ?? null]),
    [['file:media/templates/site/ja_vega/css/user.css', null]]
  )
})

test('template files: a T4 profile with keys `template.siteSettings` does not write goes whole through the template door', () => {
  const profile = (extra) =>
    fileChange('templates/ja_vega/local/etc/site/default.json', 'modified', {
      text: JSON.stringify({ site_name: 'Shop & Co', ...extra }),
      baseText: JSON.stringify({ site_name: 'Shop', custom: 'y' }),
      framework: 't4'
    })
  const whole = changeset('joomla', {
    entities: {},
    kinds: {},
    engine: templateDoor(JOOMLA_ROOTS),
    files: { changes: [profile({ custom: 'x' })], config: null }
  })
  assert.deepEqual(
    whole.items.map((i) => [i.id, i.door]),
    [['file:templates/ja_vega/local/etc/site/default.json', 'template']]
  )
  assert.deepEqual(whole.unsupported, [])
  // Only the keys the settings door writes: still that door, compared key by key.
  const keys = changeset('joomla', {
    entities: {},
    kinds: {},
    engine: templateDoor(JOOMLA_ROOTS),
    files: { changes: [profile({ custom: 'y' })], config: null }
  })
  assert.deepEqual(
    keys.items.map((i) => i.id),
    ['templateSettings:ja_vega:default']
  )
})

test('template files, WordPress: a child theme’s CSS goes, its parent’s with a warning, PHP waits for the switch, another theme is named', () => {
  const answer = changeset('wordpress', {
    homes: HOMES,
    entities: {},
    kinds: {},
    attached: [],
    engine: templateDoor([
      { path: 'wp-content/themes/astra-child', kind: 'theme', name: 'astra-child', php: true },
      { path: 'wp-content/themes/astra', kind: 'parent-theme', name: 'astra', php: true }
    ]),
    files: {
      changes: [
        fileChange('wp-content/themes/astra-child/style.css', 'modified'),
        fileChange('wp-content/themes/astra-child/assets/new.js', 'added'),
        fileChange('wp-content/themes/astra/assets/css/main.css', 'modified'),
        fileChange('wp-content/themes/astra-child/functions.php', 'modified'),
        fileChange('wp-content/themes/twentytwentyfive/style.css', 'modified'),
        fileChange('wp-content/plugins/elementor/a.css', 'modified')
      ],
      config: null
    }
  })
  assert.deepEqual(
    answer.items.map((i) => [i.id, i.op, i.group, i.warning ?? null]),
    [
      ['file:wp-content/themes/astra-child/style.css', 'upload', 'files', null],
      ['file:wp-content/themes/astra-child/assets/new.js', 'upload', 'files', null],
      ['file:wp-content/themes/astra/assets/css/main.css', 'upload', 'files', 'parent-theme']
    ]
  )
  assert.deepEqual(reasons(answer), {
    'wp-content/themes/astra-child/functions.php': 'php-disabled',
    'wp-content/themes/twentytwentyfive/style.css': 'not-a-live-template',
    'wp-content/plugins/elementor/a.css': 'engine-has-no-file-write'
  })
  // The preview's answer carries the warning, never a blob.
  const file = join(root, `cs-${++n}.json`)
  writeFileSync(file, JSON.stringify(answer))
  const r = spawnSync('python3', [PUSH, 'answer', '--changeset', file, '--preview-id', 'p1'], {
    encoding: 'utf8'
  })
  const shown = JSON.parse(r.stdout.trim().split('\n').at(-1))
  const parent = shown.items.find((i) => i.id === 'file:wp-content/themes/astra/assets/css/main.css')
  assert.deepEqual([parent.group, parent.warning, parent.size], ['files', 'parent-theme', 120])
  assert.ok(!JSON.stringify(shown).includes('blob'), 'no blob in the answer')
  // With PHP allowed on the live site: functions.php in the PHP group.
  const allowed = changeset('wordpress', {
    homes: HOMES,
    entities: {},
    kinds: {},
    attached: [],
    engine: templateDoor(
      [{ path: 'wp-content/themes/astra-child', kind: 'theme', name: 'astra-child', php: true }],
      {
        php: true
      }
    ),
    files: { changes: [fileChange('wp-content/themes/astra-child/functions.php', 'modified')], config: null }
  })
  assert.deepEqual(
    allowed.items.map((i) => [i.id, i.group, i.door]),
    [['file:wp-content/themes/astra-child/functions.php', 'php', 'template']]
  )
})

test('template files: after a push the files it sent join pushed.json like phase 2’s, so the next Sync from live takes the live site’s; after Undo the copy’s', () => {
  const answer = changeset('joomla', {
    entities: {},
    kinds: {},
    engine: templateDoor(JOOMLA_ROOTS),
    files: {
      changes: [
        fileChange('templates/ja_vega/css/custom.css', 'modified'),
        fileChange('templates/ja_vega/css/old.css', 'deleted')
      ],
      config: null
    }
  })
  const dir = mkdtempSync(join(root, 'record-'))
  const cs = join(dir, 'changeset.json')
  writeFileSync(cs, JSON.stringify(answer))
  const written = { written: answer.items.map((i) => ({ id: i.id })), created: {} }
  writeFileSync(join(dir, 'written.json'), JSON.stringify(written))
  const record = (...extra) => {
    const r = spawnSync(
      'python3',
      [
        PUSH,
        'record',
        '--changeset',
        cs,
        '--result',
        join(dir, 'written.json'),
        '--id-map',
        join(dir, 'id-map.json'),
        '--pushed',
        join(dir, 'pushed.json'),
        ...extra
      ],
      { encoding: 'utf8' }
    )
    assert.equal(r.status, 0, r.stderr)
    return JSON.parse(readFileSync(join(dir, 'pushed.json'), 'utf8'))
  }
  const blob = byId(answer)['file:templates/ja_vega/css/custom.css'].blob
  assert.deepEqual(record().files, [
    { path: 'templates/ja_vega/css/custom.css', ours: blob, side: 'ours' },
    { path: 'templates/ja_vega/css/old.css', ours: null, side: 'ours' }
  ])
  writeFileSync(join(dir, 'written.json'), JSON.stringify({ restored: written.written }))
  assert.deepEqual(record('--undo').files, [
    { path: 'templates/ja_vega/css/custom.css', ours: blob, side: 'theirs' },
    { path: 'templates/ja_vega/css/old.css', ours: null, side: 'theirs' }
  ])
})

test('WordPress: a new page with a new picture, a new category and a menu entry — each waits for what it names', () => {
  const answer = changeset('wordpress', {
    homes: HOMES,
    entities: {
      posts: { base: [10, 50], copy: [10, 50, 60, 61, 62] },
      terms: { base: [1, 2], copy: [1, 2, 7] }
    },
    files: {
      changes: [
        { path: 'wp-content/uploads/2026/10/cake.jpg', change: 'added', blob: 'a'.repeat(40), size: 5000 },
        {
          path: 'wp-content/uploads/2026/10/cake-300x200.jpg',
          change: 'added',
          blob: 'b'.repeat(40),
          size: 500
        }
      ],
      config: null
    },
    kinds: {
      term: kind(
        [{ term_id: '2', taxonomy: 'nav_menu', name: 'Main', slug: 'main', description: '', parent: '0' }],
        [
          { term_id: '2', taxonomy: 'nav_menu', name: 'Main', slug: 'main', description: '', parent: '0' },
          { term_id: '7', taxonomy: 'category', name: 'Cakes', slug: 'cakes', description: '', parent: '0' }
        ],
        ['term_id', 'taxonomy']
      ),
      attachment: kind([], [{ ID: '60', post_title: 'cake', file: '2026/10/cake.jpg' }], ['ID']),
      post: kind(
        [post(10)],
        [
          post(10),
          post(61, {
            post_type: 'post',
            post_title: 'Our cakes',
            post_content:
              '<!-- wp:image {"id":60} --><img src="https://shop-com.tracy.ai/wp-content/uploads/2026/10/cake.jpg" class="wp-image-60"/>',
            categories: '7',
            category_slugs: 'cakes'
          })
        ],
        ['ID']
      ),
      menuItem: kind(
        [],
        [
          {
            ID: '62',
            title: '',
            position: '3',
            type: 'post_type',
            object: 'post',
            object_id: '61',
            url: '',
            parent: '0',
            menu: 'main'
          }
        ],
        ['ID']
      ),
      postmeta: kind(
        [],
        [{ post_id: '61', meta_key: '_thumbnail_id', value: '60', post_title: 'Our cakes' }],
        ['post_id', 'meta_key']
      )
    }
  })
  const items = byId(answer)
  assert.deepEqual(Object.keys(items).sort(), [
    'media:new:60',
    'menuItem:new:62',
    'post:new:61',
    'postmeta:61:_thumbnail_id',
    'term:new:7:category'
  ])
  // The picture first (its sizes are WordPress's to make again), the category, the post, the meta, the menu.
  assert.equal(answer.items[0].id, 'media:new:60')
  assert.equal(items['media:new:60'].path, 'wp-content/uploads/2026/10/cake.jpg')
  const created = items['post:new:61']
  assert.deepEqual(created.write.categories, ['cakes'])
  assert.equal(
    created.write.post_content,
    '<!-- wp:image {"id":@@tracy-new:posts:60@@} --><img src="https://shop.example/wp-content/uploads/2026/10/cake.jpg" class="wp-image-@@tracy-new:posts:60@@"/>'
  )
  assert.deepEqual(created.dependsOn.sort(), ['media:new:60', 'term:new:7:category'])
  assert.deepEqual(items['postmeta:61:_thumbnail_id'].write, { value: { $new: 'posts:60' } })
  assert.deepEqual(items['postmeta:61:_thumbnail_id'].ident, { $new: 'posts:61' })
  assert.deepEqual(items['postmeta:61:_thumbnail_id'].dependsOn.sort(), ['media:new:60', 'post:new:61'])
  assert.equal(items['menuItem:new:62'].key, 'main')
  assert.deepEqual(items['menuItem:new:62'].write.object_id, { $new: 'posts:61' })
  assert.ok(
    !answer.unsupported.some((u) => u.path?.includes('300x200')),
    'a size of the picture is not named'
  )
})

test('WordPress: a post put in another category writes slugs and checks the live site’s category ids', () => {
  const answer = changeset('wordpress', {
    homes: HOMES,
    entities: { posts: { base: [10], copy: [10] }, terms: { base: [1, 3], copy: [1, 3] } },
    kinds: {
      post: kind(
        [post(10, { post_type: 'post', categories: '1', category_slugs: 'uncategorized' })],
        [post(10, { post_type: 'post', categories: '3', category_slugs: 'news' })],
        ['ID']
      )
    }
  })
  const item = answer.items[0]
  assert.deepEqual(item.write, { categories: ['news'] })
  assert.deepEqual(item.expect, { post_category: [1] })
  assert.deepEqual(item.seed[1], { table: 'term_relationships', match: { object_id: 10 }, rows: 'ours' })
})

test('WordPress: a menu entry both sides changed since the last sync is a conflict, its address named by the meta’s number; a new option goes only where the live site has none', () => {
  const entry = (id, fields = {}) => ({
    ID: String(id),
    title: `Entry ${id}`,
    position: '1',
    type: 'custom',
    object: 'custom',
    object_id: String(id),
    url: `https://shop.example/e${id}/`,
    parent: '0',
    menu: 'main',
    ...fields
  })
  const opt = (name, value) => ({ option_name: name, value })
  const answer = changeset(
    'wordpress',
    {
      homes: HOMES,
      entities: { posts: { base: [20, 21], copy: [20, 21] } },
      kinds: {
        menuItem: kind(
          [entry(20, { title: 'Shop' }), entry(21)],
          [
            entry(20, { title: 'Our shop', url: 'https://shop-com.tracy.ai/store/' }),
            entry(21, { title: 'Entry 21 by Tracy' })
          ],
          ['ID']
        ),
        option: kind(
          [opt('blogname', 'Shop')],
          [opt('blogname', 'Shop'), opt('timezone_string', 'Europe/Rome')],
          ['option_name']
        )
      },
      keptNames: {
        postmeta: [
          { meta_id: '77', post_id: '20', meta_key: '_menu_item_url' },
          { meta_id: '78', post_id: '21', meta_key: '_menu_item_url' }
        ]
      }
    },
    [
      {
        id: 'db:wp_posts:["20"]:post_title',
        kind: 'column',
        table: 'wp_posts',
        column: 'post_title',
        key: { ID: '20' }
      },
      {
        id: 'db:wp_postmeta:["77"]:meta_value',
        kind: 'column',
        table: 'wp_postmeta',
        column: 'meta_value',
        key: { meta_id: '77' }
      },
      // The customer changed entry 21's address, Tracy only its title: nothing of it clashes.
      {
        id: 'db:wp_postmeta:["78"]:meta_value',
        kind: 'column',
        table: 'wp_postmeta',
        column: 'meta_value',
        key: { meta_id: '78' }
      }
    ]
  )
  const items = Object.fromEntries(answer.items.map((i) => [i.id, i]))
  assert.deepEqual(items['menuItem:20'].conflict, { reason: 'changed-on-both', fields: ['title', 'url'] })
  assert.equal(items['menuItem:21'].conflict, undefined)
  // An option the base did not hold: the writer reads it first, and one the customer added since stays theirs.
  assert.deepEqual(items['option:timezone_string'].expect, { $absent: true })
  assert.equal(items['option:timezone_string'].op, 'create')
})

test('WordPress: only a delete freeing the same page slug and parent precedes its replacement', () => {
  for (const [oldFields, nextFields, replaces] of [
    [{}, {}, true],
    [{}, { post_parent: '99' }, false],
    [{ post_type: 'post' }, {}, false],
    [{}, { post_name: 'another' }, false]
  ]) {
    const answer = changeset('wordpress', {
      homes: HOMES,
      entities: { posts: { base: [10], copy: [20] } },
      kinds: {
        post: kind(
          [post(10, { post_name: 'about', ...oldFields })],
          [post(20, { post_name: 'about', ...nextFields })],
          ['ID']
        )
      }
    })
    const removed = answer.items.find((i) => i.op === 'delete')
    const created = answer.items.find((i) => i.op === 'create')
    assert.ok(removed && created, JSON.stringify(answer))
    assert.equal(created.dependsOn.includes(removed.id), replaces)
    if (replaces) {
      assert.deepEqual(created.replaces, [removed.id])
      assert.ok(answer.items.indexOf(removed) < answer.items.indexOf(created))
    }
  }
})

test('Joomla: a replacement alias held by trash conflicts both records before the original is removed', () => {
  const answer = changeset('joomla', {
    entities: { content: { base: [1], copy: [2] } },
    kinds: { article: kind([article(1, { alias: 'about' })], [article(2, { alias: 'about' })]) }
  })
  assert.equal(answer.items.length, 2)
  for (const item of answer.items)
    assert.deepEqual(item.conflict, { reason: 'changed-on-live', fields: ['alias'] })
})

test('a whole table kept after a schema change holds every push into it, including create and delete', () => {
  for (const platform of ['joomla', 'wordpress']) {
    const data =
      platform === 'joomla'
        ? {
            entities: { content: { base: [1, 2], copy: [1, 3] } },
            kinds: {
              article: kind([article(1), article(2)], [article(1, { title: 'Tracy title' }), article(3)]),
              category: kind([category(2)], [category(2, { title: 'Unrelated' })])
            }
          }
        : {
            homes: HOMES,
            entities: { posts: { base: [10, 11], copy: [10, 12] } },
            kinds: {
              post: kind([post(10), post(11)], [post(10, { post_title: 'Tracy title' }), post(12)], ['ID'])
            }
          }
    const table = platform === 'joomla' ? 'jos_content' : 'wp_posts'
    const answer = changeset(platform, data, [{ kind: 'table', table, reason: 'schema-changed' }])
    const held = answer.items.filter((i) => i.kind === (platform === 'joomla' ? 'article' : 'post'))
    assert.deepEqual(new Set(held.map((i) => i.op)), new Set(['create', 'update', 'delete']))
    for (const item of held) assert.equal(item.conflict?.reason, 'changed-on-both', JSON.stringify(item))
    if (platform === 'joomla')
      assert.equal(answer.items.find((i) => i.kind === 'category').conflict, undefined)
  }
})

for (const edit of [
  { title: 'Contact us' },
  { position: '4' },
  { url: 'https://shop-com.tracy.ai/contact/' },
  { parent: '8' }
]) {
  test(`WordPress existing menu address is retained for ${Object.keys(edit)[0]} updates`, () => {
    const row = {
      ID: '20',
      title: 'Contact',
      position: '2',
      type: 'custom',
      object: 'custom',
      object_id: '0',
      url: 'https://shop.example/',
      parent: '0',
      menu: 'primary'
    }
    const copy = { ...row, ID: '21', ...edit }
    const result = changeset('wordpress', {
      homes: HOMES,
      entities: { posts: { base: [8, 20], copy: [8, 21] } },
      idMap: { posts: { 20: 21 } },
      kinds: { menuItem: kind([row], [copy], ['ID']) }
    })
    const item = result.items.find((i) => i.kind === 'menuItem')
    assert.equal(item.op, 'update')
    assert.equal(item.ident, 20)
    assert.equal(item.key, 'primary')
    assert.equal(item.seed[0].match.ID, 21)
    assert.deepEqual(
      item.write,
      Object.fromEntries(
        Object.entries(edit).map(([k, v]) => [
          k,
          k === 'url' ? v.replace('https://shop-com.tracy.ai', 'https://shop.example') : v
        ])
      )
    )
  })
}

function previewOf(answer) {
  const file = join(root, `preview-${++n}.json`)
  writeFileSync(file, JSON.stringify(answer))
  const r = spawnSync('python3', [PUSH, 'answer', '--changeset', file, '--preview-id', 'test-preview'], {
    encoding: 'utf8'
  })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  return JSON.parse(r.stdout.trim().split('\n').at(-1))
}

test('WordPress preview retains page types and translated metadata labels', () => {
  const answer = changeset('wordpress', {
    entities: { posts: { base: [10], copy: [10] } },
    kinds: {
      post: kind([post(10)], [post(10, { post_title: 'About us' })], ['ID']),
      postmeta: kind(
        [],
        [
          { post_id: '10', meta_key: '_thumbnail_id', value: '0', post_title: 'About us' },
          { post_id: '10', meta_key: '_wp_page_template', value: 'landing.php', post_title: 'About us' },
          { post_id: '10', meta_key: '_wp_attachment_image_alt', value: 'Team', post_title: 'About us' }
        ],
        ['post_id', 'meta_key']
      )
    }
  })
  const items = byId(previewOf(answer))
  assert.equal(items['post:10'].what, 'page')
  assert.deepEqual(
    [items['postmeta:10:_thumbnail_id'].label, items['postmeta:10:_thumbnail_id'].subject],
    ['featuredImage', 'About us']
  )
  assert.deepEqual(
    [items['postmeta:10:_wp_page_template'].label, items['postmeta:10:_wp_page_template'].subject],
    ['pageTemplate', 'About us']
  )
  assert.deepEqual(
    [items['postmeta:10:_wp_attachment_image_alt'].label, items['postmeta:10:_wp_attachment_image_alt'].subject],
    ['altText', 'About us']
  )
  assert.ok(!items['postmeta:10:_thumbnail_id'].title.includes('_thumbnail_id'))
})

test('WordPress metadata uses the record title without exposing unknown internal keys', () => {
  const answer = changeset('wordpress', {
    entities: { posts: { base: [10], copy: [10] } },
    kinds: {
      postmeta: kind(
        [],
        [{ post_id: '10', meta_key: '_plugin_internal_key', value: 'yes', post_title: 'About us' }],
        ['post_id', 'meta_key']
      )
    }
  })
  assert.equal(answer.items[0].title, 'About us')
})
